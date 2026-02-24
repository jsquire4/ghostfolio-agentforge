export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  totalCount?: number;
}

export interface StreamChunk {
  type: 'token' | 'tool_start' | 'tool_result' | 'verification' | 'done';
  content: string;
  metadata?: Record<string, unknown>;
}
