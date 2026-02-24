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
      parameters: zodToJsonSchema(def.schema) as Record<string, unknown>,
      category: def.category,
      requiresConfirmation: def.requiresConfirmation
    }));
  }
}
