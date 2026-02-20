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

  return {
    listRoles,
    initializeRoles,
  };
}

export type RoleMethods = ReturnType<typeof createRoleMethods>;
