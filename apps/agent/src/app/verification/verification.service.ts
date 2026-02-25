import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { ToolCallRecord } from '../common/interfaces';
import type { Verifier } from '../common/interfaces';
import { InsightRepository } from '../database/insight.repository';
import { ALL_VERIFIERS } from './index';

export const VERIFIERS_OVERRIDE = 'VERIFIERS_OVERRIDE';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly verifiers: Verifier[];

  constructor(
    private readonly insightRepository: InsightRepository,
    @Optional() @Inject(VERIFIERS_OVERRIDE) verifiersOverride?: Verifier[]
  ) {
    const source = verifiersOverride ?? ALL_VERIFIERS;
    const sorted = [...source].sort((a, b) =>
      a.order.localeCompare(b.order, 'en')
    );
    const names = new Set<string>();
    for (const v of sorted) {
      if (names.has(v.name)) {
        throw new Error(
          `Duplicate verifier name: "${v.name}" — each verifier must have a unique name`
        );
      }
      names.add(v.name);
    }
    this.verifiers = sorted;
  }

  async runAll(
    response: string,
    toolCalls: ToolCallRecord[],
    userId: string,
    channel?: string
  ): Promise<{ warnings: string[]; flags: string[] }> {
    const allWarnings: string[] = [];
    const allFlags: string[] = [];

    // Pipeline short-circuits when flags (hard failures) are emitted; warnings don't stop execution
    for (const verifier of this.verifiers) {
      try {
        const result = await verifier.verify(response, toolCalls, channel);
        allWarnings.push(...result.warnings);
        allFlags.push(...result.flags);
        if (allFlags.length > 0) break;
      } catch (error) {
        const name = verifier.name ?? 'UnknownVerifier';
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Verifier "${name}" threw — skipping: ${msg}`);
      }
    }

    // Persist significant findings as InsightRecords
    if (allWarnings.length > 0 || allFlags.length > 0) {
      try {
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
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to persist insight record: ${msg}`);
      }
    }

    return { warnings: allWarnings, flags: allFlags };
  }
}
