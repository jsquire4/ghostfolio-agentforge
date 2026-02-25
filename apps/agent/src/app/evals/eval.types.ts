// In-process eval types — ported from evals/types.ts for production use.

export interface ChatResponseShape {
  message: string;
  conversationId: string;
  toolCalls: {
    toolName: string;
    params: unknown;
    result: string;
    calledAt: string;
    durationMs: number;
    success: boolean;
  }[];
  pendingConfirmations: unknown[];
  warnings: string[];
  flags: string[];
}

export interface GoldenEvalCase {
  id: string;
  description: string;
  input: { message: string };
  expect: {
    toolsCalled: string[];
    noToolErrors: boolean;
    responseNonEmpty: boolean;
    responseContains?: string[];
    responseContainsAny?: string[][];
    responseNotContains?: string[];
    maxLatencyMs?: number;
  };
}

export interface LabeledEvalCase {
  id: string;
  description: string;
  difficulty: 'straightforward' | 'ambiguous' | 'edge';
  input: { message: string };
  expect: {
    toolsCalled?: string[];
    toolsAcceptable?: string[][];
    toolsNotCalled?: string[];
    noToolErrors?: boolean;
    responseNonEmpty?: boolean;
    responseContains?: string[];
    responseContainsAny?: string[][];
    responseNotContains?: string[];
    responseMatches?: string[];
    verifiersPassed?: boolean;
    maxLatencyMs?: number;
    maxTokens?: number;
  };
}

export interface EvalCaseResult {
  id: string;
  description: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface EvalSuiteResult {
  tier: 'golden' | 'labeled';
  cases: EvalCaseResult[];
  totalPassed: number;
  totalFailed: number;
  totalDurationMs: number;
  estimatedCost?: number;
}
