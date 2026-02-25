// Eval staleness detection — per-tier analysis that feeds into eval reports.
//
// Logic: An eval case is only flagged if it hasn't been run in 30+ days.
// Once flagged, its historical usage determines the classification:
//   - stale:   >30 days cold + high fail rate → update or remove
//   - dormant: >30 days cold + was passing    → re-run to revalidate
//   - flaky:   recently run but intermittent   → needs snapshot templates or tighter routing
//   - orphaned: declared in JSON but zero DB rows ever
//
// Standalone: npm run eval:stale [--days 30] [--tool <name>]
// Library:    import { analyzeTierStaleness, TierStalenessReport } from './stale'
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

// ── ANSI ─────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const LINE = '\u2500'.repeat(61);

// ── Exported Types ───────────────────────────────────────────

export interface StaleCaseInfo {
  caseId: string;
  totalRuns: number;
  passes: number;
  failures: number;
  failRate: number;
  lastRunAt: string;
  daysSinceLastRun: number;
  lastError: string | null;
}

export interface OrphanedCaseInfo {
  caseId: string;
  file: string;
}

export interface TierStalenessReport {
  tier: 'golden' | 'labeled';
  staleThresholdDays: number;
  stale: StaleCaseInfo[]; // >30 days cold + historically failing
  dormant: StaleCaseInfo[]; // >30 days cold + was passing → re-run
  flaky: StaleCaseInfo[]; // recently run but intermittent pass/fail
  orphaned: OrphanedCaseInfo[]; // in JSON, zero DB rows
}

// ── DB ───────────────────────────────────────────────────────

const EVAL_DDL = `
  CREATE TABLE IF NOT EXISTS eval_runs (
    id               TEXT PRIMARY KEY,
    gitSha           TEXT NOT NULL,
    model            TEXT,
    tier             TEXT NOT NULL,
    totalPassed      INTEGER NOT NULL,
    totalFailed      INTEGER NOT NULL,
    passRate         REAL NOT NULL,
    totalDurationMs  INTEGER NOT NULL,
    estimatedCost    REAL,
    runAt            TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS eval_case_results (
    id         TEXT PRIMARY KEY,
    runId      TEXT NOT NULL,
    caseId     TEXT NOT NULL,
    passed     INTEGER NOT NULL,
    durationMs INTEGER NOT NULL,
    error      TEXT,
    details    TEXT,
    FOREIGN KEY (runId) REFERENCES eval_runs(id)
  );
  CREATE INDEX IF NOT EXISTS idx_eval_runs_runAt ON eval_runs(runAt);
  CREATE INDEX IF NOT EXISTS idx_eval_case_results_runId ON eval_case_results(runId);
  CREATE INDEX IF NOT EXISTS idx_eval_case_results_caseId ON eval_case_results(caseId);
`;

function openDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(EVAL_DDL);
  return db;
}

// ── Queries ──────────────────────────────────────────────────

interface CaseStats {
  caseId: string;
  totalRuns: number;
  passes: number;
  failures: number;
  failRate: number;
  lastRunAt: string;
  lastError: string | null;
}

function queryCaseLifetimeStats(
  db: Database.Database,
  tier: 'golden' | 'labeled'
): CaseStats[] {
  // All-time stats per case for this tier — not windowed by N runs
  const rows = db
    .prepare(
      `SELECT
        ecr.caseId,
        COUNT(*) as totalRuns,
        SUM(CASE WHEN ecr.passed = 1 THEN 1 ELSE 0 END) as passes,
        SUM(CASE WHEN ecr.passed = 0 THEN 1 ELSE 0 END) as failures,
        MAX(r.runAt) as lastRunAt,
        (SELECT ecr2.error
         FROM eval_case_results ecr2
         JOIN eval_runs r2 ON ecr2.runId = r2.id
         WHERE ecr2.caseId = ecr.caseId AND r2.tier = ? AND ecr2.passed = 0
         ORDER BY r2.runAt DESC LIMIT 1
        ) as lastError
      FROM eval_case_results ecr
      JOIN eval_runs r ON ecr.runId = r.id
      WHERE r.tier = ?
      GROUP BY ecr.caseId`
    )
    .all(tier, tier) as any[];

  return rows.map((row) => ({
    caseId: row.caseId,
    totalRuns: row.totalRuns,
    passes: row.passes,
    failures: row.failures,
    failRate: row.totalRuns > 0 ? row.failures / row.totalRuns : 0,
    lastRunAt: row.lastRunAt,
    lastError: row.lastError ?? null
  }));
}

// ── File Discovery ───────────────────────────────────────────

function discoverEvalCaseIds(
  tier: 'golden' | 'labeled',
  tool?: string
): Map<string, string> {
  const dir = resolve(
    __dirname,
    tier === 'golden' ? 'dataset/golden' : 'dataset/labeled'
  );
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.eval.json'));
  } catch {
    return new Map();
  }

  if (tool) {
    const kebab = tool.replace(/_/g, '-');
    files = files.filter((f) => f === `${kebab}.eval.json`);
  }

  const caseToFile = new Map<string, string>();
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    const cases: { id: string }[] = JSON.parse(content);
    for (const c of cases) {
      caseToFile.set(c.id, file);
    }
  }
  return caseToFile;
}

// ── Per-Tier Analysis (exported) ─────────────────────────────

export function analyzeTierStaleness(
  dbPath: string,
  tier: 'golden' | 'labeled',
  staleAfterDays = 30,
  tool?: string
): TierStalenessReport {
  const db = openDb(dbPath);

  try {
    const now = Date.now();
    const staleCutoff = staleAfterDays * 24 * 60 * 60 * 1000;

    const stats = queryCaseLifetimeStats(db, tier);
    const statsMap = new Map(stats.map((s) => [s.caseId, s]));
    const declaredCases = discoverEvalCaseIds(tier, tool);

    const report: TierStalenessReport = {
      tier,
      staleThresholdDays: staleAfterDays,
      stale: [],
      dormant: [],
      flaky: [],
      orphaned: []
    };

    // Classify cases that have DB history
    for (const s of stats) {
      // If --tool filter is active, skip cases not matching
      if (tool) {
        const kebab = tool.replace(/_/g, '-');
        if (!s.caseId.includes(kebab)) continue;
      }

      const lastRunMs = new Date(s.lastRunAt).getTime();
      const daysSince = Math.floor((now - lastRunMs) / (24 * 60 * 60 * 1000));
      const info: StaleCaseInfo = {
        ...s,
        daysSinceLastRun: daysSince
      };

      const isCold = now - lastRunMs > staleCutoff;

      if (isCold) {
        // Cold case — check historical usage to classify
        if (s.failRate > 0.5) {
          // Mostly failing + not run recently → stale, likely needs update/removal
          report.stale.push(info);
        } else {
          // Was passing but nobody's run it → dormant, needs revalidation
          report.dormant.push(info);
        }
      } else {
        // Recently run — only flag if flaky (mixed results)
        if (s.failures > 0 && s.passes > 0 && s.totalRuns >= 2) {
          report.flaky.push(info);
        }
      }
    }

    // Orphaned — in eval JSON but zero DB rows
    for (const [caseId, file] of declaredCases) {
      if (!statsMap.has(caseId)) {
        report.orphaned.push({ caseId, file });
      }
    }

    // Sort for readability
    report.stale.sort((a, b) => b.failRate - a.failRate);
    report.dormant.sort((a, b) => b.daysSinceLastRun - a.daysSinceLastRun);
    report.flaky.sort((a, b) => b.failures - a.failures);

    return report;
  } finally {
    db.close();
  }
}

// ── CLI Display ──────────────────────────────────────────────

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function printTierStaleness(report: TierStalenessReport): void {
  const total =
    report.stale.length +
    report.dormant.length +
    report.flaky.length +
    report.orphaned.length;

  console.log(
    `\n${BOLD} ${tierLabel(report.tier)} Staleness${RESET} ${DIM}(${report.staleThresholdDays}-day threshold)${RESET}`
  );
  console.log(LINE);

  if (total === 0) {
    console.log(`  ${GREEN}\u2713 No staleness detected${RESET}`);
    return;
  }

  if (report.stale.length > 0) {
    console.log(
      `\n  ${RED}Stale — cold ${report.staleThresholdDays}+ days, historically failing (${report.stale.length}):${RESET}`
    );
    for (const s of report.stale) {
      const pct = (s.failRate * 100).toFixed(0);
      console.log(
        `    ${RED}\u2717${RESET} ${s.caseId}  ${RED}${pct}%${RESET} fail (${s.failures}/${s.totalRuns})  ${DIM}last run ${s.daysSinceLastRun}d ago${RESET}`
      );
      if (s.lastError) {
        const truncated =
          s.lastError.length > 100
            ? s.lastError.slice(0, 97) + '...'
            : s.lastError;
        console.log(`      ${DIM}Last error: ${truncated}${RESET}`);
      }
    }
    console.log(
      `    ${YELLOW}Action:${RESET} Update assertions or remove dead routing paths.`
    );
  }

  if (report.dormant.length > 0) {
    console.log(
      `\n  ${CYAN}Dormant — cold ${report.staleThresholdDays}+ days, was passing (${report.dormant.length}):${RESET}`
    );
    for (const d of report.dormant) {
      console.log(
        `    ${CYAN}\u25cb${RESET} ${d.caseId}  ${GREEN}${d.passes}/${d.totalRuns} passed${RESET}  ${DIM}last run ${d.daysSinceLastRun}d ago${RESET}`
      );
    }
    console.log(
      `    ${YELLOW}Action:${RESET} Re-run to revalidate. If still passing, no issue.`
    );
  }

  if (report.flaky.length > 0) {
    console.log(
      `\n  ${YELLOW}Flaky — recently run, intermittent results (${report.flaky.length}):${RESET}`
    );
    for (const f of report.flaky) {
      const pct = (f.failRate * 100).toFixed(0);
      console.log(
        `    ${YELLOW}~${RESET} ${f.caseId}  ${pct}% fail (${f.passes} pass, ${f.failures} fail)`
      );
    }
    console.log(
      `    ${YELLOW}Action:${RESET} Likely needs {{snapshot:*}} templates or tighter tool descriptions.`
    );
  }

  if (report.orphaned.length > 0) {
    console.log(
      `\n  ${DIM}Orphaned — in JSON, never executed (${report.orphaned.length}):${RESET}`
    );
    for (const o of report.orphaned) {
      console.log(`    ${DIM}? ${o.caseId}  (${o.file})${RESET}`);
    }
    console.log(
      `    ${YELLOW}Action:${RESET} Run the suite to establish a baseline, or remove if superseded.`
    );
  }
}

// ── Main (standalone CLI) ────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  const daysIdx = args.indexOf('--days');
  const staleAfterDays =
    daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 30;

  const toolIdx = args.indexOf('--tool');
  const tool =
    toolIdx !== -1 && args[toolIdx + 1] ? args[toolIdx + 1] : undefined;

  const dbPath =
    process.env.AGENT_DB_PATH || resolve(__dirname, '../data/insights.db');

  let hasStale = false;

  for (const tier of ['golden', 'labeled'] as const) {
    const report = analyzeTierStaleness(dbPath, tier, staleAfterDays, tool);
    printTierStaleness(report);
    if (report.stale.length > 0) hasStale = true;
  }

  console.log('');

  if (hasStale) {
    process.exit(1);
  }
}

// Only run main when executed directly (not when imported as library)
if (require.main === module) {
  main();
}
