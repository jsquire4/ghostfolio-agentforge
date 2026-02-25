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

interface Migration {
  version: number;
  sql: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: Database.Database;

  private readonly MIGRATIONS: Migration[] = [
    {
      version: 1,
      sql: `ALTER TABLE insights ADD COLUMN userId TEXT NOT NULL DEFAULT ''`
    },
    { version: 2, sql: `ALTER TABLE insights ADD COLUMN expires_at TEXT` }
  ];

  public constructor(private readonly configService: ConfigService) {}

  public onModuleInit(): void {
    // NOTE: Default path './data/insights.db' is relative to CWD.
    // In Docker, CWD is set via WORKDIR. For other deployments, set AGENT_DB_PATH explicitly.
    const dbPath = this.configService.get<string>(
      'AGENT_DB_PATH',
      './data/insights.db'
    );

    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');

    this._createTables(this.db);
    this._runMigrations(this.db);
    this._createIndexes(this.db);

    this.logger.log(`SQLite connected: ${dbPath}`);
  }

  public onModuleDestroy(): void {
    this.db?.close();
  }

  public getDb(): Database.Database {
    return this.db;
  }

  private _createTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS insights (
        id           TEXT PRIMARY KEY,
        category     TEXT NOT NULL,
        summary      TEXT NOT NULL,
        data         TEXT NOT NULL,
        generated_at TEXT NOT NULL
      )
    `);

    db.exec(`
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

    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id             TEXT PRIMARY KEY,
        userId         TEXT NOT NULL,
        conversationId TEXT NOT NULL,
        rating         TEXT NOT NULL,
        correction     TEXT,
        createdAt      TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS request_metrics (
        id                   TEXT PRIMARY KEY,
        userId               TEXT NOT NULL,
        conversationId       TEXT NOT NULL,
        requestedAt          TEXT NOT NULL,
        totalLatencyMs       INTEGER NOT NULL,
        tokensIn             INTEGER NOT NULL,
        tokensOut            INTEGER NOT NULL,
        estimatedCostUsd     REAL NOT NULL,
        toolCallCount        INTEGER NOT NULL,
        toolSuccessCount     INTEGER NOT NULL,
        toolSuccessRate      REAL NOT NULL,
        verifierWarningCount INTEGER NOT NULL,
        verifierFlagCount    INTEGER NOT NULL,
        channel              TEXT,
        langsmith_run_id     TEXT
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_metrics (
        id                TEXT PRIMARY KEY,
        requestMetricsId  TEXT NOT NULL,
        toolName          TEXT NOT NULL,
        calledAt          TEXT NOT NULL,
        durationMs        INTEGER NOT NULL,
        success           INTEGER NOT NULL,
        error             TEXT,
        FOREIGN KEY (requestMetricsId) REFERENCES request_metrics(id)
      )
    `);

    db.exec(`
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
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS eval_case_results (
        id         TEXT PRIMARY KEY,
        runId      TEXT NOT NULL,
        caseId     TEXT NOT NULL,
        passed     INTEGER NOT NULL,
        durationMs INTEGER NOT NULL,
        error      TEXT,
        details    TEXT,
        FOREIGN KEY (runId) REFERENCES eval_runs(id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version    INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
  }

  private _runMigrations(db: Database.Database): void {
    const maxRow = db
      .prepare('SELECT MAX(version) as v FROM schema_version')
      .get() as { v: number | null } | undefined;
    const currentVersion = maxRow?.v ?? 0;

    for (const migration of this.MIGRATIONS) {
      if (migration.version <= currentVersion) continue;
      try {
        db.exec(migration.sql);
      } catch (e: unknown) {
        // Backward-compat: pre-version-table databases may already have the column
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('duplicate column name')) throw e;
      }
      db.prepare(
        'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
      ).run(migration.version, new Date().toISOString());
    }
  }

  private _createIndexes(db: Database.Database): void {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_request_metrics_userId ON request_metrics(userId)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_request_metrics_requestedAt ON request_metrics(requestedAt)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tool_metrics_requestMetricsId ON tool_metrics(requestMetricsId)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tool_metrics_toolName ON tool_metrics(toolName)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_userId ON audit_log(userId)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_feedback_userId ON feedback(userId)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_insights_userId ON insights(userId)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_insights_generated_at ON insights(generated_at)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_eval_runs_runAt ON eval_runs(runAt)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_eval_case_results_runId ON eval_case_results(runId)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_eval_case_results_caseId ON eval_case_results(caseId)`
    );
  }
}
