import {
  ChatRequest,
  ChatResponse,
  PendingAction,
  ToolCallRecord,
  VerificationResult
} from '../app/common/interfaces';

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
