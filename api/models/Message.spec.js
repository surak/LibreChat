const { v4: uuidv4 } = require('uuid');
const {
  saveMessage,
  getMessages,
  updateMessage,
  deleteMessages,
  bulkSaveMessages,
  updateMessageText,
  deleteMessagesSince,
  getMessage,
} = require('./Message');

jest.mock('~/server/services/Config/app');

describe('Message Operations', () => {
  let mockReq;
  let mockMessageData;

  beforeEach(async () => {
    mockReq = {
      user: { id: 'user123' },
      config: {
        interfaceConfig: {
          temporaryChatRetention: 24,
        },
      },
    };

    mockMessageData = {
      messageId: 'msg123',
      conversationId: uuidv4(),
      text: 'Hello, world!',
    };
  });

  describe('saveMessage', () => {
    it('should save a message for an authenticated user', async () => {
      const result = await saveMessage(mockReq, mockMessageData);

      expect(result.messageId).toBe('msg123');
      expect(result.user).toBe('user123');
      expect(result.text).toBe('Hello, world!');

      const savedMessage = await getMessage({ messageId: 'msg123', user: 'user123' });
      expect(savedMessage).toBeTruthy();
      expect(savedMessage.text).toBe('Hello, world!');
    });

    it('should throw an error for unauthenticated user', async () => {
      mockReq.user = null;
      await expect(saveMessage(mockReq, mockMessageData)).rejects.toThrow('User not authenticated');
    });
  });

  describe('updateMessageText', () => {
    it('should update message text for the authenticated user', async () => {
      await saveMessage(mockReq, mockMessageData);
      await updateMessageText(mockReq, { messageId: 'msg123', text: 'Updated text' });

      const updatedMessage = await getMessage({ messageId: 'msg123', user: 'user123' });
      expect(updatedMessage.text).toBe('Updated text');
    });
  });

  describe('updateMessage', () => {
    it('should update a message for the authenticated user', async () => {
      await saveMessage(mockReq, mockMessageData);
      const result = await updateMessage(mockReq, { messageId: 'msg123', text: 'Updated text' });

      expect(result.messageId).toBe('msg123');
      expect(result.text).toBe('Updated text');

      const updatedMessage = await getMessage({ messageId: 'msg123', user: 'user123' });
      expect(updatedMessage.text).toBe('Updated text');
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages with the correct filter', async () => {
      const conversationId = uuidv4();
      await saveMessage(mockReq, { messageId: 'msg1', conversationId, text: 'First message' });
      await saveMessage(mockReq, { messageId: 'msg2', conversationId, text: 'Second message' });

      const messages = await getMessages({ conversationId });
      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('First message');
      expect(messages[1].text).toBe('Second message');
    });
  });

  describe('deleteMessages', () => {
    it('should delete messages with the correct filter', async () => {
      await saveMessage(mockReq, mockMessageData);
      await saveMessage({ user: { id: 'user456' } }, { messageId: 'msg456', conversationId: uuidv4(), text: 'Other' });

      await deleteMessages({ user: 'user123' });

      const user123Messages = await getMessages({ user: 'user123' });
      const user456Messages = await getMessages({ user: 'user456' });

      expect(user123Messages).toHaveLength(0);
      expect(user456Messages).toHaveLength(1);
    });
  });
});
