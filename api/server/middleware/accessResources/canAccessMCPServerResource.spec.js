const { ResourceType, PrincipalType } = require('librechat-data-provider');
const { canAccessMCPServerResource } = require('./canAccessMCPServerResource');
const { createMethods } = require('@librechat/data-schemas');
const { createMCPServer } = require('~/models');
const { v4: uuidv4 } = require('uuid');

describe('canAccessMCPServerResource middleware', () => {
  let req, res, next;
  let testUser;
  let methods;

  beforeAll(async () => {
    methods = createMethods();
  });

  beforeEach(async () => {
    methods.role._store.clear();
    methods.user._store.clear();
    methods.mcpServer._store.clear();
    methods.aclEntry._store.clear();

    await methods.role.create({
      name: 'test-role',
      permissions: {
        MCP_SERVERS: {
          USE: true,
          CREATE: true,
          SHARE: true,
        },
      },
    });

    // Create a test user
    testUser = await methods.user.create({
      _id: uuidv4(),
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
      role: 'test-role',
    });

    req = {
      user: { id: testUser._id, role: testUser.role },
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();

    jest.clearAllMocks();
  });

  describe('middleware factory', () => {
    test('should throw error if requiredPermission is not provided', () => {
      expect(() => canAccessMCPServerResource({})).toThrow(
        'canAccessMCPServerResource: requiredPermission is required and must be a number',
      );
    });

    test('should create middleware with default resourceIdParam (serverName)', () => {
      const middleware = canAccessMCPServerResource({ requiredPermission: 1 });
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3);
    });
  });

  describe('permission checking with real MCP servers', () => {
    test('should allow access when user is the MCP server author', async () => {
      const mcpServer = await createMCPServer({
        config: {
          type: 'sse',
          url: 'https://example.com/mcp',
          title: 'Test MCP Server',
        },
        author: testUser._id,
      });

      await methods.aclEntry.create({
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        resourceType: ResourceType.MCPSERVER,
        resourceId: mcpServer._id,
        permBits: 15,
        grantedBy: testUser._id,
      });

      req.params.serverName = mcpServer.serverName;

      const middleware = canAccessMCPServerResource({ requiredPermission: 1 }); // VIEW permission
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should deny access when user is not the author and has no ACL entry', async () => {
      const otherUser = await methods.user.create({
        _id: uuidv4(),
        email: 'other@example.com',
        name: 'Other User',
        username: 'otheruser',
        role: 'test-role',
      });

      const mcpServer = await createMCPServer({
        config: {
          type: 'sse',
          url: 'https://example.com/mcp',
          title: 'Other User MCP Server',
        },
        author: otherUser._id,
      });

      await methods.aclEntry.create({
        principalType: PrincipalType.USER,
        principalId: otherUser._id,
        resourceType: ResourceType.MCPSERVER,
        resourceId: mcpServer._id,
        permBits: 15,
        grantedBy: otherUser._id,
      });

      req.params.serverName = mcpServer.serverName;

      const middleware = canAccessMCPServerResource({ requiredPermission: 1 }); // VIEW permission
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should allow access when user has ACL entry with sufficient permissions', async () => {
      const otherUser = await methods.user.create({
        _id: uuidv4(),
        email: 'other2@example.com',
        name: 'Other User 2',
        username: 'otheruser2',
        role: 'test-role',
      });

      const mcpServer = await createMCPServer({
        config: {
          type: 'sse',
          url: 'https://example.com/mcp',
          title: 'Shared MCP Server',
        },
        author: otherUser._id,
      });

      await methods.aclEntry.create({
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        resourceType: ResourceType.MCPSERVER,
        resourceId: mcpServer._id,
        permBits: 1,
        grantedBy: otherUser._id,
      });

      req.params.serverName = mcpServer.serverName;

      const middleware = canAccessMCPServerResource({ requiredPermission: 1 });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle non-existent MCP server', async () => {
      req.params.serverName = 'non-existent-mcp-server';

      const middleware = canAccessMCPServerResource({ requiredPermission: 1 });
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('permission levels', () => {
    let mcpServer;

    beforeEach(async () => {
      mcpServer = await createMCPServer({
        config: {
          type: 'sse',
          url: 'https://example.com/mcp',
          title: 'Permission Test MCP Server',
        },
        author: testUser._id,
      });

      await methods.aclEntry.create({
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        resourceType: ResourceType.MCPSERVER,
        resourceId: mcpServer._id,
        permBits: 15,
        grantedBy: testUser._id,
      });

      req.params.serverName = mcpServer.serverName;
    });

    test('should support view permission (1)', async () => {
      const middleware = canAccessMCPServerResource({ requiredPermission: 1 });
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should support edit permission (2)', async () => {
      const middleware = canAccessMCPServerResource({ requiredPermission: 2 });
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('authentication and authorization edge cases', () => {
    test('should return 401 when user is not authenticated', async () => {
      req.user = null;
      req.params.serverName = 'some-server';

      const middleware = canAccessMCPServerResource({ requiredPermission: 1 });
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('should allow admin users to bypass permission checks', async () => {
      const { SystemRoles } = require('librechat-data-provider');

      const otherUser = await methods.user.create({
        _id: uuidv4(),
        email: 'owner@example.com',
        name: 'Owner User',
        username: 'owneruser',
        role: 'test-role',
      });

      const mcpServer = await createMCPServer({
        config: {
          type: 'sse',
          url: 'https://example.com/mcp',
          title: 'Admin Test MCP Server',
        },
        author: otherUser._id,
      });

      req.user = { id: testUser._id, role: SystemRoles.ADMIN };
      req.params.serverName = mcpServer.serverName;

      const middleware = canAccessMCPServerResource({ requiredPermission: 4 }); // DELETE permission
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
