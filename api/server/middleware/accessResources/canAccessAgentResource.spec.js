const { ResourceType, PrincipalType } = require('librechat-data-provider');
const { canAccessAgentResource } = require('./canAccessAgentResource');
const { createMethods } = require('@librechat/data-schemas');
const { createAgent } = require('~/models/Agent');
const { v4: uuidv4 } = require('uuid');

describe('canAccessAgentResource middleware', () => {
  let req, res, next;
  let testUser;
  let methods;

  beforeAll(async () => {
    methods = createMethods();
  });

  beforeEach(async () => {
    methods.role._store.clear();
    methods.user._store.clear();
    methods.agent._store.clear();
    methods.aclEntry._store.clear();

    await methods.role.create({
      name: 'test-role',
      permissions: {
        AGENTS: {
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
      expect(() => canAccessAgentResource({})).toThrow(
        'canAccessAgentResource: requiredPermission is required and must be a number',
      );
    });

    test('should create middleware with default resourceIdParam', () => {
      const middleware = canAccessAgentResource({ requiredPermission: 1 });
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3);
    });
  });

  describe('permission checking with real agents', () => {
    test('should allow access when user is the agent author', async () => {
      const agent = await createAgent({
        id: `agent_${Date.now()}`,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: testUser._id,
      });

      await methods.aclEntry.create({
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: 15,
        grantedBy: testUser._id,
      });

      req.params.id = agent.id;

      const middleware = canAccessAgentResource({ requiredPermission: 1 }); // VIEW permission
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

      const agent = await createAgent({
        id: `agent_${Date.now()}`,
        name: 'Other User Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: otherUser._id,
      });

      await methods.aclEntry.create({
        principalType: PrincipalType.USER,
        principalId: otherUser._id,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: 15,
        grantedBy: otherUser._id,
      });

      req.params.id = agent.id;

      const middleware = canAccessAgentResource({ requiredPermission: 1 }); // VIEW permission
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
