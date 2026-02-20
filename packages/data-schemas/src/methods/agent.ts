import { nanoid } from 'nanoid';

const agentStore = new Map<string, any>();

export function createAgentMethods() {
  async function findAgents(filter: any = {}) {
    return Array.from(agentStore.values()).filter(a => {
      for (const key in filter) {
        const filterVal = filter[key];
        const agentVal = a[key];
        if (typeof filterVal === 'object' && filterVal !== null) {
          if (filterVal.$in && Array.isArray(filterVal.$in)) {
             if (!filterVal.$in.includes(agentVal)) return false;
             continue;
          }
          if (filterVal.$ne !== undefined && agentVal === filterVal.$ne) return false;
        } else if (agentVal !== filterVal) {
          return false;
        }
      }
      return true;
    });
  }

  async function findOneAgent(filter: any = {}) {
    const agents = await findAgents(filter);
    return agents[0] || null;
  }

  async function createAgent(data: any) {
    const id = nanoid();
    const newAgent = {
      _id: id,
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    agentStore.set(id, newAgent);
    return newAgent;
  }

  async function findOneAndUpdateAgent(filter: any, update: any, options: any = {}) {
    let agent = await findOneAgent(filter);
    if (!agent) {
      if (options.upsert) {
        return await createAgent({ ...filter, ...update });
      }
      return null;
    }
    const data = update.$set || update;
    Object.assign(agent, data);
    agent.updatedAt = new Date();
    return agent;
  }

  async function deleteOneAgent(filter: any) {
    const agent = await findOneAgent(filter);
    if (agent) {
      agentStore.delete(agent._id);
    }
    return agent;
  }

  async function countAgents(filter: any = {}) {
    const agents = await findAgents(filter);
    return agents.length;
  }

  return {
    findAgents,
    findOneAgent,
    createAgent,
    findOneAndUpdateAgent,
    deleteOneAgent,
    countAgents,
  };
}

export type AgentMethods = ReturnType<typeof createAgentMethods>;
