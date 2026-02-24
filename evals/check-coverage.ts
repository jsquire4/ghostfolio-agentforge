import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const toolsDir = resolve(process.cwd(), 'apps/agent/src/app/tools');
const evalsDir = resolve(process.cwd(), 'evals/dataset');

const toolFiles = readdirSync(toolsDir).filter((f) => f.endsWith('.tool.ts'));
const missing: string[] = [];

for (const file of toolFiles) {
  const toolName = file.replace('.tool.ts', '').replace(/-/g, '_');
  const evalFile = join(evalsDir, `eval-${toolName.replace(/_/g, '-')}.json`);
  if (!existsSync(evalFile)) missing.push(`  ${toolName} → ${evalFile}`);
}

if (missing.length > 0) {
  console.error('Missing eval coverage for:\n' + missing.join('\n'));
  process.exit(1);
}
console.log(`All ${toolFiles.length} tools have eval coverage.`);
