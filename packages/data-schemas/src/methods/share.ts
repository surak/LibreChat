import { nanoid } from 'nanoid';
import { Constants } from 'librechat-data-provider';
import type * as t from '~/types';
import { logger } from '~/common';

class ShareServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ShareServiceError';
    this.code = code;
  }
}

function memoizedAnonymizeId(prefix: string) {
  const memo = new Map<string, string>();
  return (id: string) => {
    if (!memo.has(id)) {
      memo.set(id, `${prefix}_${nanoid()}`);
    }
    return memo.get(id) as string;
  };
}

const anonymizeConvoId = memoizedAnonymizeId('convo');
const anonymizeAssistantId = memoizedAnonymizeId('a');
const anonymizeMessageId = (id: string) =>
  id === Constants.NO_PARENT ? id : memoizedAnonymizeId('msg')(id);

function anonymizeConvo(conversation: Partial<t.IConversation> & Partial<t.ISharedLink>) {
  if (!conversation) {
    return null;
  }

  const newConvo = { ...conversation };
  if (newConvo.assistant_id) {
    newConvo.assistant_id = anonymizeAssistantId(newConvo.assistant_id);
  }
  return newConvo;
}

function anonymizeMessages(messages: t.IMessage[], newConvoId: string): t.IMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const idMap = new Map<string, string>();
  return messages.map((message) => {
    const newMessageId = anonymizeMessageId(message.messageId);
    idMap.set(message.messageId, newMessageId);

    type MessageAttachment = {
      messageId?: string;
      conversationId?: string;
      [key: string]: unknown;
    };

    const anonymizedAttachments = (message.attachments as MessageAttachment[])?.map(
      (attachment) => {
        return {
          ...attachment,
          messageId: newMessageId,
          conversationId: newConvoId,
        };
      },
    );

    return {
      ...message,
      messageId: newMessageId,
      parentMessageId:
        idMap.get(message.parentMessageId || '') ||
        anonymizeMessageId(message.parentMessageId || ''),
      conversationId: newConvoId,
      model: message.model?.startsWith('asst_')
        ? anonymizeAssistantId(message.model)
        : message.model,
      attachments: anonymizedAttachments,
    } as t.IMessage;
  });
}

function getMessagesUpToTarget(messages: t.IMessage[], targetMessageId: string): t.IMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  if (messages.length === 1 && messages[0]?.messageId === targetMessageId) {
    return messages;
  }

  const parentToChildrenMap = new Map<string, t.IMessage[]>();
  for (const message of messages) {
    const parentId = message.parentMessageId || Constants.NO_PARENT;
    if (!parentToChildrenMap.has(parentId)) {
      parentToChildrenMap.set(parentId, []);
    }
    parentToChildrenMap.get(parentId)?.push(message);
  }

  const targetMessage = messages.find((msg) => msg.messageId === targetMessageId);
  if (!targetMessage) {
    return messages;
  }

  const visited = new Set<string>();
  const rootMessages = parentToChildrenMap.get(Constants.NO_PARENT) || [];
  let currentLevel = rootMessages.length > 0 ? [...rootMessages] : [targetMessage];
  const results = new Set<t.IMessage>(currentLevel);

  if (
    currentLevel.some((msg) => msg.messageId === targetMessageId) &&
    targetMessage.parentMessageId === Constants.NO_PARENT
  ) {
    return Array.from(results);
  }

  let targetFound = false;
  while (!targetFound && currentLevel.length > 0) {
    const nextLevel: t.IMessage[] = [];
    for (const node of currentLevel) {
      if (visited.has(node.messageId)) {
        continue;
      }
      visited.add(node.messageId);
      const children = parentToChildrenMap.get(node.messageId) || [];
      for (const child of children) {
        if (visited.has(child.messageId)) {
          continue;
        }
        nextLevel.push(child);
        results.add(child);
        if (child.messageId === targetMessageId) {
          targetFound = true;
        }
      }
    }
    currentLevel = nextLevel;
  }

  return Array.from(results);
}

export function createShareMethods() {
  const store = new Map<string, t.ISharedLink & { messages?: t.IMessage[] }>();

  async function getSharedMessages(shareId: string): Promise<t.SharedMessagesResult | null> {
    try {
      const share = store.get(shareId);

      if (!share?.conversationId || !share.isPublic || !share.messages) {
        return null;
      }

      let messagesToShare: t.IMessage[] = share.messages;
      if (share.targetMessageId) {
        messagesToShare = getMessagesUpToTarget(share.messages, share.targetMessageId);
      }

      const newConvoId = anonymizeConvoId(share.conversationId);
      const result: t.SharedMessagesResult = {
        shareId: share.shareId || shareId,
        title: share.title,
        isPublic: share.isPublic,
        createdAt: share.createdAt || new Date(),
        updatedAt: share.updatedAt || new Date(),
        conversationId: newConvoId,
        messages: anonymizeMessages(messagesToShare, newConvoId),
      };

      return result;
    } catch (error) {
      logger.error('[getSharedMessages] Error getting share link', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shareId,
      });
      throw new ShareServiceError('Error getting share link', 'SHARE_FETCH_ERROR');
    }
  }

  async function getSharedLinks(
    user: string,
    pageParam?: Date,
    pageSize: number = 10,
    isPublic: boolean = true,
    sortBy: string = 'createdAt',
    sortDirection: string = 'desc',
    _search?: string,
  ): Promise<t.SharedLinksResult> {
    try {
      let links = Array.from(store.values()).filter(l => l.user === user && l.isPublic === isPublic);

      if (pageParam) {
        if (sortDirection === 'desc') {
            links = links.filter(l => (l[sortBy as keyof t.ISharedLink] as unknown as Date) < pageParam);
        } else {
            links = links.filter(l => (l[sortBy as keyof t.ISharedLink] as unknown as Date) > pageParam);
        }
      }

      links.sort((a, b) => {
          const valA = (a[sortBy as keyof t.ISharedLink] as unknown as Date).getTime();
          const valB = (b[sortBy as keyof t.ISharedLink] as unknown as Date).getTime();
          return sortDirection === 'desc' ? valB - valA : valA - valB;
      });

      const hasNextPage = links.length > pageSize;
      const paginatedLinks = links.slice(0, pageSize);

      const nextCursor = hasNextPage
        ? (paginatedLinks[paginatedLinks.length - 1][sortBy as keyof t.ISharedLink] as unknown as Date)
        : undefined;

      return {
        links: paginatedLinks.map((link) => ({
          shareId: link.shareId || '',
          title: link?.title || 'Untitled',
          isPublic: link.isPublic,
          createdAt: (link.createdAt as unknown as Date) || new Date(),
          conversationId: link.conversationId,
        })),
        nextCursor,
        hasNextPage,
      };
    } catch (error) {
      logger.error('[getSharedLinks] Error getting shares', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
      });
      throw new ShareServiceError('Error getting shares', 'SHARES_FETCH_ERROR');
    }
  }

  async function deleteAllSharedLinks(user: string): Promise<t.DeleteAllSharesResult> {
    try {
      let count = 0;
      for (const [id, share] of store.entries()) {
          if (share.user === user) {
              store.delete(id);
              count++;
          }
      }
      return {
        message: 'All shared links deleted successfully',
        deletedCount: count,
      };
    } catch (error) {
      logger.error('[deleteAllSharedLinks] Error deleting shared links', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
      });
      throw new ShareServiceError('Error deleting shared links', 'BULK_DELETE_ERROR');
    }
  }

  async function deleteConvoSharedLink(
    user: string,
    conversationId: string,
  ): Promise<t.DeleteAllSharesResult> {
    try {
        let count = 0;
        for (const [id, share] of store.entries()) {
            if (share.user === user && share.conversationId === conversationId) {
                store.delete(id);
                count++;
            }
        }
      return {
        message: 'Shared links deleted successfully',
        deletedCount: count,
      };
    } catch (error) {
      logger.error('[deleteConvoSharedLink] Error deleting shared links', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user,
        conversationId,
      });
      throw new ShareServiceError('Error deleting shared links', 'SHARE_DELETE_ERROR');
    }
  }

  async function createSharedLink(
    user: string,
    conversationId: string,
    targetMessageId?: string,
  ): Promise<t.CreateShareResult> {
    try {
      const shareId = nanoid();
      store.set(shareId, {
        shareId,
        conversationId,
        user,
        isPublic: true,
        title: 'Shared Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
        targetMessageId,
      });
      return { shareId, conversationId };
    } catch (error) {
      throw new ShareServiceError('Error creating shared link', 'SHARE_CREATE_ERROR');
    }
  }

  async function getSharedLink(
    user: string,
    conversationId: string,
  ): Promise<t.GetShareLinkResult> {
    const share = Array.from(store.values()).find(l => l.user === user && l.conversationId === conversationId && l.isPublic);
    if (!share) {
      return { shareId: null, success: false };
    }
    return { shareId: share.shareId || null, success: true };
  }

  async function updateSharedLink(user: string, shareId: string): Promise<t.UpdateShareResult> {
    const share = store.get(shareId);
    if (!share || share.user !== user) {
        throw new ShareServiceError('Share not found', 'SHARE_NOT_FOUND');
    }
    const newShareId = nanoid();
    const updatedShare = { ...share, shareId: newShareId, updatedAt: new Date() };
    store.set(newShareId, updatedShare);
    store.delete(shareId);
    return { shareId: newShareId, conversationId: updatedShare.conversationId };
  }

  async function deleteSharedLink(
    user: string,
    shareId: string,
  ): Promise<t.DeleteShareResult | null> {
    const share = store.get(shareId);
    if (!share || share.user !== user) {
        return null;
    }
    store.delete(shareId);
    return {
      success: true,
      shareId,
      message: 'Share deleted successfully',
    };
  }

  return {
    getSharedLink,
    getSharedLinks,
    createSharedLink,
    updateSharedLink,
    deleteSharedLink,
    getSharedMessages,
    deleteAllSharedLinks,
    deleteConvoSharedLink,
    _store: store,
  };
}

export type ShareMethods = ReturnType<typeof createShareMethods>;
