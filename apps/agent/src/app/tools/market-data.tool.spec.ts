import { IGhostfolioClient, UserToolContext } from '../common/interfaces';
import { marketDataTool } from './market-data.tool';

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

const fakeLookupResponse = {
  items: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      currency: 'USD',
      dataSource: 'YAHOO',
      assetClass: 'EQUITY',
      assetSubClass: 'STOCK'
    }
  ]
};

const fakeSymbolResponse = {
  dataSource: 'YAHOO',
  symbol: 'NVDA',
  currency: 'USD',
  marketPrice: 142.5,
  historicalData: []
};

describe('marketDataTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns current price for a single symbol', async () => {
    mockClient.get
      .mockResolvedValueOnce(fakeLookupResponse)
      .mockResolvedValueOnce(fakeSymbolResponse);

    const result = await marketDataTool.execute(
      { symbols: ['NVDA'] },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect(result.tool).toBe('market_data');
    expect(result.fetchedAt).toBeDefined();
    expect(result.data).toEqual({
      symbols: [
        {
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          currency: 'USD',
          marketPrice: 142.5,
          dataSource: 'YAHOO'
        }
      ],
      range: null
    });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/symbol/lookup?query=NVDA',
      mockContext.auth
    );
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/symbol/YAHOO/NVDA',
      mockContext.auth
    );
  });

  it('includes historical data when range is specified', async () => {
    const historicalData = [
      { date: '2025-01-01', marketPrice: 130.0 },
      { date: '2025-01-15', marketPrice: 135.0 },
      { date: '2025-01-31', marketPrice: 142.5 }
    ];

    mockClient.get
      .mockResolvedValueOnce(fakeLookupResponse)
      .mockResolvedValueOnce({
        ...fakeSymbolResponse,
        historicalData
      });

    const result = await marketDataTool.execute(
      { symbols: ['NVDA'], range: '1m' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).symbols[0].historicalData).toEqual(
      historicalData
    );
    expect((result.data as any).range).toBe('1m');

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/symbol/YAHOO/NVDA?includeHistoricalData=30',
      mockContext.auth
    );
  });

  it('fetches multiple symbols', async () => {
    const metaLookup = {
      items: [
        {
          symbol: 'META',
          name: 'Meta Platforms Inc',
          currency: 'USD',
          dataSource: 'YAHOO'
        }
      ]
    };
    const metaSymbol = {
      dataSource: 'YAHOO',
      symbol: 'META',
      currency: 'USD',
      marketPrice: 520.0,
      historicalData: []
    };

    mockClient.get
      .mockResolvedValueOnce(fakeLookupResponse)
      .mockResolvedValueOnce(fakeSymbolResponse)
      .mockResolvedValueOnce(metaLookup)
      .mockResolvedValueOnce(metaSymbol);

    const result = await marketDataTool.execute(
      { symbols: ['NVDA', 'META'] },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).symbols).toHaveLength(2);
    expect((result.data as any).symbols[0].symbol).toBe('NVDA');
    expect((result.data as any).symbols[1].symbol).toBe('META');
    expect(mockClient.get).toHaveBeenCalledTimes(4);
  });

  it('handles symbol not found gracefully', async () => {
    mockClient.get.mockResolvedValueOnce({ items: [] });

    const result = await marketDataTool.execute(
      { symbols: ['FAKEXYZ'] },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).symbols[0]).toEqual({
      symbol: 'FAKEXYZ',
      currency: 'N/A',
      marketPrice: 0,
      dataSource: 'UNKNOWN',
      name: 'Symbol not found: FAKEXYZ'
    });
  });

  it('returns error when Ghostfolio client throws', async () => {
    mockClient.get.mockRejectedValue(new Error('Connection refused'));

    const result = await marketDataTool.execute(
      { symbols: ['NVDA'] },
      mockContext as any
    );

    expect(result.error).toBe('Connection refused');
    expect(result.tool).toBe('market_data');
    expect(result.fetchedAt).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it('returns stringified error when rejection is not an Error', async () => {
    mockClient.get.mockRejectedValue('upstream timeout');

    const result = await marketDataTool.execute(
      { symbols: ['NVDA'] },
      mockContext as any
    );

    expect(result.error).toBe('upstream timeout');
  });

  it('returns cancellation error when abortSignal is already aborted', async () => {
    const abortedContext: UserToolContext = {
      ...mockContext,
      abortSignal: AbortSignal.abort()
    };

    const result = await marketDataTool.execute(
      { symbols: ['NVDA'] },
      abortedContext as any
    );

    expect(result.error).toBe('Request was cancelled');
    expect(result.tool).toBe('market_data');
    expect(result.fetchedAt).toBeDefined();
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('omits historicalData from result when range is not provided and response has empty array', async () => {
    mockClient.get
      .mockResolvedValueOnce(fakeLookupResponse)
      .mockResolvedValueOnce(fakeSymbolResponse);

    const result = await marketDataTool.execute(
      { symbols: ['NVDA'] },
      mockContext as any
    );

    expect((result.data as any).symbols[0].historicalData).toBeUndefined();
  });
});
