import { Injectable } from '@nestjs/common';

import { ToolDefinition } from '../common/interfaces';

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" is already registered`);
    }
    this.tools.set(def.name, def);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
