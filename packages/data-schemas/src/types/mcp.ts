import type { MCPServerDB } from 'librechat-data-provider';

/**
 * Interface for MCP Server document
 */
export interface MCPServerDocument extends MCPServerDB {
  _id: string;
  author: string;
}
