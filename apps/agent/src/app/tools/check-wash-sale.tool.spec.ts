import { IGhostfolioClient, UserToolContext } from '../common/interfaces';
import { checkWashSaleTool } from './check-wash-sale.tool';

const mockClient: jest.Mocked<IGhostfolioClient> = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn()
};

const mockContext: UserToolContext = {
  userId: 'test-user-123',
  abortSignal: AbortSignal.timeout(10000),
  auth: { mode: 'user', jwt: 'mock-jwt-token' },
  client: mockClient
};

// AAPL seed data: bought 10 @ $185.50 on 2024-01-15, sold 3 @ $228.00 on 2024-09-15
const aaplActivities = {
  activities: [
    {
      date: '2024-01-15T00:00:00.000Z',
      type: 'BUY' as const,
      quantity: 10,
      unitPrice: 185.5,
      fee: 4.99,
      SymbolProfile: { symbol: 'AAPL' }
    },
    {
      date: '2024-09-15T00:00:00.000Z',
      type: 'SELL' as const,
      quantity: 3,
      unitPrice: 228.0,
      fee: 4.99,
      SymbolProfile: { symbol: 'AAPL' }
    }
  ],
  count: 2
};

// Scenario: sell at a loss then rebuy within 30 days — wash sale violation
const washSaleActivities = {
  activities: [
    {
      date: '2024-01-15T00:00:00.000Z',
      type: 'BUY' as const,
      quantity: 10,
      unitPrice: 200.0,
      fee: 0,
      SymbolProfile: { symbol: 'XYZ' }
    },
    {
      date: '2024-09-01T00:00:00.000Z',
      type: 'SELL' as const,
      quantity: 5,
      unitPrice: 150.0,
      fee: 0,
      SymbolProfile: { symbol: 'XYZ' }
    },
    {
      date: '2024-09-20T00:00:00.000Z',
      type: 'BUY' as const,
      quantity: 5,
      unitPrice: 155.0,
      fee: 0,
      SymbolProfile: { symbol: 'XYZ' }
    }
  ],
  count: 3
};

// Scenario: sell at a loss but no rebuy within 30 days — no violation
const noViolationActivities = {
  activities: [
    {
      date: '2024-01-15T00:00:00.000Z',
      type: 'BUY' as const,
      quantity: 10,
      unitPrice: 200.0,
      fee: 0,
      SymbolProfile: { symbol: 'ABC' }
    },
    {
      date: '2024-06-01T00:00:00.000Z',
      type: 'SELL' as const,
      quantity: 5,
      unitPrice: 150.0,
      fee: 0,
      SymbolProfile: { symbol: 'ABC' }
    },
    {
      date: '2024-09-01T00:00:00.000Z',
      type: 'BUY' as const,
      quantity: 3,
      unitPrice: 160.0,
      fee: 0,
      SymbolProfile: { symbol: 'ABC' }
    }
  ],
  count: 3
};

describe('checkWashSaleTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns no violations when sell was at a profit', async () => {
    mockClient.get.mockResolvedValue(aaplActivities);

    const result = await checkWashSaleTool.execute(
      { symbol: 'AAPL', lookbackDays: 730 },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect(result.tool).toBe('check_wash_sale');
    expect(result.fetchedAt).toBeDefined();
    expect((result.data as any).violationCount).toBe(0);
    expect((result.data as any).violations).toEqual([]);
    expect((result.data as any).symbol).toBe('AAPL');
  });

  it('detects wash sale violation when rebuy within 30 days of loss sale', async () => {
    mockClient.get.mockResolvedValue(washSaleActivities);

    const result = await checkWashSaleTool.execute(
      { symbol: 'XYZ', lookbackDays: 730 },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).violationCount).toBe(1);

    const violation = (result.data as any).violations[0];
    expect(violation.sellDate).toBe('2024-09-01');
    expect(violation.buyDate).toBe('2024-09-20');
    expect(violation.daysBetween).toBe(19);
    expect(violation.lossPerShare).toBe(50);
    expect(violation.sellPrice).toBe(150.0);
    expect(violation.buyPrice).toBe(155.0);
  });

  it('returns no violations when rebuy is outside 30-day window', async () => {
    mockClient.get.mockResolvedValue(noViolationActivities);

    const result = await checkWashSaleTool.execute(
      { symbol: 'ABC', lookbackDays: 730 },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).violationCount).toBe(0);
    expect((result.data as any).violations).toEqual([]);
  });

  it('includes regulatory context in response', async () => {
    mockClient.get.mockResolvedValue({ activities: [], count: 0 });

    const result = await checkWashSaleTool.execute(
      { symbol: 'AAPL' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    const ctx = (result.data as any).regulatoryContext;
    expect(ctx.rule).toContain('Section 1091');
    expect(ctx.references).toHaveLength(2);
    expect(ctx.references[0].url).toContain('irs.gov');
    expect(ctx.references[1].url).toContain('law.cornell.edu');
  });

  it('includes transaction analysis counts', async () => {
    mockClient.get.mockResolvedValue(washSaleActivities);

    const result = await checkWashSaleTool.execute(
      { symbol: 'XYZ', lookbackDays: 730 },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).transactionsAnalyzed.sells).toBe(1);
    expect((result.data as any).transactionsAnalyzed.buys).toBe(2);
  });

  it('calls the order endpoint with the correct symbol', async () => {
    mockClient.get.mockResolvedValue({ activities: [], count: 0 });

    await checkWashSaleTool.execute({ symbol: 'MSFT' }, mockContext as any);

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/order?symbol=MSFT',
      mockContext.auth
    );
  });

  it('handles empty activities response', async () => {
    mockClient.get.mockResolvedValue({ activities: [], count: 0 });

    const result = await checkWashSaleTool.execute(
      { symbol: 'AAPL' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).violationCount).toBe(0);
    expect((result.data as any).warningCount).toBe(0);
    expect((result.data as any).violations).toEqual([]);
    expect((result.data as any).warnings).toEqual([]);
  });

  it('returns error when Ghostfolio client throws', async () => {
    mockClient.get.mockRejectedValue(new Error('Connection refused'));

    const result = await checkWashSaleTool.execute(
      { symbol: 'AAPL' },
      mockContext as any
    );

    expect(result.error).toBe('Failed to fetch data from portfolio service');
    expect(result.tool).toBe('check_wash_sale');
    expect(result.fetchedAt).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it('returns sanitized error when rejection is not an Error', async () => {
    mockClient.get.mockRejectedValue('upstream timeout');

    const result = await checkWashSaleTool.execute(
      { symbol: 'AAPL' },
      mockContext as any
    );

    expect(result.error).toBe('Failed to fetch data from portfolio service');
  });

  it('returns cancellation error when abortSignal is already aborted', async () => {
    const abortedContext: UserToolContext = {
      ...mockContext,
      abortSignal: AbortSignal.abort()
    };

    const result = await checkWashSaleTool.execute(
      { symbol: 'AAPL' },
      abortedContext as any
    );

    expect(result.error).toBe('Request was cancelled');
    expect(result.tool).toBe('check_wash_sale');
    expect(result.fetchedAt).toBeDefined();
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('respects lookbackDays to scope sells analyzed', async () => {
    // Sell is 365+ days ago — with lookbackDays=30 it should be excluded
    const oldSellActivities = {
      activities: [
        {
          date: '2023-01-15T00:00:00.000Z',
          type: 'BUY' as const,
          quantity: 10,
          unitPrice: 200.0,
          fee: 0,
          SymbolProfile: { symbol: 'OLD' }
        },
        {
          date: '2023-06-01T00:00:00.000Z',
          type: 'SELL' as const,
          quantity: 5,
          unitPrice: 150.0,
          fee: 0,
          SymbolProfile: { symbol: 'OLD' }
        },
        {
          date: '2023-06-15T00:00:00.000Z',
          type: 'BUY' as const,
          quantity: 5,
          unitPrice: 155.0,
          fee: 0,
          SymbolProfile: { symbol: 'OLD' }
        }
      ],
      count: 3
    };

    mockClient.get.mockResolvedValue(oldSellActivities);

    const result = await checkWashSaleTool.execute(
      { symbol: 'OLD', lookbackDays: 30 },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    // Sell from 2023-06-01 is outside the 30-day lookback from now
    expect((result.data as any).violationCount).toBe(0);
    expect((result.data as any).transactionsAnalyzed.sells).toBe(0);
  });
});
