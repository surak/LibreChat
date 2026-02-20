export interface IToken {
  _id: string;
  userId: string;
  email?: string;
  type?: string;
  identifier?: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Map<string, unknown>;
}

export interface TokenCreateData {
  userId: string;
  email?: string;
  type?: string;
  identifier?: string;
  token: string;
  expiresIn: number;
  metadata?: Map<string, unknown>;
}

export interface TokenQuery {
  userId?: string;
  token?: string;
  email?: string;
  identifier?: string;
}

export interface TokenUpdateData {
  email?: string;
  type?: string;
  identifier?: string;
  token?: string;
  expiresAt?: Date;
  expiresIn?: number;
  metadata?: Map<string, unknown>;
}

export interface TokenDeleteResult {
  deletedCount?: number;
}
