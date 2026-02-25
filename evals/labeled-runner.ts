import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { sign } from 'jsonwebtoken';
import { join, resolve } from 'path';

import {
  ChatResponseShape,
  EvalCaseResult,
  EvalSuiteResult,
  LabeledEvalCase
} from './types';

const LABELED_DIR = resolve(__dirname, 'dataset/labeled');
const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000';
const COST_PER_TOKEN = 0.000003; // rough estimate for GPT-4o-mini

function loadLabeledCases(difficulty?: string): LabeledEvalCase[] {
  const files = readdirSync(LABELED_DIR).filter((f) =>
    f.endsWith('.eval.json')
  );
  const cases: LabeledEvalCase[] = [];
  for (const file of files) {
    const content = readFileSync(join(LABELED_DIR, file), 'utf-8');
    const parsed: LabeledEvalCase[] = JSON.parse(content);
    cases.push(...parsed);
  }
  if (difficulty) {
    return cases.filter((c) => c.difficulty === difficulty);
  }
  return cases;
}

async function getJwt(): Promise<string> {
  // 1. Explicit override
  if (process.env.EVAL_JWT) {
    return process.env.EVAL_JWT;
  }

  // 2. Exchange GHOSTFOLIO_API_TOKEN for a real Ghostfolio JWT
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
        `Failed to exchange GHOSTFOLIO_API_TOKEN for JWT (${response.status}). ` +
          'Ensure Ghostfolio is running and the token is valid.'
      );
    }
    const data = (await response.json()) as { authToken: string };
    return data.authToken;
  }

  // 3. Fallback: self-sign (agent guard passes, but Ghostfolio API calls will fail)
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'No EVAL_JWT, GHOSTFOLIO_API_TOKEN, or JWT_SECRET_KEY found. Set one in .env.'
    );
  }
  return sign({ id: 'eval-user', iat: Math.floor(Date.now() / 1000) }, secret);
}

async function healthCheck(): Promise<void> {
  const url = `${AGENT_URL}/api/v1/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`);
    }
  } catch {
    throw new Error(
      `Agent health check failed at ${url}.\n` +
        '  Ensure the agent is running:\n' +
        '    docker compose -f docker/docker-compose.yml up -d\n' +
        '  Or locally:\n' +
        '    npm run start:agent'
    );
  }
}

async function chatRequest(
  message: string,
  conversationId: string,
  jwt: string,
  evalCaseId?: string
): Promise<{ response: ChatResponseShape; ttftMs: number; latencyMs: number }> {
  const url = `${AGENT_URL}/api/v1/chat`;
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
    signal: AbortSignal.timeout(60000)
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

function estimateTokens(text: string): number {
  // Rough heuristic: ~4 chars per token
  return Math.ceil(text.length / 4);
}

function assertCase(
  evalCase: LabeledEvalCase,
  response: ChatResponseShape,
  latencyMs: number
): string[] {
  const errors: string[] = [];
  const calledTools = response.toolCalls.map((tc) => tc.toolName);

  // toolsCalled — exact match
  if (evalCase.expect.toolsCalled) {
    for (const expected of evalCase.expect.toolsCalled) {
      if (!calledTools.includes(expected)) {
        errors.push(
          `Expected tool "${expected}" to be called, got [${calledTools.join(', ')}]`
        );
      }
    }
  }

  // toolsAcceptable — any-of match (supports __none__ sentinel for "no tools called")
  if (evalCase.expect.toolsAcceptable) {
    const matched = evalCase.expect.toolsAcceptable.some((acceptable) => {
      if (acceptable.length === 1 && acceptable[0] === '__none__') {
        return calledTools.length === 0;
      }
      return acceptable.every((tool) => calledTools.includes(tool));
    });
    if (!matched) {
      errors.push(
        `No acceptable tool set matched. Called: [${calledTools.join(', ')}], ` +
          `acceptable: ${JSON.stringify(evalCase.expect.toolsAcceptable)}`
      );
    }
  }

  // toolsNotCalled — exclusion
  if (evalCase.expect.toolsNotCalled) {
    for (const excluded of evalCase.expect.toolsNotCalled) {
      if (calledTools.includes(excluded)) {
        errors.push(`Tool "${excluded}" must NOT be called but was`);
      }
    }
  }

  // noToolErrors
  if (evalCase.expect.noToolErrors) {
    const failedTools = response.toolCalls.filter((tc) => !tc.success);
    if (failedTools.length > 0) {
      errors.push(
        `Expected no tool errors but ${failedTools.length} failed: ${failedTools.map((t) => t.toolName).join(', ')}`
      );
    }
  }

  // responseNonEmpty
  if (evalCase.expect.responseNonEmpty && !response.message?.trim()) {
    errors.push('Expected non-empty response but got empty');
  }

  // responseContains
  if (evalCase.expect.responseContains) {
    for (const substr of evalCase.expect.responseContains) {
      if (!response.message.includes(substr)) {
        errors.push(`Response missing expected substring: "${substr}"`);
      }
    }
  }

  // responseContainsAny — at least one from each synonym group
  if (evalCase.expect.responseContainsAny) {
    for (const group of evalCase.expect.responseContainsAny) {
      const found = group.some((synonym) =>
        response.message.toLowerCase().includes(synonym.toLowerCase())
      );
      if (!found) {
        errors.push(
          `Response missing any of synonym group: [${group.join(', ')}]`
        );
      }
    }
  }

  // responseNotContains
  if (evalCase.expect.responseNotContains) {
    for (const substr of evalCase.expect.responseNotContains) {
      if (response.message.toLowerCase().includes(substr.toLowerCase())) {
        errors.push(`Response contains forbidden substring: "${substr}"`);
      }
    }
  }

  // responseMatches
  if (evalCase.expect.responseMatches) {
    for (const pattern of evalCase.expect.responseMatches) {
      if (!new RegExp(pattern).test(response.message)) {
        errors.push(`Response does not match pattern: ${pattern}`);
      }
    }
  }

  // verifiersPassed
  if (evalCase.expect.verifiersPassed) {
    if (response.warnings.length > 0 || response.flags.length > 0) {
      errors.push(
        `Expected verifiers to pass but got warnings=[${response.warnings.join(', ')}], flags=[${response.flags.join(', ')}]`
      );
    }
  }

  // maxLatencyMs
  if (
    evalCase.expect.maxLatencyMs &&
    latencyMs > evalCase.expect.maxLatencyMs
  ) {
    errors.push(
      `Latency ${latencyMs}ms exceeded budget of ${evalCase.expect.maxLatencyMs}ms`
    );
  }

  // maxTokens
  if (evalCase.expect.maxTokens) {
    const tokens = estimateTokens(response.message);
    if (tokens > evalCase.expect.maxTokens) {
      errors.push(
        `Token count ~${tokens} exceeded budget of ${evalCase.expect.maxTokens}`
      );
    }
  }

  return errors;
}

export async function runLabeledEvals(
  difficulty?: string
): Promise<EvalSuiteResult> {
  await healthCheck();
  const jwt = await getJwt();
  const cases = loadLabeledCases(difficulty);
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

      const errors = assertCase(evalCase, response, latencyMs);
      const tokens = estimateTokens(response.message);
      const cost = tokens * COST_PER_TOKEN;
      totalCost += cost;

      const toolsSummary = response.toolCalls
        .map(
          (tc) =>
            `${tc.toolName} (${tc.durationMs}ms, ${tc.success ? 'ok' : 'err'})`
        )
        .join(', ');

      results.push({
        id: evalCase.id,
        description: evalCase.description,
        passed: errors.length === 0,
        durationMs: Date.now() - start,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        details: {
          difficulty: evalCase.difficulty,
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
      });
    } catch (err) {
      results.push({
        id: evalCase.id,
        description: evalCase.description,
        passed: false,
        durationMs: Date.now() - start,
        error: `Request failed: ${err instanceof Error ? err.message : String(err)}`
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
