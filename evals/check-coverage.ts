import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const toolsDir = resolve(process.cwd(), 'apps/agent/src/app/tools');
const goldenDir = resolve(process.cwd(), 'evals/dataset/golden');
const labeledDir = resolve(process.cwd(), 'evals/dataset/labeled');
const overlapMapPath = resolve(process.cwd(), 'evals/tool-overlap-map.json');

// ── 1. File existence checks ────────────────────────────

const toolFiles = readdirSync(toolsDir).filter((f) => f.endsWith('.tool.ts'));
const missingGolden: string[] = [];
const missingLabeled: string[] = [];

for (const file of toolFiles) {
  const toolName = file.replace('.tool.ts', '');
  const evalFileName = `${toolName}.eval.json`;

  if (!existsSync(join(goldenDir, evalFileName))) {
    missingGolden.push(toolName);
  }
  if (!existsSync(join(labeledDir, evalFileName))) {
    missingLabeled.push(toolName);
  }
}

// ── 2. Overlap map coverage checks ─────────────────────

interface OverlapEntry {
  overlaps: string[];
  clusters: string[][];
  reason: string;
}

interface LabeledCase {
  id: string;
  difficulty: string;
  expect: {
    toolsCalled?: string[];
    toolsAcceptable?: string[][];
  };
}

const untestedOverlaps: string[] = [];
const untestedClusters: string[] = [];

if (existsSync(overlapMapPath)) {
  const overlapMap: Record<string, OverlapEntry> = JSON.parse(
    readFileSync(overlapMapPath, 'utf-8')
  );

  // Load all labeled eval cases
  const allLabeledCases: LabeledCase[] = [];
  if (existsSync(labeledDir)) {
    const labeledFiles = readdirSync(labeledDir).filter((f) =>
      f.endsWith('.eval.json')
    );
    for (const file of labeledFiles) {
      const cases: LabeledCase[] = JSON.parse(
        readFileSync(join(labeledDir, file), 'utf-8')
      );
      allLabeledCases.push(...cases);
    }
  }

  // Collect all tools referenced in labeled evals (per case)
  const caseToolSets: string[][] = allLabeledCases.map((c) => {
    const tools: string[] = [];
    if (c.expect.toolsCalled) tools.push(...c.expect.toolsCalled);
    if (c.expect.toolsAcceptable) {
      for (const set of c.expect.toolsAcceptable) {
        tools.push(...set);
      }
    }
    return [...new Set(tools)];
  });

  // Check each declared overlap has at least one labeled eval testing both tools
  for (const [toolName, entry] of Object.entries(overlapMap)) {
    for (const overlap of entry.overlaps) {
      const pairTested = caseToolSets.some(
        (tools) => tools.includes(toolName) && tools.includes(overlap)
      );
      if (!pairTested) {
        untestedOverlaps.push(`${toolName} ↔ ${overlap}`);
      }
    }

    // Check each declared cluster has at least one labeled eval exercising the full group
    for (const cluster of entry.clusters) {
      const clusterTested = caseToolSets.some((tools) =>
        cluster.every((member) => tools.includes(member))
      );
      if (!clusterTested) {
        untestedClusters.push(`[${cluster.join(', ')}]`);
      }
    }
  }

  // Dedupe symmetric overlaps (A↔B and B↔A)
  const seen = new Set<string>();
  const dedupedOverlaps: string[] = [];
  for (const pair of untestedOverlaps) {
    const [a, b] = pair.split(' ↔ ');
    const key = [a, b].sort().join('↔');
    if (!seen.has(key)) {
      seen.add(key);
      dedupedOverlaps.push(pair);
    }
  }

  // Replace with deduped
  untestedOverlaps.length = 0;
  untestedOverlaps.push(...dedupedOverlaps);
}

// ── 3. Report ───────────────────────────────────────────

console.log(`\n${BOLD} Eval Coverage Report${RESET}`);
console.log('\u2500'.repeat(61));

const totalTools = toolFiles.length;
console.log(`  ${CYAN}Tools in registry:${RESET} ${totalTools}`);

// (a) Missing golden files
if (missingGolden.length > 0) {
  console.log(`\n  ${RED}Missing golden evals:${RESET}`);
  for (const t of missingGolden) {
    console.log(`    ${RED}\u2717${RESET} ${t}`);
  }
} else {
  console.log(`  ${GREEN}\u2713${RESET} All tools have golden evals`);
}

// (b) Missing labeled files
if (missingLabeled.length > 0) {
  console.log(`\n  ${RED}Missing labeled evals:${RESET}`);
  for (const t of missingLabeled) {
    console.log(`    ${RED}\u2717${RESET} ${t}`);
  }
} else {
  console.log(`  ${GREEN}\u2713${RESET} All tools have labeled evals`);
}

// (c) Untested overlaps
if (untestedOverlaps.length > 0) {
  console.log(`\n  ${YELLOW}Declared overlaps with no labeled eval:${RESET}`);
  for (const pair of untestedOverlaps) {
    console.log(`    ${YELLOW}\u26A0${RESET}  ${pair}`);
  }
} else if (existsSync(overlapMapPath)) {
  console.log(`  ${GREEN}\u2713${RESET} All declared overlaps are tested`);
}

// (d) Untested clusters
if (untestedClusters.length > 0) {
  console.log(
    `\n  ${YELLOW}Declared clusters with no labeled eval exercising full group:${RESET}`
  );
  for (const cluster of untestedClusters) {
    console.log(`    ${YELLOW}\u26A0${RESET}  ${cluster}`);
  }
} else if (existsSync(overlapMapPath)) {
  console.log(`  ${GREEN}\u2713${RESET} All declared clusters are tested`);
}

if (!existsSync(overlapMapPath)) {
  console.log(
    `  ${DIM}No overlap map found at evals/tool-overlap-map.json — skipping overlap/cluster checks${RESET}`
  );
}

console.log('\u2500'.repeat(61));

// Exit code
const hasErrors =
  missingGolden.length > 0 ||
  missingLabeled.length > 0 ||
  untestedOverlaps.length > 0 ||
  untestedClusters.length > 0;

if (hasErrors) {
  console.log(
    `\n  ${RED}Coverage gaps found.${RESET} Run the eval factory to fill them.\n`
  );
  process.exit(1);
}

console.log(
  `\n  ${GREEN}Full coverage.${RESET} ${totalTools} tool(s), all evals present, all overlaps tested.\n`
);
