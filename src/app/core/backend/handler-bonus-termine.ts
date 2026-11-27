import { BERATUNGSTHEMEN, BONUS, BONUS_KATALOG, FILIALEN, MAX_OFFENE_TERMINE } from '../konfiguration';
import { BonusEintrag, Termin } from '../models';
import { bonusEuro } from '../util/berechnungen';
import { addTage, alterAm, formatDatum, heute, istFeiertag, istWochenende, jetztIso, parseIso, toIso } from '../util/datum';
import { Anfrage, ApiFehler, anrede, euro, pflicht, postfachNachricht, Route, statusSetzen, voller, eingangErfassen } from './api-kontext';
import { neueId, neueVorgangsnummer } from './db';
import { anhaengePruefen } from './handler-vorgaenge';

// ---------------------------------------------------------------- Bonus

function bonusUebersicht(a: Anfrage) {
  const b = a.benutzer!;
  const eintraege = a.store.bonus.filter(e => e.benutzerId === b.id).sort((x, y) => y.datum.localeCompare(x.datum));
  const jahre = Array.from(new Set([String(heute().getFullYear()), ...eintraege.map(e => e.datum.substring(0, 4))])).sort().reverse();
  const proJahr = jahre.map(j => {
    const imJahr = eintraege.filter(e => e.datum.startsWith(j));
    const bestaetigt = imJahr.filter(e => e.status === 'BESTAETIGT').reduce((s, e) => s + e.punkte, 0);
    const offen = imJahr.filter(e => e.status === 'ERFASST').reduce((s, e) => s + e.punkte, 0);
    const eingeloest = imJahr.length > 0 && imJahr.filter(e => e.status === 'BESTAETIGT').every(e => e.eingeloest) && bestaetigt > 0;
    return {
      jahr: j, bestaetigt, offen, eingeloest,
      anrechenbar: Math.min(bestaetigt, BONUS.maxPunkteProJahr),
      auszahlbar: !eingeloest && bestaetigt >= BONUS.mindestpunkteAuszahlung && auszahlungsfensterOffen(j),
    };
  });
  return { katalog: BONUS_KATALOG, eintraege, jahre: proJahr, regeln: BONUS };
}

/** Auszahlung für das laufende Jahr ab 1. November, für das Vorjahr bis 31. März. */
function auszahlungsfensterOffen(jahr: string): boolean {
  const h = heute();
  const j = Number(jahr);
  if (j === h.getFullYear()) return h.getMonth() >= 10;
  if (j === h.getFullYear() - 1) return h.getMonth() <= 2;
  return false;
}

function bonusErfassen(a: Anfrage) {
  const b = a.benutzer!;
  const { code, datum, nachweis } = a.body || {};
  const def = BONUS_KATALOG.find(k => k.code === code);
  if (!def) throw new ApiFehler(400, 'Bitte wählen Sie eine Maßnahme.', 'code');
  pflicht(datum, 'datum');
  const d = parseIso(datum);
  if (d > heute()) throw new ApiFehler(400, 'Das Datum darf nicht in der Zukunft liegen.', 'datum');
  const jahr = d.getFullYear();
  const h = heute();
  if (jahr < h.getFullYear() - 1 || (jahr === h.getFullYear() - 1 && h.getMonth() > 2)) {
    throw new ApiFehler(422, `Maßnahmen aus ${jahr} können nicht mehr eingereicht werden (Frist: 31.03.${jahr + 1}).`, 'datum');
  }
  if (def.mindestalter && alterAm(b.geburtsdatum, d) < def.mindestalter) {
    throw new ApiFehler(422, `Diese Maßnahme wird ab ${def.mindestalter} Jahren anerkannt.`, 'code');
  }
  const gleiche = a.store.bonus.filter(e => e.benutzerId === b.id && e.code === code && e.datum.startsWith(String(jahr)) && e.status !== 'ABGELEHNT');
  if (gleiche.length >= def.maxProJahr) {
    throw new ApiFehler(422, `„${def.bezeichnung}“ kann höchstens ${def.maxProJahr}× pro Jahr angerechnet werden.`, 'code');
  }
  if (gleiche.some(e => e.datum === datum)) throw new ApiFehler(409, 'Diese Maßnahme wurde für dieses Datum bereits erfasst.', 'datum');
  if (def.nachweisErforderlich && !nachweis) throw new ApiFehler(400, 'Bitte laden Sie einen Nachweis hoch.', 'nachweis');
  if (nachweis) anhaengePruefen([nachweis], true, 1);
  const eingeloest = a.store.bonus.some(e => e.benutzerId === b.id && e.datum.startsWith(String(jahr)) && e.eingeloest);
  if (eingeloest) throw new ApiFehler(409, `Für ${jahr} wurde Ihr Bonus bereits ausgezahlt.`);
  const e: BonusEintrag = {
    id: neueId('b'), benutzerId: b.id, code, datum, punkte: def.punkte,
    status: def.nachweisErforderlich ? 'ERFASST' : 'BESTAETIGT', nachweis, eingeloest: false, eingereichtAm: jetztIso(),
  };
  a.store.bonus.push(e);
  return e;
}

function bonusLoeschen(a: Anfrage) {
  const e = a.store.bonus.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!e) throw new ApiFehler(404, 'Eintrag nicht gefunden.');
  if (e.status !== 'ERFASST') throw new ApiFehler(409, 'Bestätigte Maßnahmen können nicht mehr gelöscht werden.');
  a.store.bonus = a.store.bonus.filter(x => x.id !== e.id);
  return { ok: true };
}

function bonusAuszahlen(a: Anfrage) {
  const b = a.benutzer!;
  const { jahr, art } = a.body || {};
  if (!['AUSZAHLUNG', 'GESUNDHEITSBUDGET'].includes(art)) throw new ApiFehler(400, 'Bitte wählen Sie die Art der Prämie.', 'art');
  if (!auszahlungsfensterOffen(String(jahr))) {
    throw new ApiFehler(422, Number(jahr) === heute().getFullYear()
      ? 'Die Prämie für das laufende Jahr kann ab dem 1. November angefordert werden.'
      : 'Die Frist zur Anforderung der Prämie ist abgelaufen.');
  }
  const eintraege = a.store.bonus.filter(e => e.benutzerId === b.id && e.datum.startsWith(String(jahr)) && e.status === 'BESTAETIGT');
  if (eintraege.some(e => e.eingeloest)) throw new ApiFehler(409, `Die Prämie für ${jahr} wurde bereits angefordert.`);
  const punkte = Math.min(eintraege.reduce((s, e) => s + e.punkte, 0), BONUS.maxPunkteProJahr);
  if (punkte < BONUS.mindestpunkteAuszahlung) {
    throw new ApiFehler(422, `Für eine Prämie benötigen Sie mindestens ${BONUS.mindestpunkteAuszahlung} bestätigte Punkte.`);
  }
  if (art === 'AUSZAHLUNG' && !b.bank) throw new ApiFehler(422, 'Für eine Auszahlung hinterlegen Sie bitte Ihre Bankverbindung.', undefined, 'BANK_FEHLT');
  const betrag = bonusEuro(punkte, art === 'GESUNDHEITSBUDGET');
  eintraege.forEach(e => (e.eingeloest = true));
  const v = {
    id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), zustaendig: 'Leistungen', benutzerId: b.id, typ: 'BONUS_AUSZAHLUNG' as const,
    titel: `Bonus${art === 'AUSZAHLUNG' ? 'auszahlung' : ' als Gesundheitsbudget'} ${jahr}`, status: 'EINGEREICHT' as const,
    erstelltAm: jetztIso(), geaendertAm: jetztIso(), betragBeantragt: betrag, betragErstattet: betrag,
    daten: { punkte, jahr: Number(jahr), art }, anhaenge: [], historie: [],
  };
  statusSetzen(v as any, 'EINGEREICHT', `Prämie für ${punkte} Punkte angefordert`, voller(b));
  statusSetzen(v as any, 'GENEHMIGT', `Prämie über ${euro(betrag)} freigegeben`, 'System');
  eingangErfassen(a.store, v as any);
  postfachNachricht(b.id, `Ihre Bonusprämie ${jahr}`,
    `${anrede(b)},\n\nherzlichen Glückwunsch! Für ${punkte} Punkte erhalten Sie ${euro(betrag)}` +
    (art === 'GESUNDHEITSBUDGET' ? ' als Gesundheitsbudget, das Sie für zusätzliche Gesundheitsleistungen einsetzen können.' : '. Der Betrag wird in den nächsten Tagen überwiesen.') +
    '\n\nIhr VitaPlus Bonusteam', { kategorie: 'BONUS', absender: 'VitaPlus Bonusprogramm', vorgangId: v.id });
  return v;
}

// ---------------------------------------------------------------- Termine

function slotsFuer(datum: string, kanal: string, filiale: string | null, a: Anfrage): { uhrzeit: string; frei: boolean }[] {
  const d = parseIso(datum);
  const freitag = d.getDay() === 5;
  const start = kanal === 'VIDEO' ? 9 * 60 : 8 * 60;
  const ende = freitag ? 14 * 60 : kanal === 'VIDEO' ? 16 * 60 : 18 * 60;
  const slots: { uhrzeit: string; frei: boolean }[] = [];
  const gebucht = a.store.termine.filter(t => t.datum === datum && t.status === 'GEBUCHT' && t.kanal === kanal && (kanal !== 'FILIALE' || t.filiale === filiale));
  for (let m = start; m < ende; m += 30) {
    if (m >= 12 * 60 && m < 13 * 60 && kanal === 'FILIALE') continue; // Mittagspause
    const uhrzeit = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const saat = (d.getDate() * 31 + d.getMonth() * 7 + m + (filiale ? filiale.length : kanal.length)) % 10;
    const frei = saat > 3 && !gebucht.some(t => t.uhrzeit === uhrzeit);
    slots.push({ uhrzeit, frei });
  }
  return slots;
}

function terminDatumPruefen(datum: string) {
  const d = parseIso(datum);
  if (d <= heute()) throw new ApiFehler(400, 'Termine können frühestens für morgen gebucht werden.', 'datum');
  if (d > addTage(heute(), 60)) throw new ApiFehler(400, 'Termine können höchstens 60 Tage im Voraus gebucht werden.', 'datum');
  if (istWochenende(d) || istFeiertag(d)) throw new ApiFehler(400, 'An Wochenenden und Feiertagen sind keine Termine möglich.', 'datum');
}

function slots(a: Anfrage) {
  const datum = a.query.get('datum') || '';
  const kanal = a.query.get('kanal') || 'TELEFON';
  const filiale = a.query.get('filiale');
  terminDatumPruefen(datum);
  if (kanal === 'FILIALE' && !filiale) throw new ApiFehler(400, 'Bitte wählen Sie eine Filiale.', 'filiale');
  return slotsFuer(datum, kanal, filiale, a);
}

function termine(a: Anfrage) {
  return a.store.termine.filter(t => t.benutzerId === a.benutzer!.id).sort((x, y) => (y.datum + y.uhrzeit).localeCompare(x.datum + x.uhrzeit));
}

function terminBuchen(a: Anfrage) {
  const b = a.benutzer!;
  const { thema, kanal, filiale, datum, uhrzeit, telefon, anmerkung } = a.body || {};
  if (!BERATUNGSTHEMEN.includes(thema)) throw new ApiFehler(400, 'Bitte wählen Sie ein Thema.', 'thema');
  if (!['FILIALE', 'TELEFON', 'VIDEO'].includes(kanal)) throw new ApiFehler(400, 'Bitte wählen Sie, wie die Beratung stattfinden soll.', 'kanal');
  if (kanal === 'FILIALE' && !FILIALEN.includes(filiale)) throw new ApiFehler(400, 'Bitte wählen Sie eine Filiale.', 'filiale');
  if (kanal === 'TELEFON' && !telefon) throw new ApiFehler(400, 'Bitte geben Sie an, unter welcher Nummer wir Sie erreichen.', 'telefon');
  if (anmerkung && String(anmerkung).length > 500) throw new ApiFehler(400, 'Die Anmerkung darf höchstens 500 Zeichen lang sein.', 'anmerkung');
  pflicht(datum, 'datum');
  pflicht(uhrzeit, 'uhrzeit');
  terminDatumPruefen(datum);
  const offen = a.store.termine.filter(t => t.benutzerId === b.id && t.status === 'GEBUCHT');
  if (offen.length >= MAX_OFFENE_TERMINE) throw new ApiFehler(409, `Sie können höchstens ${MAX_OFFENE_TERMINE} offene Termine gleichzeitig haben.`);
  if (offen.some(t => t.datum === datum)) throw new ApiFehler(409, 'Sie haben an diesem Tag bereits einen Termin.', 'datum');
  if (offen.some(t => t.thema === thema && thema !== 'Sonstiges')) {
    throw new ApiFehler(409, 'Zu diesem Thema ist bereits ein Termin gebucht.', 'thema');
  }
  const slot = slotsFuer(datum, kanal, filiale || null, a).find(s => s.uhrzeit === uhrzeit);
  if (!slot || !slot.frei) throw new ApiFehler(409, 'Dieser Termin wurde inzwischen vergeben. Bitte wählen Sie einen anderen.', 'uhrzeit');
  const t: Termin = {
    id: neueId('t'), benutzerId: b.id, thema, kanal, filiale: kanal === 'FILIALE' ? filiale : undefined, datum, uhrzeit,
    telefon: kanal === 'TELEFON' ? telefon : undefined, anmerkung, status: 'GEBUCHT', gebuchtAm: jetztIso(),
  };
  a.store.termine.push(t);
  const wie = kanal === 'FILIALE' ? `in unserer Filiale ${filiale}` : kanal === 'TELEFON' ? `telefonisch unter ${telefon}` : 'per Video (den Link erhalten Sie am Vortag)';
  postfachNachricht(b.id, `Terminbestätigung ${formatDatum(datum)} ${uhrzeit} Uhr`,
    `${anrede(b)},\n\nvielen Dank für Ihre Terminbuchung zum Thema „${thema}“. Wir beraten Sie am ${formatDatum(datum)} um ${uhrzeit} Uhr ${wie}.\n\nIhre VitaPlus`,
    { kategorie: 'ALLGEMEIN' });
  return t;
}

function terminStornieren(a: Anfrage) {
  const t = a.store.termine.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!t) throw new ApiFehler(404, 'Termin nicht gefunden.');
  if (t.status !== 'GEBUCHT') throw new ApiFehler(409, 'Dieser Termin kann nicht storniert werden.');
  const beginn = new Date(`${t.datum}T${t.uhrzeit}:00`);
  if (beginn.getTime() - Date.now() < 24 * 3600000) {
    throw new ApiFehler(422, 'Termine können nur bis 24 Stunden vor Beginn online storniert werden. Bitte rufen Sie uns an.');
  }
  t.status = 'STORNIERT';
  return t;
}

export function naechsteBuchbareTage(anzahl = 60): string[] {
  const tage: string[] = [];
  for (let i = 1; i <= anzahl; i++) {
    const d = addTage(heute(), i);
    if (!istWochenende(d) && !istFeiertag(d)) tage.push(toIso(d));
  }
  return tage;
}

export const BONUS_TERMIN_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/bonus', handler: bonusUebersicht, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/bonus', handler: bonusErfassen, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/bonus/:id', handler: bonusLoeschen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/bonus/praemie', handler: bonusAuszahlen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/termine', handler: termine, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/termine/tage', handler: () => naechsteBuchbareTage(), rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/termine/slots', handler: slots, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/termine', handler: terminBuchen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/termine/:id/stornieren', handler: terminStornieren, rolle: 'VERSICHERTER' },
];
