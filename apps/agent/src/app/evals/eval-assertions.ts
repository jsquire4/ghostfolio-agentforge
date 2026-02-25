// Ported assertion logic from evals/golden-runner.ts, evals/labeled-runner.ts,
// and evals/snapshot-resolver.ts for in-process eval execution.
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  ChatResponseShape,
  GoldenEvalCase,
  LabeledEvalCase
} from './eval.types';

// ── Seed template resolution ────────────────────────────────

const SEED_TEMPLATE_RE = /\{\{seed:(.+?)\}\}/;

let _seedManifest: Record<string, unknown> | null = null;

function loadSeedManifest(): Record<string, unknown> {
  if (_seedManifest) return _seedManifest;
  const manifestPath = resolve(
    __dirname,
    'assets',
    'evals',
    'seed-manifest.json'
  );
  _seedManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  return _seedManifest!;
}

function resolveSeedPath(seedPath: string): string | null {
  const manifest = loadSeedManifest();
  const segments = seedPath.split('.');
  let current: unknown = manifest;

  for (const segment of segments) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return null;
    }

    const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const obj = (current as Record<string, unknown>)[key];
      if (!Array.isArray(obj)) return null;
      const index = parseInt(indexStr, 10);
      if (index < 0 || index >= obj.length) return null;
      current = obj[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }

  if (current === null || current === undefined) return null;
  if (Array.isArray(current)) return null;
  return String(current);
}

// ── Template resolution (seed-only, no live snapshot) ───────

interface ResolveResult {
  value: string;
  skipped: boolean;
}

function resolveValue(value: string): ResolveResult {
  const seedMatch = value.match(SEED_TEMPLATE_RE);
  if (!seedMatch) return { value, skipped: false };

  const resolved = resolveSeedPath(seedMatch[1]);
  if (resolved === null) return { value, skipped: true };

  const replaced = value.replace(SEED_TEMPLATE_RE, resolved);
  if (SEED_TEMPLATE_RE.test(replaced)) {
    return resolveValue(replaced);
  }
  return { value: replaced, skipped: false };
}

export function resolveArray(values: string[]): {
  resolved: string[];
  warnings: string[];
} {
  const resolved: string[] = [];
  const warnings: string[] = [];

  for (const v of values) {
    const result = resolveValue(v);
    if (result.skipped) {
      warnings.push(`Skipped unresolvable template: ${v}`);
    } else {
      resolved.push(result.value);
    }
  }

  return { resolved, warnings };
}

// ── Shared helpers ──────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Golden case assertions ──────────────────────────────────

export function assertGoldenCase(
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

  // responseContains — resolve {{seed:*}} templates
  if (evalCase.expect.responseContains) {
    const { resolved, warnings } = resolveArray(
      evalCase.expect.responseContains
    );
    for (const w of warnings) errors.push(w);
    for (const substr of resolved) {
      if (!response.message.includes(substr)) {
        errors.push(`Response missing expected substring: "${substr}"`);
      }
    }
  }

  // responseContainsAny — synonym groups
  if (evalCase.expect.responseContainsAny) {
    for (const group of evalCase.expect.responseContainsAny) {
      const { resolved } = resolveArray(group);
      const found = resolved.some((synonym) =>
        response.message.toLowerCase().includes(synonym.toLowerCase())
      );
      if (!found) {
        errors.push(
          `Response missing any of synonym group: [${resolved.join(', ')}]`
        );
      }
    }
  }

  // responseNotContains
  if (evalCase.expect.responseNotContains) {
    const { resolved } = resolveArray(evalCase.expect.responseNotContains);
    for (const substr of resolved) {
      if (response.message.toLowerCase().includes(substr.toLowerCase())) {
        errors.push(`Response contains forbidden substring: "${substr}"`);
      }
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

  return errors;
}

// ── Labeled case assertions ─────────────────────────────────

export function assertLabeledCase(
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

  // toolsAcceptable — any-of match
  if (evalCase.expect.toolsAcceptable) {
    const matched = evalCase.expect.toolsAcceptable.some((acceptable) => {
      if (acceptable.length === 1 && acceptable[0] === '__none__') {
        return calledTools.length === 0;
      }
      return acceptable.every((t) => calledTools.includes(t));
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
    const { resolved, warnings } = resolveArray(
      evalCase.expect.responseContains
    );
    for (const w of warnings) errors.push(w);
    for (const substr of resolved) {
      if (!response.message.includes(substr)) {
        errors.push(`Response missing expected substring: "${substr}"`);
      }
    }
  }

  // responseContainsAny
  if (evalCase.expect.responseContainsAny) {
    for (const group of evalCase.expect.responseContainsAny) {
      const { resolved } = resolveArray(group);
      const found = resolved.some((synonym) =>
        response.message.toLowerCase().includes(synonym.toLowerCase())
      );
      if (!found) {
        errors.push(
          `Response missing any of synonym group: [${resolved.join(', ')}]`
        );
      }
    }
  }

  // responseNotContains
  if (evalCase.expect.responseNotContains) {
    const { resolved } = resolveArray(evalCase.expect.responseNotContains);
    for (const substr of resolved) {
      if (response.message.toLowerCase().includes(substr.toLowerCase())) {
        errors.push(`Response contains forbidden substring: "${substr}"`);
      }
    }
  }

  // responseMatches — regex patterns
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
