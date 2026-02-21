import type { IUser, BalanceConfig, CreateUserRequest, UserDeleteResult, FilterQuery } from '~/types';
import { signPayload } from '~/crypto';
import { nanoid } from 'nanoid';

/** Default JWT session expiry: 15 minutes in milliseconds */
export const DEFAULT_SESSION_EXPIRY = 1000 * 60 * 15;

const userStore = new Map<string, IUser>();
const balanceStore = new Map<string, any>();

/** Factory function that returns the methods */
export function createUserMethods() {
  /**
   * Normalizes email fields in search criteria to lowercase and trimmed.
   */
  function normalizeEmailInCriteria<T extends FilterQuery<IUser>>(criteria: T): T {
    const normalized = { ...criteria };
    if (typeof normalized.email === 'string') {
      normalized.email = normalized.email.trim().toLowerCase();
    }
    if (Array.isArray(normalized.$or)) {
      normalized.$or = normalized.$or.map((condition) => {
        if (typeof condition.email === 'string') {
          return { ...condition, email: condition.email.trim().toLowerCase() };
        }
        return condition;
      });
    }
    return normalized;
  }

  /**
   * Search for a single user based on partial data.
   */
  async function findUser(
    searchCriteria: FilterQuery<IUser>,
    _fieldsToSelect?: string | string[] | null,
  ): Promise<IUser | null> {
    const normalizedCriteria = normalizeEmailInCriteria(searchCriteria);
    for (const user of userStore.values()) {
       let match = true;
       for (const key in normalizedCriteria) {
          if (key === '$or') {
             const orArray = normalizedCriteria.$or as any[];
             if (!orArray.some(cond => {
                for (const k in cond) {
                   if ((user as any)[k] !== cond[k]) return false;
                }
                return true;
             })) {
                match = false;
                break;
             }
             continue;
          }
          if ((user as any)[key] !== (normalizedCriteria as any)[key]) {
            match = false;
            break;
          }
       }
       if (match) return user;
    }
    return null;
  }

  /**
   * Count the number of user documents in the collection based on the provided filter.
   */
  async function countUsers(filter: FilterQuery<IUser> = {}): Promise<number> {
    let count = 0;
    for (const user of userStore.values()) {
       let match = true;
       for (const key in filter) {
          if ((user as any)[key] !== (filter as any)[key]) {
            match = false;
            break;
          }
       }
       if (match) count++;
    }
    return count;
  }

  /**
   * Creates a new user.
   */
  async function createUser(
    data: CreateUserRequest,
    balanceConfig?: BalanceConfig,
    disableTTL: boolean = true,
    returnUser: boolean = true,
  ): Promise<IUser | string> {
    const userId = nanoid();
    const userData: IUser = {
      ...data,
      _id: userId,
      id: userId,
      email: data.email.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: disableTTL ? undefined : new Date(Date.now() + 604800 * 1000).toISOString(),
    } as any;

    userStore.set(userId, userData);

    if (balanceConfig?.enabled && balanceConfig?.startBalance) {
      balanceStore.set(userId, {
        user: userId,
        tokenCredits: balanceConfig.startBalance,
        autoRefillEnabled: balanceConfig.autoRefillEnabled || false,
      });
    }

    if (returnUser) {
      return userData;
    }
    return userId;
  }

  /**
   * Update a user.
   */
  async function updateUser(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    const existing = userStore.get(userId);
    if (!existing) return null;
    const updated = { ...existing, ...updateData, updatedAt: new Date().toISOString() };
    delete (updated as any).expiresAt;
    userStore.set(userId, updated);
    return updated;
  }

  /**
   * Retrieve a user by ID.
   */
  async function getUserById(
    userId: string,
    _fieldsToSelect?: string | string[] | null,
  ): Promise<IUser | null> {
    if (typeof userId === 'object' && userId !== null) {
      userId = (userId as any).toString();
    }
    return userStore.get(userId) || null;
  }

  /**
   * List all users.
   */
  async function listUsers(): Promise<IUser[]> {
    return Array.from(userStore.values());
  }

  /**
   * Delete a user by their unique ID.
   */
  async function deleteUserById(userId: string): Promise<UserDeleteResult> {
    if (userStore.delete(userId)) {
      return { deletedCount: 1, message: 'User was deleted successfully.' };
    }
    return { deletedCount: 0, message: 'No user found with that ID.' };
  }

  /**
   * Generates a JWT token for a given user.
   */
  async function generateToken(user: IUser, expiresIn?: number): Promise<string> {
    const expires = expiresIn ?? DEFAULT_SESSION_EXPIRY;
    return await signPayload({
      payload: {
        id: user._id,
        username: user.username,
        provider: user.provider,
        email: user.email,
      },
      secret: process.env.JWT_SECRET as string,
      expirationTime: expires / 1000,
    });
  }

  /**
   * Update a user's personalization memories setting.
   */
  async function toggleUserMemories(
    userId: string,
    memoriesEnabled: boolean,
  ): Promise<IUser | null> {
    return await updateUser(userId, { personalization: { memories: memoriesEnabled } } as any);
  }

  /**
   * Search for users.
   */
  async function searchUsers({
    searchPattern,
    limit = 20,
  }: {
    searchPattern: string;
    limit?: number;
    fieldsToSelect?: string | string[] | null;
  }) {
    if (!searchPattern || searchPattern.trim().length === 0) return [];
    const regex = new RegExp(searchPattern.trim(), 'i');
    const matches = Array.from(userStore.values()).filter(user =>
       regex.test(user.name || '') || regex.test(user.email || '') || regex.test(user.username || '')
    );
    return matches.slice(0, limit);
  }

  /**
   * Updates the plugins for a user.
   */
  async function updateUserPlugins(
    userId: string,
    plugins: string[] | undefined,
    pluginKey: string,
    action: 'install' | 'uninstall',
  ): Promise<IUser | null> {
    const userPlugins = plugins ?? [];
    if (action === 'install') {
      return updateUser(userId, { plugins: [...userPlugins, pluginKey] });
    }
    if (action === 'uninstall') {
      return updateUser(userId, {
        plugins: userPlugins.filter((plugin) => plugin !== pluginKey),
      });
    }
    return null;
  }

  return {
    findUser,
    listUsers,
    countUsers,
    createUser,
    updateUser,
    searchUsers,
    getUserById,
    generateToken,
    deleteUserById,
    updateUserPlugins,
    toggleUserMemories,
  };
}

export type UserMethods = ReturnType<typeof createUserMethods>;
