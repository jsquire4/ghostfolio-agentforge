import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const toolsDir = resolve(process.cwd(), 'apps/agent/src/app/tools');
const goldenDir = resolve(process.cwd(), 'evals/dataset/golden');
const labeledDir = resolve(process.cwd(), 'evals/dataset/labeled');

const toolFiles = readdirSync(toolsDir).filter((f) => f.endsWith('.tool.ts'));
const missingGolden: string[] = [];
const missingLabeled: string[] = [];

for (const file of toolFiles) {
  const toolName = file.replace('.tool.ts', '');
  const evalFileName = `${toolName}.eval.json`;

  const goldenPath = join(goldenDir, evalFileName);
  if (!existsSync(goldenPath)) {
    missingGolden.push(`  ${toolName} → ${goldenPath}`);
  }

  const labeledPath = join(labeledDir, evalFileName);
  if (!existsSync(labeledPath)) {
    missingLabeled.push(`  ${toolName} → ${labeledPath}`);
  }
}

const hasErrors = missingGolden.length > 0 || missingLabeled.length > 0;

if (missingGolden.length > 0) {
  console.error('Missing golden eval coverage for:\n' + missingGolden.join('\n'));
}
if (missingLabeled.length > 0) {
  console.error('Missing labeled eval coverage for:\n' + missingLabeled.join('\n'));
}

if (hasErrors) {
  console.error(
    '\nRun the eval factory to generate missing eval files, or create them manually in evals/dataset/'
  );
  process.exit(1);
}

console.log(
  `All ${toolFiles.length} tool(s) have eval coverage (golden + labeled).`
);
