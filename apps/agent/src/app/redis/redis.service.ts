import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  public constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  public async get<T>(key: string): Promise<T | undefined> {
    return this.cache.get<T>(key);
  }

  public async set(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.cache.set(key, value, ttl);
  }

  public async delete(key: string): Promise<void> {
    await this.cache.del(key);
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const probe = '__health__';
      await this.cache.set(probe, 1, 5);
      await this.cache.del(probe);
      return true;
    } catch (error) {
      this.logger.warn(`Redis health check failed: ${error}`);
      return false;
    }
  }

  public conversationKey(conversationId: string): string {
    return `conversation:${conversationId}`;
  }
}
