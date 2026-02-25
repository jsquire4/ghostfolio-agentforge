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
