export const portfolioSummaryFixture = {
  prompt: `| Symbol | Allocation | Value | Performance |
|--------|-----------|-------|-------------|
| AAPL | 40.00% | $40,000.00 | +15.20% |
| MSFT | 35.00% | $35,000.00 | +22.50% |
| BND | 25.00% | $25,000.00 | +3.10% |

Total Portfolio Value: $100,000.00
Base Currency: USD`
};

export const holdingsFixture = {
  holdings: [
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      currency: 'USD',
      marketPrice: 175.0,
      quantity: 228.57,
      investment: 34714.29,
      valueInBaseCurrency: 40000.0,
      allocationInPercentage: 0.4,
      assetClass: 'EQUITY',
      assetSubClass: 'STOCK',
      countries: [
        {
          code: 'US',
          name: 'United States',
          continent: 'North America',
          weight: 1
        }
      ],
      sectors: [{ name: 'Technology', weight: 1 }],
      holdings: [],
      netPerformance: 5285.71,
      netPerformancePercent: 0.152,
      grossPerformance: 5285.71,
      grossPerformancePercent: 0.152,
      dividend: 0,
      activitiesCount: 5,
      dateOfFirstActivity: '2024-01-15',
      dataSource: 'YAHOO',
      tags: [],
      url: null
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      currency: 'USD',
      marketPrice: 420.0,
      quantity: 83.33,
      investment: 28571.43,
      valueInBaseCurrency: 35000.0,
      allocationInPercentage: 0.35,
      assetClass: 'EQUITY',
      assetSubClass: 'STOCK',
      countries: [
        {
          code: 'US',
          name: 'United States',
          continent: 'North America',
          weight: 1
        }
      ],
      sectors: [{ name: 'Technology', weight: 1 }],
      holdings: [],
      netPerformance: 6428.57,
      netPerformancePercent: 0.225,
      grossPerformance: 6428.57,
      grossPerformancePercent: 0.225,
      dividend: 0,
      activitiesCount: 3,
      dateOfFirstActivity: '2024-02-01',
      dataSource: 'YAHOO',
      tags: [],
      url: null
    },
    {
      symbol: 'BND',
      name: 'Vanguard Total Bond Market ETF',
      currency: 'USD',
      marketPrice: 72.5,
      quantity: 344.83,
      investment: 24271.43,
      valueInBaseCurrency: 25000.0,
      allocationInPercentage: 0.25,
      assetClass: 'FIXED_INCOME',
      assetSubClass: 'ETF',
      countries: [],
      sectors: [],
      holdings: [],
      netPerformance: 728.57,
      netPerformancePercent: 0.031,
      grossPerformance: 728.57,
      grossPerformancePercent: 0.031,
      dividend: 125.0,
      activitiesCount: 2,
      dateOfFirstActivity: '2024-03-10',
      dataSource: 'YAHOO',
      tags: [],
      url: null
    }
  ]
};
