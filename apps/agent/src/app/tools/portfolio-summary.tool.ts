import { z } from 'zod';

import {
  ToolDefinition,
  ToolResult,
  UserToolContext
} from '../common/interfaces';

export const portfolioSummaryTool: ToolDefinition = {
  name: 'portfolio_summary',
  description:
    'Retrieves a pre-formatted portfolio summary or analysis prompt from Ghostfolio. ' +
    'Use mode "analysis" for a detailed AI-ready analysis prompt, or "portfolio" for a concise portfolio overview.',
  category: 'read',
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
      return {
        tool: 'portfolio_summary',
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
