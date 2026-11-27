import { RUECKFRAGE_FRIST_TAGE } from '../konfiguration';
import { addTage, heuteIso, jetztIso, toIso } from '../util/datum';
import { Anfrage, ApiFehler, anrede, eingangErfassen, euro, postfachNachricht, Route, statusSetzen } from './api-kontext';
import { dokumentenablage } from './dokumentenablage';
import { neuAufsetzen, neueId, neueVorgangsnummer } from './db';
import { protokollieren } from './fachlogik';
import { hintergrundverarbeitung } from './verarbeitung';
import { zeitgesteuerteUebergaenge } from './handler-vorgaenge';
import { Vorgang } from '../models';

/**
 * Funktionen der Demo- und Testumgebung (nicht Teil des Produktivbetriebs):
 * simulierter Postausgang, Zurücksetzen des Datenbestands, vorbereitete Testszenarien und Zeitraffer.
 */

function postausgang(a: Anfrage) {
  return (a.store.postausgang || []).slice(0, 40);
}

function postausgangGelesen(a: Anfrage) {
  (a.store.postausgang || []).forEach(n => (n.gelesen = true));
  return { ok: true };
}

function status(a: Anfrage) {
  const offen = a.store.vorgaenge.filter(v => v.verarbeitung && !v.verarbeitung.manuell && ['EINGEREICHT', 'IN_BEARBEITUNG'].includes(v.status)).length;
  const auszahlung = a.store.vorgaenge.filter(v => v.verarbeitung && ['GENEHMIGT', 'TEILWEISE_GENEHMIGT'].includes(v.status) && (v.betragErstattet || 0) > 0).length;
  return { stoerung: !!a.store.system.stoerung, inVerarbeitung: offen, auszahlungOffen: auszahlung, angemeldet: !!a.benutzer, rolle: a.benutzer?.rolle };
}

function zuruecksetzen() {
  neuAufsetzen();
  dokumentenablage.allesLoeschen();
  return { ok: true };
}

/** Zeitraffer: lässt die Hintergrundverarbeitung so laufen, als wäre eine Stunde vergangen. */
function zeitraffer(a: Anfrage) {
  const stunde = 3600 * 1000;
  const verschieben = (iso: string) => {
    const d = new Date(new Date(iso).getTime() - stunde);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  let schritte = 0;
  for (let i = 0; i < 4; i++) {
    for (const v of a.store.vorgaenge) {
      if (!v.verarbeitung || v.verarbeitung.manuell) continue;
      v.verarbeitung.eingang -= stunde;
      v.geaendertAm = verschieben(v.geaendertAm);
    }
    // Noch unbeantwortete Nachrichten altern mit, damit das Service-Team antwortet
    for (const n of a.store.nachrichten) if (n.ordner === 'GESENDET' && !n.beantwortetAm) n.datum = verschieben(n.datum);
    const vorher = JSON.stringify(a.store.vorgaenge.map(v => v.status));
    zeitgesteuerteUebergaenge(a.store);
    hintergrundverarbeitung(a.store);
    if (vorher !== JSON.stringify(a.store.vorgaenge.map(v => v.status))) schritte++;
  }
  return { ok: true, schritte };
}

function stoerung(a: Anfrage) {
  a.store.system.stoerung = !!a.body?.aktiv;
  protokollieren({ ereignis: 'STOERUNG', details: a.store.system.stoerung ? 'Störung der Antragsannahme simuliert (Demo)' : 'Störungssimulation beendet (Demo)', stufe: 'WARNUNG' });
  return status(a);
}

/** Bereitet für den angemeldeten Versicherten einen typischen Testfall vor. */
function szenario(a: Anfrage) {
  const b = a.benutzer;
  if (!b || b.rolle !== 'VERSICHERTER') throw new ApiFehler(401, 'Bitte melden Sie sich zuerst als Versicherte/r an.');
  const code = String(a.body?.code || '');
  const basis = (typ: string, titel: string, daten: Record<string, any>, betrag?: number): Vorgang => ({
    id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), benutzerId: b.id, typ, titel, status: 'EINGEREICHT', erstelltAm: jetztIso(), geaendertAm: jetztIso(),
    betragBeantragt: betrag, daten, anhaenge: [], historie: [], zustaendig: 'Leistungen',
  });
  let v: Vorgang;
  switch (code) {
    case 'RUECKFRAGE': {
      v = basis('HILFSMITTEL', 'Hilfsmittel: Kompressionsstrümpfe', { hilfsmittel: 'Kompressionsstrümpfe Klasse II', verordnungsdatum: toIso(addTage(new Date(), -5)) });
      v.historie.push({ zeitpunkt: jetztIso(), status: 'EINGEREICHT', text: 'Antrag online eingereicht', von: `${b.vorname} ${b.nachname}` });
      v.bearbeiterId = 's1';
      statusSetzen(v, 'IN_BEARBEITUNG', 'Vorgang dem Team Leistungen zugewiesen', 'Sabine Müller');
      v.rueckfrage = 'Für die Prüfung benötigen wir noch die ärztliche Verordnung (Muster 16) und einen Kostenvoranschlag des Sanitätshauses. Bitte reichen Sie beides über Ihren Vorgang ein.';
      v.rueckfrageFrist = toIso(addTage(new Date(), RUECKFRAGE_FRIST_TAGE));
      statusSetzen(v, 'RUECKFRAGE', 'Rückfrage an Versicherten gestellt', 'Sabine Müller');
      eingangErfassen(a.store, v);
      v.verarbeitung = { eingang: Date.now(), spur: 'SACHBEARBEITUNG', rueckfrageGestellt: true };
      postfachNachricht(b.id, `Rückfrage zu Ihrem Antrag ${v.vorgangsnummer}`, `${anrede(b)},\n\n${v.rueckfrage}\n\nBitte antworten Sie bis zum ${v.rueckfrageFrist.split('-').reverse().join('.')}.\n\nMit freundlichen Grüßen\nSabine Müller\nTeam Leistungen`,
        { kategorie: 'LEISTUNG', absender: 'VitaPlus Leistungen', vorgangId: v.id, wichtig: true });
      break;
    }
    case 'ABLEHNUNG': {
      v = basis('KOSTENERSTATTUNG', 'Naturheilverfahren / Homöopathie', { leistung: 'NATUR', rechnungsdatum: toIso(addTage(new Date(), -21)), rechnungsnummer: 'HP-2026-311', leistungserbringer: 'Naturheilpraxis Sonnenhof', voraussichtlich: 0 }, 145);
      v.historie.push({ zeitpunkt: jetztIso(), status: 'EINGEREICHT', text: 'Antrag online eingereicht', von: `${b.vorname} ${b.nachname}` });
      v.ablehnungsgrund = 'Behandlungen durch Heilpraktikerinnen und Heilpraktiker gehören nicht zum Leistungsumfang der gesetzlichen Krankenversicherung. Eine Erstattung ist nur für ärztlich erbrachte Naturheilverfahren möglich.';
      v.bescheidAm = heuteIso();
      statusSetzen(v, 'ABGELEHNT', 'Antrag abgelehnt', 'Sabine Müller');
      eingangErfassen(a.store, v);
      v.verarbeitung = { eingang: Date.now(), spur: 'SACHBEARBEITUNG', manuell: true };
      postfachNachricht(b.id, `Bescheid zu ${v.vorgangsnummer}`, `${anrede(b)},\n\nleider können wir Ihrem Antrag „${v.titel}“ nicht entsprechen.\n\nBegründung: ${v.ablehnungsgrund}\n\nGegen diese Entscheidung können Sie innerhalb eines Monats nach Bekanntgabe Widerspruch einlegen – direkt online in Ihrem Vorgang.\n\nMit freundlichen Grüßen\nSabine Müller\nTeam Leistungen`,
        { kategorie: 'LEISTUNG', absender: 'VitaPlus Leistungen', vorgangId: v.id, wichtig: true,
          anhaenge: [{ id: 'bs' + v.id, name: `Bescheid_${v.vorgangsnummer}.pdf`, groesseBytes: 52000, mimeType: 'application/pdf', hochgeladenAm: new Date().toISOString() }] });
      break;
    }
    case 'AUSZAHLUNG': {
      v = basis('KOSTENERSTATTUNG', 'Professionelle Zahnreinigung', { leistung: 'PZR', rechnungsdatum: toIso(addTage(new Date(), -10)), rechnungsnummer: 'ZA-88412', leistungserbringer: 'Zahnarztpraxis Dr. Lehmann', voraussichtlich: 76 }, 95);
      v.historie.push({ zeitpunkt: jetztIso(), status: 'EINGEREICHT', text: 'Antrag online eingereicht', von: `${b.vorname} ${b.nachname}` });
      v.betragErstattet = 76;
      v.bescheidAm = heuteIso();
      statusSetzen(v, 'TEILWEISE_GENEHMIGT', `Teilweise genehmigt: ${euro(76)} – Erstattung nach Tarif`, 'Automatische Prüfung');
      eingangErfassen(a.store, v);
      v.verarbeitung = { eingang: Date.now(), spur: 'DUNKEL' };
      break;
    }
    default:
      throw new ApiFehler(400, 'Unbekanntes Szenario');
  }
  protokollieren({ benutzerId: b.id, ereignis: 'TESTSZENARIO', details: `Testszenario vorbereitet: ${code} (${v.vorgangsnummer})` });
  return { ok: true, vorgangId: v.id, vorgangsnummer: v.vorgangsnummer };
}

export const DEMO_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/demo/postausgang', handler: postausgang, oeffentlich: true },
  { methode: 'POST', muster: '/api/demo/postausgang/gelesen', handler: postausgangGelesen, oeffentlich: true },
  { methode: 'GET', muster: '/api/demo/status', handler: status, oeffentlich: true },
  { methode: 'POST', muster: '/api/demo/zuruecksetzen', handler: zuruecksetzen, oeffentlich: true },
  { methode: 'POST', muster: '/api/demo/zeitraffer', handler: zeitraffer, oeffentlich: true },
  { methode: 'POST', muster: '/api/demo/stoerung', handler: stoerung, oeffentlich: true },
  { methode: 'POST', muster: '/api/demo/szenario', handler: szenario, oeffentlich: true },
];
