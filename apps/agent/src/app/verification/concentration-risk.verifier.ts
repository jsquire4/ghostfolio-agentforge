import {
  ToolCallRecord,
  Verifier,
  VerificationResult
} from '../common/interfaces';

// Concentration risk: any single position > 20% of portfolio value is flagged.
// Parses allocation data from tool call results (portfolio_summary or get_holdings).
// This is a HARD FLAG — short-circuits the verification pipeline.

const CONCENTRATION_THRESHOLD = 0.2; // 20%

interface HoldingAllocation {
  symbol: string;
  allocation: number; // 0-1 range
}

function extractAllocations(toolCalls: ToolCallRecord[]): HoldingAllocation[] {
  const allocations: HoldingAllocation[] = [];

  for (const tc of toolCalls) {
    if (!tc.success) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(tc.result);
    } catch {
      continue;
    }

    const toolResult = parsed as {
      data?: {
        holdings?: {
          symbol?: string;
          allocationInPercentage?: number;
        }[];
      };
    };

    if (
      !toolResult?.data?.holdings ||
      !Array.isArray(toolResult.data.holdings)
    ) {
      continue;
    }

    for (const h of toolResult.data.holdings) {
      if (h.symbol && typeof h.allocationInPercentage === 'number') {
        allocations.push({
          symbol: h.symbol,
          allocation: h.allocationInPercentage
        });
      }
    }
  }

  return allocations;
}

export class ConcentrationRiskVerifier implements Verifier {
  name = 'concentration_risk';
  order = 'R-0001';

  async verify(
    _response: string,
    toolCalls: ToolCallRecord[],
    _channel?: string
  ): Promise<VerificationResult> {
    const warnings: string[] = [];
    const flags: string[] = [];

    const allocations = extractAllocations(toolCalls);

    // No allocation data available — nothing to verify
    if (allocations.length === 0) {
      return { pass: true, warnings: [], flags: [] };
    }

    const concentrated = allocations.filter(
      (a) => a.allocation > CONCENTRATION_THRESHOLD
    );

    for (const c of concentrated) {
      const pct = (c.allocation * 100).toFixed(1);
      flags.push(
        `Concentration risk: ${c.symbol} is ${pct}% of portfolio (threshold: ${(CONCENTRATION_THRESHOLD * 100).toFixed(0)}%)`
      );
    }

    return {
      pass: flags.length === 0,
      warnings,
      flags
    };
  }
}
