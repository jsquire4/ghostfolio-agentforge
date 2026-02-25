import { makeToolCallRecord } from '../../test-fixtures';
import { ToolCallRecord } from '../common/interfaces';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    service = new VerificationService();
  });

  it('runs all verifiers and aggregates warnings', async () => {
    const response = 'Your portfolio gained $5,000 this quarter.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-1');

    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('no tool calls')])
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Low confidence')])
    );
  });

  it('runs all verifiers when only warnings are emitted (no short-circuit)', async () => {
    const response = 'Your portfolio is worth $50,000 this year.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-2');

    const sourceWarning = result.warnings.find((w) =>
      w.includes('no tool calls')
    );
    expect(sourceWarning).toBeDefined();

    const confidenceWarning = result.warnings.find((w) =>
      w.includes('Low confidence')
    );
    expect(confidenceWarning).toBeDefined();
  });

  it('short-circuits pipeline when flags are emitted', async () => {
    const flaggingVerifier = {
      name: 'early_flagger',
      order: 'A-0000',
      verify: jest.fn().mockResolvedValue({
        pass: false,
        warnings: ['early-warn'],
        flags: ['critical-flag']
      })
    };
    const laterVerifier = {
      name: 'later_verifier',
      order: 'Z-0001',
      verify: jest.fn().mockResolvedValue({
        pass: true,
        warnings: ['later-warn'],
        flags: []
      })
    };
    const serviceWithShortCircuit = new VerificationService([
      flaggingVerifier,
      laterVerifier
    ]);

    const result = await serviceWithShortCircuit.runAll(
      'Response',
      [],
      'user-sc'
    );

    expect(result.flags).toEqual(['critical-flag']);
    expect(result.warnings).toEqual(['early-warn']);
    expect(laterVerifier.verify).not.toHaveBeenCalled();
  });

  it('returns insightData when warnings are generated', async () => {
    const response = 'Your return was $1,200 this month.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-3');

    expect(result.insightData).toBeDefined();
    expect(result.insightData!.category).toBe('verification');
    expect(result.insightData!.summary).toContain('no tool calls');
    expect(result.insightData!.summary).toContain('Low confidence');
  });

  it('does not return insightData when pipeline passes clean', async () => {
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
    expect(result.insightData).toBeUndefined();
  });

  it('warning order follows verifier order', async () => {
    const response = 'Your portfolio gained $9,999 this year.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-5');

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
      order: 'A-0000',
      verify: async () => {
        throw new Error('Verifier failed');
      }
    };
    const passingVerifier = {
      name: 'passing_verifier',
      order: 'Z-0001',
      verify: async () => ({ pass: true, warnings: [], flags: [] })
    };
    const serviceWithThrowing = new VerificationService([
      throwingVerifier,
      passingVerifier
    ]);

    const result = await serviceWithThrowing.runAll('Response', [], 'user-6');

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('throws when verifiers have duplicate names', () => {
    const dup = {
      name: 'dup',
      order: 'A-0010',
      verify: async () => ({ pass: true, warnings: [], flags: [] })
    };
    expect(
      () => new VerificationService([dup, { ...dup, order: 'A-0020' }])
    ).toThrow('Duplicate verifier name: "dup"');
  });

  it('handles verifier that throws non-Error', async () => {
    const stringThrowingVerifier = {
      name: 'string_thrower',
      order: 'A-0000',
      verify: async () => {
        throw 'string error' as any;
      }
    };
    const serviceWithStringThrow = new VerificationService([
      stringThrowingVerifier
    ]);

    const result = await serviceWithStringThrow.runAll(
      'Response',
      [],
      'user-8'
    );

    expect(result.warnings).toEqual([]);
  });

  it('does not propagate pass value — only warnings and flags matter', async () => {
    const failingVerifier = {
      name: 'failing_but_quiet',
      order: 'A-0000',
      verify: async () => ({ pass: false, warnings: [], flags: [] })
    };
    const serviceWithFailing = new VerificationService([failingVerifier]);

    const result = await serviceWithFailing.runAll(
      'Some response',
      [],
      'user-10'
    );

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
    expect(result.insightData).toBeUndefined();
  });

  it('aggregates flags from verifiers', async () => {
    const flaggingVerifier = {
      name: 'flagging_verifier',
      order: 'A-0000',
      verify: async () => ({
        pass: true,
        warnings: ['warn1'],
        flags: ['flag1', 'flag2']
      })
    };
    const serviceWithFlags = new VerificationService([flaggingVerifier]);

    const result = await serviceWithFlags.runAll('Response', [], 'user-11');

    expect(result.flags).toEqual(['flag1', 'flag2']);
    expect(result.warnings).toEqual(['warn1']);
    expect(result.insightData).toBeDefined();
  });

  it('includes verifierCount in insightData', async () => {
    const response = 'Your portfolio gained $1,000 this month.';
    const toolCalls: ToolCallRecord[] = [];

    const result = await service.runAll(response, toolCalls, 'user-12');

    expect(result.insightData).toBeDefined();
    expect(result.insightData!.data.verifierCount).toBeGreaterThan(0);
  });

  it('uses "UnknownVerifier" fallback when verifier.name is undefined', async () => {
    const namelessVerifier = {
      name: undefined as unknown as string,
      order: 'A-0000',
      verify: async () => {
        throw new Error('Verifier failed');
      }
    };
    const serviceWithNameless = new VerificationService([namelessVerifier]);

    const result = await serviceWithNameless.runAll('Response', [], 'user-13');

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('returns insightData when only flags are present', async () => {
    const flagOnlyVerifier = {
      name: 'flag_only',
      order: 'A-0000',
      verify: async () => ({
        pass: true,
        warnings: [],
        flags: ['concentration_risk']
      })
    };
    const serviceWithFlagOnly = new VerificationService([flagOnlyVerifier]);

    const result = await serviceWithFlagOnly.runAll('Response', [], 'user-14');

    expect(result.warnings).toEqual([]);
    expect(result.flags).toEqual(['concentration_risk']);
    expect(result.insightData).toBeDefined();
  });
});
