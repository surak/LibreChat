import { createSessionMethods, DEFAULT_REFRESH_TOKEN_EXPIRY, type SessionMethods } from './session';
import { createTokenMethods, type TokenMethods } from './token';
import { createRoleMethods, type RoleMethods } from './role';
import { createUserMethods, DEFAULT_SESSION_EXPIRY, type UserMethods } from './user';
import { createBalanceMethods, type BalanceMethods } from './balance';
import { createTransactionMethods, type TransactionMethods } from './transaction';
import { createActionMethods, type ActionMethods } from './action';
import { createAssistantMethods, type AssistantMethods } from './assistant';
import { createBannerMethods, type BannerMethods } from './banner';
import { createPromptMethods, type PromptMethods } from './prompt';
import { createProjectMethods, type ProjectMethods } from './project';
import { createConversationTagMethods, type ConversationTagMethods } from './conversationTag';
import { createAgentMethods, type AgentMethods } from './agent';

export { DEFAULT_REFRESH_TOKEN_EXPIRY, DEFAULT_SESSION_EXPIRY };
import { createKeyMethods, type KeyMethods } from './key';
import { createFileMethods, type FileMethods } from './file';
/* Memories */
import { createMemoryMethods, type MemoryMethods } from './memory';
/* Agent Categories */
import { createAgentCategoryMethods, type AgentCategoryMethods } from './agentCategory';
/* Agent API Keys */
import { createAgentApiKeyMethods, type AgentApiKeyMethods } from './agentApiKey';
/* MCP Servers */
import { createMCPServerMethods, type MCPServerMethods } from './mcpServer';
/* Plugin Auth */
import { createPluginAuthMethods, type PluginAuthMethods } from './pluginAuth';
/* Permissions */
import { createAccessRoleMethods, type AccessRoleMethods } from './accessRole';
import { createUserGroupMethods, type UserGroupMethods } from './userGroup';
import { createAclEntryMethods, type AclEntryMethods } from './aclEntry';
import { createShareMethods, type ShareMethods } from './share';

export type AllMethods = UserMethods &
  SessionMethods &
  TokenMethods &
  RoleMethods &
  KeyMethods &
  FileMethods &
  MemoryMethods &
  AgentCategoryMethods &
  AgentApiKeyMethods &
  MCPServerMethods &
  UserGroupMethods &
  AclEntryMethods &
  ShareMethods &
  AccessRoleMethods &
  BalanceMethods &
  TransactionMethods &
  ActionMethods &
  AssistantMethods &
  BannerMethods &
  PromptMethods &
  ProjectMethods &
  ConversationTagMethods &
  AgentMethods &
  PluginAuthMethods;

/**
 * Creates all database methods for all collections
 */
export function createMethods(): AllMethods {
  return {
    ...createUserMethods(),
    ...createSessionMethods(),
    ...createTokenMethods(),
    ...createRoleMethods(),
    ...createKeyMethods(),
    ...createFileMethods(),
    ...createMemoryMethods(),
    ...createAgentCategoryMethods(),
    ...createAgentApiKeyMethods(),
    ...createMCPServerMethods(),
    ...createAccessRoleMethods(),
    ...createUserGroupMethods(),
    ...createAclEntryMethods(),
    ...createShareMethods(),
    ...createBalanceMethods(),
    ...createTransactionMethods(),
    ...createActionMethods(),
    ...createAssistantMethods(),
    ...createBannerMethods(),
    ...createPromptMethods(),
    ...createProjectMethods(),
    ...createConversationTagMethods(),
    ...createAgentMethods(),
    ...createPluginAuthMethods(),
  };
}

export type {
  UserMethods,
  SessionMethods,
  TokenMethods,
  RoleMethods,
  KeyMethods,
  FileMethods,
  MemoryMethods,
  AgentCategoryMethods,
  AgentApiKeyMethods,
  MCPServerMethods,
  UserGroupMethods,
  AclEntryMethods,
  ShareMethods,
  AccessRoleMethods,
  BalanceMethods,
  TransactionMethods,
  ActionMethods,
  AssistantMethods,
  BannerMethods,
  PromptMethods,
  ProjectMethods,
  ConversationTagMethods,
  AgentMethods,
  PluginAuthMethods,
};
