import { GF_ENVIRONMENT, GfEnvironment } from '@ghostfolio/ui/environment';

import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class AgentEvalService {
  private agentBase: string;

  public constructor(
    @Inject(GF_ENVIRONMENT) private environment: GfEnvironment,
    private http: HttpClient
  ) {
    this.agentBase = `${this.environment.agentUrl}/v1`;
  }

  public startRun(tier?: string, tool?: string): Observable<StartRunResponse> {
    return this.http.post<StartRunResponse>(`${this.agentBase}/evals/run`, {
      tier,
      tool
    });
  }

  public getStatus(): Observable<EvalRunStatus> {
    return this.http.get<EvalRunStatus>(`${this.agentBase}/evals/status`);
  }

  public getResults(limit = 20, offset = 0): Observable<EvalRunRecord[]> {
    return this.http.get<EvalRunRecord[]>(`${this.agentBase}/evals/results`, {
      params: { limit: limit.toString(), offset: offset.toString() }
    });
  }
}
