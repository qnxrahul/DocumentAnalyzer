import { Injectable } from '@angular/core';
import { SESSION_ID_STORAGE_KEY, TOKEN_STORAGE_KEY } from '../constants';

@Injectable({ providedIn: 'root' })
export class TokenService {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  setToken(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
      else localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
  }

  getSessionId(): string {
    try {
      const existing = localStorage.getItem(SESSION_ID_STORAGE_KEY);
      if (existing) return existing;
      const generated = crypto.randomUUID();
      localStorage.setItem(SESSION_ID_STORAGE_KEY, generated);
      return generated;
    } catch {
      return 'session-' + Math.random().toString(36).slice(2);
    }
  }
}

