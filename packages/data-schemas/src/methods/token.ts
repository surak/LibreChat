import { IToken, TokenCreateData, TokenQuery, TokenUpdateData, TokenDeleteResult } from '~/types';
import logger from '~/config/winston';
import { nanoid } from 'nanoid';

const tokenStore = new Map<string, IToken>();

// Factory function that returns the methods
export function createTokenMethods() {
  /**
   * Creates a new Token instance.
   */
  async function createToken(tokenData: TokenCreateData): Promise<IToken> {
    try {
      const currentTime = new Date();
      const expiresAt = new Date(currentTime.getTime() + tokenData.expiresIn * 1000);

      const tokenId = nanoid();
      const newToken: IToken = {
        _id: tokenId,
        ...tokenData,
        createdAt: currentTime,
        expiresAt,
      } as any;

      tokenStore.set(tokenId, newToken);
      return newToken;
    } catch (error) {
      logger.debug('An error occurred while creating token:', error);
      throw error;
    }
  }

  /**
   * Updates a Token document that matches the provided query.
   */
  async function updateToken(
    query: TokenQuery,
    updateData: TokenUpdateData,
  ): Promise<IToken | null> {
    try {
      const tokenDoc = await findToken(query);
      if (!tokenDoc) return null;

      const dataToUpdate = { ...updateData };
      if (updateData?.expiresIn !== undefined) {
        dataToUpdate.expiresAt = new Date(Date.now() + updateData.expiresIn * 1000);
      }

      const updated = { ...tokenDoc, ...dataToUpdate };
      tokenStore.set(tokenDoc._id as string, updated);
      return updated;
    } catch (error) {
      logger.debug('An error occurred while updating token:', error);
      throw error;
    }
  }

  /**
   * Deletes all Token documents that match the provided token, user ID, or email.
   */
  async function deleteTokens(query: TokenQuery): Promise<TokenDeleteResult> {
    try {
      const conditions: any[] = [];
      if (query.userId !== undefined) conditions.push((t: any) => t.userId === query.userId);
      if (query.token !== undefined) conditions.push((t: any) => t.token === query.token);
      if (query.email !== undefined) conditions.push((t: any) => t.email === query.email?.trim().toLowerCase());
      if (query.identifier !== undefined) conditions.push((t: any) => t.identifier === query.identifier);

      if (conditions.length === 0) {
        throw new Error('At least one query parameter must be provided');
      }

      let deletedCount = 0;
      for (const [id, token] of tokenStore.entries()) {
         if (conditions.some(cond => cond(token))) {
            tokenStore.delete(id);
            deletedCount++;
         }
      }

      return { deletedCount } as any;
    } catch (error) {
      logger.debug('An error occurred while deleting tokens:', error);
      throw error;
    }
  }

  /**
   * Finds a Token document that matches the provided query.
   */
  async function findToken(query: TokenQuery, _options?: any): Promise<IToken | null> {
    try {
      const conditions: any[] = [];
      if (query.userId) conditions.push((t: any) => t.userId === query.userId);
      if (query.token) conditions.push((t: any) => t.token === query.token);
      if (query.email) conditions.push((t: any) => t.email === query.email?.trim().toLowerCase());
      if (query.identifier) conditions.push((t: any) => t.identifier === query.identifier);

      for (const token of tokenStore.values()) {
         if (conditions.every(cond => cond(token))) {
            return token;
         }
      }

      return null;
    } catch (error) {
      logger.debug('An error occurred while finding token:', error);
      throw error;
    }
  }

  // Return all methods
  return {
    findToken,
    createToken,
    updateToken,
    deleteTokens,
  };
}

export type TokenMethods = ReturnType<typeof createTokenMethods>;
