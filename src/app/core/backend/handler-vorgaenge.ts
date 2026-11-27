import {
  AUTO_GENEHMIGUNG_BIS, ERLAUBTE_DATEITYPEN, ERSTATTUNGEN, KINDERKRANKENGELD_TAGE_PRO_KIND, MAX_ANHANG_BYTES,
  RECHNUNG_MAX_ALTER_MONATE, RECHNUNG_MAX_BETRAG, VORGANG_TYP_TEXT,
} from '../konfiguration';
import { Anhang, Benutzer, Store, Vorgang, VorgangStatus, VorgangTyp } from '../models';
import { berechneErstattung, festzuschussProzent } from '../util/berechnungen';
import { addMonate, addTage, alterAm, formatDatum, heute, heuteIso, istWochenende, jetztIso, parseIso, tageZwischen, toIso } from '../util/datum';
import { zahllauf } from './verarbeitung';
import { Anfrage, ApiFehler, anrede, euro, pflicht, postfachNachricht, Route, statusSetzen, voller, eingangErfassen } from './api-kontext';
import { db, neueId, neueVorgangsnummer } from './db';

const AUSZAHLUNGS_TYPEN = ['KOSTENERSTATTUNG', 'BONUS_AUSZAHLUNG', 'FAHRKOSTEN', 'VERHINDERUNGSPFLEGE', 'ENTLASTUNGSBETRAG', 'ZUZAHLUNGSBEFREIUNG', 'KUENSTLICHE_BEFRUCHTUNG'];

export const OFFENE_STATUS: VorgangStatus[] = ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE'];

export function anhaengePruefen(anhaenge: Anhang[] | undefined, pflichtig: boolean, max = 5) {
  const liste = anhaenge || [];
  if (pflichtig && liste.length === 0) throw new ApiFehler(400, 'Bitte laden Sie mindestens einen Beleg hoch.', 'anhaenge');
  if (liste.length > max) throw new ApiFehler(400, `Es sind höchstens ${max} Dateien erlaubt.`, 'anhaenge');
  const hochgeladen = db().dateien || [];
  for (const d of liste) {
    // Nur Dateien, die über POST /api/dateien angenommen wurden; Metadaten kommen vom Server, nicht vom Client
    const original = hochgeladen.find(x => x.id === d?.id);
    if (!original) throw new ApiFehler(400, `Die Datei „${d?.name || 'ohne Namen'}“ liegt uns nicht vor. Bitte laden Sie sie erneut hoch.`, 'anhaenge', 'DATEI_UNBEKANNT');
    Object.assign(d, { name: original.name, groesseBytes: original.groesseBytes, mimeType: original.mimeType, hochgeladenAm: original.hochgeladenAm });
    if (!ERLAUBTE_DATEITYPEN.includes(d.mimeType)) throw new ApiFehler(415, `Der Dateityp von „${d.name}“ wird nicht unterstützt.`, 'anhaenge');
    if (d.groesseBytes > MAX_ANHANG_BYTES) throw new ApiFehler(413, `Die Datei „${d.name}“ ist größer als 5 MB.`, 'anhaenge');
  }
}

export function neuerVorgang(b: Benutzer, typ: VorgangTyp, titel: string, daten: Record<string, any>, anhaenge: Anhang[], betrag?: number): Vorgang {
  return {
    id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), zustaendig: ['FAMILIENVERSICHERUNG', 'NAMENSAENDERUNG', 'ERSATZKARTE'].includes(typ) ? 'Mitgliedschaft & Beiträge' : 'Leistungen',
    benutzerId: b.id, typ, titel, status: 'EINGEREICHT',
    erstelltAm: jetztIso(), geaendertAm: jetztIso(), betragBeantragt: betrag, daten, anhaenge: anhaenge || [], historie: [],
  };
}

/** Statusübergänge, die zeitgesteuert durch Hintergrundprozesse erfolgen. */
export function zeitgesteuerteUebergaenge(s: Store) {
  const jetzt = new Date();
  for (const v of s.vorgaenge) {
    if (AUSZAHLUNGS_TYPEN.includes(v.typ) && (v.status === 'GENEHMIGT' || v.status === 'TEILWEISE_GENEHMIGT') && (v.betragErstattet || 0) > 0) {
      if (zahllauf(s, v)) continue;
      if (v.verarbeitung) continue;
      const seit = (jetzt.getTime() - new Date(v.geaendertAm).getTime()) / 86400000;
      if (seit >= 2) statusSetzen(v, 'AUSGEZAHLT', `${euro(v.betragErstattet || 0)} überwiesen`, 'System');
    }
  }
  for (const e of s.bonus) {
    if (e.status === 'ERFASST' && (jetzt.getTime() - new Date(e.eingereichtAm).getTime()) / 86400000 >= 2) e.status = 'BESTAETIGT';
  }
  for (const t of s.termine) {
    if (t.status === 'GEBUCHT' && parseIso(t.datum) < heute()) t.status = 'DURCHGEFUEHRT';
  }
  for (const k of s.karten) {
    if (k.status === 'AKTIV' && parseIso(k.gueltigBis) < heute()) k.status = 'ABGELAUFEN';
  }
  // Löschkonzept: Nachrichten im Papierkorb werden nach 30 Tagen endgültig entfernt
  const grenze = jetzt.getTime() - 30 * 86400000;
  s.nachrichten = s.nachrichten.filter(n => n.ordner !== 'PAPIERKORB' || new Date(n.datum).getTime() > grenze || n.kategorie === 'BEITRAG');
  // Rückfragen mit abgelaufener Frist werden erinnert (einmalig)
  for (const v of s.vorgaenge) {
    if (v.status === 'RUECKFRAGE' && v.rueckfrageFrist && parseIso(v.rueckfrageFrist) < heute() && !v.daten['erinnert']) {
      v.daten['erinnert'] = true;
      s.benachrichtigungen.push({ id: 'bn' + v.id + 'e', benutzerId: v.benutzerId, zeitpunkt: new Date().toISOString().substring(0, 19), kategorie: 'FRIST',
        titel: 'Frist abgelaufen', text: `Die Frist für Ihre Unterlagen zu ${v.vorgangsnummer} ist abgelaufen. Bitte reichen Sie diese umgehend nach.`, link: `/vorgaenge/${v.id}`, gelesen: false });
    }
  }
}

function liste(a: Anfrage) {
  const b = a.benutzer!;
  let l = a.store.vorgaenge.filter(v => v.benutzerId === b.id);
  const typ = a.query.get('typ');
  const status = a.query.get('status');
  const jahr = a.query.get('jahr');
  if (typ) l = l.filter(v => v.typ === typ);
  if (status === 'OFFEN') l = l.filter(v => OFFENE_STATUS.includes(v.status) || v.status === 'ENTWURF');
  else if (status === 'ABGESCHLOSSEN') l = l.filter(v => !OFFENE_STATUS.includes(v.status) && v.status !== 'ENTWURF');
  else if (status) l = l.filter(v => v.status === status);
  if (jahr) l = l.filter(v => v.erstelltAm.startsWith(jahr));
  return [...l].sort((x, y) => y.erstelltAm.localeCompare(x.erstelltAm));
}

export function detail(a: Anfrage) {
  const v = a.store.vorgaenge.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!v) throw new ApiFehler(404, 'Vorgang nicht gefunden.');
  return v;
}

function patientenAuswahl(a: Anfrage) {
  const b = a.benutzer!;
  const fam = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status === 'AKTIV');
  return [
    { id: 'SELBST', name: `${b.vorname} ${b.nachname}`, geburtsdatum: b.geburtsdatum },
    ...fam.map(f => ({ id: f.id, name: `${f.vorname} ${f.nachname}`, geburtsdatum: f.geburtsdatum })),
  ];
}

function budget(a: Anfrage) {
  const b = a.benutzer!;
  const code = a.query.get('leistung') || '';
  const patient = a.query.get('patient') || 'SELBST';
  const jahr = a.query.get('jahr') || String(heute().getFullYear());
  return budgetBerechnen(a.store, b, code, patient, jahr);
}

function budgetBerechnen(s: Store, b: Benutzer, code: string, patient: string, jahr: string) {
  const relevante = s.vorgaenge.filter(v => v.benutzerId === b.id && v.typ === 'KOSTENERSTATTUNG' && v.daten['leistung'] === code &&
    (v.daten['patientId'] || 'SELBST') === patient && String(v.daten['rechnungsdatum'] || '').startsWith(jahr) &&
    !['ABGELEHNT', 'STORNIERT', 'ENTWURF'].includes(v.status));
  const erstattet = relevante.reduce((sum, v) => sum + (v.betragErstattet ?? (OFFENE_STATUS.includes(v.status) ? berechnetVorlaeufig(v, b) : 0)), 0);
  const anzahl = relevante.reduce((sum, v) => sum + (Number(v.daten['sitzungen']) || 1), 0);
  const regel = ERSTATTUNGEN.find(r => r.code === code);
  return {
    leistung: code,
    jahr,
    bereitsErstattet: Math.round(erstattet * 100) / 100,
    anzahl,
    jahresMax: regel ? regel.jahresMax[b.tarif] : 0,
    quote: regel ? regel.quote[b.tarif] : 0,
    maxAnzahl: regel?.maxAnzahlProJahr ?? null,
  };
}

function berechnetVorlaeufig(v: Vorgang, b: Benutzer): number {
  const regel = ERSTATTUNGEN.find(r => r.code === v.daten['leistung']);
  if (!regel) return 0;
  return Math.min((v.betragBeantragt || 0) * regel.quote[b.tarif] / 100, regel.jahresMax[b.tarif]);
}

function kostenerstattung(a: Anfrage) {
  const b = a.benutzer!;
  const d = a.body || {};
  if (!b.bank) throw new ApiFehler(422, 'Für Erstattungen benötigen wir Ihre Bankverbindung. Bitte hinterlegen Sie diese zuerst in Ihrem Profil.', undefined, 'BANK_FEHLT');
  pflicht(d.leistung, 'leistung');
  pflicht(d.rechnungsdatum, 'rechnungsdatum');
  pflicht(d.rechnungsnummer, 'rechnungsnummer');
  pflicht(d.leistungserbringer, 'leistungserbringer');
  pflicht(d.betrag, 'betrag');
  const betrag = Number(d.betrag);
  if (!(betrag > 0)) throw new ApiFehler(400, 'Der Rechnungsbetrag muss größer als 0 sein.', 'betrag');
  if (betrag > RECHNUNG_MAX_BETRAG) throw new ApiFehler(400, `Rechnungen über ${euro(RECHNUNG_MAX_BETRAG)} reichen Sie bitte per Post ein.`, 'betrag');
  const rd = parseIso(d.rechnungsdatum);
  if (rd > heute()) throw new ApiFehler(400, 'Das Rechnungsdatum darf nicht in der Zukunft liegen.', 'rechnungsdatum');
  if (rd < addMonate(heute(), -RECHNUNG_MAX_ALTER_MONATE)) {
    throw new ApiFehler(422, `Rechnungen können nur bis ${RECHNUNG_MAX_ALTER_MONATE} Monate nach Rechnungsdatum eingereicht werden.`, 'rechnungsdatum');
  }
  anhaengePruefen(d.anhaenge, true, 5);
  const patientId = d.patientId || 'SELBST';
  const patient = patientenAuswahl(a).find(p => p.id === patientId);
  if (!patient) throw new ApiFehler(400, 'Die ausgewählte Person ist bei Ihnen nicht mitversichert.', 'patientId');
  const duplikat = a.store.vorgaenge.find(v => v.typ === 'KOSTENERSTATTUNG' && v.benutzerId === b.id && v.status !== 'STORNIERT' &&
    String(v.daten['rechnungsnummer']).trim().toLowerCase() === String(d.rechnungsnummer).trim().toLowerCase() &&
    String(v.daten['leistungserbringer']).trim().toLowerCase() === String(d.leistungserbringer).trim().toLowerCase());
  if (duplikat) throw new ApiFehler(409, `Diese Rechnung wurde bereits mit Vorgang ${duplikat.vorgangsnummer} eingereicht.`, 'rechnungsnummer', 'DUPLIKAT');

  const regel = ERSTATTUNGEN.find(r => r.code === d.leistung);
  if (!regel) throw new ApiFehler(400, 'Unbekannte Leistung', 'leistung');
  if (regel.code === 'OSTEO' && !d.verordnungVorhanden) throw new ApiFehler(400, 'Für Osteopathie ist eine ärztliche Verordnung erforderlich.', 'verordnungVorhanden');
  if (regel.code === 'REISEIMPF' && !d.reiseziel) throw new ApiFehler(400, 'Bitte geben Sie das Reiseziel an.', 'reiseziel');

  const sitzungen = regel.code === 'OSTEO' ? Math.max(1, Number(d.sitzungen) || 1) : 1;
  const bud = budgetBerechnen(a.store, b, regel.code, patientId, String(rd.getFullYear()));
  if (regel.maxAnzahlProJahr && bud.anzahl + sitzungen > regel.maxAnzahlProJahr) {
    throw new ApiFehler(422, `Diese Leistung kann höchstens ${regel.maxAnzahlProJahr}× pro Kalenderjahr erstattet werden. Bereits eingereicht: ${bud.anzahl}.`, 'leistung');
  }
  const vorschau = berechneErstattung(regel.code, b.tarif, betrag, bud.bereitsErstattet, 0, alterAm(patient.geburtsdatum, rd));
  if (!vorschau.moeglich) throw new ApiFehler(422, vorschau.gruende[0] || 'Eine Erstattung ist nicht möglich.', 'leistung');

  const v = neuerVorgang(b, 'KOSTENERSTATTUNG', regel.bezeichnung, {
    leistung: regel.code, rechnungsdatum: d.rechnungsdatum, rechnungsnummer: String(d.rechnungsnummer).trim(),
    leistungserbringer: String(d.leistungserbringer).trim(), patientId, patient: patient.name, sitzungen,
    reiseziel: d.reiseziel, verordnungVorhanden: !!d.verordnungVorhanden, voraussichtlich: vorschau.betrag, bemerkung: d.bemerkung,
  }, d.anhaenge, betrag);
  statusSetzen(v, 'EINGEREICHT', 'Antrag online eingereicht', voller(b));
  if (vorschau.betrag <= AUTO_GENEHMIGUNG_BIS && patientId === 'SELBST' && betrag <= 200) {
    v.betragErstattet = vorschau.betrag;
    statusSetzen(v, 'GENEHMIGT', `Automatisch genehmigt: ${euro(vorschau.betrag)}`, 'System');
    postfachNachricht(b.id, `Ihre Erstattung ${v.vorgangsnummer} wurde genehmigt`,
      `${anrede(b)},\n\nfür Ihre Rechnung vom ${formatDatum(d.rechnungsdatum)} (${regel.bezeichnung}) erstatten wir ${euro(vorschau.betrag)}. Die Auszahlung erfolgt in den nächsten Tagen.\n\nMit freundlichen Grüßen\nIhre VitaPlus`,
      { kategorie: 'LEISTUNG', absender: 'VitaPlus Leistungsabteilung', vorgangId: v.id });
  } else {
    postfachNachricht(b.id, `Eingangsbestätigung ${v.vorgangsnummer}`,
      `${anrede(b)},\n\nwir haben Ihren Antrag auf Kostenerstattung (${regel.bezeichnung}, ${euro(betrag)}) erhalten. Die Bearbeitung dauert in der Regel 5 bis 10 Werktage.\n\nIhre VitaPlus`,
      { kategorie: 'LEISTUNG', absender: 'VitaPlus Leistungsabteilung', vorgangId: v.id, gelesen: false });
  }
  eingangErfassen(a.store, v);
  return v;
}

function arbeitsunfaehigkeit(a: Anfrage) {
  const b = a.benutzer!;
  const d = a.body || {};
  if (b.beschaeftigung === 'RENTNER') {
    throw new ApiFehler(422, 'Als Rentnerin oder Rentner müssen Sie uns keine Arbeitsunfähigkeit melden.', undefined, 'NICHT_ERFORDERLICH');
  }
  pflicht(d.von, 'von');
  pflicht(d.bis, 'bis');
  pflicht(d.arzt, 'arzt');
  const von = parseIso(d.von);
  const bis = parseIso(d.bis);
  if (bis < von) throw new ApiFehler(400, 'Das Ende darf nicht vor dem Beginn liegen.', 'bis');
  if (von > addTage(heute(), 3)) throw new ApiFehler(400, 'Der Beginn darf höchstens 3 Tage in der Zukunft liegen.', 'von');
  if (tageZwischen(von, bis) > 180) throw new ApiFehler(400, 'Eine Bescheinigung darf höchstens 180 Tage umfassen.', 'bis');
  if (!d.erstbescheinigung && !d.vorgaengerId) throw new ApiFehler(400, 'Bitte wählen Sie die vorangegangene Bescheinigung aus.', 'vorgaengerId');
  anhaengePruefen(d.anhaenge, false, 2);

  const eigene = a.store.vorgaenge.filter(v => v.benutzerId === b.id && v.typ === 'ARBEITSUNFAEHIGKEIT' && v.status !== 'STORNIERT');
  const ueberschneidung = eigene.find(v => parseIso(v.daten['von']) <= bis && parseIso(v.daten['bis']) >= von);
  if (ueberschneidung) {
    throw new ApiFehler(409, `Für diesen Zeitraum liegt bereits eine Arbeitsunfähigkeit vor (${ueberschneidung.vorgangsnummer}).`, 'von');
  }
  if (!d.erstbescheinigung) {
    const vorg = eigene.find(v => v.id === d.vorgaengerId);
    if (!vorg) throw new ApiFehler(400, 'Die vorangegangene Bescheinigung wurde nicht gefunden.', 'vorgaengerId');
    const luecke = tageZwischen(vorg.daten['bis'], d.von);
    if (luecke > 1 && !(luecke <= 3 && istWochenende(addTage(parseIso(vorg.daten['bis']), 1)))) {
      throw new ApiFehler(422, 'Eine Folgebescheinigung muss sich lückenlos an die vorherige anschließen.', 'von');
    }
  }
  const tage = tageZwischen(von, bis) + 1;
  // Kette aus Folgebescheinigungen aufsummieren
  let kettenTage = tage;
  let vorgaengerId = d.erstbescheinigung ? undefined : d.vorgaengerId;
  while (vorgaengerId) {
    const vg = eigene.find(v => v.id === vorgaengerId);
    if (!vg) break;
    kettenTage += tageZwischen(vg.daten['von'], vg.daten['bis']) + 1;
    vorgaengerId = vg.daten['vorgaengerId'];
  }
  const verspaetet = tageZwischen(von, heute()) > 7;
  const krankengeld = kettenTage > 42 && ['ANGESTELLT', 'SELBSTSTAENDIG'].includes(b.beschaeftigung);
  const v = neuerVorgang(b, 'ARBEITSUNFAEHIGKEIT', `Arbeitsunfähigkeit ${formatDatum(d.von)}–${formatDatum(d.bis)}`, {
    von: d.von, bis: d.bis, arzt: d.arzt, erstbescheinigung: !!d.erstbescheinigung, vorgaengerId: d.vorgaengerId || null,
    unfall: !!d.unfall, arbeitsunfall: !!d.arbeitsunfall, arbeitgeber: b.arbeitgeber || null, tage, kettenTage, verspaetet, krankengeld,
    stationaer: !!d.stationaer,
  }, d.anhaenge || []);
  statusSetzen(v, 'EINGEREICHT', 'Krankmeldung erfasst', voller(b));
  if (!verspaetet && !d.arbeitsunfall) {
    statusSetzen(v, 'GENEHMIGT', b.arbeitgeber ? 'Arbeitsunfähigkeit registriert, Arbeitgeber informiert' : 'Arbeitsunfähigkeit registriert', 'System');
  }
  eingangErfassen(a.store, v);
  if (krankengeld) {
    postfachNachricht(b.id, 'Ihr Anspruch auf Krankengeld',
      `${anrede(b)},\n\nIhre Arbeitsunfähigkeit dauert inzwischen ${kettenTage} Tage. Nach Ablauf der Entgeltfortzahlung (6 Wochen) zahlen wir Ihnen Krankengeld. Wir melden uns mit den nächsten Schritten.\n\nGute Besserung wünscht\nIhre VitaPlus`,
      { kategorie: 'LEISTUNG', absender: 'VitaPlus Krankengeld-Team', vorgangId: v.id, wichtig: true });
  }
  if (d.arbeitsunfall) {
    postfachNachricht(b.id, 'Arbeitsunfall – Zuständigkeit der Berufsgenossenschaft',
      `${anrede(b)},\n\nbei einem Arbeitsunfall ist die gesetzliche Unfallversicherung zuständig. Wir haben Ihre Meldung zur Prüfung weitergeleitet.\n\nIhre VitaPlus`,
      { kategorie: 'LEISTUNG', vorgangId: v.id });
  }
  return v;
}

export const ANTRAG_TYPEN: VorgangTyp[] = ['HAUSHALTSHILFE', 'ZAHNERSATZ', 'MUTTERSCHAFTSGELD', 'KINDERKRANKENGELD', 'HILFSMITTEL'];

export function antragValidieren(a: Anfrage, typ: VorgangTyp, d: any, entwurf: boolean): { titel: string; daten: any; betrag?: number } {
  const b = a.benutzer!;
  const fam = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status === 'AKTIV');
  if (entwurf) return { titel: VORGANG_TYP_TEXT[typ] + ' (Entwurf)', daten: d };
  switch (typ) {
    case 'HAUSHALTSHILFE': {
      pflicht(d.von, 'von');
      pflicht(d.bis, 'bis');
      pflicht(d.grund, 'grund');
      if (parseIso(d.bis) < parseIso(d.von)) throw new ApiFehler(400, 'Das Ende darf nicht vor dem Beginn liegen.', 'bis');
      const kinderUnter12 = fam.filter(f => ['KIND', 'STIEFKIND', 'ENKELKIND'].includes(f.beziehung) && alterAm(f.geburtsdatum) < 12);
      if (kinderUnter12.length === 0 && !d.pflegebeduerftigesKind) {
        throw new ApiFehler(422, 'Haushaltshilfe setzt voraus, dass ein Kind unter 12 Jahren oder ein pflegebedürftiges Kind im Haushalt lebt.', undefined, 'VORAUSSETZUNG');
      }
      if (!d.keineAnderePerson) throw new ApiFehler(400, 'Bitte bestätigen Sie, dass keine im Haushalt lebende Person den Haushalt weiterführen kann.', 'keineAnderePerson');
      const tage = tageZwischen(d.von, d.bis) + 1;
      if (tage > 26 * 7 && b.tarif !== 'PREMIUM') throw new ApiFehler(422, 'Haushaltshilfe kann höchstens 26 Wochen gewährt werden.', 'bis');
      return { titel: `Haushaltshilfe ${formatDatum(d.von)}–${formatDatum(d.bis)}`, daten: { ...d, tage, stundenProTag: Math.min(Number(d.stundenProTag) || 4, 8) } };
    }
    case 'ZAHNERSATZ': {
      pflicht(d.zahnarzt, 'zahnarzt');
      pflicht(d.regelversorgung, 'regelversorgung');
      const kosten = Number(d.regelversorgung);
      if (!(kosten > 0)) throw new ApiFehler(400, 'Bitte geben Sie die Kosten der Regelversorgung laut Heil- und Kostenplan an.', 'regelversorgung');
      const jahre = Number(d.bonusheftJahre) || 0;
      if (jahre > 0 && !d.bonusheftHochgeladen) throw new ApiFehler(400, 'Bitte laden Sie Ihr Bonusheft als Nachweis hoch.', 'bonusheftHochgeladen');
      const prozent = festzuschussProzent(jahre, !!d.haertefall);
      if (d.geplanterBeginn && parseIso(d.geplanterBeginn) < heute()) {
        throw new ApiFehler(422, 'Der Heil- und Kostenplan muss vor Behandlungsbeginn genehmigt werden.', 'geplanterBeginn');
      }
      return { titel: 'Zahnersatz – Heil- und Kostenplan', daten: { ...d, festzuschussProzent: prozent, festzuschuss: Math.round(kosten * prozent) / 100 }, betrag: kosten };
    }
    case 'MUTTERSCHAFTSGELD': {
      pflicht(d.entbindungstermin, 'entbindungstermin');
      const et = parseIso(d.entbindungstermin);
      if (et < addTage(heute(), -56)) throw new ApiFehler(422, 'Der Antrag ist spätestens 8 Wochen nach der Entbindung zu stellen.', 'entbindungstermin');
      if (et > addMonate(heute(), 9)) throw new ApiFehler(400, 'Bitte prüfen Sie den voraussichtlichen Entbindungstermin.', 'entbindungstermin');
      if (b.beschaeftigung === 'STUDENT' || b.beschaeftigung === 'RENTNER') {
        throw new ApiFehler(422, 'Mutterschaftsgeld erhalten nur Mitglieder mit Anspruch auf Krankengeld.', undefined, 'VORAUSSETZUNG');
      }
      const mehrlinge = !!d.mehrlinge || !!d.fruehgeburt;
      const schutzBeginn = addTage(et, -42);
      const schutzEnde = addTage(et, mehrlinge ? 84 : 56);
      return { titel: 'Mutterschaftsgeld', daten: { ...d, schutzfristBeginn: toIso(schutzBeginn), schutzfristEnde: toIso(schutzEnde) } };
    }
    case 'KINDERKRANKENGELD': {
      pflicht(d.kindId, 'kindId');
      pflicht(d.von, 'von');
      pflicht(d.bis, 'bis');
      const kind = fam.find(f => f.id === d.kindId && ['KIND', 'STIEFKIND', 'ENKELKIND'].includes(f.beziehung));
      if (!kind) throw new ApiFehler(400, 'Bitte wählen Sie ein mitversichertes Kind aus.', 'kindId');
      if (alterAm(kind.geburtsdatum) >= 12 && !d.behinderung) throw new ApiFehler(422, 'Kinderkrankengeld gibt es für Kinder unter 12 Jahren.', 'kindId');
      if (!['ANGESTELLT'].includes(b.beschaeftigung)) throw new ApiFehler(422, 'Kinderkrankengeld setzt eine Beschäftigung mit Krankengeldanspruch voraus.', undefined, 'VORAUSSETZUNG');
      const tage = tageZwischen(d.von, d.bis) + 1;
      if (tage < 1) throw new ApiFehler(400, 'Das Ende darf nicht vor dem Beginn liegen.', 'bis');
      const jahr = String(parseIso(d.von).getFullYear());
      const bisher = a.store.vorgaenge.filter(v => v.benutzerId === b.id && v.typ === 'KINDERKRANKENGELD' && v.daten['kindId'] === kind.id &&
        String(v.daten['von']).startsWith(jahr) && !['ABGELEHNT', 'STORNIERT', 'ENTWURF'].includes(v.status))
        .reduce((s, v) => s + (v.daten['tage'] || 0), 0);
      const max = d.alleinerziehend ? KINDERKRANKENGELD_TAGE_PRO_KIND * 2 : KINDERKRANKENGELD_TAGE_PRO_KIND;
      if (bisher + tage > max) {
        throw new ApiFehler(422, `Für ${kind.vorname} stehen ${jahr} noch ${Math.max(0, max - bisher)} Tage Kinderkrankengeld zur Verfügung.`, 'bis');
      }
      return { titel: `Kinderkrankengeld für ${kind.vorname}`, daten: { ...d, tage, kindName: `${kind.vorname} ${kind.nachname}` } };
    }
    case 'HILFSMITTEL': {
      pflicht(d.hilfsmittel, 'hilfsmittel');
      pflicht(d.verordnungsdatum, 'verordnungsdatum');
      if (tageZwischen(d.verordnungsdatum, heuteIso()) > 28) throw new ApiFehler(422, 'Die Verordnung ist älter als 28 Tage und nicht mehr gültig.', 'verordnungsdatum');
      return { titel: `Hilfsmittel: ${d.hilfsmittel}`, daten: d };
    }
  }
  throw new ApiFehler(400, 'Unbekannte Antragsart');
}

function loeschen(a: Anfrage) {
  const v = detail(a);
  if (v.status !== 'ENTWURF') throw new ApiFehler(409, 'Eingereichte Vorgänge können nicht gelöscht, sondern nur zurückgezogen werden.');
  a.store.vorgaenge = a.store.vorgaenge.filter(x => x.id !== v.id);
  return { ok: true };
}

function stornieren(a: Anfrage) {
  const v = detail(a);
  if (v.status !== 'EINGEREICHT' && v.status !== 'RUECKFRAGE') {
    throw new ApiFehler(409, 'Der Vorgang befindet sich bereits in Bearbeitung und kann online nicht mehr zurückgezogen werden.');
  }
  if (v.typ === 'ARBEITSUNFAEHIGKEIT') throw new ApiFehler(409, 'Krankmeldungen können nicht zurückgezogen werden. Bitte wenden Sie sich an den Kundenservice.');
  statusSetzen(v, 'STORNIERT', a.body?.grund ? `Zurückgezogen: ${a.body.grund}` : 'Vom Versicherten zurückgezogen', voller(a.benutzer!));
  if (v.typ === 'FAMILIENVERSICHERUNG') {
    const f = a.store.familie.find(x => x.vorgangId === v.id);
    if (f) a.store.familie = a.store.familie.filter(x => x.id !== f.id);
  }
  return v;
}

function nachreichen(a: Anfrage) {
  const v = detail(a);
  if (v.status !== 'RUECKFRAGE') throw new ApiFehler(409, 'Zu diesem Vorgang besteht keine offene Rückfrage.');
  const { text, anhaenge } = a.body || {};
  if (!anhaenge?.length && !(text && String(text).trim().length >= 10)) {
    throw new ApiFehler(400, 'Bitte laden Sie ein Dokument hoch oder beantworten Sie die Rückfrage (mindestens 10 Zeichen).');
  }
  anhaengePruefen(anhaenge, false, 5);
  if (v.anhaenge.length + (anhaenge?.length || 0) > 10) throw new ApiFehler(400, 'Zu einem Vorgang können höchstens 10 Dateien gespeichert werden.');
  v.anhaenge.push(...(anhaenge || []));
  v.daten['antwortRueckfrage'] = text;
  v.rueckfrageFrist = undefined;
  statusSetzen(v, 'IN_BEARBEITUNG', 'Unterlagen nachgereicht' + (text ? `: ${String(text).substring(0, 80)}` : ''), voller(a.benutzer!));
  v.rueckfrage = undefined;
  return v;
}

function uebersicht(a: Anfrage) {
  const b = a.benutzer!;
  const eigene = a.store.vorgaenge.filter(v => v.benutzerId === b.id);
  const jahr = String(heute().getFullYear());
  return {
    offen: eigene.filter(v => OFFENE_STATUS.includes(v.status)).length,
    rueckfragen: eigene.filter(v => v.status === 'RUECKFRAGE').length,
    entwuerfe: eigene.filter(v => v.status === 'ENTWURF').length,
    erstattetImJahr: eigene.filter(v => v.typ === 'KOSTENERSTATTUNG' && v.erstelltAm.startsWith(jahr)).reduce((s, v) => s + (v.betragErstattet || 0), 0),
    letzte: [...eigene].filter(v => v.status !== 'ENTWURF').sort((x, y) => y.geaendertAm.localeCompare(x.geaendertAm)).slice(0, 4),
  };
}

export const VORGANG_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/vorgaenge', handler: liste, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/vorgaenge/uebersicht', handler: uebersicht, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/vorgaenge/:id', handler: detail, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/vorgaenge/:id', handler: loeschen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/vorgaenge/:id/stornieren', handler: stornieren, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/vorgaenge/:id/nachreichen', handler: nachreichen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/erstattung/personen', handler: patientenAuswahl, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/erstattung/budget', handler: budget, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/erstattung', handler: kostenerstattung, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/arbeitsunfaehigkeit', handler: arbeitsunfaehigkeit, rolle: 'VERSICHERTER' },
];
