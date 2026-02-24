import { Test } from '@nestjs/testing';

import { InsightRepository } from '../database/insight.repository';
import { InsightsController } from './insights.controller';

describe('InsightsController', () => {
  let controller: InsightsController;
  let insightRepository: InsightRepository;

  beforeEach(async () => {
    insightRepository = {
      getByUser: jest.fn().mockReturnValue([])
    } as any;

    const module = await Test.createTestingModule({
      controllers: [InsightsController],
      providers: [{ provide: InsightRepository, useValue: insightRepository }]
    }).compile();

    controller = module.get(InsightsController);
  });

  it('returns insights from repository for user', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const mockInsights = [
      { id: 'ins-1', category: 'verification', summary: 'Test' }
    ];
    insightRepository.getByUser = jest.fn().mockReturnValue(mockInsights);

    const result = controller.getInsights(user, 50, 0);

    expect(insightRepository.getByUser).toHaveBeenCalledWith('user-1', 50, 0);
    expect(result).toEqual(mockInsights);
  });

  it('forwards custom limit and offset to repository', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    controller.getInsights(user, 10, 25);

    expect(insightRepository.getByUser).toHaveBeenCalledWith('user-1', 10, 25);
  });
});
