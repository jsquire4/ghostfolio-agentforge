import { z } from 'zod';

import {
  ToolDefinition,
  ToolResult,
  UserToolContext
} from '../common/interfaces';

export const portfolioSummaryTool: ToolDefinition = {
  name: 'portfolio_summary',
  description:
    'Retrieves a high-level portfolio summary from Ghostfolio — total value, cash balance, net P&L, and overall performance. ' +
    'Use when the user asks about overall portfolio performance, total value, or how their portfolio is doing in aggregate. ' +
    'For individual position details, share counts, or per-security data, use get_holdings instead.',
  category: 'read',
  consequenceLevel: 'low',
  requiresConfirmation: false,
  timeout: 15000,
  schema: z.object({
    mode: z
      .enum(['analysis', 'portfolio'])
      .default('analysis')
      .describe('The type of summary to retrieve')
  }),
  execute: async (
    params: unknown,
    context: UserToolContext
  ): Promise<ToolResult> => {
    const { mode = 'analysis' } = params as {
      mode?: 'analysis' | 'portfolio';
    };

    if (context.abortSignal?.aborted) {
      return {
        tool: 'portfolio_summary',
        fetchedAt: new Date().toISOString(),
        error: 'Request was cancelled'
      };
    }

    try {
      const data = await context.client.get<{ prompt: string }>(
        `/api/v1/ai/prompt/${mode}`,
        context.auth
      );

      return {
        tool: 'portfolio_summary',
        fetchedAt: new Date().toISOString(),
        data: { prompt: data.prompt, mode }
      };
    } catch (err) {
      // Log full error for debugging; return sanitized message to LLM
      console.error(`[portfolio_summary] ${err}`);
      return {
        tool: 'portfolio_summary',
        fetchedAt: new Date().toISOString(),
        error: 'Failed to fetch data from portfolio service'
      };
    }
  }
};
