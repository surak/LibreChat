import type * as t from '~/types';
import { createUserMethods } from './user';
import { v4 as uuidv4 } from 'uuid';

/** Mocking crypto for generateToken */
jest.mock('~/crypto', () => ({
  signPayload: jest.fn().mockResolvedValue('mocked-token'),
}));

let methods: ReturnType<typeof createUserMethods>;

describe('User Methods - Database Tests', () => {
  beforeAll(async () => {
    methods = createUserMethods();
  });

  beforeEach(async () => {
    // @ts-ignore
    methods._store?.clear();
    // @ts-ignore
    methods._balanceStore?.clear();
  });

  describe('findUser', () => {
    test('should find user by exact email', async () => {
      await methods.createUser({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      const found = await methods.findUser({ email: 'test@example.com' });

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
    });

    test('should find user by email with different case (case-insensitive)', async () => {
      await methods.createUser({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      const foundUpper = await methods.findUser({ email: 'TEST@EXAMPLE.COM' });
      const foundMixed = await methods.findUser({ email: 'Test@Example.COM' });
      const foundLower = await methods.findUser({ email: 'test@example.com' });

      expect(foundUpper).toBeDefined();
      expect(foundMixed).toBeDefined();
      expect(foundLower).toBeDefined();
    });
  });

  describe('createUser', () => {
    test('should create a user', async () => {
      const result = await methods.createUser({
        name: 'New User',
        email: 'new@example.com',
        provider: 'local',
      });

      expect(result).toBeDefined();

      const user = await methods.getUserById(result.toString());
      expect(user).toBeDefined();
      expect(user?.name).toBe('New User');
      expect(user?.email).toBe('new@example.com');
    });
  });

  describe('updateUser', () => {
    test('should update user fields', async () => {
      const user = await methods.createUser({
        name: 'Original Name',
        email: 'test@example.com',
        provider: 'local',
      }, undefined, true, true) as t.IUser;

      const updated = await methods.updateUser(user._id?.toString() ?? '', {
        name: 'Updated Name',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.email).toBe('test@example.com');
    });
  });

  describe('deleteUserById', () => {
    test('should delete user by ID', async () => {
      const userId = await methods.createUser({
        name: 'To Delete',
        email: 'delete@example.com',
        provider: 'local',
      });

      const result = await methods.deleteUserById(userId.toString());

      expect(result.deletedCount).toBe(1);

      const found = await methods.getUserById(userId.toString());
      expect(found).toBeNull();
    });
  });
});
