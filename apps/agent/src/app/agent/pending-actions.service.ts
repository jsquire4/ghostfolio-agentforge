import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { PendingAction } from '../common/interfaces';

@Injectable()
export class PendingActionsService {
  private readonly KEY_PREFIX = 'hitl:pending:';
  private readonly DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async store(action: PendingAction, threadId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}${action.id}`;
    const data = {
      action: JSON.stringify(action),
      threadId
    };
    const expiresAt = new Date(action.expiresAt).getTime();
    const ttlSeconds = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
    const ttl = Number.isFinite(ttlSeconds)
      ? ttlSeconds
      : this.DEFAULT_TTL_SECONDS;

    const pipeline = this.redis.pipeline();
    pipeline.hset(key, data);
    pipeline.expire(key, ttl);
    await pipeline.exec();
  }

  async get(
    actionId: string
  ): Promise<{ action: PendingAction; threadId: string } | undefined> {
    const key = `${this.KEY_PREFIX}${actionId}`;
    const data = await this.redis.hgetall(key);

    if (!data?.action) {
      return undefined;
    }

    return {
      action: JSON.parse(data.action) as PendingAction,
      threadId: data.threadId
    };
  }

  async updateStatus(
    actionId: string,
    status: PendingAction['status']
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}${actionId}`;
    const data = await this.redis.hget(key, 'action');
    if (!data) return;

    const action = JSON.parse(data) as PendingAction;
    action.status = status;

    const pipeline = this.redis.pipeline();
    pipeline.hset(key, 'action', JSON.stringify(action));
    pipeline.expire(key, this.DEFAULT_TTL_SECONDS);
    await pipeline.exec();
  }
}
