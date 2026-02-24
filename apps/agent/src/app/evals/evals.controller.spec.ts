import { EvalsController } from './evals.controller';

describe('EvalsController', () => {
  let controller: EvalsController;

  beforeEach(() => {
    controller = new EvalsController();
  });

  it('runEvals returns stub response', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const result = controller.runEvals(user as any);
    expect(result).toEqual({ runId: 'stub', status: 'queued' });
  });

  it('getResults returns empty array', () => {
    const user = { userId: 'user-1', rawJwt: 'jwt' };
    const result = controller.getResults(user as any);
    expect(result).toEqual([]);
  });
});
