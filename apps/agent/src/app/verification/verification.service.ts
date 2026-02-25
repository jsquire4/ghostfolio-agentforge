import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { ToolCallRecord } from '../common/interfaces';
import type { Verifier } from '../common/interfaces';
import { ALL_VERIFIERS } from './index';

export const VERIFIERS_OVERRIDE = 'VERIFIERS_OVERRIDE';

export interface VerificationPipelineResult {
  warnings: string[];
  flags: string[];
  insightData?: {
    category: string;
    summary: string;
    data: Record<string, unknown>;
  };
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly verifiers: Verifier[];

  constructor(
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
    _userId: string,
    channel?: string
  ): Promise<VerificationPipelineResult> {
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

    const result: VerificationPipelineResult = {
      warnings: allWarnings,
      flags: allFlags
    };

    // Return insight data for the caller to persist (if significant findings)
    if (allWarnings.length > 0 || allFlags.length > 0) {
      result.insightData = {
        category: 'verification',
        summary: allWarnings.concat(allFlags).join('; '),
        data: {
          warnings: allWarnings,
          flags: allFlags,
          verifierCount: this.verifiers.length
        }
      };
    }

    return result;
  }
}
