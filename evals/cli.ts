#!/usr/bin/env ts-node
// Unified eval CLI — entry point for all eval tiers.
//
// Usage:
//   npm run eval golden [--tool <name>] [--report]
//   npm run eval labeled [--difficulty straightforward|ambiguous|edge] [--tool <name>] [--cap N] [--report]
//   npm run eval all [--tool <name>] [--cap N] [--report]
//   npm run eval snapshot
//   npm run eval coverage
//   npm run eval rubric
import { execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { sign } from 'jsonwebtoken';
import { platform } from 'os';
import { resolve } from 'path';

import { runGoldenEvals } from './golden-runner';
import { runLabeledEvals } from './labeled-runner';
import { getCaseResultsForRun, getLatestRun, persistEvalRun } from './persist';
import { detectRegressions, RegressionReport } from './regression';
import { writeHtmlReport, writeJsonReport } from './report';
import { captureSnapshot, PortfolioSnapshot, printSnapshot } from './snapshot';
import {
  analyzeTierStaleness,
  printTierStaleness,
  TierStalenessReport
} from './stale';
import {
  EvalCaseResult,
  EvalCaseResultRecord,
  EvalRunRecord,
  EvalSuiteResult
} from './types';

// ── SSE Event Emission (for NestJS EvalRunnerService) ──────

function emitSseEvent(event: {
  type: string;
  data: Record<string, unknown>;
}): void {
  if (process.env.EVAL_SSE_MODE === '1') {
    process.stdout.write('EVAL_JSON:' + JSON.stringify(event) + '\n');
  }
}

function aggregateSuites(suites: EvalSuiteResult[]): Record<string, unknown> {
  return {
    totalPassed: suites.reduce((s, r) => s + r.totalPassed, 0),
    totalFailed: suites.reduce((s, r) => s + r.totalFailed, 0),
    totalDurationMs: suites.reduce((s, r) => s + r.totalDurationMs, 0),
    estimatedCost: suites.reduce((s, r) => s + (r.estimatedCost || 0), 0)
  };
}

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

async function cmdGolden(
  tool?: string,
  snapshot?: PortfolioSnapshot | null
): Promise<EvalSuiteResult> {
  const suite = await runGoldenEvals(tool, snapshot);
  printGoldenResults(suite);

  // Emit SSE events for each case + suite aggregate
  for (const c of suite.cases) {
    emitSseEvent({
      type: 'case_result',
      data: {
        caseId: c.id,
        description: c.description,
        passed: c.passed,
        durationMs: c.durationMs,
        tier: 'golden',
        tokens: (c.details?.tokens as number) ?? undefined,
        estimatedCost: (c.details?.estimatedCost as number) ?? undefined,
        ttftMs: (c.details?.ttftMs as number) ?? undefined,
        latencyMs: (c.details?.latencyMs as number) ?? undefined,
        error: c.error ?? undefined
      }
    });
  }
  emitSseEvent({
    type: 'suite_complete',
    data: {
      tier: 'golden',
      totalPassed: suite.totalPassed,
      totalFailed: suite.totalFailed,
      totalDurationMs: suite.totalDurationMs,
      estimatedCost: suite.estimatedCost ?? 0
    }
  });

  return suite;
}

async function cmdLabeled(
  difficulty?: string,
  tool?: string,
  cap?: number,
  snapshot?: PortfolioSnapshot | null
): Promise<EvalSuiteResult> {
  const suite = await runLabeledEvals(difficulty, tool, cap, snapshot);
  printLabeledResults(suite);

  // Emit SSE events for each case + suite aggregate
  for (const c of suite.cases) {
    emitSseEvent({
      type: 'case_result',
      data: {
        caseId: c.id,
        description: c.description,
        passed: c.passed,
        durationMs: c.durationMs,
        tier: 'labeled',
        tokens: (c.details?.tokens as number) ?? undefined,
        estimatedCost: (c.details?.estimatedCost as number) ?? undefined,
        ttftMs: (c.details?.ttftMs as number) ?? undefined,
        latencyMs: (c.details?.latencyMs as number) ?? undefined,
        error: c.error ?? undefined
      }
    });
  }
  emitSseEvent({
    type: 'suite_complete',
    data: {
      tier: 'labeled',
      totalPassed: suite.totalPassed,
      totalFailed: suite.totalFailed,
      totalDurationMs: suite.totalDurationMs,
      estimatedCost: suite.estimatedCost ?? 0
    }
  });

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

// ── Persistence + Regression ─────────────────────────────────

function getGitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getDbPath(): string {
  return process.env.AGENT_DB_PATH || resolve(__dirname, '../data/insights.db');
}

function suiteToRecords(
  suite: EvalSuiteResult,
  runId: string,
  gitSha: string
): { run: EvalRunRecord; cases: EvalCaseResultRecord[] } {
  const total = suite.totalPassed + suite.totalFailed;
  const run: EvalRunRecord = {
    id: runId,
    gitSha,
    tier: suite.tier,
    totalPassed: suite.totalPassed,
    totalFailed: suite.totalFailed,
    passRate: total > 0 ? suite.totalPassed / total : 0,
    totalDurationMs: suite.totalDurationMs,
    estimatedCost: suite.estimatedCost,
    runAt: new Date().toISOString()
  };

  const cases: EvalCaseResultRecord[] = suite.cases.map((c) => ({
    id: randomUUID(),
    runId,
    caseId: c.id,
    passed: c.passed,
    durationMs: c.durationMs,
    error: c.error,
    details: c.details
  }));

  return { run, cases };
}

function printRegressionReport(report: RegressionReport): void {
  console.log(`\n${BOLD} Regression Report${RESET}`);
  console.log(LINE);

  if (
    report.newlyFailing.length === 0 &&
    report.newlyPassing.length === 0 &&
    report.latencyRegressions.length === 0
  ) {
    console.log(`  ${CHECK} No regressions detected`);
    if (report.passRateDelta !== 0) {
      const sign = report.passRateDelta > 0 ? '+' : '';
      console.log(
        `  Pass rate delta: ${sign}${(report.passRateDelta * 100).toFixed(1)}%`
      );
    }
    return;
  }

  if (report.newlyFailing.length > 0) {
    console.log(
      `\n  ${RED}Newly failing (${report.newlyFailing.length}):${RESET}`
    );
    for (const f of report.newlyFailing) {
      console.log(`    ${CROSS} ${f.caseId}: ${f.error}`);
    }
  }

  if (report.newlyPassing.length > 0) {
    console.log(
      `\n  ${GREEN}Newly passing (${report.newlyPassing.length}):${RESET}`
    );
    for (const p of report.newlyPassing) {
      console.log(`    ${CHECK} ${p.caseId}`);
    }
  }

  if (report.latencyRegressions.length > 0) {
    console.log(
      `\n  ${YELLOW}Latency regressions (${report.latencyRegressions.length}):${RESET}`
    );
    for (const l of report.latencyRegressions) {
      console.log(
        `    ! ${l.caseId}: ${formatMs(l.previousMs)} → ${formatMs(l.currentMs)}`
      );
    }
  }

  const deltaSign = report.passRateDelta > 0 ? '+' : '';
  console.log(
    `\n  Pass rate delta: ${deltaSign}${(report.passRateDelta * 100).toFixed(1)}%`
  );
}

function persistAndDetectRegressions(suites: EvalSuiteResult[]): boolean {
  const dbPath = getDbPath();
  const gitSha = getGitSha();
  let hasNewRegressions = false;

  for (const suite of suites) {
    const runId = randomUUID();
    const { run, cases } = suiteToRecords(suite, runId, gitSha);

    // Load previous run before persisting current
    let previousRun: EvalRunRecord | undefined;
    let previousCases: EvalCaseResultRecord[] = [];
    try {
      previousRun = getLatestRun(dbPath, suite.tier);
      if (previousRun) {
        previousCases = getCaseResultsForRun(dbPath, previousRun.id);
      }
    } catch (err) {
      console.log(
        `\n  ${DIM}Previous run data unavailable — skipping regression detection: ${err instanceof Error ? err.message : String(err)}${RESET}`
      );
    }

    try {
      persistEvalRun(dbPath, run, cases);
      console.log(
        `\n  ${GREEN}Persisted ${suite.tier} run to ${dbPath}${RESET} (${runId})`
      );
    } catch (err) {
      console.log(
        `\n  ${YELLOW}! Persistence failed:${RESET} ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    // Regression detection
    if (previousRun && previousCases.length > 0) {
      const report = detectRegressions(cases, previousCases);
      printRegressionReport(report);
      if (report.newlyFailing.length > 0) {
        hasNewRegressions = true;
      }
    }
  }

  return hasNewRegressions;
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  // Parse flags
  const diffIdx = args.indexOf('--difficulty');
  const difficulty =
    diffIdx !== -1 && args[diffIdx + 1] ? args[diffIdx + 1] : undefined;
  const toolIdx = args.indexOf('--tool');
  const tool =
    toolIdx !== -1 && args[toolIdx + 1] ? args[toolIdx + 1] : undefined;
  const capIdx = args.indexOf('--cap');
  const cap =
    capIdx !== -1 && args[capIdx + 1]
      ? parseInt(args[capIdx + 1], 10)
      : undefined;
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
      suites.push(await cmdGolden(tool, snapshot));
      break;
    }
    case 'labeled': {
      suites.push(await cmdLabeled(difficulty, tool, cap, snapshot));
      break;
    }
    case 'all': {
      suites.push(await cmdGolden(tool, snapshot));
      suites.push(await cmdLabeled(difficulty, tool, cap, snapshot));
      break;
    }
    default: {
      console.error(
        `Unknown command: "${command}"\n` +
          'Usage: npm run eval [golden|labeled|all|snapshot|coverage|rubric] [--difficulty ...] [--tool ...] [--cap N] [--report]'
      );
      process.exit(1);
    }
  }

  printSummary(suites);

  // Persist results and detect regressions
  const hasNewRegressions = persistAndDetectRegressions(suites);

  // Staleness analysis — per tier, appended to reports
  const dbPath = getDbPath();
  const stalenessReports: TierStalenessReport[] = [];
  const tiersRun = new Set(suites.map((s) => s.tier));
  for (const tier of tiersRun) {
    const sr = analyzeTierStaleness(dbPath, tier, 30, tool);
    stalenessReports.push(sr);
    const hasIssues =
      sr.stale.length +
        sr.dormant.length +
        sr.flaky.length +
        sr.orphaned.length >
      0;
    if (hasIssues) {
      printTierStaleness(sr);
    }
  }

  // Portfolio snapshot (ground truth) — printed after evals so results show first
  if (snapshot) {
    printSnapshot(snapshot);
  }

  // Export report files (staleness included)
  if (wantsReport && snapshot) {
    const outDir = resolve(process.cwd(), 'evals/reports');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const jsonPath = writeJsonReport(
      snapshot,
      suites,
      outDir,
      stalenessReports
    );
    const htmlPath = writeHtmlReport(
      snapshot,
      suites,
      outDir,
      stalenessReports
    );
    console.log(`\n  ${GREEN}Reports:${RESET}`);
    console.log(`    JSON: ${jsonPath}`);
    console.log(`    HTML: ${htmlPath}`);

    // Emit run_complete with report URL for SSE consumers
    const htmlFilename = htmlPath.split('/').pop();
    emitSseEvent({
      type: 'run_complete',
      data: {
        ...aggregateSuites(suites),
        reportUrl: `/reports/${htmlFilename}`
      }
    });

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

  // Emit run_complete for non-report runs (report runs emit above)
  if (!wantsReport || !snapshot) {
    emitSseEvent({
      type: 'run_complete',
      data: aggregateSuites(suites)
    });
  }

  const anyFailed = suites.some((s) => s.totalFailed > 0);
  process.exit(anyFailed || hasNewRegressions ? 1 : 0);
}

main().catch((err) => {
  emitSseEvent({
    type: 'run_error',
    data: { error: err.message || String(err) }
  });
  console.error(`${RED}Fatal error:${RESET} ${err.message || err}`);
  process.exit(1);
});
