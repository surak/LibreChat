import type { MCPServerDocument } from '../types';
import type { MCPOptions } from 'librechat-data-provider';
import logger from '~/config/winston';
import { nanoid } from 'nanoid';

const NORMALIZED_LIMIT_DEFAULT = 20;

const mcpServerStore = new Map<string, MCPServerDocument>();

/**
 * Generates a URL-friendly server name from a title.
 */
function generateServerNameFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'mcp-server';
}

// Factory function that returns the methods
export function createMCPServerMethods() {
  /**
   * Finds the next available server name by checking for duplicates.
   */
  async function findNextAvailableServerName(baseName: string): Promise<string> {
    let candidate = baseName;
    let counter = 2;
    while (Array.from(mcpServerStore.values()).some(s => s.serverName === candidate)) {
      candidate = `${baseName}-${counter++}`;
    }
    return candidate;
  }

  /**
   * Create a new MCP server.
   */
  async function createMCPServer(data: {
    config: MCPOptions;
    author: string;
  }): Promise<MCPServerDocument> {
    let serverName: string;
    if (data.config.title) {
      const baseSlug = generateServerNameFromTitle(data.config.title);
      serverName = await findNextAvailableServerName(baseSlug);
    } else {
      serverName = `mcp-${nanoid(16)}`;
    }

    const id = nanoid();
    const newServer: MCPServerDocument = {
      _id: id,
      serverName,
      config: data.config,
      author: data.author,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } as any;

    mcpServerStore.set(id, newServer);
    return newServer;
  }

  /**
   * Find an MCP server by serverName
   */
  async function findMCPServerByServerName(serverName: string): Promise<MCPServerDocument | null> {
    return Array.from(mcpServerStore.values()).find(s => s.serverName === serverName) || null;
  }

  /**
   * Find an MCP server by ID
   */
  async function findMCPServerByObjectId(
    _id: string,
  ): Promise<MCPServerDocument | null> {
    return mcpServerStore.get(_id) || null;
  }

  /**
   * Find MCP servers by author
   */
  async function findMCPServersByAuthor(
    authorId: string,
  ): Promise<MCPServerDocument[]> {
    return Array.from(mcpServerStore.values())
      .filter(s => s.author === authorId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get a paginated list of MCP servers by IDs
   */
  async function getListMCPServersByIds({
    ids = [],
    otherParams = {},
    limit = null,
    after = null,
  }: {
    ids?: string[];
    otherParams?: any;
    limit?: number | null;
    after?: string | null;
  }): Promise<{
    data: MCPServerDocument[];
    has_more: boolean;
    after: string | null;
  }> {
    const isPaginated = limit !== null && limit !== undefined;
    const normalizedLimit = isPaginated
      ? Math.min(Math.max(1, parseInt(String(limit)) || NORMALIZED_LIMIT_DEFAULT), 100)
      : null;

    let servers = Array.from(mcpServerStore.values()).filter(s => ids.includes(s._id as string));

    // Apply otherParams (basic equality only for now)
    if (otherParams) {
       servers = servers.filter(s => {
          for (const key in otherParams) {
             if ((s as any)[key] !== otherParams[key]) return false;
          }
          return true;
       });
    }

    servers.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || (a._id as string).localeCompare(b._id as string));

    if (after) {
       try {
          const cursor = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
          const idx = servers.findIndex(s => s._id === cursor._id);
          if (idx !== -1) {
             servers = servers.slice(idx + 1);
          }
       } catch (e) {
          logger.warn('[getListMCPServersByIds] Invalid cursor', e);
       }
    }

    const has_more = normalizedLimit !== null && servers.length > normalizedLimit;
    const data = normalizedLimit !== null ? servers.slice(0, normalizedLimit) : servers;

    let nextAfter: string | null = null;
    if (has_more && data.length > 0) {
       const last = data[data.length - 1];
       nextAfter = Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, _id: last._id })).toString('base64');
    }

    return { data, has_more, after: nextAfter };
  }

  /**
   * Update an MCP server
   */
  async function updateMCPServer(
    serverName: string,
    updateData: { config?: MCPOptions },
  ): Promise<MCPServerDocument | null> {
    const server = await findMCPServerByServerName(serverName);
    if (!server) return null;
    const updated = { ...server, ...updateData, updatedAt: new Date().toISOString() };
    mcpServerStore.set(server._id as string, updated);
    return updated;
  }

  /**
   * Delete an MCP server
   */
  async function deleteMCPServer(serverName: string): Promise<MCPServerDocument | null> {
    const server = await findMCPServerByServerName(serverName);
    if (!server) return null;
    mcpServerStore.delete(server._id as string);
    return server;
  }

  /**
   * Get MCP servers by their serverName strings
   */
  async function getListMCPServersByNames({ names = [] }: { names: string[] }): Promise<{
    data: MCPServerDocument[];
  }> {
    const servers = Array.from(mcpServerStore.values()).filter(s => names.includes(s.serverName));
    return { data: servers };
  }

  return {
    createMCPServer,
    findMCPServerByServerName,
    findMCPServerByObjectId,
    findMCPServersByAuthor,
    getListMCPServersByIds,
    getListMCPServersByNames,
    updateMCPServer,
    deleteMCPServer,
  };
}

export type MCPServerMethods = ReturnType<typeof createMCPServerMethods>;
