import { nanoid } from 'nanoid';
import { Constants } from 'librechat-data-provider';
import { createShareMethods, type ShareMethods } from './share';
import type * as t from '~/types';

describe('Share Methods', () => {
  let shareMethods: ShareMethods;

  beforeAll(async () => {
    shareMethods = createShareMethods();
  });

  beforeEach(async () => {
    // @ts-ignore
    shareMethods._store?.clear();
  });

  describe('createSharedLink', () => {
    test('should create a new shared link', async () => {
      const userId = 'user123';
      const conversationId = `conv_${nanoid()}`;

      const result = await shareMethods.createSharedLink(userId, conversationId);

      expect(result).toBeDefined();
      expect(result.shareId).toBeDefined();
      expect(result.conversationId).toBe(conversationId);

      // @ts-ignore
      const savedShare = shareMethods._store.get(result.shareId);
      expect(savedShare).toBeDefined();
      expect(savedShare?.user).toBe(userId);
    });
  });

  describe('getSharedMessages', () => {
    test('should retrieve and anonymize shared messages', async () => {
      const userId = 'user123';
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      const messages: t.IMessage[] = [
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId,
          text: 'Hello',
          isCreatedByUser: true,
          parentMessageId: Constants.NO_PARENT,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // @ts-ignore
      shareMethods._store.set(shareId, {
        shareId,
        conversationId,
        user: userId,
        title: 'Test Share',
        messages,
        isPublic: true,
      });

      const result = await shareMethods.getSharedMessages(shareId);

      expect(result).toBeDefined();
      expect(result?.shareId).toBe(shareId);
      expect(result?.conversationId).not.toBe(conversationId);
      expect(result?.messages).toHaveLength(1);
    });
  });
});
