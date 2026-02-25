import { InterfaceFormatVerifier } from './interface-format.verifier';

describe('InterfaceFormatVerifier', () => {
  let verifier: InterfaceFormatVerifier;

  beforeEach(() => {
    verifier = new InterfaceFormatVerifier();
  });

  it('passes clean for web-chat with plain text', async () => {
    const result = await verifier.verify(
      'Your portfolio is doing well.',
      [],
      'web-chat'
    );
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('passes clean for web-chat with HTML (supported format)', async () => {
    const result = await verifier.verify(
      '<table><tr><td>AAPL</td><td>40%</td></tr></table>',
      [],
      'web-chat'
    );
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('warns when markdown is used in csv-export channel', async () => {
    const result = await verifier.verify(
      '# Header\n- item 1\n- item 2',
      [],
      'csv-export'
    );
    // csv-export only supports csv — markdown chars should warn
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('markdown syntax')])
    );
  });

  it('flags prose in csv-export channel (hard failure)', async () => {
    const result = await verifier.verify(
      'Here is your portfolio summary with detailed analysis.',
      [],
      'csv-export'
    );
    expect(result.pass).toBe(false);
    expect(result.flags).toEqual(
      expect.arrayContaining([expect.stringContaining('CSV-only')])
    );
  });

  it('passes for csv-export when response is valid CSV', async () => {
    const result = await verifier.verify(
      'Symbol,Weight,Value\nAAPL,40%,$10000\nGOOG,30%,$7500',
      [],
      'csv-export'
    );
    expect(result.pass).toBe(true);
    expect(result.flags).toEqual([]);
  });

  it('warns when response exceeds channel max length', async () => {
    const longResponse = 'A'.repeat(5000);
    const result = await verifier.verify(longResponse, [], 'cli');
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('exceeds channel limit')])
    );
  });

  it('passes when response is within channel max length', async () => {
    const result = await verifier.verify('Short response.', [], 'cli');
    expect(result.warnings).toEqual([]);
  });

  it('defaults to web-chat when channel is undefined', async () => {
    const result = await verifier.verify('Plain text response.', [], undefined);
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
