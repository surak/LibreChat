import { nanoid } from 'nanoid';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { IAclEntry } from '~/types';

const aclStore = new Map<string, IAclEntry>();

export function createAclEntryMethods() {
  /**
   * Generic find for ACL entries
   */
  async function findAclEntries(filter: any = {}): Promise<IAclEntry[]> {
    return Array.from(aclStore.values()).filter(entry => {
      for (const key in filter) {
        const filterVal = filter[key];
        const entryVal = (entry as any)[key];
        if (typeof filterVal === 'object' && filterVal !== null) {
           // Simplified operator handling
           if (filterVal.$in && Array.isArray(filterVal.$in)) {
             if (!filterVal.$in.includes(entryVal)) return false;
             continue;
           }
           if (filterVal.$bitsAllSet !== undefined) {
             if ((entryVal & filterVal.$bitsAllSet) !== filterVal.$bitsAllSet) return false;
             continue;
           }
        } else if (entryVal !== filterVal) {
          return false;
        }
      }
      return true;
    });
  }

  async function findOneAclEntry(filter: any = {}): Promise<IAclEntry | null> {
    const entries = await findAclEntries(filter);
    return entries[0] || null;
  }

  async function deleteManyAclEntries(filter: any = {}) {
    const entries = await findAclEntries(filter);
    for (const entry of entries) {
      aclStore.delete(entry._id as string);
    }
    return { deletedCount: entries.length };
  }

  async function findOneAndDeleteAclEntry(filter: any = {}) {
    const entry = await findOneAclEntry(filter);
    if (entry) {
      aclStore.delete(entry._id as string);
    }
    return entry;
  }

  /**
   * Find ACL entries for a specific principal (user or group)
   */
  async function findEntriesByPrincipal(
    principalType: string,
    principalId: string,
    resourceType?: string,
  ): Promise<IAclEntry[]> {
    return findAclEntries({ principalType, principalId, ...(resourceType && { resourceType }) });
  }

  /**
   * Find ACL entries for a specific resource
   */
  async function findEntriesByResource(
    resourceType: string,
    resourceId: string,
  ): Promise<IAclEntry[]> {
    return findAclEntries({ resourceType, resourceId });
  }

  /**
   * Find all ACL entries for a set of principals (including public)
   */
  async function findEntriesByPrincipalsAndResource(
    principalsList: Array<{ principalType: string; principalId?: string }>,
    resourceType: string,
    resourceId: string,
  ): Promise<IAclEntry[]> {
    return Array.from(aclStore.values()).filter((entry) => {
      if (entry.resourceType !== resourceType || entry.resourceId !== resourceId) {
        return false;
      }
      return principalsList.some((p) => {
        if (p.principalType === PrincipalType.PUBLIC) {
          return entry.principalType === PrincipalType.PUBLIC;
        }
        return entry.principalType === p.principalType && entry.principalId === p.principalId;
      });
    });
  }

  /**
   * Check if a set of principals has a specific permission on a resource
   */
  async function hasPermission(
    principalsList: Array<{ principalType: string; principalId?: string }>,
    resourceType: string,
    resourceId: string,
    permissionBit: number,
  ): Promise<boolean> {
    const entries = await findEntriesByPrincipalsAndResource(
      principalsList,
      resourceType,
      resourceId,
    );
    return entries.some((entry) => (entry.permBits & permissionBit) === permissionBit);
  }

  /**
   * Get the combined effective permissions for a set of principals on a resource
   */
  async function getEffectivePermissions(
    principalsList: Array<{ principalType: string; principalId?: string }>,
    resourceType: string,
    resourceId: string,
  ): Promise<number> {
    const aclEntries = await findEntriesByPrincipalsAndResource(
      principalsList,
      resourceType,
      resourceId,
    );

    let effectiveBits = 0;
    for (const entry of aclEntries) {
      effectiveBits |= entry.permBits;
    }
    return effectiveBits;
  }

  /**
   * Get effective permissions for multiple resources in a single query (BATCH)
   */
  async function getEffectivePermissionsForResources(
    principalsList: Array<{ principalType: string; principalId?: string }>,
    resourceType: string,
    resourceIds: Array<string>,
  ): Promise<Map<string, number>> {
    const permissionsMap = new Map<string, number>();
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      return permissionsMap;
    }

    const allEntries = Array.from(aclStore.values()).filter((entry) => {
      if (entry.resourceType !== resourceType || !resourceIds.includes(entry.resourceId)) {
        return false;
      }
      return principalsList.some((p) => {
        if (p.principalType === PrincipalType.PUBLIC) {
          return entry.principalType === PrincipalType.PUBLIC;
        }
        return entry.principalType === p.principalType && entry.principalId === p.principalId;
      });
    });

    for (const entry of allEntries) {
      const rid = entry.resourceId;
      const currentBits = permissionsMap.get(rid) || 0;
      permissionsMap.set(rid, currentBits | entry.permBits);
    }

    return permissionsMap;
  }

  /**
   * Grant permission to a principal for a resource
   */
  async function grantPermission(
    principalType: string,
    principalId: string | null,
    resourceType: string,
    resourceId: string,
    permBits: number,
    grantedBy: string,
    _session?: any,
    roleId?: string,
  ): Promise<IAclEntry | null> {
    const existing = Array.from(aclStore.values()).find(
      (e) =>
        e.principalType === principalType &&
        e.principalId === principalId &&
        e.resourceType === resourceType &&
        e.resourceId === resourceId,
    );

    if (existing) {
      existing.permBits = permBits;
      existing.grantedBy = grantedBy;
      existing.grantedAt = new Date();
      if (roleId) existing.roleId = roleId;
      return existing;
    }

    const newId = nanoid();
    const newEntry: IAclEntry = {
      _id: newId,
      principalType: principalType as any,
      principalId: principalId as any,
      resourceType: resourceType as any,
      resourceId,
      permBits,
      grantedBy,
      grantedAt: new Date(),
      roleId,
    };

    if (principalType === PrincipalType.USER) {
      newEntry.principalModel = PrincipalModel.USER;
    } else if (principalType === PrincipalType.GROUP) {
      newEntry.principalModel = PrincipalModel.GROUP;
    } else if (principalType === PrincipalType.ROLE) {
      newEntry.principalModel = PrincipalModel.ROLE;
    }

    aclStore.set(newId, newEntry);
    return newEntry;
  }

  /**
   * Revoke permissions from a principal for a resource
   */
  async function revokePermission(
    principalType: string,
    principalId: string | null,
    resourceType: string,
    resourceId: string,
    _session?: any,
  ): Promise<{ deletedCount: number }> {
    return deleteManyAclEntries({ principalType, principalId, resourceType, resourceId });
  }

  /**
   * Modify existing permission bits for a principal on a resource
   */
  async function modifyPermissionBits(
    principalType: string,
    principalId: string | null,
    resourceType: string,
    resourceId: string,
    addBits?: number | null,
    removeBits?: number | null,
    _session?: any,
  ): Promise<IAclEntry | null> {
    let entry = Array.from(aclStore.values()).find(
      (e) =>
        e.principalType === principalType &&
        e.principalId === principalId &&
        e.resourceType === resourceType &&
        e.resourceId === resourceId,
    );

    if (!entry) {
      return null;
    }

    if (addBits) {
      entry.permBits |= addBits;
    }

    if (removeBits) {
      entry.permBits &= ~removeBits;
    }

    return entry;
  }

  /**
   * Find all resources of a specific type that a set of principals has access to
   */
  async function findAccessibleResources(
    principalsList: Array<{ principalType: string; principalId?: string }>,
    resourceType: string,
    requiredPermBit: number,
  ): Promise<string[]> {
    const accessibleResourceIds = new Set<string>();
    const entries = Array.from(aclStore.values()).filter((entry) => {
      if (entry.resourceType !== resourceType || (entry.permBits & requiredPermBit) !== requiredPermBit) {
        return false;
      }
      return principalsList.some((p) => {
        if (p.principalType === PrincipalType.PUBLIC) {
          return entry.principalType === PrincipalType.PUBLIC;
        }
        return entry.principalType === p.principalType && entry.principalId === p.principalId;
      });
    });

    for (const entry of entries) {
      accessibleResourceIds.add(entry.resourceId);
    }

    return Array.from(accessibleResourceIds);
  }

  async function findOneAndUpdateAclEntry(filter: any, update: any) {
    const entry = await findOneAclEntry(filter);
    if (!entry) return null;
    const data = update.$set || update;
    Object.assign(entry, data);
    return entry;
  }

  return {
    findAclEntries,
    findOneAclEntry,
    deleteManyAclEntries,
    findOneAndDeleteAclEntry,
    findEntriesByPrincipal,
    findEntriesByResource,
    findEntriesByPrincipalsAndResource,
    hasPermission,
    getEffectivePermissions,
    getEffectivePermissionsForResources,
    grantPermission,
    revokePermission,
    modifyPermissionBits,
    findAccessibleResources,
    findOneAndUpdateAclEntry,
  };
}

export type AclEntryMethods = ReturnType<typeof createAclEntryMethods>;
