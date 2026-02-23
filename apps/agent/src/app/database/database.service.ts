import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface Insight {
  category: string;
  data: Record<string, unknown>;
  generatedAt: string;
  id: string;
  summary: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: Database.Database;

  public constructor(private readonly configService: ConfigService) {}

  public onModuleInit(): void {
    const dbPath = this.configService.get<string>(
      'AGENT_DB_PATH',
      './data/insights.db'
    );

    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS insights (
        id           TEXT PRIMARY KEY,
        category     TEXT NOT NULL,
        summary      TEXT NOT NULL,
        data         TEXT NOT NULL,
        generated_at TEXT NOT NULL
      )
    `);

    this.logger.log(`SQLite connected: ${dbPath}`);
  }

  public onModuleDestroy(): void {
    this.db?.close();
  }

  public insertInsight(insight: Omit<Insight, 'id' | 'generatedAt'>): Insight {
    const row: Insight = {
      ...insight,
      generatedAt: new Date().toISOString(),
      id: randomUUID()
    };

    this.db
      .prepare(
        `INSERT INTO insights (id, category, summary, data, generated_at)
         VALUES (@id, @category, @summary, @data, @generatedAt)`
      )
      .run({ ...row, data: JSON.stringify(row.data) });

    return row;
  }

  public getInsights(): Insight[] {
    const rows = this.db
      .prepare(
        `SELECT id, category, summary, data, generated_at as generatedAt
         FROM insights ORDER BY generated_at DESC`
      )
      .all() as (Omit<Insight, 'data'> & { data: string })[];

    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
  }

  public getInsightById(id: string): Insight | undefined {
    const row = this.db
      .prepare(
        `SELECT id, category, summary, data, generated_at as generatedAt
         FROM insights WHERE id = ?`
      )
      .get(id) as (Omit<Insight, 'data'> & { data: string }) | undefined;

    if (!row) return undefined;
    return { ...row, data: JSON.parse(row.data) };
  }
}
