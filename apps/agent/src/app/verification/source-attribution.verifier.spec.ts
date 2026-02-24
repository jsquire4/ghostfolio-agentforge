import { makeToolCallRecord } from '../../test-fixtures';
import { ToolCallRecord } from '../common/interfaces';
import { SourceAttributionVerifier } from './source-attribution.verifier';

describe('SourceAttributionVerifier', () => {
  let verifier: SourceAttributionVerifier;

  beforeEach(() => {
    verifier = new SourceAttributionVerifier();
  });

  it('passes when all numbers in response appear in tool results', async () => {
    const response =
      'Your portfolio is worth $10,000 with a 40% allocation in stocks.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-portfolio',
        result: 'Total value: $10,000. Stock allocation: 40%.'
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('fails and warns when numbers exist with no tool calls', async () => {
    const response = 'You had a $5,000 gain this quarter.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no tool calls')])
    );
    expect(result.flags).toEqual([]);
  });

  it('passes with zero financial claims', async () => {
    const response = 'Here is a general overview of your account settings.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
  });

  it('warns when dollar amount not found in any tool result', async () => {
    const response = 'Your balance is $99,999.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-portfolio',
        result: 'Total value: $10,000.'
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('unsourced')])
    );
  });

  it('warns when percentage not found in any tool result', async () => {
    const response = 'Your return rate is 45.5% this year.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-performance',
        result: 'Annual return: 12.3%.'
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(false);
  });

  it('passes when numbers are found across multiple tool results', async () => {
    const response =
      'Your portfolio is worth $25,000 with a 60% equity allocation.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-portfolio',
        result: 'Total value: $25,000.'
      }),
      makeToolCallRecord({
        toolName: 'get-allocation',
        result: 'Equity: 60%.'
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('excludes failed tool calls from combined results', async () => {
    const response = 'Your portfolio is worth $10,000.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-portfolio',
        result: 'Total value: $10,000.',
        success: false
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    // Tool call exists but success: false → excluded → claims are unsourced
    expect(result.pass).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('unsourced')])
    );
  });

  it('does not match $10,000 inside $10,000,000 (negative lookahead)', async () => {
    const response = 'Your portfolio is worth $10,000.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-portfolio',
        result: 'Total value: $10,000,000.'
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    // $10,000 should NOT match inside $10,000,000
    expect(result.pass).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('unsourced')])
    );
  });

  it('passes when only percentage claims exist and are sourced', async () => {
    const response = 'Your return was 12.5% this year.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-performance',
        result: 'Annual return: 12.5%.'
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('matches comma-less dollar amounts like $5000', async () => {
    const response = 'You gained $5000 this quarter.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'get-portfolio',
        result: 'Quarterly gain: $5000.'
      })
    ];

    const result = await verifier.verify(response, toolCalls);

    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
