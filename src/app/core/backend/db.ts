import { Store } from '../models';
import { erzeugeStartdaten } from './seed';

const SPEICHER_SCHLUESSEL = 'vp_db';
const SITZUNG_SCHLUESSEL = 'vp_sessions';
const AKTUELLE_VERSION = 4;

let cache: Store | null = null;

export function db(): Store {
  if (cache) return cache;
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (roh) {
      const geladen = JSON.parse(roh) as Store;
      if (geladen.version === AKTUELLE_VERSION) {
        cache = geladen;
        return cache;
      }
    }
  } catch {
    // beschädigter Speicher -> neu initialisieren
  }
  cache = erzeugeStartdaten();
  persistieren();
  return cache;
}

export function persistieren(): void {
  if (!cache) return;
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(cache));
  } catch {
    console.warn('Speichern im localStorage nicht möglich');
  }
}

export function neueId(prefix: string): string {
  const s = db();
  s.zaehler++;
  return prefix + s.zaehler.toString(36) + Math.random().toString(36).substring(2, 6);
}

export function neueVorgangsnummer(): string {
  const s = db();
  s.zaehler++;
  return `VP-${new Date().getFullYear()}-${String(s.zaehler).padStart(6, '0')}`;
}

export interface Sitzung {
  token: string;
  benutzerId: string;
  ablauf: number;
  vorlaeufig: boolean;
  codeFehlversuche: number;
  geraet: string;
  erstellt: number;
  letzteAktivitaet: number;
}

export function geraetBeschreibung(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unbekannt';
  return `${browser} auf ${os}`;
}

function sitzungenLaden(): Sitzung[] {
  try {
    return JSON.parse(localStorage.getItem(SITZUNG_SCHLUESSEL) || '[]');
  } catch {
    return [];
  }
}

function sitzungenSpeichern(liste: Sitzung[]) {
  localStorage.setItem(SITZUNG_SCHLUESSEL, JSON.stringify(liste.filter(s => s.ablauf > Date.now())));
}

export const sitzungen = {
  erstellen(benutzerId: string, vorlaeufig: boolean, minuten: number): Sitzung {
    const s: Sitzung = {
      token: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now(),
      benutzerId,
      ablauf: Date.now() + minuten * 60000,
      vorlaeufig,
      codeFehlversuche: 0,
      geraet: geraetBeschreibung(),
      erstellt: Date.now(),
      letzteAktivitaet: Date.now(),
    };
    const liste = sitzungenLaden();
    liste.push(s);
    sitzungenSpeichern(liste);
    return s;
  },
  finden(token: string | null): Sitzung | undefined {
    if (!token) return undefined;
    return sitzungenLaden().find(s => s.token === token && s.ablauf > Date.now());
  },
  aktualisieren(s: Sitzung) {
    const liste = sitzungenLaden().filter(x => x.token !== s.token);
    liste.push(s);
    sitzungenSpeichern(liste);
  },
  entfernen(token: string) {
    sitzungenSpeichern(sitzungenLaden().filter(s => s.token !== token));
  },
  fuer(benutzerId: string): Sitzung[] {
    return sitzungenLaden().filter(s => s.benutzerId === benutzerId && !s.vorlaeufig && s.ablauf > Date.now());
  },
  alleEntfernenFuer(benutzerId: string, ausser?: string) {
    sitzungenSpeichern(sitzungenLaden().filter(s => s.benutzerId !== benutzerId || s.token === ausser));
  },
};
