import logger from '~/config/winston';
import type * as t from '~/types';

/**
 * Formats a date in YYYY-MM-DD format
 */
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const memoryStore = new Map<string, t.IMemoryEntryLean>();

// Factory function that returns the methods
export function createMemoryMethods() {
  /**
   * Creates a new memory entry for a user
   */
  async function createMemory({
    userId,
    key,
    value,
    tokenCount = 0,
  }: t.SetMemoryParams): Promise<t.MemoryResult> {
    try {
      if (key?.toLowerCase() === 'nothing') {
        return { ok: false };
      }

      const id = `${userId}_${key}`;
      if (memoryStore.has(id)) {
        throw new Error('Memory with this key already exists');
      }

      memoryStore.set(id, {
        userId,
        key,
        value,
        tokenCount,
        updated_at: new Date().toISOString(),
      } as any);

      return { ok: true };
    } catch (error) {
      throw new Error(
        `Failed to create memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Sets or updates a memory entry for a user
   */
  async function setMemory({
    userId,
    key,
    value,
    tokenCount = 0,
  }: t.SetMemoryParams): Promise<t.MemoryResult> {
    try {
      if (key?.toLowerCase() === 'nothing') {
        return { ok: false };
      }

      const id = `${userId}_${key}`;
      memoryStore.set(id, {
        userId,
        key,
        value,
        tokenCount,
        updated_at: new Date().toISOString(),
      } as any);

      return { ok: true };
    } catch (error) {
      throw new Error(
        `Failed to set memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Deletes a specific memory entry for a user
   */
  async function deleteMemory({ userId, key }: t.DeleteMemoryParams): Promise<t.MemoryResult> {
    try {
      const id = `${userId}_${key}`;
      const ok = memoryStore.delete(id);
      return { ok };
    } catch (error) {
      throw new Error(
        `Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets all memory entries for a user
   */
  async function getAllUserMemories(
    userId: string,
  ): Promise<t.IMemoryEntryLean[]> {
    try {
      return Array.from(memoryStore.values()).filter(m => m.userId === userId);
    } catch (error) {
      throw new Error(
        `Failed to get all memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets and formats all memories for a user in two different formats
   */
  async function getFormattedMemories({
    userId,
  }: t.GetFormattedMemoriesParams): Promise<t.FormattedMemoriesResult> {
    try {
      const memories = await getAllUserMemories(userId);

      if (!memories || memories.length === 0) {
        return { withKeys: '', withoutKeys: '', totalTokens: 0 };
      }

      const sortedMemories = memories.sort(
        (a, b) => new Date(a.updated_at!).getTime() - new Date(b.updated_at!).getTime(),
      );

      const totalTokens = sortedMemories.reduce((sum, memory) => {
        return sum + (memory.tokenCount || 0);
      }, 0);

      const withKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          const tokenInfo = memory.tokenCount ? ` [${memory.tokenCount} tokens]` : '';
          return `${index + 1}. [${date}]. ["key": "${memory.key}"]${tokenInfo}. ["value": "${memory.value}"]`;
        })
        .join('\n\n');

      const withoutKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          return `${index + 1}. [${date}]. ${memory.value}`;
        })
        .join('\n\n');

      return { withKeys, withoutKeys, totalTokens };
    } catch (error) {
      logger.error('Failed to get formatted memories:', error);
      return { withKeys: '', withoutKeys: '', totalTokens: 0 };
    }
  }

  return {
    setMemory,
    createMemory,
    deleteMemory,
    getAllUserMemories,
    getFormattedMemories,
  };
}

export type MemoryMethods = ReturnType<typeof createMemoryMethods>;
