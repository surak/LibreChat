const { RoleBits, createMethods } = require('@librechat/data-schemas');
const {
  ResourceType,
  AccessRoleIds,
  PrincipalType,
} = require('librechat-data-provider');
const {
  bulkUpdateResourcePermissions,
  getEffectivePermissions,
  findAccessibleResources,
  getAvailableRoles,
  grantPermission,
  checkPermission,
} = require('./PermissionService');
const { findRoleByIdentifier, getUserPrincipals, seedDefaultRoles } = require('~/models');
const { v4: uuidv4 } = require('uuid');

// Mock the getTransactionSupport function for testing
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTransactionSupport: jest.fn().mockResolvedValue(false),
}));

// Mock GraphApiService to prevent config loading issues
jest.mock('~/server/services/GraphApiService', () => ({
  getGroupMembers: jest.fn().mockResolvedValue([]),
}));

// Mock the logger
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

let methods;

beforeAll(async () => {
  methods = createMethods();
  await seedDefaultRoles();
});

beforeEach(async () => {
  methods.aclEntry._store.clear();
});

// Mock getUserPrincipals to avoid depending on the actual implementation
jest.mock('~/models', () => ({
  ...jest.requireActual('~/models'),
  getUserPrincipals: jest.fn(),
}));

describe('PermissionService', () => {
  // Common test data
  const userId = uuidv4();
  const groupId = uuidv4();
  const resourceId = uuidv4();
  const grantedById = uuidv4();
  const roleResourceId = uuidv4();

  describe('grantPermission', () => {
    test('should grant permission to a user with a role', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.USER);
      expect(entry.principalId.toString()).toBe(userId.toString());
      expect(entry.resourceType).toBe(ResourceType.AGENT);
      expect(entry.resourceId.toString()).toBe(resourceId.toString());

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
      expect(entry.grantedBy.toString()).toBe(grantedById.toString());
      expect(entry.grantedAt).toBeInstanceOf(Date);
    });

    test('should grant permission to a group with a role', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.GROUP);
      expect(entry.principalId.toString()).toBe(groupId.toString());

      const role = await findRoleByIdentifier(AccessRoleIds.AGENT_EDITOR);
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
    });

    test('should grant public permission with a role', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.PUBLIC);
      expect(entry.principalId).toBeNull();

      const role = await findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
    });

    test('should throw error for invalid principal type', async () => {
      await expect(
        grantPermission({
          principalType: 'invalid',
          principalId: userId,
          resourceType: ResourceType.AGENT,
          resourceId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Invalid principal type: invalid');
    });

    test('should throw error for missing principalId with user type', async () => {
      await expect(
        grantPermission({
          principalType: PrincipalType.USER,
          principalId: null,
          resourceType: ResourceType.AGENT,
          resourceId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Principal ID is required for user, group, and role principals');
    });

    test('should throw error for non-existent role', async () => {
      await expect(
        grantPermission({
          principalType: PrincipalType.USER,
          principalId: userId,
          resourceType: ResourceType.AGENT,
          resourceId,
          accessRoleId: 'non_existent_role',
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Role non_existent_role not found');
    });

    test('should update existing permission when granting to same principal and resource', async () => {
      // First grant with viewer role
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      // Then update to editor role
      const updated = await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      const editorRole = await findRoleByIdentifier(AccessRoleIds.AGENT_EDITOR);
      expect(updated.permBits).toBe(editorRole.permBits);
      expect(updated.roleId.toString()).toBe(editorRole._id.toString());

      // Verify there's only one entry
      const entries = await methods.aclEntry.find({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
      });
      expect(entries).toHaveLength(1);
    });
  });

  describe('checkPermission', () => {
    let otherResourceId;

    beforeEach(async () => {
      getUserPrincipals.mockReset();

      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      otherResourceId = uuidv4();
      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId: otherResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });
    });

    test('should check permission for user principal', async () => {
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      const hasViewPermission = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        requiredPermission: 1,
      });

      expect(hasViewPermission).toBe(true);

      const hasEditPermission = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        requiredPermission: 3,
      });

      expect(hasEditPermission).toBe(false);
    });

    test('should check permission for user and group principals', async () => {
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ]);

      const hasViewOnOriginal = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        requiredPermission: 1,
      });

      expect(hasViewOnOriginal).toBe(true);

      const hasViewOnOther = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: otherResourceId,
        requiredPermission: 1,
      });

      expect(hasViewOnOther).toBe(true);
    });
  });

  describe('getEffectivePermissions', () => {
    beforeEach(async () => {
      getUserPrincipals.mockReset();

      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });
    });

    test('should get effective permissions from multiple sources', async () => {
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ]);

      const effective = await getEffectivePermissions({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
      });

      expect(effective).toBe(RoleBits.EDITOR); // 3 = VIEW + EDIT
    });
  });

  describe('findAccessibleResources', () => {
    let resource1, resource2, resource3;

    beforeEach(async () => {
      getUserPrincipals.mockReset();

      resource1 = uuidv4();
      resource2 = uuidv4();
      resource3 = uuidv4();

      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId: resource1,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId: resource2,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId: resource3,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });
    });

    test('should find resources user can view', async () => {
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      const viewableResources = await findAccessibleResources({
        userId,
        resourceType: ResourceType.AGENT,
        requiredPermissions: 1,
      });

      expect(viewableResources).toHaveLength(2);
    });
  });

  describe('bulkUpdateResourcePermissions', () => {
    const otherUserId = uuidv4();

    beforeEach(async () => {
      await seedDefaultRoles();
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });
    });

    test('should grant new permissions in bulk', async () => {
      const newResourceId = uuidv4();
      const updatedPrincipals = [
        {
          type: PrincipalType.USER,
          id: userId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        },
        {
          type: PrincipalType.USER,
          id: otherUserId,
          accessRoleId: AccessRoleIds.AGENT_EDITOR,
        },
        {
          type: PrincipalType.GROUP,
          id: groupId,
          accessRoleId: AccessRoleIds.AGENT_OWNER,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId: newResourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(3);

      const aclEntries = await methods.aclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId: newResourceId,
      });
      expect(aclEntries).toHaveLength(3);
    });
  });
});
