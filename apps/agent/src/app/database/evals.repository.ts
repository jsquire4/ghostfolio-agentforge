import { Injectable } from '@nestjs/common';

import { EvalCaseResultRecord, EvalRunRecord } from '../common/storage.types';
import { DatabaseService } from './database.service';

@Injectable()
export class EvalsRepository {
  constructor(private readonly db: DatabaseService) {}

  insertRun(record: EvalRunRecord): void {
    this.db
      .getDb()
      .prepare(
        `INSERT INTO eval_runs (
          id, gitSha, model, tier, totalPassed, totalFailed,
          passRate, totalDurationMs, estimatedCost, runAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.gitSha,
        record.model ?? null,
        record.tier,
        record.totalPassed,
        record.totalFailed,
        record.passRate,
        record.totalDurationMs,
        record.estimatedCost ?? null,
        record.runAt
      );
  }

  insertCaseResults(results: EvalCaseResultRecord[]): void {
    const stmt = this.db.getDb().prepare(
      `INSERT INTO eval_case_results (
          id, runId, caseId, passed, durationMs, error, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMany = this.db
      .getDb()
      .transaction((rows: EvalCaseResultRecord[]) => {
        for (const r of rows) {
          stmt.run(
            r.id,
            r.runId,
            r.caseId,
            r.passed ? 1 : 0,
            r.durationMs,
            r.error ?? null,
            r.details ? JSON.stringify(r.details) : null
          );
        }
      });

    insertMany(results);
  }

  getRecentRuns(limit = 20, offset = 0): EvalRunRecord[] {
    const rows = this.db
      .getDb()
      .prepare(`SELECT * FROM eval_runs ORDER BY runAt DESC LIMIT ? OFFSET ?`)
      .all(limit, offset) as any[];
    return rows.map((r) => this._mapRun(r));
  }

  getRunById(
    runId: string
  ): { run: EvalRunRecord; cases: EvalCaseResultRecord[] } | undefined {
    const row = this.db
      .getDb()
      .prepare(`SELECT * FROM eval_runs WHERE id = ?`)
      .get(runId) as any;

    if (!row) return undefined;

    const cases = this.db
      .getDb()
      .prepare(`SELECT * FROM eval_case_results WHERE runId = ?`)
      .all(runId) as any[];

    return {
      run: this._mapRun(row),
      cases: cases.map((r) => this._mapCase(r))
    };
  }

  getCaseHistory(caseId: string, limit = 20): EvalCaseResultRecord[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT ecr.* FROM eval_case_results ecr
         JOIN eval_runs er ON ecr.runId = er.id
         WHERE ecr.caseId = ?
         ORDER BY er.runAt DESC
         LIMIT ?`
      )
      .all(caseId, limit) as any[];
    return rows.map((r) => this._mapCase(r));
  }

  getLatestRun(tier: 'golden' | 'labeled'): EvalRunRecord | undefined {
    const row = this.db
      .getDb()
      .prepare(
        `SELECT * FROM eval_runs WHERE tier = ? ORDER BY runAt DESC LIMIT 1`
      )
      .get(tier) as any;
    return row ? this._mapRun(row) : undefined;
  }

  private _mapRun(row: any): EvalRunRecord {
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
  }

  private _mapCase(row: any): EvalCaseResultRecord {
    return {
      id: row.id,
      runId: row.runId,
      caseId: row.caseId,
      passed: row.passed === 1,
      durationMs: row.durationMs,
      error: row.error ?? undefined,
      details: row.details ? JSON.parse(row.details) : undefined
    };
  }
}
