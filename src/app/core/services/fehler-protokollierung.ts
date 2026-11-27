import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Meldet unerwartete Frontend-Fehler an das Fehlerprotokoll des Backends. */
@Injectable()
export class FehlerProtokollierung implements ErrorHandler {
  private injector = inject(Injector);
  private letzte = '';

  handleError(error: any): void {
    console.error(error);
    const meldung = String(error?.message || error).substring(0, 300);
    if (meldung === this.letzte || error?.status) return;
    this.letzte = meldung;
    try {
      this.injector.get(HttpClient).post('/api/fehler', { meldung, stack: error?.stack, seite: location.pathname }).subscribe({ error: () => undefined });
    } catch {
      /* Protokollierung darf nie selbst scheitern */
    }
  }
}
