// Cost per 1M tokens (USD) — update when providers change pricing
const COST_RATES: Record<string, { inputPer1M: number; outputPer1M: number }> =
  {
    'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
    'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
    'claude-sonnet-4-5-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
    'claude-haiku-4-5-20251001': { inputPer1M: 0.8, outputPer1M: 4.0 }
  };

const DEFAULT_RATE = { inputPer1M: 1.0, outputPer1M: 3.0 };

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const rate = COST_RATES[model] ?? DEFAULT_RATE;
  return (
    (tokensIn / 1_000_000) * rate.inputPer1M +
    (tokensOut / 1_000_000) * rate.outputPer1M
  );
}
