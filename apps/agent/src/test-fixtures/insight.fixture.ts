import { InsightRecord } from '../app/common/interfaces';

export const insightFixture: InsightRecord = {
  id: 'insight-001',
  userId: 'fixture-user-1',
  category: 'concentration',
  summary: 'AAPL allocation at 40% exceeds 20% concentration threshold',
  data: {
    symbol: 'AAPL',
    allocation: 0.4,
    threshold: 0.2
  },
  createdAt: '2026-02-24T12:00:00.000Z',
  expiresAt: '2026-02-25T12:00:00.000Z'
};

export const insightListFixture: InsightRecord[] = [
  insightFixture,
  {
    id: 'insight-002',
    userId: 'fixture-user-1',
    category: 'rebalance',
    summary: 'Portfolio drift detected — technology sector at 75%',
    data: { sector: 'Technology', weight: 0.75 },
    createdAt: '2026-02-24T11:00:00.000Z'
  }
];
