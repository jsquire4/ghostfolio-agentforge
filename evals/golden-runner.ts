import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { sign } from 'jsonwebtoken';
import { join, resolve } from 'path';

import {
  ChatResponseShape,
  EvalCaseResult,
  EvalSuiteResult,
  GoldenEvalCase
} from './types';

const GOLDEN_DIR = resolve(__dirname, 'dataset/golden');
const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000';
const COST_PER_TOKEN = 0.000003; // rough estimate for GPT-4o-mini

function loadGoldenCases(): GoldenEvalCase[] {
  const files = readdirSync(GOLDEN_DIR).filter((f) =>
    f.endsWith('.eval.json')
  );
  const cases: GoldenEvalCase[] = [];
  for (const file of files) {
    const content = readFileSync(join(GOLDEN_DIR, file), 'utf-8');
    const parsed: GoldenEvalCase[] = JSON.parse(content);
    cases.push(...parsed);
  }
  return cases;
}

async function getJwt(): Promise<string> {
  // 1. Explicit override
  if (process.env.EVAL_JWT) {
    return process.env.EVAL_JWT;
  }

  // 2. Exchange GHOSTFOLIO_API_TOKEN for a real Ghostfolio JWT
  //    This produces a JWT that Ghostfolio recognizes as a real user,
  //    so tool calls that forward the JWT to Ghostfolio's API succeed.
  const apiToken = process.env.GHOSTFOLIO_API_TOKEN;
  const ghostfolioUrl = process.env.GHOSTFOLIO_BASE_URL || 'http://localhost:3333';

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
  jwt: string
): Promise<{ response: ChatResponseShape; ttftMs: number; latencyMs: number }> {
  const url = `${AGENT_URL}/api/v1/chat`;
  const body = JSON.stringify({ message, conversationId });
  const start = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`
    },
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
  return Math.ceil(text.length / 4);
}

function buildCriteria(evalCase: GoldenEvalCase): string[] {
  const criteria: string[] = [];
  criteria.push(`tools called: [${evalCase.expect.toolsCalled.join(', ')}]`);
  if (evalCase.expect.noToolErrors) criteria.push('no tool errors');
  if (evalCase.expect.responseNonEmpty) criteria.push('response non-empty');
  if (evalCase.expect.responseContains) {
    criteria.push(`response contains: [${evalCase.expect.responseContains.join(', ')}]`);
  }
  if (evalCase.expect.responseNotContains) {
    criteria.push(`response excludes: [${evalCase.expect.responseNotContains.join(', ')}]`);
  }
  if (evalCase.expect.maxLatencyMs) {
    criteria.push(`latency < ${evalCase.expect.maxLatencyMs}ms`);
  }
  return criteria;
}

function assertCase(
  evalCase: GoldenEvalCase,
  response: ChatResponseShape,
  latencyMs: number
): string[] {
  const errors: string[] = [];
  const calledTools = response.toolCalls.map((tc) => tc.toolName);

  // toolsCalled — exact match
  for (const expected of evalCase.expect.toolsCalled) {
    if (!calledTools.includes(expected)) {
      errors.push(
        `Expected tool "${expected}" to be called, got [${calledTools.join(', ')}]`
      );
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

  // responseNotContains
  if (evalCase.expect.responseNotContains) {
    for (const substr of evalCase.expect.responseNotContains) {
      if (response.message.toLowerCase().includes(substr.toLowerCase())) {
        errors.push(`Response contains forbidden substring: "${substr}"`);
      }
    }
  }

  // maxLatencyMs
  if (evalCase.expect.maxLatencyMs && latencyMs > evalCase.expect.maxLatencyMs) {
    errors.push(
      `Latency ${latencyMs}ms exceeded budget of ${evalCase.expect.maxLatencyMs}ms`
    );
  }

  return errors;
}

export async function runGoldenEvals(): Promise<EvalSuiteResult> {
  await healthCheck();
  const jwt = await getJwt();
  const cases = loadGoldenCases();
  const results: EvalCaseResult[] = [];
  let totalCost = 0;

  for (const evalCase of cases) {
    const start = Date.now();
    const criteria = buildCriteria(evalCase);

    try {
      const { response, ttftMs, latencyMs } = await chatRequest(
        evalCase.input.message,
        randomUUID(),
        jwt
      );

      const errors = assertCase(evalCase, response, latencyMs);
      const tokens = estimateTokens(response.message);
      const cost = tokens * COST_PER_TOKEN;
      totalCost += cost;

      const toolsSummary = response.toolCalls
        .map(
          (tc) => `${tc.toolName} (${tc.durationMs}ms, ${tc.success ? 'ok' : 'err'})`
        )
        .join(', ');

      results.push({
        id: evalCase.id,
        description: evalCase.description,
        passed: errors.length === 0,
        durationMs: Date.now() - start,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        details: {
          prompt: evalCase.input.message,
          tools: toolsSummary || '(none)',
          response: response.message,
          criteria,
          ttftMs,
          latencyMs,
          tokens,
          estimatedCost: cost,
          warnings: response.warnings,
          flags: response.flags,
          toolCalls: response.toolCalls
        }
      });
    } catch (err) {
      results.push({
        id: evalCase.id,
        description: evalCase.description,
        passed: false,
        durationMs: Date.now() - start,
        error: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
        details: {
          prompt: evalCase.input.message,
          criteria
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
