import {
  ToolCallRecord,
  Verifier,
  VerificationResult
} from '../common/interfaces';

const HEDGING_PATTERNS: RegExp[] = [
  'approximately',
  'around',
  'roughly',
  'estimated',
  'i believe',
  'might be',
  'could be',
  'i think'
].map((term) => new RegExp(`\\b${term}\\b`, 'i'));

type Band = 'high' | 'medium' | 'low';

const BAND_ORDER: Band[] = ['high', 'medium', 'low'];

function downgradeBand(band: Band, levels: number): Band {
  const index = BAND_ORDER.indexOf(band);
  const newIndex = Math.min(index + levels, BAND_ORDER.length - 1);
  return BAND_ORDER[newIndex];
}

function countHedgingTerms(response: string): number {
  return HEDGING_PATTERNS.filter((pattern) => pattern.test(response)).length;
}

function baseBandFromToolCalls(toolCalls: ToolCallRecord[]): Band {
  if (toolCalls.length >= 3) return 'high';
  if (toolCalls.length >= 1) return 'medium';
  return 'low';
}

export class ConfidenceVerifier implements Verifier {
  name = 'confidence_scoring';
  order = 40;

  async verify(
    response: string,
    toolCalls: ToolCallRecord[]
  ): Promise<VerificationResult> {
    const baseBand = baseBandFromToolCalls(toolCalls);
    const hedgingCount = countHedgingTerms(response);
    const finalBand = downgradeBand(baseBand, hedgingCount);

    const warnings: string[] = [];
    if (finalBand === 'low') {
      warnings.push(
        'Low confidence response — limited tool verification and hedging language detected.'
      );
    }

    return {
      pass: true,
      warnings,
      flags: []
    };
  }
}
