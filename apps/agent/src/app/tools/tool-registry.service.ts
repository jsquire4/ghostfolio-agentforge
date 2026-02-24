import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import { ToolDefinition, ToolContext } from '../common/interfaces';

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

  toLangChainTools(context: ToolContext) {
    return this.getAll().map((def) => {
      return tool(
        async (params: unknown) => {
          try {
            return await def.execute(params, context);
          } catch (err) {
            return JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              tool: def.name
            });
          }
        },
        {
          name: def.name,
          description: def.description,
          schema: def.schema
        }
      );
    });
  }
}
