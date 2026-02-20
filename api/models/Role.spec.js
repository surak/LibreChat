const {
  SystemRoles,
  PermissionTypes,
} = require('librechat-data-provider');
const { getRoleByName, updateAccessPermissions } = require('~/models/Role');
const { initializeRoles } = require('~/models');

// Mock the cache
jest.mock('~/cache/getLogStores', () =>
  jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }),
);

describe('Role Operations', () => {
  it('should update permissions', async () => {
    await initializeRoles();
    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARE: true,
      },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARE).toBe(true);
  });

  it('should create default roles if they do not exist', async () => {
    await initializeRoles();
    const adminRole = await getRoleByName(SystemRoles.ADMIN);
    const userRole = await getRoleByName(SystemRoles.USER);

    expect(adminRole).toBeTruthy();
    expect(userRole).toBeTruthy();
  });
});
