import { z } from 'zod';

import {
  ToolDefinition,
  ToolResult,
  UserToolContext
} from '../common/interfaces';

interface OrderActivity {
  date: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'INTEREST' | 'LIABILITY';
  quantity: number;
  unitPrice: number;
  fee: number;
  SymbolProfile?: { symbol: string };
}

interface ActivitiesResponse {
  activities: OrderActivity[];
  count: number;
}

interface WashSaleViolation {
  sellDate: string;
  sellPrice: number;
  sellQuantity: number;
  buyDate: string;
  buyPrice: number;
  buyQuantity: number;
  daysBetween: number;
  lossPerShare: number;
}

interface WashSaleWarning {
  message: string;
  sellDate: string;
  daysUntilClear: number;
}

const WASH_SALE_WINDOW_DAYS = 30;

const REGULATORY_CONTEXT = {
  rule: 'IRS Wash Sale Rule (Internal Revenue Code Section 1091)',
  summary:
    'A wash sale occurs when you sell a security at a loss and purchase ' +
    'the same or a substantially identical security within 30 days before ' +
    'or after the sale. The loss is disallowed for tax purposes and added ' +
    'to the cost basis of the replacement shares.',
  references: [
    {
      title: 'IRS Publication 550 — Investment Income and Expenses',
      section: 'Wash Sales',
      url: 'https://www.irs.gov/publications/p550#idm140257486780256'
    },
    {
      title: 'Internal Revenue Code § 1091',
      description: 'Loss from wash sales of stock or securities',
      url: 'https://www.law.cornell.edu/uscode/text/26/1091'
    }
  ]
};

function daysBetweenDates(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.abs(
    Math.round((new Date(a).getTime() - new Date(b).getTime()) / msPerDay)
  );
}

export const checkWashSaleTool: ToolDefinition = {
  name: 'check_wash_sale',
  description:
    "Analyzes the user's transaction history to detect IRS wash sale rule violations — " +
    'repurchases of the same or substantially identical security within 30 days of selling at a loss. ' +
    'Use when the user asks about wash sales, tax implications of selling, or whether it is safe to sell a specific position. ' +
    'Returns violations, warnings, and IRS regulatory references. ' +
    'For position details, use get_holdings instead. ' +
    'For overall portfolio performance, use portfolio_summary instead.',
  category: 'analysis',
  consequenceLevel: 'low',
  requiresConfirmation: false,
  timeout: 15000,
  tags: ['compliance', 'tax', 'wash-sale'],
  schema: z.object({
    symbol: z
      .string()
      .describe('Ticker symbol to check for wash sale violations.'),
    lookbackDays: z
      .number()
      .int()
      .positive()
      .optional()
      .default(60)
      .describe(
        'How far back (in days) to scan for sell+rebuy pairs. Defaults to 60.'
      )
  }),
  execute: async (
    params: unknown,
    context: UserToolContext
  ): Promise<ToolResult> => {
    const { symbol, lookbackDays = 60 } = params as {
      symbol: string;
      lookbackDays?: number;
    };

    if (context.abortSignal?.aborted) {
      return {
        tool: 'check_wash_sale',
        fetchedAt: new Date().toISOString(),
        error: 'Request was cancelled'
      };
    }

    try {
      const response = await context.client.get<ActivitiesResponse>(
        `/api/v1/order?symbol=${encodeURIComponent(symbol)}`,
        context.auth
      );

      const activities = response.activities;

      // Filter to only BUY and SELL for this symbol
      const sells = activities
        .filter((a) => a.type === 'SELL')
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

      const buys = activities
        .filter((a) => a.type === 'BUY')
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

      // Scope to lookback window
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
      const cutoffIso = cutoffDate.toISOString();

      const recentSells = sells.filter((s) => s.date >= cutoffIso);

      const violations: WashSaleViolation[] = [];
      const warnings: WashSaleWarning[] = [];

      for (const sell of recentSells) {
        const sellAtLoss = sell.unitPrice < getAvgBuyPrice(buys, sell.date);

        if (!sellAtLoss) continue;

        // Check for buys within 30 days BEFORE or AFTER the sell
        for (const buy of buys) {
          const gap = daysBetweenDates(sell.date, buy.date);

          if (gap <= WASH_SALE_WINDOW_DAYS && buy.date !== sell.date) {
            violations.push({
              sellDate: sell.date.slice(0, 10),
              sellPrice: sell.unitPrice,
              sellQuantity: sell.quantity,
              buyDate: buy.date.slice(0, 10),
              buyPrice: buy.unitPrice,
              buyQuantity: buy.quantity,
              daysBetween: gap,
              lossPerShare: round2(
                getAvgBuyPrice(buys, sell.date) - sell.unitPrice
              )
            });
          }
        }

        // Warn if sell is recent and wash window still open
        const sellDate = new Date(sell.date);
        const now = new Date();
        const daysSinceSell = daysBetweenDates(now.toISOString(), sell.date);

        if (daysSinceSell < WASH_SALE_WINDOW_DAYS && sellAtLoss) {
          const daysUntilClear = WASH_SALE_WINDOW_DAYS - daysSinceSell;
          warnings.push({
            message:
              `Wash sale window still open for ${symbol} sold on ${sell.date.slice(0, 10)}. ` +
              `Buying ${symbol} before ${new Date(sellDate.getTime() + WASH_SALE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)} ` +
              `would trigger a wash sale.`,
            sellDate: sell.date.slice(0, 10),
            daysUntilClear
          });
        }
      }

      return {
        tool: 'check_wash_sale',
        fetchedAt: new Date().toISOString(),
        data: {
          symbol,
          lookbackDays,
          violations,
          violationCount: violations.length,
          warnings,
          warningCount: warnings.length,
          transactionsAnalyzed: {
            sells: recentSells.length,
            buys: buys.length
          },
          regulatoryContext: REGULATORY_CONTEXT
        }
      };
    } catch (err) {
      // Log full error for debugging; return sanitized message to LLM
      console.error(`[check_wash_sale] ${err}`);
      return {
        tool: 'check_wash_sale',
        fetchedAt: new Date().toISOString(),
        error: 'Failed to fetch data from portfolio service'
      };
    }
  }
};

/**
 * Compute weighted average buy price for shares purchased before a given date.
 */
function getAvgBuyPrice(buys: OrderActivity[], beforeDate: string): number {
  const prior = buys.filter((b) => b.date <= beforeDate);
  if (prior.length === 0) return 0;

  const totalCost = prior.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0);
  const totalShares = prior.reduce((sum, b) => sum + b.quantity, 0);
  return totalShares > 0 ? totalCost / totalShares : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
