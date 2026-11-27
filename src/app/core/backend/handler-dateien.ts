import { ERLAUBTE_DATEITYPEN, MAX_ANHANG_BYTES } from '../konfiguration';
import { Anhang, Datei } from '../models';
import { Anfrage, ApiFehler, Route } from './api-kontext';
import { dokumentenablage } from './dokumentenablage';

function neueId() {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

function typErmitteln(f: File): string {
  if (f.type) return f.type;
  const n = f.name.toLowerCase();
  return n.endsWith('.pdf') ? 'application/pdf' : n.endsWith('.png') ? 'image/png' : /\.jpe?g$/.test(n) ? 'image/jpeg' : '';
}

function metadaten(d: Datei): Anhang {
  return { id: d.id, name: d.name, groesseBytes: d.groesseBytes, mimeType: d.mimeType, hochgeladenAm: d.hochgeladenAm };
}

/** Datei hochladen (multipart/form-data, Feld „datei“). Die Antwort ist der Anhang, auf den sich Anträge und Nachrichten beziehen. */
async function hochladen(a: Anfrage): Promise<Anhang> {
  const datei = a.body instanceof FormData ? a.body.get('datei') : null;
  if (!(datei instanceof File)) throw new ApiFehler(400, 'Es wurde keine Datei übermittelt.', 'datei', 'DATEI_FEHLT');
  const typ = typErmitteln(datei);
  if (!ERLAUBTE_DATEITYPEN.includes(typ)) throw new ApiFehler(415, `„${datei.name}“ hat ein nicht unterstütztes Format. Erlaubt sind PDF, JPG und PNG.`, 'datei', 'DATEITYP');
  if (datei.size > MAX_ANHANG_BYTES) throw new ApiFehler(413, `„${datei.name}“ ist größer als 5 MB.`, 'datei', 'DATEI_ZU_GROSS');
  if (datei.size === 0) throw new ApiFehler(400, `„${datei.name}“ ist leer.`, 'datei', 'DATEI_LEER');
  const d: Datei = { id: neueId(), name: datei.name.substring(0, 120), groesseBytes: datei.size, mimeType: typ, hochgeladenAm: new Date().toISOString(), benutzerId: a.benutzer?.id };
  await dokumentenablage.speichern(d.id, datei);
  (a.store.dateien ??= []).push(d);
  // Ältere Einträge begrenzen, damit der Speicher des Browsers nicht vollläuft
  if (a.store.dateien.length > 300) a.store.dateien.splice(0, a.store.dateien.length - 300);
  return metadaten(d);
}

function zugriffPruefen(a: Anfrage): Datei {
  const d = a.store.dateien?.find(x => x.id === a.params['id']);
  const b = a.benutzer!;
  const berechtigt = d && (!d.benutzerId || d.benutzerId === b.id || b.rolle !== 'VERSICHERTER'
    || a.store.vollmachten.some(v => v.benutzerId === d.benutzerId && v.status === 'AKTIV' && v.onlineZugriff && v.email === b.email));
  if (!d || !berechtigt) {
    throw new ApiFehler(404, 'Zu diesem Dokument liegt keine digitale Fassung vor.', undefined, 'KEIN_DIGITALES_ORIGINAL');
  }
  return d;
}

function info(a: Anfrage): Anhang {
  return metadaten(zugriffPruefen(a));
}

async function inhalt(a: Anfrage): Promise<Blob> {
  const d = zugriffPruefen(a);
  const blob = await dokumentenablage.laden(d.id);
  if (!blob) throw new ApiFehler(404, 'Zu diesem Dokument liegt keine digitale Fassung vor.', undefined, 'KEIN_DIGITALES_ORIGINAL');
  return new Blob([blob], { type: d.mimeType });
}

export const DATEI_ROUTEN: Route[] = [
  { methode: 'POST', muster: '/api/dateien', handler: hochladen, oeffentlich: true, multipart: true },
  { methode: 'GET', muster: '/api/dateien/:id', handler: info },
  { methode: 'GET', muster: '/api/dateien/:id/inhalt', handler: inhalt, dateiAntwort: true },
];
