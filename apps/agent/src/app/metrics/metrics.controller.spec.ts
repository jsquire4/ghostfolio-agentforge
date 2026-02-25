import { Test } from '@nestjs/testing';

import { MetricsRepository } from '../database/metrics.repository';
import { ToolMetricsRepository } from '../database/tool-metrics.repository';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockMetricsRepo: {
    getByUser: jest.Mock;
    getAggregateByUser: jest.Mock;
    getAggregateAll: jest.Mock;
  };
  let mockToolMetricsRepo: {
    getToolSummary: jest.Mock;
    getToolPerformance: jest.Mock;
  };

  const user = { userId: 'user-1', rawJwt: 'jwt' };

  beforeEach(async () => {
    mockMetricsRepo = {
      getByUser: jest.fn().mockReturnValue([]),
      getAggregateByUser: jest.fn().mockReturnValue({
        totalRequests: 5,
        avgLatencyMs: 300,
        totalTokensIn: 5000,
        totalTokensOut: 2500,
        totalEstimatedCostUsd: 0.005,
        avgToolSuccessRate: 0.95
      }),
      getAggregateAll: jest.fn().mockReturnValue({
        totalRequests: 100,
        avgLatencyMs: 400,
        totalTokensIn: 100000,
        totalTokensOut: 50000,
        totalEstimatedCostUsd: 0.1,
        avgToolSuccessRate: 0.9
      })
    };

    mockToolMetricsRepo = {
      getToolSummary: jest.fn().mockReturnValue([
        {
          toolName: 'portfolio-summary',
          callCount: 10,
          avgDurationMs: 200,
          successRate: 0.9
        }
      ]),
      getToolPerformance: jest.fn().mockReturnValue([
        {
          id: 'tm-1',
          requestMetricsId: 'req-1',
          toolName: 'portfolio-summary',
          calledAt: '2025-06-15T12:00:00.000Z',
          durationMs: 200,
          success: true
        }
      ])
    };

    const module = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: MetricsRepository, useValue: mockMetricsRepo },
        { provide: ToolMetricsRepository, useValue: mockToolMetricsRepo }
      ]
    }).compile();

    controller = module.get(MetricsController);
  });

  it('getMetrics calls getByUser with default limit/offset', () => {
    controller.getMetrics(user, 50, 0);
    expect(mockMetricsRepo.getByUser).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('getMetrics passes provided limit and offset', () => {
    controller.getMetrics(user, 10, 5);
    expect(mockMetricsRepo.getByUser).toHaveBeenCalledWith('user-1', 10, 5);
  });

  it('getSummary calls getAggregateByUser', () => {
    const result = controller.getSummary(user);
    expect(mockMetricsRepo.getAggregateByUser).toHaveBeenCalledWith('user-1');
    expect(result.totalRequests).toBe(5);
  });

  it('getAdminSummary calls getAggregateAll', () => {
    const result = controller.getAdminSummary();
    expect(mockMetricsRepo.getAggregateAll).toHaveBeenCalled();
    expect(result.totalRequests).toBe(100);
  });

  it('getToolSummary returns aggregated tool stats', () => {
    const result = controller.getToolSummary();
    expect(mockToolMetricsRepo.getToolSummary).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].toolName).toBe('portfolio-summary');
    expect(result[0].callCount).toBe(10);
  });

  it('getToolPerformance calls getToolPerformance with default limit', () => {
    controller.getToolPerformance('portfolio-summary', 50);
    expect(mockToolMetricsRepo.getToolPerformance).toHaveBeenCalledWith(
      'portfolio-summary',
      50
    );
  });

  it('getToolPerformance passes provided limit', () => {
    controller.getToolPerformance('portfolio-summary', 10);
    expect(mockToolMetricsRepo.getToolPerformance).toHaveBeenCalledWith(
      'portfolio-summary',
      10
    );
  });

  // Note: ParseIntPipe validation (HTTP 400 on non-numeric input) is tested
  // via NestJS e2e tests, not unit tests — unit tests call controller methods
  // directly, bypassing the pipe chain.
});
