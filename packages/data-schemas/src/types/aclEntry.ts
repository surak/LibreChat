import { PrincipalType, PrincipalModel, ResourceType } from 'librechat-data-provider';

export type AclEntry = {
  /** The type of principal (PrincipalType.USER, PrincipalType.GROUP, PrincipalType.PUBLIC) */
  principalType: PrincipalType;
  /** The ID of the principal (null for PrincipalType.PUBLIC, string for PrincipalType.ROLE) */
  principalId?: string;
  /** The model name for the principal (`PrincipalModel`) */
  principalModel?: PrincipalModel;
  /** The type of resource (`ResourceType`) */
  resourceType: ResourceType;
  /** The ID of the resource */
  resourceId: string;
  /** Permission bits for this entry */
  permBits: number;
  /** Optional role ID for predefined roles */
  roleId?: string;
  /** ID of the resource this permission is inherited from */
  inheritedFrom?: string;
  /** ID of the user who granted this permission */
  grantedBy?: string;
  /** When this permission was granted */
  grantedAt?: Date;
};

export type IAclEntry = AclEntry & {
  _id: string;
};
