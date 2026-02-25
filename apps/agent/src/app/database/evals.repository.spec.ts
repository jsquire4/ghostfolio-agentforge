import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { EvalCaseResultRecord, EvalRunRecord } from '../common/storage.types';
import { DatabaseService } from './database.service';
import { EvalsRepository } from './evals.repository';

describe('EvalsRepository', () => {
  let dbService: DatabaseService;
  let repo: EvalsRepository;
  let tmpDir: string;

  const makeRun = (overrides?: Partial<EvalRunRecord>): EvalRunRecord => ({
    id: 'run-1',
    gitSha: 'abc123',
    tier: 'golden',
    totalPassed: 5,
    totalFailed: 1,
    passRate: 0.833,
    totalDurationMs: 3000,
    runAt: '2025-06-15T12:00:00.000Z',
    ...overrides
  });

  const makeCase = (
    overrides?: Partial<EvalCaseResultRecord>
  ): EvalCaseResultRecord => ({
    id: 'case-1',
    runId: 'run-1',
    caseId: 'gs-001',
    passed: true,
    durationMs: 500,
    ...overrides
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'evals-repo-test-'));
    const configService = {
      get: jest.fn().mockReturnValue(join(tmpDir, 'evals.db'))
    } as unknown as ConfigService;
    dbService = new DatabaseService(configService);
    dbService.onModuleInit();
    repo = new EvalsRepository(dbService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and retrieves a run', () => {
    const run = makeRun();
    repo.insertRun(run);
    const runs = repo.getRecentRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('run-1');
    expect(runs[0].passRate).toBeCloseTo(0.833, 3);
  });

  it('inserts and retrieves case results', () => {
    repo.insertRun(makeRun());
    repo.insertCaseResults([
      makeCase({ id: 'c1', caseId: 'gs-001', passed: true }),
      makeCase({ id: 'c2', caseId: 'gs-002', passed: false, error: 'timeout' })
    ]);

    const result = repo.getRunById('run-1');
    expect(result).toBeDefined();
    expect(result!.cases).toHaveLength(2);
    expect(result!.cases[0].passed).toBe(true);
    expect(result!.cases[1].passed).toBe(false);
    expect(result!.cases[1].error).toBe('timeout');
  });

  it('stores and retrieves details as JSON', () => {
    repo.insertRun(makeRun());
    const details = { prompt: 'test', tokens: 42 };
    repo.insertCaseResults([makeCase({ details })]);

    const result = repo.getRunById('run-1');
    expect(result!.cases[0].details).toEqual(details);
  });

  it('returns undefined for unknown runId', () => {
    expect(repo.getRunById('nonexistent')).toBeUndefined();
  });

  it('getRecentRuns respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      repo.insertRun(
        makeRun({
          id: `run-${i}`,
          runAt: `2025-06-15T12:0${i}:00.000Z`
        })
      );
    }
    const page = repo.getRecentRuns(2, 1);
    expect(page).toHaveLength(2);
    expect(page[0].id).toBe('run-3'); // desc order, offset 1
  });

  it('getLatestRun returns most recent for tier', () => {
    repo.insertRun(
      makeRun({ id: 'r1', tier: 'golden', runAt: '2025-06-15T12:00:00.000Z' })
    );
    repo.insertRun(
      makeRun({ id: 'r2', tier: 'golden', runAt: '2025-06-15T13:00:00.000Z' })
    );
    repo.insertRun(
      makeRun({ id: 'r3', tier: 'labeled', runAt: '2025-06-15T14:00:00.000Z' })
    );

    const latest = repo.getLatestRun('golden');
    expect(latest).toBeDefined();
    expect(latest!.id).toBe('r2');
  });

  it('getLatestRun returns undefined when no runs for tier', () => {
    expect(repo.getLatestRun('golden')).toBeUndefined();
  });

  it('getCaseHistory returns results across runs', () => {
    repo.insertRun(makeRun({ id: 'r1', runAt: '2025-06-15T12:00:00.000Z' }));
    repo.insertRun(makeRun({ id: 'r2', runAt: '2025-06-15T13:00:00.000Z' }));
    repo.insertCaseResults([
      makeCase({ id: 'c1', runId: 'r1', caseId: 'gs-001', durationMs: 400 }),
      makeCase({ id: 'c2', runId: 'r2', caseId: 'gs-001', durationMs: 600 })
    ]);

    const history = repo.getCaseHistory('gs-001');
    expect(history).toHaveLength(2);
    // Most recent first
    expect(history[0].runId).toBe('r2');
    expect(history[1].runId).toBe('r1');
  });

  it('handles optional model and estimatedCost', () => {
    repo.insertRun(makeRun({ model: 'gpt-4o-mini', estimatedCost: 0.05 }));
    const runs = repo.getRecentRuns();
    expect(runs[0].model).toBe('gpt-4o-mini');
    expect(runs[0].estimatedCost).toBeCloseTo(0.05, 3);
  });

  it('handles missing optional fields as undefined', () => {
    repo.insertRun(makeRun());
    const runs = repo.getRecentRuns();
    expect(runs[0].model).toBeUndefined();
    expect(runs[0].estimatedCost).toBeUndefined();
  });

  it('insertCaseResults with empty array does not throw', () => {
    repo.insertRun(makeRun());
    expect(() => repo.insertCaseResults([])).not.toThrow();
    const result = repo.getRunById('run-1');
    expect(result!.cases).toHaveLength(0);
  });

  it('getCaseHistory respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      repo.insertRun(
        makeRun({ id: `r-${i}`, runAt: `2025-06-15T12:0${i}:00.000Z` })
      );
      repo.insertCaseResults([
        makeCase({ id: `c-${i}`, runId: `r-${i}`, caseId: 'gs-001' })
      ]);
    }
    const history = repo.getCaseHistory('gs-001', 3);
    expect(history).toHaveLength(3);
    // Most recent first
    expect(history[0].runId).toBe('r-4');
  });
});
