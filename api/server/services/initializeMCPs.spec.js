/**
 * Tests for initializeMCPs.js
 */

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock config functions
const mockGetAppConfig = jest.fn();
const mockMergeAppTools = jest.fn();

jest.mock('./Config', () => ({
  get getAppConfig() {
    return mockGetAppConfig;
  },
  get mergeAppTools() {
    return mockMergeAppTools;
  },
}));

// Mock MCP singletons
const mockCreateMCPServersRegistry = jest.fn();
const mockCreateMCPManager = jest.fn();
const mockMCPManagerInstance = {
  getAppToolFunctions: jest.fn(),
};

jest.mock('~/config', () => ({
  get createMCPServersRegistry() {
    return mockCreateMCPServersRegistry;
  },
  get createMCPManager() {
    return mockCreateMCPManager;
  },
}));

const { logger } = require('@librechat/data-schemas');
const initializeMCPs = require('./initializeMCPs');

describe('initializeMCPs', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: successful initialization
    mockCreateMCPServersRegistry.mockReturnValue(undefined);
    mockCreateMCPManager.mockResolvedValue(mockMCPManagerInstance);
    mockMCPManagerInstance.getAppToolFunctions.mockResolvedValue({});
    mockMergeAppTools.mockResolvedValue(undefined);
  });

  describe('MCPServersRegistry initialization', () => {
    it('should ALWAYS initialize MCPServersRegistry even without configured servers', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null, // No configured servers
        mcpSettings: { allowedDomains: ['localhost'] },
      });

      await initializeMCPs();

      expect(mockCreateMCPServersRegistry).toHaveBeenCalledTimes(1);
      expect(mockCreateMCPServersRegistry).toHaveBeenCalledWith(
        null, // No longer passing mongoose
        ['localhost'],
      );
    });

    it('should pass allowedDomains from mcpSettings to registry', async () => {
      const allowedDomains = ['localhost', '*.example.com', 'trusted-mcp.com'];
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null,
        mcpSettings: { allowedDomains },
      });

      await initializeMCPs();

      expect(mockCreateMCPServersRegistry).toHaveBeenCalledWith(null, allowedDomains);
    });
  });

  describe('MCPManager initialization', () => {
    it('should ALWAYS initialize MCPManager even without configured servers', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null, // No configured servers
      });

      await initializeMCPs();

      expect(mockCreateMCPManager).toHaveBeenCalledTimes(1);
      expect(mockCreateMCPManager).toHaveBeenCalledWith({});
    });
  });
});
