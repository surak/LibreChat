import type {
  FindPluginAuthsByKeysParams,
  UpdatePluginAuthParams,
  DeletePluginAuthParams,
  FindPluginAuthParams,
  IPluginAuth,
} from '~/types';
import { nanoid } from 'nanoid';

const pluginAuthStore = new Map<string, IPluginAuth>();

// Factory function that returns the methods
export function createPluginAuthMethods() {
  /**
   * Finds a single plugin auth entry
   */
  async function findOnePluginAuth({
    userId,
    authField,
    pluginKey,
  }: FindPluginAuthParams): Promise<IPluginAuth | null> {
    try {
      return Array.from(pluginAuthStore.values()).find(a =>
        a.userId === userId &&
        a.authField === authField &&
        (!pluginKey || a.pluginKey === pluginKey)
      ) || null;
    } catch (error) {
      throw new Error(
        `Failed to find plugin auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Finds multiple plugin auth entries
   */
  async function findPluginAuthsByKeys({
    userId,
    pluginKeys,
  }: FindPluginAuthsByKeysParams): Promise<IPluginAuth[]> {
    try {
      if (!pluginKeys || pluginKeys.length === 0) {
        return [];
      }

      return Array.from(pluginAuthStore.values()).filter(a =>
        a.userId === userId &&
        pluginKeys.includes(a.pluginKey)
      );
    } catch (error) {
      throw new Error(
        `Failed to find plugin auths: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Updates or creates a plugin auth entry
   */
  async function updatePluginAuth({
    userId,
    authField,
    pluginKey,
    value,
  }: UpdatePluginAuthParams): Promise<IPluginAuth> {
    try {
      let existing = Array.from(pluginAuthStore.values()).find(a =>
         a.userId === userId && a.pluginKey === pluginKey && a.authField === authField
      );

      if (existing) {
        existing.value = value;
        pluginAuthStore.set(existing._id as string, existing);
        return existing;
      } else {
        const id = nanoid();
        const newAuth: IPluginAuth = {
          _id: id,
          userId,
          authField,
          value,
          pluginKey,
        } as any;
        pluginAuthStore.set(id, newAuth);
        return newAuth;
      }
    } catch (error) {
      throw new Error(
        `Failed to update plugin auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Deletes plugin auth entries
   */
  async function deletePluginAuth({
    userId,
    authField,
    pluginKey,
    all = false,
  }: DeletePluginAuthParams): Promise<any> {
    try {
      let deletedCount = 0;
      for (const [id, auth] of pluginAuthStore.entries()) {
        if (all) {
           if (auth.userId === userId && (!pluginKey || auth.pluginKey === pluginKey)) {
              pluginAuthStore.delete(id);
              deletedCount++;
           }
        } else {
           if (auth.userId === userId && auth.authField === authField) {
              pluginAuthStore.delete(id);
              deletedCount++;
              break;
           }
        }
      }
      return { deletedCount };
    } catch (error) {
      throw new Error(
        `Failed to delete plugin auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Deletes all plugin auth entries for a user
   */
  async function deleteAllUserPluginAuths(userId: string): Promise<any> {
    try {
      let deletedCount = 0;
      for (const [id, auth] of pluginAuthStore.entries()) {
        if (auth.userId === userId) {
          pluginAuthStore.delete(id);
          deletedCount++;
        }
      }
      return { deletedCount };
    } catch (error) {
      throw new Error(
        `Failed to delete all user plugin auths: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    findOnePluginAuth,
    findPluginAuthsByKeys,
    updatePluginAuth,
    deletePluginAuth,
    deleteAllUserPluginAuths,
  };
}

export type PluginAuthMethods = ReturnType<typeof createPluginAuthMethods>;
