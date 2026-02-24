import { ToolCallRecord, ToolCategory } from './tool.types';

export interface PendingAction {
  id: string;
  toolName: string;
  category: ToolCategory;
  proposedParams: unknown;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  toolCalls: ToolCallRecord[];
  pendingConfirmations: PendingAction[];
  warnings: string[];
  flags: string[];
}

export interface UserContext {
  userId: string;
  currency?: string;
  language?: string;
  permissions?: string[];
  aiPromptContext?: string;
}

export interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  reason: string;
  context: Record<string, unknown>;
  toolCallHistory: ToolCallRecord[];
}
