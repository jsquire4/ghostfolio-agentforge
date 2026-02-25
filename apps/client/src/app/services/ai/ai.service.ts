import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface ChatMessage {
  content: string;
  role: 'agent' | 'user';
}

export interface ChatResponse {
  conversationId: string;
  message: string;
}

// TODO: Replace hardcoded localhost:8000 with environment-injectable config
// when deploying beyond local development.
@Injectable({ providedIn: 'root' })
export class AiService {
  public constructor(private http: HttpClient) {}

  public chat(
    message: string,
    conversationId: string,
    channel = 'web-chat'
  ): Observable<ChatResponse> {
    return this.http.post<ChatResponse>('http://localhost:8000/api/v1/chat', {
      conversationId,
      message,
      channel
    });
  }
}
