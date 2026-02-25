import { makeToolCallRecord } from '../../test-fixtures';
import { ToolCallRecord } from '../common/interfaces';
import { ToolCitationVerifier } from './tool-citation.verifier';

describe('ToolCitationVerifier', () => {
  let verifier: ToolCitationVerifier;

  beforeEach(() => {
    verifier = new ToolCitationVerifier();
  });

  it('passes when no tool calls were made', async () => {
    const result = await verifier.verify(
      'Here is some general information about investing.',
      []
    );

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('passes when response is short (conversational)', async () => {
    const result = await verifier.verify('You are welcome!', [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ]);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('passes when response cites the tool with (source: tool_name) format', async () => {
    const response =
      'Your portfolio is worth $10,000 with a 40% allocation in stocks. ' +
      '(source: portfolio_summary)';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('passes when response mentions tool name naturally', async () => {
    const response =
      'Based on your portfolio_summary data, your portfolio is worth $10,000 with a 40% allocation in stocks.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('passes when tool name is mentioned with spaces instead of underscores', async () => {
    const response =
      'According to the portfolio summary data, your portfolio is worth $10,000 with stocks at 40%.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('warns when tools were called but none are cited in the response', async () => {
    const response =
      'Your portfolio is worth $10,000 with a 40% allocation in stocks. The returns have been strong this quarter.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('cites none')])
    );
  });

  it('warns about uncited tools when some are cited and some are not', async () => {
    const response =
      'Based on your portfolio_summary, your portfolio is worth $10,000. Your stock allocation is 60%.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' }),
      makeToolCallRecord({ toolName: 'get_holdings' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('get_holdings')])
    );
  });

  it('passes when all multiple tools are cited', async () => {
    const response =
      'Based on your portfolio_summary, your portfolio is worth $10,000. ' +
      'Your get_holdings data shows 60% in stocks and 40% in bonds.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' }),
      makeToolCallRecord({ toolName: 'get_holdings' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('ignores failed tool calls — only successful calls need citation', async () => {
    const response =
      'Your portfolio is worth $10,000. I was unable to retrieve your holdings data at this time.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary', success: false }),
      makeToolCallRecord({ toolName: 'get_holdings', success: false })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('only requires citation for successful calls when mixed success/fail', async () => {
    const response =
      'Based on your portfolio_summary, your portfolio is worth $10,000. Holdings data was unavailable.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary', success: true }),
      makeToolCallRecord({ toolName: 'get_holdings', success: false })
    ];

    const result = await verifier.verify(response, toolCalls);

    // portfolio_summary is cited, get_holdings failed so not required
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('deduplicates tool names when the same tool is called multiple times', async () => {
    const response =
      'Based on your portfolio_summary data, here is a detailed breakdown of your $10,000 portfolio across multiple dimensions.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' }),
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('is case-insensitive when matching tool names', async () => {
    const response =
      'Based on your PORTFOLIO_SUMMARY data, your portfolio is worth $10,000 with a 40% stock allocation.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('threshold is 80 chars — response at exactly 80 chars requires citation', async () => {
    const response = 'A'.repeat(80);
    expect(response.length).toBe(80);

    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    // At exactly 80 chars, citation IS required (< 80 is the skip threshold)
    expect(result.pass).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('cites none')])
    );
  });

  it('threshold is 80 chars — response at 79 chars skips citation check', async () => {
    const response = 'A'.repeat(79);
    expect(response.length).toBe(79);

    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({ toolName: 'portfolio_summary' })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
