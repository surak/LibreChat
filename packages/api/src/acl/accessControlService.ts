import { AllMethods, IAclEntry, createMethods, logger } from '@librechat/data-schemas';
import { AccessRoleIds, PrincipalType, ResourceType } from 'librechat-data-provider';

export class AccessControlService {
  private _dbMethods: AllMethods;

  constructor() {
    this._dbMethods = createMethods();
  }

  /**
   * Grant a permission to a principal for a resource using a role
   * @param {Object} params - Parameters for granting role-based permission
   * @param {string} params.principalType - PrincipalType.USER, PrincipalType.GROUP, or PrincipalType.PUBLIC
   * @param {string|null} params.principalId - The ID of the principal (null for PrincipalType.PUBLIC)
   * @param {string} params.resourceType - Type of resource (e.g., 'agent')
   * @param {string} params.resourceId - The ID of the resource
   * @param {string} params.accessRoleId - The ID of the role (e.g., AccessRoleIds.AGENT_VIEWER, AccessRoleIds.AGENT_EDITOR)
   * @param {string} params.grantedBy - User ID granting the permission
   * @returns {Promise<IAclEntry>} The created or updated ACL entry
   */
  public async grantPermission(args: {
    principalType: PrincipalType;
    principalId: string | null;
    resourceType: string;
    resourceId: string;
    accessRoleId: AccessRoleIds;
    grantedBy: string;
  }): Promise<IAclEntry | null> {
    const {
      principalType,
      principalId,
      resourceType,
      resourceId,
      accessRoleId,
      grantedBy,
    } = args;
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

      this.validateResourceType(resourceType as ResourceType);

      // Get the role to determine permission bits
      const role = await this._dbMethods.findRoleByIdentifier(accessRoleId);
      if (!role) {
        throw new Error(`Role ${accessRoleId} not found`);
      }

      // Ensure the role is for the correct resource type
      if (role.resourceType !== resourceType) {
        throw new Error(
          `Role ${accessRoleId} is for ${role.resourceType} resources, not ${resourceType}`,
        );
      }
      return await this._dbMethods.grantPermission(
        principalType,
        principalId,
        resourceType,
        resourceId,
        role.permBits,
        grantedBy,
      );
    } catch (error) {
      logger.error(
        `[AccessControlService.grantPermission] Error: ${error instanceof Error ? error.message : ''}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Find all resources of a specific type that a user has access to with specific permission bits
   * @param {Object} params - Parameters for finding accessible resources
   * @param {string} params.userId - The ID of the user
   * @param {string} [params.role] - Optional user role (if not provided, will query from DB)
   * @param {string} params.resourceType - Type of resource (e.g., 'agent')
   * @param {number} params.requiredPermissions - The minimum permission bits required (e.g., 1 for VIEW, 3 for VIEW+EDIT)
   * @returns {Promise<Array>} Array of resource IDs
   */
  public async findAccessibleResources({
    userId,
    role,
    resourceType,
    requiredPermissions,
  }: {
    userId: string;
    role?: string;
    resourceType: string;
    requiredPermissions: number;
  }): Promise<string[]> {
    try {
      if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
        throw new Error('requiredPermissions must be a positive number');
      }

      this.validateResourceType(resourceType as ResourceType);

      // Get all principals for the user (user + groups + public)
      const principalsList = await this._dbMethods.getUserPrincipals({ userId, role });

      if (principalsList.length === 0) {
        return [];
      }
      return await this._dbMethods.findAccessibleResources(
        principalsList,
        resourceType,
        requiredPermissions,
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[AccessControlService.findAccessibleResources] Error: ${error.message}`);
        // Re-throw validation errors
        if (error.message.includes('requiredPermissions must be')) {
          throw error;
        }
      }
      return [];
    }
  }

  /**
   * Find all publicly accessible resources of a specific type
   * @param {Object} params - Parameters for finding publicly accessible resources
   * @param {ResourceType} params.resourceType - Type of resource (e.g., 'agent')
   * @param {number} params.requiredPermissions - The minimum permission bits required (e.g., 1 for VIEW, 3 for VIEW+EDIT)
   * @returns {Promise<string[]>} Array of resource IDs
   */
  public async findPubliclyAccessibleResources({
    resourceType,
    requiredPermissions,
  }: {
    resourceType: ResourceType;
    requiredPermissions: number;
  }): Promise<string[]> {
    try {
      if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
        throw new Error('requiredPermissions must be a positive number');
      }

      this.validateResourceType(resourceType);

      const entries = await this._dbMethods.aclEntry.find({
        principalType: PrincipalType.PUBLIC,
        resourceType,
        permBits: requiredPermissions, // Simplification for stateless
      });

      return Array.from(new Set(entries.map(e => e.resourceId)));
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[AccessControlService.findPubliclyAccessibleResources] Error: ${error.message}`);
        // Re-throw validation errors
        if (error.message.includes('requiredPermissions must be')) {
          throw error;
        }
      }
      return [];
    }
  }

  /**
   * Get effective permissions for multiple resources in a batch operation
   * Returns map of resourceId → effectivePermissionBits
   *
   * @param {Object} params - Parameters
   * @param {string} params.userId - User ID
   * @param {string} [params.role] - User role (for group membership)
   * @param {string} params.resourceType - Resource type (must be valid ResourceType)
   * @param {Array<string>} params.resourceIds - Array of resource IDs
   * @returns {Promise<Map<string, number>>} Map of resourceId string → permission bits
   * @throws {Error} If resourceType is invalid
   */
  public async getResourcePermissionsMap({
    userId,
    role,
    resourceType,
    resourceIds,
  }: {
    userId: string;
    role: string;
    resourceType: ResourceType;
    resourceIds: string[];
  }): Promise<Map<string, number>> {
    // Validate resource type - throw on invalid type
    this.validateResourceType(resourceType);

    // Handle empty input
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      return new Map();
    }

    try {
      // Get user principals (user + groups + public)
      const principals = await this._dbMethods.getUserPrincipals({ userId, role });

      // Use batch method from aclEntry
      const permissionsMap = await this._dbMethods.getEffectivePermissionsForResources(
        principals,
        resourceType,
        resourceIds,
      );

      logger.debug(
        `[AccessControlService.getResourcePermissionsMap] Computed permissions for ${resourceIds.length} resources, ${permissionsMap.size} have permissions`,
      );

      return permissionsMap;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          `[AccessControlService.getResourcePermissionsMap] Error: ${error.message}`,
          error,
        );
      }
      throw error;
    }
  }

  /**
   * Remove all permissions for a resource (cleanup when resource is deleted)
   * @param {Object} params - Parameters for removing all permissions
   * @param {string} params.resourceType - Type of resource (e.g., 'agent', 'prompt')
   * @param {string} params.resourceId - The ID of the resource
   * @returns {Promise<{ acknowledged: boolean; deletedCount: number }>} Result of the deletion operation
   */
  public async removeAllPermissions({
    resourceType,
    resourceId,
  }: {
    resourceType: ResourceType;
    resourceId: string;
  }): Promise<{ acknowledged: boolean; deletedCount: number }> {
    try {
      this.validateResourceType(resourceType);

      if (!resourceId) {
        throw new Error(`Invalid resource ID: ${resourceId}`);
      }

      return await this._dbMethods.aclEntry.deleteMany({
        resourceType,
        resourceId,
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[AccessControlService.removeAllPermissions] Error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if a user has specific permission bits on a resource
   * @param {Object} params - Parameters for checking permissions
   * @param {string} params.userId - The ID of the user
   * @param {string} [params.role] - Optional user role (if not provided, will query from DB)
   * @param {string} params.resourceType - Type of resource (e.g., 'agent')
   * @param {string} params.resourceId - The ID of the resource
   * @param {number} params.requiredPermission - The permission bits required (e.g., 1 for VIEW, 3 for VIEW+EDIT)
   * @returns {Promise<boolean>} Whether the user has the required permission bits
   */
  public async checkPermission({
    userId,
    role,
    resourceType,
    resourceId,
    requiredPermission,
  }: {
    userId: string;
    role?: string;
    resourceType: ResourceType;
    resourceId: string;
    requiredPermission: number;
  }): Promise<boolean> {
    try {
      if (typeof requiredPermission !== 'number' || requiredPermission < 1) {
        throw new Error('requiredPermission must be a positive number');
      }

      this.validateResourceType(resourceType);

      // Get all principals for the user (user + groups + public)
      const principals = await this._dbMethods.getUserPrincipals({ userId, role });

      if (principals.length === 0) {
        return false;
      }

      return await this._dbMethods.hasPermission(
        principals,
        resourceType,
        resourceId,
        requiredPermission,
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`[AccessControlService.checkPermission] Error: ${error.message}`);
        // Re-throw validation errors
        if (error.message.includes('requiredPermission must be')) {
          throw error;
        }
      }
      return false;
    }
  }

  /**
   * Validates that the resourceType is one of the supported enum values
   * @param {string} resourceType - The resource type to validate
   * @throws {Error} If resourceType is not valid
   */
  private validateResourceType(resourceType: ResourceType): void {
    const validTypes = Object.values(ResourceType);
    if (!validTypes.includes(resourceType)) {
      throw new Error(
        `Invalid resourceType: ${resourceType}. Valid types: ${validTypes.join(', ')}`,
      );
    }
  }
}
