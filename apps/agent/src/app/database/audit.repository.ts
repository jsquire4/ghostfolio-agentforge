import { Injectable } from '@nestjs/common';

import { AuditEntry } from '../common/interfaces';
import { safeParseJson } from '../common/json.util';
import { DatabaseService } from './database.service';

@Injectable()
export class AuditRepository {
  constructor(private readonly db: DatabaseService) {}

  log(entry: AuditEntry): void {
    const stmt = this.db.getDb().prepare(
      `INSERT INTO audit_log (id, userId, action, toolName, params, result, timestamp, durationMs, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      entry.id,
      entry.userId,
      entry.action,
      entry.toolName ?? null,
      entry.params ? JSON.stringify(entry.params) : null,
      entry.result ?? null,
      entry.timestamp,
      entry.durationMs ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );
  }

  getByUser(userId: string): AuditEntry[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT * FROM audit_log WHERE userId = ? ORDER BY timestamp DESC`
      )
      .all(userId) as any[];
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      action: row.action,
      toolName: row.toolName ?? undefined,
      params: safeParseJson(row.params) as Record<string, unknown> | undefined,
      result: row.result ?? undefined,
      timestamp: row.timestamp,
      durationMs: row.durationMs ?? undefined,
      metadata: safeParseJson(row.metadata) as
        | Record<string, unknown>
        | undefined
    }));
  }
}
