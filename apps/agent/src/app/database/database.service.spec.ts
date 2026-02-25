import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let tmpDir: string;
  let configService: ConfigService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agent-db-test-'));
    configService = {
      get: jest.fn().mockReturnValue(join(tmpDir, 'insights.db'))
    } as unknown as ConfigService;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates database and tables on init', () => {
    const service = new DatabaseService(configService);
    service.onModuleInit();

    const db = service.getDb();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);

    expect(tables).toContain('insights');
    expect(tables).toContain('audit_log');
    expect(tables).toContain('feedback');
    expect(tables).toContain('request_metrics');
    expect(tables).toContain('tool_metrics');
    expect(tables).toContain('eval_runs');
    expect(tables).toContain('eval_case_results');
    expect(tables).toContain('schema_version');

    service.onModuleDestroy();
  });

  it('populates schema_version table after init', () => {
    const service = new DatabaseService(configService);
    service.onModuleInit();

    const db = service.getDb();
    const versions = db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as { version: number }[];

    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);

    service.onModuleDestroy();
  });

  it('idempotent re-run: double onModuleInit does not error', () => {
    const service = new DatabaseService(configService);
    service.onModuleInit();
    service.onModuleDestroy();

    const service2 = new DatabaseService(configService);
    expect(() => service2.onModuleInit()).not.toThrow();

    // Verify schema_version is not duplicated
    const db = service2.getDb();
    const versions = db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as { version: number }[];
    expect(versions).toHaveLength(2);

    service2.onModuleDestroy();
  });

  it('closes db on destroy', () => {
    const service = new DatabaseService(configService);
    service.onModuleInit();
    service.onModuleDestroy();
    expect(() => service.getDb().prepare('SELECT 1').get()).toThrow();
  });

  it('getDb returns the database instance', () => {
    const service = new DatabaseService(configService);
    service.onModuleInit();
    const db = service.getDb();
    expect(db).toBeDefined();
    const result = db.prepare('SELECT 1 as val').get() as { val: number };
    expect(result.val).toBe(1);
    service.onModuleDestroy();
  });

  it('getDb() returns undefined before onModuleInit()', () => {
    const service = new DatabaseService(configService);
    expect(service.getDb()).toBeUndefined();
  });

  it('onModuleDestroy is safe before onModuleInit (optional chaining on db)', () => {
    const service = new DatabaseService(configService);
    expect(() => service.onModuleDestroy()).not.toThrow();
  });

  it('re-throws ALTER TABLE error when not a duplicate-column error', () => {
    // Pre-create "insights" as a VIEW — ALTER TABLE then fails with a non-duplicate error
    const dbPath = join(tmpDir, 'insights.db');
    const rawDb = new Database(dbPath);
    rawDb.exec(
      'CREATE VIEW insights AS SELECT "x" as id, "c" as category, "s" as summary, "{}" as data, "" as generated_at'
    );
    rawDb.close();

    const service = new DatabaseService(configService);
    expect(() => service.onModuleInit()).toThrow();
  });

  it('re-throws non-Error from migration execution', () => {
    const service = new DatabaseService(configService);
    const origExec = Database.prototype.exec;
    jest.spyOn(Database.prototype, 'exec').mockImplementation(function (
      this: Database.Database,
      sql: string
    ) {
      // Let table/index creation through; throw non-Error on migration ALTER
      if (sql.includes('ALTER TABLE')) {
        throw 'non-error-string'; // eslint-disable-line no-throw-literal
      }
      return origExec.call(this, sql);
    });

    expect(() => service.onModuleInit()).toThrow();
    jest.restoreAllMocks();
    service.onModuleDestroy();
  });

  it('backward-compat: handles pre-version-table databases with existing columns', () => {
    // Simulate a pre-migration database: create tables manually with columns already present
    const dbPath = join(tmpDir, 'insights.db');
    const rawDb = new Database(dbPath);
    rawDb.exec(`
      CREATE TABLE insights (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        summary TEXT NOT NULL,
        data TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        userId TEXT NOT NULL DEFAULT '',
        expires_at TEXT
      )
    `);
    rawDb.close();

    const service = new DatabaseService(configService);
    expect(() => service.onModuleInit()).not.toThrow();

    // Verify migrations were recorded despite columns already existing
    const db = service.getDb();
    const versions = db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as { version: number }[];
    expect(versions).toHaveLength(2);

    service.onModuleDestroy();
  });
});
