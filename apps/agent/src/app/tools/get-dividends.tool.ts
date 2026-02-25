import { z } from 'zod';

import {
  ToolDefinition,
  ToolResult,
  UserToolContext
} from '../common/interfaces';

interface DividendItem {
  date: string;
  investment: number;
}

interface GhostfolioDividendsResponse {
  dividends: DividendItem[];
}

export const getDividendsTool: ToolDefinition = {
  name: 'get_dividends',
  description:
    "Retrieves the user's dividend payment history from Ghostfolio with dates and amounts. " +
    'Use when the user asks about dividends, income, yield, or distributions from their holdings. ' +
    'Can filter by symbol and group by month or year. ' +
    'For overall portfolio performance, use portfolio_summary instead. ' +
    'For individual position details, use get_holdings instead.',
  category: 'read',
  consequenceLevel: 'low',
  requiresConfirmation: false,
  timeout: 15000,
  tags: ['income', 'dividends', 'yield'],
  schema: z.object({
    symbol: z
      .string()
      .optional()
      .describe(
        'Filter dividends to a specific ticker symbol. Omit for all dividend-paying holdings.'
      ),
    groupBy: z
      .enum(['month', 'year'])
      .optional()
      .describe(
        'Group dividend totals by month or year. Omit for individual payment entries.'
      ),
    range: z
      .enum(['1d', '1w', '1m', '3m', '6m', '1y', '5y', 'max'])
      .optional()
      .describe('Time range for dividend history. Defaults to max (all time).')
  }),
  execute: async (
    params: unknown,
    context: UserToolContext
  ): Promise<ToolResult> => {
    const { symbol, groupBy, range } = params as {
      symbol?: string;
      groupBy?: 'month' | 'year';
      range?: string;
    };

    if (context.abortSignal?.aborted) {
      return {
        tool: 'get_dividends',
        fetchedAt: new Date().toISOString(),
        error: 'Request was cancelled'
      };
    }

    try {
      const queryParams: string[] = [];

      if (symbol) {
        queryParams.push(`symbol=${encodeURIComponent(symbol)}`);
      }

      if (groupBy) {
        queryParams.push(`groupBy=${encodeURIComponent(groupBy)}`);
      }

      if (range) {
        queryParams.push(`range=${encodeURIComponent(range)}`);
      }

      const queryString =
        queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const response = await context.client.get<GhostfolioDividendsResponse>(
        `/api/v1/portfolio/dividends${queryString}`,
        context.auth
      );

      const dividends = response.dividends;
      const totalDividends = dividends.reduce(
        (sum, d) => sum + d.investment,
        0
      );

      return {
        tool: 'get_dividends',
        fetchedAt: new Date().toISOString(),
        data: {
          dividends,
          count: dividends.length,
          totalDividends,
          symbol: symbol ?? null,
          groupBy: groupBy ?? null
        }
      };
    } catch (err) {
      // Log full error for debugging; return sanitized message to LLM
      console.error(`[get_dividends] ${err}`);
      return {
        tool: 'get_dividends',
        fetchedAt: new Date().toISOString(),
        error: 'Failed to fetch data from portfolio service'
      };
    }
  }
};
