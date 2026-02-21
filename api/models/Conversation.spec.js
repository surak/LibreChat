const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  deleteNullOrEmptyConversations,
  searchConversation,
  getConvosByCursor,
  getConvosQueried,
  getConvoFiles,
  getConvoTitle,
  deleteConvos,
  saveConvo,
  getConvo,
} = require('./Conversation');

jest.mock('~/server/services/Config/app');
jest.mock('./Message');
const { getMessages, deleteMessages } = require('./Message');

describe('Conversation Operations', () => {
  let mockReq;
  let mockConversationData;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Default mock implementations
    getMessages.mockResolvedValue([]);
    deleteMessages.mockResolvedValue({ deletedCount: 0 });

    mockReq = {
      user: { id: 'user123' },
      body: {},
      config: {
        interfaceConfig: {
          temporaryChatRetention: 24,
        },
      },
    };

    mockConversationData = {
      conversationId: uuidv4(),
      title: 'Test Conversation',
      endpoint: EModelEndpoint.openAI,
    };
  });

  describe('saveConvo', () => {
    it('should save a conversation for an authenticated user', async () => {
      const result = await saveConvo(mockReq, mockConversationData);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBe('Test Conversation');
      expect(result.endpoint).toBe(EModelEndpoint.openAI);

      const savedConvo = await getConvo('user123', mockConversationData.conversationId);
      expect(savedConvo).toBeTruthy();
      expect(savedConvo.title).toBe('Test Conversation');
    });

    it('should handle newConversationId when provided', async () => {
      const newConversationId = uuidv4();
      const result = await saveConvo(mockReq, {
        ...mockConversationData,
        newConversationId,
      });

      expect(result.conversationId).toBe(newConversationId);
    });
  });

  describe('searchConversation', () => {
    it('should find a conversation by conversationId', async () => {
      await saveConvo(mockReq, mockConversationData);
      const result = await searchConversation(mockConversationData.conversationId);

      expect(result).toBeTruthy();
      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
    });

    it('should return undefined if conversation not found', async () => {
      const result = await searchConversation('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('getConvo', () => {
    it('should retrieve a conversation for a user', async () => {
      await saveConvo(mockReq, mockConversationData);
      const result = await getConvo('user123', mockConversationData.conversationId);

      expect(result.conversationId).toBe(mockConversationData.conversationId);
      expect(result.user).toBe('user123');
      expect(result.title).toBe('Test Conversation');
    });

    it('should return null if conversation not found', async () => {
      const result = await getConvo('user123', 'non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('deleteConvos', () => {
    it('should delete conversations and associated messages', async () => {
      await saveConvo(mockReq, mockConversationData);

      deleteMessages.mockResolvedValue({ deletedCount: 5 });

      const result = await deleteConvos('user123', {
        conversationId: mockConversationData.conversationId,
      });

      expect(result.deletedCount).toBe(1);
      expect(result.messages.deletedCount).toBe(5);

      const deletedConvo = await getConvo('user123', mockConversationData.conversationId);
      expect(deletedConvo).toBeNull();
    });
  });
});
