import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { DatabaseService } from './database.service';
import { InsightRepository } from './insight.repository';

describe('InsightRepository', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let repo: InsightRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'insight-repo-test-'));
    const configService = {
      get: jest.fn().mockReturnValue(join(tmpDir, 'insights.db'))
    } as unknown as ConfigService;
    dbService = new DatabaseService(configService);
    dbService.onModuleInit();
    repo = new InsightRepository(dbService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and retrieves by user', () => {
    repo.insert({
      id: 'ins-1',
      userId: 'user-1',
      category: 'verification',
      summary: 'Test summary',
      data: { key: 'value' },
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-02T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('ins-1');
    expect(results[0].category).toBe('verification');
    expect(results[0].data).toEqual({ key: 'value' });
  });

  it('getByUser respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      repo.insert({
        id: `ins-${i}`,
        userId: 'user-1',
        category: 'test',
        summary: `Summary ${i}`,
        data: {},
        createdAt: `2025-01-0${i + 1}T00:00:00.000Z`
      });
    }

    const page1 = repo.getByUser('user-1', 2, 0);
    expect(page1).toHaveLength(2);

    const page2 = repo.getByUser('user-1', 2, 2);
    expect(page2).toHaveLength(2);
  });

  it('getById returns undefined for missing id', () => {
    expect(repo.getById('nonexistent')).toBeUndefined();
  });

  it('getById returns record when present', () => {
    repo.insert({
      id: 'ins-by-id',
      userId: 'user-1',
      category: 'test',
      summary: 'Summary',
      data: { nested: true },
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const found = repo.getById('ins-by-id');
    expect(found).toBeDefined();
    expect(found?.id).toBe('ins-by-id');
    expect(found?.data).toEqual({ nested: true });
  });

  it('handles malformed JSON in data field', () => {
    const db = dbService.getDb();
    db.prepare(
      `INSERT INTO insights (id, userId, category, summary, data, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'malformed-1',
      'user-1',
      'test',
      'Summary',
      'not-valid-json',
      '2025-01-01T00:00:00.000Z',
      null
    );

    const results = repo.getByUser('user-1');
    expect(results[0].data).toEqual({});
  });

  it('getById handles malformed JSON in data field', () => {
    const db = dbService.getDb();
    db.prepare(
      `INSERT INTO insights (id, userId, category, summary, data, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'malformed-2',
      'user-1',
      'test',
      'Summary',
      '{invalid',
      '2025-01-01T00:00:00.000Z',
      null
    );

    const found = repo.getById('malformed-2');
    expect(found).toBeDefined();
    expect(found?.data).toEqual({});
  });

  it('insert uses empty object when data is undefined', () => {
    repo.insert({
      id: 'no-data',
      userId: 'user-1',
      category: 'test',
      summary: 'No data',
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const found = repo.getById('no-data');
    expect(found).toBeDefined();
    expect(found?.summary).toBe('No data');
  });

  it('insert handles null expiresAt', () => {
    repo.insert({
      id: 'no-expiry',
      userId: 'user-1',
      category: 'test',
      summary: 'No expiry',
      data: {},
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const found = repo.getById('no-expiry');
    expect(found?.expiresAt).toBeUndefined();
  });

  it('isolates records by user', () => {
    repo.insert({
      id: 'ins-u1',
      userId: 'user-1',
      category: 'test',
      summary: 'User 1',
      data: {},
      createdAt: '2025-01-01T00:00:00.000Z'
    });
    repo.insert({
      id: 'ins-u2',
      userId: 'user-2',
      category: 'test',
      summary: 'User 2',
      data: {},
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    expect(repo.getByUser('user-1')).toHaveLength(1);
    expect(repo.getByUser('user-2')).toHaveLength(1);
    expect(repo.getByUser('user-1')[0].id).toBe('ins-u1');
  });

  it('returns empty object for data when inserted with undefined data', () => {
    repo.insert({
      id: 'no-data-check',
      userId: 'user-1',
      category: 'test',
      summary: 'No data',
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const found = repo.getById('no-data-check');
    expect(found).toBeDefined();
    expect(found?.data).toEqual({});
  });

  it('returns empty array when offset is beyond total records', () => {
    repo.insert({
      id: 'ins-only',
      userId: 'user-1',
      category: 'test',
      summary: 'Only one',
      data: {},
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1', 10, 100);
    expect(results).toEqual([]);
  });

  it('getById returns expiresAt when set', () => {
    repo.insert({
      id: 'with-expiry',
      userId: 'user-1',
      category: 'test',
      summary: 'Has expiry',
      data: { ok: true },
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-06-01T00:00:00.000Z'
    });

    const found = repo.getById('with-expiry');
    expect(found?.expiresAt).toBe('2025-06-01T00:00:00.000Z');
  });

  it('getByUser returns undefined data when row.data is NULL', () => {
    const db = dbService.getDb();
    db.prepare(
      `INSERT INTO insights (id, userId, category, summary, data, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'null-data-1',
      'user-null',
      'test',
      'Summary',
      '',
      '2025-01-01T00:00:00.000Z',
      null
    );

    const results = repo.getByUser('user-null');
    expect(results).toHaveLength(1);
    expect(results[0].data).toBeUndefined();
  });

  it('getById returns undefined data when row.data is NULL', () => {
    const db = dbService.getDb();
    db.prepare(
      `INSERT INTO insights (id, userId, category, summary, data, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'null-data-2',
      'user-null',
      'test',
      'Summary',
      '',
      '2025-01-01T00:00:00.000Z',
      null
    );

    const found = repo.getById('null-data-2');
    expect(found).toBeDefined();
    expect(found?.data).toBeUndefined();
  });
});
