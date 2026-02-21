const { buildTree } = require('librechat-data-provider');
const { getMessages, bulkSaveMessages, deleteMessages } = require('./Message');

describe('Conversation Structure Tests', () => {
  const userId = 'testUser';
  const conversationId = 'testConversation';

  beforeEach(async () => {
    await deleteMessages({ conversationId });
  });

  test('Conversation structure maintained with multiple messages', async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      messageId: `message${i}`,
      parentMessageId: i === 0 ? null : `message${i - 1}`,
      conversationId,
      user: userId,
      text: `Message ${i}`,
      createdAt: new Date(Date.now() + i * 1000),
    }));

    await bulkSaveMessages(messages);

    const retrievedMessages = await getMessages({ conversationId, user: userId });
    const tree = buildTree({ messages: retrievedMessages });

    expect(tree.length).toBe(1);
    let currentNode = tree[0];
    for (let i = 1; i < 20; i++) {
      expect(currentNode.children.length).toBe(1);
      currentNode = currentNode.children[0];
      expect(currentNode.text).toBe(`Message ${i}`);
    }
    expect(currentNode.children.length).toBe(0);
  });

  test('Tree structure with branching', async () => {
    const messages = [
      {
        messageId: 'parent',
        parentMessageId: null,
        text: 'Parent',
        createdAt: new Date('2023-01-01T00:00:00Z'),
      },
      {
        messageId: 'child1',
        parentMessageId: 'parent',
        text: 'Child 1',
        createdAt: new Date('2023-01-01T00:01:00Z'),
      },
      {
        messageId: 'child2',
        parentMessageId: 'parent',
        text: 'Child 2',
        createdAt: new Date('2023-01-01T00:02:00Z'),
      },
    ];

    messages.forEach(m => { m.conversationId = conversationId; m.user = userId; });

    await bulkSaveMessages(messages);
    const retrieved = await getMessages({ conversationId, user: userId });
    const tree = buildTree({ messages: retrieved });

    expect(tree.length).toBe(1);
    expect(tree[0].messageId).toBe('parent');
    expect(tree[0].children.length).toBe(2);
  });
});
