import { estimateCostUsd } from './llm-cost-rates';

describe('estimateCostUsd', () => {
  it('calculates cost for gpt-4o-mini', () => {
    // 1000 input tokens, 500 output tokens
    // gpt-4o-mini: $0.15/1M in, $0.60/1M out
    const cost = estimateCostUsd('gpt-4o-mini', 1000, 500);
    const expected = (1000 / 1_000_000) * 0.15 + (500 / 1_000_000) * 0.6;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('calculates cost for gpt-4o', () => {
    const cost = estimateCostUsd('gpt-4o', 10000, 5000);
    const expected = (10000 / 1_000_000) * 2.5 + (5000 / 1_000_000) * 10.0;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('uses default rate for unknown model', () => {
    const cost = estimateCostUsd('unknown-model', 1000, 1000);
    const expected = (1000 / 1_000_000) * 1.0 + (1000 / 1_000_000) * 3.0;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('gpt-4o-mini', 0, 0)).toBe(0);
  });
});
