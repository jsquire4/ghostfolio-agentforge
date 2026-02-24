import { z } from 'zod';

// ─── Enums & Shared Types ───────────────────────────────────────────

export type ToolCategory = 'read' | 'write' | 'analysis';

// ─── Auth Modes ─────────────────────────────────────────────────────

export interface UserAuth {
  mode: 'user';
  jwt: string;
}

export interface ServiceAuth {
  mode: 'service';
  token: string;
}

export type GhostfolioAuth = UserAuth | ServiceAuth;

// ─── Tool Layer ─────────────────────────────────────────────────────

interface BaseToolContext {
  userId: string;
  abortSignal: AbortSignal;
  auth: GhostfolioAuth;
}

export interface UserToolContext extends BaseToolContext {
  auth: UserAuth;
}

export interface ServiceToolContext extends BaseToolContext {
  auth: ServiceAuth;
}

export type ToolContext = UserToolContext | ServiceToolContext;

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  category: ToolCategory;
  requiresConfirmation: boolean;
  timeout: number;
  tags?: string[];
  version?: string;
  dependsOn?: string[];
  execute: (params: unknown, context: ToolContext) => Promise<string>;
}

// ─── Ghostfolio Client Interface ─────────────────────────────────────

export interface IGhostfolioClient {
  get<T>(path: string, auth: GhostfolioAuth): Promise<T>;
  post<T>(path: string, body: unknown, auth: GhostfolioAuth): Promise<T>;
  delete<T>(path: string, auth: GhostfolioAuth): Promise<T>;
}

// ─── Tool Dependencies ───────────────────────────────────────────────

export interface ToolDeps {
  client: IGhostfolioClient;
}

export interface ToolCallRecord {
  toolName: string;
  params: unknown;
  result: string;
  calledAt: string;
  durationMs: number;
  success: boolean;
}

// ─── Verification Layer ─────────────────────────────────────────────

export interface VerificationResult {
  pass: boolean;
  warnings: string[];
  flags: string[];
}

export interface Verifier {
  name: string;
  order: number;
  verify: (
    response: string,
    toolCalls: ToolCallRecord[]
  ) => Promise<VerificationResult>;
}

// ─── HITL / Pending Actions ─────────────────────────────────────────

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

// ─── Chat DTOs ──────────────────────────────────────────────────────

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

// ─── Pagination ─────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  totalCount?: number;
}

// ─── Streaming ──────────────────────────────────────────────────────

export interface StreamChunk {
  type: 'token' | 'tool_start' | 'tool_result' | 'verification' | 'done';
  content: string;
  metadata?: Record<string, unknown>;
}

// ─── Audit ──────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  toolName?: string;
  params?: unknown;
  result?: string;
  timestamp: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

// ─── User Feedback ──────────────────────────────────────────────────

export interface FeedbackRecord {
  id: string;
  userId: string;
  conversationId: string;
  rating: 'up' | 'down';
  correction?: string;
  createdAt: string;
}

// ─── Insights (Tier 3 Memory) ───────────────────────────────────────

export interface InsightRecord {
  id: string;
  userId: string;
  category: string;
  summary: string;
  data?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
}

// ─── Multi-Agent Handoff ────────────────────────────────────────────

export interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  reason: string;
  context: Record<string, unknown>;
  toolCallHistory: ToolCallRecord[];
}

// ─── User Context (System Prompt) ───────────────────────────────────

export interface UserContext {
  userId: string;
  currency?: string;
  language?: string;
  permissions?: string[];
  aiPromptContext?: string;
}
