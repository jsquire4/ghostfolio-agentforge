#!/usr/bin/env ts-node
// Unified eval CLI — entry point for all eval tiers.
//
// Usage:
//   npm run eval golden [--report]
//   npm run eval labeled [--difficulty straightforward|ambiguous|edge] [--report]
//   npm run eval all [--report]
//   npm run eval snapshot
//   npm run eval coverage
//   npm run eval rubric
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { sign } from 'jsonwebtoken';
import { platform } from 'os';
import { resolve } from 'path';

import { runGoldenEvals } from './golden-runner';
import { runLabeledEvals } from './labeled-runner';
import { writeHtmlReport, writeJsonReport } from './report';
import { captureSnapshot, PortfolioSnapshot, printSnapshot } from './snapshot';
import { EvalCaseResult, EvalSuiteResult } from './types';

// ── ANSI Helpers ────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const CHECK = `${GREEN}\u2713${RESET}`;
const CROSS = `${RED}\u2717${RESET}`;
const LINE = '\u2500'.repeat(61);
const DOUBLE_LINE = '\u2550'.repeat(61);

// ── JWT Helper ──────────────────────────────────────────────

const GHOSTFOLIO_URL =
  process.env.GHOSTFOLIO_BASE_URL || 'http://localhost:3333';

async function getGhostfolioJwt(): Promise<string> {
  if (process.env.EVAL_JWT) {
    return process.env.EVAL_JWT;
  }

  const apiToken = process.env.GHOSTFOLIO_API_TOKEN;
  if (apiToken) {
    const response = await fetch(`${GHOSTFOLIO_URL}/api/v1/auth/anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: apiToken }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      throw new Error(
        `Failed to exchange GHOSTFOLIO_API_TOKEN for JWT (${response.status}).`
      );
    }
    const data = (await response.json()) as { authToken: string };
    return data.authToken;
  }

  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'No EVAL_JWT, GHOSTFOLIO_API_TOKEN, or JWT_SECRET_KEY found.'
    );
  }
  return sign({ id: 'eval-user', iat: Math.floor(Date.now() / 1000) }, secret);
}

// ── Formatting ──────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: number): string {
  if (cost < 0.001) return `~$${cost.toFixed(4)}`;
  return `~$${cost.toFixed(3)}`;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function printGoldenResults(suite: EvalSuiteResult): void {
  console.log(`\n${BOLD} Golden Evals${RESET}`);
  console.log(LINE);

  for (const r of suite.cases) {
    const icon = r.passed ? CHECK : CROSS;
    console.log(
      `  ${icon} ${DIM}${r.id}${RESET} ${r.description}  ${DIM}${formatMs(r.durationMs)}${RESET}`
    );

    if (r.details) {
      console.log(`    ${CYAN}Prompt:${RESET}   "${r.details.prompt}"`);
      console.log(`    ${CYAN}Tools:${RESET}    ${r.details.tools}`);
      if (r.details.response) {
        const respStr = String(r.details.response);
        console.log(`    ${CYAN}Response:${RESET} ${truncate(respStr, 120)}`);
      }
      const parts: string[] = [];
      if (r.details.ttftMs)
        parts.push(`TTFT: ${formatMs(r.details.ttftMs as number)}`);
      if (r.details.estimatedCost)
        parts.push(`Cost: ${formatCost(r.details.estimatedCost as number)}`);
      if (r.details.tokens) parts.push(`Tokens: ${r.details.tokens}`);
      if (parts.length > 0) {
        console.log(`    ${parts.join(` ${DIM}\u00b7${RESET} `)}`);
      }
      const criteria = r.details.criteria as string[];
      if (criteria && criteria.length > 0) {
        console.log(
          `    ${CYAN}Criteria:${RESET} ${criteria.join(` ${DIM}|${RESET} `)}`
        );
      }
    }

    if (!r.passed && r.error) {
      console.log(`    ${RED}${r.error}${RESET}`);
    }

    console.log('');
  }

  const total = suite.cases.length;
  const color = suite.totalFailed > 0 ? RED : GREEN;
  const costStr = suite.estimatedCost
    ? ` ${DIM}\u00b7${RESET} ${formatCost(suite.estimatedCost)} est. cost`
    : '';
  console.log(
    `  ${color}${suite.totalPassed}/${total} passed${RESET} ${DIM}\u00b7 ${formatMs(suite.totalDurationMs)} total${RESET}${costStr}`
  );
}

function printLabeledResults(suite: EvalSuiteResult): void {
  const groups = new Map<string, EvalCaseResult[]>();
  for (const r of suite.cases) {
    const diff = (r.details?.difficulty as string) || 'unknown';
    if (!groups.has(diff)) groups.set(diff, []);
    groups.get(diff)!.push(r);
  }

  for (const [difficulty, cases] of groups) {
    console.log(`\n${BOLD} Labeled Evals \u2014 ${difficulty}${RESET}`);
    console.log(LINE);

    for (const r of cases) {
      if (r.passed) {
        console.log(`  ${CHECK} ${DIM}${r.id}${RESET} ${r.description}`);
        if (r.details) {
          console.log(`    ${CYAN}Tools:${RESET} ${r.details.tools}`);
          const parts: string[] = [];
          if (r.details.ttftMs)
            parts.push(`TTFT: ${formatMs(r.details.ttftMs as number)}`);
          if (r.details.estimatedCost)
            parts.push(
              `Cost: ${formatCost(r.details.estimatedCost as number)}`
            );
          if (r.details.tokens) parts.push(`Tokens: ${r.details.tokens}`);
          if (parts.length > 0) {
            console.log(`    ${parts.join(` ${DIM}\u00b7${RESET} `)}`);
          }
          if (r.details.verifiersPassed !== undefined) {
            console.log(
              `    Verifiers: ${r.details.verifiersPassed ? `${CHECK} passed` : `${CROSS} failed`}`
            );
          }
        }
      } else {
        console.log(`  ${CROSS} ${DIM}${r.id}${RESET} ${r.description}`);
        console.log(`    ${RED}${r.error}${RESET}`);
      }
    }
  }

  const total = suite.cases.length;
  const color = suite.totalFailed > 0 ? RED : GREEN;
  const costStr = suite.estimatedCost
    ? ` ${DIM}\u00b7${RESET} ${formatCost(suite.estimatedCost)} est. cost`
    : '';
  console.log(
    `\n  ${color}${suite.totalPassed}/${total} passed${RESET} ${DIM}\u00b7 ${formatMs(suite.totalDurationMs)} total${RESET}${costStr}`
  );
}

function printSummary(suites: EvalSuiteResult[]): void {
  const totalPassed = suites.reduce((s, r) => s + r.totalPassed, 0);
  const totalCases = suites.reduce(
    (s, r) => s + r.totalPassed + r.totalFailed,
    0
  );
  const totalFailed = totalCases - totalPassed;
  const totalMs = suites.reduce((s, r) => s + r.totalDurationMs, 0);
  const totalCost = suites.reduce((s, r) => s + (r.estimatedCost || 0), 0);

  console.log(`\n${DOUBLE_LINE}`);

  const color = totalFailed > 0 ? RED : GREEN;
  const parts = [
    `${color}${totalPassed}/${totalCases} passed${RESET}`,
    totalFailed > 0
      ? `${RED}${totalFailed} failure${totalFailed > 1 ? 's' : ''}${RESET}`
      : null,
    `${formatMs(totalMs)}`
  ].filter(Boolean);

  if (totalCost > 0) {
    parts.push(formatCost(totalCost));
  }

  console.log(`  Summary: ${parts.join(` ${DIM}\u00b7${RESET} `)}`);
  console.log(DOUBLE_LINE);
}

// ── Subcommands ─────────────────────────────────────────────

async function cmdGolden(): Promise<EvalSuiteResult> {
  const suite = await runGoldenEvals();
  printGoldenResults(suite);
  return suite;
}

async function cmdLabeled(difficulty?: string): Promise<EvalSuiteResult> {
  const suite = await runLabeledEvals(difficulty);
  printLabeledResults(suite);
  return suite;
}

function cmdCoverage(): void {
  const script = resolve(__dirname, 'check-coverage.ts');
  try {
    execSync(
      `npx ts-node --project ${resolve(__dirname, 'tsconfig.eval.json')} ${script}`,
      { stdio: 'inherit' }
    );
  } catch {
    process.exit(1);
  }
}

function cmdRubric(): void {
  console.log(
    `\n${YELLOW}Rubric evals not yet implemented.${RESET}\n` +
      `  This tier is reserved for scored multi-dimensional evaluation.\n` +
      `  See evals/types.ts for the RubricEvalCase interface.\n`
  );
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  // Parse flags
  const diffIdx = args.indexOf('--difficulty');
  const difficulty =
    diffIdx !== -1 && args[diffIdx + 1] ? args[diffIdx + 1] : undefined;
  const wantsReport = args.includes('--report');

  // Non-eval commands
  if (command === 'coverage') {
    cmdCoverage();
    process.exit(0);
  }
  if (command === 'rubric') {
    cmdRubric();
    process.exit(0);
  }

  // Commands that need the server — capture snapshot (printed after evals)
  const needsSnapshot = ['golden', 'labeled', 'all', 'snapshot'].includes(
    command
  );
  let snapshot: PortfolioSnapshot | null = null;

  if (needsSnapshot) {
    try {
      const jwt = await getGhostfolioJwt();
      snapshot = await captureSnapshot(jwt);
    } catch (err) {
      console.log(
        `\n${YELLOW}! Snapshot skipped:${RESET} ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  // Snapshot-only mode
  if (command === 'snapshot') {
    if (!snapshot) process.exit(1);
    printSnapshot(snapshot);
    if (wantsReport) {
      const outDir = resolve(process.cwd(), 'evals/reports');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      const jsonPath = writeJsonReport(snapshot, [], outDir);
      const htmlPath = writeHtmlReport(snapshot, [], outDir);
      console.log(`  ${GREEN}Reports:${RESET} ${jsonPath}`);
      console.log(`           ${htmlPath}`);

      const openCmd = platform() === 'darwin' ? 'open' : 'xdg-open';
      try {
        spawn(openCmd, [htmlPath], { detached: true, stdio: 'ignore' }).unref();
      } catch {
        // path already printed above
      }
    }
    process.exit(0);
  }

  // Eval commands
  const suites: EvalSuiteResult[] = [];

  switch (command) {
    case 'golden': {
      suites.push(await cmdGolden());
      break;
    }
    case 'labeled': {
      suites.push(await cmdLabeled(difficulty));
      break;
    }
    case 'all': {
      suites.push(await cmdGolden());
      suites.push(await cmdLabeled(difficulty));
      break;
    }
    default: {
      console.error(
        `Unknown command: "${command}"\n` +
          'Usage: npm run eval [golden|labeled|all|snapshot|coverage|rubric] [--difficulty ...] [--report]'
      );
      process.exit(1);
    }
  }

  printSummary(suites);

  // Portfolio snapshot (ground truth) — printed after evals so results show first
  if (snapshot) {
    printSnapshot(snapshot);
  }

  // Export report files
  if (wantsReport && snapshot) {
    const outDir = resolve(process.cwd(), 'evals/reports');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const jsonPath = writeJsonReport(snapshot, suites, outDir);
    const htmlPath = writeHtmlReport(snapshot, suites, outDir);
    console.log(`\n  ${GREEN}Reports:${RESET}`);
    console.log(`    JSON: ${jsonPath}`);
    console.log(`    HTML: ${htmlPath}`);

    // Auto-open HTML report in default browser
    const openCmd = platform() === 'darwin' ? 'open' : 'xdg-open';
    try {
      spawn(openCmd, [htmlPath], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      // If browser open fails, the path is already printed above
    }
  } else if (wantsReport && !snapshot) {
    console.log(
      `\n  ${YELLOW}! Reports skipped — snapshot was not captured${RESET}`
    );
  }

  const anyFailed = suites.some((s) => s.totalFailed > 0);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(`${RED}Fatal error:${RESET} ${err.message || err}`);
  process.exit(1);
});
