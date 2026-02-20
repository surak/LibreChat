import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/types';
import { createUserGroupMethods } from './userGroup';
import { v4 as uuidv4 } from 'uuid';

let methods: ReturnType<typeof createUserGroupMethods>;

describe('User Group Methods Tests', () => {
  let testGroup: t.IGroup;
  let testUser: t.IUser;

  beforeAll(async () => {
    methods = createUserGroupMethods();
  });

  beforeEach(async () => {
    // @ts-ignore
    methods._store?.clear();
    // @ts-ignore
    methods._userStore?.clear();

    testUser = await methods.createUser({
      _id: uuidv4(),
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      provider: 'local',
    }) as t.IUser;

    testGroup = await methods.createGroup({
      name: 'Test Group',
      source: 'local',
      memberIds: [testUser._id.toString()],
    });
  });

  describe('Group Query Methods', () => {
    test('should find group by ID', async () => {
      const group = await methods.findGroupById(testGroup._id.toString());
      expect(group).toBeDefined();
      expect(group?._id.toString()).toBe(testGroup._id.toString());
      expect(group?.name).toBe(testGroup.name);
    });

    test('should find groups by name pattern', async () => {
      await methods.createGroup({ name: 'Test Group 2', source: 'local' });
      await methods.createGroup({ name: 'Admin Group', source: 'local' });

      const testGroups = await methods.findGroupsByNamePattern('Test');
      expect(testGroups).toHaveLength(2);
    });
  });

  describe('User-Group Relationship Methods', () => {
    test('should add user to group', async () => {
        const newUser = await methods.createUser({
            _id: uuidv4(),
            name: 'New User',
            email: 'new@example.com',
            provider: 'local',
        }) as t.IUser;

      const result = await methods.addUserToGroup(
        newUser._id.toString(),
        testGroup._id.toString(),
      );

      expect(result).toBeDefined();
      expect(result.group?.memberIds).toContain(newUser._id.toString());
    });
  });
});
