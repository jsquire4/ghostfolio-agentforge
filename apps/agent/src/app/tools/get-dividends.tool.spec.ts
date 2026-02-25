import { IGhostfolioClient, UserToolContext } from '../common/interfaces';
import { getDividendsTool } from './get-dividends.tool';

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

const fakeDividends = {
  dividends: [
    { date: '2024-05-10', investment: 2.5 },
    { date: '2024-08-09', investment: 2.5 },
    { date: '2024-06-13', investment: 6.0 },
    { date: '2024-09-12', investment: 6.0 },
    { date: '2024-07-01', investment: 13.05 }
  ]
};

describe('getDividendsTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all dividends with computed total when no filters provided', async () => {
    mockClient.get.mockResolvedValue(fakeDividends);

    const result = await getDividendsTool.execute({}, mockContext as any);

    expect(result.error).toBeUndefined();
    expect(result.tool).toBe('get_dividends');
    expect(result.fetchedAt).toBeDefined();
    expect((result.data as any).count).toBe(5);
    expect((result.data as any).totalDividends).toBeCloseTo(30.05);
    expect((result.data as any).symbol).toBeNull();
    expect((result.data as any).groupBy).toBeNull();

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/dividends',
      mockContext.auth
    );
  });

  it('filters by symbol via query param', async () => {
    mockClient.get.mockResolvedValue({
      dividends: [
        { date: '2024-05-10', investment: 2.5 },
        { date: '2024-08-09', investment: 2.5 }
      ]
    });

    const result = await getDividendsTool.execute(
      { symbol: 'AAPL' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).count).toBe(2);
    expect((result.data as any).totalDividends).toBe(5.0);
    expect((result.data as any).symbol).toBe('AAPL');

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/dividends?symbol=AAPL',
      mockContext.auth
    );
  });

  it('groups by month via query param', async () => {
    mockClient.get.mockResolvedValue({
      dividends: [
        { date: '2024-05-01', investment: 2.5 },
        { date: '2024-06-01', investment: 6.0 }
      ]
    });

    const result = await getDividendsTool.execute(
      { groupBy: 'month' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).groupBy).toBe('month');
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/dividends?groupBy=month',
      mockContext.auth
    );
  });

  it('groups by year via query param', async () => {
    mockClient.get.mockResolvedValue({
      dividends: [{ date: '2024-01-01', investment: 30.05 }]
    });

    const result = await getDividendsTool.execute(
      { groupBy: 'year' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).groupBy).toBe('year');
    expect((result.data as any).totalDividends).toBeCloseTo(30.05);
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/dividends?groupBy=year',
      mockContext.auth
    );
  });

  it('passes range filter via query param', async () => {
    mockClient.get.mockResolvedValue({ dividends: [] });

    const result = await getDividendsTool.execute(
      { range: '1y' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/dividends?range=1y',
      mockContext.auth
    );
  });

  it('combines all query params', async () => {
    mockClient.get.mockResolvedValue({
      dividends: [{ date: '2024-08-09', investment: 2.5 }]
    });

    const result = await getDividendsTool.execute(
      { symbol: 'AAPL', groupBy: 'month', range: '6m' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).count).toBe(1);
    expect((result.data as any).symbol).toBe('AAPL');
    expect((result.data as any).groupBy).toBe('month');
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/portfolio/dividends?symbol=AAPL&groupBy=month&range=6m',
      mockContext.auth
    );
  });

  it('handles empty dividends response', async () => {
    mockClient.get.mockResolvedValue({ dividends: [] });

    const result = await getDividendsTool.execute({}, mockContext as any);

    expect(result.error).toBeUndefined();
    expect((result.data as any).count).toBe(0);
    expect((result.data as any).totalDividends).toBe(0);
    expect((result.data as any).dividends).toEqual([]);
  });

  it('returns error when Ghostfolio client throws', async () => {
    mockClient.get.mockRejectedValue(new Error('Connection refused'));

    const result = await getDividendsTool.execute({}, mockContext as any);

    expect(result.error).toBe('Failed to fetch data from portfolio service');
    expect(result.tool).toBe('get_dividends');
    expect(result.fetchedAt).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it('returns sanitized error when rejection is not an Error', async () => {
    mockClient.get.mockRejectedValue('upstream timeout');

    const result = await getDividendsTool.execute({}, mockContext as any);

    expect(result.error).toBe('Failed to fetch data from portfolio service');
  });

  it('returns cancellation error when abortSignal is already aborted', async () => {
    const abortedContext: UserToolContext = {
      ...mockContext,
      abortSignal: AbortSignal.abort()
    };

    const result = await getDividendsTool.execute({}, abortedContext as any);

    expect(result.error).toBe('Request was cancelled');
    expect(result.tool).toBe('get_dividends');
    expect(result.fetchedAt).toBeDefined();
    expect(mockClient.get).not.toHaveBeenCalled();
  });
});
