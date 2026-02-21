// Base memory interfaces
export interface IMemoryEntry {
  _id: string;
  userId: string;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
}

export interface IMemoryEntryLean {
  _id: string;
  userId: string;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
  __v?: number;
}

// Method parameter interfaces
export interface SetMemoryParams {
  userId: string;
  key: string;
  value: string;
  tokenCount?: number;
}

export interface DeleteMemoryParams {
  userId: string;
  key: string;
}

export interface GetFormattedMemoriesParams {
  userId: string;
}

// Result interfaces
export interface MemoryResult {
  ok: boolean;
}

export interface FormattedMemoriesResult {
  withKeys: string;
  withoutKeys: string;
  totalTokens?: number;
}
