import { Test } from '@nestjs/testing';
import { z } from 'zod';

import { ToolRegistryService } from './tool-registry.service';
import { ToolsController } from './tools.controller';

describe('ToolsController', () => {
  let controller: ToolsController;
  let mockRegistry: { getAll: jest.Mock };

  beforeEach(async () => {
    mockRegistry = { getAll: jest.fn().mockReturnValue([]) };

    const module = await Test.createTestingModule({
      controllers: [ToolsController],
      providers: [{ provide: ToolRegistryService, useValue: mockRegistry }]
    }).compile();

    controller = module.get(ToolsController);
  });

  it('returns empty array when registry has no tools', () => {
    expect(controller.getTools()).toEqual([]);
  });

  it('transforms tool definitions through zodToJsonSchema', () => {
    mockRegistry.getAll.mockReturnValue([
      {
        name: 'test_tool',
        description: 'A test tool',
        schema: z.object({ query: z.string() }),
        category: 'read',
        requiresConfirmation: false
      }
    ]);

    const tools = controller.getTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');
    expect(tools[0].description).toBe('A test tool');
    expect(tools[0].category).toBe('read');
    expect(tools[0].requiresConfirmation).toBe(false);
    expect(tools[0].parameters).toBeDefined();
    expect(tools[0].parameters).toHaveProperty('properties');
  });

  it('maps all required fields for each tool', () => {
    mockRegistry.getAll.mockReturnValue([
      {
        name: 'tool_a',
        description: 'Tool A',
        schema: z.object({}),
        category: 'write',
        requiresConfirmation: true
      },
      {
        name: 'tool_b',
        description: 'Tool B',
        schema: z.object({}),
        category: 'analysis',
        requiresConfirmation: false
      }
    ]);

    const tools = controller.getTools();

    expect(tools).toHaveLength(2);
    tools.forEach((t: any) => {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('parameters');
      expect(t).toHaveProperty('category');
      expect(t).toHaveProperty('requiresConfirmation');
    });
  });
});
