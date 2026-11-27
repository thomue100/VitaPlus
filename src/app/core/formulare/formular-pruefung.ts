import { addTage, heute, parseIso, toIso } from '../util/datum';
import { istEmailGueltig, istIbanGueltig, istTelefonGueltig } from '../util/pruefungen';
import { Bedingung, FeldDef, FormularDef, Option } from './formular-typen';

export interface FeldFehler {
  feld: string;
  meldung: string;
}

function bedingungErfuellt(b: Bedingung, daten: Record<string, any>): boolean {
  const w = daten[b.feld];
  if (b.gesetzt !== undefined) return b.gesetzt ? !!w : !w;
  if (b.gleich !== undefined) return w === b.gleich;
  if (b.ungleich !== undefined) return w !== b.ungleich;
  if (b.in) return b.in.includes(w);
  return true;
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Liefert die Auswahlwerte eines Feldes – feste Optionen oder zur Laufzeit ermittelte. */
export function optionenVon(feld: FeldDef): Option[] {
  if (feld.optionenQuelle === 'MONATSERSTE') {
    const h = heute();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(h.getFullYear(), h.getMonth() + 1 + i, 1);
      return { wert: toIso(d), text: `1. ${MONATE[d.getMonth()]} ${d.getFullYear()}` };
    });
  }
  return feld.optionen || [];
}

export function istSichtbar(feld: FeldDef, daten: Record<string, any>): boolean {
  if (!feld.sichtbarWenn) return true;
  const liste = Array.isArray(feld.sichtbarWenn) ? feld.sichtbarWenn : [feld.sichtbarWenn];
  return liste.every(b => bedingungErfuellt(b, daten));
}

export function leer(w: any): boolean {
  return w === undefined || w === null || w === '' || (Array.isArray(w) && w.length === 0) || w === false;
}

export function pruefeFeld(feld: FeldDef, wert: any, daten: Record<string, any>): string | null {
  if (feld.typ === 'info' || !istSichtbar(feld, daten)) return null;
  if (leer(wert)) return feld.pflicht ? (feld.typ === 'checkbox' ? 'Bitte bestätigen Sie diese Angabe.' : 'Bitte füllen Sie dieses Feld aus.') : null;
  switch (feld.typ) {
    case 'text':
    case 'textarea': {
      const s = String(wert).trim();
      if (feld.minLaenge && s.length < feld.minLaenge) return `Bitte geben Sie mindestens ${feld.minLaenge} Zeichen ein.`;
      if (feld.maxLaenge && s.length > feld.maxLaenge) return `Höchstens ${feld.maxLaenge} Zeichen erlaubt.`;
      if (feld.muster && !new RegExp(feld.muster).test(s)) return feld.musterText || 'Ungültiges Format.';
      return null;
    }
    case 'zahl':
    case 'betrag': {
      const n = Number(String(wert).replace(',', '.'));
      if (isNaN(n)) return 'Bitte geben Sie eine Zahl ein.';
      if (feld.typ === 'zahl' && !Number.isInteger(n)) return 'Bitte geben Sie eine ganze Zahl ein.';
      if (feld.min !== undefined && n < feld.min) return `Der Wert muss mindestens ${feld.min.toLocaleString('de-DE')} betragen.`;
      if (feld.max !== undefined && n > feld.max) return `Der Wert darf höchstens ${feld.max.toLocaleString('de-DE')} betragen.`;
      return null;
    }
    case 'datum': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return 'Bitte geben Sie ein gültiges Datum ein.';
      const d = parseIso(wert);
      if (feld.nichtZukunft && d > heute()) return 'Das Datum darf nicht in der Zukunft liegen.';
      if (feld.nichtVergangenheit && d < heute()) return 'Das Datum darf nicht in der Vergangenheit liegen.';
      if (feld.maxTageZurueck !== undefined && d < addTage(heute(), -feld.maxTageZurueck)) return 'Das Datum liegt zu weit in der Vergangenheit.';
      if (feld.maxTageVoraus !== undefined && d > addTage(heute(), feld.maxTageVoraus)) return 'Das Datum liegt zu weit in der Zukunft.';
      return null;
    }
    case 'auswahl':
    case 'radio': {
      const optionen = optionenVon(feld);
      return optionen.length && !optionen.some(o => o.wert === String(wert)) ? 'Bitte wählen Sie eine gültige Option.' : null;
    }
    case 'liste': {
      if (!Array.isArray(wert)) return 'Ungültige Angabe.';
      if (feld.minEintraege && wert.length < feld.minEintraege) return `Bitte erfassen Sie mindestens ${feld.minEintraege} ${feld.eintragBezeichnung || 'Eintrag'}.`;
      if (feld.maxEintraege && wert.length > feld.maxEintraege) return `Höchstens ${feld.maxEintraege} Einträge möglich.`;
      for (let i = 0; i < wert.length; i++) {
        for (const u of feld.unterfelder || []) {
          const m = pruefeFeld(u, wert[i]?.[u.name], wert[i] || {});
          if (m) return `${feld.eintragBezeichnung || 'Eintrag'} ${i + 1}, ${u.label}: ${m}`;
        }
      }
      return null;
    }
    case 'mehrfach':
      return !Array.isArray(wert) || wert.some(w => !feld.optionen?.some(o => o.wert === w)) ? 'Bitte wählen Sie gültige Optionen.' : null;
    case 'email':
      return istEmailGueltig(wert) ? null : 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
    case 'telefon':
      return istTelefonGueltig(wert) ? null : 'Bitte prüfen Sie die Telefonnummer.';
    case 'iban':
      return istIbanGueltig(wert) ? null : 'Die IBAN ist ungültig.';
    case 'datei':
      if (!Array.isArray(wert)) return 'Ungültige Dateiangabe.';
      if (feld.maxDateien && wert.length > feld.maxDateien) return `Höchstens ${feld.maxDateien} Dateien erlaubt.`;
      return null;
    default:
      return null;
  }
}

export function pruefeFormular(def: FormularDef, daten: Record<string, any>, nurSchritt?: number): FeldFehler[] {
  const fehler: FeldFehler[] = [];
  def.schritte.forEach((s, i) => {
    if (nurSchritt !== undefined && i !== nurSchritt) return;
    for (const feld of s.felder) {
      const m = pruefeFeld(feld, daten[feld.name], daten);
      if (m) fehler.push({ feld: feld.name, meldung: m });
    }
  });
  return fehler;
}

/** Entfernt Werte ausgeblendeter Felder, damit keine unnötigen Daten gespeichert werden. */
export function bereinige(def: FormularDef, daten: Record<string, any>): Record<string, any> {
  const r: Record<string, any> = {};
  for (const s of def.schritte) {
    for (const feld of s.felder) {
      if (feld.typ === 'info' || feld.typ === 'datei') continue;
      if (istSichtbar(feld, daten) && daten[feld.name] !== undefined) r[feld.name] = daten[feld.name];
    }
  }
  return r;
}
