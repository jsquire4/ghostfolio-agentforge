import {
  ToolCallRecord,
  Verifier,
  VerificationResult
} from '../common/interfaces';

export class SourceAttributionVerifier implements Verifier {
  name = 'source_attribution';
  order = 10;

  async verify(
    response: string,
    toolCalls: ToolCallRecord[]
  ): Promise<VerificationResult> {
    const dollarPattern = /\$[\d,]+\.?\d*/g;
    const percentPattern = /\d+\.?\d*%/g;

    const dollarClaims = response.match(dollarPattern) ?? [];
    const percentClaims = response.match(percentPattern) ?? [];
    const allClaims = [...dollarClaims, ...percentClaims];

    // No financial claims — nothing to verify
    if (allClaims.length === 0) {
      return { pass: true, warnings: [], flags: [] };
    }

    // Financial claims exist but no tool calls to back them up
    if (toolCalls.length === 0) {
      return {
        pass: false,
        warnings: [
          'Response contains financial claims with no tool calls to verify against'
        ],
        flags: []
      };
    }

    // Combine all tool results into a single searchable string
    const combinedResults = toolCalls
      .filter((tc) => tc.success)
      .map((tc) => tc.result)
      .join(' ');

    // Check each claim against combined results
    const unsourced = allClaims.filter((claim) => {
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Negative lookahead prevents $10,000 matching inside $10,000,000
      return !new RegExp(`${escaped}(?![\\d,])`).test(combinedResults);
    });

    if (unsourced.length > 0) {
      return {
        pass: false,
        warnings: [`Found unsourced financial claims: ${unsourced.join(', ')}`],
        flags: []
      };
    }

    return { pass: true, warnings: [], flags: [] };
  }
}
