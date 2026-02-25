import { makeToolCallRecord } from '../../test-fixtures';
import { StaleDataVerifier } from './stale-data.verifier';

describe('StaleDataVerifier', () => {
  let verifier: StaleDataVerifier;

  beforeEach(() => {
    verifier = new StaleDataVerifier();
  });

  it('passes with no warnings when data is fresh', async () => {
    const freshTimestamp = new Date().toISOString();
    const result = await verifier.verify('Your portfolio looks good.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: freshTimestamp,
          data: { holdings: [] }
        })
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.flags).toHaveLength(0);
  });

  it('warns when data is older than 24 hours', async () => {
    const staleTimestamp = new Date(
      Date.now() - 25 * 60 * 60 * 1000
    ).toISOString();
    const result = await verifier.verify('Here is your portfolio.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: staleTimestamp,
          data: {}
        })
      })
    ]);

    expect(result.pass).toBe(true); // warnings only, not a hard fail
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('portfolio_summary');
    expect(result.warnings[0]).toContain('25h');
    expect(result.flags).toHaveLength(0);
  });

  it('warns for each stale tool independently', async () => {
    const staleTimestamp = new Date(
      Date.now() - 48 * 60 * 60 * 1000
    ).toISOString();
    const result = await verifier.verify('Combined data view.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: staleTimestamp,
          data: {}
        })
      }),
      makeToolCallRecord({
        toolName: 'get_dividends',
        result: JSON.stringify({
          tool: 'get_dividends',
          fetchedAt: staleTimestamp,
          data: {}
        })
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('portfolio_summary');
    expect(result.warnings[1]).toContain('get_dividends');
  });

  it('passes with empty tool calls (no data to verify)', async () => {
    const result = await verifier.verify('No tool calls.', []);

    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('ignores failed tool calls', async () => {
    const staleTimestamp = new Date(
      Date.now() - 48 * 60 * 60 * 1000
    ).toISOString();
    const result = await verifier.verify('Error occurred.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: staleTimestamp,
          data: {}
        }),
        success: false
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('ignores tool results without fetchedAt', async () => {
    const result = await verifier.verify('Some response.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          data: { holdings: [] }
        })
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('passes when data is exactly 24 hours old (at boundary)', async () => {
    // Exactly 24h — not stale (threshold is >24h)
    const boundaryTimestamp = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    const result = await verifier.verify('At the boundary.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: boundaryTimestamp,
          data: {}
        })
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('formats multi-day staleness as days', async () => {
    const veryStaleTimestamp = new Date(
      Date.now() - 72 * 60 * 60 * 1000
    ).toISOString();
    const result = await verifier.verify('Very old data.', [
      makeToolCallRecord({
        toolName: 'portfolio_summary',
        result: JSON.stringify({
          tool: 'portfolio_summary',
          fetchedAt: veryStaleTimestamp,
          data: {}
        })
      })
    ]);

    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('3d');
  });
});
