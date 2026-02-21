const { nanoid } = require('nanoid');
const { v4: uuidv4 } = require('uuid');
const { FileSources } = require('librechat-data-provider');
const { createMethods } = require('@librechat/data-schemas');

// Only mock the dependencies that are not database-related
jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({
    web_search: true,
    execute_code: true,
    file_search: true,
  }),
}));

jest.mock('~/models/Project', () => ({
  getProjectByName: jest.fn().mockResolvedValue(null),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/services/Files/images/avatar', () => ({
  resizeAvatar: jest.fn(),
}));

jest.mock('~/server/services/Files/S3/crud', () => ({
  refreshS3Url: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  filterFile: jest.fn(),
}));

jest.mock('~/models/Action', () => ({
  updateAction: jest.fn(),
  getActions: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/models/File', () => ({
  deleteFileByFilter: jest.fn(),
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
  findPubliclyAccessibleResources: jest.fn().mockResolvedValue([]),
  grantPermission: jest.fn(),
  hasPublicPermission: jest.fn().mockResolvedValue(false),
  checkPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/models', () => ({
  getCategoriesWithCounts: jest.fn(),
}));

// Mock cache for S3 avatar refresh tests
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};
jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => mockCache),
}));

const {
  createAgent: createAgentHandler,
  updateAgent: updateAgentHandler,
  getListAgents: getListAgentsHandler,
} = require('./v1');

const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
} = require('~/server/services/PermissionService');

const { refreshS3Url } = require('~/server/services/Files/S3/crud');

let methods;
let Agent;

describe('Agent Controllers - Mass Assignment Protection', () => {
  let mockReq;
  let mockRes;

  beforeAll(async () => {
    methods = createMethods();
    Agent = methods.agent;
  });

  beforeEach(async () => {
    Agent._store.clear();

    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock request and response objects
    mockReq = {
      user: {
        id: uuidv4(),
        role: 'USER',
      },
      body: {},
      params: {},
      query: {},
      app: {
        locals: {
          fileStrategy: 'local',
        },
      },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('createAgentHandler', () => {
    test('should create agent with allowed fields only', async () => {
      const validData = {
        name: 'Test Agent',
        description: 'A test agent',
        instructions: 'Be helpful',
        provider: 'openai',
        model: 'gpt-4',
        tools: ['web_search'],
        model_parameters: { temperature: 0.7 },
        tool_resources: {
          file_search: { file_ids: ['file1', 'file2'] },
        },
      };

      mockReq.body = validData;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();

      const createdAgent = mockRes.json.mock.calls[0][0];
      expect(createdAgent.name).toBe('Test Agent');
      expect(createdAgent.description).toBe('A test agent');
      expect(createdAgent.provider).toBe('openai');
      expect(createdAgent.model).toBe('gpt-4');
      expect(createdAgent.author.toString()).toBe(mockReq.user.id);
      expect(createdAgent.tools).toContain('web_search');

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb).toBeDefined();
      expect(agentInDb.name).toBe('Test Agent');
      expect(agentInDb.author.toString()).toBe(mockReq.user.id);
    });

    test('should reject creation with unauthorized fields (mass assignment protection)', async () => {
      const maliciousData = {
        // Required fields
        provider: 'openai',
        model: 'gpt-4',
        name: 'Malicious Agent',

        // Unauthorized fields that should be stripped
        author: uuidv4(),
        authorName: 'Hacker',
        isCollaborative: true,
        versions: [],
        _id: uuidv4(),
        id: 'custom_agent_id',
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
      };

      mockReq.body = maliciousData;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);

      const createdAgent = mockRes.json.mock.calls[0][0];

      // Verify unauthorized fields were not set
      expect(createdAgent.author.toString()).toBe(mockReq.user.id);
      expect(createdAgent.authorName).toBeUndefined();
      expect(createdAgent.isCollaborative).toBeFalsy();
      expect(createdAgent.versions).toHaveLength(1);
      expect(createdAgent.id).not.toBe('custom_agent_id');
      expect(createdAgent.id).toMatch(/^agent_/);

      // Verify timestamps are recent
      const createdTime = new Date(createdAgent.createdAt).getTime();
      const now = Date.now();
      expect(now - createdTime).toBeLessThan(5000);

      // Verify in database
      const agentInDb = await Agent.findOne({ id: createdAgent.id });
      expect(agentInDb.author.toString()).toBe(mockReq.user.id);
      expect(agentInDb.authorName).toBeUndefined();
    });

    test('should validate required fields', async () => {
      const invalidData = {
        name: 'Missing Required Fields',
      };

      mockReq.body = invalidData;

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);

      // Verify nothing was created in database
      const agents = await Agent.find({});
      expect(agents.length).toBe(0);
    });
  });

  describe('updateAgentHandler', () => {
    let existingAgentId;
    let existingAgentAuthorId;

    beforeEach(async () => {
      // Create an existing agent for update tests
      existingAgentAuthorId = uuidv4();
      const agent = await Agent.create({
        id: `agent_${uuidv4()}`,
        name: 'Original Agent',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        author: existingAgentAuthorId,
        description: 'Original description',
        isCollaborative: false,
        versions: [
          {
            name: 'Original Agent',
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            description: 'Original description',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      existingAgentId = agent.id;
    });

    test('should update agent with allowed fields only', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Updated Agent',
        description: 'Updated description',
        model: 'gpt-4',
        isCollaborative: true,
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.status).not.toHaveBeenCalledWith(400);
      expect(mockRes.status).not.toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalled();

      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.name).toBe('Updated Agent');
      expect(updatedAgent.description).toBe('Updated description');
      expect(updatedAgent.model).toBe('gpt-4');
      expect(updatedAgent.isCollaborative).toBe(true);
      expect(updatedAgent.author).toBe(existingAgentAuthorId.toString());

      // Verify in database
      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.name).toBe('Updated Agent');
      expect(agentInDb.isCollaborative).toBe(true);
    });

    test('should reject update with unauthorized fields (mass assignment protection)', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Updated Name',

        // Unauthorized fields that should be stripped
        author: uuidv4(),
        authorName: 'Hacker',
        id: 'different_agent_id',
        _id: uuidv4(),
        versions: [],
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();

      const updatedAgent = mockRes.json.mock.calls[0][0];

      // Verify unauthorized fields were not changed
      expect(updatedAgent.author).toBe(existingAgentAuthorId.toString());
      expect(updatedAgent.authorName).toBeUndefined();
      expect(updatedAgent.id).toBe(existingAgentId);
      expect(updatedAgent.name).toBe('Updated Name');

      // Verify in database
      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.author.toString()).toBe(existingAgentAuthorId.toString());
      expect(agentInDb.id).toBe(existingAgentId);
    });
  });

  describe('getListAgentsHandler - Security Tests', () => {
    let userA, userB;
    let agentA1, agentA2, agentA3, agentB1;

    beforeEach(async () => {
      Agent._store.clear();
      jest.clearAllMocks();

      // Create two test users
      userA = uuidv4();
      userB = uuidv4();

      // Create agents for User A
      agentA1 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent A1',
        description: 'User A agent 1',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        versions: [
          {
            name: 'Agent A1',
            description: 'User A agent 1',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      agentA2 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent A2',
        description: 'User A agent 2',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        versions: [
          {
            name: 'Agent A2',
            description: 'User A agent 2',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      agentA3 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent A3',
        description: 'User A agent 3',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
        category: 'productivity',
        versions: [
          {
            name: 'Agent A3',
            description: 'User A agent 3',
            provider: 'openai',
            model: 'gpt-4',
            category: 'productivity',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Create an agent for User B
      agentB1 = await Agent.create({
        id: `agent_${nanoid(12)}`,
        name: 'Agent B1',
        description: 'User B agent 1',
        provider: 'openai',
        model: 'gpt-4',
        author: userB,
        versions: [
          {
            name: 'Agent B1',
            description: 'User B agent 1',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
    });

    test('should only return agents user has access to', async () => {
      // User B has access to one of User A's agents
      mockReq.user.id = userB.toString();
      findAccessibleResources.mockResolvedValue([agentA1._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe(agentA1.id);
      expect(response.data[0].name).toBe('Agent A1');
    });

    test('should apply category filter correctly with ACL', async () => {
      // User has access to all agents but filters by category
      mockReq.user.id = userB.toString();
      mockReq.query.category = 'productivity';
      findAccessibleResources.mockResolvedValue([agentA1._id, agentA2._id, agentA3._id]);
      findPubliclyAccessibleResources.mockResolvedValue([]);

      await getListAgentsHandler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe(agentA3.id);
      expect(response.data[0].category).toBe('productivity');
    });
  });
});
