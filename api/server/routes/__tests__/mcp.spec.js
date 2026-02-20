const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');
const { getBasePath } = require('@librechat/api');

function generateTestCsrfToken(flowId) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'test-secret')
    .update(flowId)
    .digest('hex')
    .slice(0, 32);
}

const mockRegistryInstance = {
  getServerConfig: jest.fn(),
  getOAuthServers: jest.fn(),
  getAllServerConfigs: jest.fn(),
  addServer: jest.fn(),
  updateServer: jest.fn(),
  removeServer: jest.fn(),
};

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return {
    ...actual,
    MCPOAuthHandler: {
      initiateOAuthFlow: jest.fn(),
      getFlowState: jest.fn(),
      completeOAuthFlow: jest.fn(),
      generateFlowId: jest.fn(),
    },
    MCPTokenStorage: {
      storeTokens: jest.fn(),
      getClientInfoAndMetadata: jest.fn(),
      getTokens: jest.fn(),
      deleteUserTokens: jest.fn(),
    },
    getUserMCPAuthMap: jest.fn(),
    generateCheckAccess: jest.fn(() => (req, res, next) => next()),
    MCPServersRegistry: {
      getInstance: () => mockRegistryInstance,
    },
    isMCPDomainNotAllowedError: (error) => error?.code === 'MCP_DOMAIN_NOT_ALLOWED',
    isMCPInspectionFailedError: (error) => error?.code === 'MCP_INSPECTION_FAILED',
    MCPErrorCodes: {
      DOMAIN_NOT_ALLOWED: 'MCP_DOMAIN_NOT_ALLOWED',
      INSPECTION_FAILED: 'MCP_INSPECTION_FAILED',
    },
  };
});

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  updateToken: jest.fn(),
  createToken: jest.fn(),
  deleteTokens: jest.fn(),
  findPluginAuthsByKeys: jest.fn(),
  getRoleByName: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  getMCPServerTools: jest.fn(),
  loadCustomConfig: jest.fn(),
}));

jest.mock('~/server/services/Config/mcp', () => ({
  updateMCPServerTools: jest.fn(),
}));

jest.mock('~/server/services/MCP', () => ({
  getMCPSetupData: jest.fn(),
  getServerConnectionStatus: jest.fn(),
}));

jest.mock('~/server/services/PluginService', () => ({
  getUserPluginAuthValue: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getOAuthReconnectionManager: jest.fn(),
  getMCPServersRegistry: jest.fn(() => mockRegistryInstance),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  canAccessMCPServerResource: () => (req, res, next) => next(),
}));

jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));

describe('MCP Routes', () => {
  let app;
  let mcpRouter;

  beforeAll(async () => {
    mcpRouter = require('../mcp');

    app = express();
    app.use(express.json());
    app.use(cookieParser());

    app.use((req, res, next) => {
      req.user = { id: 'test-user-id' };
      next();
    });

    app.use('/api/mcp', mcpRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:serverName/oauth/initiate', () => {
    const { MCPOAuthHandler } = require('@librechat/api');
    const { getLogStores } = require('~/cache');

    it('should initiate OAuth flow successfully', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          metadata: {
            serverUrl: 'https://test-server.com',
            oauth: { clientId: 'test-client-id' },
          },
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      mockRegistryInstance.getServerConfig.mockResolvedValue({});

      MCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://oauth.example.com/auth',
        flowId: 'test-user-id:test-server',
      });

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'test-user-id:test-server',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://oauth.example.com/auth');
    });

    it('should return 403 when userId does not match authenticated user', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'different-user-id',
        flowId: 'test-user-id:test-server',
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'User mismatch' });
    });
  });

  describe('GET /:serverName/oauth/callback', () => {
    const { MCPOAuthHandler, MCPTokenStorage } = require('@librechat/api');

    it('should redirect to error page when OAuth error is received', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        error: 'access_denied',
        state: 'test-user-id:test-server',
      });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/error?error=access_denied`);
    });

    it('should handle OAuth callback successfully', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const mockFlowState = {
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { toolFlowId: 'tool-flow-123' },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      };
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([]),
      };
      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/success?serverName=test-server`);
    });
  });

  describe('GET /servers', () => {
    it('should return all server configs for authenticated user', async () => {
      const mockServerConfigs = {
        'server-1': { endpoint: 'http://server1.com', name: 'Server 1' },
      };

      mockRegistryInstance.getAllServerConfigs.mockResolvedValue(mockServerConfigs);

      const response = await request(app).get('/api/mcp/servers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockServerConfigs);
    });
  });

  describe('POST /servers', () => {
    it('should create MCP server with valid SSE config', async () => {
      const validConfig = {
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Test SSE Server',
      };

      mockRegistryInstance.addServer.mockResolvedValue({
        serverName: 'test-sse-server',
        config: validConfig,
      });

      const response = await request(app).post('/api/mcp/servers').send({ config: validConfig });

      expect(response.status).toBe(201);
    });
  });

  describe('DELETE /servers/:serverName', () => {
    it('should delete server successfully', async () => {
      mockRegistryInstance.removeServer.mockResolvedValue(undefined);

      const response = await request(app).delete('/api/mcp/servers/test-server');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'MCP server deleted successfully' });
    });
  });
});
