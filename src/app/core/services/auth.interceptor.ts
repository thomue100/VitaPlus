import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SitzungService } from './sitzung.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sitzung = inject(SitzungService);
  const router = inject(Router);
  const token = sitzung.token;
  const anfrage = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  if (token && !req.url.includes('/auth/') && !req.url.includes('/api/takt') && !req.url.includes('/api/demo/')) sitzung.aktivitaet();
  return next(anfrage).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401 && e.error?.code === 'SITZUNG_ABGELAUFEN' && sitzung.angemeldet()) {
        sitzung.lokalBeenden();
        router.navigate(['/anmelden'], { queryParams: { grund: 'timeout' } });
      }
      return throwError(() => e);
    }),
  );
};

export function fehlertext(e: unknown, standard = 'Die Aktion konnte nicht ausgeführt werden.'): string {
  const err = e as HttpErrorResponse;
  return err?.error?.meldung || standard;
}
