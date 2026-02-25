import { IGhostfolioClient, UserToolContext } from '../common/interfaces';
import { getHoldingsTool } from './get-holdings.tool';

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

const fakeHolding = (overrides: Partial<Record<string, unknown>> = {}) => ({
  symbol: 'AAPL',
  name: 'Apple Inc.',
  quantity: 7,
  currency: 'USD',
  marketPrice: 228.0,
  valueInBaseCurrency: 1596.0,
  investment: 1855.0,
  allocationInPercentage: 0.12,
  netPerformance: -259.0,
  netPerformancePercent: -0.1396,
  assetClass: 'EQUITY',
  assetSubClass: 'STOCK',
  dateOfFirstActivity: '2024-01-15',
  dividend: 5.0,
  sectors: [{ name: 'Technology', weight: 1.0 }],
  countries: [{ code: 'US', name: 'United States', weight: 1.0 }],
  ...overrides
});

const fakeVTI = fakeHolding({
  symbol: 'VTI',
  name: 'Vanguard Total Stock Market ETF',
  quantity: 15,
  marketPrice: 252.3,
  valueInBaseCurrency: 3784.5,
  investment: 3784.5,
  allocationInPercentage: 0.29,
  netPerformance: 0,
  netPerformancePercent: 0,
  assetClass: 'EQUITY',
  assetSubClass: 'ETF',
  dateOfFirstActivity: '2024-05-01',
  dividend: 13.05,
  sectors: [],
  countries: []
});

const fakeBND = fakeHolding({
  symbol: 'BND',
  name: 'Vanguard Total Bond Market ETF',
  quantity: 20,
  marketPrice: 73.5,
  valueInBaseCurrency: 1470.0,
  investment: 1470.0,
  allocationInPercentage: 0.11,
  netPerformance: 0,
  netPerformancePercent: 0,
  assetClass: 'FIXED_INCOME',
  assetSubClass: 'ETF',
  dateOfFirstActivity: '2024-05-15',
  dividend: 0,
  sectors: [],
  countries: []
});

const allHoldings = { holdings: [fakeHolding(), fakeVTI, fakeBND] };

describe('getHoldingsTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all holdings when no filters provided', async () => {
    mockClient.get.mockResolvedValue(allHoldings);

    const result = await getHoldingsTool.execute({}, mockContext as any);

    expect(result.error).toBeUndefined();
    expect(result.tool).toBe('get_holdings');
    expect(result.fetchedAt).toBeDefined();
    expect((result.data as any).count).toBe(3);
    expect((result.data as any).holdings).toHaveLength(3);
    expect((result.data as any).holdings[0].symbol).toBe('AAPL');
    expect((result.data as any).holdings[0].quantity).toBe(7);
    expect((result.data as any).holdings[0].investment).toBe(1855.0);
    expect((result.data as any).holdings[0].dateOfFirstActivity).toBe(
      '2024-01-15'
    );

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/holdings',
      mockContext.auth
    );
  });

  it('filters by single symbol via query param', async () => {
    mockClient.get.mockResolvedValue({ holdings: [fakeHolding()] });

    const result = await getHoldingsTool.execute(
      { symbols: ['AAPL'] },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).count).toBe(1);
    expect((result.data as any).holdings[0].symbol).toBe('AAPL');

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/holdings?query=AAPL',
      mockContext.auth
    );
  });

  it('filters by multiple symbols client-side', async () => {
    mockClient.get.mockResolvedValue(allHoldings);

    const result = await getHoldingsTool.execute(
      { symbols: ['AAPL', 'VTI'] },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).count).toBe(2);
    expect((result.data as any).holdings.map((h: any) => h.symbol)).toEqual([
      'AAPL',
      'VTI'
    ]);
  });

  it('filters by equity asset class', async () => {
    mockClient.get.mockResolvedValue(allHoldings);

    const result = await getHoldingsTool.execute(
      { assetClass: 'equity' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/holdings?assetClasses=EQUITY',
      mockContext.auth
    );
  });

  it('filters by bond asset class', async () => {
    mockClient.get.mockResolvedValue({ holdings: [fakeBND] });

    const result = await getHoldingsTool.execute(
      { assetClass: 'bond' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/holdings?assetClasses=FIXED_INCOME',
      mockContext.auth
    );
  });

  it('filters ETFs by subclass client-side', async () => {
    // ETFs share EQUITY asset class with stocks, so we filter by subclass
    mockClient.get.mockResolvedValue(allHoldings);

    const result = await getHoldingsTool.execute(
      { assetClass: 'etf' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).count).toBe(2);
    expect((result.data as any).holdings.map((h: any) => h.symbol)).toEqual([
      'VTI',
      'BND'
    ]);
  });

  it('returns per-holding detail fields needed by downstream tools', async () => {
    mockClient.get.mockResolvedValue({ holdings: [fakeHolding()] });

    const result = await getHoldingsTool.execute({}, mockContext as any);
    const holding = (result.data as any).holdings[0];

    // Fields needed by get_dividends
    expect(holding.symbol).toBe('AAPL');
    expect(holding.dividend).toBe(5.0);

    // Fields needed by compliance_check (wash sale)
    expect(holding.dateOfFirstActivity).toBe('2024-01-15');
    expect(holding.investment).toBe(1855.0);
    expect(holding.quantity).toBe(7);

    // Fields needed by tax_estimate
    expect(holding.netPerformance).toBe(-259.0);
    expect(holding.netPerformancePercent).toBe(-0.1396);

    // Diversification data
    expect(holding.sectors).toEqual([{ name: 'Technology', weight: 1.0 }]);
    expect(holding.countries).toEqual([
      { code: 'US', name: 'United States', weight: 1.0 }
    ]);
  });

  it('returns error when Ghostfolio client throws', async () => {
    mockClient.get.mockRejectedValue(new Error('Connection refused'));

    const result = await getHoldingsTool.execute({}, mockContext as any);

    expect(result.error).toBe('Failed to fetch data from portfolio service');
    expect(result.tool).toBe('get_holdings');
    expect(result.fetchedAt).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it('returns sanitized error when rejection is not an Error', async () => {
    mockClient.get.mockRejectedValue('upstream timeout');

    const result = await getHoldingsTool.execute({}, mockContext as any);

    expect(result.error).toBe('Failed to fetch data from portfolio service');
  });

  it('returns cancellation error when abortSignal is already aborted', async () => {
    const abortedContext: UserToolContext = {
      ...mockContext,
      abortSignal: AbortSignal.abort()
    };

    const result = await getHoldingsTool.execute({}, abortedContext as any);

    expect(result.error).toBe('Request was cancelled');
    expect(result.tool).toBe('get_holdings');
    expect(result.fetchedAt).toBeDefined();
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('handles empty holdings response', async () => {
    mockClient.get.mockResolvedValue({ holdings: [] });

    const result = await getHoldingsTool.execute({}, mockContext as any);

    expect(result.error).toBeUndefined();
    expect((result.data as any).count).toBe(0);
    expect((result.data as any).holdings).toEqual([]);
  });

  it('combines symbol and assetClass filters', async () => {
    mockClient.get.mockResolvedValue({
      holdings: [fakeHolding()]
    });

    const result = await getHoldingsTool.execute(
      { symbols: ['AAPL'], assetClass: 'equity' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/holdings?assetClasses=EQUITY&query=AAPL',
      mockContext.auth
    );
  });
});
