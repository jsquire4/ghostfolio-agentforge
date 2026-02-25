// Shared eval types for golden, labeled, and rubric eval tiers.
// Both golden and labeled hit the live agent via POST /api/v1/chat.
// Golden = deterministic known-answer prompts, labeled = routing + quality.

// ── Shared Chat Response ────────────────────────────────────

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

// ── Golden Eval ─────────────────────────────────────────────
// Sends a known prompt through the full agent loop (LLM + real Ghostfolio API).
// Asserts on tool selection, tool success, and response structure.

export interface GoldenEvalCase {
  id: string;
  description: string;
  input: { message: string };
  expect: {
    toolsCalled: string[]; // exact tools that must be called
    noToolErrors: boolean; // all tool calls succeed
    responseNonEmpty: boolean; // agent produced a response
    responseContains?: string[]; // substrings that must ALL appear (exact seed values)
    responseContainsAny?: string[][]; // at least one from EACH group must appear (synonym groups)
    responseNotContains?: string[]; // substrings that must NOT appear (cop-outs, imprecision, leaks)
    maxLatencyMs?: number; // response time budget
  };
}

// ── Labeled Eval ────────────────────────────────────────────
// Sends message through full agent loop via HTTP — tests tool routing
// under ambiguity, edge cases, and adversarial inputs.

export interface LabeledEvalCase {
  id: string;
  description: string;
  difficulty: 'straightforward' | 'ambiguous' | 'edge';
  input: { message: string };
  expect: {
    // Tool ROUTING assertions
    toolsCalled?: string[]; // exact tools that must appear
    toolsAcceptable?: string[][]; // any of these tool sets is valid
    toolsNotCalled?: string[]; // tools that must NOT be called

    noToolErrors?: boolean; // all toolCalls have success: true

    // Response quality assertions (all deterministic)
    responseNonEmpty?: boolean;
    responseContains?: string[]; // substrings that must ALL appear (exact seed values)
    responseContainsAny?: string[][]; // at least one from EACH group must appear (synonym groups)
    responseNotContains?: string[]; // substrings that must NOT appear (cop-outs, imprecision, leaks)
    responseMatches?: string[]; // regex patterns the response must match
    verifiersPassed?: boolean; // warnings and flags arrays are empty
    maxLatencyMs?: number; // response must arrive within this budget
    maxTokens?: number; // response token count ceiling
  };
}

// ── Rubric Eval (STUB) ─────────────────────────────────────
// Reserved for scored multi-dimensional evaluation. Not implemented in v1.

export interface RubricEvalCase {
  id: string;
  description: string;
  input: { message: string };
  rubric: {
    dimension: string; // e.g. "accuracy", "completeness", "safety"
    maxScore: number;
    criteria: string; // what each score level means
  }[];
}

// ── Result Types ────────────────────────────────────────────

export interface EvalCaseResult {
  id: string;
  description: string;
  passed: boolean;
  durationMs: number;
  error?: string; // failure reason
  details?: Record<string, unknown>; // extra info (tools, ttft, cost, prompt, response, etc.)
}

export interface EvalSuiteResult {
  tier: 'golden' | 'labeled';
  cases: EvalCaseResult[];
  totalPassed: number;
  totalFailed: number;
  totalDurationMs: number;
  estimatedCost?: number;
}
