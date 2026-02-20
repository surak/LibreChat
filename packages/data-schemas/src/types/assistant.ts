export interface IAssistant {
  _id: string;
  user: string;
  assistant_id: string;
  avatar?: {
    filepath: string;
    source: string;
  };
  conversation_starters?: string[];
  access_level?: number;
  file_ids?: string[];
  actions?: string[];
  append_current_datetime?: boolean;
}
