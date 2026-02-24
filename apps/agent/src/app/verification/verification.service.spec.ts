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

  it('catches verifier throw and continues — does not crash pipeline', async () => {
    const throwingVerifier = {
      name: 'throwing_verifier',
      order: 5,
      verify: async () => {
        throw new Error('Verifier failed');
      }
    };
    const passingVerifier = {
      name: 'passing_verifier',
      order: 50,
      verify: async () => ({ pass: true, warnings: [], flags: [] })
    };
    const serviceWithThrowing = new VerificationService(
      mockInsightRepository as any,
      [throwingVerifier, passingVerifier]
    );

    const result = await serviceWithThrowing.runAll('Response', [], 'user-6');

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('throws when verifiers have duplicate names', () => {
    const dup = {
      name: 'dup',
      order: 10,
      verify: async () => ({ pass: true, warnings: [], flags: [] })
    };
    expect(
      () =>
        new VerificationService(mockInsightRepository as any, [
          dup,
          { ...dup, order: 20 }
        ])
    ).toThrow('Duplicate verifier name: "dup"');
  });

  it('catches insight insert failure and still returns result', async () => {
    mockInsightRepository.insert.mockImplementationOnce(() => {
      throw new Error('DB write failed');
    });
    const response = 'Your portfolio gained $1,000.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-7');

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(mockInsightRepository.insert).toHaveBeenCalled();
  });

  it('handles verifier that throws non-Error', async () => {
    const stringThrowingVerifier = {
      name: 'string_thrower',
      order: 5,
      verify: async () => {
        throw 'string error' as any;
      }
    };
    const serviceWithStringThrow = new VerificationService(
      mockInsightRepository as any,
      [stringThrowingVerifier]
    );

    const result = await serviceWithStringThrow.runAll(
      'Response',
      [],
      'user-8'
    );

    expect(result.warnings).toEqual([]);
  });

  it('handles insert failure with non-Error throw', async () => {
    mockInsightRepository.insert.mockImplementationOnce(() => {
      throw 'string db error' as any;
    });
    const response = 'Your portfolio gained $500.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-9');

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('does not propagate pass value — only warnings and flags matter', async () => {
    const failingVerifier = {
      name: 'failing_but_quiet',
      order: 5,
      verify: async () => ({ pass: false, warnings: [], flags: [] })
    };
    const serviceWithFailing = new VerificationService(
      mockInsightRepository as any,
      [failingVerifier]
    );

    const result = await serviceWithFailing.runAll(
      'Some response',
      [],
      'user-10'
    );

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
    expect(mockInsightRepository.insert).not.toHaveBeenCalled();
  });

  it('aggregates flags from verifiers', async () => {
    const flaggingVerifier = {
      name: 'flagging_verifier',
      order: 5,
      verify: async () => ({
        pass: true,
        warnings: ['warn1'],
        flags: ['flag1', 'flag2']
      })
    };
    const serviceWithFlags = new VerificationService(
      mockInsightRepository as any,
      [flaggingVerifier]
    );

    const result = await serviceWithFlags.runAll('Response', [], 'user-11');

    expect(result.flags).toEqual(['flag1', 'flag2']);
    expect(result.warnings).toEqual(['warn1']);
    expect(mockInsightRepository.insert).toHaveBeenCalledTimes(1);
  });

  it('includes verifierCount in persisted insight data', async () => {
    const response = 'Your portfolio gained $1,000 this month.';
    const toolCalls: ToolCallRecord[] = [];

    await service.runAll(response, toolCalls, 'user-12');

    const insertedRecord = mockInsightRepository.insert.mock.calls[0][0];
    expect(insertedRecord.data.verifierCount).toBe(2); // source_attribution + confidence_scoring
  });

  it('uses "UnknownVerifier" fallback when verifier.name is undefined', async () => {
    const namelessVerifier = {
      name: undefined as unknown as string,
      order: 5,
      verify: async () => {
        throw new Error('Verifier failed');
      }
    };
    // Bypass the duplicate-name check by providing a single verifier
    const serviceWithNameless = new VerificationService(
      mockInsightRepository as any,
      [namelessVerifier]
    );

    const result = await serviceWithNameless.runAll('Response', [], 'user-13');

    // The verifier threw, so it's skipped — no warnings propagated
    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('only persists insight when flags are present but warnings are empty', async () => {
    const flagOnlyVerifier = {
      name: 'flag_only',
      order: 5,
      verify: async () => ({
        pass: true,
        warnings: [],
        flags: ['concentration_risk']
      })
    };
    const serviceWithFlagOnly = new VerificationService(
      mockInsightRepository as any,
      [flagOnlyVerifier]
    );

    const result = await serviceWithFlagOnly.runAll('Response', [], 'user-14');

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual(['concentration_risk']);
    // flags > 0 triggers persistence even when warnings are empty
    expect(mockInsightRepository.insert).toHaveBeenCalledTimes(1);
  });
});
