import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { ToolMetricsRecord } from '../common/storage.types';
import { DatabaseService } from './database.service';
import { ToolMetricsRepository } from './tool-metrics.repository';

describe('ToolMetricsRepository', () => {
  let dbService: DatabaseService;
  let repo: ToolMetricsRepository;
  let tmpDir: string;

  const makeRecord = (
    overrides?: Partial<ToolMetricsRecord>
  ): ToolMetricsRecord => ({
    id: 'tm-1',
    requestMetricsId: 'req-1',
    toolName: 'portfolio-summary',
    calledAt: '2025-06-15T12:00:00.000Z',
    durationMs: 200,
    success: true,
    ...overrides
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tool-metrics-repo-test-'));
    const configService = {
      get: jest.fn().mockReturnValue(join(tmpDir, 'test.db'))
    } as unknown as ConfigService;
    dbService = new DatabaseService(configService);
    dbService.onModuleInit();
    repo = new ToolMetricsRepository(dbService);

    // Seed a parent request_metrics row to satisfy FK constraint
    dbService
      .getDb()
      .prepare(
        `INSERT INTO request_metrics (id, userId, conversationId, requestedAt, totalLatencyMs, tokensIn, tokensOut, estimatedCostUsd, toolCallCount, toolSuccessCount, toolSuccessRate, verifierWarningCount, verifierFlagCount)
       VALUES ('req-1', 'user-1', 'conv-1', '2025-06-15T12:00:00.000Z', 500, 1000, 500, 0.001, 2, 2, 1.0, 0, 0)`
      )
      .run();
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('insertMany and getByRequest returns records in order', () => {
    const records = [
      makeRecord({ id: 'tm-1', calledAt: '2025-06-15T12:00:00.000Z' }),
      makeRecord({
        id: 'tm-2',
        calledAt: '2025-06-15T12:01:00.000Z',
        toolName: 'account-list'
      })
    ];
    repo.insertMany(records);

    const result = repo.getByRequest('req-1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('tm-1');
    expect(result[1].id).toBe('tm-2');
    expect(result[0].success).toBe(true);
  });

  it('insertMany with empty array is a no-op', () => {
    repo.insertMany([]);
    expect(repo.getByRequest('req-1')).toEqual([]);
  });

  it('getToolPerformance returns records for a specific tool', () => {
    repo.insertMany([
      makeRecord({ id: 'tm-1', toolName: 'portfolio-summary' }),
      makeRecord({ id: 'tm-2', toolName: 'account-list' }),
      makeRecord({
        id: 'tm-3',
        toolName: 'portfolio-summary',
        calledAt: '2025-06-15T12:05:00.000Z'
      })
    ]);

    const result = repo.getToolPerformance('portfolio-summary');
    expect(result).toHaveLength(2);
    // Ordered by calledAt DESC
    expect(result[0].id).toBe('tm-3');
    expect(result[1].id).toBe('tm-1');
  });

  it('getToolPerformance respects limit', () => {
    repo.insertMany([
      makeRecord({ id: 'tm-1', calledAt: '2025-06-15T12:00:00.000Z' }),
      makeRecord({ id: 'tm-2', calledAt: '2025-06-15T12:01:00.000Z' }),
      makeRecord({ id: 'tm-3', calledAt: '2025-06-15T12:02:00.000Z' })
    ]);

    const result = repo.getToolPerformance('portfolio-summary', 2);
    expect(result).toHaveLength(2);
  });

  it('getToolSummary returns aggregated stats per tool', () => {
    repo.insertMany([
      makeRecord({
        id: 'tm-1',
        toolName: 'portfolio-summary',
        durationMs: 100,
        success: true
      }),
      makeRecord({
        id: 'tm-2',
        toolName: 'portfolio-summary',
        durationMs: 300,
        success: false
      }),
      makeRecord({
        id: 'tm-3',
        toolName: 'account-list',
        durationMs: 50,
        success: true
      })
    ]);

    const summary = repo.getToolSummary();
    expect(summary).toHaveLength(2);

    const ps = summary.find((s) => s.toolName === 'portfolio-summary')!;
    expect(ps.callCount).toBe(2);
    expect(ps.avgDurationMs).toBe(200);
    expect(ps.successRate).toBe(0.5);

    const al = summary.find((s) => s.toolName === 'account-list')!;
    expect(al.callCount).toBe(1);
    expect(al.successRate).toBe(1);
  });

  it('stores and retrieves error field', () => {
    repo.insertMany([
      makeRecord({ id: 'tm-1', success: false, error: 'timeout' })
    ]);

    const result = repo.getByRequest('req-1');
    expect(result[0].error).toBe('timeout');
    expect(result[0].success).toBe(false);
  });

  it('error is undefined when not provided', () => {
    repo.insertMany([makeRecord()]);
    const result = repo.getByRequest('req-1');
    expect(result[0].error).toBeUndefined();
  });
});
