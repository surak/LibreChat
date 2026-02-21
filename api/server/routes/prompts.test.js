const express = require('express');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { createMethods } = require('@librechat/data-schemas');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} = require('librechat-data-provider');

// Mock modules before importing
jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/models/Role', () => ({
  getRoleByName: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  canAccessPromptViaGroup: jest.requireActual('~/server/middleware').canAccessPromptViaGroup,
  canAccessPromptGroupResource:
    jest.requireActual('~/server/middleware').canAccessPromptGroupResource,
}));

let app;
let promptRoutes;
let testUsers, testRoles;
let grantPermission;
let currentTestUser;
let methods;

// Helper function to set user in middleware
function setTestUser(app, user) {
  currentTestUser = user;
}

beforeAll(async () => {
  methods = createMethods();

  // Import permission service
  const permissionService = require('~/server/services/PermissionService');
  grantPermission = permissionService.grantPermission;

  // Create test data
  await setupTestData();

  // Setup Express app
  app = express();
  app.use(express.json());

  // Add user middleware before routes
  app.use((req, res, next) => {
    if (currentTestUser) {
      req.user = {
        ...currentTestUser,
        id: (currentTestUser.id || currentTestUser._id).toString(),
        _id: currentTestUser._id,
        name: currentTestUser.name,
        role: currentTestUser.role,
      };
    }
    next();
  });

  // Set default user
  currentTestUser = testUsers.owner;

  // Import routes after middleware is set up
  promptRoutes = require('./prompts');
  app.use('/api/prompts', promptRoutes);
});

afterEach(() => {
  // Always reset to owner user after each test for isolation
  if (currentTestUser !== testUsers.owner) {
    currentTestUser = testUsers.owner;
  }
});

afterAll(async () => {
  jest.clearAllMocks();
});

async function setupTestData() {
  // Create access roles for promptGroups
  testRoles = {
    viewer: await methods.accessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
      name: 'Viewer',
      resourceType: ResourceType.PROMPTGROUP,
      permBits: PermissionBits.VIEW,
    }),
    editor: await methods.accessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
      name: 'Editor',
      resourceType: ResourceType.PROMPTGROUP,
      permBits: PermissionBits.VIEW | PermissionBits.EDIT,
    }),
    owner: await methods.accessRole.create({
      accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
      name: 'Owner',
      resourceType: ResourceType.PROMPTGROUP,
      permBits:
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
    }),
  };

  // Create test users
  testUsers = {
    owner: await methods.user.create({
      _id: uuidv4(),
      name: 'Prompt Owner',
      email: 'owner@example.com',
      role: SystemRoles.USER,
    }),
    viewer: await methods.user.create({
      _id: uuidv4(),
      name: 'Prompt Viewer',
      email: 'viewer@example.com',
      role: SystemRoles.USER,
    }),
    editor: await methods.user.create({
      _id: uuidv4(),
      name: 'Prompt Editor',
      email: 'editor@example.com',
      role: SystemRoles.USER,
    }),
    noAccess: await methods.user.create({
      _id: uuidv4(),
      name: 'No Access',
      email: 'noaccess@example.com',
      role: SystemRoles.USER,
    }),
    admin: await methods.user.create({
      _id: uuidv4(),
      name: 'Admin',
      email: 'admin@example.com',
      role: SystemRoles.ADMIN,
    }),
  };

  // Mock getRoleByName
  const { getRoleByName } = require('~/models/Role');
  getRoleByName.mockImplementation((roleName) => {
    switch (roleName) {
      case SystemRoles.USER:
        return { permissions: { PROMPTS: { USE: true, CREATE: true } } };
      case SystemRoles.ADMIN:
        return { permissions: { PROMPTS: { USE: true, CREATE: true, SHARE: true } } };
      default:
        return null;
    }
  });
}

describe('Prompt Routes - ACL Permissions', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    // Clear stores for each test
    methods.prompt._store.clear();
    methods.promptGroup._store.clear();
    methods.aclEntry._store.clear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // Simple test to verify route is loaded
  it('should have routes loaded', async () => {
    const response = await request(app).get('/api/prompts/test-404');
    expect(response.status).not.toBe(500);
  });

  describe('POST /api/prompts - Create Prompt', () => {
    it('should create a prompt and grant owner permissions', async () => {
      const promptData = {
        prompt: {
          prompt: 'Test prompt content',
          type: 'text',
        },
        group: {
          name: 'Test Prompt Group',
        },
      };

      const response = await request(app).post('/api/prompts').send(promptData);

      expect(response.status).toBe(200);
      expect(response.body.prompt).toBeDefined();
      expect(response.body.prompt.prompt).toBe(promptData.prompt.prompt);

      // Check ACL entry was created
      const aclEntry = await methods.aclEntry.findOne({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: response.body.prompt.groupId,
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
      });

      expect(aclEntry).toBeTruthy();
      expect(aclEntry.roleId.toString()).toBe(testRoles.owner._id.toString());
    });
  });

  describe('GET /api/prompts/:promptId - Get Prompt', () => {
    let testPrompt;
    let testGroup;

    beforeEach(async () => {
      // Create a prompt group first
      testGroup = await methods.promptGroup.create({
        name: 'Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: uuidv4(),
      });

      // Create a prompt
      testPrompt = await methods.prompt.create({
        prompt: 'Test prompt for retrieval',
        name: 'Get Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: testGroup._id,
      });
    });

    it('should retrieve prompt when user has view permissions', async () => {
      // Grant view permissions on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: testUsers.owner._id,
      });

      const response = await request(app).get(`/api/prompts/${testPrompt._id}`);
      expect(response.status).toBe(200);
      expect(response.body._id).toBe(testPrompt._id.toString());
      expect(response.body.prompt).toBe(testPrompt.prompt);
    });

    it('should deny access when user has no permissions', async () => {
      // Change the user to one without access
      setTestUser(app, testUsers.noAccess);

      const response = await request(app).get(`/api/prompts/${testPrompt._id}`).expect(403);

      // Verify error response
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Insufficient permissions to access this promptGroup');
    });
  });

  describe('DELETE /api/prompts/:promptId - Delete Prompt', () => {
    let testPrompt;
    let testGroup;

    beforeEach(async () => {
      // Create group with prompt
      testGroup = await methods.promptGroup.create({
        name: 'Delete Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: uuidv4(),
      });

      testPrompt = await methods.prompt.create({
        prompt: 'Test prompt for deletion',
        name: 'Delete Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: testGroup._id,
      });

      // Add prompt to group
      await methods.promptGroup.findOneAndUpdate({ _id: testGroup._id }, { $set: { productionId: testPrompt._id, promptIds: [testPrompt._id] } });

      // Grant owner permissions on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        grantedBy: testUsers.owner._id,
      });
    });

    it('should delete prompt when user has delete permissions', async () => {
      const response = await request(app)
        .delete(`/api/prompts/${testPrompt._id}`)
        .query({ groupId: testGroup._id.toString() })
        .expect(200);

      expect(response.body.prompt).toBe('Prompt deleted successfully');

      // Verify prompt was deleted
      const deletedPrompt = await methods.prompt.findOne({ _id: testPrompt._id });
      expect(deletedPrompt).toBeNull();

      // Verify ACL entries were removed
      const aclEntries = await methods.aclEntry.find({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
      });
      expect(aclEntries).toHaveLength(0);
    });
  });

  describe('PATCH /api/prompts/:promptId/tags/production - Make Production', () => {
    let testPrompt;
    let testGroup;

    beforeEach(async () => {
      // Create group
      testGroup = await methods.promptGroup.create({
        name: 'Production Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: uuidv4(),
      });

      testPrompt = await methods.prompt.create({
        prompt: 'Test prompt for production',
        name: 'Production Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: testGroup._id,
      });
    });

    it('should make prompt production when user has edit permissions', async () => {
      // Grant edit permissions on the promptGroup
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
        grantedBy: testUsers.owner._id,
      });

      // Ensure owner user
      setTestUser(app, testUsers.owner);

      const response = await request(app)
        .patch(`/api/prompts/${testPrompt._id}/tags/production`)
        .expect(200);

      expect(response.body.message).toBe('Prompt production made successfully');

      // Verify the group was updated
      const updatedGroup = await methods.promptGroup.findOne({ _id: testGroup._id });
      expect(updatedGroup.productionId.toString()).toBe(testPrompt._id.toString());
    });
  });

  describe('Public Access', () => {
    let publicPrompt;
    let publicGroup;

    beforeEach(async () => {
      // Create a prompt group
      publicGroup = await methods.promptGroup.create({
        name: 'Public Test Group',
        category: 'testing',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: uuidv4(),
      });

      // Create a public prompt
      publicPrompt = await methods.prompt.create({
        prompt: 'Public prompt content',
        name: 'Public Test',
        author: testUsers.owner._id,
        type: 'text',
        groupId: publicGroup._id,
      });

      // Grant public viewer access on the promptGroup
      await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: publicGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: testUsers.owner._id,
      });
    });

    it('should allow any user to view public prompts', async () => {
      // Change user to someone without explicit permissions
      setTestUser(app, testUsers.noAccess);

      const response = await request(app).get(`/api/prompts/${publicPrompt._id}`).expect(200);

      expect(response.body._id).toBe(publicPrompt._id.toString());
    });
  });

  describe('PATCH /api/prompts/groups/:groupId - Update Prompt Group Security', () => {
    let testGroup;

    beforeEach(async () => {
      // Create a prompt group
      testGroup = await methods.promptGroup.create({
        name: 'Security Test Group',
        category: 'security-test',
        author: testUsers.owner._id,
        authorName: testUsers.owner.name,
        productionId: uuidv4(),
      });

      // Grant owner permissions
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: testGroup._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        grantedBy: testUsers.owner._id,
      });
    });

    it('should allow updating allowed fields (name, category, oneliner)', async () => {
      const updateData = {
        name: 'Updated Group Name',
        category: 'updated-category',
        oneliner: 'Updated description',
      };

      const response = await request(app)
        .patch(`/api/prompts/groups/${testGroup._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe(updateData.name);
      expect(response.body.category).toBe(updateData.category);
      expect(response.body.oneliner).toBe(updateData.oneliner);
    });

    it('should reject request with author field (400 Bad Request)', async () => {
      const maliciousUpdate = {
        name: 'Legit Update',
        author: testUsers.noAccess._id.toString(), // Try to change ownership
      };

      const response = await request(app)
        .patch(`/api/prompts/groups/${testGroup._id}`)
        .send(maliciousUpdate)
        .expect(400);

      expect(response.body.error).toBe('Invalid request body');
    });
  });
});
