import { createTokenMethods } from './token';
import { v4 as uuidv4 } from 'uuid';

describe('Token Methods - Detailed Tests', () => {
  let methods: ReturnType<typeof createTokenMethods>;

  beforeAll(async () => {
    methods = createTokenMethods();
  });

  beforeEach(async () => {
    // @ts-ignore
    methods._store?.clear();
  });

  describe('createToken', () => {
    test('should create a token with correct expiry time', async () => {
      const userId = uuidv4();
      const tokenData = {
        token: 'test-token-123',
        userId: userId,
        email: 'test@example.com',
        expiresIn: 3600, // 1 hour
      };

      const token = await methods.createToken(tokenData);

      expect(token).toBeDefined();
      expect(token.token).toBe(tokenData.token);
      expect(token.userId.toString()).toBe(userId.toString());
      expect(token.email).toBe(tokenData.email);

      const expectedExpiry = new Date(token.createdAt.getTime() + tokenData.expiresIn * 1000);
      expect(token.expiresAt.getTime()).toBeCloseTo(expectedExpiry.getTime(), -3);
    });
  });

  describe('findToken', () => {
    let user1Id: string;
    let user2Id: string;

    beforeEach(async () => {
      user1Id = uuidv4();
      user2Id = uuidv4();

      await methods.createToken({
        token: 'token-1',
        userId: user1Id,
        email: 'user1@example.com',
        expiresIn: 3600,
      });
      await methods.createToken({
        token: 'token-2',
        userId: user2Id,
        email: 'user2@example.com',
        identifier: 'oauth-123',
        expiresIn: 3600,
      });
    });

    test('should find token by token value', async () => {
      const found = await methods.findToken({ token: 'token-1' });
      expect(found).toBeDefined();
      expect(found?.token).toBe('token-1');
    });

    test('should find token by userId', async () => {
      const found = await methods.findToken({ userId: user2Id });
      expect(found).toBeDefined();
      expect(found?.token).toBe('token-2');
    });
  });

  describe('deleteTokens', () => {
    let user1Id: string;

    beforeEach(async () => {
      user1Id = uuidv4();
      await methods.createToken({
        token: 'verify-token-1',
        userId: user1Id,
        email: 'user1@example.com',
        expiresIn: 3600,
      });
    });

    test('should delete only tokens matching specific token value', async () => {
      const result = await methods.deleteTokens({ token: 'verify-token-1' });
      expect(result.deletedCount).toBe(1);

      const found = await methods.findToken({ token: 'verify-token-1' });
      expect(found).toBeNull();
    });
  });
});
