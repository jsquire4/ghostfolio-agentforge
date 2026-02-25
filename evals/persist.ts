// Thin SQLite wrapper for persisting eval results from the CLI.
// Opens/closes its own connection so the NestJS app doesn't need to be running.
import {
  EvalCaseResultRecord,
  EvalRunRecord
} from '@ghostfolio/agent/app/common/storage.types';

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

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
  db.pragma('busy_timeout = 5000');
  db.exec(EVAL_DDL);
  return db;
}

export function persistEvalRun(
  dbPath: string,
  run: EvalRunRecord,
  cases: EvalCaseResultRecord[]
): void {
  const db = openDb(dbPath);
  try {
    const insertRun = db.prepare(
      `INSERT INTO eval_runs (
        id, gitSha, model, tier, totalPassed, totalFailed,
        passRate, totalDurationMs, estimatedCost, runAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertCase = db.prepare(
      `INSERT INTO eval_case_results (
        id, runId, caseId, passed, durationMs, error, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    db.transaction(() => {
      insertRun.run(
        run.id,
        run.gitSha,
        run.model ?? null,
        run.tier,
        run.totalPassed,
        run.totalFailed,
        run.passRate,
        run.totalDurationMs,
        run.estimatedCost ?? null,
        run.runAt
      );
      for (const c of cases) {
        insertCase.run(
          c.id,
          c.runId,
          c.caseId,
          c.passed ? 1 : 0,
          c.durationMs,
          c.error ?? null,
          c.details ? JSON.stringify(c.details) : null
        );
      }
    })();
  } finally {
    db.close();
  }
}

export function getLatestRun(
  dbPath: string,
  tier: 'golden' | 'labeled'
): EvalRunRecord | undefined {
  const db = openDb(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT * FROM eval_runs WHERE tier = ? ORDER BY runAt DESC LIMIT 1`
      )
      .get(tier) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      gitSha: row.gitSha,
      model: row.model ?? undefined,
      tier: row.tier,
      totalPassed: row.totalPassed,
      totalFailed: row.totalFailed,
      passRate: row.passRate,
      totalDurationMs: row.totalDurationMs,
      estimatedCost: row.estimatedCost ?? undefined,
      runAt: row.runAt
    };
  } finally {
    db.close();
  }
}

export function getCaseResultsForRun(
  dbPath: string,
  runId: string
): EvalCaseResultRecord[] {
  const db = openDb(dbPath);
  try {
    const rows = db
      .prepare(`SELECT * FROM eval_case_results WHERE runId = ?`)
      .all(runId) as any[];
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      caseId: row.caseId,
      passed: row.passed === 1,
      durationMs: row.durationMs,
      error: row.error ?? undefined,
      details: row.details
        ? (safeJsonParse(row.details) as Record<string, unknown>)
        : undefined
    }));
  } finally {
    db.close();
  }
}
