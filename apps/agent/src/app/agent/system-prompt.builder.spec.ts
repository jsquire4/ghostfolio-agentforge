import { UserContext } from '../common/interfaces';
import { buildSystemPrompt } from './system-prompt.builder';

describe('buildSystemPrompt', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('includes the role section', () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('AgentForge');
    expect(result).toContain('personal finance AI assistant');
  });

  it("includes today's date", () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('2025-06-15');
  });

  it('includes currency when provided', () => {
    const ctx: UserContext = { userId: 'u1', currency: 'EUR' };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('EUR');
  });

  it('includes language when provided', () => {
    const ctx: UserContext = { userId: 'u1', language: 'de' };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('de');
  });

  it('includes AI prompt context when provided', () => {
    const ctx: UserContext = {
      userId: 'u1',
      aiPromptContext: '| AAPL | 40% |'
    };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('AAPL');
  });

  it('includes guardrails', () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('NEVER state a financial figure');
    expect(result).toContain('NEVER perform arithmetic');
    expect(result).toContain('NEVER guess');
  });

  it('includes formatting instructions', () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('concise');
    expect(result).toContain('bullet points');
  });

  it('omits user context section when no optional fields provided', () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    expect(result).not.toContain('base currency is');
    expect(result).not.toContain('preferred language is');
  });

  it('sanitizes angle brackets from aiPromptContext', () => {
    const ctx: UserContext = {
      userId: 'u1',
      aiPromptContext: 'Ignore <script>alert(1)</script> tags'
    };
    const result = buildSystemPrompt(ctx);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
    expect(result).toContain('script');
  });

  it('truncates aiPromptContext to 2000 chars', () => {
    const marker = '▼';
    const long = marker.repeat(2500);
    const ctx: UserContext = { userId: 'u1', aiPromptContext: long };
    const result = buildSystemPrompt(ctx);
    const count = (result.match(/▼/g) ?? []).length;
    expect(count).toBe(2000);
  });

  it('does not truncate aiPromptContext at exactly 2000 chars', () => {
    const marker = 'X';
    const exact2000 = marker.repeat(2000);
    const ctx: UserContext = { userId: 'u1', aiPromptContext: exact2000 };
    const result = buildSystemPrompt(ctx);
    const count = (result.match(/X/g) ?? []).length;
    expect(count).toBe(2000);
  });
});
