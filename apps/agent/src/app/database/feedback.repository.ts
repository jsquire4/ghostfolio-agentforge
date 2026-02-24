import { Injectable } from '@nestjs/common';

import { FeedbackRecord } from '../common/interfaces';
import { DatabaseService } from './database.service';

@Injectable()
export class FeedbackRepository {
  constructor(private readonly db: DatabaseService) {}

  log(record: FeedbackRecord): void {
    const stmt = this.db.getDb().prepare(
      `INSERT INTO feedback (id, userId, conversationId, rating, correction, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      record.id,
      record.userId,
      record.conversationId,
      record.rating,
      record.correction ?? null,
      record.createdAt
    );
  }

  getByUser(userId: string): FeedbackRecord[] {
    const rows = this.db
      .getDb()
      .prepare(
        `SELECT * FROM feedback WHERE userId = ? ORDER BY createdAt DESC`
      )
      .all(userId) as any[];
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      conversationId: row.conversationId,
      rating: row.rating,
      correction: row.correction ?? undefined,
      createdAt: row.createdAt
    }));
  }
}
