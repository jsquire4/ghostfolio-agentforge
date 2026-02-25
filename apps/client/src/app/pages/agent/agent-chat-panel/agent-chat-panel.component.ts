import {
  AiService,
  ChatMessage
} from '@ghostfolio/client/services/ai/ai.service';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  selector: 'gf-agent-chat-panel',
  styleUrls: ['./agent-chat-panel.component.scss'],
  templateUrl: './agent-chat-panel.component.html'
})
export class GfAgentChatPanelComponent implements OnDestroy {
  @Input() conversationId: string;
  @ViewChild('messageList') messageListElement: ElementRef;

  public messages: ChatMessage[] = [];
  public inputText = '';
  public isLoading = false;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private aiService: AiService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  public onSend() {
    const text = this.inputText.trim();

    if (!text || this.isLoading) {
      return;
    }

    this.messages.push({ content: text, role: 'user' });
    this.inputText = '';
    this.isLoading = true;
    this.changeDetectorRef.markForCheck();
    this.scrollToBottom();

    this.aiService
      .chat(text, this.conversationId)
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: (response) => {
          this.messages.push({ content: response.message, role: 'agent' });
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
          this.scrollToBottom();
        },
        error: () => {
          this.messages.push({
            content: 'Sorry, something went wrong. Please try again.',
            role: 'agent'
          });
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
          this.scrollToBottom();
        }
      });
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.messageListElement?.nativeElement) {
        this.messageListElement.nativeElement.scrollTop =
          this.messageListElement.nativeElement.scrollHeight;
      }
    }, 0);
  }
}
