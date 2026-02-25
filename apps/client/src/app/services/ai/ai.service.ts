import { GF_ENVIRONMENT, GfEnvironment } from '@ghostfolio/ui/environment';

import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface ChatMessage {
  content: string;
  role: 'agent' | 'user';
}

export interface ChatResponse {
  conversationId: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  public constructor(
    @Inject(GF_ENVIRONMENT) private environment: GfEnvironment,
    private http: HttpClient
  ) {}

  public chat(
    message: string,
    conversationId: string,
    channel = 'web-chat'
  ): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(
      `${this.environment.agentUrl}/v1/chat`,
      { conversationId, message, channel }
    );
  }
}
