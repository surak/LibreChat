import { PrincipalType } from 'librechat-data-provider';
import type { TUser, TPrincipalSearchResult } from 'librechat-data-provider';
import type { IGroup, IRole, IUser } from '~/types';
import { nanoid } from 'nanoid';

const groupStore = new Map<string, IGroup>();

// Factory function that returns the methods
export function createUserGroupMethods() {
  /**
   * Generic find for groups
   */
  async function findGroups(filter: any = {}): Promise<IGroup[]> {
    return Array.from(groupStore.values()).filter(g => {
      for (const key in filter) {
        const filterVal = filter[key];
        const groupVal = (g as any)[key];
        if (typeof filterVal === 'object' && filterVal !== null) {
          if (filterVal.$in && Array.isArray(filterVal.$in)) {
            if (!filterVal.$in.includes(groupVal)) return false;
            continue;
          }
          if (filterVal.$nin && Array.isArray(filterVal.$nin)) {
            if (filterVal.$nin.includes(groupVal)) return false;
            continue;
          }
          if (filterVal.$ne !== undefined && groupVal === filterVal.$ne) return false;
        } else if (groupVal !== filterVal) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Generic findOne for groups
   */
  async function findOneGroup(filter: any = {}): Promise<IGroup | null> {
    const groups = await findGroups(filter);
    return groups[0] || null;
  }

  /**
   * Find a group by its ID
   */
  async function findGroupById(
    groupId: string,
    _projection: Record<string, unknown> = {},
  ): Promise<IGroup | null> {
    return groupStore.get(groupId) || null;
  }

  /**
   * Find a group by its external ID
   */
  async function findGroupByExternalId(
    idOnTheSource: string,
    source: 'entra' | 'local' = 'entra',
  ): Promise<IGroup | null> {
    return Array.from(groupStore.values()).find(g => g.idOnTheSource === idOnTheSource && g.source === source) || null;
  }

  /**
   * Find groups by name pattern
   */
  async function findGroupsByNamePattern(
    namePattern: string,
    source: 'entra' | 'local' | null = null,
    limit: number = 20,
  ): Promise<IGroup[]> {
    const regex = new RegExp(namePattern, 'i');
    return Array.from(groupStore.values())
      .filter(g => {
        if (source && g.source !== source) return false;
        return regex.test(g.name || '') || regex.test(g.email || '') || regex.test(g.description || '');
      })
      .slice(0, limit);
  }

  /**
   * Find all groups a user is a member of
   */
  async function findGroupsByMemberId(
    userId: string,
  ): Promise<IGroup[]> {
    return Array.from(groupStore.values()).filter(g => g.memberIds?.includes(userId));
  }

  /**
   * Create a new group
   */
  async function createGroup(groupData: Partial<IGroup>): Promise<IGroup> {
    const id = nanoid();
    const newGroup: IGroup = {
      _id: id,
      ...groupData,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    groupStore.set(id, newGroup);
    return newGroup;
  }

  /**
   * Update or create a group by external ID
   */
  async function upsertGroupByExternalId(
    idOnTheSource: string,
    source: 'entra' | 'local',
    updateData: Partial<IGroup>,
  ): Promise<IGroup | null> {
    let existing = await findGroupByExternalId(idOnTheSource, source);
    if (existing) {
      const updated = { ...existing, ...updateData, updatedAt: new Date() };
      groupStore.set(existing._id as string, updated);
      return updated;
    } else {
      return await createGroup({ ...updateData, idOnTheSource, source });
    }
  }

  /**
   * Add a user to a group
   */
  async function addUserToGroup(
    userId: string,
    groupId: string,
  ): Promise<{ user: IUser; group: IGroup | null }> {
    const group = groupStore.get(groupId);
    if (!group) return { user: {} as IUser, group: null };

    group.memberIds = group.memberIds || [];
    if (!group.memberIds.includes(userId)) {
      group.memberIds.push(userId);
      group.updatedAt = new Date();
      groupStore.set(groupId, group);
    }
    return { user: { _id: userId } as any, group };
  }

  /**
   * Remove a user from a group
   */
  async function removeUserFromGroup(
    userId: string,
    groupId: string,
  ): Promise<{ user: IUser; group: IGroup | null }> {
    const group = groupStore.get(groupId);
    if (!group) return { user: {} as IUser, group: null };

    if (group.memberIds) {
      group.memberIds = group.memberIds.filter(id => id !== userId);
      group.updatedAt = new Date();
      groupStore.set(groupId, group);
    }
    return { user: { _id: userId } as any, group };
  }

  /**
   * Get all groups a user is a member of
   */
  async function getUserGroups(
    userId: string,
  ): Promise<IGroup[]> {
    return await findGroupsByMemberId(userId);
  }

  /**
   * Get a list of all principal identifiers for a user
   */
  async function getUserPrincipals(
    params: {
      userId: string;
      role?: string | null;
    },
  ): Promise<Array<{ principalType: string; principalId?: string }>> {
    const { userId, role } = params;
    const principals: Array<{ principalType: string; principalId?: string }> = [
      { principalType: PrincipalType.USER, principalId: userId },
    ];

    if (role && role.trim()) {
      principals.push({ principalType: PrincipalType.ROLE, principalId: role });
    }

    const userGroups = await getUserGroups(userId);
    if (userGroups && userGroups.length > 0) {
      userGroups.forEach((group) => {
        principals.push({ principalType: PrincipalType.GROUP, principalId: group._id as string });
      });
    }

    principals.push({ principalType: PrincipalType.PUBLIC });

    return principals;
  }

  /**
   * Sync a user's Entra ID group memberships
   */
  async function syncUserEntraGroups(
    userId: string,
    entraGroups: Array<{ id: string; name: string; description?: string; email?: string }>,
  ): Promise<{
    user: IUser;
    addedGroups: IGroup[];
    removedGroups: IGroup[];
  }> {
    const addedGroups: IGroup[] = [];
    const removedGroups: IGroup[] = [];

    const entraIdSet = new Set(entraGroups.map(g => g.id));

    for (const entraGroup of entraGroups) {
      let group = await findGroupByExternalId(entraGroup.id, 'entra');
      if (!group) {
        group = await createGroup({
          name: entraGroup.name,
          description: entraGroup.description,
          email: entraGroup.email,
          idOnTheSource: entraGroup.id,
          source: 'entra',
          memberIds: [userId],
        });
        addedGroups.push(group);
      } else {
        group.memberIds = group.memberIds || [];
        if (!group.memberIds.includes(userId)) {
          group.memberIds.push(userId);
          group.updatedAt = new Date();
          groupStore.set(group._id as string, group);
          addedGroups.push(group);
        }
      }
    }

    const allGroups = Array.from(groupStore.values());
    for (const group of allGroups) {
      if (group.source === 'entra' && group.memberIds?.includes(userId)) {
         if (group.idOnTheSource && !entraIdSet.has(group.idOnTheSource)) {
            group.memberIds = group.memberIds.filter(id => id !== userId);
            group.updatedAt = new Date();
            groupStore.set(group._id as string, group);
            removedGroups.push(group);
         }
      }
    }

    return {
      user: { _id: userId } as any,
      addedGroups,
      removedGroups,
    };
  }

  /**
   * Calculate relevance score
   */
  function calculateRelevanceScore(item: TPrincipalSearchResult, searchPattern: string): number {
    const exactRegex = new RegExp(`^${searchPattern}$`, 'i');
    const startsWithPattern = searchPattern.toLowerCase();
    const searchableFields =
      item.type === PrincipalType.USER
        ? [item.name, item.email, item.username].filter(Boolean)
        : [item.name, item.email, (item as any).description].filter(Boolean);

    let maxScore = 0;
    for (const field of searchableFields) {
      if (!field) continue;
      const fieldLower = field.toLowerCase();
      let score = 0;
      if (exactRegex.test(field)) score = 100;
      else if (fieldLower.startsWith(startsWithPattern)) score = 80;
      else if (fieldLower.includes(startsWithPattern)) score = 50;
      else score = 10;
      maxScore = Math.max(maxScore, score);
    }
    return maxScore;
  }

  /**
   * Sort principals
   */
  function sortPrincipalsByRelevance<
    T extends { _searchScore?: number; type: string; name?: string; email?: string },
  >(results: T[]): T[] {
    return results.sort((a, b) => {
      if (b._searchScore !== a._searchScore) return (b._searchScore || 0) - (a._searchScore || 0);
      if (a.type !== b.type) return a.type === PrincipalType.USER ? -1 : 1;
      const aName = a.name || a.email || '';
      const bName = b.name || b.email || '';
      return aName.localeCompare(bName);
    });
  }

  async function updateManyGroups(filter: any, update: any) {
    const groups = await findGroups(filter);
    for (const group of groups) {
      const id = group._id as string;
      const existing = groupStore.get(id)!;
      // Handle $addToSet and $pull if needed, but simplified for now
      if (update.$addToSet && update.$addToSet.memberIds) {
         existing.memberIds = existing.memberIds || [];
         if (!existing.memberIds.includes(update.$addToSet.memberIds)) {
            existing.memberIds.push(update.$addToSet.memberIds);
         }
      }
      if (update.$pull && update.$pull.memberIds) {
         if (existing.memberIds) {
            existing.memberIds = existing.memberIds.filter(mid => mid !== update.$pull.memberIds);
         }
      }
      existing.updatedAt = new Date();
      groupStore.set(id, existing);
    }
    return { modifiedCount: groups.length };
  }

  async function findOneAndUpdateGroup(filter: any, update: any) {
    const group = await findOneGroup(filter);
    if (!group) return null;
    const id = group._id as string;
    const existing = groupStore.get(id)!;
    const data = update.$set || update;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    groupStore.set(id, updated);
    return updated;
  }

  return {
    findGroups,
    findOneGroup,
    findGroupById,
    findGroupByExternalId,
    findGroupsByNamePattern,
    findGroupsByMemberId,
    createGroup,
    upsertGroupByExternalId,
    addUserToGroup,
    removeUserFromGroup,
    getUserGroups,
    getUserPrincipals,
    syncUserEntraGroups,
    searchPrincipals: async () => [],
    calculateRelevanceScore,
    sortPrincipalsByRelevance,
    updateManyGroups,
    findOneAndUpdateGroup,
  };
}

export type UserGroupMethods = ReturnType<typeof createUserGroupMethods>;
