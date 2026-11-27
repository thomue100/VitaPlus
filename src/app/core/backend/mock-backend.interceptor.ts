import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, of, throwError, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
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
  /^POST \/api\/krankmeldung$/, /^POST \/api\/nachrichten$/, /^POST \/api\/vorgaenge\/[^/]+\/nachreichen$/];

function latenz(): number {
  return 120 + Math.floor(Math.random() * 380);
}

/**
 * Simuliert das Backend der Online-Geschäftsstelle. Anfragen an /api/** werden lokal beantwortet.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  const url = new URL(req.urlWithParams, window.location.origin);
  if (!url.pathname.startsWith('/api/')) return next(req);

  const start = performance.now();
  const messen = (route: string, status: number) => {
    if (url.pathname === '/api/fehler' || url.pathname === '/api/analyse' || url.pathname === '/api/takt' || url.pathname.startsWith('/api/demo/')) return;
    messpunktErfassen({ pfad: route, methode: req.method, status, dauerMs: Math.round(performance.now() - start), zeitpunkt: Date.now() });
  };
  return timer(latenz()).pipe(
    mergeMap(() => {
      const treffer = finde(req.method, url.pathname);
      if (!treffer) {
        messen(url.pathname, 404);
        return throwError(() => new HttpErrorResponse({ status: 404, url: req.url, error: { meldung: 'Ressource nicht gefunden' } }));
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
        const ergebnis = treffer.route.handler(anfrage);
        persistieren();
        messen(treffer.route.muster, req.method === 'POST' ? 201 : 200);
        return of(new HttpResponse({ status: req.method === 'POST' ? 201 : 200, body: structuredClone(ergebnis), url: req.url }));
      } catch (e) {
        persistieren();
        if (e instanceof ApiFehler) {
          messen(treffer.route.muster, e.status);
          return throwError(() => new HttpErrorResponse({
            status: e.status, url: req.url, error: { meldung: e.meldung, feld: e.feld, code: e.code, details: e.details },
          }));
        }
        console.error('Interner Fehler im Backend', e);
        messen(treffer.route.muster, 500);
        fehlerErfassen({ zeitpunkt: new Date().toISOString(), quelle: 'BACKEND', meldung: String((e as Error)?.message || e), details: String((e as Error)?.stack || '').substring(0, 1500), pfad: `${req.method} ${treffer.route.muster}` });
        return throwError(() => new HttpErrorResponse({ status: 500, url: req.url, error: { meldung: 'Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.' } }));
      }
    }),
  );
};
