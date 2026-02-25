import { NotFoundException } from '@nestjs/common';

import { EvalCaseResultRecord, EvalRunRecord } from '../common/storage.types';
import { EvalsRepository } from '../database/evals.repository';
import { EvalsController } from './evals.controller';

describe('EvalsController', () => {
  let controller: EvalsController;
  let mockRepo: jest.Mocked<EvalsRepository>;

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

  beforeEach(() => {
    mockRepo = {
      insertRun: jest.fn(),
      insertCaseResults: jest.fn(),
      getRecentRuns: jest.fn().mockReturnValue([]),
      getRunById: jest.fn().mockReturnValue(undefined),
      getCaseHistory: jest.fn().mockReturnValue([]),
      getLatestRun: jest.fn().mockReturnValue(undefined)
    } as unknown as jest.Mocked<EvalsRepository>;
    controller = new EvalsController(mockRepo);
  });

  it('runEvals returns CLI guidance message', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const result = controller.runEvals(user as any);
    expect(result.status).toBe('not_supported');
    expect(result.message).toContain('npm run eval');
  });

  it('getResults returns recent runs from repo with defaults', () => {
    const runs = [makeRun(), makeRun({ id: 'run-2' })];
    mockRepo.getRecentRuns.mockReturnValue(runs);

    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const result = controller.getResults(user as any, 20, 0);
    expect(result).toHaveLength(2);
    expect(mockRepo.getRecentRuns).toHaveBeenCalledWith(20, 0);
  });

  it('getResults respects limit and offset params', () => {
    mockRepo.getRecentRuns.mockReturnValue([]);
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    controller.getResults(user as any, 10, 5);
    expect(mockRepo.getRecentRuns).toHaveBeenCalledWith(10, 5);
  });

  it('getRunById returns run with cases', () => {
    const run = makeRun();
    const cases: EvalCaseResultRecord[] = [
      {
        id: 'c1',
        runId: 'run-1',
        caseId: 'gs-001',
        passed: true,
        durationMs: 500
      }
    ];
    mockRepo.getRunById.mockReturnValue({ run, cases });

    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const result = controller.getRunById(user as any, 'run-1');
    expect(result).toHaveProperty('run');
    expect(result).toHaveProperty('cases');
  });

  it('getRunById throws NotFoundException for unknown run', () => {
    mockRepo.getRunById.mockReturnValue(undefined);
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    expect(() => controller.getRunById(user as any, 'nonexistent')).toThrow(
      NotFoundException
    );
  });
});
