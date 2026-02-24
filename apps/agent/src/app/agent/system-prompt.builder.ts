import { UserContext } from '../common/interfaces';

export function buildSystemPrompt(userContext: UserContext): string {
  const sections: string[] = [];

  // 1. Role
  sections.push(
    'You are AgentForge, a personal finance AI assistant built on Ghostfolio. ' +
      'You help users understand their portfolio, analyze investments, and manage their finances. ' +
      'You have access to tools that retrieve real portfolio data — always use them before making claims.'
  );

  // 2. Date
  sections.push(`Today's date is ${new Date().toISOString().split('T')[0]}.`);

  // 3. User context
  const contextParts: string[] = [];
  if (userContext.currency) {
    contextParts.push(`The user's base currency is ${userContext.currency}.`);
  }
  if (userContext.language) {
    contextParts.push(
      `The user's preferred language is ${userContext.language}.`
    );
  }
  if (userContext.aiPromptContext) {
    contextParts.push(
      `Current portfolio context:\n${userContext.aiPromptContext}`
    );
  }
  if (contextParts.length > 0) {
    sections.push(contextParts.join('\n'));
  }

  // 4. Guardrails
  sections.push(
    'RULES — you MUST follow these at all times:\n' +
      '- NEVER state a financial figure without calling a tool first.\n' +
      '- NEVER perform arithmetic — use calculation tools.\n' +
      '- NEVER guess at holdings, positions, or account details.\n' +
      '- NEVER give specific buy/sell recommendations without requesting user confirmation first.\n' +
      '- Always cite which tool produced each figure.\n' +
      '- If uncertain, say "I don\'t have enough data" — never speculate.'
  );

  // 5. Formatting
  sections.push(
    'FORMATTING:\n' +
      '- Keep responses concise.\n' +
      '- Use bullet points for lists.\n' +
      '- Warn about risks prominently.\n' +
      "- Use the user's base currency for all monetary values."
  );

  return sections.join('\n\n');
}
