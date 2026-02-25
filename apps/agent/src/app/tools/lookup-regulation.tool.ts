import { z } from 'zod';

import {
  ToolDefinition,
  ToolResult,
  UserToolContext
} from '../common/interfaces';

interface RegulatoryReference {
  title: string;
  url: string;
  description?: string;
}

interface RegulationEntry {
  id: string;
  name: string;
  summary: string;
  keyPoints: string[];
  thresholds?: Record<string, string>;
  references: RegulatoryReference[];
  keywords: string[];
}

/**
 * Static regulation library. Covers the most common retail investor
 * tax rules and compliance topics. Expand this list or add a search
 * API fallback for long-tail coverage.
 *
 * TODO: Expand via (a) pre-indexing more IRS/SEC links or
 *       (b) adding a web search service to BaseToolContext for
 *       runtime lookup of uncommon regulations.
 */
const REGULATION_LIBRARY: RegulationEntry[] = [
  {
    id: 'wash-sale',
    name: 'Wash Sale Rule',
    summary:
      'Prohibits claiming a tax deduction on a security sold at a loss if a substantially ' +
      'identical security is purchased within 30 days before or after the sale.',
    keyPoints: [
      'Applies to stocks, bonds, options, and mutual funds',
      'The 30-day window runs both before and after the sale date (61-day total window)',
      'Disallowed losses are added to the cost basis of the replacement shares',
      'Applies across all accounts (taxable, IRA, spouse accounts)',
      'Substantially identical includes options on the same stock'
    ],
    thresholds: {
      window: '30 days before and after the sale',
      totalWindow: '61 days'
    },
    references: [
      {
        title: 'IRS Publication 550 — Investment Income and Expenses',
        url: 'https://www.irs.gov/publications/p550',
        description: 'Section on Wash Sales'
      },
      {
        title: 'Internal Revenue Code § 1091',
        url: 'https://www.law.cornell.edu/uscode/text/26/1091',
        description: 'Loss from wash sales of stock or securities'
      }
    ],
    keywords: [
      'wash sale',
      'wash-sale',
      '30 day',
      '30-day',
      'substantially identical',
      'repurchase',
      'loss disallowed',
      'section 1091'
    ]
  },
  {
    id: 'capital-gains',
    name: 'Capital Gains Tax',
    summary:
      'Profits from selling investments are taxed as capital gains. The rate depends on ' +
      'how long the asset was held: short-term (≤1 year) is taxed as ordinary income; ' +
      'long-term (>1 year) receives preferential rates of 0%, 15%, or 20%.',
    keyPoints: [
      'Short-term gains (held ≤1 year) taxed at ordinary income rates (10%–37%)',
      'Long-term gains (held >1 year) taxed at 0%, 15%, or 20% depending on income',
      'Net Investment Income Tax (NIIT) adds 3.8% for high earners',
      'Capital losses can offset capital gains dollar-for-dollar',
      'Up to $3,000 of net capital losses can offset ordinary income per year',
      'Excess losses carry forward to future tax years'
    ],
    thresholds: {
      shortTermHolding: '1 year or less',
      longTermHolding: 'More than 1 year',
      longTermRates: '0%, 15%, or 20%',
      lossDeductionLimit: '$3,000 per year ($1,500 married filing separately)',
      niitThreshold: '$200,000 single / $250,000 married filing jointly'
    },
    references: [
      {
        title: 'IRS Topic No. 409 — Capital Gains and Losses',
        url: 'https://www.irs.gov/taxtopics/tc409',
        description: 'Overview of capital gains tax rates and rules'
      },
      {
        title: 'IRS Publication 544 — Sales and Other Dispositions of Assets',
        url: 'https://www.irs.gov/publications/p544',
        description: 'Detailed guidance on reporting capital gains'
      },
      {
        title: 'IRS Schedule D Instructions',
        url: 'https://www.irs.gov/instructions/i1040sd',
        description: 'How to report capital gains and losses'
      }
    ],
    keywords: [
      'capital gain',
      'capital gains',
      'capital loss',
      'short term',
      'short-term',
      'long term',
      'long-term',
      'holding period',
      'tax rate',
      'niit',
      'net investment income',
      '$3,000',
      '$3000',
      'loss carryforward'
    ]
  },
  {
    id: 'qualified-dividends',
    name: 'Qualified Dividend Taxation',
    summary:
      'Qualified dividends are taxed at the lower long-term capital gains rates (0%, 15%, or 20%) ' +
      'rather than ordinary income rates. To qualify, the stock must be held for more than 60 days ' +
      'during the 121-day period surrounding the ex-dividend date.',
    keyPoints: [
      'Must hold stock for >60 days in the 121-day window around ex-dividend date',
      'Most dividends from US corporations and qualified foreign corporations qualify',
      'REIT dividends generally do NOT qualify (taxed as ordinary income)',
      'Money market fund dividends do NOT qualify',
      'Qualified dividends are reported in Box 1b of Form 1099-DIV',
      'Tax rates: 0%, 15%, or 20% (same as long-term capital gains)'
    ],
    thresholds: {
      holdingPeriod: '>60 days in the 121-day window',
      taxRates: '0%, 15%, or 20%'
    },
    references: [
      {
        title: 'IRS Topic No. 404 — Dividends',
        url: 'https://www.irs.gov/taxtopics/tc404',
        description: 'Overview of dividend taxation'
      },
      {
        title: 'IRS Publication 550 — Investment Income and Expenses',
        url: 'https://www.irs.gov/publications/p550',
        description: 'Detailed rules for qualified dividends'
      },
      {
        title: 'IRS Qualified Dividends and Capital Gain Tax Worksheet',
        url: 'https://www.irs.gov/instructions/i1040gi',
        description: 'Worksheet for computing qualified dividend tax'
      }
    ],
    keywords: [
      'qualified dividend',
      'dividend tax',
      'dividend taxation',
      'ordinary dividend',
      'ex-dividend',
      '1099-div',
      '60 day',
      '121 day',
      'reit dividend'
    ]
  },
  {
    id: 'tax-loss-harvesting',
    name: 'Tax Loss Harvesting',
    summary:
      'Strategy of selling investments at a loss to offset capital gains and reduce tax liability. ' +
      'The wash sale rule must be respected — you cannot repurchase a substantially identical ' +
      'security within 30 days.',
    keyPoints: [
      'Sell losing positions to realize capital losses',
      'Losses offset gains dollar-for-dollar (short-term offsets short-term first)',
      'Net losses up to $3,000 can offset ordinary income',
      'Must avoid wash sale rule — no repurchase within 30 days',
      'Can buy a similar (but not substantially identical) security immediately',
      'Common strategy: sell one S&P 500 ETF and buy a different one'
    ],
    thresholds: {
      maxOrdinaryIncomeOffset: '$3,000 per year',
      washSaleWindow: '30 days before/after sale'
    },
    references: [
      {
        title: 'IRS Topic No. 409 — Capital Gains and Losses',
        url: 'https://www.irs.gov/taxtopics/tc409',
        description: 'Rules for offsetting gains with losses'
      },
      {
        title: 'IRS Publication 550 — Wash Sales Section',
        url: 'https://www.irs.gov/publications/p550',
        description: 'Wash sale constraints on harvesting'
      }
    ],
    keywords: [
      'tax loss harvest',
      'tax-loss harvest',
      'harvest loss',
      'harvesting',
      'offset gain',
      'offset capital',
      'realize loss',
      'sell at a loss'
    ]
  },
  {
    id: 'cost-basis-methods',
    name: 'Cost Basis Methods',
    summary:
      'When selling shares purchased at different prices, the cost basis method determines ' +
      'which shares are sold first, affecting your capital gain or loss calculation. ' +
      'Common methods: FIFO, specific identification, and average cost.',
    keyPoints: [
      'FIFO (First In, First Out) — oldest shares sold first (default for most brokers)',
      'Specific Identification — you choose which lot to sell',
      'Average Cost — allowed only for mutual fund shares and certain dividend reinvestment plans',
      'Method must be elected before or at time of sale',
      'Specific identification can optimize tax outcomes',
      'Brokers report cost basis on Form 1099-B'
    ],
    references: [
      {
        title: 'IRS Publication 550 — Basis of Investment Property',
        url: 'https://www.irs.gov/publications/p550',
        description: 'Cost basis calculation methods'
      },
      {
        title: 'IRS Topic No. 703 — Basis of Assets',
        url: 'https://www.irs.gov/taxtopics/tc703',
        description: 'General rules for determining basis'
      }
    ],
    keywords: [
      'cost basis',
      'fifo',
      'first in first out',
      'specific identification',
      'specific id',
      'average cost',
      'tax lot',
      'lot selection',
      '1099-b'
    ]
  },
  {
    id: 'ira-contribution-limits',
    name: 'IRA Contribution Limits',
    summary:
      'Individual Retirement Accounts have annual contribution limits set by the IRS. ' +
      'For 2024, the limit is $7,000 ($8,000 if age 50+). Roth IRA eligibility phases ' +
      'out at higher income levels.',
    keyPoints: [
      '2024 limit: $7,000 ($8,000 catch-up if age 50+)',
      'Contributions must come from earned income',
      'Traditional IRA: contributions may be tax-deductible',
      'Roth IRA: contributions are after-tax; withdrawals are tax-free in retirement',
      'Roth IRA income phaseout: $146,000–$161,000 (single), $230,000–$240,000 (married)',
      'Cannot contribute more than your earned income for the year',
      'Deadline: tax filing deadline (typically April 15 of the following year)'
    ],
    thresholds: {
      annualLimit2024: '$7,000',
      catchUpLimit2024: '$8,000 (age 50+)',
      rothSinglePhaseout: '$146,000–$161,000 MAGI',
      rothMarriedPhaseout: '$230,000–$240,000 MAGI'
    },
    references: [
      {
        title: 'IRS — IRA Contribution Limits',
        url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits',
        description: 'Current year IRA contribution limits'
      },
      {
        title: 'IRS Publication 590-A — Contributions to IRAs',
        url: 'https://www.irs.gov/publications/p590a',
        description: 'Detailed IRA contribution rules'
      }
    ],
    keywords: [
      'ira',
      'individual retirement',
      'roth',
      'traditional ira',
      'contribution limit',
      'catch-up',
      'catch up',
      '$7,000',
      '$8,000',
      'retirement account'
    ]
  },
  {
    id: 'required-minimum-distributions',
    name: 'Required Minimum Distributions (RMDs)',
    summary:
      'Account holders of traditional IRAs and employer-sponsored retirement plans must begin ' +
      'taking required minimum distributions (RMDs) at age 73 (as of SECURE 2.0 Act). ' +
      'Failure to take RMDs results in a 25% excise tax on the amount not distributed.',
    keyPoints: [
      'RMDs begin at age 73 (effective 2023 under SECURE 2.0 Act)',
      "Roth IRAs do NOT require RMDs during the owner's lifetime",
      'Penalty for missing RMD: 25% excise tax (reduced to 10% if corrected timely)',
      'First RMD can be delayed until April 1 of the year after turning 73',
      'RMD amount based on account balance and IRS life expectancy tables',
      'Applies to traditional IRAs, 401(k)s, 403(b)s, and other employer plans'
    ],
    thresholds: {
      startAge: '73 (under SECURE 2.0 Act)',
      penalty: '25% excise tax (10% if corrected timely)'
    },
    references: [
      {
        title:
          'IRS — Retirement Plan and IRA Required Minimum Distributions FAQs',
        url: 'https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs',
        description: 'FAQ on RMD rules'
      },
      {
        title: 'IRS Publication 590-B — Distributions from IRAs',
        url: 'https://www.irs.gov/publications/p590b',
        description: 'Detailed RMD calculation and rules'
      }
    ],
    keywords: [
      'rmd',
      'required minimum distribution',
      'minimum distribution',
      'age 73',
      'secure act',
      'secure 2.0',
      'excise tax',
      'withdrawal requirement'
    ]
  },
  {
    id: 'net-investment-income-tax',
    name: 'Net Investment Income Tax (NIIT)',
    summary:
      'A 3.8% surtax on net investment income for taxpayers with modified adjusted gross income ' +
      'exceeding $200,000 (single) or $250,000 (married filing jointly). Applies to interest, ' +
      'dividends, capital gains, rental income, and royalties.',
    keyPoints: [
      'Rate: 3.8% on the lesser of net investment income or MAGI over the threshold',
      'Thresholds: $200,000 (single), $250,000 (married filing jointly), $125,000 (married filing separately)',
      'Investment income includes: interest, dividends, capital gains, rental, royalties',
      'Does NOT apply to: wages, self-employment income, Social Security, tax-exempt interest',
      'Reported on Form 8960',
      'Cannot be reduced by investment expenses (post-TCJA)'
    ],
    thresholds: {
      rate: '3.8%',
      singleThreshold: '$200,000 MAGI',
      marriedThreshold: '$250,000 MAGI'
    },
    references: [
      {
        title: 'IRS — Net Investment Income Tax',
        url: 'https://www.irs.gov/individuals/net-investment-income-tax',
        description: 'Overview of NIIT rules and thresholds'
      },
      {
        title: 'IRS Form 8960 Instructions',
        url: 'https://www.irs.gov/instructions/i8960',
        description: 'How to calculate and report NIIT'
      }
    ],
    keywords: [
      'niit',
      'net investment income',
      '3.8%',
      '3.8 percent',
      'surtax',
      'investment tax',
      'form 8960',
      'high income',
      'medicare surtax'
    ]
  },
  {
    id: 'alternative-minimum-tax',
    name: 'Alternative Minimum Tax (AMT)',
    summary:
      'A parallel tax system that ensures high-income taxpayers pay a minimum amount of tax. ' +
      'Certain deductions and income types are treated differently under AMT. Most common ' +
      'trigger for investors: exercising incentive stock options (ISOs).',
    keyPoints: [
      'AMT rates: 26% on first $220,700 (2024), 28% above that',
      'AMT exemption (2024): $85,700 (single), $133,300 (married filing jointly)',
      'Incentive stock options (ISOs) are a major AMT trigger for investors',
      'State and local tax deductions are added back for AMT',
      'AMT paid can generate a credit for future years (Form 8801)',
      'TCJA significantly reduced the number of taxpayers subject to AMT'
    ],
    thresholds: {
      rates: '26% / 28%',
      exemption2024Single: '$85,700',
      exemption2024Married: '$133,300'
    },
    references: [
      {
        title: 'IRS Topic No. 556 — Alternative Minimum Tax',
        url: 'https://www.irs.gov/taxtopics/tc556',
        description: 'Overview of AMT rules'
      },
      {
        title: 'IRS Form 6251 Instructions',
        url: 'https://www.irs.gov/instructions/i6251',
        description: 'How to calculate AMT'
      }
    ],
    keywords: [
      'amt',
      'alternative minimum tax',
      'minimum tax',
      'iso',
      'incentive stock option',
      'form 6251',
      'amt credit',
      'tax preference'
    ]
  },
  {
    id: 'etf-tax-efficiency',
    name: 'ETF Tax Efficiency',
    summary:
      'ETFs are generally more tax-efficient than mutual funds due to the in-kind creation/redemption ' +
      'mechanism, which avoids triggering capital gains distributions. However, bond ETFs and ' +
      'actively managed ETFs may still distribute taxable gains.',
    keyPoints: [
      'In-kind creation/redemption avoids capital gains events',
      'ETFs rarely distribute capital gains (unlike mutual funds)',
      'Bond ETFs distribute interest income (taxed as ordinary income)',
      'International ETFs may be subject to foreign tax withholding',
      'Selling ETF shares still triggers capital gains/losses',
      'Holding ETFs in tax-advantaged accounts eliminates annual tax drag'
    ],
    references: [
      {
        title: 'SEC — Exchange-Traded Funds (ETFs)',
        url: 'https://www.sec.gov/investor/pubs/sec-guide-to-etfs.htm',
        description: 'SEC guide to understanding ETFs'
      },
      {
        title: 'IRS Publication 550 — Regulated Investment Companies',
        url: 'https://www.irs.gov/publications/p550',
        description: 'Tax treatment of fund distributions'
      }
    ],
    keywords: [
      'etf tax',
      'etf efficiency',
      'tax efficient',
      'tax-efficient',
      'in-kind',
      'creation redemption',
      'capital gains distribution',
      'mutual fund vs etf',
      'etf vs mutual fund',
      'fund distribution'
    ]
  }
];

const GENERAL_RESOURCES: RegulatoryReference[] = [
  {
    title: 'IRS — Investment Income and Expenses (Publication 550)',
    url: 'https://www.irs.gov/publications/p550',
    description: 'Comprehensive IRS guide covering most investment tax topics'
  },
  {
    title: 'SEC — Investor.gov',
    url: 'https://www.investor.gov/',
    description: 'SEC educational resource for retail investors'
  },
  {
    title: 'FINRA — Smart Investing',
    url: 'https://www.finra.org/investors',
    description: 'FINRA investor education and alerts'
  }
];

function findRegulations(topic: string): RegulationEntry[] {
  const normalized = topic.toLowerCase().trim();

  // Score each regulation by keyword match count
  const scored = REGULATION_LIBRARY.map((reg) => {
    let score = 0;

    // Check name match (high weight)
    if (reg.name.toLowerCase().includes(normalized)) score += 10;
    if (normalized.includes(reg.id)) score += 10;

    // Check keyword matches
    for (const kw of reg.keywords) {
      if (normalized.includes(kw.toLowerCase())) score += 3;
      if (kw.toLowerCase().includes(normalized)) score += 2;
    }

    // Check summary for topic words
    const words = normalized.split(/\s+/).filter((w) => w.length > 2);
    for (const word of words) {
      if (reg.summary.toLowerCase().includes(word)) score += 1;
      for (const kw of reg.keywords) {
        if (kw.toLowerCase().includes(word)) score += 1;
      }
    }

    return { reg, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.reg);
}

export const lookupRegulationTool: ToolDefinition = {
  name: 'lookup_regulation',
  description:
    'Looks up financial regulations and tax rules relevant to retail investors, returning ' +
    'explanations with authoritative IRS, SEC, and FINRA citations and source URLs. ' +
    'Use when the user asks about tax rules, regulatory requirements, compliance guidance, ' +
    'or wants to understand financial regulations like capital gains, wash sales, or dividend taxation. ' +
    'For wash sale detection on specific holdings, use check_wash_sale instead. ' +
    'For portfolio data, use get_holdings or portfolio_summary instead.',
  category: 'analysis',
  consequenceLevel: 'low',
  requiresConfirmation: false,
  timeout: 15000,
  tags: ['compliance', 'tax', 'regulation', 'education'],
  schema: z.object({
    topic: z
      .string()
      .describe(
        'The regulation or tax rule to look up (e.g., "wash sale", "capital gains", "qualified dividends").'
      )
  }),
  execute: async (
    params: unknown,
    context: UserToolContext
  ): Promise<ToolResult> => {
    const { topic } = params as { topic: string };

    if (context.abortSignal?.aborted) {
      return {
        tool: 'lookup_regulation',
        fetchedAt: new Date().toISOString(),
        error: 'Request was cancelled'
      };
    }

    try {
      const matches = findRegulations(topic);

      if (matches.length === 0) {
        return {
          tool: 'lookup_regulation',
          fetchedAt: new Date().toISOString(),
          data: {
            topic,
            found: false,
            message:
              `No specific regulation found for "${topic}". ` +
              'This topic may require professional tax or legal advice.',
            generalResources: GENERAL_RESOURCES
          }
        };
      }

      return {
        tool: 'lookup_regulation',
        fetchedAt: new Date().toISOString(),
        data: {
          topic,
          found: true,
          regulations: matches.map((reg) => ({
            name: reg.name,
            summary: reg.summary,
            keyPoints: reg.keyPoints,
            thresholds: reg.thresholds ?? null,
            references: reg.references
          })),
          matchCount: matches.length
        }
      };
    } catch (err) {
      // Log full error for debugging; return sanitized message to LLM
      console.error(`[lookup_regulation] ${err}`);
      return {
        tool: 'lookup_regulation',
        fetchedAt: new Date().toISOString(),
        error: 'Failed to fetch data from portfolio service'
      };
    }
  }
};
