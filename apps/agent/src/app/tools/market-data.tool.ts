import { z } from 'zod';

import {
  ToolDefinition,
  ToolResult,
  UserToolContext
} from '../common/interfaces';

const RANGE_TO_DAYS: Record<string, number> = {
  '1d': 1,
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  '5y': 1825,
  max: 3650
};

interface LookupItem {
  symbol: string;
  name: string;
  currency: string;
  dataSource: string;
  assetClass?: string;
  assetSubClass?: string;
}

interface LookupResponse {
  items: LookupItem[];
}

interface HistoricalDataItem {
  date: string;
  marketPrice?: number;
  value?: number;
}

interface SymbolResponse {
  dataSource: string;
  symbol: string;
  currency: string;
  marketPrice: number;
  historicalData: HistoricalDataItem[];
}

interface SymbolResult {
  symbol: string;
  name?: string;
  currency: string;
  marketPrice: number;
  dataSource: string;
  historicalData?: HistoricalDataItem[];
}

export const marketDataTool: ToolDefinition = {
  name: 'market_data',
  description:
    'Fetches current market price and optional historical performance for one or more ticker symbols via Ghostfolio. ' +
    'Use when the user asks about stock prices, quotes, how a symbol is performing, or market data for specific tickers. ' +
    'For portfolio-level summaries or "how am I doing" questions, use portfolio_summary instead.',
  category: 'read',
  consequenceLevel: 'low',
  requiresConfirmation: false,
  timeout: 30000,
  tags: ['market', 'quotes', 'price'],
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .describe('One or more ticker symbols, e.g. ["NVDA", "META"]'),
    range: z
      .enum(['1d', '1w', '1m', '3m', '6m', '1y', '5y', 'max'])
      .optional()
      .describe(
        'Time range for historical performance data. Omit for current price only.'
      )
  }),
  execute: async (
    params: unknown,
    context: UserToolContext
  ): Promise<ToolResult> => {
    const { symbols, range } = params as {
      symbols: string[];
      range?: string;
    };

    if (context.abortSignal?.aborted) {
      return {
        tool: 'market_data',
        fetchedAt: new Date().toISOString(),
        error: 'Request was cancelled'
      };
    }

    try {
      const results: SymbolResult[] = [];

      for (const ticker of symbols) {
        if (context.abortSignal?.aborted) {
          return {
            tool: 'market_data',
            fetchedAt: new Date().toISOString(),
            error: 'Request was cancelled'
          };
        }

        // Resolve ticker to dataSource via lookup
        const lookup = await context.client.get<LookupResponse>(
          `/api/v1/symbol/lookup?query=${encodeURIComponent(ticker)}`,
          context.auth
        );

        if (!lookup.items || lookup.items.length === 0) {
          results.push({
            symbol: ticker,
            currency: 'N/A',
            marketPrice: 0,
            dataSource: 'UNKNOWN',
            name: `Symbol not found: ${ticker}`
          });
          continue;
        }

        const match = lookup.items[0];
        const days = range ? (RANGE_TO_DAYS[range] ?? 0) : 0;
        const histParam = days > 0 ? `?includeHistoricalData=${days}` : '';

        const symbolData = await context.client.get<SymbolResponse>(
          `/api/v1/symbol/${match.dataSource}/${encodeURIComponent(match.symbol)}${histParam}`,
          context.auth
        );

        const entry: SymbolResult = {
          symbol: match.symbol,
          name: match.name,
          currency: symbolData.currency,
          marketPrice: symbolData.marketPrice,
          dataSource: match.dataSource
        };

        if (
          days > 0 &&
          symbolData.historicalData &&
          symbolData.historicalData.length > 0
        ) {
          entry.historicalData = symbolData.historicalData;
        }

        results.push(entry);
      }

      return {
        tool: 'market_data',
        fetchedAt: new Date().toISOString(),
        data: { symbols: results, range: range ?? null }
      };
    } catch (err) {
      return {
        tool: 'market_data',
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
