import { nanoid } from 'nanoid';

const transactionStore = new Map<string, any>();

export function createTransactionMethods() {
  async function createTransaction(data: any) {
    const id = nanoid();
    const newTransaction = {
      _id: id,
      ...data,
      createdAt: new Date(),
    };
    transactionStore.set(id, newTransaction);
    return newTransaction;
  }

  async function findTransactions(filter: any = {}) {
    return Array.from(transactionStore.values()).filter(t => {
      for (const key in filter) {
        if (t[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async function findOneAndUpdateTransaction(filter: any, update: any) {
    const transactions = await findTransactions(filter);
    if (transactions.length === 0) return null;
    const transaction = transactions[0];
    const data = update.$set || update;
    Object.assign(transaction, data);
    return transaction;
  }

  return {
    createTransaction,
    findTransactions,
    findOneAndUpdateTransaction,
  };
}

export type TransactionMethods = ReturnType<typeof createTransactionMethods>;
