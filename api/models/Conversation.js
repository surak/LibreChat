const { logger } = require('@librechat/data-schemas');
const { createTempChatExpirationDate } = require('@librechat/api');
const { getMessages, deleteMessages } = require('./Message');
const { Conversation } = require('~/db/models');

// In-memory store for conversations
const conversationStore = new Map();
const MAX_CONVOS = 1000;

// Cleanup old conversations every 10 minutes to prevent memory leaks
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [id, convo] of conversationStore.entries()) {
    if (new Date(convo.updatedAt) < oneHourAgo) {
      conversationStore.delete(id);
    }
  }

  // Cap the total number of conversations in memory
  if (conversationStore.size > MAX_CONVOS) {
    const sorted = Array.from(conversationStore.entries()).sort((a, b) => new Date(a[1].updatedAt) - new Date(b[1].updatedAt));
    const toDelete = sorted.slice(0, conversationStore.size - MAX_CONVOS);
    for (const [id] of toDelete) {
      conversationStore.delete(id);
    }
  }
}, 10 * 60 * 1000);

/**
 * Searches for a conversation by conversationId and returns a lean document with only conversationId and user.
 * @param {string} conversationId - The conversation's ID.
 * @returns {Promise<{conversationId: string, user: string} | null>} The conversation object with selected fields or null if not found.
 */
const searchConversation = async (conversationId) => {
  try {
    return conversationStore.get(conversationId);
  } catch (error) {
    logger.error('[searchConversation] Error searching conversation', error);
    throw new Error('Error searching conversation');
  }
};

/**
 * Retrieves a single conversation for a given user and conversation ID.
 * @param {string} user - The user's ID.
 * @param {string} conversationId - The conversation's ID.
 * @returns {Promise<TConversation>} The conversation object.
 */
const getConvo = async (user, conversationId) => {
  try {
    const convo = conversationStore.get(conversationId);
    if (convo && convo.user === user) {
      return convo;
    }
    return null;
  } catch (error) {
    logger.error('[getConvo] Error getting single conversation', error);
    throw new Error('Error getting single conversation');
  }
};

const deleteNullOrEmptyConversations = async () => {
  try {
    let count = 0;
    for (const [id, convo] of conversationStore.entries()) {
      if (!convo.conversationId) {
        conversationStore.delete(id);
        count++;
      }
    }

    return {
      conversations: { deletedCount: count },
      messages: { deletedCount: 0 },
    };
  } catch (error) {
    logger.error('[deleteNullOrEmptyConversations] Error deleting conversations', error);
    throw new Error('Error deleting conversations with null or empty conversationId');
  }
};

/**
 * Searches for a conversation by conversationId and returns associated file ids.
 * @param {string} conversationId - The conversation's ID.
 * @returns {Promise<string[] | null>}
 */
const getConvoFiles = async (conversationId) => {
  try {
    return conversationStore.get(conversationId)?.files ?? [];
  } catch (error) {
    logger.error('[getConvoFiles] Error getting conversation files', error);
    throw new Error('Error getting conversation files');
  }
};

module.exports = {
  getConvoFiles,
  searchConversation,
  deleteNullOrEmptyConversations,
  /**
   * Saves a conversation to the database.
   * @param {Object} req - The request object.
   * @param {string} conversationId - The conversation's ID.
   * @param {Object} metadata - Additional metadata to log for operation.
   * @returns {Promise<TConversation>} The conversation object.
   */
  saveConvo: async (req, { conversationId, newConversationId, ...convo }, metadata) => {
    try {
      if (metadata?.context) {
        logger.debug(`[saveConvo] ${metadata.context}`);
      }

      const targetId = newConversationId || conversationId;
      const update = {
        ...convo,
        conversationId: targetId,
        user: req.user.id,
        updatedAt: new Date(),
        createdAt: convo.createdAt || new Date(),
      };

      conversationStore.set(targetId, update);
      return update;
    } catch (error) {
      logger.error('[saveConvo] Error saving conversation', error);
      if (metadata && metadata?.context) {
        logger.info(`[saveConvo] ${metadata.context}`);
      }
      return { message: 'Error saving conversation' };
    }
  },
  bulkSaveConvos: async (conversations) => {
    for (const convo of conversations) {
      conversationStore.set(convo.conversationId, {
        ...convo,
        updatedAt: new Date(),
        createdAt: convo.createdAt || new Date(),
      });
    }
    return { nInserted: conversations.length };
  },
  getConvosByCursor: async () => {
    return { conversations: [], nextCursor: null };
  },
  getConvosQueried: async () => {
    return { conversations: [], nextCursor: null, convoMap: {} };
  },
  getConvo,
  /* chore: this method is not properly error handled */
  getConvoTitle: async (user, conversationId) => {
    try {
      const convo = await getConvo(user, conversationId);
      /* ChatGPT Browser was triggering error here due to convo being saved later */
      if (convo && !convo.title) {
        return null;
      } else {
        // TypeError: Cannot read properties of null (reading 'title')
        return convo?.title || 'New Chat';
      }
    } catch (error) {
      logger.error('[getConvoTitle] Error getting conversation title', error);
      throw new Error('Error getting conversation title');
    }
  },
  /**
   * Asynchronously deletes conversations and associated messages for a given user and filter.
   *
   * @async
   * @function
   * @param {string|ObjectId} user - The user's ID.
   * @param {Object} filter - Additional filter criteria for the conversations to be deleted.
   * @returns {Promise<{ n: number, ok: number, deletedCount: number, messages: { n: number, ok: number, deletedCount: number } }>}
   *          An object containing the count of deleted conversations and associated messages.
   * @throws {Error} Throws an error if there's an issue with the database operations.
   *
   * @example
   * const user = 'someUserId';
   * const filter = { someField: 'someValue' };
   * const result = await deleteConvos(user, filter);
   * logger.error(result); // { n: 5, ok: 1, deletedCount: 5, messages: { n: 10, ok: 1, deletedCount: 10 } }
   */
  deleteConvos: async (user, filter) => {
    try {
      let count = 0;
      const conversationIds = [];
      for (const [id, convo] of conversationStore.entries()) {
        if (convo.user === user) {
          let match = true;
          for (const key in filter) {
            const filterVal = filter[key];
            const convoVal = convo[key];

            if (typeof filterVal === 'object' && filterVal !== null) {
               // handle common operators if needed, but deleteConvos filter is usually simple
               if (filterVal.$in && Array.isArray(filterVal.$in)) {
                 if (!filterVal.$in.includes(convoVal)) { match = false; break; }
                 continue;
               }
            } else if (convoVal !== filterVal) {
              match = false;
              break;
            }
          }
          if (match) {
            conversationIds.push(convo.conversationId);
            conversationStore.delete(id);
            count++;
          }
        }
      }

      const deleteMessagesResult = await deleteMessages({
        conversationId: { $in: conversationIds },
      });

      return { deletedCount: count, messages: deleteMessagesResult };
    } catch (error) {
      logger.error('[deleteConvos] Error deleting conversations and messages', error);
      throw error;
    }
  },
};
