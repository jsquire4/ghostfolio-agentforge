import {
  AgentEvalService,
  EvalRunRecord
} from '@ghostfolio/client/services/agent/agent-eval.service';
import {
  EvalSseEvent,
  EvalSseService
} from '@ghostfolio/client/services/agent/eval-sse.service';
import { GF_ENVIRONMENT, GfEnvironment } from '@ghostfolio/ui/environment';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface LiveCaseResult {
  caseId: string;
  description: string;
  status: 'pending' | 'passed' | 'failed';
  durationMs: number;
  tier: string;
  tokens?: number;
  ttftMs?: number;
  latencyMs?: number;
  estimatedCost?: number;
  error?: string;
  toolsCalled?: string[];
  difficulty?: string;
}

interface BreakdownRow {
  label: string;
  passed: number;
  failed: number;
  total: number;
  passRate: number;
}

interface AggregateStats {
  totalTokens: number;
  totalCost: number;
  avgCost: number;
  avgLatency: number;
  avgTtft: number;
  totalElapsed: number;
  caseCount: number;
}

interface RunSummary {
  totalPassed: number;
  totalFailed: number;
  totalDurationMs: number;
  estimatedCost: number;
  reportUrl?: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressBarModule
  ],
  selector: 'gf-agent-eval-panel',
  styleUrls: ['./agent-eval-panel.component.scss'],
  templateUrl: './agent-eval-panel.component.html'
})
export class GfAgentEvalPanelComponent implements OnInit, OnDestroy {
  public selectedTier = 'all';
  public isRunning = false;
  public totalCases = 0;
  public liveResults: LiveCaseResult[] = [];
  public runSummary: RunSummary | null = null;
  public errorMessage: string | null = null;
  public historicalRuns: EvalRunRecord[] = [];
  public aggregateStats: AggregateStats = this.emptyStats();

  private runStartTime = 0;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private agentEvalService: AgentEvalService,
    private evalSseService: EvalSseService,
    private changeDetectorRef: ChangeDetectorRef,
    @Inject(GF_ENVIRONMENT) private environment: GfEnvironment
  ) {}

  public ngOnInit() {
    this.loadHistoricalRuns();

    this.evalSseService.events$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((event) => {
        this.handleSseEvent(event);
      });
  }

  public onRunEvals() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.totalCases = 0;
    this.liveResults = [];
    this.runSummary = null;
    this.errorMessage = null;
    this.aggregateStats = this.emptyStats();
    this.runStartTime = Date.now();
    this.changeDetectorRef.markForCheck();

    this.agentEvalService
      .startRun(this.selectedTier)
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: () => {
          this.evalSseService.connect();
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          this.isRunning = false;
          this.errorMessage =
            'Failed to start eval run. Check server logs for details.';
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public onTierChange(tier: string) {
    this.selectedTier = tier;
    this.changeDetectorRef.markForCheck();
  }

  public openReport(reportUrl: string) {
    if (!reportUrl.startsWith('/api/v1/evals/reports/')) {
      return;
    }
    const base = this.environment.agentUrl;
    window.open(base + reportUrl.replace(/^\/api/, ''), '_blank');
  }

  public formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  public formatCost(cost: number): string {
    if (!cost) return '$0.00';
    if (cost < 0.001) return `~$${cost.toFixed(4)}`;
    return `~$${cost.toFixed(3)}`;
  }

  public formatTokens(tokens: number): string {
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${tokens}`;
  }

  public ngOnDestroy() {
    this.evalSseService.disconnect();
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  public get progressPercent(): number {
    if (this.totalCases === 0) return 0;
    const completed = this.liveResults.filter(
      (r) => r.status !== 'pending'
    ).length;
    return (completed / this.totalCases) * 100;
  }

  public get completedCount(): number {
    return this.liveResults.filter((r) => r.status !== 'pending').length;
  }

  public get toolBreakdown(): BreakdownRow[] {
    const map = new Map<string, { passed: number; failed: number }>();
    for (const r of this.liveResults) {
      if (r.status === 'pending' || !r.toolsCalled) continue;
      for (const tool of r.toolsCalled) {
        const entry = map.get(tool) || { passed: 0, failed: 0 };
        if (r.status === 'passed') entry.passed++;
        else entry.failed++;
        map.set(tool, entry);
      }
    }
    return Array.from(map.entries())
      .map(([label, { passed, failed }]) => ({
        label,
        passed,
        failed,
        total: passed + failed,
        passRate: passed / (passed + failed)
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  public get difficultyBreakdown(): BreakdownRow[] {
    const map = new Map<string, { passed: number; failed: number }>();
    for (const r of this.liveResults) {
      if (r.status === 'pending' || !r.difficulty) continue;
      const entry = map.get(r.difficulty) || { passed: 0, failed: 0 };
      if (r.status === 'passed') entry.passed++;
      else entry.failed++;
      map.set(r.difficulty, entry);
    }
    return Array.from(map.entries())
      .map(([label, { passed, failed }]) => ({
        label,
        passed,
        failed,
        total: passed + failed,
        passRate: passed / (passed + failed)
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private handleSseEvent(event: EvalSseEvent) {
    switch (event.type) {
      case 'run_started': {
        this.totalCases = (event.data['totalCases'] as number) || 0;
        const cases = event.data['cases'] as
          | {
              id: string;
              description: string;
              tier: string;
              difficulty?: string;
            }[]
          | undefined;
        if (cases?.length) {
          this.liveResults = cases.map((c) => ({
            caseId: c.id,
            description: c.description,
            status: 'pending' as const,
            durationMs: 0,
            tier: c.tier,
            difficulty: c.difficulty
          }));
        }
        break;
      }

      case 'case_result': {
        const caseId = event.data['caseId'] as string;
        const idx = this.liveResults.findIndex((r) => r.caseId === caseId);
        const result: LiveCaseResult = {
          caseId,
          description: event.data['description'] as string,
          status: (event.data['passed'] as boolean) ? 'passed' : 'failed',
          durationMs: event.data['durationMs'] as number,
          tier: event.data['tier'] as string,
          tokens: event.data['tokens'] as number,
          ttftMs: event.data['ttftMs'] as number,
          latencyMs: event.data['latencyMs'] as number,
          estimatedCost: event.data['estimatedCost'] as number,
          error: event.data['error'] as string,
          toolsCalled: event.data['toolsCalled'] as string[],
          difficulty: event.data['difficulty'] as string
        };
        if (idx >= 0) {
          this.liveResults[idx] = result;
        } else {
          this.liveResults.push(result);
        }
        this.recomputeAggregateStats();
        break;
      }

      case 'run_complete':
        this.runSummary = {
          totalPassed: event.data['totalPassed'] as number,
          totalFailed: event.data['totalFailed'] as number,
          totalDurationMs: event.data['totalDurationMs'] as number,
          estimatedCost: event.data['estimatedCost'] as number,
          reportUrl: event.data['reportUrl'] as string
        };
        this.isRunning = false;
        this.evalSseService.disconnect();
        this.loadHistoricalRuns();
        break;

      case 'run_error':
        this.errorMessage = (event.data['error'] as string) || 'Run failed';
        this.isRunning = false;
        this.evalSseService.disconnect();
        break;
    }

    this.changeDetectorRef.markForCheck();
  }

  private emptyStats(): AggregateStats {
    return {
      totalTokens: 0,
      totalCost: 0,
      avgCost: 0,
      avgLatency: 0,
      avgTtft: 0,
      totalElapsed: 0,
      caseCount: 0
    };
  }

  private recomputeAggregateStats() {
    const results = this.liveResults.filter((r) => r.status !== 'pending');
    const count = results.length;
    if (count === 0) {
      this.aggregateStats = this.emptyStats();
      return;
    }

    const totalTokens = results.reduce((s, r) => s + (r.tokens || 0), 0);
    const totalCost = results.reduce((s, r) => s + (r.estimatedCost || 0), 0);

    const latencies = results.filter((r) => r.latencyMs != null);
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((s, r) => s + r.latencyMs!, 0) / latencies.length
        : 0;

    const ttfts = results.filter((r) => r.ttftMs != null);
    const avgTtft =
      ttfts.length > 0
        ? ttfts.reduce((s, r) => s + r.ttftMs!, 0) / ttfts.length
        : 0;

    this.aggregateStats = {
      totalTokens,
      totalCost,
      avgCost: totalCost / count,
      avgLatency,
      avgTtft,
      totalElapsed: Date.now() - this.runStartTime,
      caseCount: count
    };
  }

  private loadHistoricalRuns() {
    this.agentEvalService
      .getResults(10)
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: (runs) => {
          this.historicalRuns = runs ?? [];
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          // Silently fail — historical runs are non-critical
        }
      });
  }
}
