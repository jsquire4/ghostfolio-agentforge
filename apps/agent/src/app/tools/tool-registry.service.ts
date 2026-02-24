import { Injectable } from '@nestjs/common';

import { ToolDefinition } from '../common/interfaces';

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    if (!def.name || !def.description || !def.execute || !def.schema) {
      throw new Error(
        `Tool registration failed: missing required field(s) on "${def.name ?? 'unnamed'}"`
      );
    }
    if (!/^[a-z][a-z0-9_]*$/.test(def.name)) {
      throw new Error(
        `Tool "${def.name}": name must be snake_case (lowercase letters and underscores only)`
      );
    }
    if (this.tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" is already registered`);
    }
    this.tools.set(def.name, def);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
