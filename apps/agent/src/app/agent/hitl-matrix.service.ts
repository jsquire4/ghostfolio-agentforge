import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import {
  DEFAULT_HITL_MATRIX,
  HitlMatrix,
  ToolDefinition
} from '../common/interfaces';
import { REDIS_CLIENT } from '../redis/redis.constants';

// SECURITY NOTE: HITL matrix in Redis has no integrity check (HMAC).
// If Redis is compromised, auto-approve settings can be tampered with.
// Accepted risk: Redis access should be network-isolated in production.
const REDIS_KEY_PREFIX = 'hitl:matrix:';
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

@Injectable()
export class HitlMatrixService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async getMatrix(userId: string): Promise<HitlMatrix> {
    const raw = await this.redis.get(`${REDIS_KEY_PREFIX}${userId}`);
    if (!raw) return { ...DEFAULT_HITL_MATRIX };
    try {
      return JSON.parse(raw) as HitlMatrix;
    } catch {
      return { ...DEFAULT_HITL_MATRIX };
    }
  }

  async setMatrix(userId: string, matrix: HitlMatrix): Promise<void> {
    await this.redis.set(
      `${REDIS_KEY_PREFIX}${userId}`,
      JSON.stringify(matrix),
      'EX',
      TTL_SECONDS
    );
  }

  computeAutoApproveSet(
    matrix: HitlMatrix,
    tools: ToolDefinition[]
  ): Set<string> {
    const approved = new Set<string>();
    for (const tool of tools) {
      const decision = matrix[tool.category]?.[tool.consequenceLevel];
      if (decision === 'auto-approve') {
        approved.add(tool.name);
      }
    }
    return approved;
  }
}
