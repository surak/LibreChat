import { ErrorTypes } from 'librechat-data-provider';
import { encrypt, decrypt } from '~/crypto';
import logger from '~/config/winston';

const keyStore = new Map<string, any>();

// Factory function that returns the key methods
export function createKeyMethods() {
  /**
   * Retrieves and decrypts the key value for a given user identified by userId and identifier name.
   */
  async function getUserKey(params: { userId: string; name: string }): Promise<string> {
    const { userId, name } = params;
    const key = Array.from(keyStore.values()).find(k => k.userId === userId && k.name === name);
    if (!key) {
      throw new Error(
        JSON.stringify({
          type: ErrorTypes.NO_USER_KEY,
        }),
      );
    }
    return await decrypt(key.value);
  }

  /**
   * Retrieves, decrypts, and parses the key values for a given user identified by userId and name.
   */
  async function getUserKeyValues(params: {
    userId: string;
    name: string;
  }): Promise<Record<string, string>> {
    const { userId, name } = params;
    const userValues = await getUserKey({ userId, name });
    try {
      return JSON.parse(userValues) as Record<string, string>;
    } catch (e) {
      logger.error('[getUserKeyValues]', e);
      throw new Error(
        JSON.stringify({
          type: ErrorTypes.INVALID_USER_KEY,
        }),
      );
    }
  }

  /**
   * Retrieves the expiry information of a user's key identified by userId and name.
   */
  async function getUserKeyExpiry(params: {
    userId: string;
    name: string;
  }): Promise<{ expiresAt: Date | 'never' | null }> {
    const { userId, name } = params;
    const key = Array.from(keyStore.values()).find(k => k.userId === userId && k.name === name);
    if (!key) {
      return { expiresAt: null };
    }
    return { expiresAt: key.expiresAt || 'never' };
  }

  /**
   * Updates or inserts a new key.
   */
  async function updateUserKey(params: {
    userId: string;
    name: string;
    value: string;
    expiresAt?: Date | null;
  }): Promise<unknown> {
    const { userId, name, value, expiresAt = null } = params;
    const encryptedValue = await encrypt(value);
    const keyId = `${userId}_${name}`;
    const updateObject: any = {
      userId,
      name,
      value: encryptedValue,
      updatedAt: new Date().toISOString()
    };
    if (expiresAt) {
      updateObject.expiresAt = new Date(expiresAt);
    }

    keyStore.set(keyId, updateObject);
    return updateObject;
  }

  /**
   * Deletes a key or all keys for a given user.
   */
  async function deleteUserKey(params: {
    userId: string;
    name?: string;
    all?: boolean;
  }): Promise<unknown> {
    const { userId, name, all = false } = params;
    if (all) {
      let count = 0;
      for (const [id, key] of keyStore.entries()) {
        if (key.userId === userId) {
          keyStore.delete(id);
          count++;
        }
      }
      return { deletedCount: count };
    }
    const keyId = `${userId}_${name}`;
    const deleted = keyStore.get(keyId);
    keyStore.delete(keyId);
    return deleted;
  }

  return {
    getUserKey,
    updateUserKey,
    deleteUserKey,
    getUserKeyValues,
    getUserKeyExpiry,
  };
}

export type KeyMethods = ReturnType<typeof createKeyMethods>;
