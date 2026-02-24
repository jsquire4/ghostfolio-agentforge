import { UserContext } from '../common/interfaces';
import { buildSystemPrompt } from './system-prompt.builder';

describe('buildSystemPrompt', () => {
  it('includes the role section', () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    expect(result).toContain('AgentForge');
    expect(result).toContain('personal finance AI assistant');
  });

  it("includes today's date", () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    const today = new Date().toISOString().split('T')[0];
    expect(result).toContain(today);
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
});
