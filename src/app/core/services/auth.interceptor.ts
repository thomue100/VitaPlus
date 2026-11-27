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

/** Meldungstext aus einer Fehlerantwort (Problem Details nach RFC 9457: `detail`). */
export function fehlertext(e: unknown, standard = 'Die Aktion konnte nicht ausgeführt werden.'): string {
  const err = e as HttpErrorResponse;
  if (err?.status === 0) return 'Der Dienst ist gerade nicht erreichbar. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es in einigen Minuten erneut.';
  return err?.error?.detail || err?.error?.meldung || standard;
}
