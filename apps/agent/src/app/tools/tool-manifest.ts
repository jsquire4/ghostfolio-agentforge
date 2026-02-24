import { ToolDeps, ToolDefinition } from '../common/interfaces';
import { portfolioSummaryTool } from './portfolio-summary.tool';

export function getToolManifest(deps: ToolDeps): ToolDefinition[] {
  return [
    portfolioSummaryTool(deps)
    // new tools added here — import above, add to array, done
  ];
}
