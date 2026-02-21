const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;
const { project: Project } = require('./index');

/**
 * Retrieve a project by ID and convert the found project document to a plain object.
 *
 * @param {string} projectId - The ID of the project to find and return as a plain object.
 * @param {string|string[]} [_fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<Object>} A plain object representing the project document, or `null` if no project is found.
 */
const getProjectById = async function (projectId) {
  return await Project.findOne({ _id: projectId });
};

/**
 * Retrieve a project by name and convert the found project document to a plain object.
 * If the project with the given name doesn't exist and the name is "instance", create it and return the lean version.
 *
 * @param {string} projectName - The name of the project to find or create.
 * @param {string|string[]} [_fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<Object>} A plain object representing the project document.
 */
const getProjectByName = async function (projectName) {
  let project = await Project.findOne({ name: projectName });

  if (!project && projectName === GLOBAL_PROJECT_NAME) {
    project = await Project.create({ name: projectName, promptGroupIds: [], agentIds: [] });
    return project;
  }

  return project;
};

/**
 * Add an array of prompt group IDs to a project's promptGroupIds array, ensuring uniqueness.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} promptGroupIds - The array of prompt group IDs to add to the project.
 * @returns {Promise<Object>} The updated project document.
 */
const addGroupIdsToProject = async function (projectId, promptGroupIds) {
  const project = await Project.findOne({ _id: projectId });
  if (project) {
    const existingIds = new Set(project.promptGroupIds || []);
    for (const id of promptGroupIds) {
      existingIds.add(id);
    }
    project.promptGroupIds = Array.from(existingIds);
    project.updatedAt = new Date();
  }
  return project;
};

/**
 * Remove an array of prompt group IDs from a project's promptGroupIds array.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} promptGroupIds - The array of prompt group IDs to remove from the project.
 * @returns {Promise<Object>} The updated project document.
 */
const removeGroupIdsFromProject = async function (projectId, promptGroupIds) {
  const project = await Project.findOne({ _id: projectId });
  if (project) {
    const existingIds = project.promptGroupIds || [];
    project.promptGroupIds = existingIds.filter(id => !promptGroupIds.includes(id));
    project.updatedAt = new Date();
  }
  return project;
};

/**
 * Remove a prompt group ID from all projects.
 *
 * @param {string} promptGroupId - The ID of the prompt group to remove from projects.
 * @returns {Promise<void>}
 */
const removeGroupFromAllProjects = async (promptGroupId) => {
  const projects = await Project.find({});
  for (const project of projects) {
    if (project.promptGroupIds && project.promptGroupIds.includes(promptGroupId)) {
      project.promptGroupIds = project.promptGroupIds.filter(pid => pid !== promptGroupId);
      project.updatedAt = new Date();
    }
  }
};

/**
 * Add an array of agent IDs to a project's agentIds array, ensuring uniqueness.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} agentIds - The array of agent IDs to add to the project.
 * @returns {Promise<Object>} The updated project document.
 */
const addAgentIdsToProject = async function (projectId, agentIds) {
  const project = await Project.findOne({ _id: projectId });
  if (project) {
    const existingIds = new Set(project.agentIds || []);
    for (const id of agentIds) {
      existingIds.add(id);
    }
    project.agentIds = Array.from(existingIds);
    project.updatedAt = new Date();
  }
  return project;
};

/**
 * Remove an array of agent IDs from a project's agentIds array.
 *
 * @param {string} projectId - The ID of the project to update.
 * @param {string[]} agentIds - The array of agent IDs to remove from the project.
 * @returns {Promise<Object>} The updated project document.
 */
const removeAgentIdsFromProject = async function (projectId, agentIds) {
  const project = await Project.findOne({ _id: projectId });
  if (project) {
    const existingIds = project.agentIds || [];
    project.agentIds = existingIds.filter(id => !agentIds.includes(id));
    project.updatedAt = new Date();
  }
  return project;
};

/**
 * Remove an agent ID from all projects.
 *
 * @param {string} agentId - The ID of the agent to remove from projects.
 * @returns {Promise<void>}
 */
const removeAgentFromAllProjects = async (agentId) => {
  const projects = await Project.find({});
  for (const project of projects) {
    if (project.agentIds && project.agentIds.includes(agentId)) {
      project.agentIds = project.agentIds.filter(aid => aid !== agentId);
      project.updatedAt = new Date();
    }
  }
};

module.exports = {
  getProjectById,
  getProjectByName,
  /* prompts */
  addGroupIdsToProject,
  removeGroupIdsFromProject,
  removeGroupFromAllProjects,
  /* agents */
  addAgentIdsToProject,
  removeAgentIdsFromProject,
  removeAgentFromAllProjects,
};
