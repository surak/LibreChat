const { logger } = require('@librechat/data-schemas');
const { conversationTag: ConversationTag, conversation: Conversation } = require('./index');

/**
 * Retrieves all conversation tags for a user.
 * @param {string} user - The user ID.
 * @returns {Promise<Array>} An array of conversation tags.
 */
const getConversationTags = async (user) => {
  try {
    const tags = await ConversationTag.find({ user });
    return tags.sort((a, b) => (a.position || 0) - (b.position || 0));
  } catch (error) {
    logger.error('[getConversationTags] Error getting conversation tags', error);
    throw new Error('Error getting conversation tags');
  }
};

/**
 * Creates a new conversation tag.
 * @param {string} user - The user ID.
 * @param {Object} data - The tag data.
 * @param {string} data.tag - The tag name.
 * @param {string} [data.description] - The tag description.
 * @param {boolean} [data.addToConversation] - Whether to add the tag to a conversation.
 * @param {string} [data.conversationId] - The conversation ID to add the tag to.
 * @returns {Promise<Object>} The created tag.
 */
const createConversationTag = async (user, data) => {
  try {
    const { tag, description, addToConversation, conversationId } = data;

    const existingTag = await ConversationTag.findOne({ user, tag });
    if (existingTag) {
      return existingTag;
    }

    const tags = await ConversationTag.find({ user });
    const position = tags.length > 0 ? Math.max(...tags.map(t => t.position || 0)) + 1 : 1;

    const newTag = await ConversationTag.create({
        tag,
        user,
        count: addToConversation ? 1 : 0,
        position,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    if (addToConversation && conversationId) {
      const convo = await Conversation.findOne({ user, conversationId });
      if (convo) {
         convo.tags = convo.tags || [];
         if (!convo.tags.includes(tag)) {
            convo.tags.push(tag);
         }
      }
    }

    return newTag;
  } catch (error) {
    logger.error('[createConversationTag] Error creating conversation tag', error);
    throw new Error('Error creating conversation tag');
  }
};

/**
 * Updates an existing conversation tag.
 * @param {string} user - The user ID.
 * @param {string} oldTag - The current tag name.
 * @param {Object} data - The updated tag data.
 * @param {string} [data.tag] - The new tag name.
 * @param {string} [data.description] - The updated description.
 * @param {number} [data.position] - The new position.
 * @returns {Promise<Object>} The updated tag.
 */
const updateConversationTag = async (user, oldTag, data) => {
  try {
    const { tag: newTag, description, position } = data;

    const existingTag = await ConversationTag.findOne({ user, tag: oldTag });
    if (!existingTag) {
      return null;
    }

    if (newTag && newTag !== oldTag) {
      const tagAlreadyExists = await ConversationTag.findOne({ user, tag: newTag });
      if (tagAlreadyExists) {
        throw new Error('Tag already exists');
      }

      // Update tags in conversations
      const conversations = await Conversation.find({ user, tags: oldTag });
      for (const convo of conversations) {
          convo.tags = convo.tags.map(t => t === oldTag ? newTag : t);
      }
    }

    if (newTag) {
      existingTag.tag = newTag;
    }
    if (description !== undefined) {
      existingTag.description = description;
    }
    if (position !== undefined) {
      existingTag.position = position;
    }
    existingTag.updatedAt = new Date();

    return existingTag;
  } catch (error) {
    logger.error('[updateConversationTag] Error updating conversation tag', error);
    throw new Error('Error updating conversation tag');
  }
};

/**
 * Deletes a conversation tag.
 * @param {string} user - The user ID.
 * @param {string} tag - The tag to delete.
 * @returns {Promise<Object>} The deleted tag.
 */
const deleteConversationTag = async (user, tag) => {
  try {
    const deletedTag = await ConversationTag.findOneAndDelete({ user, tag });
    if (!deletedTag) {
      return null;
    }

    const conversations = await Conversation.find({ user, tags: tag });
    for (const convo of conversations) {
        convo.tags = convo.tags.filter(t => t !== tag);
    }

    return deletedTag;
  } catch (error) {
    logger.error('[deleteConversationTag] Error deleting conversation tag', error);
    throw new Error('Error deleting conversation tag');
  }
};

/**
 * Updates tags for a specific conversation.
 * @param {string} user - The user ID.
 * @param {string} conversationId - The conversation ID.
 * @param {string[]} tags - The new set of tags for the conversation.
 * @returns {Promise<string[]>} The updated list of tags for the conversation.
 */
const updateTagsForConversation = async (user, conversationId, tags) => {
  try {
    const conversation = await Conversation.findOne({ user, conversationId });
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const oldTags = new Set(conversation.tags || []);
    const newTags = new Set(tags);

    const addedTags = [...newTags].filter((tag) => !oldTags.has(tag));
    const removedTags = [...oldTags].filter((tag) => !newTags.has(tag));

    for (const tag of addedTags) {
        const t = await ConversationTag.findOne({ user, tag });
        if (t) {
            t.count = (t.count || 0) + 1;
        } else {
            await createConversationTag(user, { tag });
        }
    }

    for (const tag of removedTags) {
        const t = await ConversationTag.findOne({ user, tag });
        if (t) {
            t.count = Math.max(0, (t.count || 0) - 1);
        }
    }

    conversation.tags = [...newTags];
    conversation.updatedAt = new Date();

    return conversation.tags;
  } catch (error) {
    logger.error('[updateTagsForConversation] Error updating tags', error);
    throw new Error('Error updating tags for conversation');
  }
};

/**
 * Increments tag counts for existing tags only.
 * @param {string} user - The user ID.
 * @param {string[]} tags - Array of tag names to increment
 * @returns {Promise<void>}
 */
const bulkIncrementTagCounts = async (user, tags) => {
  if (!tags || tags.length === 0) {
    return;
  }

  try {
    const uniqueTags = [...new Set(tags.filter(Boolean))];
    for (const tag of uniqueTags) {
        const t = await ConversationTag.findOne({ user, tag });
        if (t) {
            t.count = (t.count || 0) + 1;
        }
    }
  } catch (error) {
    logger.error('[bulkIncrementTagCounts] Error incrementing tag counts', error);
  }
};

module.exports = {
  getConversationTags,
  createConversationTag,
  updateConversationTag,
  deleteConversationTag,
  bulkIncrementTagCounts,
  updateTagsForConversation,
};
