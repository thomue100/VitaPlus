import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpHeaders, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { from, Observable, throwError, timer } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { anEchtesBackend, laufzeit } from '../laufzeit';
import { SESSION_TIMEOUT_MINUTEN } from '../konfiguration';
import { Anfrage, ApiFehler, Route } from './api-kontext';
import { db, persistieren, sitzungen } from './db';
import { AUTH_ROUTEN } from './handler-auth';
import { BONUS_TERMIN_ROUTEN } from './handler-bonus-termine';
import { FAMILIE_KARTEN_ROUTEN } from './handler-familie-karten';
import { POSTFACH_DOKUMENT_ROUTEN } from './handler-postfach-dokumente';
import { PROFIL_ROUTEN } from './handler-profil';
import { SB_ROUTEN } from './handler-sachbearbeitung';
import { VORGANG_ROUTEN, zeitgesteuerteUebergaenge } from './handler-vorgaenge';
import { hintergrundverarbeitung } from './verarbeitung';
import { FORMULAR_ROUTEN } from './handler-formulare';
import { FORMULARSERVICE_ROUTEN } from './formularservice';
import { DEMO_ROUTEN } from './handler-demo';
import { DATEI_ROUTEN } from './handler-dateien';
import { KONTO_ROUTEN } from './handler-konto';
import { VERSICHERUNG_ROUTEN } from './handler-versicherung';
import { fehlerErfassen, INHALT_ADMIN_ROUTEN, messpunktErfassen } from './handler-inhalte-admin';

const ROUTEN: Route[] = [
  ...AUTH_ROUTEN,
  ...PROFIL_ROUTEN,
  ...VORGANG_ROUTEN,
  ...FAMILIE_KARTEN_ROUTEN,
  ...BONUS_TERMIN_ROUTEN,
  ...POSTFACH_DOKUMENT_ROUTEN,
  ...SB_ROUTEN,
  ...FORMULAR_ROUTEN,
  ...FORMULARSERVICE_ROUTEN,
  ...DEMO_ROUTEN,
  ...DATEI_ROUTEN,
  ...KONTO_ROUTEN,
  ...VERSICHERUNG_ROUTEN,
  ...INHALT_ADMIN_ROUTEN,
];

interface Treffer {
  route: Route;
  params: Record<string, string>;
}

function finde(methode: string, pfad: string): Treffer | undefined {
  const teile = pfad.split('/').filter(Boolean);
  for (const route of ROUTEN) {
    if (route.methode !== methode) continue;
    const muster = route.muster.split('/').filter(Boolean);
    if (muster.length !== teile.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < muster.length; i++) {
      if (muster[i].startsWith(':')) params[muster[i].substring(1)] = decodeURIComponent(teile[i]);
      else if (muster[i] !== teile[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return undefined;
}

/** Bei simulierter Störung betroffene Schnittstellen (Antragsannahme und Uploads) */
const STOERUNG_BETROFFEN = [/^POST \/api\/antraege$/, /^PUT \/api\/antraege\/[^/]+$/, /^POST \/api\/oeffentlich\/formulare\/[^/]+$/, /^POST \/api\/erstattung$/,
  /^POST \/api\/krankmeldung$/, /^POST \/api\/nachrichten$/, /^POST \/api\/vorgaenge\/[^/]+\/nachreichen$/, /^POST \/api\/dateien$/];

const TITEL: Record<number, string> = {
  400: 'Ungültige Anfrage', 401: 'Nicht angemeldet', 403: 'Keine Berechtigung', 404: 'Nicht gefunden', 409: 'Konflikt',
  410: 'Nicht mehr verfügbar', 413: 'Inhalt zu groß', 415: 'Nicht unterstütztes Format', 422: 'Nicht verarbeitbar',
  423: 'Gesperrt', 429: 'Zu viele Anfragen', 500: 'Interner Fehler', 503: 'Dienst nicht verfügbar',
};

/** Fehlerantwort im Format „Problem Details for HTTP APIs“ (RFC 9457), wie es auch Spring Boot liefert. */
export function problem(status: number, detail: string, instance: string, ext: { code?: string; feld?: string; details?: unknown } = {}) {
  return {
    type: ext.code ? `/probleme/${ext.code.toLowerCase().replace(/_/g, '-')}` : 'about:blank',
    title: TITEL[status] || 'Fehler',
    status,
    detail,
    instance,
    ...(ext.code ? { code: ext.code } : {}),
    ...(ext.feld ? { feld: ext.feld } : {}),
    ...(ext.details ? { details: ext.details } : {}),
  };
}

function problemAntwort(req: { url: string }, status: number, body: unknown) {
  return new HttpErrorResponse({ status, url: req.url, error: body, headers: new HttpHeaders({ 'Content-Type': 'application/problem+json' }) });
}

/**
 * Weiterleitung an das echte Backend. Im Mischbetrieb übernimmt die Simulation Sitzungen, die das echte Backend
 * ausgestellt hat (gleiche Benutzer-IDs vorausgesetzt), damit simulierte Bereiche angemeldet weiterarbeiten.
 */
function weiterleiten(req: HttpRequest<unknown>, next: HttpHandlerFn, url: URL): Observable<HttpEvent<unknown>> {
  const ziel = laufzeit.backend.basisUrl + url.pathname + url.search;
  return next(req.clone({ url: ziel })).pipe(tap(ev => {
    if (laufzeit.backend.modus !== 'mischbetrieb' || !(ev instanceof HttpResponse)) return;
    const body = ev.body as any;
    if (body?.token && body?.benutzer?.id) sitzungen.uebernehmen(body.token, body.benutzer.id, SESSION_TIMEOUT_MINUTEN);
    if (url.pathname === '/api/auth/logout') {
      const t = req.headers.get('Authorization')?.substring(7);
      if (t) sitzungen.entfernen(t);
    }
  }));
}

function latenz(): number {
  return 120 + Math.floor(Math.random() * 380);
}

/**
 * Simuliert das Backend der Online-Geschäftsstelle. Anfragen an /api/** werden lokal beantwortet.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  const url = new URL(req.urlWithParams, window.location.origin);
  if (!url.pathname.startsWith('/api/')) return next(req);
  if (anEchtesBackend(req.method, url.pathname)) return weiterleiten(req, next, url);

  const start = performance.now();
  const messen = (route: string, status: number) => {
    if (url.pathname === '/api/fehler' || url.pathname === '/api/analyse' || url.pathname === '/api/takt' || url.pathname.startsWith('/api/demo/')) return;
    messpunktErfassen({ pfad: route, methode: req.method, status, dauerMs: Math.round(performance.now() - start), zeitpunkt: Date.now() });
  };
  return timer(latenz()).pipe(
    mergeMap(() => from(verarbeiten())),
  );

  async function verarbeiten(): Promise<HttpEvent<unknown>> {
      const treffer = finde(req.method, url.pathname);
      if (!treffer) {
        messen(url.pathname, 404);
        throw problemAntwort(req, 404, problem(404, 'Die angeforderte Ressource wurde nicht gefunden.', url.pathname));
      }
      const store = db();
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
      const anfrage: Anfrage = {
        methode: req.method, pfad: url.pathname, params: treffer.params, query: url.searchParams, body: req.body, token, store,
      };
      try {
        if (treffer.route.oeffentlich) {
          const s = sitzungen.finden(token);
          const b = s && !s.vorlaeufig ? store.benutzer.find(x => x.id === s.benutzerId) : undefined;
          if (b && !b.gesperrt) anfrage.benutzer = b;
        } else {
          const s = sitzungen.finden(token);
          if (!s || s.vorlaeufig) throw new ApiFehler(401, 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.', undefined, 'SITZUNG_ABGELAUFEN');
          const benutzer = store.benutzer.find(b => b.id === s.benutzerId);
          if (!benutzer || benutzer.gesperrt) throw new ApiFehler(401, 'Ihr Zugang ist nicht mehr gültig.', undefined, 'SITZUNG_ABGELAUFEN');
          if (treffer.route.rolle && treffer.route.rolle !== benutzer.rolle) throw new ApiFehler(403, 'Keine Berechtigung für diese Funktion.');
          anfrage.benutzer = benutzer;
          if (store.system.wartungsmodus && benutzer.rolle === 'VERSICHERTER') throw new ApiFehler(503, store.system.wartungstext, undefined, 'WARTUNG');
          if (!treffer.route.hintergrund) {
            s.ablauf = Date.now() + SESSION_TIMEOUT_MINUTEN * 60000;
            s.letzteAktivitaet = Date.now();
            sitzungen.aktualisieren(s);
          }
        }
        if (store.system.stoerung && STOERUNG_BETROFFEN.some(m => m.test(`${req.method} ${url.pathname}`))) {
          throw new ApiFehler(503, 'Ihr Anliegen konnte gerade nicht übermittelt werden, weil ein Dienst vorübergehend nicht erreichbar ist. Ihre Eingaben bleiben erhalten – bitte versuchen Sie es in einigen Minuten erneut.', undefined, 'DIENST_NICHT_ERREICHBAR');
        }
        zeitgesteuerteUebergaenge(store);
        hintergrundverarbeitung(store);
        const ergebnis = await treffer.route.handler(anfrage);
        persistieren();
        messen(treffer.route.muster, req.method === 'POST' ? 201 : 200);
        const body = ergebnis instanceof Blob ? ergebnis : structuredClone(ergebnis);
        return new HttpResponse({ status: req.method === 'POST' ? 201 : 200, body, url: req.url });
      } catch (e) {
        persistieren();
        if (e instanceof ApiFehler) {
          messen(treffer.route.muster, e.status);
          throw problemAntwort(req, e.status, problem(e.status, e.meldung, url.pathname, { code: e.code, feld: e.feld, details: e.details }));
        }
        console.error('Interner Fehler im Backend', e);
        messen(treffer.route.muster, 500);
        fehlerErfassen({ zeitpunkt: new Date().toISOString(), quelle: 'BACKEND', meldung: String((e as Error)?.message || e), details: String((e as Error)?.stack || '').substring(0, 1500), pfad: `${req.method} ${treffer.route.muster}` });
        throw problemAntwort(req, 500, problem(500, 'Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.', url.pathname));
      }
  }
};
