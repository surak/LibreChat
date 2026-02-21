const jwt = require('jsonwebtoken');
const { isEnabled } = require('@librechat/api');
const { logger, createMethods } = require('@librechat/data-schemas');
const { Strategy: AppleStrategy } = require('passport-apple');
const { createSocialUser, handleExistingUser } = require('./process');
const socialLogin = require('./socialLogin');
const { findUser } = require('~/models');

jest.mock('jsonwebtoken');
jest.mock('@librechat/data-schemas', () => {
  const actualModule = jest.requireActual('@librechat/data-schemas');
  return {
    ...actualModule,
    logger: {
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  };
});
jest.mock('./process', () => ({
  createSocialUser: jest.fn(),
  handleExistingUser: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn(),
}));
jest.mock('~/models', () => ({
  findUser: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({
    fileStrategy: 'local',
    balance: { enabled: false },
  }),
}));

describe('Apple Login Strategy', () => {
  let appleStrategyInstance;
  const OLD_ENV = process.env;
  let getProfileDetails;
  let methods;

  beforeAll(async () => {
    methods = createMethods();
  });

  afterAll(async () => {
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    process.env = { ...OLD_ENV };
    process.env.APPLE_CLIENT_ID = 'fake_client_id';
    process.env.APPLE_TEAM_ID = 'fake_team_id';
    process.env.APPLE_CALLBACK_URL = '/auth/apple/callback';
    process.env.DOMAIN_SERVER = 'https://example.com';
    process.env.APPLE_KEY_ID = 'fake_key_id';
    process.env.APPLE_PRIVATE_KEY_PATH = '/path/to/fake/private/key';
    process.env.ALLOW_SOCIAL_REGISTRATION = 'true';

    jest.clearAllMocks();
    methods.user._store.clear();

    getProfileDetails = ({ idToken, profile }) => {
      if (!idToken) {
        logger.error('idToken is missing');
        throw new Error('idToken is missing');
      }

      const decoded = jwt.decode(idToken);
      if (!decoded) {
        logger.error('Failed to decode idToken');
        throw new Error('idToken is invalid');
      }

      return {
        email: decoded.email,
        id: decoded.sub,
        avatarUrl: null,
        username: decoded.email ? decoded.email.split('@')[0].toLowerCase() : `user_${decoded.sub}`,
        name: decoded.name
          ? `${decoded.name.firstName} ${decoded.name.lastName}`
          : profile.displayName || null,
        emailVerified: true,
      };
    };

    isEnabled.mockImplementation((flag) => {
      return flag === 'true';
    });

    const appleLogin = socialLogin('apple', getProfileDetails);
    appleStrategyInstance = new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        callbackURL: `${process.env.DOMAIN_SERVER}${process.env.APPLE_CALLBACK_URL}`,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
        passReqToCallback: false,
      },
      appleLogin,
    );
  });

  const mockProfile = {
    displayName: 'John Doe',
  };

  describe('getProfileDetails', () => {
    it('should throw an error if idToken is missing', () => {
      expect(() => {
        getProfileDetails({ idToken: null, profile: mockProfile });
      }).toThrow('idToken is missing');
      expect(logger.error).toHaveBeenCalledWith('idToken is missing');
    });

    it('should extract user details correctly from idToken', () => {
      const fakeDecodedToken = {
        email: 'john.doe@example.com',
        sub: 'apple-sub-1234',
        name: {
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      jwt.decode.mockReturnValue(fakeDecodedToken);

      const profileDetails = getProfileDetails({
        idToken: 'fake_id_token',
        profile: mockProfile,
      });

      expect(profileDetails).toEqual({
        email: 'john.doe@example.com',
        id: 'apple-sub-1234',
        avatarUrl: null,
        username: 'john.doe',
        name: 'John Doe',
        emailVerified: true,
      });
    });
  });

  describe('Strategy verify callback', () => {
    const tokenset = {
      id_token: 'fake_id_token',
    };

    const decodedToken = {
      email: 'jane.doe@example.com',
      sub: 'apple-sub-9012',
      name: {
        firstName: 'Jane',
        lastName: 'Doe',
      },
    };

    const fakeAccessToken = 'fake_access_token';
    const fakeRefreshToken = 'fake_refresh_token';

    beforeEach(() => {
      jwt.decode.mockReturnValue(decodedToken);
      findUser.mockResolvedValue(null);
    });

    it('should create a new user if one does not exist and registration is allowed', async () => {
      findUser.mockResolvedValue(null);

      createSocialUser.mockImplementation(async (userData) => {
        return await methods.user.create(userData);
      });

      const mockVerifyCallback = jest.fn();

      await new Promise((resolve) => {
        appleStrategyInstance._verify(
          fakeAccessToken,
          fakeRefreshToken,
          tokenset.id_token,
          mockProfile,
          (err, user) => {
            mockVerifyCallback(err, user);
            resolve();
          },
        );
      });

      expect(mockVerifyCallback).toHaveBeenCalledWith(null, expect.any(Object));
      const user = mockVerifyCallback.mock.calls[0][1];
      expect(user.email).toBe('jane.doe@example.com');
      expect(user.username).toBe('jane.doe');
      expect(user.name).toBe('Jane Doe');
      expect(user.provider).toBe('apple');
    });

    it('should handle existing user and update avatarUrl', async () => {
      const existingUser = {
        email: 'jane.doe@example.com',
        username: 'jane.doe',
        name: 'Jane Doe',
        provider: 'apple',
        providerId: 'apple-sub-9012',
        avatarUrl: 'old_avatar.png',
      };

      findUser.mockResolvedValue(existingUser);

      handleExistingUser.mockImplementation(async (user, avatarUrl) => {
        user.avatarUrl = avatarUrl;
        return user;
      });

      const mockVerifyCallback = jest.fn();

      await new Promise((resolve) => {
        appleStrategyInstance._verify(
          fakeAccessToken,
          fakeRefreshToken,
          tokenset.id_token,
          mockProfile,
          (err, user) => {
            mockVerifyCallback(err, user);
            resolve();
          },
        );
      });

      expect(mockVerifyCallback).toHaveBeenCalledWith(null, existingUser);
      expect(existingUser.avatarUrl).toBeNull();
    });
  });
});
