import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '../services/token.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const token = tokenService.getToken();
  const sessionId = tokenService.getSessionId();

  const setHeaders: Record<string, string> = {
    'X-Session-Id': sessionId,
    'X-Tenant-Id': localStorage.getItem('TENANT_ID') || 'public'
  };
  if (token) setHeaders['Authorization'] = `Bearer ${token}`;

  const cloned = req.clone({ setHeaders });
  return next(cloned);
};

