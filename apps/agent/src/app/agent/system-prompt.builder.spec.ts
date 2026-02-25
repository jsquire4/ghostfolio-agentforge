import { UserContext } from '../common/interfaces';
import { ToolDefinition } from '../common/tool.types';
import { buildSystemPrompt } from './system-prompt.builder';

const makeTool = (
  overrides: Partial<ToolDefinition> &
    Pick<ToolDefinition, 'name' | 'description' | 'category'>
): ToolDefinition =>
  ({
    schema: {},
    consequenceLevel: 'low',
    requiresConfirmation: false,
    timeout: 5000,
    execute: jest.fn(),
    ...overrides
  }) as unknown as ToolDefinition;

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
    // Default channel (web-chat) uses plain+html, no bullet points instruction
    expect(result).toContain('FORMATTING');
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

  // ── Tool routing section ────────────────────────────────

  it('omits tool section when no tools provided', () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx);
    expect(result).not.toContain('AVAILABLE TOOLS');
  });

  it('omits tool section when empty array provided', () => {
    const ctx: UserContext = { userId: 'u1' };
    const result = buildSystemPrompt(ctx, []);
    expect(result).not.toContain('AVAILABLE TOOLS');
  });

  it('lists read tools under Data retrieval', () => {
    const tools = [
      makeTool({
        name: 'get_holdings',
        description: 'Fetch current holdings',
        category: 'read'
      })
    ];
    const result = buildSystemPrompt({ userId: 'u1' }, tools);
    expect(result).toContain('AVAILABLE TOOLS');
    expect(result).toContain('Data retrieval');
    expect(result).toContain('get_holdings: Fetch current holdings');
  });

  it('lists analysis tools under Analysis', () => {
    const tools = [
      makeTool({
        name: 'portfolio_summary',
        description: 'Get portfolio summary',
        category: 'analysis'
      })
    ];
    const result = buildSystemPrompt({ userId: 'u1' }, tools);
    expect(result).toContain('Analysis');
    expect(result).toContain('portfolio_summary: Get portfolio summary');
  });

  it('lists write tools under Actions with confirmation note', () => {
    const tools = [
      makeTool({
        name: 'create_order',
        description: 'Place a buy/sell order',
        category: 'write'
      })
    ];
    const result = buildSystemPrompt({ userId: 'u1' }, tools);
    expect(result).toContain('Actions (require user confirmation)');
    expect(result).toContain('create_order: Place a buy/sell order');
  });

  it('groups multiple tools by category', () => {
    const tools = [
      makeTool({
        name: 'get_holdings',
        description: 'Fetch holdings',
        category: 'read'
      }),
      makeTool({
        name: 'portfolio_summary',
        description: 'Analyze portfolio',
        category: 'analysis'
      }),
      makeTool({
        name: 'create_order',
        description: 'Place order',
        category: 'write'
      })
    ];
    const result = buildSystemPrompt({ userId: 'u1' }, tools);
    expect(result).toContain('Data retrieval');
    expect(result).toContain('Analysis');
    expect(result).toContain('Actions (require user confirmation)');
  });

  // ── Channel-specific formatting ────────────────────────────

  it('uses HTML+plain rules for web-chat channel', () => {
    const result = buildSystemPrompt({ userId: 'u1' }, [], 'web-chat');
    expect(result).toContain('plain text for short answers');
    expect(result).toContain('HTML tables');
    expect(result).toContain('No markdown');
  });

  it('uses markdown rules for cli channel', () => {
    const result = buildSystemPrompt({ userId: 'u1' }, [], 'cli');
    expect(result).toContain('Use markdown for formatting');
    expect(result).toContain('4000 characters');
  });

  it('uses CSV-only rules for csv-export channel', () => {
    const result = buildSystemPrompt({ userId: 'u1' }, [], 'csv-export');
    expect(result).toContain('Respond only with CSV');
  });

  it('defaults to web-chat formatting when no channel', () => {
    const result = buildSystemPrompt({ userId: 'u1' });
    expect(result).toContain('plain text for short answers');
    expect(result).toContain('No markdown');
  });

  it('includes routing guidance', () => {
    const tools = [
      makeTool({
        name: 'get_holdings',
        description: 'Fetch holdings',
        category: 'read'
      })
    ];
    const result = buildSystemPrompt({ userId: 'u1' }, tools);
    expect(result).toContain('most specific tool');
    expect(result).toContain('Never call a tool just because it exists');
  });
});
