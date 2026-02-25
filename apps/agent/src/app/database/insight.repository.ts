import { Injectable } from '@nestjs/common';

import { InsightRecord } from '../common/interfaces';
import { safeParseJson } from '../common/json.util';
import { DatabaseService } from './database.service';

@Injectable()
export class InsightRepository {
  constructor(private readonly db: DatabaseService) {}

  insert(record: InsightRecord): void {
    const stmt = this.db.getDb().prepare(
      `INSERT INTO insights (id, userId, category, summary, data, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      record.id,
      record.userId,
      record.category,
      record.summary,
      record.data ? JSON.stringify(record.data) : '{}',
      record.createdAt,
      record.expiresAt ?? null
    );
  }

  getByUser(userId: string, limit = 50, offset = 0): InsightRecord[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT * FROM insights WHERE userId = ? ORDER BY generated_at DESC LIMIT ? OFFSET ?`
      )
      .all(userId, limit, offset) as any[];
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      category: row.category,
      summary: row.summary,
      data: safeParseJson(row.data) as Record<string, unknown> | undefined,
      createdAt: row.generated_at,
      expiresAt: row.expires_at ?? undefined
    }));
  }

  getById(id: string): InsightRecord | undefined {
    const row = this.db
      .getDb()
      .prepare(`SELECT * FROM insights WHERE id = ?`)
      .get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.userId,
      category: row.category,
      summary: row.summary,
      data: safeParseJson(row.data) as Record<string, unknown> | undefined,
      createdAt: row.generated_at,
      expiresAt: row.expires_at ?? undefined
    };
  }
}
