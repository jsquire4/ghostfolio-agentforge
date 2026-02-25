import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface EvalRunStatus {
  isRunning: boolean;
  runId?: string;
  startedAt?: string;
  tier?: string;
  tool?: string;
}

export interface EvalRunRecord {
  id: string;
  gitSha: string;
  tier: 'golden' | 'labeled';
  totalPassed: number;
  totalFailed: number;
  passRate: number;
  totalDurationMs: number;
  estimatedCost?: number;
  runAt: string;
}

export interface StartRunResponse {
  runId: string;
  status: string;
}

// TODO: Replace hardcoded localhost:8000 with environment-injectable config
// when deploying beyond local development.
const AGENT_BASE = 'http://localhost:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class AgentEvalService {
  public constructor(private http: HttpClient) {}

  public startRun(tier?: string, tool?: string): Observable<StartRunResponse> {
    return this.http.post<StartRunResponse>(`${AGENT_BASE}/evals/run`, {
      tier,
      tool
    });
  }

  public getStatus(): Observable<EvalRunStatus> {
    return this.http.get<EvalRunStatus>(`${AGENT_BASE}/evals/status`);
  }

  public getResults(limit = 20, offset = 0): Observable<EvalRunRecord[]> {
    return this.http.get<EvalRunRecord[]>(`${AGENT_BASE}/evals/results`, {
      params: { limit: limit.toString(), offset: offset.toString() }
    });
  }
}
