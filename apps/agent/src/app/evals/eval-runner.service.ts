import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy
} from '@nestjs/common';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { Subject } from 'rxjs';

import { EvalCaseResultRecord, EvalRunRecord } from '../common/storage.types';
import { EvalsRepository } from '../database/evals.repository';
import { EvalSseEvent } from './eval-sse.types';
import { EvalSuiteResult } from './eval.types';
import { listCases, runEvals } from './in-process-runner';

const EVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SSE_SUBSCRIBERS = 10;

interface RunState {
  runId: string;
  tier: string;
  tool?: string;
  startedAt: Date;
  abortController: AbortController;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

@Injectable()
export class EvalRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(EvalRunnerService.name);
  private readonly events$ = new Subject<EvalSseEvent>();
  private activeRun: RunState | null = null;
  private subscriberCount = 0;

  constructor(private readonly evalsRepo: EvalsRepository) {}

  onModuleDestroy() {
    if (this.activeRun) {
      clearTimeout(this.activeRun.timeoutHandle);
      this.activeRun.abortController.abort();
    }
    this.events$.complete();
  }

  public startRun(
    tier: string = 'all',
    tool?: string
  ): { runId: string; status: string } {
    if (this.activeRun) {
      throw new ConflictException(
        `Eval run already in progress (${this.activeRun.runId})`
      );
    }

    const runId = randomUUID();
    const abortController = new AbortController();

    const timeoutHandle = setTimeout(() => {
      if (this.activeRun) {
        this.logger.warn(
          `Eval run ${runId} timed out after 10 minutes — aborting`
        );
        this.activeRun.abortController.abort();
        this.events$.next({
          type: 'run_error',
          data: { runId, error: 'Eval timed out after 10 minutes' }
        });
        this.activeRun = null;
      }
    }, EVAL_TIMEOUT_MS);

    this.activeRun = {
      runId,
      tier,
      tool,
      startedAt: new Date(),
      abortController,
      timeoutHandle
    };

    this.logger.log(
      `Starting in-process eval run ${runId}: tier=${tier}, tool=${tool ?? 'all'}`
    );

    const cases = listCases(tier, tool);
    const totalCases = cases.length;

    this.events$.next({
      type: 'run_started',
      data: {
        runId,
        tier,
        tool,
        totalCases,
        cases,
        startedAt: this.activeRun.startedAt.toISOString()
      }
    });

    // Run async — don't block the HTTP response
    this.executeRun(runId, tier, tool, abortController.signal).catch((err) => {
      this.logger.error(`Eval run ${runId} failed: ${err.message}`);
    });

    return { runId, status: 'started' };
  }

  public getEventStream(): Subject<EvalSseEvent> {
    if (this.subscriberCount >= MAX_SSE_SUBSCRIBERS) {
      throw new ConflictException(
        `Maximum SSE connections (${MAX_SSE_SUBSCRIBERS}) reached`
      );
    }
    this.subscriberCount++;
    return this.events$;
  }

  public releaseSubscriber(): void {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);
  }

  public getStatus(): {
    isRunning: boolean;
    startedAt?: string;
    tier?: string;
    tool?: string;
    runId?: string;
  } {
    if (!this.activeRun) {
      return { isRunning: false };
    }
    return {
      isRunning: true,
      runId: this.activeRun.runId,
      startedAt: this.activeRun.startedAt.toISOString(),
      tier: this.activeRun.tier,
      tool: this.activeRun.tool
    };
  }

  // ── Private ─────────────────────────────────────────────────

  private async executeRun(
    originalRunId: string,
    tier: string,
    tool: string | undefined,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const suites = await runEvals(tier, tool, (event) => {
        if (!signal.aborted) {
          this.events$.next(event);
        }
      });

      if (signal.aborted) return;

      const gitSha = this.getGitSha();
      let suiteRunId = originalRunId;
      let totalPassed = 0;
      let totalFailed = 0;
      let totalDurationMs = 0;
      let totalEstimatedCost = 0;

      // Persist each suite and emit suite_complete
      for (const suite of suites) {
        const { run, cases } = this.suiteToRecords(suite, suiteRunId, gitSha);
        this.evalsRepo.insertRun(run);
        this.evalsRepo.insertCaseResults(cases);

        totalPassed += suite.totalPassed;
        totalFailed += suite.totalFailed;
        totalDurationMs += suite.totalDurationMs;
        totalEstimatedCost += suite.estimatedCost ?? 0;

        this.events$.next({
          type: 'suite_complete',
          data: {
            tier: suite.tier,
            totalPassed: suite.totalPassed,
            totalFailed: suite.totalFailed,
            totalDurationMs: suite.totalDurationMs,
            estimatedCost: suite.estimatedCost
          }
        });

        // Use a unique runId per suite when running 'all'
        if (suites.length > 1) {
          suiteRunId = randomUUID();
        }
      }

      this.events$.next({
        type: 'run_complete',
        data: {
          totalPassed,
          totalFailed,
          totalDurationMs,
          estimatedCost: totalEstimatedCost
        }
      });

      this.logger.log(
        `Eval run complete: ${totalPassed} passed, ${totalFailed} failed`
      );
    } catch (err) {
      if (!signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        this.events$.next({
          type: 'run_error',
          data: { runId: originalRunId, error: message }
        });
        this.logger.error(`Eval run ${originalRunId} error: ${message}`);
      }
    } finally {
      clearTimeout(this.activeRun?.timeoutHandle);
      this.activeRun = null;
    }
  }

  private suiteToRecords(
    suite: EvalSuiteResult,
    runId: string,
    gitSha: string
  ): { run: EvalRunRecord; cases: EvalCaseResultRecord[] } {
    const total = suite.totalPassed + suite.totalFailed;
    const run: EvalRunRecord = {
      id: runId,
      gitSha,
      tier: suite.tier,
      totalPassed: suite.totalPassed,
      totalFailed: suite.totalFailed,
      passRate: total > 0 ? suite.totalPassed / total : 0,
      totalDurationMs: suite.totalDurationMs,
      estimatedCost: suite.estimatedCost,
      runAt: new Date().toISOString()
    };

    const cases: EvalCaseResultRecord[] = suite.cases.map((c) => ({
      id: randomUUID(),
      runId,
      caseId: c.id,
      passed: c.passed,
      durationMs: c.durationMs,
      error: c.error,
      details: c.details
    }));

    return { run, cases };
  }

  private getGitSha(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return process.env.GIT_SHA || 'unknown';
    }
  }
}
