jest.mock('@microsoft/microsoft-graph-client');
jest.mock('~/strategies/openidStrategy');
jest.mock('~/cache/getLogStores');
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
  },
  createAxiosInstance: jest.fn(() => ({
    create: jest.fn(),
    defaults: {},
  })),
}));

jest.mock('~/server/services/Config', () => ({}));
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

const client = require('openid-client');
const { Client } = require('@microsoft/microsoft-graph-client');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const getLogStores = require('~/cache/getLogStores');
const GraphApiService = require('./GraphApiService');

describe('GraphApiService', () => {
  let mockGraphClient;
  let mockTokensCache;
  let mockOpenIdConfig;

  afterEach(() => {
    // Clean up environment variables
    delete process.env.OPENID_GRAPH_SCOPES;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Set up environment variable for People.Read scope
    process.env.OPENID_GRAPH_SCOPES = 'User.Read,People.Read,Group.Read.All';

    // Mock Graph client
    mockGraphClient = {
      api: jest.fn().mockReturnThis(),
      search: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      top: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
    };

    Client.init.mockReturnValue(mockGraphClient);

    // Mock tokens cache
    mockTokensCache = {
      get: jest.fn(),
      set: jest.fn(),
    };
    getLogStores.mockReturnValue(mockTokensCache);

    // Mock OpenID config
    mockOpenIdConfig = {
      client_id: 'test-client-id',
      issuer: 'https://test-issuer.com',
    };
    getOpenIdConfig.mockReturnValue(mockOpenIdConfig);

    // Mock openid-client (using the existing jest mock configuration)
    if (client.genericGrantRequest) {
      client.genericGrantRequest.mockResolvedValue({
        access_token: 'mocked-graph-token',
        expires_in: 3600,
      });
    }
  });

  describe('Dependency Contract Tests', () => {
    it('should fail if getOpenIdConfig interface changes', () => {
      const config = getOpenIdConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(config).toHaveProperty('client_id');
      expect(config).toHaveProperty('issuer');

      expect(typeof getOpenIdConfig).toBe('function');
    });

    it('should fail if Microsoft Graph Client interface changes', () => {
      expect(typeof Client.init).toBe('function');

      const client = Client.init({ authProvider: jest.fn() });
      expect(client).toHaveProperty('api');
      expect(typeof client.api).toBe('function');
    });
  });

  describe('createGraphClient', () => {
    it('should create graph client with exchanged token', async () => {
      const accessToken = 'test-access-token';
      const sub = 'test-user-id';

      const result = await GraphApiService.createGraphClient(accessToken, sub);

      expect(getOpenIdConfig).toHaveBeenCalled();
      expect(Client.init).toHaveBeenCalledWith({
        authProvider: expect.any(Function),
      });
      expect(result).toBe(mockGraphClient);
    });

    it('should handle token exchange errors gracefully', async () => {
      if (client.genericGrantRequest) {
        client.genericGrantRequest.mockRejectedValue(new Error('Token exchange failed'));
      }

      await expect(GraphApiService.createGraphClient('invalid-token', 'test-user')).rejects.toThrow(
        'Token exchange failed',
      );
    });
  });

  describe('exchangeTokenForGraphAccess', () => {
    it('should return cached token if available', async () => {
      const cachedToken = { access_token: 'cached-token' };
      mockTokensCache.get.mockResolvedValue(cachedToken);

      const result = await GraphApiService.exchangeTokenForGraphAccess(
        mockOpenIdConfig,
        'test-token',
        'test-user',
      );

      expect(result).toBe('cached-token');
      expect(mockTokensCache.get).toHaveBeenCalledWith('test-user:graph');
      if (client.genericGrantRequest) {
        expect(client.genericGrantRequest).not.toHaveBeenCalled();
      }
    });

    it('should exchange token and cache result', async () => {
      mockTokensCache.get.mockResolvedValue(null);

      const result = await GraphApiService.exchangeTokenForGraphAccess(
        mockOpenIdConfig,
        'test-token',
        'test-user',
      );

      if (client.genericGrantRequest) {
        expect(client.genericGrantRequest).toHaveBeenCalledWith(
          mockOpenIdConfig,
          'urn:ietf:params:oauth:grant-type:jwt-bearer',
          {
            scope:
              'https://graph.microsoft.com/User.Read https://graph.microsoft.com/People.Read https://graph.microsoft.com/Group.Read.All',
            assertion: 'test-token',
            requested_token_use: 'on_behalf_of',
          },
        );
      }

      expect(mockTokensCache.set).toHaveBeenCalledWith(
        'test-user:graph',
        { access_token: 'mocked-graph-token' },
        3600000,
      );

      expect(result).toBe('mocked-graph-token');
    });
  });

  describe('searchEntraIdPrincipals', () => {
    const mockUsersResponse = {
      value: [
        {
          id: 'dir-user-1',
          displayName: 'Jane Smith',
          userPrincipalName: 'jane@company.com',
          mail: 'jane@company.com',
        },
      ],
    };

    beforeEach(() => {
      jest.clearAllMocks();
      Client.init.mockReturnValue(mockGraphClient);

      if (client.genericGrantRequest) {
        client.genericGrantRequest.mockResolvedValue({
          access_token: 'mocked-graph-token',
          expires_in: 3600,
        });
      }

      mockTokensCache.get.mockResolvedValue(null);
      mockTokensCache.set.mockResolvedValue();
      getLogStores.mockReturnValue(mockTokensCache);
      getOpenIdConfig.mockReturnValue(mockOpenIdConfig);
    });

    it('should return empty results for short queries', async () => {
      const result = await GraphApiService.searchEntraIdPrincipals('token', 'user', 'a', 'all', 10);
      expect(result).toEqual([]);
    });

    it('should handle Graph API errors gracefully', async () => {
      mockGraphClient.get.mockRejectedValue(new Error('Graph API error'));

      const result = await GraphApiService.searchEntraIdPrincipals(
        'token',
        'user',
        'test',
        'all',
        10,
      );

      expect(result).toEqual([]);
    });
  });
});
