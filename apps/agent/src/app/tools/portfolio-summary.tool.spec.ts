import { portfolioSummaryTool } from './portfolio-summary.tool';

describe('portfolioSummaryTool', () => {
  const mockContext = {
    client: { get: jest.fn() },
    auth: { mode: 'user' as const, jwt: 'fake-jwt' },
    userId: 'user-1',
    abortSignal: undefined as AbortSignal | undefined
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns prompt data on success', async () => {
    mockContext.client.get.mockResolvedValue({
      prompt: 'Analysis prompt here'
    });
    const result = await portfolioSummaryTool.execute(
      { mode: 'analysis' },
      mockContext as any
    );
    expect(result.tool).toBe('portfolio_summary');
    expect(result.data).toEqual({
      prompt: 'Analysis prompt here',
      mode: 'analysis'
    });
    expect(result.error).toBeUndefined();
  });

  it('uses portfolio mode when specified', async () => {
    mockContext.client.get.mockResolvedValue({ prompt: 'Portfolio overview' });
    await portfolioSummaryTool.execute(
      { mode: 'portfolio' },
      mockContext as any
    );
    expect(mockContext.client.get).toHaveBeenCalledWith(
      '/api/v1/ai/prompt/portfolio',
      mockContext.auth
    );
  });

  it('returns error when request cancelled', async () => {
    const result = await portfolioSummaryTool.execute({}, {
      ...mockContext,
      abortSignal: { aborted: true } as AbortSignal
    } as any);
    expect(result.error).toBe('Request was cancelled');
    expect(mockContext.client.get).not.toHaveBeenCalled();
  });

  it('returns error message on client failure', async () => {
    mockContext.client.get.mockRejectedValue(new Error('Network error'));
    const result = await portfolioSummaryTool.execute({}, mockContext as any);
    expect(result.error).toBe('Network error');
  });

  it('returns stringified error when rejection is not an Error', async () => {
    mockContext.client.get.mockRejectedValue('string error');
    const result = await portfolioSummaryTool.execute({}, mockContext as any);
    expect(result.error).toBe('string error');
  });
});
