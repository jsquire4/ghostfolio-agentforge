import { z } from 'zod';

import { ToolRegistryService } from './tool-registry.service';

const validTool = {
  name: 'test_tool',
  description: 'A test tool',
  execute: async () => ({
    tool: 'test_tool',
    fetchedAt: new Date().toISOString(),
    data: {}
  }),
  schema: z.object({}),
  category: 'read' as const,
  requiresConfirmation: false,
  timeout: 5000
};

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;

  beforeEach(() => {
    service = new ToolRegistryService();
  });

  it('registers and retrieves tools', () => {
    service.register(validTool);
    const all = service.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('test_tool');
  });

  it('throws when name is missing', () => {
    expect(() =>
      service.register({
        ...validTool,
        name: ''
      } as any)
    ).toThrow('missing required field');
  });

  it('throws with "unnamed" when name is null', () => {
    expect(() =>
      service.register({
        ...validTool,
        name: null,
        description: null
      } as any)
    ).toThrow('unnamed');
  });

  it('throws when name is not snake_case', () => {
    expect(() =>
      service.register({
        ...validTool,
        name: 'InvalidName'
      } as any)
    ).toThrow('name must be snake_case');
  });

  it('throws when duplicate name', () => {
    service.register(validTool);
    expect(() =>
      service.register({ ...validTool, schema: z.object({ x: z.string() }) })
    ).toThrow('already registered');
  });
});
