import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { makeRequestMetrics } from '../../test-fixtures';
import { DatabaseService } from './database.service';
import { MetricsRepository } from './metrics.repository';

describe('MetricsRepository', () => {
  let dbService: DatabaseService;
  let repo: MetricsRepository;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'metrics-repo-test-'));
    const configService = {
      get: jest.fn().mockReturnValue(join(tmpDir, 'metrics.db'))
    } as unknown as ConfigService;
    dbService = new DatabaseService(configService);
    dbService.onModuleInit();
    repo = new MetricsRepository(dbService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and retrieves metrics by user', () => {
    const m = makeRequestMetrics();
    repo.insert(m);
    const results = repo.getByUser('user-1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('metric-1');
    expect(results[0].totalLatencyMs).toBe(500);
    expect(results[0].estimatedCostUsd).toBeCloseTo(0.00045, 5);
  });

  it('returns empty array for unknown user', () => {
    expect(repo.getByUser('unknown')).toEqual([]);
  });

  it('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      repo.insert(
        makeRequestMetrics({
          id: `metric-${i}`,
          requestedAt: `2025-06-15T12:0${i}:00.000Z`
        })
      );
    }
    const page = repo.getByUser('user-1', 2, 1);
    expect(page).toHaveLength(2);
  });

  it('computes aggregate by user', () => {
    repo.insert(
      makeRequestMetrics({
        id: 'm1',
        tokensIn: 1000,
        tokensOut: 500,
        totalLatencyMs: 400
      })
    );
    repo.insert(
      makeRequestMetrics({
        id: 'm2',
        tokensIn: 2000,
        tokensOut: 1000,
        totalLatencyMs: 600
      })
    );

    const agg = repo.getAggregateByUser('user-1');
    expect(agg.totalRequests).toBe(2);
    expect(agg.avgLatencyMs).toBe(500);
    expect(agg.totalTokensIn).toBe(3000);
    expect(agg.totalTokensOut).toBe(1500);
  });

  it('computes aggregate for all users', () => {
    repo.insert(makeRequestMetrics({ id: 'm1', userId: 'user-1' }));
    repo.insert(makeRequestMetrics({ id: 'm2', userId: 'user-2' }));

    const agg = repo.getAggregateAll();
    expect(agg.totalRequests).toBe(2);
  });

  it('handles channel field correctly', () => {
    repo.insert(makeRequestMetrics({ channel: 'web-chat' }));
    const results = repo.getByUser('user-1');
    expect(results[0].channel).toBe('web-chat');
  });

  it('handles missing channel gracefully', () => {
    const m = makeRequestMetrics();
    delete (m as any).channel;
    repo.insert(m);
    const results = repo.getByUser('user-1');
    expect(results[0].channel).toBeUndefined();
  });
});
