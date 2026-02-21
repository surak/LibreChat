import { nanoid } from 'nanoid';

const promptStore = new Map<string, any>();
const promptGroupStore = new Map<string, any>();

export function createPromptMethods() {
  async function findPrompts(filter: any = {}) {
    return Array.from(promptStore.values()).filter(p => {
      for (const key in filter) {
        if (p[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async function findOnePrompt(filter: any = {}) {
    const prompts = await findPrompts(filter);
    return prompts[0] || null;
  }

  async function findOneAndUpdatePrompt(filter: any, update: any, options: any = {}) {
    let prompt = await findOnePrompt(filter);
    if (!prompt) {
      if (options.upsert) {
        const id = nanoid();
        prompt = {
          _id: id,
          ...filter,
          ...update,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        promptStore.set(id, prompt);
        return prompt;
      }
      return null;
    }

    const data = update.$set || update;
    Object.assign(prompt, data);
    prompt.updatedAt = new Date();
    return prompt;
  }

  async function createPrompt(data: any) {
    const id = nanoid();
    const newPrompt = {
      _id: id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    promptStore.set(id, newPrompt);
    return newPrompt;
  }

  async function findPromptGroups(filter: any = {}) {
    return Array.from(promptGroupStore.values()).filter(pg => {
      for (const key in filter) {
        const filterVal = filter[key];
        const groupVal = pg[key];
        if (typeof filterVal === 'object' && filterVal !== null) {
          if (filterVal.$in && Array.isArray(filterVal.$in)) {
             if (!filterVal.$in.includes(groupVal)) return false;
             continue;
          }
        } else if (groupVal !== filterVal) {
          return false;
        }
      }
      return true;
    });
  }

  async function findOnePromptGroup(filter: any = {}) {
    const groups = await findPromptGroups(filter);
    return groups[0] || null;
  }

  async function createPromptGroup(data: any) {
    const id = nanoid();
    const newGroup = {
      _id: id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    promptGroupStore.set(id, newGroup);
    return newGroup;
  }

  async function findOneAndUpdatePromptGroup(filter: any, update: any, options: any = {}) {
    let group = await findOnePromptGroup(filter);
    if (!group) {
      if (options.upsert) {
        return await createPromptGroup({ ...filter, ...update });
      }
      return null;
    }
    const data = update.$set || update;
    Object.assign(group, data);
    group.updatedAt = new Date();
    return group;
  }

  async function deleteManyPrompts(filter: any) {
    const prompts = await findPrompts(filter);
    for (const prompt of prompts) {
      promptStore.delete(prompt._id);
    }
    return { deletedCount: prompts.length };
  }

  async function deleteOnePromptGroup(filter: any) {
    const group = await findOnePromptGroup(filter);
    if (group) {
      promptGroupStore.delete(group._id);
    }
    return group;
  }

  return {
    findPrompts,
    findOnePrompt,
    createPrompt,
    findOneAndUpdatePrompt,
    deleteManyPrompts,
    findPromptGroups,
    findOnePromptGroup,
    createPromptGroup,
    findOneAndUpdatePromptGroup,
    deleteOnePromptGroup,
  };
}

export type PromptMethods = ReturnType<typeof createPromptMethods>;
