import { z } from 'zod';

import {
  ToolDefinition,
  ToolResult,
  UserToolContext
} from '../common/interfaces';

interface HoldingPosition {
  symbol: string;
  name: string;
  quantity: number;
  currency: string;
  marketPrice: number;
  valueInBaseCurrency?: number;
  investment: number;
  allocationInPercentage: number;
  netPerformance: number;
  netPerformancePercent: number;
  assetClass?: string;
  assetSubClass?: string;
  dateOfFirstActivity: string;
  dividend: number;
  sectors: { name: string; weight: number }[];
  countries: { code: string; name?: string; weight: number }[];
}

interface GhostfolioHoldingsResponse {
  holdings: {
    symbol: string;
    name: string;
    quantity: number;
    currency: string;
    marketPrice: number;
    valueInBaseCurrency?: number;
    investment: number;
    allocationInPercentage: number;
    netPerformance: number;
    netPerformancePercent: number;
    assetClass?: string;
    assetSubClass?: string;
    dateOfFirstActivity: string;
    dividend: number;
    sectors: { name: string; weight: number }[];
    countries: { code: string; name?: string; weight: number }[];
  }[];
}

export const getHoldingsTool: ToolDefinition = {
  name: 'get_holdings',
  description:
    'Retrieves detailed position-level holdings from Ghostfolio including quantity, cost basis, current value, ' +
    'performance, allocation, asset class, and first buy date. Use when the user asks about specific positions, ' +
    'individual holdings, what they own, or needs per-security detail. ' +
    'For a high-level portfolio overview or total performance, use portfolio_summary instead.',
  category: 'read',
  consequenceLevel: 'low',
  requiresConfirmation: false,
  timeout: 15000,
  tags: ['portfolio', 'holdings', 'positions'],
  schema: z.object({
    symbols: z
      .array(z.string())
      .optional()
      .describe(
        'Filter to specific ticker symbols. Omit to return all holdings.'
      ),
    assetClass: z
      .enum(['equity', 'bond', 'etf'])
      .optional()
      .describe('Filter by asset class. Omit to return all asset classes.')
  }),
  execute: async (
    params: unknown,
    context: UserToolContext
  ): Promise<ToolResult> => {
    const { symbols, assetClass } = params as {
      symbols?: string[];
      assetClass?: string;
    };

    if (context.abortSignal?.aborted) {
      return {
        tool: 'get_holdings',
        fetchedAt: new Date().toISOString(),
        error: 'Request was cancelled'
      };
    }

    try {
      const queryParams: string[] = [];

      if (assetClass) {
        // Map our simplified enum to Ghostfolio's AssetClass values
        const classMap: Record<string, string> = {
          equity: 'EQUITY',
          bond: 'FIXED_INCOME',
          etf: 'EQUITY' // ETFs are equity-class; filter by subclass below
        };
        queryParams.push(
          `assetClasses=${encodeURIComponent(classMap[assetClass] ?? assetClass)}`
        );
      }

      if (symbols && symbols.length === 1) {
        queryParams.push(`query=${encodeURIComponent(symbols[0])}`);
      }

      const queryString =
        queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const response = await context.client.get<GhostfolioHoldingsResponse>(
        `/api/v1/portfolio/holdings${queryString}`,
        context.auth
      );

      let holdings: HoldingPosition[] = response.holdings.map((h) => ({
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        currency: h.currency,
        marketPrice: h.marketPrice,
        valueInBaseCurrency: h.valueInBaseCurrency,
        investment: h.investment,
        allocationInPercentage: h.allocationInPercentage,
        netPerformance: h.netPerformance,
        netPerformancePercent: h.netPerformancePercent,
        assetClass: h.assetClass,
        assetSubClass: h.assetSubClass,
        dateOfFirstActivity: h.dateOfFirstActivity,
        dividend: h.dividend,
        sectors: h.sectors,
        countries: h.countries
      }));

      // Client-side filtering for multi-symbol or ETF subclass
      if (symbols && symbols.length > 1) {
        const upper = new Set(symbols.map((s) => s.toUpperCase()));
        holdings = holdings.filter((h) => upper.has(h.symbol.toUpperCase()));
      }

      if (assetClass === 'etf') {
        holdings = holdings.filter(
          (h) => h.assetSubClass === 'ETF' || h.assetSubClass === 'MUTUALFUND'
        );
      }

      return {
        tool: 'get_holdings',
        fetchedAt: new Date().toISOString(),
        data: { holdings, count: holdings.length }
      };
    } catch (err) {
      // Log full error for debugging; return sanitized message to LLM
      console.error(`[get_holdings] ${err}`);
      return {
        tool: 'get_holdings',
        fetchedAt: new Date().toISOString(),
        error: 'Failed to fetch data from portfolio service'
      };
    }
  }
};
