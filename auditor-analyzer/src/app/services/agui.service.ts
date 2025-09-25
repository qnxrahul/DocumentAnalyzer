import { Injectable } from '@angular/core';
import { AGUI_API_URL, AgentMessage } from '../constants';
import { TokenService } from './token.service';

// Lazy import type to avoid bundling issues if not used at runtime
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { HttpAgent } from '@ag-ui/client';

@Injectable({ providedIn: 'root' })
export class AguiService {
  private agent: any | null = null;

  constructor(private readonly tokenService: TokenService) {}

  private ensureAgent(): any {
    if (this.agent) return this.agent;
    this.agent = new HttpAgent({
      url: AGUI_API_URL,
      headers: this.buildHeaders()
    });
    return this.agent;
  }

  private buildHeaders(): Record<string, string> {
    const token = this.tokenService.getToken();
    const sessionId = this.tokenService.getSessionId();
    const headers: Record<string, string> = { 'X-Session-Id': sessionId };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async runAgent(messages: AgentMessage[]): Promise<any> {
    const agent = this.ensureAgent();
    const result = await agent.runAgent({ messages });
    return result;
  }
}

