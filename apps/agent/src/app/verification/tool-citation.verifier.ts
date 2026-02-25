import {
  ToolCallRecord,
  Verifier,
  VerificationResult
} from '../common/interfaces';

/**
 * Verifies that when tools were called and the response contains factual
 * content, the response text cites at least one tool that was actually used.
 *
 * Citation format expected: "(source: tool_name)" — injected via system prompt.
 * Also accepts natural mentions of tool names for flexibility.
 *
 * Order A-0002: runs after SourceAttributionVerifier (A-0001), before ConfidenceVerifier (U-0001).
 */
export class ToolCitationVerifier implements Verifier {
  name = 'tool_citation';
  order = 'A-0002';

  async verify(
    response: string,
    toolCalls: ToolCallRecord[],
    _channel?: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<VerificationResult> {
    const successfulCalls = toolCalls.filter((tc) => tc.success);

    // No successful tool calls — nothing to cite
    if (successfulCalls.length === 0) {
      return { pass: true, warnings: [], flags: [] };
    }

    // Short or purely conversational responses don't need citations
    // (e.g. "You're welcome!" or "Is there anything else I can help with?")
    if (response.length < 80) {
      return { pass: true, warnings: [], flags: [] };
    }

    const calledToolNames = [
      ...new Set(successfulCalls.map((tc) => tc.toolName))
    ];
    const responseLower = response.toLowerCase();

    // Check for any tool name reference in the response
    // Accepts: "(source: portfolio_summary)", "portfolio_summary", "portfolio summary"
    const citedTools = calledToolNames.filter((name) => {
      const nameLower = name.toLowerCase();
      // Exact match (underscored or natural)
      if (responseLower.includes(nameLower)) return true;
      // Underscores replaced with spaces: "portfolio_summary" → "portfolio summary"
      if (responseLower.includes(nameLower.replace(/_/g, ' '))) return true;
      // Formal citation format: "(source: portfolio_summary)"
      if (responseLower.includes(`(source: ${nameLower})`)) return true;
      return false;
    });

    if (citedTools.length === 0) {
      return {
        pass: false,
        warnings: [
          `Response uses data from [${calledToolNames.join(', ')}] but cites none. ` +
            'Add "(source: tool_name)" for each tool that produced data.'
        ],
        flags: []
      };
    }

    // Partial citation — some tools cited, some not
    const uncited = calledToolNames.filter((n) => !citedTools.includes(n));
    if (uncited.length > 0) {
      return {
        pass: true,
        warnings: [
          `Tools [${uncited.join(', ')}] were called but not cited in the response.`
        ],
        flags: []
      };
    }

    return { pass: true, warnings: [], flags: [] };
  }
}
