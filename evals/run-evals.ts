import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

interface EvalCase {
  id: string;
  input: { message: string; userId: string };
  expectedToolCalls?: string[];
  passCriteria: string[];
  setup?: string;
}

const datasetDir = resolve(process.cwd(), 'evals/dataset');

async function runEvals(): Promise<void> {
  const files = readdirSync(datasetDir).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} eval file(s) in ${datasetDir}`);

  for (const file of files) {
    const cases: EvalCase[] = JSON.parse(
      readFileSync(join(datasetDir, file), 'utf-8')
    );
    console.log(`\n--- ${file} (${cases.length} case(s)) ---`);
    for (const evalCase of cases) {
      console.log(
        `  [${evalCase.id}] ${evalCase.passCriteria[0] ?? '(no criteria)'}`
      );
      // TODO: Wire to LangSmith evaluate() when ready
    }
  }

  console.log(
    '\nEval scaffold complete. Wire to LangSmith for live evaluation.'
  );
}

runEvals().catch(console.error);
