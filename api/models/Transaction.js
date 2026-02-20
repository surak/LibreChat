const { logger } = require('@librechat/data-schemas');
const { getMultiplier, getCacheMultiplier } = require('./tx');
const { transaction: Transaction, balance: Balance } = require('./index');

const cancelRate = 1.15;

/**
 * Updates a user's token balance based on a transaction
 * @async
 * @function
 * @param {Object} params - The function parameters.
 * @param {string} params.user - The user ID.
 * @param {number} params.incrementValue - The value to increment the balance by (can be negative).
 * @param {Object} [params.setValues] - Optional additional fields to set.
 * @returns {Promise<Object>} Returns the updated balance document.
 */
const updateBalance = async ({ user, incrementValue, setValues }) => {
  const currentBalanceDoc = await Balance.findOne({ user });
  const currentCredits = currentBalanceDoc ? currentBalanceDoc.tokenCredits : 0;

  const potentialNewCredits = currentCredits + incrementValue;
  const newCredits = Math.max(0, potentialNewCredits);

  const updatePayload = {
    tokenCredits: newCredits,
    ...(setValues || {}),
  };

  const updatedBalance = await Balance.findOneAndUpdate(
    { user },
    { $set: updatePayload },
    { upsert: true }
  );

  return updatedBalance;
};

/** Method to calculate and set the tokenValue for a transaction */
function calculateTokenValue(txn) {
  const { valueKey, tokenType, model, endpointTokenConfig, inputTokenCount } = txn;
  const multiplier = Math.abs(
    getMultiplier({ valueKey, tokenType, model, endpointTokenConfig, inputTokenCount }),
  );
  txn.rate = multiplier;
  txn.tokenValue = txn.rawAmount * multiplier;
  if (txn.context && txn.tokenType === 'completion' && txn.context === 'incomplete') {
    txn.tokenValue = Math.ceil(txn.tokenValue * cancelRate);
    txn.rate *= cancelRate;
  }
}

/**
 * New static method to create an auto-refill transaction that does NOT trigger a balance update.
 * @param {object} txData - Transaction data.
 * @returns {Promise<object>} - The created transaction.
 */
async function createAutoRefillTransaction(txData) {
  if (txData.rawAmount != null && isNaN(txData.rawAmount)) {
    return;
  }
  const transaction = await Transaction.create(txData);
  transaction.endpointTokenConfig = txData.endpointTokenConfig;
  transaction.inputTokenCount = txData.inputTokenCount;
  calculateTokenValue(transaction);
  await Transaction.findOneAndUpdate({ _id: transaction._id }, transaction);

  const balanceResponse = await updateBalance({
    user: transaction.user,
    incrementValue: txData.rawAmount,
    setValues: { lastRefill: new Date() },
  });
  const result = {
    rate: transaction.rate,
    user: transaction.user.toString(),
    balance: balanceResponse.tokenCredits,
  };
  logger.debug('[Balance.check] Auto-refill performed', result);
  result.transaction = transaction;
  return result;
}

/**
 * Static method to create a transaction and update the balance
 * @param {txData} _txData - Transaction data.
 */
async function createTransaction(_txData) {
  const { balance, transactions, ...txData } = _txData;
  if (txData.rawAmount != null && isNaN(txData.rawAmount)) {
    return;
  }

  if (transactions?.enabled === false) {
    return;
  }

  const transaction = await Transaction.create(txData);
  transaction.endpointTokenConfig = txData.endpointTokenConfig;
  transaction.inputTokenCount = txData.inputTokenCount;
  calculateTokenValue(transaction);
  await Transaction.findOneAndUpdate({ _id: transaction._id }, transaction);

  if (!balance?.enabled) {
    return;
  }

  let incrementValue = transaction.tokenValue;
  const balanceResponse = await updateBalance({
    user: transaction.user,
    incrementValue,
  });

  return {
    rate: transaction.rate,
    user: transaction.user.toString(),
    balance: balanceResponse.tokenCredits,
    [transaction.tokenType]: incrementValue,
  };
}

/**
 * Static method to create a structured transaction and update the balance
 * @param {txData} _txData - Transaction data.
 */
async function createStructuredTransaction(_txData) {
  const { balance, transactions, ...txData } = _txData;
  if (transactions?.enabled === false) {
    return;
  }

  const transaction = await Transaction.create(txData);
  transaction.endpointTokenConfig = txData.endpointTokenConfig;
  transaction.inputTokenCount = txData.inputTokenCount;

  calculateStructuredTokenValue(transaction);
  await Transaction.findOneAndUpdate({ _id: transaction._id }, transaction);

  if (!balance?.enabled) {
    return;
  }

  let incrementValue = transaction.tokenValue;

  const balanceResponse = await updateBalance({
    user: transaction.user,
    incrementValue,
  });

  return {
    rate: transaction.rate,
    user: transaction.user.toString(),
    balance: balanceResponse.tokenCredits,
    [transaction.tokenType]: incrementValue,
  };
}

/** Method to calculate token value for structured tokens */
function calculateStructuredTokenValue(txn) {
  if (!txn.tokenType) {
    txn.tokenValue = txn.rawAmount;
    return;
  }

  const { model, endpointTokenConfig, inputTokenCount } = txn;

  if (txn.tokenType === 'prompt') {
    const inputMultiplier = getMultiplier({
      tokenType: 'prompt',
      model,
      endpointTokenConfig,
      inputTokenCount,
    });
    const writeMultiplier =
      getCacheMultiplier({ cacheType: 'write', model, endpointTokenConfig }) ?? inputMultiplier;
    const readMultiplier =
      getCacheMultiplier({ cacheType: 'read', model, endpointTokenConfig }) ?? inputMultiplier;

    txn.rateDetail = {
      input: inputMultiplier,
      write: writeMultiplier,
      read: readMultiplier,
    };

    const totalPromptTokens =
      Math.abs(txn.inputTokens || 0) +
      Math.abs(txn.writeTokens || 0) +
      Math.abs(txn.readTokens || 0);

    if (totalPromptTokens > 0) {
      txn.rate =
        (Math.abs(inputMultiplier * (txn.inputTokens || 0)) +
          Math.abs(writeMultiplier * (txn.writeTokens || 0)) +
          Math.abs(readMultiplier * (txn.readTokens || 0))) /
        totalPromptTokens;
    } else {
      txn.rate = Math.abs(inputMultiplier); // Default to input rate if no tokens
    }

    txn.tokenValue = -(
      Math.abs(txn.inputTokens || 0) * inputMultiplier +
      Math.abs(txn.writeTokens || 0) * writeMultiplier +
      Math.abs(txn.readTokens || 0) * readMultiplier
    );

    txn.rawAmount = -totalPromptTokens;
  } else if (txn.tokenType === 'completion') {
    const multiplier = getMultiplier({
      tokenType: txn.tokenType,
      model,
      endpointTokenConfig,
      inputTokenCount,
    });
    txn.rate = Math.abs(multiplier);
    txn.tokenValue = -Math.abs(txn.rawAmount) * multiplier;
    txn.rawAmount = -Math.abs(txn.rawAmount);
  }

  if (txn.context && txn.tokenType === 'completion' && txn.context === 'incomplete') {
    txn.tokenValue = Math.ceil(txn.tokenValue * cancelRate);
    txn.rate *= cancelRate;
    if (txn.rateDetail) {
      txn.rateDetail = Object.fromEntries(
        Object.entries(txn.rateDetail).map(([k, v]) => [k, v * cancelRate]),
      );
    }
  }
}

/**
 * Queries and retrieves transactions based on a given filter.
 * @async
 * @function getTransactions
 * @param {Object} filter - filter object to apply when querying transactions.
 * @returns {Promise<Array>} A promise that resolves to an array of matched transactions.
 * @throws {Error} Throws an error if querying fails.
 */
async function getTransactions(filter) {
  try {
    return await Transaction.find(filter);
  } catch (error) {
    logger.error('Error querying transactions:', error);
    throw error;
  }
}

module.exports = {
  getTransactions,
  createTransaction,
  createAutoRefillTransaction,
  createStructuredTransaction,
};
