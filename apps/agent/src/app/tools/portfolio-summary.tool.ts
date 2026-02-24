import { z } from 'zod';

import {
  ToolDeps,
  ToolDefinition,
  UserToolContext
} from '../common/interfaces';

export function portfolioSummaryTool(deps: ToolDeps): ToolDefinition {
  return {
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
    ): Promise<string> => {
      try {
        const parsed = z
          .object({
            mode: z.enum(['analysis', 'portfolio']).default('analysis')
          })
          .parse(params);

        if (context.abortSignal?.aborted) {
          return JSON.stringify({
            error: 'Request was cancelled',
            tool: 'portfolio_summary',
            timestamp: new Date().toISOString()
          });
        }

        const data = await deps.client.get<{ prompt: string }>(
          `/api/v1/ai/prompt/${parsed.mode}`,
          context.auth
        );

        return JSON.stringify({
          data: { prompt: data.prompt, mode: parsed.mode },
          fetchedAt: new Date().toISOString()
        });
      } catch (err) {
        return JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          tool: 'portfolio_summary',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}
