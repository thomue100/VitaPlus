import { PFLEGE, SAEUMNISZUSCHLAG_PROZENT, ZUZAHLUNG } from '../konfiguration';
import { Benachrichtigung, Benutzer, Pflegeakte, Protokolleintrag, Store } from '../models';
import { heute, jetztIso, parseIso, tageZwischen } from '../util/datum';
import { db, neueId } from './db';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- Beitragskonto

export interface Kontostand {
  soll: number;
  gezahlt: number;
  offen: number;
  ueberfaellig: number;
  mahnstufe: 0 | 1 | 2 | 3;
  aeltesteFaelligkeit?: string;
  saeumniszuschlagVorschau: number;
}

export function kontostand(s: Store, benutzerId: string): Kontostand {
  const b = s.beitragskonto.filter(x => x.benutzerId === benutzerId);
  const belastungen = b.filter(x => ['SOLL', 'SAEUMNISZUSCHLAG', 'MAHNGEBUEHR'].includes(x.art));
  const soll = belastungen.reduce((t, x) => t + x.betrag, 0);
  const zahlungen = b.filter(x => x.art === 'ZAHLUNG' || x.art === 'RATE').reduce((t, x) => t + x.betrag, 0);
  const offen = r2(soll - zahlungen);
  // offene Monate ermitteln: älteste zuerst ausgleichen
  let rest = zahlungen;
  let ueberfaellig = 0;
  let aelteste: string | undefined;
  let zuschlag = 0;
  for (const x of b.filter(x => x.art === 'SOLL').sort((p, q) => (p.faellig || p.datum).localeCompare(q.faellig || q.datum))) {
    if (rest >= x.betrag - 0.001) {
      rest -= x.betrag;
      continue;
    }
    const faellig = x.faellig || x.datum;
    if (parseIso(faellig) < heute()) {
      ueberfaellig += x.betrag - Math.max(rest, 0);
      aelteste = aelteste || faellig;
      const monate = Math.ceil(tageZwischen(faellig, heute()) / 30);
      zuschlag += Math.floor((x.betrag - Math.max(rest, 0)) / 50) * 50 * SAEUMNISZUSCHLAG_PROZENT / 100 * monate;
    }
    rest = 0;
  }
  const tageUeberfaellig = aelteste ? tageZwischen(aelteste, heute()) : 0;
  const mahnstufe: Kontostand['mahnstufe'] = ueberfaellig <= 0 ? 0 : tageUeberfaellig > 60 ? 3 : tageUeberfaellig > 30 ? 2 : 1;
  return { soll: r2(soll), gezahlt: r2(zahlungen), offen: Math.max(0, offen), ueberfaellig: r2(ueberfaellig), mahnstufe, aeltesteFaelligkeit: aelteste, saeumniszuschlagVorschau: r2(zuschlag) };
}

// ---------------------------------------------------------------- Zuzahlungen

export function belastungsgrenze(brutto: number, angehoerige: number, kinder: number, chronisch: boolean) {
  let abzug = 0;
  if (angehoerige >= 1) abzug += ZUZAHLUNG.freibetragErsterAngehoeriger + (angehoerige - 1) * ZUZAHLUNG.freibetragWeitereAngehoerige;
  abzug += kinder * ZUZAHLUNG.freibetragKind;
  const grundlage = Math.max(brutto - abzug, ZUZAHLUNG.mindestbemessungJahr);
  const prozent = chronisch ? ZUZAHLUNG.belastungsgrenzeChronikerProzent : ZUZAHLUNG.belastungsgrenzeProzent;
  return { grundlage: r2(grundlage), prozent, grenze: r2(grundlage * prozent / 100), freibetraege: abzug };
}

export function zuzahlungenSumme(s: Store, benutzerId: string, jahr: string): number {
  return r2(s.zuzahlungen.filter(z => z.benutzerId === benutzerId && z.datum.startsWith(jahr)).reduce((t, z) => t + z.betrag, 0));
}

export function zuzahlungBerechnen(preis: number): number {
  return r2(Math.min(preis, Math.max(5, Math.min(10, preis * 0.1))));
}

// ---------------------------------------------------------------- Pflege

export function pflegeakte(s: Store, benutzerId: string): Pflegeakte | undefined {
  return s.pflege.find(p => p.benutzerId === benutzerId);
}

export function entlastungVerfuegbar(akte: Pflegeakte, stichtag = heute()) {
  const jahr = stichtag.getFullYear();
  const seit = parseIso(akte.seit);
  const startMonat = seit.getFullYear() === jahr ? seit.getMonth() : 0;
  const monate = Math.max(0, stichtag.getMonth() - startMonat + 1);
  const anspruch = monate * PFLEGE.entlastungsbetragMonat;
  const genutzt = Object.entries(akte.entlastungGenutzt).filter(([m]) => m.startsWith(String(jahr))).reduce((t, [, v]) => t + v, 0);
  // Übertrag aus dem Vorjahr bis 30.06.
  let uebertrag = 0;
  if (stichtag.getMonth() < 6 && seit.getFullYear() < jahr) {
    const vorjahrStart = seit.getFullYear() === jahr - 1 ? seit.getMonth() : 0;
    const vorjahrAnspruch = (12 - vorjahrStart) * PFLEGE.entlastungsbetragMonat;
    const vorjahrGenutzt = Object.entries(akte.entlastungGenutzt).filter(([m]) => m.startsWith(String(jahr - 1))).reduce((t, [, v]) => t + v, 0);
    uebertrag = Math.max(0, vorjahrAnspruch - vorjahrGenutzt);
  }
  return { anspruch, genutzt: r2(genutzt), uebertrag: r2(uebertrag), verfuegbar: r2(Math.max(0, anspruch + uebertrag - genutzt)) };
}

export function gemeinsamesBudget(akte: Pflegeakte, jahr = String(heute().getFullYear())) {
  const genutzt = akte.verhinderungKurzzeitGenutzt[jahr] || 0;
  return { gesamt: PFLEGE.gemeinsamerJahresbetrag, genutzt, rest: r2(Math.max(0, PFLEGE.gemeinsamerJahresbetrag - genutzt)) };
}

// ---------------------------------------------------------------- Protokoll & Benachrichtigung

export function protokollieren(e: Omit<Protokolleintrag, 'id' | 'zeitpunkt' | 'stufe'> & { stufe?: Protokolleintrag['stufe'] }) {
  db().protokoll.push({ id: neueId('pr'), zeitpunkt: jetztIso(), stufe: 'INFO', ...e });
  if (db().protokoll.length > 2000) db().protokoll.splice(0, db().protokoll.length - 2000);
}

export function benachrichtigen(benutzerId: string, kategorie: Benachrichtigung['kategorie'], titel: string, text: string, link?: string) {
  const b = db().benutzer.find(x => x.id === benutzerId);
  if (!b || b.rolle !== 'VERSICHERTER') return;
  if (kategorie !== 'SICHERHEIT' && b.benachrichtigungen && b.benachrichtigungen.kategorien[kategorie] === false) return;
  db().benachrichtigungen.push({ id: neueId('bn'), benutzerId, zeitpunkt: jetztIso(), kategorie, titel, text, link, gelesen: false });
}

export function aenderungMerken(b: Benutzer, bereich: string, alt: string, neu: string, von: string) {
  if (alt === neu) return;
  db().aenderungshistorie.push({ id: neueId('ah'), benutzerId: b.id, zeitpunkt: jetztIso(), bereich, alt, neu, von });
}
