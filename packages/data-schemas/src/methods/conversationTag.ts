import { nanoid } from 'nanoid';

const conversationTagStore = new Map<string, any>();

export function createConversationTagMethods() {
  async function findConversationTags(filter: any = {}) {
    return Array.from(conversationTagStore.values()).filter(t => {
      for (const key in filter) {
        if (t[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async function findOneConversationTag(filter: any = {}) {
    const tags = await findConversationTags(filter);
    return tags[0] || null;
  }

  async function createConversationTag(data: any) {
    const id = nanoid();
    const newTag = {
      _id: id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    conversationTagStore.set(id, newTag);
    return newTag;
  }

  async function deleteManyConversationTags(filter: any) {
    const tags = await findConversationTags(filter);
    for (const tag of tags) {
      conversationTagStore.delete(tag._id);
    }
    return { deletedCount: tags.length };
  }

  return {
    findConversationTags,
    findOneConversationTag,
    createConversationTag,
    deleteManyConversationTags,
  };
}

export type ConversationTagMethods = ReturnType<typeof createConversationTagMethods>;
