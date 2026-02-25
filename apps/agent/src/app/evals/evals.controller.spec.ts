import { NotFoundException } from '@nestjs/common';

import { makeEvalRunRecord } from '../../test-fixtures';
import { EvalCaseResultRecord } from '../common/storage.types';
import { EvalsRepository } from '../database/evals.repository';
import { EvalRunnerService } from './eval-runner.service';
import { EvalsController } from './evals.controller';

describe('EvalsController', () => {
  let controller: EvalsController;
  let mockRepo: jest.Mocked<EvalsRepository>;
  let mockRunner: jest.Mocked<EvalRunnerService>;

  beforeEach(() => {
    mockRepo = {
      insertRun: jest.fn(),
      insertCaseResults: jest.fn(),
      getRecentRuns: jest.fn().mockReturnValue([]),
      getRunById: jest.fn().mockReturnValue(undefined),
      getCaseHistory: jest.fn().mockReturnValue([]),
      getLatestRun: jest.fn().mockReturnValue(undefined)
    } as unknown as jest.Mocked<EvalsRepository>;
    mockRunner = {
      startRun: jest
        .fn()
        .mockReturnValue({ runId: 'run-123', status: 'started' }),
      getEventStream: jest.fn(),
      getStatus: jest.fn().mockReturnValue({ isRunning: false })
    } as unknown as jest.Mocked<EvalRunnerService>;
    controller = new EvalsController(mockRepo, mockRunner);
  });

  it('runEvals delegates to EvalRunnerService', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const result = controller.runEvals(user as any, { tier: 'golden' });
    expect(result.status).toBe('started');
    expect(result.runId).toBe('run-123');
    expect(mockRunner.startRun).toHaveBeenCalledWith('golden', undefined);
  });

  it('getStatus returns runner status', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    controller.getStatus(user as any);
    expect(mockRunner.getStatus).toHaveBeenCalled();
  });

  it('getResults returns recent runs from repo with defaults', () => {
    const runs = [makeEvalRunRecord(), makeEvalRunRecord({ id: 'run-2' })];
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
    const run = makeEvalRunRecord();
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
