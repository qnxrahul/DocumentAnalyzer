import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class StateService {
  private readonly http = inject(HttpClient);

  getState() {
    return this.http.get<{ state: any; tenantId: string; sessionId: string }>(`/api/state`);
  }

  patchState(patch: any) {
    return this.http.post<{ ok: boolean; state: any }>(`/api/state/patch`, { patch });
  }
}

