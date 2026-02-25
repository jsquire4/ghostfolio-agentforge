import { UserService } from '@ghostfolio/client/services/user/user.service';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { GfAgentChatPanelComponent } from './agent-chat-panel/agent-chat-panel.component';
import { GfAgentEvalPanelComponent } from './agent-eval-panel/agent-eval-panel.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [CommonModule, GfAgentChatPanelComponent, GfAgentEvalPanelComponent],
  selector: 'gf-agent-page',
  styleUrls: ['./agent-page.scss'],
  templateUrl: './agent-page.html'
})
export class GfAgentPageComponent implements OnInit, OnDestroy {
  public conversationId: string;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private userService: UserService
  ) {}

  public ngOnInit() {
    // NOTE: conversationId = user.id means one conversation per user.
    // Future: generate unique conversation IDs for multi-session support.
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.conversationId = state.user.id;
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }
}
