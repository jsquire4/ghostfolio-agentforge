import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

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

    try {
      this.db.exec(
        `ALTER TABLE insights ADD COLUMN userId TEXT NOT NULL DEFAULT ''`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('duplicate column name')) throw e;
    }
    try {
      this.db.exec(`ALTER TABLE insights ADD COLUMN expires_at TEXT`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('duplicate column name')) throw e;
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id         TEXT PRIMARY KEY,
        userId     TEXT NOT NULL,
        action     TEXT NOT NULL,
        toolName   TEXT,
        params     TEXT,
        result     TEXT,
        timestamp  TEXT NOT NULL,
        durationMs INTEGER,
        metadata   TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id             TEXT PRIMARY KEY,
        userId         TEXT NOT NULL,
        conversationId TEXT NOT NULL,
        rating         TEXT NOT NULL,
        correction     TEXT,
        createdAt      TEXT NOT NULL
      )
    `);

    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_userId ON audit_log(userId)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_feedback_userId ON feedback(userId)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_insights_userId ON insights(userId)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_insights_generated_at ON insights(generated_at)`
    );

    this.logger.log(`SQLite connected: ${dbPath}`);
  }

  public onModuleDestroy(): void {
    this.db?.close();
  }

  public getDb(): Database.Database {
    return this.db;
  }
}
