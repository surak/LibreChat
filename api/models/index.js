const { createMethods } = require('@librechat/data-schemas');
const methods = createMethods();
const { comparePassword } = require('./userMethods');
const {
  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,
} = require('./Message');
const { getConvoTitle, getConvo, saveConvo, deleteConvos } = require('./Conversation');
const { getPreset, getPresets, savePreset, deletePresets } = require('./Preset');

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
};

const aclEntry = {
  find: methods.findAclEntries,
  findOne: methods.findOneAclEntry,
  deleteMany: methods.deleteManyAclEntries,
  findOneAndDelete: methods.findOneAndDeleteAclEntry,
  findOneAndUpdate: methods.findOneAndUpdateAclEntry,
};

const userGroup = {
  find: methods.findGroups,
  findOne: methods.findOneGroup,
  create: methods.createGroup,
  updateMany: methods.updateManyGroups,
  findOneAndUpdate: methods.findOneAndUpdateGroup,
};

const accessRole = {
  find: methods.findRolesByResourceType,
  findOne: methods.findRoleByIdentifier,
  create: methods.createRole,
};

const role = {
  find: async (filter) => {
    const roles = await methods.listRoles();
    if (!filter || Object.keys(filter).length === 0) return roles;
    return roles.filter(r => {
      for (const key in filter) {
        if (r[key] !== filter[key]) return false;
      }
      return true;
    });
  },
  findOne: methods.findOneRole,
  create: methods.createRole,
  findOneAndUpdate: methods.findOneAndUpdateRole,
};

const balance = {
  findOne: methods.findOneBalance,
  findOneAndUpdate: methods.findOneAndUpdateBalance,
};

const transaction = {
  create: methods.createTransaction,
  find: methods.findTransactions,
  findOneAndUpdate: methods.findOneAndUpdateTransaction,
};

const action = {
  find: methods.findActions,
  findOne: methods.findOneAction,
  findOneAndUpdate: methods.findOneAndUpdateAction,
  findOneAndDelete: methods.findOneAndDeleteAction,
  deleteMany: methods.deleteManyActions,
};

const assistant = {
  find: methods.findAssistants,
  findOne: methods.findOneAssistant,
  findOneAndUpdate: methods.findOneAndUpdateAssistant,
  findOneAndDelete: methods.findOneAndDeleteAssistant,
  deleteMany: methods.deleteManyAssistants,
};

const banner = {
  find: methods.findBanners,
  findOne: methods.findOneBanner,
  findOneAndUpdate: methods.findOneAndUpdateBanner,
  findOneAndDelete: methods.findOneAndDeleteBanner,
  deleteMany: methods.deleteManyBanners,
};

const prompt = {
  find: methods.findPrompts,
  findOne: methods.findOnePrompt,
  create: methods.createPrompt,
  findOneAndUpdate: methods.findOneAndUpdatePrompt,
  deleteMany: methods.deleteManyPrompts,
};

const promptGroup = {
  find: methods.findPromptGroups,
  findOne: methods.findOnePromptGroup,
  create: methods.createPromptGroup,
  findOneAndUpdate: methods.findOneAndUpdatePromptGroup,
  deleteOne: methods.deleteOnePromptGroup,
};

const project = {
  find: methods.findProjects,
  findOne: methods.findOneProject,
  create: methods.createProject,
};

const conversationTag = {
  find: methods.findConversationTags,
  findOne: methods.findOneConversationTag,
  create: methods.createConversationTag,
  deleteMany: methods.deleteManyConversationTags,
};

const agent = {
  find: methods.findAgents,
  findOne: methods.findOneAgent,
  create: methods.createAgent,
  findOneAndUpdate: methods.findOneAndUpdateAgent,
  deleteOne: methods.deleteOneAgent,
  findOneAndDelete: methods.deleteOneAgent,
  countDocuments: methods.countAgents,
  updateMany: async () => ({ modifiedCount: 0 }), // minimal shim
};

const User = {
  findOne: methods.findUser,
  findById: methods.getUserById,
  create: methods.createUser,
  findOneAndUpdate: methods.updateUser,
  countDocuments: methods.countUsers,
  updateMany: async (filter, update) => {
     const users = await methods.listUsers();
     let count = 0;
     for (const user of users) {
        let match = true;
        for (const key in filter) {
           if (user[key] !== filter[key]) { match = false; break; }
        }
        if (match) {
           await methods.updateUser(user._id, update.$set || update);
           count++;
        }
     }
     return { modifiedCount: count };
  }
};

const Session = {
  create: methods.createSession,
  findOne: methods.findSession,
  deleteOne: methods.deleteSession,
};

module.exports = {
  ...methods,
  seedDatabase,
  comparePassword,

  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,

  getConvoTitle,
  getConvo,
  saveConvo,
  deleteConvos,

  getPreset,
  getPresets,
  savePreset,
  deletePresets,

  Files: {
    findFileById: methods.findFileById,
    getFiles: methods.getFiles,
    getToolFilesByIds: methods.getToolFilesByIds,
    getCodeGeneratedFiles: methods.getCodeGeneratedFiles,
    getUserCodeFiles: methods.getUserCodeFiles,
    createFile: methods.createFile,
    updateFile: methods.updateFile,
    updateFileUsage: methods.updateFileUsage,
    deleteFile: methods.deleteFile,
    deleteFiles: methods.deleteFiles,
    deleteFileByFilter: methods.deleteFileByFilter,
    batchUpdateFiles: methods.batchUpdateFiles,
  },

  aclEntry,
  userGroup,
  accessRole,
  role,
  balance,
  transaction,
  action,
  assistant,
  banner,
  prompt,
  promptGroup,
  project,
  conversationTag,
  agent,
  User,
  Session,
};
