import type {
  AgentApiKeyCreateResult,
  AgentApiKeyCreateData,
  AgentApiKeyListItem,
  IAgentApiKey,
} from '~/types';
import { hashToken, getRandomValues } from '~/crypto';
import logger from '~/config/winston';
import { nanoid } from 'nanoid';

const API_KEY_PREFIX = 'sk-';
const API_KEY_LENGTH = 32;

const agentApiKeyStore = new Map<string, IAgentApiKey>();

// Factory function that returns the methods
export function createAgentApiKeyMethods() {
  async function generateApiKey(): Promise<{ key: string; keyHash: string; keyPrefix: string }> {
    const randomPart = await getRandomValues(API_KEY_LENGTH);
    const key = `${API_KEY_PREFIX}${randomPart}`;
    const keyHash = await hashToken(key);
    const keyPrefix = key.slice(0, 8);
    return { key, keyHash, keyPrefix };
  }

  async function createAgentApiKey(data: AgentApiKeyCreateData): Promise<AgentApiKeyCreateResult> {
    try {
      const { key, keyHash, keyPrefix } = await generateApiKey();
      const id = nanoid();
      const createdAt = new Date().toISOString();

      const apiKeyDoc: IAgentApiKey = {
        _id: id,
        userId: data.userId,
        name: data.name,
        keyHash,
        keyPrefix,
        createdAt,
        expiresAt: data.expiresAt || undefined,
      } as any;

      agentApiKeyStore.set(id, apiKeyDoc);

      return {
        id,
        name: apiKeyDoc.name,
        keyPrefix,
        key,
        createdAt: apiKeyDoc.createdAt as any,
        expiresAt: apiKeyDoc.expiresAt as any,
      };
    } catch (error) {
      logger.error('[createAgentApiKey] Error creating API key:', error);
      throw error;
    }
  }

  async function validateAgentApiKey(
    apiKey: string,
  ): Promise<{ userId: string; keyId: string } | null> {
    try {
      const keyHash = await hashToken(apiKey);
      const keyDoc = Array.from(agentApiKeyStore.values()).find(k => k.keyHash === keyHash);

      if (!keyDoc) {
        return null;
      }

      if (keyDoc.expiresAt && new Date(keyDoc.expiresAt) < new Date()) {
        return null;
      }

      keyDoc.lastUsedAt = new Date().toISOString() as any;
      agentApiKeyStore.set(keyDoc._id as string, keyDoc);

      return {
        userId: keyDoc.userId as string,
        keyId: keyDoc._id as string,
      };
    } catch (error) {
      logger.error('[validateAgentApiKey] Error validating API key:', error);
      return null;
    }
  }

  async function listAgentApiKeys(userId: string): Promise<AgentApiKeyListItem[]> {
    try {
      const keys = Array.from(agentApiKeyStore.values())
        .filter(k => k.userId === userId)
        .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());

      return keys.map((key) => ({
        id: key._id as string,
        name: key.name,
        keyPrefix: key.keyPrefix,
        lastUsedAt: key.lastUsedAt as any,
        expiresAt: key.expiresAt as any,
        createdAt: key.createdAt as any,
      }));
    } catch (error) {
      logger.error('[listAgentApiKeys] Error listing API keys:', error);
      throw error;
    }
  }

  async function deleteAgentApiKey(
    keyId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const key = agentApiKeyStore.get(keyId);
      if (key && key.userId === userId) {
        return agentApiKeyStore.delete(keyId);
      }
      return false;
    } catch (error) {
      logger.error('[deleteAgentApiKey] Error deleting API key:', error);
      throw error;
    }
  }

  async function deleteAllAgentApiKeys(userId: string): Promise<number> {
    try {
      let count = 0;
      for (const [id, key] of agentApiKeyStore.entries()) {
        if (key.userId === userId) {
          agentApiKeyStore.delete(id);
          count++;
        }
      }
      return count;
    } catch (error) {
      logger.error('[deleteAllAgentApiKeys] Error deleting all API keys:', error);
      throw error;
    }
  }

  async function getAgentApiKeyById(
    keyId: string,
    userId: string,
  ): Promise<AgentApiKeyListItem | null> {
    try {
      const keyDoc = agentApiKeyStore.get(keyId);
      if (!keyDoc || keyDoc.userId !== userId) {
        return null;
      }

      return {
        id: keyDoc._id as string,
        name: keyDoc.name,
        keyPrefix: keyDoc.keyPrefix,
        lastUsedAt: keyDoc.lastUsedAt as any,
        expiresAt: keyDoc.expiresAt as any,
        createdAt: keyDoc.createdAt as any,
      };
    } catch (error) {
      logger.error('[getAgentApiKeyById] Error getting API key:', error);
      throw error;
    }
  }

  return {
    createAgentApiKey,
    validateAgentApiKey,
    listAgentApiKeys,
    deleteAgentApiKey,
    deleteAllAgentApiKeys,
    getAgentApiKeyById,
  };
}

export type AgentApiKeyMethods = ReturnType<typeof createAgentApiKeyMethods>;
