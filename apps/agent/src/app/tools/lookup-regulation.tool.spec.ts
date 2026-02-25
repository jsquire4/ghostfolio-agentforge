import { IGhostfolioClient, UserToolContext } from '../common/interfaces';
import { lookupRegulationTool } from './lookup-regulation.tool';

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

describe('lookupRegulationTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('finds wash sale regulation by exact topic', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'wash sale' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect(result.tool).toBe('lookup_regulation');
    expect(result.fetchedAt).toBeDefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toBe('Wash Sale Rule');
    expect(
      (result.data as any).regulations[0].references.length
    ).toBeGreaterThan(0);
    expect((result.data as any).regulations[0].references[0].url).toContain(
      'irs.gov'
    );
  });

  it('finds capital gains regulation', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'capital gains' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toBe('Capital Gains Tax');
    expect(
      (result.data as any).regulations[0].keyPoints.length
    ).toBeGreaterThan(0);
    expect((result.data as any).regulations[0].thresholds).toBeDefined();
  });

  it('finds qualified dividends regulation', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'qualified dividends' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toBe(
      'Qualified Dividend Taxation'
    );
  });

  it('finds tax loss harvesting by related terms', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'harvest losses for tax purposes' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);

    const names = (result.data as any).regulations.map((r: any) => r.name);
    expect(names).toContain('Tax Loss Harvesting');
  });

  it('finds IRA contribution limits', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'IRA contribution limits' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toBe(
      'IRA Contribution Limits'
    );
    expect((result.data as any).regulations[0].thresholds.annualLimit2024).toBe(
      '$7,000'
    );
  });

  it('finds RMD regulation', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'required minimum distribution' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toContain(
      'Required Minimum Distribution'
    );
  });

  it('finds NIIT regulation by abbreviation', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'NIIT' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toContain(
      'Net Investment Income Tax'
    );
  });

  it('finds AMT regulation', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'alternative minimum tax' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toContain(
      'Alternative Minimum Tax'
    );
  });

  it('finds ETF tax efficiency topic', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'ETF tax efficiency' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toBe('ETF Tax Efficiency');
  });

  it('returns multiple matches when topic is broad', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'tax' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).matchCount).toBeGreaterThan(1);
  });

  it('returns not-found with general resources for unknown topic', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'cryptocurrency mining regulations in Antarctica' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(false);
    expect((result.data as any).generalResources.length).toBeGreaterThan(0);
    expect((result.data as any).generalResources[0].url).toContain('irs.gov');
  });

  it('includes references with URLs for every matched regulation', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'cost basis' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);

    for (const reg of (result.data as any).regulations) {
      expect(reg.references.length).toBeGreaterThan(0);
      for (const ref of reg.references) {
        expect(ref.url).toMatch(/^https:\/\//);
        expect(ref.title).toBeDefined();
      }
    }
  });

  it('is case-insensitive for topic matching', async () => {
    const result = await lookupRegulationTool.execute(
      { topic: 'WASH SALE' },
      mockContext as any
    );

    expect(result.error).toBeUndefined();
    expect((result.data as any).found).toBe(true);
    expect((result.data as any).regulations[0].name).toBe('Wash Sale Rule');
  });

  it('returns cancellation error when abortSignal is already aborted', async () => {
    const abortedContext: UserToolContext = {
      ...mockContext,
      abortSignal: AbortSignal.abort()
    };

    const result = await lookupRegulationTool.execute(
      { topic: 'wash sale' },
      abortedContext as any
    );

    expect(result.error).toBe('Request was cancelled');
    expect(result.tool).toBe('lookup_regulation');
    expect(result.fetchedAt).toBeDefined();
  });

  it('does not call the Ghostfolio client (static lookup)', async () => {
    await lookupRegulationTool.execute(
      { topic: 'capital gains' },
      mockContext as any
    );

    expect(mockClient.get).not.toHaveBeenCalled();
    expect(mockClient.post).not.toHaveBeenCalled();
  });
});
