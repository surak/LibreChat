export interface IPrompt {
  _id: string;
  groupId: string;
  author: string;
  prompt: string;
  type: 'text' | 'chat';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptGroup {
  _id: string;
  name: string;
  numberOfGenerations: number;
  oneliner: string;
  category: string;
  projectIds: string[];
  productionId: string;
  author: string;
  authorName: string;
  command?: string;
  createdAt?: Date;
  updatedAt?: Date;
  isPublic?: boolean;
}

export interface IPromptGroupDocument extends IPromptGroup {}
