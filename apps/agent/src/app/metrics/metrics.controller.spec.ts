import { Test } from '@nestjs/testing';

import { MetricsRepository } from '../database/metrics.repository';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockMetricsRepo: {
    getByUser: jest.Mock;
    getAggregateByUser: jest.Mock;
    getAggregateAll: jest.Mock;
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

    const module = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsRepository, useValue: mockMetricsRepo }]
    }).compile();

    controller = module.get(MetricsController);
  });

  it('getMetrics calls getByUser with default limit/offset', () => {
    controller.getMetrics(user);
    expect(mockMetricsRepo.getByUser).toHaveBeenCalledWith('user-1', 50, 0);
  });

  it('getMetrics passes parsed limit and offset', () => {
    controller.getMetrics(user, '10', '5');
    expect(mockMetricsRepo.getByUser).toHaveBeenCalledWith('user-1', 10, 5);
  });

  it('getMetrics falls back to defaults on non-numeric input', () => {
    controller.getMetrics(user, 'abc', 'xyz');
    expect(mockMetricsRepo.getByUser).toHaveBeenCalledWith('user-1', 50, 0);
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
});
