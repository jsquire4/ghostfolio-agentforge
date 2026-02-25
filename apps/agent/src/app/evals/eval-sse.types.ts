export type EvalSseEventType =
  | 'run_started'
  | 'case_result'
  | 'suite_complete'
  | 'run_complete'
  | 'run_error'
  | 'log';

export interface EvalSseEvent {
  type: EvalSseEventType;
  data: Record<string, unknown>;
}

export interface CaseResultData {
  caseId: string;
  description: string;
  passed: boolean;
  durationMs: number;
  tier: string;
  tokens?: number;
  estimatedCost?: number;
  ttftMs?: number;
  latencyMs?: number;
  error?: string;
  toolsCalled?: string[];
  difficulty?: string;
}

export interface SuiteCompleteData {
  tier: string;
  totalPassed: number;
  totalFailed: number;
  totalDurationMs: number;
  estimatedCost?: number;
}

export interface RunCompleteData {
  totalPassed: number;
  totalFailed: number;
  totalDurationMs: number;
  estimatedCost: number;
  reportUrl?: string;
}

export interface EvalCaseManifest {
  id: string;
  description: string;
  tier: string;
  difficulty?: string;
}

export interface RunStartedData {
  runId: string;
  tier: string;
  tool?: string;
  startedAt: string;
  totalCases: number;
  cases: EvalCaseManifest[];
}
