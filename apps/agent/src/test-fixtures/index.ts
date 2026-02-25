import {
  ChatRequest,
  ChatResponse,
  PendingAction,
  ToolCallRecord,
  ToolDefinition,
  VerificationResult
} from '../app/common/interfaces';
import {
  EvalCaseResultRecord,
  EvalRunRecord,
  InsightRecord,
  RequestMetrics,
  ToolMetricsRecord
} from '../app/common/storage.types';

export function makeToolCallRecord(
  overrides?: Partial<ToolCallRecord>
): ToolCallRecord {
  return {
    toolName: 'test_tool',
    params: {},
    result: JSON.stringify({
      tool: 'test_tool',
      fetchedAt: '2025-01-01T00:00:00.000Z',
      data: {}
    }),
    calledAt: '2025-01-01T00:00:00.000Z',
    durationMs: 100,
    success: true,
    ...overrides
  };
}

export function makeVerificationResult(
  overrides?: Partial<VerificationResult>
): VerificationResult {
  return { pass: true, warnings: [], flags: [], ...overrides };
}

export function makePendingAction(
  overrides?: Partial<PendingAction>
): PendingAction {
  return {
    id: 'test-action-id',
    toolName: 'test_tool',
    category: 'write',
    proposedParams: {},
    description: 'Test action',
    status: 'pending',
    createdAt: '2025-01-01T00:00:00.000Z',
    expiresAt: '2025-01-01T00:15:00.000Z',
    ...overrides
  };
}

export function makeChatRequest(overrides?: Partial<ChatRequest>): ChatRequest {
  return { message: 'Test message', ...overrides };
}

export function makeChatResponse(
  overrides?: Partial<ChatResponse>
): ChatResponse {
  return {
    message: '',
    conversationId: 'test-conv-id',
    toolCalls: [],
    pendingConfirmations: [],
    warnings: [],
    flags: [],
    ...overrides
  };
}

export function makeEvalRunRecord(
  overrides?: Partial<EvalRunRecord>
): EvalRunRecord {
  return {
    id: 'run-1',
    gitSha: 'abc123',
    tier: 'golden',
    totalPassed: 5,
    totalFailed: 1,
    passRate: 0.833,
    totalDurationMs: 3000,
    runAt: '2025-06-15T12:00:00.000Z',
    ...overrides
  };
}

export function makeEvalCaseResultRecord(
  overrides?: Partial<EvalCaseResultRecord>
): EvalCaseResultRecord {
  return {
    id: 'case-1',
    runId: 'run-1',
    caseId: 'gs-001',
    passed: true,
    durationMs: 500,
    ...overrides
  };
}

export function makeRequestMetrics(
  overrides?: Partial<RequestMetrics>
): RequestMetrics {
  return {
    id: 'metric-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    requestedAt: '2025-06-15T12:00:00.000Z',
    totalLatencyMs: 500,
    tokensIn: 1000,
    tokensOut: 500,
    estimatedCostUsd: 0.00045,
    toolCallCount: 2,
    toolSuccessCount: 2,
    toolSuccessRate: 1.0,
    verifierWarningCount: 1,
    verifierFlagCount: 0,
    ...overrides
  };
}

export function makeToolMetricsRecord(
  overrides?: Partial<ToolMetricsRecord>
): ToolMetricsRecord {
  return {
    id: 'tm-1',
    requestMetricsId: 'req-1',
    toolName: 'portfolio-summary',
    calledAt: '2025-06-15T12:00:00.000Z',
    durationMs: 200,
    success: true,
    ...overrides
  };
}

export function makeToolDefinition(
  overrides: Partial<ToolDefinition> &
    Pick<ToolDefinition, 'name' | 'description' | 'category'>
): ToolDefinition {
  return {
    schema: {},
    consequenceLevel: 'low',
    requiresConfirmation: false,
    timeout: 5000,
    execute: (() =>
      Promise.resolve({
        tool: 'test',
        fetchedAt: ''
      })) as ToolDefinition['execute'],
    ...overrides
  } as unknown as ToolDefinition;
}

export function makeInsight(overrides?: Partial<InsightRecord>): InsightRecord {
  return {
    id: 'ins-1',
    userId: 'user-1',
    category: 'verification',
    summary: 'Test summary',
    data: { key: 'value' },
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  };
}
