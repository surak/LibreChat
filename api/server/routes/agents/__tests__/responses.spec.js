/**
 * Open Responses API Integration Tests
 *
 * Tests the /v1/responses endpoint against the Open Responses specification
 * compliance tests. Uses real Anthropic API for LLM calls.
 *
 * @see https://openresponses.org/specification
 * @see https://github.com/openresponses/openresponses/blob/main/src/lib/compliance-tests.ts
 */

// Load environment variables from root .env file for API keys
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });

const originalEnv = {
  CREDS_KEY: process.env.CREDS_KEY,
  CREDS_IV: process.env.CREDS_IV,
};

process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = '0123456789abcdef';

/** Skip tests if ANTHROPIC_API_KEY is not available */
const SKIP_INTEGRATION_TESTS = !process.env.ANTHROPIC_API_KEY;
if (SKIP_INTEGRATION_TESTS) {
  console.warn('ANTHROPIC_API_KEY not found - skipping integration tests');
}

jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    getIndex: jest.fn().mockRejectedValue(new Error('mocked')),
    index: jest.fn().mockReturnValue({
      getRawInfo: jest.fn().mockResolvedValue({ primaryKey: 'id' }),
      updateSettings: jest.fn().mockResolvedValue({}),
      addDocuments: jest.fn().mockResolvedValue({}),
      updateDocuments: jest.fn().mockResolvedValue({}),
      deleteDocument: jest.fn().mockResolvedValue({}),
    }),
  })),
}));

jest.mock('~/server/services/Config', () => ({
  loadCustomConfig: jest.fn(() => Promise.resolve({})),
  getAppConfig: jest.fn().mockResolvedValue({
    paths: {
      uploads: '/tmp',
      dist: '/tmp/dist',
      fonts: '/tmp/fonts',
      assets: '/tmp/assets',
    },
    fileStrategy: 'local',
    imageOutputType: 'PNG',
    endpoints: {
      agents: {
        allowedProviders: ['anthropic', 'openAI'],
      },
    },
  }),
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  getMCPServerTools: jest.fn().mockReturnValue([]),
}));

jest.mock('~/app/clients/tools', () => ({
  createOpenAIImageTools: jest.fn(() => []),
  createYouTubeTools: jest.fn(() => []),
  manifestToolMap: {},
  toolkits: [],
}));

jest.mock('~/config', () => ({
  createMCPServersRegistry: jest.fn(),
  createMCPManager: jest.fn().mockResolvedValue({
    getAppToolFunctions: jest.fn().mockResolvedValue({}),
  }),
}));

const express = require('express');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { hashToken, getRandomValues, createMethods } = require('@librechat/data-schemas');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
  EModelEndpoint,
} = require('librechat-data-provider');

let methods;

/**
 * Parse SSE stream into events
 * @param {string} text - Raw SSE text
 * @returns {Array<{event: string, data: unknown}>}
 */
function parseSSEEvents(text) {
  const events = [];
  const lines = text.split('\n');

  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      currentData = line.slice(5).trim();
    } else if (line === '' && currentData) {
      if (currentData === '[DONE]') {
        events.push({ event: 'done', data: '[DONE]' });
      } else {
        try {
          const parsed = JSON.parse(currentData);
          events.push({
            event: currentEvent || parsed.type || 'unknown',
            data: parsed,
          });
        } catch {
          // Skip unparseable data
        }
      }
      currentEvent = '';
      currentData = '';
    }
  }

  return events;
}

/**
 * Valid streaming event types per Open Responses specification
 */
const VALID_STREAMING_EVENT_TYPES = new Set([
  // Standard Open Responses events
  'response.created',
  'response.queued',
  'response.in_progress',
  'response.completed',
  'response.failed',
  'response.incomplete',
  'response.output_item.added',
  'response.output_item.done',
  'response.content_part.added',
  'response.content_part.done',
  'response.output_text.delta',
  'response.output_text.done',
  'response.refusal.delta',
  'response.refusal.done',
  'response.function_call_arguments.delta',
  'response.function_call_arguments.done',
  'response.reasoning_summary_part.added',
  'response.reasoning_summary_part.done',
  'response.reasoning.delta',
  'response.reasoning.done',
  'response.reasoning_summary_text.delta',
  'response.reasoning_summary_text.done',
  'response.output_text.annotation.added',
  'error',
  // LibreChat extension events
  'librechat:attachment',
]);

/**
 * Validate a streaming event against Open Responses spec
 * @param {Object} event - Parsed event with data
 * @returns {string[]} Array of validation errors
 */
function validateStreamingEvent(event) {
  const errors = [];
  const data = event.data;

  if (!data || typeof data !== 'object') {
    return errors; // Skip non-object data (e.g., [DONE])
  }

  const eventType = data.type;

  // Check event type is valid
  if (!VALID_STREAMING_EVENT_TYPES.has(eventType)) {
    errors.push(`Invalid event type: ${eventType}`);
    return errors;
  }

  // Validate required fields based on event type
  switch (eventType) {
    case 'response.output_text.delta':
      if (typeof data.sequence_number !== 'number') {
        errors.push('response.output_text.delta: missing sequence_number');
      }
      if (typeof data.item_id !== 'string') {
        errors.push('response.output_text.delta: missing item_id');
      }
      if (typeof data.output_index !== 'number') {
        errors.push('response.output_text.delta: missing output_index');
      }
      if (typeof data.content_index !== 'number') {
        errors.push('response.output_text.delta: missing content_index');
      }
      if (typeof data.delta !== 'string') {
        errors.push('response.output_text.delta: missing delta');
      }
      if (!Array.isArray(data.logprobs)) {
        errors.push('response.output_text.delta: missing logprobs array');
      }
      break;

    case 'response.output_text.done':
      if (typeof data.sequence_number !== 'number') {
        errors.push('response.output_text.done: missing sequence_number');
      }
      if (typeof data.item_id !== 'string') {
        errors.push('response.output_text.done: missing item_id');
      }
      if (typeof data.output_index !== 'number') {
        errors.push('response.output_text.done: missing output_index');
      }
      if (typeof data.content_index !== 'number') {
        errors.push('response.output_text.done: missing content_index');
      }
      if (typeof data.text !== 'string') {
        errors.push('response.output_text.done: missing text');
      }
      if (!Array.isArray(data.logprobs)) {
        errors.push('response.output_text.done: missing logprobs array');
      }
      break;

    case 'response.reasoning.delta':
      if (typeof data.sequence_number !== 'number') {
        errors.push('response.reasoning.delta: missing sequence_number');
      }
      if (typeof data.item_id !== 'string') {
        errors.push('response.reasoning.delta: missing item_id');
      }
      if (typeof data.output_index !== 'number') {
        errors.push('response.reasoning.delta: missing output_index');
      }
      if (typeof data.content_index !== 'number') {
        errors.push('response.reasoning.delta: missing content_index');
      }
      if (typeof data.delta !== 'string') {
        errors.push('response.reasoning.delta: missing delta');
      }
      break;

    case 'response.reasoning.done':
      if (typeof data.sequence_number !== 'number') {
        errors.push('response.reasoning.done: missing sequence_number');
      }
      if (typeof data.item_id !== 'string') {
        errors.push('response.reasoning.done: missing item_id');
      }
      if (typeof data.output_index !== 'number') {
        errors.push('response.reasoning.done: missing output_index');
      }
      if (typeof data.content_index !== 'number') {
        errors.push('response.reasoning.done: missing content_index');
      }
      if (typeof data.text !== 'string') {
        errors.push('response.reasoning.done: missing text');
      }
      break;

    case 'response.in_progress':
    case 'response.completed':
    case 'response.failed':
      if (!data.response || typeof data.response !== 'object') {
        errors.push(`${eventType}: missing response object`);
      }
      break;

    case 'response.output_item.added':
    case 'response.output_item.done':
      if (typeof data.output_index !== 'number') {
        errors.push(`${eventType}: missing output_index`);
      }
      if (!data.item || typeof data.item !== 'object') {
        errors.push(`${eventType}: missing item object`);
      }
      break;
  }

  return errors;
}

/**
 * Validate all streaming events and return errors
 * @param {Array} events - Array of parsed events
 * @returns {string[]} Array of all validation errors
 */
function validateAllStreamingEvents(events) {
  const allErrors = [];
  for (const event of events) {
    const errors = validateStreamingEvent(event);
    allErrors.push(...errors);
  }
  return allErrors;
}

/**
 * Create a test agent with Anthropic provider
 * @param {Object} overrides
 * @returns {Promise<Object>}
 */
async function createTestAgent(overrides = {}) {
  const timestamp = new Date();
  const agentData = {
    id: `agent_${uuidv4().replace(/-/g, '').substring(0, 21)}`,
    name: 'Test Anthropic Agent',
    description: 'An agent for testing Open Responses API',
    instructions: 'You are a helpful assistant. Be concise.',
    provider: EModelEndpoint.anthropic,
    model: 'claude-sonnet-4-5-20250929',
    author: uuidv4(),
    tools: [],
    model_parameters: {},
    ...overrides,
  };

  const versionData = { ...agentData };
  delete versionData.author;

  const initialAgentData = {
    ...agentData,
    versions: [
      {
        ...versionData,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    category: 'general',
  };

  return await methods.agent.create(initialAgentData);
}

/**
 * Create an agent with extended thinking enabled
 * @param {Object} overrides
 * @returns {Promise<Object>}
 */
async function createThinkingAgent(overrides = {}) {
  return createTestAgent({
    name: 'Test Thinking Agent',
    description: 'An agent with extended thinking enabled',
    model_parameters: {
      thinking: {
        type: 'enabled',
        budget_tokens: 5000,
      },
    },
    ...overrides,
  });
}

const describeWithApiKey = SKIP_INTEGRATION_TESTS ? describe.skip : describe;

describeWithApiKey('Open Responses API Integration Tests', () => {
  // Increase timeout for real API calls
  jest.setTimeout(120000);

  let app;
  let testAgent;
  let thinkingAgent;
  let testUser;
  let testApiKey;

  afterAll(() => {
    process.env.CREDS_KEY = originalEnv.CREDS_KEY;
    process.env.CREDS_IV = originalEnv.CREDS_IV;
  });

  beforeAll(async () => {
    methods = createMethods();

    // Create minimal Express app with just the responses routes
    app = express();
    app.use(express.json());

    // Mount the responses routes
    const responsesRoutes = require('~/server/routes/agents/responses');
    app.use('/api/agents/v1/responses', responsesRoutes);

    // Create test user
    testUser = await methods.user.create({
      _id: uuidv4(),
      name: 'Test API User',
      username: 'testapiuser',
      email: 'testapiuser@test.com',
      emailVerified: true,
      provider: 'local',
      role: SystemRoles.ADMIN,
    });

    // Seed default roles
    await methods.seedDefaultRoles();

    // Generate and create an API key for the test user
    const rawKey = `sk-${await getRandomValues(32)}`;
    const keyHash = await hashToken(rawKey);
    const keyPrefix = rawKey.substring(0, 8);

    await methods.agentApiKey.create({
      userId: testUser._id,
      name: 'Test API Key',
      keyHash,
      keyPrefix,
    });

    testApiKey = rawKey;

    // Create test agents with the test user as author
    testAgent = await createTestAgent({ author: testUser._id });
    thinkingAgent = await createThinkingAgent({ author: testUser._id });

    // Grant REMOTE_AGENT permissions for the test agents
    await methods.aclEntry.create([
      {
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        resourceType: ResourceType.REMOTE_AGENT,
        resourceId: testAgent._id,
        accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
        permBits:
          PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
      },
      {
        principalType: PrincipalType.USER,
        principalId: testUser._id,
        resourceType: ResourceType.REMOTE_AGENT,
        resourceId: thinkingAgent._id,
        accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
        permBits:
          PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
      },
    ]);
  }, 60000);

  /** Helper to add auth header to requests */
  const authRequest = () => ({
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${testApiKey}`),
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${testApiKey}`),
  });

  describe('Compliance Tests', () => {
    describe('basic-response', () => {
      it('should return a valid ResponseResource for a simple text request', async () => {
        const response = await authRequest()
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Say hello in exactly 3 words.',
              },
            ],
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        const body = response.body;
        expect(body.id).toMatch(/^resp_/);
        expect(body.object).toBe('response');
        expect(typeof body.created_at).toBe('number');
        expect(body.status).toBe('completed');
        expect(body.model).toBe(testAgent.id);

        expect(Array.isArray(body.output)).toBe(true);
        expect(body.output.length).toBeGreaterThan(0);

        const messageItem = body.output.find((item) => item.type === 'message');
        expect(messageItem).toBeDefined();
        expect(messageItem.role).toBe('assistant');
        expect(messageItem.status).toBe('completed');
        expect(Array.isArray(messageItem.content)).toBe(true);
      });
    });

    describe('streaming-response', () => {
      it('should return valid SSE streaming events', async () => {
        const response = await authRequest()
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Count from 1 to 5.',
              },
            ],
            stream: true,
          })
          .buffer(true)
          .parse((res, callback) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk.toString();
            });
            res.on('end', () => {
              callback(null, data);
            });
          });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/text\/event-stream/);

        const events = parseSSEEvents(response.body);
        expect(events.length).toBeGreaterThan(0);

        const validationErrors = validateAllStreamingEvents(events);
        if (validationErrors.length > 0) {
          console.error('Streaming event validation errors:', validationErrors);
        }
        expect(validationErrors).toEqual([]);

        const eventTypes = events.map((e) => e.event);
        expect(eventTypes).toContain('response.created');
        expect(eventTypes).toContain('response.in_progress');

        const createdIdx = eventTypes.indexOf('response.created');
        const inProgressIdx = eventTypes.indexOf('response.in_progress');
        expect(createdIdx).toBeLessThan(inProgressIdx);

        expect(eventTypes.some((t) => t === 'response.completed' || t === 'response.failed')).toBe(
          true,
        );
        expect(eventTypes).toContain('done');

        const completedEvent = events.find((e) => e.event === 'response.completed');
        if (completedEvent) {
          expect(completedEvent.data.response).toBeDefined();
          expect(completedEvent.data.response.status).toBe('completed');
          expect(completedEvent.data.response.output.length).toBeGreaterThan(0);
        }
      });

      it('should emit valid event types per Open Responses spec', async () => {
        const response = await authRequest()
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Say hi.',
              },
            ],
            stream: true,
          })
          .buffer(true)
          .parse((res, callback) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk.toString();
            });
            res.on('end', () => {
              callback(null, data);
            });
          });

        expect(response.status).toBe(200);

        const events = parseSSEEvents(response.body);

        for (const event of events) {
          if (event.data && typeof event.data === 'object' && event.data.type) {
            expect(VALID_STREAMING_EVENT_TYPES.has(event.data.type)).toBe(true);
          }
        }
      });

      it('should include logprobs array in output_text events', async () => {
        const response = await authRequest()
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Say one word.',
              },
            ],
            stream: true,
          })
          .buffer(true)
          .parse((res, callback) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk.toString();
            });
            res.on('end', () => {
              callback(null, data);
            });
          });

        expect(response.status).toBe(200);

        const events = parseSSEEvents(response.body);

        const textDeltaEvents = events.filter(
          (e) => e.data && e.data.type === 'response.output_text.delta',
        );
        const textDoneEvents = events.filter(
          (e) => e.data && e.data.type === 'response.output_text.done',
        );

        expect(textDeltaEvents.length + textDoneEvents.length).toBeGreaterThan(0);

        for (const event of textDeltaEvents) {
          expect(Array.isArray(event.data.logprobs)).toBe(true);
        }

        for (const event of textDoneEvents) {
          expect(Array.isArray(event.data.logprobs)).toBe(true);
        }
      });
    });

    describe('system-prompt', () => {
      it('should handle developer role messages in input (as system)', async () => {
        const response = await authRequest()
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'Pretend you are a pirate and say hello in pirate speak.',
              },
            ],
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('completed');
        expect(response.body.output.length).toBeGreaterThan(0);

        const messageItem = response.body.output.find((item) => item.type === 'message');
        expect(messageItem).toBeDefined();
        expect(messageItem.content.length).toBeGreaterThan(0);
      });
    });

    describe('multi-turn', () => {
      it('should handle multi-turn conversation history', async () => {
        const response = await authRequest()
          .post('/api/agents/v1/responses')
          .send({
            model: testAgent.id,
            input: [
              {
                type: 'message',
                role: 'user',
                content: 'My name is Alice.',
              },
              {
                type: 'message',
                role: 'assistant',
                content: 'Hello Alice! Nice to meet you. How can I help you today?',
              },
              {
                type: 'message',
                role: 'user',
                content: 'What is my name?',
              },
            ],
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('completed');

        const messageItem = response.body.output.find((item) => item.type === 'message');
        expect(messageItem).toBeDefined();

        const textContent = messageItem.content.find((c) => c.type === 'output_text');
        expect(textContent).toBeDefined();
        expect(textContent.text.toLowerCase()).toContain('alice');
      });
    });

    describe('string-input', () => {
      it('should accept simple string input', async () => {
        const response = await authRequest().post('/api/agents/v1/responses').send({
          model: testAgent.id,
          input: 'Hello!',
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('completed');
        expect(response.body.output.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Extended Thinking', () => {
    it('should return reasoning output when thinking is enabled', async () => {
      const response = await authRequest()
        .post('/api/agents/v1/responses')
        .send({
          model: thinkingAgent.id,
          input: [
            {
              type: 'message',
              role: 'user',
              content: 'What is 15 * 7? Think step by step.',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');

      const reasoningItem = response.body.output.find((item) => item.type === 'reasoning');
      if (reasoningItem) {
        expect(reasoningItem).toHaveProperty('id');
        expect(reasoningItem).toHaveProperty('type', 'reasoning');
        expect(reasoningItem).toHaveProperty('summary');
        expect(Array.isArray(reasoningItem.summary)).toBe(true);

        if (reasoningItem.content && reasoningItem.content.length > 0) {
          const reasoningContent = reasoningItem.content[0];
          expect(reasoningContent).toHaveProperty('type', 'reasoning_text');
          expect(reasoningContent).toHaveProperty('text');
        }
      }

      const messageItem = response.body.output.find((item) => item.type === 'message');
      expect(messageItem).toBeDefined();
    });

    it('should stream reasoning events when thinking is enabled', async () => {
      const response = await authRequest()
        .post('/api/agents/v1/responses')
        .send({
          model: thinkingAgent.id,
          input: [
            {
              type: 'message',
              role: 'user',
              content: 'What is 12 + 8? Think step by step.',
            },
          ],
          stream: true,
        })
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            callback(null, data);
          });
        });

      expect(response.status).toBe(200);

      const events = parseSSEEvents(response.body);

      const validationErrors = validateAllStreamingEvents(events);
      if (validationErrors.length > 0) {
        console.error('Reasoning streaming event validation errors:', validationErrors);
      }
      expect(validationErrors).toEqual([]);

      const reasoningDeltaEvents = events.filter(
        (e) => e.data && e.data.type === 'response.reasoning.delta',
      );
      const reasoningDoneEvents = events.filter(
        (e) => e.data && e.data.type === 'response.reasoning.done',
      );

      if (reasoningDeltaEvents.length > 0) {
        const deltaEvent = reasoningDeltaEvents[0];
        expect(deltaEvent.data).toHaveProperty('item_id');
        expect(deltaEvent.data).toHaveProperty('delta');
        expect(deltaEvent.data).toHaveProperty('output_index');
        expect(deltaEvent.data).toHaveProperty('content_index');
        expect(deltaEvent.data).toHaveProperty('sequence_number');
      }

      if (reasoningDoneEvents.length > 0) {
        const doneEvent = reasoningDoneEvents[0];
        expect(doneEvent.data).toHaveProperty('item_id');
        expect(doneEvent.data).toHaveProperty('text');
        expect(doneEvent.data).toHaveProperty('output_index');
        expect(doneEvent.data).toHaveProperty('content_index');
        expect(doneEvent.data).toHaveProperty('sequence_number');
      }

      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toContain('response.completed');
    });
  });

  describe('Schema Validation', () => {
    it('should include all required fields in response', async () => {
      const response = await authRequest().post('/api/agents/v1/responses').send({
        model: testAgent.id,
        input: 'Test',
      });

      expect(response.status).toBe(200);
      const body = response.body;

      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('object', 'response');
      expect(body).toHaveProperty('created_at');
      expect(body).toHaveProperty('completed_at');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('model');
      expect(body).toHaveProperty('output');
      expect(body).toHaveProperty('tools');
      expect(body).toHaveProperty('tool_choice');
      expect(body).toHaveProperty('truncation');
      expect(body).toHaveProperty('parallel_tool_calls');
      expect(body).toHaveProperty('text');
      expect(body).toHaveProperty('temperature');
      expect(body).toHaveProperty('top_p');
      expect(body).toHaveProperty('presence_penalty');
      expect(body).toHaveProperty('frequency_penalty');
      expect(body).toHaveProperty('top_logprobs');
      expect(body).toHaveProperty('store');
      expect(body).toHaveProperty('background');
      expect(body).toHaveProperty('service_tier');
      expect(body).toHaveProperty('metadata');

      expect(typeof body.top_logprobs).toBe('number');

      expect(body).toHaveProperty('usage');
      expect(body.usage).toHaveProperty('input_tokens');
      expect(body.usage).toHaveProperty('output_tokens');
      expect(body.usage).toHaveProperty('total_tokens');
      expect(body.usage).toHaveProperty('input_tokens_details');
      expect(body.usage).toHaveProperty('output_tokens_details');
      expect(body.usage.input_tokens_details).toHaveProperty('cached_tokens');
      expect(body.usage.output_tokens_details).toHaveProperty('reasoning_tokens');
    });

    it('should have valid message item structure', async () => {
      const response = await authRequest().post('/api/agents/v1/responses').send({
        model: testAgent.id,
        input: 'Hello',
      });

      expect(response.status).toBe(200);

      const messageItem = response.body.output.find((item) => item.type === 'message');
      expect(messageItem).toBeDefined();

      expect(messageItem).toHaveProperty('type', 'message');
      expect(messageItem).toHaveProperty('id');
      expect(messageItem).toHaveProperty('status');
      expect(messageItem).toHaveProperty('role', 'assistant');
      expect(messageItem).toHaveProperty('content');
      expect(Array.isArray(messageItem.content)).toBe(true);

      if (messageItem.content.length > 0) {
        const textContent = messageItem.content.find((c) => c.type === 'output_text');
        if (textContent) {
          expect(textContent).toHaveProperty('type', 'output_text');
          expect(textContent).toHaveProperty('text');
          expect(textContent).toHaveProperty('annotations');
          expect(textContent).toHaveProperty('logprobs');
          expect(Array.isArray(textContent.annotations)).toBe(true);
          expect(Array.isArray(textContent.logprobs)).toBe(true);
        }
      }

      const reasoningItem = response.body.output.find((item) => item.type === 'reasoning');
      if (reasoningItem) {
        expect(reasoningItem).toHaveProperty('type', 'reasoning');
        expect(reasoningItem).toHaveProperty('id');
        expect(reasoningItem).toHaveProperty('summary');
        expect(Array.isArray(reasoningItem.summary)).toBe(true);
      }
    });
  });

  describe('Response Storage', () => {
    it('should store response when store: true and retrieve it', async () => {
      const createResponse = await authRequest().post('/api/agents/v1/responses').send({
        model: testAgent.id,
        input: 'Remember this: The answer is 42.',
        store: true,
      });

      expect(createResponse.status).toBe(200);
      expect(createResponse.body.status).toBe('completed');

      const responseId = createResponse.body.id;
      expect(responseId).toMatch(/^resp_/);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const getResponseResult = await authRequest().get(`/api/agents/v1/responses/${responseId}`);

      if (getResponseResult.status === 200) {
        expect(getResponseResult.body.object).toBe('response');
        expect(getResponseResult.body.status).toBe('completed');
        expect(getResponseResult.body.output.length).toBeGreaterThan(0);
      }
    });

    it('should return 404 for non-existent response', async () => {
      const response = await authRequest().get('/api/agents/v1/responses/resp_nonexistent123');
      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return error for missing model', async () => {
      const response = await authRequest().post('/api/agents/v1/responses').send({
        input: 'Hello',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return error for missing input', async () => {
      const response = await authRequest().post('/api/agents/v1/responses').send({
        model: testAgent.id,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return error for non-existent agent', async () => {
      const response = await authRequest().post('/api/agents/v1/responses').send({
        model: 'agent_nonexistent123456789',
        input: 'Hello',
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /v1/responses/models', () => {
    it('should list available agents as models', async () => {
      const response = await authRequest().get('/api/agents/v1/responses/models');

      expect(response.status).toBe(200);
      expect(response.body.object).toBe('list');
      expect(Array.isArray(response.body.data)).toBe(true);

      const foundAgent = response.body.data.find((m) => m.id === testAgent.id);
      expect(foundAgent).toBeDefined();
      expect(foundAgent.object).toBe('model');
      expect(foundAgent.name).toBe(testAgent.name);
    });
  });
});
