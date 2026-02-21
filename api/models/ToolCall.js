const { ToolCall } = require('./index');

// In-memory store for tool calls
const toolCallStore = new Map();
const MAX_TOOL_CALLS = 5000;

// Cleanup old tool calls every 10 minutes
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [id, tc] of toolCallStore.entries()) {
    if (new Date(tc.updatedAt || tc.createdAt) < oneHourAgo) {
      toolCallStore.delete(id);
    }
  }

  if (toolCallStore.size > MAX_TOOL_CALLS) {
    const sorted = Array.from(toolCallStore.entries()).sort((a, b) => new Date(a[1].updatedAt || a[1].createdAt) - new Date(b[1].updatedAt || b[1].createdAt));
    const toDelete = sorted.slice(0, toolCallStore.size - MAX_TOOL_CALLS);
    for (const [id] of toDelete) {
      toolCallStore.delete(id);
    }
  }
}, 10 * 60 * 1000);

/**
 * Create a new tool call
 * @param {IToolCallData} toolCallData - The tool call data
 * @returns {Promise<IToolCallData>} The created tool call document
 */
async function createToolCall(toolCallData) {
  try {
    const id = toolCallData.id || Math.random().toString(36).substring(7);
    const data = { ...toolCallData, id, createdAt: new Date(), updatedAt: new Date() };
    toolCallStore.set(id, data);
    return data;
  } catch (error) {
    throw new Error(`Error creating tool call: ${error.message}`);
  }
}

/**
 * Get a tool call by ID
 * @param {string} id - The tool call document ID
 * @returns {Promise<IToolCallData|null>} The tool call document or null if not found
 */
async function getToolCallById(id) {
  try {
    return toolCallStore.get(id) || null;
  } catch (error) {
    throw new Error(`Error fetching tool call: ${error.message}`);
  }
}

/**
 * Get tool calls by message ID and user
 * @param {string} messageId - The message ID
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<Array>} Array of tool call documents
 */
async function getToolCallsByMessage(messageId, userId) {
  try {
    return Array.from(toolCallStore.values()).filter(tc => tc.messageId === messageId && tc.user === userId);
  } catch (error) {
    throw new Error(`Error fetching tool calls: ${error.message}`);
  }
}

/**
 * Get tool calls by conversation ID and user
 * @param {string} conversationId - The conversation ID
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<IToolCallData[]>} Array of tool call documents
 */
async function getToolCallsByConvo(conversationId, userId) {
  try {
    return Array.from(toolCallStore.values()).filter(tc => tc.conversationId === conversationId && tc.user === userId);
  } catch (error) {
    throw new Error(`Error fetching tool calls: ${error.message}`);
  }
}

/**
 * Update a tool call
 * @param {string} id - The tool call document ID
 * @param {Partial<IToolCallData>} updateData - The data to update
 * @returns {Promise<IToolCallData|null>} The updated tool call document or null if not found
 */
async function updateToolCall(id, updateData) {
  try {
    const existing = toolCallStore.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updateData, updatedAt: new Date() };
    toolCallStore.set(id, updated);
    return updated;
  } catch (error) {
    throw new Error(`Error updating tool call: ${error.message}`);
  }
}

/**
 * Delete a tool call
 * @param {string} userId - The related user's ObjectId
 * @param {string} [conversationId] - The tool call conversation ID
 * @returns {Promise<{ ok?: number; n?: number; deletedCount?: number }>} The result of the delete operation
 */
async function deleteToolCalls(userId, conversationId) {
  try {
    let count = 0;
    for (const [id, tc] of toolCallStore.entries()) {
      if (tc.user === userId && (!conversationId || tc.conversationId === conversationId)) {
        toolCallStore.delete(id);
        count++;
      }
    }
    return { deletedCount: count };
  } catch (error) {
    throw new Error(`Error deleting tool call: ${error.message}`);
  }
}

module.exports = {
  createToolCall,
  updateToolCall,
  deleteToolCalls,
  getToolCallById,
  getToolCallsByConvo,
  getToolCallsByMessage,
};
