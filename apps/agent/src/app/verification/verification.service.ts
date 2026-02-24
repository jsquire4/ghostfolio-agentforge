import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { ToolCallRecord } from '../common/interfaces';
import type { Verifier } from '../common/interfaces';
import { InsightRepository } from '../database/insight.repository';
import { getVerifierManifest } from './verifier-manifest';

@Injectable()
export class VerificationService {
  private readonly verifiers: Verifier[];

  constructor(private readonly insightRepository: InsightRepository) {
    this.verifiers = getVerifierManifest().sort((a, b) => a.order - b.order);
  }

  async runAll(
    response: string,
    toolCalls: ToolCallRecord[],
    userId: string
  ): Promise<{ warnings: string[]; flags: string[] }> {
    const allWarnings: string[] = [];
    const allFlags: string[] = [];

    // Pipeline does NOT short-circuit — all verifiers run regardless of previous pass/fail
    for (const verifier of this.verifiers) {
      const result = await verifier.verify(response, toolCalls);
      allWarnings.push(...result.warnings);
      allFlags.push(...result.flags);
    }

    // Persist significant findings as InsightRecords
    if (allWarnings.length > 0 || allFlags.length > 0) {
      this.insightRepository.insert({
        id: randomUUID(),
        userId,
        category: 'verification',
        summary: allWarnings.concat(allFlags).join('; '),
        data: {
          warnings: allWarnings,
          flags: allFlags,
          verifierCount: this.verifiers.length
        },
        createdAt: new Date().toISOString()
      });
    }

    return { warnings: allWarnings, flags: allFlags };
  }
}
