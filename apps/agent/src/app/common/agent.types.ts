import { ConsequenceLevel, ToolCallRecord, ToolCategory } from './tool.types';

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
  channel?: string;
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

export type OutputFormat = 'markdown' | 'plain' | 'csv' | 'html';

export interface ChannelCapabilities {
  channel: string;
  supportedFormats: OutputFormat[];
  maxResponseLength?: number;
}

export type HitlDecision = 'auto-approve' | 'confirm';

export type HitlMatrix = Record<
  ToolCategory,
  Record<ConsequenceLevel, HitlDecision>
>;

export const DEFAULT_HITL_MATRIX: HitlMatrix = {
  read: { low: 'auto-approve', medium: 'auto-approve', high: 'confirm' },
  analysis: { low: 'auto-approve', medium: 'auto-approve', high: 'confirm' },
  write: { low: 'confirm', medium: 'confirm', high: 'confirm' }
};

export interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  reason: string;
  context: Record<string, unknown>;
  toolCallHistory: ToolCallRecord[];
}
