import {
  DEFAULT_HITL_MATRIX,
  HitlMatrix,
  ToolDefinition
} from '../common/interfaces';
import { HitlMatrixService } from './hitl-matrix.service';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn()
};

describe('HitlMatrixService', () => {
  let service: HitlMatrixService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HitlMatrixService(mockRedis as any);
  });

  it('returns default matrix when no stored matrix', async () => {
    mockRedis.get.mockResolvedValue(null);
    const matrix = await service.getMatrix('user-1');
    expect(matrix).toEqual(DEFAULT_HITL_MATRIX);
  });

  it('returns stored matrix from Redis', async () => {
    const custom: HitlMatrix = {
      read: {
        low: 'auto-approve',
        medium: 'auto-approve',
        high: 'auto-approve'
      },
      analysis: {
        low: 'auto-approve',
        medium: 'auto-approve',
        high: 'confirm'
      },
      write: { low: 'auto-approve', medium: 'confirm', high: 'confirm' }
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(custom));
    const matrix = await service.getMatrix('user-2');
    expect(matrix).toEqual(custom);
  });

  it('returns default on invalid JSON', async () => {
    mockRedis.get.mockResolvedValue('not-json');
    const matrix = await service.getMatrix('user-3');
    expect(matrix).toEqual(DEFAULT_HITL_MATRIX);
  });

  it('stores matrix with 30-day TTL', async () => {
    const matrix = DEFAULT_HITL_MATRIX;
    await service.setMatrix('user-4', matrix);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'hitl:matrix:user-4',
      JSON.stringify(matrix),
      'EX',
      2592000
    );
  });

  it('computes auto-approve set from matrix and tools', () => {
    const tools = [
      { name: 'portfolio_summary', category: 'read', consequenceLevel: 'low' },
      { name: 'create_order', category: 'write', consequenceLevel: 'high' },
      { name: 'analyze_risk', category: 'analysis', consequenceLevel: 'medium' }
    ] as ToolDefinition[];

    const approved = service.computeAutoApproveSet(DEFAULT_HITL_MATRIX, tools);

    expect(approved.has('portfolio_summary')).toBe(true); // read + low = auto-approve
    expect(approved.has('create_order')).toBe(false); // write + high = confirm
    expect(approved.has('analyze_risk')).toBe(true); // analysis + medium = auto-approve
  });

  it('returns empty set when all tools require confirmation', () => {
    const allConfirmMatrix: HitlMatrix = {
      read: { low: 'confirm', medium: 'confirm', high: 'confirm' },
      analysis: { low: 'confirm', medium: 'confirm', high: 'confirm' },
      write: { low: 'confirm', medium: 'confirm', high: 'confirm' }
    };
    const tools = [
      { name: 'tool_a', category: 'read', consequenceLevel: 'low' }
    ] as ToolDefinition[];

    const approved = service.computeAutoApproveSet(allConfirmMatrix, tools);
    expect(approved.size).toBe(0);
  });
});
