import { makeToolCallRecord } from '../../test-fixtures';
import { ConfidenceVerifier } from './confidence.verifier';

describe('ConfidenceVerifier', () => {
  let verifier: ConfidenceVerifier;

  beforeEach(() => {
    verifier = new ConfidenceVerifier();
  });

  it('returns high confidence with 3+ tool calls and no hedging', async () => {
    const result = await verifier.verify(
      'Your portfolio returned 12% this year.',
      [
        makeToolCallRecord({ toolName: 'get_portfolio' }),
        makeToolCallRecord({ toolName: 'get_holdings' }),
        makeToolCallRecord({ toolName: 'get_performance' })
      ]
    );

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('returns medium confidence with 1-2 tool calls and no hedging', async () => {
    const result = await verifier.verify(
      'Your portfolio returned 12% this year.',
      [makeToolCallRecord()]
    );

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('returns low confidence with 0 tool calls', async () => {
    const result = await verifier.verify(
      'Your portfolio returned 12% this year.',
      []
    );

    expect(result.pass).toBe(true);
    expect(result.warnings).toContain(
      'Low confidence response — limited tool verification and hedging language detected.'
    );
  });

  it('downgrades band by one level per hedging term', async () => {
    const result = await verifier.verify(
      'Your portfolio returned approximately 12% this year.',
      [
        makeToolCallRecord({ toolName: 'get_portfolio' }),
        makeToolCallRecord({ toolName: 'get_holdings' }),
        makeToolCallRecord({ toolName: 'get_performance' })
      ]
    );

    // 3 tool calls = high, 1 hedging term = downgrade to medium
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('downgrades from medium to low with hedging', async () => {
    const result = await verifier.verify(
      'I think your portfolio did well this year.',
      [makeToolCallRecord()]
    );

    // 1 tool call = medium, 1 hedging term = downgrade to low
    expect(result.pass).toBe(true);
    expect(result.warnings).toContain(
      'Low confidence response — limited tool verification and hedging language detected.'
    );
    expect(result.flags).toEqual([]);
  });

  it('always passes — never flags', async () => {
    const highResult = await verifier.verify('Solid data.', [
      makeToolCallRecord(),
      makeToolCallRecord(),
      makeToolCallRecord()
    ]);
    const lowResult = await verifier.verify(
      'I think maybe approximately around something.',
      []
    );

    expect(highResult.pass).toBe(true);
    expect(highResult.flags).toEqual([]);
    expect(lowResult.pass).toBe(true);
    expect(lowResult.flags).toEqual([]);
  });

  it('detects multiple hedging terms', async () => {
    const result = await verifier.verify(
      'The value is approximately $1000 and it might be higher. I believe it could grow.',
      [
        makeToolCallRecord({ toolName: 'get_portfolio' }),
        makeToolCallRecord({ toolName: 'get_holdings' }),
        makeToolCallRecord({ toolName: 'get_performance' })
      ]
    );

    // 3 tool calls = high, 3 hedging terms (approximately, might be, I believe) = downgrade 3 levels → low
    expect(result.pass).toBe(true);
    expect(result.warnings).toContain(
      'Low confidence response — limited tool verification and hedging language detected.'
    );
    expect(result.flags).toEqual([]);
  });
});
