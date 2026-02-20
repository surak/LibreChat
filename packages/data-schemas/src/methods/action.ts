import { nanoid } from 'nanoid';

const actionStore = new Map<string, any>();

export function createActionMethods() {
  async function findActions(filter: any = {}) {
    return Array.from(actionStore.values()).filter(a => {
      for (const key in filter) {
        if (a[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async function findOneAction(filter: any = {}) {
    const actions = await findActions(filter);
    return actions[0] || null;
  }

  async function findOneAndUpdateAction(filter: any, update: any, options: any = {}) {
    let action = await findOneAction(filter);
    if (!action) {
      if (options.upsert) {
        const id = nanoid();
        action = {
          _id: id,
          ...filter,
          ...update,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        actionStore.set(id, action);
        return action;
      }
      return null;
    }

    const data = update.$set || update;
    Object.assign(action, data);
    action.updatedAt = new Date();
    return action;
  }

  async function findOneAndDeleteAction(filter: any) {
    const action = await findOneAction(filter);
    if (action) {
      actionStore.delete(action._id);
    }
    return action;
  }

  async function deleteManyActions(filter: any) {
    const actions = await findActions(filter);
    for (const action of actions) {
      actionStore.delete(action._id);
    }
    return { deletedCount: actions.length };
  }

  return {
    findActions,
    findOneAction,
    findOneAndUpdateAction,
    findOneAndDeleteAction,
    deleteManyActions,
  };
}

export type ActionMethods = ReturnType<typeof createActionMethods>;
