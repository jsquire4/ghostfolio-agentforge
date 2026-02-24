// NEVER edit this file manually — ALL_TOOLS is derived from tools.exports.ts.
import { ToolDefinition } from '../common/interfaces';
import * as toolExports from './tools.exports';

export * from './tools.exports';
export const ALL_TOOLS: ToolDefinition[] = Object.values(
  toolExports
) as ToolDefinition[];
