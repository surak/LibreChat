import { AccessRoleIds, ResourceType, PermissionBits } from 'librechat-data-provider';
import type { IAccessRole } from '~/types';
import { RoleBits } from '~/common';
import { nanoid } from 'nanoid';

const accessRoleStore = new Map<string, IAccessRole>();

// Factory function that returns the methods
export function createAccessRoleMethods() {
  /**
   * Find an access role by its ID
   */
  async function findRoleById(roleId: string): Promise<IAccessRole | null> {
    return Array.from(accessRoleStore.values()).find(r => r._id === roleId) || null;
  }

  /**
   * Find an access role by its unique identifier
   */
  async function findRoleByIdentifier(
    accessRoleId: string,
  ): Promise<IAccessRole | null> {
    return accessRoleStore.get(accessRoleId) || null;
  }

  /**
   * Find all access roles for a specific resource type
   */
  async function findRolesByResourceType(resourceType: string): Promise<IAccessRole[]> {
    return Array.from(accessRoleStore.values()).filter(r => r.resourceType === resourceType);
  }

  /**
   * Find an access role by resource type and permission bits
   */
  async function findRoleByPermissions(
    resourceType: string,
    permBits: PermissionBits | RoleBits,
  ): Promise<IAccessRole | null> {
    return Array.from(accessRoleStore.values()).find(r => r.resourceType === resourceType && r.permBits === permBits) || null;
  }

  /**
   * Create a new access role
   */
  async function createRole(roleData: Partial<IAccessRole>): Promise<IAccessRole> {
    const id = nanoid();
    const accessRoleId = (roleData.accessRoleId as string) || id;
    const newRole: IAccessRole = {
      _id: id,
      ...roleData,
    } as any;
    accessRoleStore.set(accessRoleId, newRole);
    return newRole;
  }

  /**
   * Update an existing access role
   */
  async function updateRole(
    accessRoleId: string,
    updateData: Partial<IAccessRole>,
  ): Promise<IAccessRole | null> {
    const existing = accessRoleStore.get(accessRoleId);
    if (!existing) return null;
    const updated = { ...existing, ...updateData };
    accessRoleStore.set(accessRoleId, updated);
    return updated;
  }

  /**
   * Delete an access role
   */
  async function deleteRole(accessRoleId: string): Promise<any> {
    const deleted = accessRoleStore.delete(accessRoleId);
    return { deletedCount: deleted ? 1 : 0 };
  }

  /**
   * Get all predefined roles
   */
  async function getAllRoles(): Promise<IAccessRole[]> {
    return Array.from(accessRoleStore.values());
  }

  /**
   * Seed default roles
   */
  async function seedDefaultRoles() {
    const defaultRoles = [
      {
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        name: 'com_ui_role_viewer',
        description: 'com_ui_role_viewer_desc',
        resourceType: ResourceType.AGENT,
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        name: 'com_ui_role_editor',
        description: 'com_ui_role_editor_desc',
        resourceType: ResourceType.AGENT,
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        name: 'com_ui_role_owner',
        description: 'com_ui_role_owner_desc',
        resourceType: ResourceType.AGENT,
        permBits: RoleBits.OWNER,
      },
      {
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        name: 'com_ui_role_viewer',
        description: 'com_ui_role_viewer_desc',
        resourceType: ResourceType.PROMPTGROUP,
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
        name: 'com_ui_role_editor',
        description: 'com_ui_role_editor_desc',
        resourceType: ResourceType.PROMPTGROUP,
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        name: 'com_ui_role_owner',
        description: 'com_ui_role_owner_desc',
        resourceType: ResourceType.PROMPTGROUP,
        permBits: RoleBits.OWNER,
      },
      {
        accessRoleId: AccessRoleIds.MCPSERVER_VIEWER,
        name: 'com_ui_mcp_server_role_viewer',
        description: 'com_ui_mcp_server_role_viewer_desc',
        resourceType: ResourceType.MCPSERVER,
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: AccessRoleIds.MCPSERVER_EDITOR,
        name: 'com_ui_mcp_server_role_editor',
        description: 'com_ui_mcp_server_role_editor_desc',
        resourceType: ResourceType.MCPSERVER,
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: AccessRoleIds.MCPSERVER_OWNER,
        name: 'com_ui_mcp_server_role_owner',
        description: 'com_ui_mcp_server_role_owner_desc',
        resourceType: ResourceType.MCPSERVER,
        permBits: RoleBits.OWNER,
      },
      {
        accessRoleId: AccessRoleIds.REMOTE_AGENT_VIEWER,
        name: 'com_ui_remote_agent_role_viewer',
        description: 'com_ui_remote_agent_role_viewer_desc',
        resourceType: ResourceType.REMOTE_AGENT,
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: AccessRoleIds.REMOTE_AGENT_EDITOR,
        name: 'com_ui_remote_agent_role_editor',
        description: 'com_ui_remote_agent_role_editor_desc',
        resourceType: ResourceType.REMOTE_AGENT,
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
        name: 'com_ui_remote_agent_role_owner',
        description: 'com_ui_remote_agent_role_owner_desc',
        resourceType: ResourceType.REMOTE_AGENT,
        permBits: RoleBits.OWNER,
      },
    ];

    const result: Record<string, IAccessRole> = {};

    for (const role of defaultRoles) {
      if (!accessRoleStore.has(role.accessRoleId)) {
        const id = nanoid();
        const newRole: IAccessRole = { _id: id, ...role } as any;
        accessRoleStore.set(role.accessRoleId, newRole);
        result[role.accessRoleId] = newRole;
      } else {
        result[role.accessRoleId] = accessRoleStore.get(role.accessRoleId)!;
      }
    }

    return result;
  }

  /**
   * Helper to get the appropriate role for a set of permissions
   */
  async function getRoleForPermissions(
    resourceType: string,
    permBits: PermissionBits | RoleBits,
  ): Promise<IAccessRole | null> {
    const exactMatch = await findRoleByPermissions(resourceType, permBits);
    if (exactMatch) {
      return exactMatch;
    }

    const roles = Array.from(accessRoleStore.values())
       .filter(r => r.resourceType === resourceType)
       .sort((a, b) => (b.permBits as number) - (a.permBits as number));

    return roles.find((role) => ((role.permBits as number) & (permBits as number)) === role.permBits) || null;
  }

  return {
    createRole,
    updateRole,
    deleteRole,
    getAllRoles,
    findRoleById,
    seedDefaultRoles,
    findRoleByIdentifier,
    getRoleForPermissions,
    findRoleByPermissions,
    findRolesByResourceType,
  };
}

export type AccessRoleMethods = ReturnType<typeof createAccessRoleMethods>;
