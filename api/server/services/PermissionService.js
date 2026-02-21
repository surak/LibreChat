const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { ResourceType, PrincipalType, PrincipalModel } = require('librechat-data-provider');
const {
  entraIdPrincipalFeatureEnabled,
  getUserOwnedEntraGroups,
  getUserEntraGroups,
  getGroupMembers,
  getGroupOwners,
} = require('~/server/services/GraphApiService');
const {
  findAccessibleResources: findAccessibleResourcesACL,
  getEffectivePermissions: getEffectivePermissionsACL,
  getEffectivePermissionsForResources: getEffectivePermissionsForResourcesACL,
  grantPermission: grantPermissionACL,
  findEntriesByPrincipalsAndResource,
  findGroupByExternalId,
  findRoleByIdentifier,
  getUserPrincipals,
  hasPermission,
  createGroup,
  createUser,
  updateUser,
  findUser,
  aclEntry: AclEntry,
  accessRole: AccessRole,
  userGroup: Group,
} = require('~/models');

/**
 * Validates that the resourceType is one of the supported enum values
 * @param {string} resourceType - The resource type to validate
 * @throws {Error} If resourceType is not valid
 */
const validateResourceType = (resourceType) => {
  const validTypes = Object.values(ResourceType);
  if (!validTypes.includes(resourceType)) {
    throw new Error(`Invalid resourceType: ${resourceType}. Valid types: ${validTypes.join(', ')}`);
  }
};

/**
 * Grant a permission to a principal for a resource using a role
 * @param {Object} params - Parameters for granting role-based permission
 * @param {string} params.principalType - PrincipalType.USER, PrincipalType.GROUP, or PrincipalType.PUBLIC
 * @param {string|null} params.principalId - The ID of the principal (null for PrincipalType.PUBLIC)
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {string} params.resourceId - The ID of the resource
 * @param {string} params.accessRoleId - The ID of the role (e.g., AccessRoleIds.AGENT_VIEWER, AccessRoleIds.AGENT_EDITOR)
 * @param {string} params.grantedBy - User ID granting the permission
 * @returns {Promise<Object>} The created or updated ACL entry
 */
const grantPermission = async ({
  principalType,
  principalId,
  resourceType,
  resourceId,
  accessRoleId,
  grantedBy,
}) => {
  try {
    if (!Object.values(PrincipalType).includes(principalType)) {
      throw new Error(`Invalid principal type: ${principalType}`);
    }

    if (principalType !== PrincipalType.PUBLIC && !principalId) {
      throw new Error('Principal ID is required for user, group, and role principals');
    }

    // Validate principalId based on type
    if (principalId && principalType === PrincipalType.ROLE) {
      // Role IDs are strings (role names)
      if (typeof principalId !== 'string' || principalId.trim().length === 0) {
        throw new Error(`Invalid role ID: ${principalId}`);
      }
    }

    if (!resourceId) {
      throw new Error(`Invalid resource ID: ${resourceId}`);
    }

    validateResourceType(resourceType);

    // Get the role to determine permission bits
    const role = await findRoleByIdentifier(accessRoleId);
    if (!role) {
      throw new Error(`Role ${accessRoleId} not found`);
    }

    // Ensure the role is for the correct resource type
    if (role.resourceType !== resourceType) {
      throw new Error(
        `Role ${accessRoleId} is for ${role.resourceType} resources, not ${resourceType}`,
      );
    }
    return await grantPermissionACL(
      principalType,
      principalId,
      resourceType,
      resourceId,
      role.permBits,
      grantedBy,
      null, // session
      role._id,
    );
  } catch (error) {
    logger.error(`[PermissionService.grantPermission] Error: ${error.message}`);
    throw error;
  }
};

/**
 * Check if a user has specific permission bits on a resource
 */
const checkPermission = async ({ userId, role, resourceType, resourceId, requiredPermission }) => {
  try {
    if (typeof requiredPermission !== 'number' || requiredPermission < 1) {
      throw new Error('requiredPermission must be a positive number');
    }

    validateResourceType(resourceType);

    const principals = await getUserPrincipals({ userId, role });

    if (principals.length === 0) {
      return false;
    }

    return await hasPermission(principals, resourceType, resourceId, requiredPermission);
  } catch (error) {
    logger.error(`[PermissionService.checkPermission] Error: ${error.message}`);
    if (error.message.includes('requiredPermission must be')) {
      throw error;
    }
    return false;
  }
};

/**
 * Get effective permission bitmask for a user on a resource
 */
const getEffectivePermissions = async ({ userId, role, resourceType, resourceId }) => {
  try {
    validateResourceType(resourceType);

    const principals = await getUserPrincipals({ userId, role });

    if (principals.length === 0) {
      return 0;
    }

    return await getEffectivePermissionsACL(principals, resourceType, resourceId);
  } catch (error) {
    logger.error(`[PermissionService.getEffectivePermissions] Error: ${error.message}`);
    return 0;
  }
};

/**
 * Get effective permissions for multiple resources in a batch operation
 */
const getResourcePermissionsMap = async ({ userId, role, resourceType, resourceIds }) => {
  validateResourceType(resourceType);

  if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
    return new Map();
  }

  try {
    const principals = await getUserPrincipals({ userId, role });

    const permissionsMap = await getEffectivePermissionsForResourcesACL(
      principals,
      resourceType,
      resourceIds,
    );

    return permissionsMap;
  } catch (error) {
    logger.error(`[PermissionService.getResourcePermissionsMap] Error: ${error.message}`, error);
    throw error;
  }
};

/**
 * Find all resources of a specific type that a user has access to with specific permission bits
 */
const findAccessibleResources = async ({ userId, role, resourceType, requiredPermissions }) => {
  try {
    if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
      throw new Error('requiredPermissions must be a positive number');
    }

    validateResourceType(resourceType);

    const principalsList = await getUserPrincipals({ userId, role });

    if (principalsList.length === 0) {
      return [];
    }
    return await findAccessibleResourcesACL(principalsList, resourceType, requiredPermissions);
  } catch (error) {
    logger.error(`[PermissionService.findAccessibleResources] Error: ${error.message}`);
    if (error.message.includes('requiredPermissions must be')) {
      throw error;
    }
    return [];
  }
};

/**
 * Find all publicly accessible resources of a specific type
 */
const findPubliclyAccessibleResources = async ({ resourceType, requiredPermissions }) => {
  try {
    if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
      throw new Error('requiredPermissions must be a positive number');
    }

    validateResourceType(resourceType);

    const entries = await AclEntry.find({
      principalType: PrincipalType.PUBLIC,
      resourceType,
      permBits: requiredPermissions, // simplification for stateless
    });

    return Array.from(new Set(entries.map(e => e.resourceId)));
  } catch (error) {
    logger.error(`[PermissionService.findPubliclyAccessibleResources] Error: ${error.message}`);
    if (error.message.includes('requiredPermissions must be')) {
      throw error;
    }
    return [];
  }
};

/**
 * Get available roles for a resource type
 */
const getAvailableRoles = async ({ resourceType }) => {
  validateResourceType(resourceType);
  return await AccessRole.find({ resourceType });
};

/**
 * Ensures a principal exists in the database
 */
const ensurePrincipalExists = async function (principal) {
  if (principal.type === PrincipalType.PUBLIC) {
    return null;
  }

  if (principal.id) {
    return principal.id;
  }

  if (principal.type === PrincipalType.USER && principal.source === 'entra') {
    if (!principal.email || !principal.idOnTheSource) {
      throw new Error('Entra ID user principals must have email and idOnTheSource');
    }

    let existingUser = await findUser({ idOnTheSource: principal.idOnTheSource });

    if (!existingUser) {
      existingUser = await findUser({ email: principal.email });
    }

    if (existingUser) {
      if (!existingUser.idOnTheSource && principal.idOnTheSource) {
        await updateUser(existingUser._id, {
          idOnTheSource: principal.idOnTheSource,
          provider: 'openid',
        });
      }
      return existingUser._id.toString();
    }

    const userData = {
      name: principal.name,
      email: principal.email.toLowerCase(),
      emailVerified: false,
      provider: 'openid',
      idOnTheSource: principal.idOnTheSource,
    };

    const userId = await createUser(userData, true, true);
    return userId.toString();
  }

  if (principal.type === PrincipalType.GROUP) {
    throw new Error('Group principals should be handled by group-specific methods');
  }

  throw new Error(`Unsupported principal type: ${principal.type}`);
};

/**
 * Ensures a group principal exists in the database
 */
const ensureGroupPrincipalExists = async function (principal, authContext = null) {
  if (principal.type !== PrincipalType.GROUP) {
    throw new Error(`Invalid principal type: ${principal.type}. Expected '${PrincipalType.GROUP}'`);
  }

  if (principal.source === 'entra') {
    if (!principal.name || !principal.idOnTheSource) {
      throw new Error('Entra ID group principals must have name and idOnTheSource');
    }

    let memberIds = [];
    if (authContext && authContext.accessToken && authContext.sub) {
      try {
        memberIds = await getGroupMembers(
          authContext.accessToken,
          authContext.sub,
          principal.idOnTheSource,
        );

        if (isEnabled(process.env.ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS)) {
          const ownerIds = await getGroupOwners(
            authContext.accessToken,
            authContext.sub,
            principal.idOnTheSource,
          );
          if (ownerIds && ownerIds.length > 0) {
            memberIds.push(...ownerIds);
            memberIds = [...new Set(memberIds)];
          }
        }
      } catch (error) {
        logger.error('Failed to fetch group members from Graph API:', error);
      }
    }

    let existingGroup = await findGroupByExternalId(principal.idOnTheSource, 'entra');

    if (!existingGroup && principal.email) {
      existingGroup = await Group.findOne({ email: principal.email.toLowerCase() });
    }

    if (existingGroup) {
      const updateData = {};
      let needsUpdate = false;

      if (!existingGroup.idOnTheSource && principal.idOnTheSource) {
        updateData.idOnTheSource = principal.idOnTheSource;
        updateData.source = 'entra';
        needsUpdate = true;
      }

      if (principal.description && existingGroup.description !== principal.description) {
        updateData.description = principal.description;
        needsUpdate = true;
      }

      if (principal.email && existingGroup.email !== principal.email.toLowerCase()) {
        updateData.email = principal.email.toLowerCase();
        needsUpdate = true;
      }

      if (authContext && authContext.accessToken && authContext.sub) {
        updateData.memberIds = memberIds;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await Group.findOneAndUpdate({ _id: existingGroup._id }, { $set: updateData });
      }

      return existingGroup._id.toString();
    }

    const groupData = {
      name: principal.name,
      source: 'entra',
      idOnTheSource: principal.idOnTheSource,
      memberIds: memberIds,
    };

    if (principal.email) {
      groupData.email = principal.email.toLowerCase();
    }

    if (principal.description) {
      groupData.description = principal.description;
    }

    const newGroup = await createGroup(groupData);
    return newGroup._id.toString();
  }
  if (principal.id && authContext == null) {
    return principal.id;
  }

  throw new Error(`Unsupported group principal source: ${principal.source}`);
};

/**
 * Synchronize user's Entra ID group memberships on sign-in
 */
const syncUserEntraGroupMemberships = async (user, accessToken) => {
  try {
    if (!entraIdPrincipalFeatureEnabled(user) || !accessToken || !user.idOnTheSource) {
      return;
    }

    const memberGroupIds = await getUserEntraGroups(accessToken, user.openidId);
    let allGroupIds = [...(memberGroupIds || [])];

    if (isEnabled(process.env.ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS)) {
      const ownedGroupIds = await getUserOwnedEntraGroups(accessToken, user.openidId);
      if (ownedGroupIds && ownedGroupIds.length > 0) {
        allGroupIds.push(...ownedGroupIds);
        allGroupIds = [...new Set(allGroupIds)];
      }
    }

    if (!allGroupIds || allGroupIds.length === 0) {
      return;
    }

    await Group.updateMany(
      {
        idOnTheSource: { $in: allGroupIds },
        source: 'entra',
        memberIds: { $ne: user.idOnTheSource },
      },
      { $addToSet: { memberIds: user.idOnTheSource } },
    );

    await Group.updateMany(
      {
        source: 'entra',
        memberIds: user.idOnTheSource,
        idOnTheSource: { $nin: allGroupIds },
      },
      { $pull: { memberIds: user.idOnTheSource } },
    );
  } catch (error) {
    logger.error(`[PermissionService.syncUserEntraGroupMemberships] Error syncing groups:`, error);
  }
};

/**
 * Check if public has a specific permission on a resource
 */
const hasPublicPermission = async ({ resourceType, resourceId, requiredPermissions }) => {
  try {
    if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
      throw new Error('requiredPermissions must be a positive number');
    }

    validateResourceType(resourceType);

    const publicPrincipal = [{ principalType: PrincipalType.PUBLIC }];

    const entries = await findEntriesByPrincipalsAndResource(
      publicPrincipal,
      resourceType,
      resourceId,
    );

    return entries.some((entry) => (entry.permBits & requiredPermissions) === requiredPermissions);
  } catch (error) {
    logger.error(`[PermissionService.hasPublicPermission] Error: ${error.message}`);
    if (error.message.includes('requiredPermissions must be')) {
      throw error;
    }
    return false;
  }
};

/**
 * Bulk update permissions for a resource (grant, update, revoke)
 */
const bulkUpdateResourcePermissions = async ({
  resourceType,
  resourceId,
  updatedPrincipals = [],
  revokedPrincipals = [],
  grantedBy,
}) => {
  try {
    if (!Array.isArray(updatedPrincipals)) {
      throw new Error('updatedPrincipals must be an array');
    }

    if (!Array.isArray(revokedPrincipals)) {
      throw new Error('revokedPrincipals must be an array');
    }

    if (!resourceId) {
      throw new Error(`Invalid resource ID: ${resourceId}`);
    }

    const roles = await AccessRole.find({ resourceType });
    const rolesMap = new Map();
    roles.forEach((role) => {
      rolesMap.set(role.accessRoleId, role);
    });

    const results = {
      granted: [],
      updated: [],
      revoked: [],
      errors: [],
    };

    for (const principal of updatedPrincipals) {
      try {
        if (!principal.accessRoleId) {
          results.errors.push({
            principal,
            error: 'accessRoleId is required for updated principals',
          });
          continue;
        }

        const role = rolesMap.get(principal.accessRoleId);
        if (!role) {
          results.errors.push({
            principal,
            error: `Role ${principal.accessRoleId} not found`,
          });
          continue;
        }

        await grantPermissionACL(
            principal.type,
            principal.id,
            resourceType,
            resourceId,
            role.permBits,
            grantedBy,
            null,
            role._id
        );

        results.granted.push({
          type: principal.type,
          id: principal.id,
          name: principal.name,
          email: principal.email,
          source: principal.source,
          avatar: principal.avatar,
          description: principal.description,
          idOnTheSource: principal.idOnTheSource,
          accessRoleId: principal.accessRoleId,
          memberCount: principal.memberCount,
          memberIds: principal.memberIds,
        });
      } catch (error) {
        results.errors.push({
          principal,
          error: error.message,
        });
      }
    }

    for (const principal of revokedPrincipals) {
      try {
        await AclEntry.findOneAndDelete({
          principalType: principal.type,
          principalId: principal.id,
          resourceType,
          resourceId,
        });

        results.revoked.push({
          type: principal.type,
          id: principal.id,
          name: principal.name,
          email: principal.email,
          source: principal.source,
          avatar: principal.avatar,
          description: principal.description,
          idOnTheSource: principal.idOnTheSource,
          memberCount: principal.memberCount,
        });
      } catch (error) {
        results.errors.push({
          principal,
          error: error.message,
        });
      }
    }

    return results;
  } catch (error) {
    logger.error(`[PermissionService.bulkUpdateResourcePermissions] Error: ${error.message}`);
    throw error;
  }
};

/**
 * Remove all permissions for a resource (cleanup when resource is deleted)
 */
const removeAllPermissions = async ({ resourceType, resourceId }) => {
  try {
    validateResourceType(resourceType);

    if (!resourceId) {
      throw new Error(`Invalid resource ID: ${resourceId}`);
    }

    const result = await AclEntry.deleteMany({
      resourceType,
      resourceId,
    });

    return result;
  } catch (error) {
    logger.error(`[PermissionService.removeAllPermissions] Error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  grantPermission,
  checkPermission,
  getEffectivePermissions,
  getResourcePermissionsMap,
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
  getAvailableRoles,
  bulkUpdateResourcePermissions,
  ensurePrincipalExists,
  ensureGroupPrincipalExists,
  syncUserEntraGroupMemberships,
  removeAllPermissions,
};
