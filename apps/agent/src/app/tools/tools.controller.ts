import { Controller, Get } from '@nestjs/common';

export interface ToolMetadata {
  description: string;
  name: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
}

@Controller('v1/tools')
export class ToolsController {
  @Get()
  public getTools(): ToolMetadata[] {
    // TODO: Return registered tool registry metadata
    return [];
  }
}
