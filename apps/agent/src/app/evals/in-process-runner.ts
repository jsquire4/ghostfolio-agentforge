// In-process eval runner — replaces the child-process approach so evals
// work inside the production Docker image (no ts-node / source tree needed).
import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { sign } from 'jsonwebtoken';
import { join, resolve } from 'path';

import {
  assertGoldenCase,
  assertLabeledCase,
  estimateTokens
} from './eval-assertions';
import { EvalSseEvent } from './eval-sse.types';
import {
  ChatResponseShape,
  EvalCaseResult,
  EvalSuiteResult,
  GoldenEvalCase,
  LabeledEvalCase
} from './eval.types';

const ASSETS_DIR = resolve(__dirname, 'assets', 'evals');
const COST_PER_TOKEN = 0.000003;

// ── Dataset loaders ─────────────────────────────────────────

function loadGoldenCases(tool?: string): GoldenEvalCase[] {
  const dir = join(ASSETS_DIR, 'golden');
  let files = readdirSync(dir).filter((f) => f.endsWith('.eval.json'));
  if (tool) {
    const kebab = tool.replace(/_/g, '-');
    files = files.filter((f) => f === `${kebab}.eval.json`);
  }
  const cases: GoldenEvalCase[] = [];
  for (const file of files) {
    const parsed: GoldenEvalCase[] = JSON.parse(
      readFileSync(join(dir, file), 'utf-8')
    );
    cases.push(...parsed);
  }
  return cases;
}

function loadLabeledCases(tool?: string): LabeledEvalCase[] {
  const dir = join(ASSETS_DIR, 'labeled');
  let files = readdirSync(dir).filter((f) => f.endsWith('.eval.json'));
  if (tool) {
    const kebab = tool.replace(/_/g, '-');
    files = files.filter((f) => f === `${kebab}.eval.json`);
  }
  const cases: LabeledEvalCase[] = [];
  for (const file of files) {
    const parsed: LabeledEvalCase[] = JSON.parse(
      readFileSync(join(dir, file), 'utf-8')
    );
    cases.push(...parsed);
  }
  return cases;
}

// ── JWT acquisition ─────────────────────────────────────────

async function getJwt(): Promise<string> {
  if (process.env.EVAL_JWT) {
    return process.env.EVAL_JWT;
  }

  const apiToken = process.env.GHOSTFOLIO_API_TOKEN;
  const ghostfolioUrl =
    process.env.GHOSTFOLIO_BASE_URL || 'http://localhost:3333';

  if (apiToken) {
    const response = await fetch(`${ghostfolioUrl}/api/v1/auth/anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: apiToken }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      throw new Error(
        `Failed to exchange GHOSTFOLIO_API_TOKEN for JWT (${response.status})`
      );
    }
    const data = (await response.json()) as { authToken: string };
    return data.authToken;
  }

  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'No EVAL_JWT, GHOSTFOLIO_API_TOKEN, or JWT_SECRET_KEY found'
    );
  }
  return sign({ id: 'eval-user', iat: Math.floor(Date.now() / 1000) }, secret);
}

// ── Chat request ────────────────────────────────────────────

async function chatRequest(
  message: string,
  conversationId: string,
  jwt: string,
  evalCaseId?: string
): Promise<{ response: ChatResponseShape; ttftMs: number; latencyMs: number }> {
  const port = process.env.AGENT_PORT || '8000';
  const url = `http://localhost:${port}/api/v1/chat`;
  const body = JSON.stringify({ message, conversationId });
  const start = Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`
  };
  if (evalCaseId) {
    headers['X-Eval-Case-Id'] = evalCaseId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(120000)
  });

  const ttftMs = Date.now() - start;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat request failed (${response.status}): ${text}`);
  }

  const data: ChatResponseShape = await response.json();
  const latencyMs = Date.now() - start;

  return { response: data, ttftMs, latencyMs };
}

// ── Suite runners ───────────────────────────────────────────

export type OnCaseResult = (event: EvalSseEvent) => void;

export async function runGoldenSuite(
  jwt: string,
  tool?: string,
  onEvent?: OnCaseResult
): Promise<EvalSuiteResult> {
  const cases = loadGoldenCases(tool);
  const results: EvalCaseResult[] = [];
  let totalCost = 0;

  for (const evalCase of cases) {
    const start = Date.now();
    try {
      const { response, ttftMs, latencyMs } = await chatRequest(
        evalCase.input.message,
        randomUUID(),
        jwt
      );

      const errors = assertGoldenCase(evalCase, response, latencyMs);
      const tokens = estimateTokens(response.message);
      const cost = tokens * COST_PER_TOKEN;
      totalCost += cost;

      const toolsSummary = response.toolCalls
        .map(
          (tc) =>
            `${tc.toolName} (${tc.durationMs}ms, ${tc.success ? 'ok' : 'err'})`
        )
        .join(', ');

      const result: EvalCaseResult = {
        id: evalCase.id,
        description: evalCase.description,
        passed: errors.length === 0,
        durationMs: Date.now() - start,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        details: {
          prompt: evalCase.input.message,
          tools: toolsSummary || '(none)',
          response: response.message,
          ttftMs,
          latencyMs,
          tokens,
          estimatedCost: cost,
          warnings: response.warnings,
          flags: response.flags,
          toolCalls: response.toolCalls
        }
      };
      results.push(result);

      onEvent?.({
        type: 'case_result',
        data: {
          caseId: evalCase.id,
          description: evalCase.description,
          passed: result.passed,
          durationMs: result.durationMs,
          tier: 'golden',
          tokens,
          estimatedCost: cost,
          ttftMs,
          latencyMs,
          error: result.error
        }
      });
    } catch (err) {
      const result: EvalCaseResult = {
        id: evalCase.id,
        description: evalCase.description,
        passed: false,
        durationMs: Date.now() - start,
        error: `Request failed: ${err instanceof Error ? err.message : String(err)}`
      };
      results.push(result);

      onEvent?.({
        type: 'case_result',
        data: {
          caseId: evalCase.id,
          description: evalCase.description,
          passed: false,
          durationMs: result.durationMs,
          tier: 'golden',
          error: result.error
        }
      });
    }
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    tier: 'golden',
    cases: results,
    totalPassed,
    totalFailed: results.length - totalPassed,
    totalDurationMs,
    estimatedCost: totalCost
  };
}

export async function runLabeledSuite(
  jwt: string,
  tool?: string,
  onEvent?: OnCaseResult
): Promise<EvalSuiteResult> {
  const cases = loadLabeledCases(tool);
  const results: EvalCaseResult[] = [];
  let totalCost = 0;

  for (const evalCase of cases) {
    const start = Date.now();
    try {
      const { response, ttftMs, latencyMs } = await chatRequest(
        evalCase.input.message,
        randomUUID(),
        jwt,
        evalCase.id
      );

      const errors = assertLabeledCase(evalCase, response, latencyMs);
      const tokens = estimateTokens(response.message);
      const cost = tokens * COST_PER_TOKEN;
      totalCost += cost;

      const toolsSummary = response.toolCalls
        .map(
          (tc) =>
            `${tc.toolName} (${tc.durationMs}ms, ${tc.success ? 'ok' : 'err'})`
        )
        .join(', ');

      const result: EvalCaseResult = {
        id: evalCase.id,
        description: evalCase.description,
        passed: errors.length === 0,
        durationMs: Date.now() - start,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        details: {
          difficulty: evalCase.difficulty,
          prompt: evalCase.input.message,
          tools: toolsSummary || '(none)',
          response: response.message,
          ttftMs,
          latencyMs,
          tokens,
          estimatedCost: cost,
          warnings: response.warnings,
          flags: response.flags,
          toolCalls: response.toolCalls,
          verifiersPassed:
            response.warnings.length === 0 && response.flags.length === 0
        }
      };
      results.push(result);

      onEvent?.({
        type: 'case_result',
        data: {
          caseId: evalCase.id,
          description: evalCase.description,
          passed: result.passed,
          durationMs: result.durationMs,
          tier: 'labeled',
          tokens,
          estimatedCost: cost,
          ttftMs,
          latencyMs,
          error: result.error
        }
      });
    } catch (err) {
      const result: EvalCaseResult = {
        id: evalCase.id,
        description: evalCase.description,
        passed: false,
        durationMs: Date.now() - start,
        error: `Request failed: ${err instanceof Error ? err.message : String(err)}`
      };
      results.push(result);

      onEvent?.({
        type: 'case_result',
        data: {
          caseId: evalCase.id,
          description: evalCase.description,
          passed: false,
          durationMs: result.durationMs,
          tier: 'labeled',
          error: result.error
        }
      });
    }
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    tier: 'labeled',
    cases: results,
    totalPassed,
    totalFailed: results.length - totalPassed,
    totalDurationMs,
    estimatedCost: totalCost
  };
}

/**
 * Count total eval cases for the given tier/tool without running them.
 */
export function countCases(tier: string = 'all', tool?: string): number {
  let total = 0;
  if (tier === 'golden' || tier === 'all') {
    total += loadGoldenCases(tool).length;
  }
  if (tier === 'labeled' || tier === 'all') {
    total += loadLabeledCases(tool).length;
  }
  return total;
}

/**
 * Main entry point — runs one or both tiers in-process.
 */
export async function runEvals(
  tier: string = 'all',
  tool?: string,
  onEvent?: OnCaseResult
): Promise<EvalSuiteResult[]> {
  const jwt = await getJwt();
  const suites: EvalSuiteResult[] = [];

  if (tier === 'golden' || tier === 'all') {
    suites.push(await runGoldenSuite(jwt, tool, onEvent));
  }

  if (tier === 'labeled' || tier === 'all') {
    suites.push(await runLabeledSuite(jwt, tool, onEvent));
  }

  return suites;
}
