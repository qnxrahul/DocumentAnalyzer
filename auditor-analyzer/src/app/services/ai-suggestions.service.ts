import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AgentMessage } from '../constants';

@Injectable({ providedIn: 'root' })
export class AiSuggestionsService {
  private readonly http = inject(HttpClient);

  analyze(messages: AgentMessage[]) {
    return this.http.post<{ newMessages: AgentMessage[] }>(`/api/agent`, { messages });
  }
}

