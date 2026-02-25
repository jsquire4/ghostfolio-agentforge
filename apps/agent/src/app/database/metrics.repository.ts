import { Injectable } from '@nestjs/common';

import { RequestMetrics } from '../common/interfaces';
import { ToolMetricsRecord } from '../common/storage.types';
import { DatabaseService } from './database.service';

export interface AggregateMetrics {
  totalRequests: number;
  avgLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalEstimatedCostUsd: number;
  avgToolSuccessRate: number;
}

@Injectable()
export class MetricsRepository {
  constructor(private readonly db: DatabaseService) {}

  insert(record: RequestMetrics): void {
    const stmt = this.db.getDb().prepare(
      `INSERT INTO request_metrics (
        id, userId, conversationId, requestedAt, totalLatencyMs,
        tokensIn, tokensOut, estimatedCostUsd, toolCallCount,
        toolSuccessCount, toolSuccessRate, verifierWarningCount,
        verifierFlagCount, channel, langsmith_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      record.id,
      record.userId,
      record.conversationId,
      record.requestedAt,
      record.totalLatencyMs,
      record.tokensIn,
      record.tokensOut,
      record.estimatedCostUsd,
      record.toolCallCount,
      record.toolSuccessCount,
      record.toolSuccessRate,
      record.verifierWarningCount,
      record.verifierFlagCount,
      record.channel ?? null,
      record.langsmithRunId ?? null
    );
  }

  insertWithToolMetrics(
    record: RequestMetrics,
    toolRecords: ToolMetricsRecord[]
  ): void {
    const db = this.db.getDb();
    const insertMetrics = db.prepare(
      `INSERT INTO request_metrics (
        id, userId, conversationId, requestedAt, totalLatencyMs,
        tokensIn, tokensOut, estimatedCostUsd, toolCallCount,
        toolSuccessCount, toolSuccessRate, verifierWarningCount,
        verifierFlagCount, channel, langsmith_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertTool = db.prepare(
      `INSERT INTO tool_metrics (id, requestMetricsId, toolName, calledAt, durationMs, success, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const txn = db.transaction(() => {
      insertMetrics.run(
        record.id,
        record.userId,
        record.conversationId,
        record.requestedAt,
        record.totalLatencyMs,
        record.tokensIn,
        record.tokensOut,
        record.estimatedCostUsd,
        record.toolCallCount,
        record.toolSuccessCount,
        record.toolSuccessRate,
        record.verifierWarningCount,
        record.verifierFlagCount,
        record.channel ?? null,
        record.langsmithRunId ?? null
      );
      for (const r of toolRecords) {
        insertTool.run(
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
    txn();
  }

  getByUser(userId: string, limit = 50, offset = 0): RequestMetrics[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT * FROM request_metrics WHERE userId = ? ORDER BY requestedAt DESC LIMIT ? OFFSET ?`
      )
      .all(userId, limit, offset) as any[];
    return rows.map(this._mapRow);
  }

  getAggregateByUser(userId: string): AggregateMetrics {
    const row = this.db
      .getDb()
      .prepare(
        `SELECT
          COUNT(*) as totalRequests,
          AVG(totalLatencyMs) as avgLatencyMs,
          SUM(tokensIn) as totalTokensIn,
          SUM(tokensOut) as totalTokensOut,
          SUM(estimatedCostUsd) as totalEstimatedCostUsd,
          AVG(toolSuccessRate) as avgToolSuccessRate
        FROM request_metrics WHERE userId = ?`
      )
      .get(userId) as any;

    return this._mapAggregate(row);
  }

  getAggregateAll(): AggregateMetrics {
    const row = this.db
      .getDb()
      .prepare(
        `SELECT
          COUNT(*) as totalRequests,
          AVG(totalLatencyMs) as avgLatencyMs,
          SUM(tokensIn) as totalTokensIn,
          SUM(tokensOut) as totalTokensOut,
          SUM(estimatedCostUsd) as totalEstimatedCostUsd,
          AVG(toolSuccessRate) as avgToolSuccessRate
        FROM request_metrics`
      )
      .get() as any;

    return this._mapAggregate(row);
  }

  private _mapRow(row: any): RequestMetrics {
    return {
      id: row.id,
      userId: row.userId,
      conversationId: row.conversationId,
      requestedAt: row.requestedAt,
      totalLatencyMs: row.totalLatencyMs,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      estimatedCostUsd: row.estimatedCostUsd,
      toolCallCount: row.toolCallCount,
      toolSuccessCount: row.toolSuccessCount,
      toolSuccessRate: row.toolSuccessRate,
      verifierWarningCount: row.verifierWarningCount,
      verifierFlagCount: row.verifierFlagCount,
      channel: row.channel ?? undefined,
      langsmithRunId: row.langsmith_run_id ?? undefined
    };
  }

  private _mapAggregate(row: any): AggregateMetrics {
    return {
      totalRequests: row?.totalRequests ?? 0,
      avgLatencyMs: row?.avgLatencyMs ?? 0,
      totalTokensIn: row?.totalTokensIn ?? 0,
      totalTokensOut: row?.totalTokensOut ?? 0,
      totalEstimatedCostUsd: row?.totalEstimatedCostUsd ?? 0,
      avgToolSuccessRate: row?.avgToolSuccessRate ?? 0
    };
  }
}
