import { makePendingAction } from '../../test-fixtures';
import { PendingActionsService } from './pending-actions.service';

describe('PendingActionsService', () => {
  let mockRedis: {
    pipeline: jest.Mock;
    hgetall: jest.Mock;
    hget: jest.Mock;
  };
  let pipelineChain: {
    hset: jest.Mock;
    expire: jest.Mock;
    exec: jest.Mock;
  };
  let service: PendingActionsService;

  beforeEach(() => {
    pipelineChain = {
      hset: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 1]
      ])
    };
    mockRedis = {
      pipeline: jest.fn().mockReturnValue(pipelineChain),
      hgetall: jest.fn(),
      hget: jest.fn()
    };
    service = new PendingActionsService(mockRedis as any);
  });

  it('stores action and retrieves it', async () => {
    const action = makePendingAction({ id: 'action-1' });
    const threadId = 'user-1:conv-1';

    await service.store(action, threadId);

    mockRedis.hgetall.mockResolvedValue({
      action: JSON.stringify(action),
      threadId
    });

    const retrieved = await service.get('action-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.action.id).toBe('action-1');
    expect(retrieved?.threadId).toBe(threadId);
  });

  it('get returns undefined when key missing', async () => {
    mockRedis.hgetall.mockResolvedValue({});
    expect(await service.get('nonexistent')).toBeUndefined();
  });

  it('get returns undefined when hgetall returns null', async () => {
    mockRedis.hgetall.mockResolvedValue(null);
    expect(await service.get('nonexistent')).toBeUndefined();
  });

  it('updateStatus updates action status', async () => {
    const action = makePendingAction({ id: 'action-1', status: 'pending' });
    mockRedis.hget.mockResolvedValue(JSON.stringify(action));

    await service.updateStatus('action-1', 'approved');

    expect(mockRedis.pipeline).toHaveBeenCalled();
  });

  it('updateStatus no-ops when no data', async () => {
    mockRedis.hget.mockResolvedValue(null);
    await service.updateStatus('action-1', 'approved');
    expect(mockRedis.pipeline).not.toHaveBeenCalled();
  });

  it('pipeline.hset receives correctly serialized action data', async () => {
    const action = makePendingAction({ id: 'action-2', toolName: 'test_tool' });
    await service.store(action, 'user-1:conv-1');

    expect(pipelineChain.hset).toHaveBeenCalledWith('hitl:pending:action-2', {
      action: JSON.stringify(action),
      threadId: 'user-1:conv-1'
    });
  });

  it('updateStatus writes the new status value into serialized action', async () => {
    const action = makePendingAction({ id: 'action-3', status: 'pending' });
    mockRedis.hget.mockResolvedValue(JSON.stringify(action));

    await service.updateStatus('action-3', 'approved');

    const hsetCall = pipelineChain.hset.mock.calls.find(
      (c: any[]) => c[0] === 'hitl:pending:action-3'
    );
    expect(hsetCall).toBeDefined();
    const serialized = JSON.parse(hsetCall![2] as string);
    expect(serialized.status).toBe('approved');
  });

  it('clamps TTL to minimum 1 second for past expiresAt', async () => {
    const action = makePendingAction({
      id: 'action-4',
      expiresAt: '2020-01-01T00:00:00.000Z' // far in the past
    });

    await service.store(action, 'user-1:conv-1');

    expect(pipelineChain.expire).toHaveBeenCalledWith(
      'hitl:pending:action-4',
      1
    );
  });

  it('throws when stored action contains malformed JSON', async () => {
    mockRedis.hgetall.mockResolvedValue({
      action: 'not-valid-json',
      threadId: 'th-1'
    });
    await expect(service.get('action-5')).rejects.toThrow();
  });

  it('uses default TTL when expiresAt is an invalid date', async () => {
    const action = makePendingAction({
      id: 'action-nan',
      expiresAt: 'not-a-date'
    });

    await service.store(action, 'user-1:conv-1');

    expect(pipelineChain.expire).toHaveBeenCalledWith(
      'hitl:pending:action-nan',
      15 * 60 // DEFAULT_TTL_SECONDS
    );
  });
});
