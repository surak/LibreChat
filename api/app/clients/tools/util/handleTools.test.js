const mockPluginService = {
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: jest.fn(),
  getUserPluginAuthValue: jest.fn(),
};

jest.mock('~/server/services/PluginService', () => mockPluginService);

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({
    paths: { uploads: '/tmp' },
    fileStrategy: 'local',
    filteredTools: [],
    includedTools: [],
  }),
  getCachedTools: jest.fn().mockResolvedValue({
    dalle: {
      type: 'function',
      function: {
        name: 'dalle',
        description: 'DALL-E image generation',
        parameters: {},
      },
    },
  }),
}));

const { Calculator } = require('@librechat/agents');
const { createMethods } = require('@librechat/data-schemas');
const PluginService = require('~/server/services/PluginService');
const { validateTools, loadTools, loadToolWithAuth } = require('./handleTools');
const { StructuredSD, availableTools, DALLE3 } = require('../');
const { v4: uuidv4 } = require('uuid');

describe('Tool Handlers', () => {
  let fakeUser;
  const pluginKey = 'dalle';
  const pluginKey2 = 'wolfram';
  const ToolClass = DALLE3;
  const initialTools = [pluginKey, pluginKey2];
  const mockCredential = 'mock-credential';
  const mainPlugin = availableTools.find((tool) => tool.pluginKey === pluginKey);
  const authConfigs = mainPlugin.authConfig;
  let methods;

  beforeAll(async () => {
    methods = createMethods();

    const userAuthValues = {};
    mockPluginService.getUserPluginAuthValue.mockImplementation((userId, authField) => {
      return userAuthValues[`${userId}-${authField}`];
    });
    mockPluginService.updateUserPluginAuth.mockImplementation(
      (userId, authField, _pluginKey, credential) => {
        const fields = authField.split('||');
        fields.forEach((field) => {
          userAuthValues[`${userId}-${field}`] = credential;
        });
      },
    );

    fakeUser = await methods.user.create({
      _id: uuidv4(),
      name: 'Fake User',
      username: 'fakeuser',
      email: 'fakeuser@example.com',
      emailVerified: false,
      password: 'fakepassword123',
      avatar: '',
      provider: 'local',
      role: 'USER',
      googleId: null,
      plugins: [],
      refreshToken: [],
    });

    for (const authConfig of authConfigs) {
      await PluginService.updateUserPluginAuth(
        fakeUser._id,
        authConfig.authField,
        pluginKey,
        mockCredential,
      );
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const userAuthValues = {};
    mockPluginService.getUserPluginAuthValue.mockImplementation((userId, authField) => {
      return userAuthValues[`${userId}-${authField}`];
    });
    mockPluginService.updateUserPluginAuth.mockImplementation(
      (userId, authField, _pluginKey, credential) => {
        const fields = authField.split('||');
        fields.forEach((field) => {
          userAuthValues[`${userId}-${field}`] = credential;
        });
      },
    );

    for (const authConfig of authConfigs) {
      await PluginService.updateUserPluginAuth(
        fakeUser._id,
        authConfig.authField,
        pluginKey,
        mockCredential,
      );
    }
  });

  describe('validateTools', () => {
    it('returns valid tools given input tools and user authentication', async () => {
      const validTools = await validateTools(fakeUser._id, initialTools);
      expect(validTools).toBeDefined();
      expect(validTools.some((tool) => tool === pluginKey)).toBeTruthy();
      expect(validTools.length).toBeGreaterThan(0);
    });

    it('removes tools without valid credentials from the validTools array', async () => {
      const validTools = await validateTools(fakeUser._id, initialTools);
      expect(validTools.some((tool) => tool.pluginKey === pluginKey2)).toBeFalsy();
    });
  });

  describe('loadTools', () => {
    let toolFunctions;
    let loadTool1;
    let loadTool2;
    let loadTool3;
    const sampleTools = [...initialTools, 'calculator'];
    let ToolClass2 = Calculator;
    let remainingTools = availableTools.filter(
      (tool) => sampleTools.indexOf(tool.pluginKey) === -1,
    );

    beforeAll(async () => {
      const toolMap = await loadTools({
        user: fakeUser._id,
        tools: sampleTools,
        returnMap: true,
        useSpecs: true,
      });
      toolFunctions = toolMap;
      loadTool1 = toolFunctions[sampleTools[0]];
      loadTool2 = toolFunctions[sampleTools[1]];
      loadTool3 = toolFunctions[sampleTools[2]];
    });

    it('returns the expected load functions for requested tools', async () => {
      expect(loadTool1).toBeDefined();
      expect(loadTool2).toBeDefined();
      expect(loadTool3).toBeDefined();

      for (const tool of remainingTools) {
        expect(toolFunctions[tool.pluginKey]).toBeUndefined();
      }
    });

    it('should initialize an authenticated tool or one without authentication', async () => {
      const authTool = await loadTool1();
      const tool = await loadTool3();
      expect(authTool).toBeInstanceOf(ToolClass);
      expect(tool).toBeInstanceOf(ToolClass2);
    });
  });
});
