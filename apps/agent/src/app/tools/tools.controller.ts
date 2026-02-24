import { Controller, Get } from '@nestjs/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { Public } from '../common/decorators/public.decorator';
import { ToolRegistryService } from './tool-registry.service';

interface ToolMetadata {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  category: string;
  requiresConfirmation: boolean;
}

@Public()
@Controller('v1/tools')
export class ToolsController {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  @Get()
  public getTools(): ToolMetadata[] {
    return this.toolRegistry.getAll().map((def) => ({
      name: def.name,
      description: def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zodToJsonSchema causes TS2589 in test env
      parameters: zodToJsonSchema(def.schema as any) as Record<string, unknown>,
      category: def.category,
      requiresConfirmation: def.requiresConfirmation
    }));
  }
}
