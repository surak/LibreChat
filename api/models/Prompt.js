const { escapeRegExp } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  Constants,
  SystemRoles,
  ResourceType,
  SystemCategories,
} = require('librechat-data-provider');
const {
  removeGroupFromAllProjects,
  removeGroupIdsFromProject,
  addGroupIdsToProject,
  getProjectByName,
} = require('./Project');
const { removeAllPermissions } = require('~/server/services/PermissionService');
const { promptGroup: PromptGroup, prompt: Prompt, aclEntry: AclEntry } = require('./index');

/**
 * Get all prompt groups with filters
 * @param {ServerRequest} req
 * @param {TPromptGroupsWithFilterRequest} filter
 * @returns {Promise<PromptGroupListResponse>}
 */
const getAllPromptGroups = async (req, filter) => {
  try {
    const { name, ...query } = filter;

    let searchShared = true;
    let searchSharedOnly = false;
    if (name) {
      query.name = new RegExp(escapeRegExp(name), 'i');
    }
    if (!query.category) {
      delete query.category;
    } else if (query.category === SystemCategories.MY_PROMPTS) {
      searchShared = false;
      delete query.category;
    } else if (query.category === SystemCategories.NO_CATEGORY) {
      query.category = '';
    } else if (query.category === SystemCategories.SHARED_PROMPTS) {
      searchSharedOnly = true;
      delete query.category;
    }

    let combinedQuery = query;

    if (searchShared) {
      const project = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, 'promptGroupIds');
      if (project && project.promptGroupIds && project.promptGroupIds.length > 0) {
        const projectQuery = { _id: { $in: project.promptGroupIds }, ...query };
        delete projectQuery.author;
        // In stateless mode we just combine the results later or use $or logic if supported by in-memory find
        combinedQuery = searchSharedOnly ? projectQuery : { $or: [projectQuery, query] };
      }
    }

    const groups = await PromptGroup.find(combinedQuery);

    // simulate lookup and project
    for (const group of groups) {
      if (group.productionId) {
        const productionPrompt = await Prompt.findOne({ _id: group.productionId });
        if (productionPrompt) {
          group.productionPrompt = { prompt: productionPrompt.prompt };
        }
      }
    }

    return groups;
  } catch (error) {
    console.error('Error getting all prompt groups', error);
    return { message: 'Error getting all prompt groups' };
  }
};

/**
 * Get prompt groups with filters
 * @param {ServerRequest} req
 * @param {TPromptGroupsWithFilterRequest} filter
 * @returns {Promise<PromptGroupListResponse>}
 */
const getPromptGroups = async (req, filter) => {
  try {
    const { pageNumber = 1, pageSize = 10, name, ...query } = filter;

    const validatedPageNumber = Math.max(parseInt(pageNumber, 10), 1);
    const validatedPageSize = Math.max(parseInt(pageSize, 10), 1);

    let searchShared = true;
    let searchSharedOnly = false;
    if (name) {
      query.name = new RegExp(escapeRegExp(name), 'i');
    }
    if (!query.category) {
      delete query.category;
    } else if (query.category === SystemCategories.MY_PROMPTS) {
      searchShared = false;
      delete query.category;
    } else if (query.category === SystemCategories.NO_CATEGORY) {
      query.category = '';
    } else if (query.category === SystemCategories.SHARED_PROMPTS) {
      searchSharedOnly = true;
      delete query.category;
    }

    let combinedQuery = query;

    if (searchShared) {
      const project = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, 'promptGroupIds');
      if (project && project.promptGroupIds && project.promptGroupIds.length > 0) {
        const projectQuery = { _id: { $in: project.promptGroupIds }, ...query };
        delete projectQuery.author;
        combinedQuery = searchSharedOnly ? projectQuery : { $or: [projectQuery, query] };
      }
    }

    const allGroups = await PromptGroup.find(combinedQuery);
    allGroups.sort((a, b) => b.createdAt - a.createdAt);

    const totalPromptGroups = allGroups.length;
    const skip = (validatedPageNumber - 1) * validatedPageSize;
    const paginatedGroups = allGroups.slice(skip, skip + validatedPageSize);

    for (const group of paginatedGroups) {
      if (group.productionId) {
        const productionPrompt = await Prompt.findOne({ _id: group.productionId });
        if (productionPrompt) {
          group.productionPrompt = { prompt: productionPrompt.prompt };
        }
      }
    }

    return {
      promptGroups: paginatedGroups,
      pageNumber: validatedPageNumber.toString(),
      pageSize: validatedPageSize.toString(),
      pages: Math.ceil(totalPromptGroups / validatedPageSize).toString(),
    };
  } catch (error) {
    console.error('Error getting prompt groups', error);
    return { message: 'Error getting prompt groups' };
  }
};

/**
 * @param {Object} fields
 * @param {string} fields._id
 * @param {string} fields.author
 * @param {string} fields.role
 * @returns {Promise<TDeletePromptGroupResponse>}
 */
const deletePromptGroup = async ({ _id, author, role }) => {
  const query = { _id };
  const groupQuery = { groupId: _id };

  if (author && role !== SystemRoles.ADMIN) {
    query.author = author;
    groupQuery.author = author;
  }

  const response = await PromptGroup.findOneAndDelete(query);

  if (!response) {
    throw new Error('Prompt group not found');
  }

  await Prompt.deleteMany(groupQuery);
  await removeGroupFromAllProjects(_id);

  try {
    await removeAllPermissions({ resourceType: ResourceType.PROMPTGROUP, resourceId: _id });
  } catch (error) {
    logger.error('Error removing promptGroup permissions:', error);
  }

  return { message: 'Prompt group deleted successfully' };
};

/**
 * Get prompt groups by accessible IDs with optional cursor-based pagination.
 * @param {Object} params - The parameters for getting accessible prompt groups.
 * @param {Array} [params.accessibleIds] - Array of prompt group IDs the user has ACL access to.
 * @param {Object} [params.otherParams] - Additional query parameters (including author filter).
 * @param {number} [params.limit] - Number of prompt groups to return (max 100). If not provided, returns all prompt groups.
 * @param {string} [params.after] - Cursor for pagination - get prompt groups after this cursor.
 * @returns {Promise<Object>} A promise that resolves to an object containing the prompt groups data and pagination info.
 */
async function getListPromptGroupsByAccess({
  accessibleIds = [],
  otherParams = {},
  limit = null,
  after = null,
}) {
  const isPaginated = limit !== null && limit !== undefined;
  const normalizedLimit = isPaginated ? Math.min(Math.max(1, parseInt(limit) || 20), 100) : null;

  const baseQuery = { ...otherParams, _id: { $in: accessibleIds } };

  const groups = await PromptGroup.find(baseQuery);
  groups.sort((a, b) => b.updatedAt - a.updatedAt);

  let filteredGroups = groups;
  if (after && typeof after === 'string' && after !== 'undefined' && after !== 'null') {
    try {
      const cursor = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
      const { updatedAt, _id } = cursor;
      const cursorDate = new Date(updatedAt);

      const index = groups.findIndex(g => g.updatedAt.getTime() === cursorDate.getTime() && g._id === _id);
      if (index !== -1) {
        filteredGroups = groups.slice(index + 1);
      }
    } catch (error) {
      logger.warn('Invalid cursor:', error.message);
    }
  }

  const hasMore = isPaginated ? filteredGroups.length > normalizedLimit : false;
  const data = isPaginated ? filteredGroups.slice(0, normalizedLimit) : filteredGroups;

  for (const group of data) {
    if (group.author) {
      group.author = group.author.toString();
    }
    if (group.productionId) {
      const productionPrompt = await Prompt.findOne({ _id: group.productionId });
      if (productionPrompt) {
        group.productionPrompt = { prompt: productionPrompt.prompt };
      }
    }
  }

  let nextCursor = null;
  if (isPaginated && hasMore && data.length > 0) {
    const lastGroup = data[data.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({
        updatedAt: lastGroup.updatedAt.toISOString(),
        _id: lastGroup._id.toString(),
      }),
    ).toString('base64');
  }

  return {
    object: 'list',
    data,
    first_id: data.length > 0 ? data[0]._id.toString() : null,
    last_id: data.length > 0 ? data[data.length - 1]._id.toString() : null,
    has_more: hasMore,
    after: nextCursor,
  };
}

module.exports = {
  getPromptGroups,
  deletePromptGroup,
  getAllPromptGroups,
  getListPromptGroupsByAccess,
  /**
   * Create a prompt and its respective group
   * @param {TCreatePromptRecord} saveData
   * @returns {Promise<TCreatePromptResponse>}
   */
  createPromptGroup: async (saveData) => {
    try {
      const { prompt, group, author, authorName } = saveData;

      let newPromptGroup = await PromptGroup.findOneAndUpdate(
        { ...group, author, authorName, productionId: null },
        { $set: { ...group, author, authorName, productionId: null } },
        { upsert: true },
      );

      const newPrompt = await Prompt.findOneAndUpdate(
        { ...prompt, author, groupId: newPromptGroup._id },
        { $set: { ...prompt, author, groupId: newPromptGroup._id } },
        { upsert: true },
      );

      newPromptGroup = await PromptGroup.findOneAndUpdate(
        { _id: newPromptGroup._id },
        { $set: { productionId: newPrompt._id } },
      );

      return {
        prompt: newPrompt,
        group: {
          ...newPromptGroup,
          productionPrompt: { prompt: newPrompt.prompt },
        },
      };
    } catch (error) {
      logger.error('Error saving prompt group', error);
      throw new Error('Error saving prompt group');
    }
  },
  /**
   * Save a prompt
   * @param {TCreatePromptRecord} saveData
   * @returns {Promise<TCreatePromptResponse>}
   */
  savePrompt: async (saveData) => {
    try {
      const { prompt, author } = saveData;
      const newPromptData = {
        ...prompt,
        author,
      };

      const newPrompt = await Prompt.create(newPromptData);
      return { prompt: newPrompt };
    } catch (error) {
      logger.error('Error saving prompt', error);
      return { message: 'Error saving prompt' };
    }
  },
  getPrompts: async (filter) => {
    try {
      const prompts = await Prompt.find(filter);
      return prompts.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      logger.error('Error getting prompts', error);
      return { message: 'Error getting prompts' };
    }
  },
  getPrompt: async (filter) => {
    try {
      return await Prompt.findOne(filter);
    } catch (error) {
      logger.error('Error getting prompt', error);
      return { message: 'Error getting prompt' };
    }
  },
  /**
   * Get prompt groups with filters
   * @param {TGetRandomPromptsRequest} filter
   * @returns {Promise<TGetRandomPromptsResponse>}
   */
  getRandomPromptGroups: async (filter) => {
    try {
      const allGroups = await PromptGroup.find({ category: { $ne: '' } });

      // Simple random sampling for in-memory
      const shuffled = allGroups.sort(() => 0.5 - Math.random());
      const skip = +filter.skip || 0;
      const limit = +filter.limit || 10;
      const result = shuffled.slice(skip, skip + limit);

      return { prompts: result };
    } catch (error) {
      logger.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  },
  getPromptGroupsWithPrompts: async (filter) => {
    try {
      const group = await PromptGroup.findOne(filter);
      if (!group) return null;

      const prompts = await Prompt.find({ groupId: group._id });
      return {
        ...group,
        prompts: prompts.map(p => {
          const { _id, __v, user, ...rest } = p;
          return rest;
        })
      };
    } catch (error) {
      logger.error('Error getting prompt groups', error);
      return { message: 'Error getting prompt groups' };
    }
  },
  getPromptGroup: async (filter) => {
    try {
      return await PromptGroup.findOne(filter);
    } catch (error) {
      logger.error('Error getting prompt group', error);
      return { message: 'Error getting prompt group' };
    }
  },
  /**
   * Deletes a prompt and its corresponding prompt group if it is the last prompt in the group.
   *
   * @param {Object} options - The options for deleting the prompt.
   * @param {string} options.promptId - The ID of the prompt to delete.
   * @param {string} options.groupId - The ID of the prompt's group.
   * @param {string} options.author - The ID of the prompt's author.
   * @param {string} options.role - The role of the prompt's author.
   * @return {Promise<TDeletePromptResponse>} An object containing the result of the deletion.
   */
  deletePrompt: async ({ promptId, groupId, author, role }) => {
    const query = { _id: promptId, groupId, author };
    if (role === SystemRoles.ADMIN) {
      delete query.author;
    }
    const deleted = await Prompt.findOneAndDelete(query);
    if (!deleted) {
      throw new Error('Failed to delete the prompt');
    }

    const remainingPrompts = await Prompt.find({ groupId });
    remainingPrompts.sort((a, b) => a.createdAt - b.createdAt);

    if (remainingPrompts.length === 0) {
      try {
        await removeAllPermissions({
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: groupId,
        });
      } catch (error) {
        logger.error('Error removing promptGroup permissions:', error);
      }

      await PromptGroup.findOneAndDelete({ _id: groupId });
      await removeGroupFromAllProjects(groupId);

      return {
        prompt: 'Prompt deleted successfully',
        promptGroup: {
          message: 'Prompt group deleted successfully',
          id: groupId,
        },
      };
    } else {
      const promptGroup = await PromptGroup.findOne({ _id: groupId });
      if (promptGroup && promptGroup.productionId.toString() === promptId.toString()) {
        await PromptGroup.findOneAndUpdate(
          { _id: groupId },
          { $set: { productionId: remainingPrompts[remainingPrompts.length - 1]._id } },
        );
      }

      return { prompt: 'Prompt deleted successfully' };
    }
  },
  /**
   * Delete all prompts and prompt groups created by a specific user.
   * @param {ServerRequest} req - The server request object.
   * @param {string} userId - The ID of the user whose prompts and prompt groups are to be deleted.
   */
  deleteUserPrompts: async (req, userId) => {
    try {
      const promptGroups = await getAllPromptGroups(req, { author: userId });

      if (promptGroups.length === 0) {
        return;
      }

      const groupIds = promptGroups.map((group) => group._id);

      for (const groupId of groupIds) {
        await removeGroupFromAllProjects(groupId);
      }

      await AclEntry.deleteMany({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: { $in: groupIds },
      });

      await PromptGroup.deleteMany({ author: userId });
      await Prompt.deleteMany({ author: userId });
    } catch (error) {
      logger.error('[deleteUserPrompts] General error:', error);
    }
  },
  /**
   * Update prompt group
   * @param {Partial<MongoPromptGroup>} filter - Filter to find prompt group
   * @param {Partial<MongoPromptGroup>} data - Data to update
   * @returns {Promise<TUpdatePromptGroupResponse>}
   */
  updatePromptGroup: async (filter, data) => {
    try {
      const updateOps = {};
      if (data.removeProjectIds) {
        for (const projectId of data.removeProjectIds) {
          await removeGroupIdsFromProject(projectId, [filter._id]);
        }

        updateOps.$pull = { projectIds: { $in: data.removeProjectIds } };
        delete data.removeProjectIds;
      }

      if (data.projectIds) {
        for (const projectId of data.projectIds) {
          await addGroupIdsToProject(projectId, [filter._id]);
        }

        updateOps.$addToSet = { projectIds: { $each: data.projectIds } };
        delete data.projectIds;
      }

      const updateData = { ...data, ...updateOps };
      const updatedDoc = await PromptGroup.findOneAndUpdate(filter, updateData);

      if (!updatedDoc) {
        throw new Error('Prompt group not found');
      }

      return updatedDoc;
    } catch (error) {
      logger.error('Error updating prompt group', error);
      return { message: 'Error updating prompt group' };
    }
  },
  /**
   * Function to make a prompt production based on its ID.
   * @param {String} promptId - The ID of the prompt to make production.
   * @returns {Object} The result of the production operation.
   */
  makePromptProduction: async (promptId) => {
    try {
      const prompt = await Prompt.findOne({ _id: promptId });

      if (!prompt) {
        throw new Error('Prompt not found');
      }

      await PromptGroup.findOneAndUpdate(
        { _id: prompt.groupId },
        { $set: { productionId: prompt._id } }
      );

      return {
        message: 'Prompt production made successfully',
      };
    } catch (error) {
      logger.error('Error making prompt production', error);
      return { message: 'Error making prompt production' };
    }
  },
  updatePromptLabels: async (_id, labels) => {
    try {
      const response = await Prompt.findOneAndUpdate({ _id }, { $set: { labels } });
      if (!response) {
        return { message: 'Prompt not found' };
      }
      return { message: 'Prompt labels updated successfully' };
    } catch (error) {
      logger.error('Error updating prompt labels', error);
      return { message: 'Error updating prompt labels' };
    }
  },
};
