import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy
} from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Subject } from 'rxjs';

import { EvalSseEvent } from './eval-sse.types';

const EVAL_JSON_PREFIX = 'EVAL_JSON:';
const EVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SSE_SUBSCRIBERS = 10;

interface RunState {
  runId: string;
  tier: string;
  tool?: string;
  startedAt: Date;
  process: ChildProcess;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

@Injectable()
export class EvalRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(EvalRunnerService.name);
  private readonly events$ = new Subject<EvalSseEvent>();
  private activeRun: RunState | null = null;
  private subscriberCount = 0;

  onModuleDestroy() {
    if (this.activeRun?.process) {
      clearTimeout(this.activeRun.timeoutHandle);
      this.activeRun.process.kill('SIGTERM');
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
    const repoRoot = this.findRepoRoot();

    const args = ['run', 'eval', '--', tier, '--report'];
    if (tool) {
      args.push('--tool', tool);
    }

    this.logger.log(
      `Starting eval run ${runId}: npm ${args.join(' ')} in ${repoRoot}`
    );

    const child = spawn('npm', args, {
      cwd: repoRoot,
      env: { ...process.env, EVAL_SSE_MODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Watchdog: kill eval after 10 minutes
    const timeoutHandle = setTimeout(() => {
      if (this.activeRun?.process) {
        this.logger.warn(
          `Eval run ${runId} timed out after 10 minutes — killing`
        );
        this.activeRun.process.kill('SIGTERM');
        this.events$.next({
          type: 'run_error',
          data: { runId, error: 'Eval timed out after 10 minutes' }
        });
      }
    }, EVAL_TIMEOUT_MS);

    this.activeRun = {
      runId,
      tier,
      tool,
      startedAt: new Date(),
      process: child,
      timeoutHandle
    };

    this.events$.next({
      type: 'run_started',
      data: {
        runId,
        tier,
        tool,
        startedAt: this.activeRun.startedAt.toISOString()
      }
    });

    let stdoutBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      // Keep incomplete last line in buffer
      stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith(EVAL_JSON_PREFIX)) {
          try {
            const event = JSON.parse(
              line.slice(EVAL_JSON_PREFIX.length)
            ) as EvalSseEvent;
            this.events$.next(event);
          } catch (err) {
            this.logger.warn(`Failed to parse SSE event: ${line}`);
          }
        } else if (line.trim()) {
          this.events$.next({ type: 'log', data: { message: line } });
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) {
        this.events$.next({ type: 'log', data: { message, stream: 'stderr' } });
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);

      // Flush remaining buffer
      if (stdoutBuffer.trim()) {
        if (stdoutBuffer.startsWith(EVAL_JSON_PREFIX)) {
          try {
            const event = JSON.parse(
              stdoutBuffer.slice(EVAL_JSON_PREFIX.length)
            ) as EvalSseEvent;
            this.events$.next(event);
          } catch {
            this.events$.next({
              type: 'log',
              data: { message: stdoutBuffer }
            });
          }
        } else {
          this.events$.next({
            type: 'log',
            data: { message: stdoutBuffer }
          });
        }
      }

      if (code !== 0 && code !== null) {
        this.events$.next({
          type: 'run_error',
          data: { runId, error: `Process exited with code ${code}` }
        });
      }

      this.logger.log(`Eval run ${runId} finished with code ${code}`);
      this.activeRun = null;
    });

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      this.events$.next({
        type: 'run_error',
        data: { runId, error: err.message }
      });
      this.activeRun = null;
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

  private findRepoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      if (existsSync(resolve(dir, 'package.json'))) {
        return dir;
      }
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
    // Fallback to cwd
    return process.cwd();
  }
}
