import { AuditService } from './audit.service';

describe('AuditService', () => {
  let mockRepo: { log: jest.Mock; getByUser: jest.Mock };
  let service: AuditService;

  beforeEach(() => {
    mockRepo = {
      log: jest.fn(),
      getByUser: jest.fn().mockReturnValue([])
    };
    service = new AuditService(mockRepo as any);
  });

  it('delegates log to repository', async () => {
    const entry = {
      id: 'audit-1',
      userId: 'user-1',
      action: 'chat',
      timestamp: '2025-01-01T00:00:00.000Z'
    };
    await service.log(entry);
    expect(mockRepo.log).toHaveBeenCalledWith(entry);
  });

  it('delegates getByUser to repository', async () => {
    mockRepo.getByUser.mockReturnValue([{ id: 'a1' }]);
    const result = await service.getByUser('user-1');
    expect(mockRepo.getByUser).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
  });

  it('rejects when repository.log rejects (validates await propagation)', async () => {
    mockRepo.log.mockRejectedValueOnce(new Error('DB write failed'));
    const entry = {
      id: 'audit-2',
      userId: 'user-1',
      action: 'chat',
      timestamp: '2025-01-01T00:00:00.000Z'
    };
    await expect(service.log(entry)).rejects.toThrow('DB write failed');
  });
});
