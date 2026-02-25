import { TokenStorageService } from '@ghostfolio/client/services/token-storage.service';

import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

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

// TODO: Replace hardcoded localhost:8000 with environment-injectable config
// when deploying beyond local development.
const AGENT_SSE_URL = 'http://localhost:8000/api/v1/evals/stream';

@Injectable({ providedIn: 'root' })
export class EvalSseService implements OnDestroy {
  public events$ = new Subject<EvalSseEvent>();

  private eventSource: EventSource | null = null;
  private retryCount = 0;
  private maxRetries = 3;

  public constructor(private tokenStorage: TokenStorageService) {}

  public connect(): void {
    this.disconnect();
    this.retryCount = 0;
    this._openConnection();
  }

  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  public ngOnDestroy(): void {
    this.disconnect();
    this.events$.complete();
  }

  private _openConnection(): void {
    const token = this.tokenStorage.getToken();
    const url = token
      ? `${AGENT_SSE_URL}?token=${encodeURIComponent(token)}`
      : AGENT_SSE_URL;

    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as EvalSseEvent;
        this.retryCount = 0; // Reset on successful message
        this.events$.next(parsed);
      } catch {
        // Ignore unparseable messages
      }
    };

    this.eventSource.onerror = () => {
      this.disconnect();

      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(
          () => this._openConnection(),
          1000 * Math.pow(2, this.retryCount)
        );
      } else {
        this.events$.next({
          type: 'run_error',
          data: { error: 'SSE connection lost after retries' }
        });
      }
    };
  }
}
