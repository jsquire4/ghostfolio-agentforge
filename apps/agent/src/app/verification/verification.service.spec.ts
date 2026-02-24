import { makeToolCallRecord } from '../../test-fixtures';
import { ToolCallRecord } from '../common/interfaces';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  let service: VerificationService;
  let mockInsightRepository: {
    insert: jest.Mock;
    getByUser: jest.Mock;
    getById: jest.Mock;
  };

  beforeEach(() => {
    mockInsightRepository = {
      insert: jest.fn(),
      getByUser: jest.fn().mockReturnValue([]),
      getById: jest.fn()
    };
    service = new VerificationService(mockInsightRepository as any);
  });

  it('runs all verifiers and aggregates warnings', async () => {
    // Response with unsourced financial claims and no tool calls
    // source_attribution will warn about claims with no tool calls
    // confidence will warn about low confidence (0 tool calls = low band)
    const response = 'Your portfolio gained $5,000 this quarter.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-1');

    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    // source_attribution warning
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no tool calls')])
    );
    // confidence warning
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Low confidence')])
    );
  });

  it('does not short-circuit — all verifiers run even if one fails', async () => {
    // Response with unsourced financial claims: source_attribution fails (pass: false).
    // Confidence verifier should still run and contribute its own result.
    const response = 'Your portfolio is worth $50,000 this year.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-2');

    // source_attribution produces a warning about unsourced claims
    const sourceWarning = result.warnings.find((w) =>
      w.includes('no tool calls')
    );
    expect(sourceWarning).toBeDefined();

    // confidence verifier still runs (0 tool calls = low band => warning)
    const confidenceWarning = result.warnings.find((w) =>
      w.includes('Low confidence')
    );
    expect(confidenceWarning).toBeDefined();
  });

  it('persists insight when warnings are generated', async () => {
    const response = 'Your return was $1,200 this month.';
    const toolCalls: ToolCallRecord[] = [];

    await service.runAll(response, toolCalls, 'user-3');

    expect(mockInsightRepository.insert).toHaveBeenCalledTimes(1);

    const insertedRecord = mockInsightRepository.insert.mock.calls[0][0];
    expect(insertedRecord.category).toBe('verification');
    expect(insertedRecord.userId).toBe('user-3');
    // Summary should contain the warnings joined by '; '
    expect(insertedRecord.summary).toContain('no tool calls');
    expect(insertedRecord.summary).toContain('Low confidence');
  });

  it('does not persist insight when pipeline passes clean', async () => {
    // No financial claims in response => source_attribution passes clean
    // 3 tool calls with no hedging => confidence is high, no warning
    const response = 'Here is a general overview of your account settings.';
    const toolCalls: ToolCallRecord[] = [
      makeToolCallRecord({
        toolName: 'account_info',
        result: 'Account info loaded'
      }),
      makeToolCallRecord({
        toolName: 'settings',
        result: 'Settings retrieved'
      }),
      makeToolCallRecord({
        toolName: 'preferences',
        result: 'Preferences loaded'
      })
    ];

    const result = await service.runAll(response, toolCalls, 'user-4');

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
    expect(mockInsightRepository.insert).not.toHaveBeenCalled();
  });

  it('warning order follows verifier order', async () => {
    // source_attribution (order 10) warnings should come before
    // confidence_scoring (order 40) warnings
    const response = 'Your portfolio gained $9,999 this year.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-5');

    // Find indexes of each verifier's warning
    const sourceIndex = result.warnings.findIndex((w) =>
      w.includes('no tool calls')
    );
    const confidenceIndex = result.warnings.findIndex((w) =>
      w.includes('Low confidence')
    );

    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    expect(confidenceIndex).toBeGreaterThanOrEqual(0);
    expect(sourceIndex).toBeLessThan(confidenceIndex);
  });
});
