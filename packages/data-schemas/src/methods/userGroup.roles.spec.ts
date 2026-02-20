import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/types';
import { createUserGroupMethods } from './userGroup';
import { v4 as uuidv4 } from 'uuid';

describe('Role-based Permissions Integration', () => {
  let methods: ReturnType<typeof createUserGroupMethods>;

  beforeAll(async () => {
    methods = createUserGroupMethods();
  });

  beforeEach(async () => {
    // @ts-ignore
    methods._store?.clear();
    // @ts-ignore
    methods._userStore?.clear();
    // @ts-ignore
    methods._roleStore?.clear();
  });

  describe('getUserPrincipals with roles', () => {
    test('should include role principal for user with role', async () => {
      const adminUser = await methods.createUser({
        _id: uuidv4(),
        name: 'Admin User',
        email: 'admin@test.com',
        provider: 'local',
        role: 'admin',
      }) as t.IUser;

      const principals = await methods.getUserPrincipals({
        userId: adminUser._id,
      });

      expect(principals).toHaveLength(3);

      const rolePrincipal = principals.find((p) => p.principalType === PrincipalType.ROLE);
      expect(rolePrincipal).toBeDefined();
      expect(rolePrincipal?.principalId).toBe('admin');
    });

    test('should not include role principal for user without role', async () => {
      const regularUser = await methods.createUser({
        _id: uuidv4(),
        name: 'Regular User',
        email: 'user@test.com',
        provider: 'local',
        role: null as any,
      }) as t.IUser;

      const principals = await methods.getUserPrincipals({
        userId: regularUser._id,
      });

      expect(principals).toHaveLength(2);
      const rolePrincipal = principals.find((p) => p.principalType === PrincipalType.ROLE);
      expect(rolePrincipal).toBeUndefined();
    });
  });
});
