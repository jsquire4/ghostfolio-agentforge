import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';

import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockCache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined)
    };

    const module = await Test.createTestingModule({
      providers: [RedisService, { provide: CACHE_MANAGER, useValue: mockCache }]
    }).compile();

    service = module.get(RedisService);
  });

  it('get returns cached value', async () => {
    mockCache.get.mockResolvedValue({ foo: 'bar' });
    const result = await service.get<{ foo: string }>('key');
    expect(result).toEqual({ foo: 'bar' });
    expect(mockCache.get).toHaveBeenCalledWith('key');
  });

  it('get returns undefined when missing', async () => {
    mockCache.get.mockResolvedValue(undefined);
    expect(await service.get('missing')).toBeUndefined();
  });

  it('set stores value with optional ttl', async () => {
    await service.set('key', { data: 1 });
    expect(mockCache.set).toHaveBeenCalledWith('key', { data: 1 }, undefined);

    await service.set('key2', 'val', 60);
    expect(mockCache.set).toHaveBeenCalledWith('key2', 'val', 60);
  });

  it('delete removes key', async () => {
    await service.delete('key');
    expect(mockCache.del).toHaveBeenCalledWith('key');
  });

  it('isHealthy returns true when probe succeeds', async () => {
    expect(await service.isHealthy()).toBe(true);
    expect(mockCache.set).toHaveBeenCalledWith('__health__', 1, 5);
    expect(mockCache.del).toHaveBeenCalledWith('__health__');
  });

  it('isHealthy returns false when set fails', async () => {
    mockCache.set.mockRejectedValueOnce(new Error('Connection refused'));
    expect(await service.isHealthy()).toBe(false);
  });

  it('isHealthy returns false when del fails', async () => {
    mockCache.del.mockRejectedValueOnce(new Error('Del failed'));
    expect(await service.isHealthy()).toBe(false);
  });

  it('conversationKey returns prefixed key', () => {
    expect(service.conversationKey('conv-123')).toBe('conversation:conv-123');
  });

  it('get propagates connection failure', async () => {
    mockCache.get.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(service.get('key')).rejects.toThrow('Connection refused');
  });

  it('set propagates connection failure', async () => {
    mockCache.set.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(service.set('key', 'val')).rejects.toThrow(
      'Connection refused'
    );
  });

  it('delete propagates connection failure', async () => {
    mockCache.del.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(service.delete('key')).rejects.toThrow('Connection refused');
  });
});
