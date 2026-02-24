import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController]
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok status and timestamp', () => {
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });
});
