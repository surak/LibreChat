import type { MCPOptions } from 'librechat-data-provider';
import type * as t from '~/types';
import { createMCPServerMethods } from './mcpServer';
import { v4 as uuidv4 } from 'uuid';

let methods: ReturnType<typeof createMCPServerMethods>;

beforeAll(async () => {
  methods = createMCPServerMethods();
});

beforeEach(async () => {
  // @ts-ignore - access to internal store for testing
  methods._store?.clear();
});

describe('MCPServer Model Tests', () => {
  const authorId = uuidv4();
  const authorId2 = uuidv4();

  const createSSEConfig = (title?: string, description?: string): MCPOptions => ({
    type: 'sse',
    url: 'https://example.com/mcp',
    ...(title && { title }),
    ...(description && { description }),
  });

  describe('createMCPServer', () => {
    test('should create server with title and generate slug from title', async () => {
      const config = createSSEConfig('My Test Server', 'A test server');
      const server = await methods.createMCPServer({ config, author: authorId });

      expect(server).toBeDefined();
      expect(server.serverName).toBe('my-test-server');
      expect(server.config.title).toBe('My Test Server');
      expect(server.config.description).toBe('A test server');
      expect(server.author.toString()).toBe(authorId.toString());
      expect(server.createdAt).toBeInstanceOf(Date);
      expect(server.updatedAt).toBeInstanceOf(Date);
    });

    test('should create server without title and use nanoid', async () => {
      const config: MCPOptions = {
        type: 'sse',
        url: 'https://example.com/mcp',
      };
      const server = await methods.createMCPServer({ config, author: authorId });

      expect(server).toBeDefined();
      expect(server.serverName).toMatch(/^mcp-[a-zA-Z0-9_-]{16}$/);
      expect(server.config.title).toBeUndefined();
    });
  });

  describe('findMCPServerByServerName', () => {
    test('should find server by serverName', async () => {
      const created = await methods.createMCPServer({
        config: createSSEConfig('Find By Name Test'),
        author: authorId,
      });

      const found = await methods.findMCPServerByServerName(created.serverName);

      expect(found).toBeDefined();
      expect(found?.serverName).toBe('find-by-name-test');
      expect(found?.config.title).toBe('Find By Name Test');
    });

    test('should return null when server not found', async () => {
      const found = await methods.findMCPServerByServerName('non-existent-server');
      expect(found).toBeNull();
    });
  });

  describe('findMCPServerByObjectId', () => {
    test('should find server by ID', async () => {
      const created = await methods.createMCPServer({
        config: createSSEConfig('Object Id Test'),
        author: authorId,
      });

      const found = await methods.findMCPServerByObjectId(created._id);

      expect(found).toBeDefined();
      expect(found?.serverName).toBe('object-id-test');
      expect(found?._id.toString()).toBe(created._id.toString());
    });
  });

  describe('updateMCPServer', () => {
    test('should update server config', async () => {
      const created = await methods.createMCPServer({
        config: createSSEConfig('Update Test', 'Original description'),
        author: authorId,
      });

      const updated = await methods.updateMCPServer(created.serverName, {
        config: createSSEConfig('Update Test', 'Updated description'),
      });

      expect(updated).toBeDefined();
      expect(updated?.config.description).toBe('Updated description');
    });
  });

  describe('deleteMCPServer', () => {
    test('should delete existing server', async () => {
      const created = await methods.createMCPServer({
        config: createSSEConfig('Delete Test'),
        author: authorId,
      });

      const deleted = await methods.deleteMCPServer(created.serverName);

      expect(deleted).toBeDefined();
      expect(deleted?.serverName).toBe('delete-test');

      const found = await methods.findMCPServerByServerName('delete-test');
      expect(found).toBeNull();
    });
  });
});
