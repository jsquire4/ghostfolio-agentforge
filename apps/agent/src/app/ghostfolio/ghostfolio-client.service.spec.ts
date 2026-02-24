import { ConfigService } from '@nestjs/config';

import {
  GhostfolioClientService,
  GhostfolioClientError
} from './ghostfolio-client.service';

describe('GhostfolioClientService', () => {
  let configService: ConfigService;
  let service: GhostfolioClientService;

  const mockFetch = jest.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    configService = {
      get: jest.fn((key: string, def?: string) => {
        if (key === 'GHOSTFOLIO_BASE_URL') return 'http://localhost:3333';
        if (key === 'GHOSTFOLIO_API_TOKEN') return 'test-token';
        return def;
      })
    } as unknown as ConfigService;
    service = new GhostfolioClientService(configService);
    jest.clearAllMocks();
  });

  it('throws when GHOSTFOLIO_API_TOKEN not configured', () => {
    const noTokenConfig = {
      get: jest.fn((key: string) =>
        key === 'GHOSTFOLIO_API_TOKEN' ? '' : 'http://localhost:3333'
      )
    } as any;
    expect(() => new GhostfolioClientService(noTokenConfig)).toThrow(
      'GHOSTFOLIO_API_TOKEN is not configured'
    );
  });

  it('get uses user JWT in Authorization header', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: 1 }) });

    await service.get('/api/v1/user', { mode: 'user', jwt: 'user-jwt' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/api/v1/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer user-jwt'
        })
      })
    );
  });

  it('get exchanges service token when mode is service', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'service-jwt' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'data' })
      });

    await service.get('/api/v1/something', {
      mode: 'service',
      token: 'test-token'
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3333/api/v1/auth/anonymous',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3333/api/v1/something',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer service-jwt'
        })
      })
    );
  });

  it('throws GhostfolioClientError on non-2xx', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found'
    });

    await expect(
      service.get('/api/v1/missing', { mode: 'user', jwt: 'jwt' })
    ).rejects.toThrow(GhostfolioClientError);

    await expect(
      service.get('/api/v1/missing', { mode: 'user', jwt: 'jwt' })
    ).rejects.toMatchObject({
      statusCode: 404,
      path: '/api/v1/missing'
    });
  });

  it('post sends body and uses correct method', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new' })
    });

    await service.post(
      '/api/v1/orders',
      { symbol: 'BTC' },
      { mode: 'user', jwt: 'jwt' }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/api/v1/orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ symbol: 'BTC' })
      })
    );
  });

  it('delete uses correct method', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await service.delete('/api/v1/orders/1', { mode: 'user', jwt: 'jwt' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/api/v1/orders/1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('throws when retry after 401 also fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'jwt' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'new-jwt' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      });

    await expect(
      service.get('/api/v1/protected', { mode: 'service', token: 'test-token' })
    ).rejects.toMatchObject({ statusCode: 403, path: '/api/v1/protected' });
  });

  it('retries once on 401 with service auth after clearing cache', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'first-jwt' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'refreshed-jwt' })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: 'ok' }) });

    const result = await service.get('/api/v1/protected', {
      mode: 'service',
      token: 'test-token'
    });

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ data: 'ok' });
  });

  it('reuses cached service JWT on subsequent calls', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'cached-jwt' })
      })
      .mockResolvedValue({ ok: true, json: async () => ({ data: 1 }) });

    await service.get('/api/v1/a', { mode: 'service', token: 'test-token' });
    await service.get('/api/v1/b', { mode: 'service', token: 'test-token' });

    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 exchange + 2 get
  });

  it('throws GhostfolioClientError when token exchange fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error: any = await service
      .get('/api/v1/data', { mode: 'service', token: 'test-token' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(GhostfolioClientError);
    expect(error.statusCode).toBe(503);
    expect(error.path).toBe('/api/v1/auth/anonymous');
  });

  it('re-exchanges token after cached JWT expires', async () => {
    jest.useFakeTimers();

    // First call: exchange + request
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'jwt-1' })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: 1 }) });

    await service.get('/api/v1/a', { mode: 'service', token: 'test-token' });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Advance past 24h cache
    jest.advanceTimersByTime(25 * 60 * 60 * 1000);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authToken: 'jwt-2' })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: 2 }) });

    await service.get('/api/v1/b', { mode: 'service', token: 'test-token' });

    // Should have re-exchanged: 2 exchanges + 2 requests = 4 total
    expect(mockFetch).toHaveBeenCalledTimes(4);

    jest.useRealTimers();
  });

  it('deduplicates concurrent service token exchanges', async () => {
    let resolveExchange: (v: any) => void;
    const exchangePromise = new Promise((r) => {
      resolveExchange = r;
    });

    mockFetch.mockImplementationOnce(() => exchangePromise);

    const req1 = service.get('/api/v1/a', {
      mode: 'service',
      token: 'test-token'
    });
    const req2 = service.get('/api/v1/b', {
      mode: 'service',
      token: 'test-token'
    });

    // Resolve the exchange
    resolveExchange!({
      ok: true,
      json: async () => ({ authToken: 'shared-jwt' })
    });

    // Now provide responses for the actual requests
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: 'a' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: 'b' }) });

    await Promise.all([req1, req2]);

    // Only 1 exchange call + 2 request calls = 3 total
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
