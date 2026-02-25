import { makeToolCallRecord } from '../../test-fixtures';
import { ConcentrationRiskVerifier } from './concentration-risk.verifier';

describe('ConcentrationRiskVerifier', () => {
  let verifier: ConcentrationRiskVerifier;

  beforeEach(() => {
    verifier = new ConcentrationRiskVerifier();
  });

  it('passes when no holding exceeds 20% allocation', async () => {
    const result = await verifier.verify(
      'Your portfolio is well diversified.',
      [
        makeToolCallRecord({
          toolName: 'portfolio_summary',
          result: JSON.stringify({
            tool: 'portfolio_summary',
            fetchedAt: '2025-01-01T00:00:00.000Z',
            data: {
              holdings: [
                { symbol: 'AAPL', allocationInPercentage: 0.15 },
                { symbol: 'GOOGL', allocationInPercentage: 0.1 },
                { symbol: 'VTI', allocationInPercentage: 0.18 },
                { symbol: 'BND', allocationInPercentage: 0.12 }
              ]
            }
          })
        })
      ]
    );

    expect(result.pass).toBe(true);
    expect(result.flags).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('flags when a single holding exceeds 20% allocation', async () => {
    const result = await verifier.verify('AAPL is your largest position.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: '2025-01-01T00:00:00.000Z',
          data: {
            holdings: [
              { symbol: 'AAPL', allocationInPercentage: 0.35 },
              { symbol: 'GOOGL', allocationInPercentage: 0.1 }
            ]
          }
        })
      })
    ]);

    expect(result.pass).toBe(false);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toContain('AAPL');
    expect(result.flags[0]).toContain('35.0%');
    expect(result.flags[0]).toContain('20%');
  });

  it('flags multiple holdings that exceed threshold', async () => {
    const result = await verifier.verify('Portfolio overview.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: '2025-01-01T00:00:00.000Z',
          data: {
            holdings: [
              { symbol: 'AAPL', allocationInPercentage: 0.4 },
              { symbol: 'MSFT', allocationInPercentage: 0.25 },
              { symbol: 'VTI', allocationInPercentage: 0.1 }
            ]
          }
        })
      })
    ]);

    expect(result.pass).toBe(false);
    expect(result.flags).toHaveLength(2);
    expect(result.flags[0]).toContain('AAPL');
    expect(result.flags[1]).toContain('MSFT');
  });

  it('passes with empty tool calls (no data to verify)', async () => {
    const result = await verifier.verify('No portfolio data.', []);

    expect(result.pass).toBe(true);
    expect(result.flags).toHaveLength(0);
  });

  it('ignores failed tool calls', async () => {
    const result = await verifier.verify('Error occurred.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: '2025-01-01T00:00:00.000Z',
          data: {
            holdings: [{ symbol: 'AAPL', allocationInPercentage: 0.5 }]
          }
        }),
        success: false
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.flags).toHaveLength(0);
  });

  it('passes when holding is exactly at 20% threshold', async () => {
    const result = await verifier.verify('At the boundary.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: '2025-01-01T00:00:00.000Z',
          data: {
            holdings: [{ symbol: 'AAPL', allocationInPercentage: 0.2 }]
          }
        })
      })
    ]);

    // Exactly 20% does not exceed threshold
    expect(result.pass).toBe(true);
    expect(result.flags).toHaveLength(0);
  });

  it('ignores tool results without holdings data', async () => {
    const result = await verifier.verify('Some response.', [
      makeToolCallRecord({
        toolName: 'get_dividends',
        result: JSON.stringify({
          tool: 'get_dividends',
          fetchedAt: '2025-01-01T00:00:00.000Z',
          data: { dividends: [{ symbol: 'AAPL', amount: 2.5 }] }
        })
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.flags).toHaveLength(0);
  });
});
