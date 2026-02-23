import {
  AiService,
  ChatMessage
} from '@ghostfolio/client/services/ai/ai.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
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
  host: { class: 'page' },
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  selector: 'gf-ai-page',
  styleUrls: ['./ai-page.scss'],
  templateUrl: './ai-page.html'
})
export class GfAiPageComponent implements OnInit, OnDestroy {
  @ViewChild('messageList') messageListElement: ElementRef;

  public messages: ChatMessage[] = [];
  public inputText = '';
  public isLoading = false;

  private conversationId: string;
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private aiService: AiService,
    private changeDetectorRef: ChangeDetectorRef,
    private userService: UserService
  ) {}

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.conversationId = state.user.id;
          this.changeDetectorRef.markForCheck();
        }
      });
  }

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
