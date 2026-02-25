import { Injectable } from '@nestjs/common';

import { ToolMetricsRecord } from '../common/storage.types';
import { DatabaseService } from './database.service';

export interface ToolSummary {
  toolName: string;
  callCount: number;
  avgDurationMs: number;
  successRate: number;
}

@Injectable()
export class ToolMetricsRepository {
  constructor(private readonly db: DatabaseService) {}

  insertMany(records: ToolMetricsRecord[]): void {
    if (records.length === 0) return;

    const stmt = this.db.getDb().prepare(
      `INSERT INTO tool_metrics (id, requestMetricsId, toolName, calledAt, durationMs, success, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.getDb().transaction((rows: ToolMetricsRecord[]) => {
      for (const r of rows) {
        stmt.run(
          r.id,
          r.requestMetricsId,
          r.toolName,
          r.calledAt,
          r.durationMs,
          r.success ? 1 : 0,
          r.error ?? null
        );
      }
    });

    tx(records);
  }

  getByRequest(requestMetricsId: string): ToolMetricsRecord[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT * FROM tool_metrics WHERE requestMetricsId = ? ORDER BY calledAt ASC`
      )
      .all(requestMetricsId) as any[];
    return rows.map(this._mapRow);
  }

  getToolPerformance(toolName: string, limit = 50): ToolMetricsRecord[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT * FROM tool_metrics WHERE toolName = ? ORDER BY calledAt DESC LIMIT ?`
      )
      .all(toolName, limit) as any[];
    return rows.map(this._mapRow);
  }

  getToolSummary(): ToolSummary[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT
          toolName,
          COUNT(*) as callCount,
          AVG(durationMs) as avgDurationMs,
          AVG(success) as successRate
        FROM tool_metrics
        GROUP BY toolName
        ORDER BY callCount DESC`
      )
      .all() as any[];

    return rows.map((r: any) => ({
      toolName: r.toolName,
      callCount: r.callCount,
      avgDurationMs: r.avgDurationMs,
      successRate: r.successRate
    }));
  }

  private _mapRow(row: any): ToolMetricsRecord {
    return {
      id: row.id,
      requestMetricsId: row.requestMetricsId,
      toolName: row.toolName,
      calledAt: row.calledAt,
      durationMs: row.durationMs,
      success: !!row.success,
      error: row.error ?? undefined
    };
  }
}
