import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SESSION_TIMEOUT_MINUTEN } from '../konfiguration';
import { Benutzer } from '../models';

export type AngemeldeterBenutzer = Omit<Benutzer, 'passwort' | 'zweiFaktorCode' | 'fehlversuche'> & { bank?: Benutzer['bank'] & { ibanMaskiert?: string } };

export interface LoginAntwort {
  zweiFaktorErforderlich: boolean;
  token: string;
  ziel?: string;
  benutzer?: AngemeldeterBenutzer;
  letzterLogin?: string;
}

const TOKEN_KEY = 'vp_token';

@Injectable({ providedIn: 'root' })
export class SitzungService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly benutzer = signal<AngemeldeterBenutzer | null>(null);
  readonly angemeldet = computed(() => !!this.benutzer());
  readonly istSachbearbeitung = computed(() => this.benutzer()?.rolle === 'SACHBEARBEITER');
  readonly restSekunden = signal(SESSION_TIMEOUT_MINUTEN * 60);
  readonly letzterLogin = signal<string | undefined>(undefined);

  private letzteAktivitaet = Date.now();
  private timerId?: ReturnType<typeof setInterval>;
  private vorlaeufigesToken?: string;

  startseite(): string {
    const r = this.benutzer()?.rolle;
    return r === 'SACHBEARBEITER' ? '/sachbearbeitung' : r === 'ADMIN' ? '/admin' : '/start';
  }

  async anmeldenExtern(verfahren: 'GESUNDHEITSID' | 'EID', versichertennummer: string, pin: string): Promise<LoginAntwort> {
    const a = await firstValueFrom(this.http.post<LoginAntwort>('/api/auth/extern', { verfahren, versichertennummer, pin }));
    this.abschliessen(a);
    return a;
  }

  get token(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  async wiederherstellen(): Promise<void> {
    if (!this.token) return;
    try {
      const b = await firstValueFrom(this.http.get<AngemeldeterBenutzer>('/api/auth/ich'));
      this.setzen(b);
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  async anmelden(kennung: string, passwort: string): Promise<LoginAntwort> {
    const a = await firstValueFrom(this.http.post<LoginAntwort>('/api/auth/login', { kennung, passwort }));
    if (a.zweiFaktorErforderlich) {
      this.vorlaeufigesToken = a.token;
    } else {
      this.abschliessen(a);
    }
    return a;
  }

  get wartetAufZweiFaktor(): boolean {
    return !!this.vorlaeufigesToken;
  }

  async codeBestaetigen(code: string): Promise<LoginAntwort> {
    try {
      const a = await firstValueFrom(this.http.post<LoginAntwort>('/api/auth/zwei-faktor', { token: this.vorlaeufigesToken, code }));
      this.vorlaeufigesToken = undefined;
      this.abschliessen(a);
      return a;
    } catch (e: any) {
      if (e?.error?.code === 'SITZUNG_ABGELAUFEN') this.vorlaeufigesToken = undefined;
      throw e;
    }
  }

  codeErneutSenden() {
    return firstValueFrom(this.http.post('/api/auth/zwei-faktor/erneut', { token: this.vorlaeufigesToken }));
  }

  zweiFaktorAbbrechen() {
    this.vorlaeufigesToken = undefined;
  }

  private abschliessen(a: LoginAntwort) {
    sessionStorage.setItem(TOKEN_KEY, a.token);
    this.letzterLogin.set(a.letzterLogin);
    this.setzen(a.benutzer!);
  }

  setzen(b: AngemeldeterBenutzer) {
    this.benutzer.set(b);
    document.documentElement.dataset['schrift'] = b.schriftgroesse;
    this.aktivitaet();
    this.timerStarten();
  }

  aktivitaet() {
    this.letzteAktivitaet = Date.now();
    this.restSekunden.set(SESSION_TIMEOUT_MINUTEN * 60);
  }

  private timerStarten() {
    if (this.timerId) return;
    this.timerId = setInterval(() => {
      const rest = Math.max(0, SESSION_TIMEOUT_MINUTEN * 60 - Math.floor((Date.now() - this.letzteAktivitaet) / 1000));
      this.restSekunden.set(rest);
      if (rest === 0) this.abmelden('timeout');
    }, 1000);
  }

  async abmelden(grund?: 'timeout' | 'passwort' | 'manuell') {
    if (this.token) {
      try {
        await firstValueFrom(this.http.post('/api/auth/logout', {}));
      } catch {
        /* ignorieren */
      }
    }
    this.lokalBeenden();
    this.router.navigate(['/anmelden'], { queryParams: grund && grund !== 'manuell' ? { grund } : {} });
  }

  lokalBeenden() {
    sessionStorage.removeItem(TOKEN_KEY);
    this.benutzer.set(null);
    delete document.documentElement.dataset['schrift'];
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = undefined;
  }
}
