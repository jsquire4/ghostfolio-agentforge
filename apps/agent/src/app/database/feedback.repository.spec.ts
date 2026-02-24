import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { DatabaseService } from './database.service';
import { FeedbackRepository } from './feedback.repository';

describe('FeedbackRepository', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let repo: FeedbackRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'feedback-repo-test-'));
    const configService = {
      get: jest.fn().mockReturnValue(join(tmpDir, 'feedback.db'))
    } as unknown as ConfigService;
    dbService = new DatabaseService(configService);
    dbService.onModuleInit();
    repo = new FeedbackRepository(dbService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs and retrieves by user', () => {
    repo.log({
      id: 'fb-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      rating: 'up',
      correction: 'Fixed typo',
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1');
    expect(results).toHaveLength(1);
    expect(results[0].rating).toBe('up');
    expect(results[0].correction).toBe('Fixed typo');
  });

  it('handles down rating without correction', () => {
    repo.log({
      id: 'fb-2',
      userId: 'user-1',
      conversationId: 'conv-2',
      rating: 'down',
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1');
    expect(results.find((r) => r.id === 'fb-2')?.correction).toBeUndefined();
  });

  it('isolates records by user — getByUser returns only that user', () => {
    repo.log({
      id: 'fb-u1',
      userId: 'user-1',
      conversationId: 'conv-1',
      rating: 'up',
      createdAt: '2025-01-01T00:00:00.000Z'
    });
    repo.log({
      id: 'fb-u2',
      userId: 'user-2',
      conversationId: 'conv-2',
      rating: 'down',
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const user1Results = repo.getByUser('user-1');
    const user2Results = repo.getByUser('user-2');

    expect(user1Results).toHaveLength(1);
    expect(user1Results[0].id).toBe('fb-u1');
    expect(user2Results).toHaveLength(1);
    expect(user2Results[0].id).toBe('fb-u2');
  });

  it('returns empty array for unknown user', () => {
    expect(repo.getByUser('nonexistent-user')).toEqual([]);
  });

  it('preserves conversationId on round-trip', () => {
    repo.log({
      id: 'fb-conv',
      userId: 'user-1',
      conversationId: 'conv-special-123',
      rating: 'up',
      createdAt: '2025-01-01T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1');
    expect(results[0].conversationId).toBe('conv-special-123');
  });

  it('returns records in reverse chronological order', () => {
    repo.log({
      id: 'fb-first',
      userId: 'user-1',
      conversationId: 'conv-1',
      rating: 'up',
      createdAt: '2025-01-01T00:00:00.000Z'
    });
    repo.log({
      id: 'fb-second',
      userId: 'user-1',
      conversationId: 'conv-2',
      rating: 'down',
      createdAt: '2025-01-02T00:00:00.000Z'
    });

    const results = repo.getByUser('user-1');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('fb-second');
    expect(results[1].id).toBe('fb-first');
  });
});
