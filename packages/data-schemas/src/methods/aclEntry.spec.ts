import {
  ResourceType,
  PrincipalType,
  PermissionBits,
} from 'librechat-data-provider';
import { createAclEntryMethods } from './aclEntry';
import { v4 as uuidv4 } from 'uuid';

let methods: ReturnType<typeof createAclEntryMethods>;

beforeAll(async () => {
  methods = createAclEntryMethods();
});

beforeEach(async () => {
  // @ts-ignore - access to internal store for testing
  methods._store?.clear();
});

describe('AclEntry Model Tests', () => {
  const userId = uuidv4();
  const groupId = uuidv4();
  const resourceId = uuidv4();
  const grantedById = uuidv4();

  describe('Permission Grant and Query', () => {
    test('should grant permission to a user', async () => {
      const entry = await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.USER);
      expect(entry?.principalId?.toString()).toBe(userId.toString());
      expect(entry?.resourceType).toBe(ResourceType.AGENT);
      expect(entry?.resourceId.toString()).toBe(resourceId.toString());
      expect(entry?.permBits).toBe(PermissionBits.VIEW);
      expect(entry?.grantedBy?.toString()).toBe(grantedById.toString());
      expect(entry?.grantedAt).toBeInstanceOf(Date);
    });

    test('should grant permission to a group', async () => {
      const entry = await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.GROUP);
      expect(entry?.principalId?.toString()).toBe(groupId.toString());
      expect(entry?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });

    test('should find entries by principal', async () => {
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        'project',
        uuidv4(),
        PermissionBits.EDIT,
        grantedById,
      );

      const entries = await methods.findEntriesByPrincipal(PrincipalType.USER, userId);
      expect(entries).toHaveLength(2);

      const agentEntries = await methods.findEntriesByPrincipal(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
      );
      expect(agentEntries).toHaveLength(1);
      expect(agentEntries[0].resourceType).toBe(ResourceType.AGENT);
    });

    test('should find entries by resource', async () => {
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.PUBLIC,
        null,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const entries = await methods.findEntriesByResource(ResourceType.AGENT, resourceId);
      expect(entries).toHaveLength(3);
    });
  });

  describe('Permission Checks', () => {
    beforeEach(async () => {
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        grantedById,
      );
    });

    test('should check if user has permission', async () => {
      const principalsList = [{ principalType: PrincipalType.USER, principalId: userId }];

      const hasViewPermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasViewPermission).toBe(true);

      const hasEditPermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
      );
      expect(hasEditPermission).toBe(false);
    });

    test('should get effective permissions', async () => {
      const principalsList = [
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ];

      const effective = await methods.getEffectivePermissions(
        principalsList,
        ResourceType.AGENT,
        resourceId,
      );

      expect(effective).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });
  });

  describe('Permission Modification', () => {
    test('should revoke permission', async () => {
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const result = await methods.revokePermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
      );
      expect(result.deletedCount).toBe(1);

      const entriesAfter = await methods.findEntriesByPrincipal(PrincipalType.USER, userId);
      expect(entriesAfter).toHaveLength(0);
    });

    test('should modify permission bits - add permissions', async () => {
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        0,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });
  });
});
