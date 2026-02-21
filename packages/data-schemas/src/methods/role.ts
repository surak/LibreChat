import { roleDefaults, SystemRoles } from 'librechat-data-provider';

const roleStore = new Map<string, any>();

// Factory function that returns the methods
export function createRoleMethods() {
  /**
   * Initialize default roles in the system.
   */
  async function initializeRoles() {
    for (const roleName of [SystemRoles.ADMIN, SystemRoles.USER]) {
      let role = Array.from(roleStore.values()).find(r => r.name === roleName);
      const defaultPerms = roleDefaults[roleName].permissions;

      if (!role) {
        role = {
           name: roleName,
           ...roleDefaults[roleName],
           updatedAt: new Date().toISOString(),
           createdAt: new Date().toISOString()
        };
      } else {
        role.permissions = role.permissions || {};
        for (const permType of Object.keys(defaultPerms)) {
          if (role.permissions[permType] == null || Object.keys(role.permissions[permType]).length === 0) {
            role.permissions[permType] = defaultPerms[permType as keyof typeof defaultPerms];
          }
        }
        role.updatedAt = new Date().toISOString();
      }
      roleStore.set(roleName, role);
    }
  }

  /**
   * List all roles in the system
   */
  async function listRoles() {
    return Array.from(roleStore.values());
  }

  /**
   * Seed default roles (alias for initializeRoles)
   */
  async function seedDefaultRoles() {
    return await initializeRoles();
  }

  /**
   * Create a new role
   */
  async function createRole(data: any) {
    const role = {
      ...data,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    roleStore.set(data.name, role);
    return role;
  }

  /**
   * Find a role by filter
   */
  async function findOneRole(filter: any) {
    const roles = await listRoles();
    return roles.find(r => {
      for (const key in filter) {
        if (r[key] !== filter[key]) return false;
      }
      return true;
    }) || null;
  }

  /**
   * Update a role by filter
   */
  async function findOneAndUpdateRole(filter: any, update: any) {
    const role = await findOneRole(filter);
    if (!role) return null;
    const data = update.$set || update;
    Object.assign(role, data);
    role.updatedAt = new Date().toISOString();
    return role;
  }

  return {
    listRoles,
    initializeRoles,
    seedDefaultRoles,
    createRole,
    findOneRole,
    findOneAndUpdateRole,
  };
}

export type RoleMethods = ReturnType<typeof createRoleMethods>;
