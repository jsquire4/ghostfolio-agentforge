// Regression detection — compares current eval run against previous run.
import { EvalCaseResultRecord } from '@ghostfolio/agent/app/common/storage.types';

export interface RegressionReport {
  newlyFailing: { caseId: string; error: string }[];
  newlyPassing: { caseId: string }[];
  latencyRegressions: {
    caseId: string;
    previousMs: number;
    currentMs: number;
  }[];
  passRateDelta: number; // e.g. -0.2 means 20% worse
}

export function detectRegressions(
  currentCases: EvalCaseResultRecord[],
  previousCases: EvalCaseResultRecord[],
  latencyThreshold = 1.5
): RegressionReport {
  const prevMap = new Map<string, EvalCaseResultRecord>();
  for (const c of previousCases) {
    prevMap.set(c.caseId, c);
  }

  const newlyFailing: RegressionReport['newlyFailing'] = [];
  const newlyPassing: RegressionReport['newlyPassing'] = [];
  const latencyRegressions: RegressionReport['latencyRegressions'] = [];

  const currentPassed = currentCases.filter((c) => c.passed).length;
  const previousPassed = previousCases.filter((c) => c.passed).length;

  const currentTotal = currentCases.length || 1;
  const previousTotal = previousCases.length || 1;

  const passRateDelta =
    currentPassed / currentTotal - previousPassed / previousTotal;

  for (const curr of currentCases) {
    const prev = prevMap.get(curr.caseId);
    if (!prev) continue; // new case, no comparison

    if (!curr.passed && prev.passed) {
      newlyFailing.push({
        caseId: curr.caseId,
        error: curr.error || 'unknown'
      });
    }

    if (curr.passed && !prev.passed) {
      newlyPassing.push({ caseId: curr.caseId });
    }

    if (
      curr.passed &&
      prev.durationMs > 0 &&
      curr.durationMs > prev.durationMs * latencyThreshold
    ) {
      latencyRegressions.push({
        caseId: curr.caseId,
        previousMs: prev.durationMs,
        currentMs: curr.durationMs
      });
    }
  }

  return { newlyFailing, newlyPassing, latencyRegressions, passRateDelta };
}
