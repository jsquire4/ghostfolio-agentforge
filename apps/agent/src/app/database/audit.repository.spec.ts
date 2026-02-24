import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { AuditRepository } from './audit.repository';
import { DatabaseService } from './database.service';

describe('AuditRepository', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let repo: AuditRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'audit-repo-test-'));
    const configService = {
      get: jest.fn().mockReturnValue(join(tmpDir, 'audit.db'))
    } as unknown as ConfigService;
    dbService = new DatabaseService(configService);
    dbService.onModuleInit();
    repo = new AuditRepository(dbService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs and retrieves by user', () => {
    repo.log({
      id: 'audit-1',
      userId: 'user-1',
      action: 'chat',
      toolName: 'portfolio_summary',
      params: { mode: 'analysis' },
      result: 'ok',
      timestamp: '2025-01-01T00:00:00.000Z',
      durationMs: 100
    });

    const results = repo.getByUser('user-1');
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('chat');
    expect(results[0].params).toEqual({ mode: 'analysis' });
  });

  it('handles null optional fields', () => {
    repo.log({
      id: 'audit-2',
      userId: 'user-1',
      action: 'health_check',
      timestamp: '2025-01-01T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1');
    expect(results[0].toolName).toBeUndefined();
    expect(results[0].params).toBeUndefined();
  });

  it('logs with metadata and retrieves it', () => {
    repo.log({
      id: 'audit-meta',
      userId: 'user-1',
      action: 'tool_call',
      toolName: 'portfolio_summary',
      params: {},
      metadata: { source: 'test' },
      timestamp: '2025-01-01T00:00:00.000Z',
      durationMs: 50
    });

    const results = repo.getByUser('user-1');
    expect(results.find((r) => r.id === 'audit-meta')?.metadata).toEqual({
      source: 'test'
    });
  });

  it('handles malformed JSON in params and metadata', () => {
    const db = dbService.getDb();
    db.prepare(
      `INSERT INTO audit_log (id, userId, action, toolName, params, result, timestamp, durationMs, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'audit-3',
      'user-1',
      'chat',
      null,
      'not-valid-json',
      null,
      '2025-01-01T00:00:00.000Z',
      null,
      'also-invalid-json'
    );

    const results = repo.getByUser('user-1');
    expect(results[0].params).toEqual({});
    expect(results[0].metadata).toEqual({});
  });

  it('isolates records by user', () => {
    repo.log({
      id: 'audit-u1',
      userId: 'user-1',
      action: 'chat',
      timestamp: '2025-01-01T00:00:00.000Z'
    });
    repo.log({
      id: 'audit-u2',
      userId: 'user-2',
      action: 'tool_call',
      timestamp: '2025-01-01T00:00:00.000Z'
    });

    expect(repo.getByUser('user-1')).toHaveLength(1);
    expect(repo.getByUser('user-2')).toHaveLength(1);
    expect(repo.getByUser('user-1')[0].id).toBe('audit-u1');
  });

  it('returns multiple records in reverse chronological order', () => {
    repo.log({
      id: 'audit-first',
      userId: 'user-1',
      action: 'chat',
      timestamp: '2025-01-01T00:00:00.000Z'
    });
    repo.log({
      id: 'audit-second',
      userId: 'user-1',
      action: 'tool_call',
      timestamp: '2025-01-02T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('audit-second');
    expect(results[1].id).toBe('audit-first');
  });
});
