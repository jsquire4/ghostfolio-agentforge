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

export interface FeedbackRecord {
  id: string;
  userId: string;
  conversationId: string;
  rating: 'up' | 'down';
  correction?: string;
  createdAt: string;
}

export interface RequestMetrics {
  id: string;
  userId: string;
  conversationId: string;
  requestedAt: string;
  totalLatencyMs: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  toolCallCount: number;
  toolSuccessCount: number;
  toolSuccessRate: number;
  verifierWarningCount: number;
  verifierFlagCount: number;
  channel?: string;
  langsmithRunId?: string;
}

export interface InsightRecord {
  id: string;
  userId: string;
  category: string;
  summary: string;
  data?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
}

export interface EvalRunRecord {
  id: string;
  gitSha: string;
  model?: string;
  tier: 'golden' | 'labeled';
  totalPassed: number;
  totalFailed: number;
  passRate: number;
  totalDurationMs: number;
  estimatedCost?: number;
  runAt: string;
}

export interface EvalCaseResultRecord {
  id: string;
  runId: string;
  caseId: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}
