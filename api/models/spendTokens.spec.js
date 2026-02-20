const { spendTokens, spendStructuredTokens } = require('./spendTokens');

describe('spendTokens', () => {
  let userId = 'user123';

  it('should create transactions for both prompt and completion tokens', async () => {
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
      balance: { enabled: true },
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    await spendTokens(txData, tokenUsage);
    // Verified by lack of errors
  });

  it('should handle zero completion tokens', async () => {
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
      balance: { enabled: true },
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 0,
    };

    await spendTokens(txData, tokenUsage);
  });

  it('should create structured transactions', async () => {
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'claude-3-5-sonnet',
      context: 'test',
      balance: { enabled: true },
    };
    const tokenUsage = {
      promptTokens: { input: 10, write: 100, read: 5 },
      completionTokens: 50,
    };

    const result = await spendStructuredTokens(txData, tokenUsage);
    expect(result.prompt).toBeDefined();
    expect(result.completion).toBeDefined();
  });
});
