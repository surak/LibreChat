const { ResourceType, PrincipalType } = require('librechat-data-provider');
const { fileAccess } = require('./fileAccess');
const { createMethods } = require('@librechat/data-schemas');
const { createAgent } = require('~/models/Agent');
const { createFile } = require('~/models');
const { v4: uuidv4 } = require('uuid');

describe('fileAccess middleware', () => {
  let req, res, next;
  let testUser, otherUser, thirdUser;
  let methods;

  beforeAll(async () => {
    methods = createMethods();
  });

  beforeEach(async () => {
    methods.role._store.clear();
    methods.user._store.clear();
    methods.agent._store.clear();
    methods.aclEntry._store.clear();
    methods.file._store.clear();

    // Create test role
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

    // Create test users
    testUser = await methods.user.create({
      _id: uuidv4(),
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
      role: 'test-role',
    });

    otherUser = await methods.user.create({
      _id: uuidv4(),
      email: 'other@example.com',
      name: 'Other User',
      username: 'otheruser',
      role: 'test-role',
    });

    thirdUser = await methods.user.create({
      _id: uuidv4(),
      email: 'third@example.com',
      name: 'Third User',
      username: 'thirduser',
      role: 'test-role',
    });

    // Setup request/response objects
    req = {
      user: { id: testUser._id.toString(), role: testUser.role },
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();

    jest.clearAllMocks();
  });

  describe('basic file access', () => {
    test('should allow access when user owns the file', async () => {
      // Create a file owned by testUser
      await createFile({
        user: testUser._id.toString(),
        file_id: 'file_owned_by_user',
        filepath: '/test/file.txt',
        filename: 'file.txt',
        type: 'text/plain',
        size: 100,
      });

      req.params.file_id = 'file_owned_by_user';
      await fileAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
      expect(req.fileAccess.file).toBeDefined();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should deny access when user does not own the file and no agent access', async () => {
      // Create a file owned by otherUser
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'file_owned_by_other',
        filepath: '/test/file.txt',
        filename: 'file.txt',
        type: 'text/plain',
        size: 100,
      });

      req.params.file_id = 'file_owned_by_other';
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should return 404 when file does not exist', async () => {
      req.params.file_id = 'non_existent_file';
      await fileAccess(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('agent-based file access', () => {
    beforeEach(async () => {
      // Create a file owned by otherUser (not testUser)
      await createFile({
        user: otherUser._id.toString(),
        file_id: 'shared_file_via_agent',
        filepath: '/test/shared.txt',
        filename: 'shared.txt',
        type: 'text/plain',
        size: 100,
      });
    });

    test('should allow access when user is author of agent with file', async () => {
      // Create agent owned by testUser with the file
      await createAgent({
        id: `agent_${Date.now()}`,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: testUser._id,
        tool_resources: {
          file_search: {
            file_ids: ['shared_file_via_agent'],
          },
        },
      });

      req.params.file_id = 'shared_file_via_agent';
      await fileAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
      expect(req.fileAccess.file).toBeDefined();
    });

    test('should allow access when user has VIEW permission on agent with file', async () => {
      // Create agent owned by otherUser
      const agent = await createAgent({
        id: `agent_${Date.now()}`,
        name: 'Shared Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: otherUser._id,
        tool_resources: {
          execute_code: {
            file_ids: ['shared_file_via_agent'],
          },
        },
      });

      // Grant VIEW permission to testUser
      await methods.aclEntry.create({
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: 1, // VIEW permission
        grantedBy: otherUser._id,
      });

      req.params.file_id = 'shared_file_via_agent';
      await fileAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.fileAccess).toBeDefined();
    });
  });
});
