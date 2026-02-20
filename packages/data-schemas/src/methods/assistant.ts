import { nanoid } from 'nanoid';

const assistantStore = new Map<string, any>();

export function createAssistantMethods() {
  async function findAssistants(filter: any = {}) {
    return Array.from(assistantStore.values()).filter(a => {
      for (const key in filter) {
        if (a[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async function findOneAssistant(filter: any = {}) {
    const assistants = await findAssistants(filter);
    return assistants[0] || null;
  }

  async function findOneAndUpdateAssistant(filter: any, update: any, options: any = {}) {
    let assistant = await findOneAssistant(filter);
    if (!assistant) {
      if (options.upsert) {
        const id = nanoid();
        assistant = {
          _id: id,
          ...filter,
          ...update,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        assistantStore.set(id, assistant);
        return assistant;
      }
      return null;
    }

    const data = update.$set || update;
    Object.assign(assistant, data);
    assistant.updatedAt = new Date();
    return assistant;
  }

  async function findOneAndDeleteAssistant(filter: any) {
    const assistant = await findOneAssistant(filter);
    if (assistant) {
      assistantStore.delete(assistant._id);
    }
    return assistant;
  }

  async function deleteManyAssistants(filter: any) {
    const assistants = await findAssistants(filter);
    for (const assistant of assistants) {
      assistantStore.delete(assistant._id);
    }
    return { deletedCount: assistants.length };
  }

  return {
    findAssistants,
    findOneAssistant,
    findOneAndUpdateAssistant,
    findOneAndDeleteAssistant,
    deleteManyAssistants,
  };
}

export type AssistantMethods = ReturnType<typeof createAssistantMethods>;
