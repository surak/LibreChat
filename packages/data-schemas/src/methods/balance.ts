import type { IBalance } from '~/types';
import { nanoid } from 'nanoid';

const balanceStore = new Map<string, IBalance>();

export function createBalanceMethods() {
  async function findOneBalance(filter: any = {}) {
    const balances = Array.from(balanceStore.values());
    return balances.find(b => {
      for (const key in filter) {
        if ((b as any)[key] !== filter[key]) return false;
      }
      return true;
    }) || null;
  }

  async function findOneAndUpdateBalance(filter: any, update: any, options: any = {}) {
    let balance = await findOneBalance(filter);
    if (!balance) {
      if (options.upsert) {
        const id = nanoid();
        balance = {
          _id: id,
          user: filter.user,
          tokenCredits: 0,
          autoRefillEnabled: false,
          refillIntervalValue: 1,
          refillIntervalUnit: 'days',
          lastRefill: new Date(),
          refillAmount: 0,
        } as any;
        balanceStore.set(id, balance!);
      } else {
        return null;
      }
    }

    const data = update.$set || update;
    Object.assign(balance, data);
    return balance;
  }

  return {
    findOneBalance,
    findOneAndUpdateBalance,
  };
}

export type BalanceMethods = ReturnType<typeof createBalanceMethods>;
