import { AusgehendeNachricht, Benutzer, Nachricht, Store, Vorgang, VorgangStatus } from '../models';
import { jetztIso } from '../util/datum';
import { db, neueId } from './db';
import { benachrichtigen } from './fachlogik';
import { STATUS_TEXT, VERARBEITUNG } from '../konfiguration';

export class ApiFehler extends Error {
  constructor(public status: number, public meldung: string, public feld?: string, public code?: string, public details?: any) {
    super(meldung);
  }
}

export interface Anfrage {
  methode: string;
  pfad: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  benutzer?: Benutzer;
  token: string | null;
  store: Store;
  /** Probelauf ohne dauerhafte Wirkung (Vorabprüfung von Formularen) */
  trocken?: boolean;
}

export type Handler = (a: Anfrage) => any;

export interface Route {
  methode: 'GET' | 'POST' | 'PUT' | 'DELETE';
  muster: string;
  handler: Handler;
  oeffentlich?: boolean;
  rolle?: 'VERSICHERTER' | 'SACHBEARBEITER' | 'ADMIN';
  /** Hintergrundabfrage: verlängert die Sitzung nicht */
  hintergrund?: boolean;
}

export function pflicht(wert: any, feld: string, meldung = 'Pflichtfeld'): void {
  if (wert === undefined || wert === null || (typeof wert === 'string' && wert.trim() === '')) {
    throw new ApiFehler(400, meldung, feld, 'PFLICHTFELD');
  }
}

export function voller(b: Pick<Benutzer, 'titel' | 'vorname' | 'nachname'>): string {
  return [b.titel, b.vorname, b.nachname].filter(Boolean).join(' ');
}

export function anrede(b: Benutzer): string {
  if (b.anrede === 'FRAU') return `Sehr geehrte Frau ${b.titel ? b.titel + ' ' : ''}${b.nachname}`;
  if (b.anrede === 'HERR') return `Sehr geehrter Herr ${b.titel ? b.titel + ' ' : ''}${b.nachname}`;
  return `Guten Tag ${b.vorname} ${b.nachname}`;
}

export function statusSetzen(v: Vorgang, status: VorgangStatus, text: string, von: string) {
  v.status = status;
  v.geaendertAm = jetztIso();
  v.historie.push({ zeitpunkt: v.geaendertAm, status, text, von });
  const vers = db().benutzer.find(b => b.id === v.benutzerId);
  if (vers && von !== voller(vers)) {
    benachrichtigen(v.benutzerId, status === 'RUECKFRAGE' ? 'FRIST' : 'STATUS', `Vorgang ${v.vorgangsnummer}`,
      `Neuer Status: ${STATUS_TEXT[status] || status}`, `/vorgaenge/${v.id}`);
  }
}

/** Übergabe an das Versand-Gateway (E-Mail, SMS, Brief). In der Demo landet alles im Postausgang. */
export function versenden(kanal: AusgehendeNachricht['kanal'], an: string, betreff: string, text: string, link?: AusgehendeNachricht['link']): AusgehendeNachricht {
  const s = db();
  s.postausgang ??= [];
  const n: AusgehendeNachricht = { id: neueId('out'), kanal, an, betreff, text, zeitpunkt: jetztIso(), link };
  s.postausgang.unshift(n);
  s.postausgang = s.postausgang.slice(0, 60);
  return n;
}

export function postfachNachricht(
  benutzerId: string,
  betreff: string,
  text: string,
  optionen: Partial<Nachricht> = {},
): Nachricht {
  const empfaenger = db().benutzer.find(b => b.id === benutzerId);
  const n: Nachricht = {
    id: neueId('n'),
    benutzerId,
    ordner: 'EINGANG',
    betreff,
    text,
    absender: 'VitaPlus Kundenservice',
    empfaenger: empfaenger ? voller(empfaenger) : '',
    datum: jetztIso(),
    gelesen: false,
    kategorie: 'ALLGEMEIN',
    anhaenge: [],
    wichtig: false,
    ...optionen,
  };
  db().nachrichten.push(n);
  benachrichtigen(benutzerId, n.anhaenge.length ? 'DOKUMENT' : n.kategorie === 'BONUS' ? 'BONUS' : 'NACHRICHT',
    n.anhaenge.length ? 'Neues Dokument im Postfach' : 'Neue Nachricht', n.betreff, `/postfach/${n.id}`);
  // Hinweis-E-Mail bei wichtigen Nachrichten (Bescheide, Rückfragen, Zahlungen, Antworten) – ohne Inhalt, aus Datenschutzgründen
  const hinweiswuerdig = n.wichtig || n.anhaenge.length > 0 || /^(Rückfrage|Entscheidung|Bescheid|Zahlungsavis|AW:|Widerspruchsbescheid)/.test(n.betreff);
  if (empfaenger && empfaenger.kommunikation?.email !== false && hinweiswuerdig && empfaenger.rolle === 'VERSICHERTER') {
    versenden('EMAIL', empfaenger.email, 'Neue Nachricht in Ihrer Online-Geschäftsstelle',
      `Guten Tag ${voller(empfaenger)},\n\nin Ihrem Postfach der VitaPlus Online-Geschäftsstelle liegt eine neue Nachricht für Sie: „${n.betreff}“.\n\nAus Datenschutzgründen versenden wir die Inhalte nicht per E-Mail. Bitte melden Sie sich an, um die Nachricht zu lesen.\n\nIhre VitaPlus`,
      { text: 'Zum Postfach', ziel: `/postfach/${n.id}` });
  }
  return n;
}

export function ohnePasswort(b: Benutzer) {
  const { passwort, zweiFaktorCode, fehlversuche, aktivierungscode, ...rest } = b;
  return rest;
}

export function euro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/** Startet die maschinelle Weiterverarbeitung eines online eingegangenen Anliegens. */
export function verarbeitungStarten(v: Vorgang): void {
  if (v.status === 'ENTWURF' || v.verarbeitung) return;
  v.verarbeitung = { eingang: Date.now(), spur: VERARBEITUNG.dunkelTypen.includes(v.typ) ? 'DUNKEL' : 'SACHBEARBEITUNG' };
}

/** Legt einen neuen Vorgang im Bestand an (Posteingang Online-Kanal). */
export function eingangErfassen(s: Store, v: Vorgang): void {
  s.vorgaenge.push(v);
  verarbeitungStarten(v);
}
