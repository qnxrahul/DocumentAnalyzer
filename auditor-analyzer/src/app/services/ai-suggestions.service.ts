import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { AgentMessage } from '../constants';
import { AguiService } from './agui.service';

@Injectable({ providedIn: 'root' })
export class AiSuggestionsService {
  constructor(private readonly agui: AguiService) {}

  analyze(messages: AgentMessage[]): Observable<{ newMessages: AgentMessage[] }> {
    return from(this.agui.runAgent(messages));
  }
}

