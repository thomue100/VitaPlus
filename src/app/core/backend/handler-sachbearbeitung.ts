import { VORGANG_TYP_TEXT } from '../konfiguration';
import { Benutzer, Vorgang } from '../models';
import { alterAm, formatDatum, heute, parseIso, tageZwischen } from '../util/datum';
import { Anfrage, ApiFehler, anrede, euro, ohnePasswort, postfachNachricht, Route, statusSetzen, versenden, voller } from './api-kontext';
import { db, sitzungen } from './db';
import { OFFENE_STATUS } from './handler-vorgaenge';
import { protokollieren } from './fachlogik';
import { RUECKFRAGE_FRIST_TAGE } from '../konfiguration';
import { addTage, toIso } from '../util/datum';

const SLA_TAGE: Partial<Record<string, number>> = { KOSTENERSTATTUNG: 10, FAMILIENVERSICHERUNG: 14, ZAHNERSATZ: 21, ERSATZKARTE: 3 };

function ueberfaellig(v: Vorgang): boolean {
  if (!['EINGEREICHT', 'IN_BEARBEITUNG'].includes(v.status)) return false;
  const frist = SLA_TAGE[v.typ] ?? 7;
  return tageZwischen(parseIso(v.erstelltAm), heute()) > frist;
}

function anreichern(a: Anfrage, v: Vorgang) {
  const vers = a.store.benutzer.find(b => b.id === v.benutzerId);
  const bearb = a.store.benutzer.find(b => b.id === v.bearbeiterId);
  return {
    ...v,
    versicherter: vers ? { id: vers.id, name: voller(vers), versichertennummer: vers.versichertennummer, tarif: vers.tarif } : null,
    bearbeiter: bearb ? voller(bearb) : null,
    ueberfaellig: ueberfaellig(v),
    typText: VORGANG_TYP_TEXT[v.typ],
  };
}

function eingang(a: Anfrage) {
  const q = a.query;
  const status = q.get('status') || 'OFFEN';
  const typ = q.get('typ');
  const suche = (q.get('suche') || '').toLowerCase();
  const nurMeine = q.get('meine') === 'true';
  const team = q.get('team') ?? (a.benutzer!.teamleitung ? '' : a.benutzer!.team || '');
  let l = a.store.vorgaenge.filter(v => v.status !== 'ENTWURF');
  if (team && team !== 'ALLE') l = l.filter(v => (v.zustaendig || 'Leistungen') === team || (team === 'Leistungen' && v.zustaendig === 'Krankengeld-Team') || (team === 'Kundenservice' && v.zustaendig === 'Beschwerdemanagement') || (team === 'Datenschutz' && v.zustaendig === 'Widerspruchsstelle'));
  if (status === 'OFFEN') l = l.filter(v => OFFENE_STATUS.includes(v.status));
  else if (status !== 'ALLE') l = l.filter(v => v.status === status);
  if (typ) l = l.filter(v => v.typ === typ);
  if (nurMeine) l = l.filter(v => v.bearbeiterId === a.benutzer!.id);
  let erg = l.map(v => anreichern(a, v));
  if (suche) {
    erg = erg.filter(v => v.vorgangsnummer.toLowerCase().includes(suche) || (v.versicherter?.name || v.externKontakt?.name || '').toLowerCase().includes(suche) ||
      (v.versicherter?.versichertennummer || '').toLowerCase().includes(suche));
  }
  const sort = q.get('sortierung') || 'ALT';
  erg.sort((x, y) => (Number(y.ueberfaellig) - Number(x.ueberfaellig)) ||
    (sort === 'ALT' ? x.erstelltAm.localeCompare(y.erstelltAm) : sort === 'BETRAG' ? (y.betragBeantragt || 0) - (x.betragBeantragt || 0) : y.erstelltAm.localeCompare(x.erstelltAm)));
  return erg;
}

function statistik(a: Anfrage) {
  const offen = a.store.vorgaenge.filter(v => OFFENE_STATUS.includes(v.status));
  return {
    offen: offen.length,
    neu: offen.filter(v => v.status === 'EINGEREICHT').length,
    inBearbeitung: offen.filter(v => v.status === 'IN_BEARBEITUNG').length,
    rueckfragen: offen.filter(v => v.status === 'RUECKFRAGE').length,
    ueberfaellig: offen.filter(ueberfaellig).length,
    meine: offen.filter(v => v.bearbeiterId === a.benutzer!.id).length,
    meinTeam: offen.filter(v => v.zustaendig === a.benutzer!.team).length,
    gesperrteKonten: a.store.benutzer.filter(b => b.gesperrt).length,
  };
}

function sbVorgang(a: Anfrage): Vorgang {
  const v = a.store.vorgaenge.find(x => x.id === a.params['id'] && x.status !== 'ENTWURF');
  if (!v) throw new ApiFehler(404, 'Vorgang nicht gefunden.');
  return v;
}

function detail(a: Anfrage, protokoll = true) {
  const v = sbVorgang(a);
  const vers = a.store.benutzer.find(b => b.id === v.benutzerId);
  if (!vers) {
    return { ...anreichern(a, v), versicherterDetails: null, weitereVorgaenge: [], darfEntscheiden: v.bearbeiterId === a.benutzer!.id, freigabeLimit: a.benutzer!.freigabeLimit ?? 0 };
  }
  if (protokoll) protokollieren({ benutzerId: vers.id, akteurId: a.benutzer!.id, ereignis: 'DATENZUGRIFF', details: `Vorgang ${v.vorgangsnummer} durch Sachbearbeitung geöffnet` });
  const weitere = a.store.vorgaenge.filter(x => x.benutzerId === vers.id && x.id !== v.id && x.status !== 'ENTWURF')
    .sort((x, y) => y.erstelltAm.localeCompare(x.erstelltAm)).slice(0, 10)
    .map(x => ({ id: x.id, vorgangsnummer: x.vorgangsnummer, titel: x.titel, status: x.status, erstelltAm: x.erstelltAm }));
  return {
    ...anreichern(a, v),
    versicherterDetails: { ...ohnePasswort(vers), bank: vers.bank ? { kontoinhaber: vers.bank.kontoinhaber, iban: vers.bank.iban } : null },
    weitereVorgaenge: weitere,
    darfEntscheiden: v.bearbeiterId === a.benutzer!.id,
    freigabeLimit: a.benutzer!.freigabeLimit ?? 0,
  };
}

function uebernehmen(a: Anfrage) {
  const v = sbVorgang(a);
  if (!OFFENE_STATUS.includes(v.status)) throw new ApiFehler(409, 'Der Vorgang ist bereits abgeschlossen.');
  if (v.bearbeiterId && v.bearbeiterId !== a.benutzer!.id && !a.benutzer!.teamleitung) {
    const b = a.store.benutzer.find(x => x.id === v.bearbeiterId);
    throw new ApiFehler(409, `Der Vorgang wird bereits von ${b ? voller(b) : 'einer Kollegin/einem Kollegen'} bearbeitet.`);
  }
  const vorher = v.bearbeiterId;
  v.bearbeiterId = a.benutzer!.id;
  if (v.verarbeitung) v.verarbeitung.manuell = true;
  if (v.status === 'EINGEREICHT') statusSetzen(v, 'IN_BEARBEITUNG', 'Vorgang übernommen', voller(a.benutzer!));
  else v.historie.push({ zeitpunkt: new Date().toISOString().substring(0, 19), status: v.status, text: vorher ? 'Vorgang neu zugewiesen' : 'Vorgang übernommen', von: voller(a.benutzer!) });
  return detail(a);
}

function freigeben(a: Anfrage) {
  const v = sbVorgang(a);
  v.bearbeiterId = undefined;
  if (v.status === 'IN_BEARBEITUNG') statusSetzen(v, 'EINGEREICHT', 'Vorgang zurück in den Eingang gelegt', voller(a.benutzer!));
  return { ok: true };
}

/** Vorgangstypen mit Geldleistung: Feld in v.daten, das den maximalen Anspruch enthält. */
export const BETRAGS_TYPEN: Record<string, string> = {
  KOSTENERSTATTUNG: 'voraussichtlich', ZAHNERSATZ: 'festzuschuss', FAHRKOSTEN: 'erstattung', KIEFERORTHOPAEDIE: 'kassenanteil',
  KUENSTLICHE_BEFRUCHTUNG: 'zuschuss', VERHINDERUNGSPFLEGE: 'erstattbar', KURZZEITPFLEGE: 'erstattbar', WOHNUMFELD: 'zuschuss',
  ENTLASTUNGSBETRAG: 'erstattbar', ZUZAHLUNGSBEFREIUNG: 'erstattung',
};

export function istBetragsTyp(typ: string): boolean {
  return typ in BETRAGS_TYPEN;
}

function entscheiden(a: Anfrage) {
  const sb = a.benutzer!;
  const v = sbVorgang(a);
  const { entscheidung, betrag, begruendung, zusatz } = a.body || {};
  if (v.bearbeiterId !== sb.id) throw new ApiFehler(403, 'Bitte übernehmen Sie den Vorgang, bevor Sie entscheiden.');
  if (v.status === 'RUECKFRAGE') throw new ApiFehler(409, 'Es besteht eine offene Rückfrage an den Versicherten.');
  if (v.status !== 'IN_BEARBEITUNG') throw new ApiFehler(409, 'Der Vorgang kann in diesem Status nicht entschieden werden.');
  if (v.benutzerId === sb.id) throw new ApiFehler(403, 'Eigene Vorgänge dürfen nicht selbst entschieden werden.');
  entscheidungTreffen(a, v, { entscheidung, betrag, begruendung, zusatz }, { name: voller(sb), sb });
  return detail(a, false);
}

export interface Entscheidung {
  entscheidung: 'GENEHMIGT' | 'ABGELEHNT' | string;
  betrag?: number;
  begruendung?: string;
  zusatz?: Record<string, any>;
}

/** Fachliche Entscheidung über einen Vorgang – durch Sachbearbeitung oder die automatisierte Prüfung (Dunkelverarbeitung). */
export function entscheidungTreffen(a: Anfrage, v: Vorgang, e: Entscheidung, akteur: { name: string; absender?: string; sb?: Benutzer }) {
  const { entscheidung, betrag, begruendung, zusatz } = e;
  const sb = akteur.sb;
  const vers = a.store.benutzer.find(b => b.id === v.benutzerId);
  const extern = !vers && v.externKontakt?.email ? v.externKontakt : undefined;

  if (entscheidung === 'ABGELEHNT') {
    if (!begruendung || String(begruendung).trim().length < 20) throw new ApiFehler(400, 'Bitte begründen Sie die Ablehnung (mindestens 20 Zeichen).', 'begruendung');
    v.ablehnungsgrund = String(begruendung).trim();
    v.bescheidAm = new Date().toLocaleDateString('sv-SE');
    statusSetzen(v, 'ABGELEHNT', v.typ === 'WIDERSPRUCH' ? 'Widerspruch zurückgewiesen' : 'Antrag abgelehnt', akteur.name);
    folgenAblehnung(a, v);
    if (extern) {
      versenden('EMAIL', extern.email, `Ihr Anliegen ${v.vorgangsnummer}`,
        `Guten Tag ${extern.name},\n\nleider können wir Ihrem Anliegen „${v.titel}“ nicht entsprechen.\n\nBegründung: ${v.ablehnungsgrund}\n\nGegen diese Entscheidung können Sie innerhalb eines Monats schriftlich Widerspruch einlegen.\n\nIhre VitaPlus`);
    }
    if (vers) {
      const rechtsbehelf = v.typ === 'WIDERSPRUCH'
        ? 'Gegen diesen Widerspruchsbescheid können Sie innerhalb eines Monats Klage beim zuständigen Sozialgericht erheben.'
        : 'Gegen diese Entscheidung können Sie innerhalb eines Monats nach Bekanntgabe Widerspruch einlegen – direkt online in Ihrem Vorgang.';
      postfachNachricht(vers.id, `${v.typ === 'WIDERSPRUCH' ? 'Widerspruchsbescheid' : 'Bescheid'} zu ${v.vorgangsnummer}`,
        `${anrede(vers)},\n\nleider können wir Ihrem Antrag „${v.titel}“ nicht entsprechen.\n\nBegründung: ${v.ablehnungsgrund}\n\n${rechtsbehelf}\n\nMit freundlichen Grüßen\n${akteur.absender || akteur.name}`,
        { kategorie: 'LEISTUNG', absender: 'VitaPlus ' + (v.zustaendig || 'Leistungsabteilung'), vorgangId: v.id, wichtig: true,
          anhaenge: [{ id: 'bs' + v.id, name: `Bescheid_${v.vorgangsnummer}.pdf`, groesseBytes: 52000, mimeType: 'application/pdf', hochgeladenAm: new Date().toISOString() }] });
    }
    return;
  }
  if (entscheidung !== 'GENEHMIGT') throw new ApiFehler(400, 'Ungültige Entscheidung', 'entscheidung');

  let text = 'Antrag genehmigt';
  let status: 'GENEHMIGT' | 'TEILWEISE_GENEHMIGT' | 'VERSENDET' = 'GENEHMIGT';
  if (istBetragsTyp(v.typ)) {
    const b = Number(betrag);
    if (!(b > 0)) throw new ApiFehler(400, 'Bitte geben Sie den Erstattungsbetrag an.', 'betrag');
    if (b > (v.betragBeantragt || 0)) throw new ApiFehler(400, 'Der Betrag darf den beantragten Betrag nicht übersteigen.', 'betrag');
    if (sb && b > (sb.freigabeLimit ?? 0)) throw new ApiFehler(403, `Beträge über ${euro(sb.freigabeLimit ?? 0)} müssen von der Teamleitung freigegeben werden.`, 'betrag', 'FREIGABELIMIT');
    const erwartet = Number(v.daten[BETRAGS_TYPEN[v.typ]]) || b;
    if (b > erwartet + 0.005 && sb && !sb.teamleitung) {
      throw new ApiFehler(400, `Der Betrag übersteigt den berechneten Leistungsanspruch von ${euro(erwartet)}. Kulanzentscheidungen trifft die Teamleitung.`, 'betrag', 'KULANZ');
    }
    if (b < erwartet - 0.005) {
      if (!begruendung || String(begruendung).trim().length < 20) {
        throw new ApiFehler(400, 'Bei einer Teilgenehmigung ist eine Begründung (mindestens 20 Zeichen) erforderlich.', 'begruendung');
      }
      status = 'TEILWEISE_GENEHMIGT';
    }
    v.betragErstattet = b;
    text = `${status === 'TEILWEISE_GENEHMIGT' ? 'Teilweise genehmigt' : 'Genehmigt'}: ${euro(b)}`;
  }
  const r = nachGenehmigung(a, v, zusatz || {});
  if (r.status) status = r.status;
  if (r.text) text = r.text;
  v.bescheidAm = new Date().toLocaleDateString('sv-SE');
  statusSetzen(v, status, text, akteur.name);
  if (begruendung) v.historie[v.historie.length - 1].text += ` – ${String(begruendung).trim()}`;
  if (extern) externeBestaetigung(a, v, extern, r.nachricht);
  if (vers) {
    postfachNachricht(vers.id, `Entscheidung zu Ihrem Antrag ${v.vorgangsnummer}`,
      `${anrede(vers)},\n\nwir haben Ihren Antrag „${v.titel}“ geprüft. ` +
      (v.betragErstattet !== undefined && istBetragsTyp(v.typ)
        ? `Wir übernehmen ${euro(v.betragErstattet)}.` + (status === 'TEILWEISE_GENEHMIGT' ? `\n\nBegründung: ${begruendung}\n\nGegen diese Entscheidung können Sie innerhalb eines Monats Widerspruch einlegen.` : '')
        : r.nachricht || 'Wir freuen uns, Ihnen mitteilen zu können, dass wir Ihren Antrag genehmigt haben.') +
      `\n\nMit freundlichen Grüßen\n${akteur.absender || akteur.name}`,
      { kategorie: v.typ === 'PFLEGEGRAD' ? 'LEISTUNG' : 'LEISTUNG', absender: 'VitaPlus ' + (v.zustaendig || 'Leistungsabteilung'), vorgangId: v.id,
        anhaenge: [{ id: 'bs' + v.id, name: `Bescheid_${v.vorgangsnummer}.pdf`, groesseBytes: 48000, mimeType: 'application/pdf', hochgeladenAm: new Date().toISOString() }] });
  }
}

function neueVersichertennummer(nachname: string): string {
  const buchstabe = (nachname.normalize('NFD').replace(/[^A-Za-z]/g, '').charAt(0) || 'X').toUpperCase();
  let nr: string;
  do nr = buchstabe + String(100000000 + Math.floor(Math.random() * 899999990));
  while (db().stammdaten.some(s => s.versichertennummer === nr) || db().benutzer.some(b => b.versichertennummer === nr));
  return nr;
}

/** Bestätigung an Antragstellende ohne Online-Zugang (E-Mail). */
function externeBestaetigung(a: Anfrage, v: Vorgang, an: { name: string; email: string }, nachricht?: string) {
  if (v.typ === 'MITGLIEDSANTRAG') {
    const nr = v.daten['versichertennummer'];
    const st = a.store.stammdaten.find(s => s.versichertennummer === nr);
    const familie = st?.familie?.length ? `\n\nMitversichert sind ab demselben Tag:\n${st.familie.map(f => `- ${f.vorname} ${f.nachname} (Versichertennummer ${f.versichertennummer})`).join('\n')}` : '';
    versenden('EMAIL', an.email, 'Willkommen bei der VitaPlus – Ihre Mitgliedsbestätigung',
      `Guten Tag ${an.name},\n\nherzlich willkommen! Ihre Mitgliedschaft bei der VitaPlus beginnt am ${formatDatum(v.daten['beginn'])}.\n\nIhre Versichertennummer: ${nr}${familie}\n\n` +
      `Ihre Gesundheitskarte erhalten Sie in den nächsten Tagen per Post. ${v.daten['arbeitgeber'] ? `Ihren Arbeitgeber (${v.daten['arbeitgeber']}) haben wir über den Wechsel informiert. ` : ''}` +
      `Mit Ihrer Versichertennummer und Ihrem Geburtsdatum können Sie sich jetzt in der Online-Geschäftsstelle registrieren.\n\nIhre VitaPlus`,
      { text: 'Jetzt registrieren', ziel: `/registrieren?versichertennummer=${nr}&geburtsdatum=${v.daten['geburtsdatum']}` });
    return;
  }
  versenden('EMAIL', an.email, `Ihr Anliegen ${v.vorgangsnummer}`,
    `Guten Tag ${an.name},\n\n${nachricht || `wir haben Ihr Anliegen „${v.titel}“ bearbeitet.`}\n\nIhre VitaPlus`);
}

interface Folge { status?: 'GENEHMIGT' | 'VERSENDET'; text?: string; nachricht?: string }

function familienmitgliedAktivieren(a: Anfrage, v: Vorgang) {
  const vers = a.store.benutzer.find(b => b.id === v.benutzerId)!;
  const f = a.store.familie.find(x => x.id === v.daten['familienmitgliedId']);
  if (!f) return;
  f.status = 'AKTIV';
  const basis = vers.versichertennummer || 'X000000000';
  const anzahl = a.store.familie.filter(x => x.hauptversicherterId === vers.id && x.versichertennummer).length;
  f.versichertennummer = basis.substring(0, 1) + String(Number(basis.substring(1)) + anzahl + 1).padStart(9, '0');
  if (f.beziehung === 'KIND' && alterAm(f.geburtsdatum) < 25) vers.kinderAnzahl = Math.max(vers.kinderAnzahl, a.store.familie.filter(x => x.hauptversicherterId === vers.id && x.beziehung !== 'EHEPARTNER' && x.beziehung !== 'LEBENSPARTNER' && x.status === 'AKTIV').length);
  a.store.karten.push({
    id: 'k' + f.id, benutzerId: vers.id, familienmitgliedId: f.id, inhaber: `${f.vorname} ${f.nachname}`,
    kartennummer: `80276 ${f.versichertennummer.substring(1, 6)} ${f.versichertennummer.substring(6)}0 ${anzahl}`,
    gueltigBis: `${heute().getFullYear() + 5}-12-31`, status: 'VERSENDET', fotoVorhanden: false,
  });
}

function nachGenehmigung(a: Anfrage, v: Vorgang, zusatz: Record<string, any>): Folge {
  const vers = a.store.benutzer.find(b => b.id === v.benutzerId);
  const d = v.daten;
  switch (v.typ) {
    case 'ERSATZKARTE': {
      const neu = a.store.karten.find(k => k.id === d['neueKarteId']);
      if (neu) neu.status = 'VERSENDET';
      return { status: 'VERSENDET', text: 'Karte produziert und versendet', nachricht: 'Ihre neue Gesundheitskarte ist unterwegs. Bitte aktivieren Sie sie nach Erhalt in der Online-Geschäftsstelle.' };
    }
    case 'FAMILIENVERSICHERUNG':
    case 'GEBURT':
      familienmitgliedAktivieren(a, v);
      return { nachricht: 'Die Familienversicherung ist eingerichtet. Die Gesundheitskarte senden wir Ihnen in den nächsten Tagen zu.' };
    case 'NAMENSAENDERUNG': {
      if (!vers) return {};
      vers.nachname = d['neuerName'];
      const karte = a.store.karten.find(k => k.benutzerId === vers.id && !k.familienmitgliedId && k.status === 'AKTIV');
      if (karte) karte.inhaber = voller(vers);
      return { text: 'Name geändert, neue Karte wird automatisch produziert' + (vers.bank && !vers.bank.kontoinhaber.includes(vers.nachname) ? '; Hinweis: Kontoinhaber weicht ab' : '') };
    }
    case 'PFLEGEGRAD': {
      const grad = Number(zusatz['pflegegrad']);
      if (!(grad >= 1 && grad <= 5)) throw new ApiFehler(400, 'Bitte geben Sie den festgestellten Pflegegrad (1–5) laut Gutachten an.', 'pflegegrad');
      if (!vers) return {};
      let akte = a.store.pflege.find(p => p.benutzerId === vers.id);
      if (akte && grad <= akte.pflegegrad) throw new ApiFehler(400, 'Bei einer Höherstufung muss der neue Pflegegrad über dem bisherigen liegen. Andernfalls lehnen Sie den Antrag ab.', 'pflegegrad');
      if (!akte) {
        akte = { id: 'p' + vers.id, benutzerId: vers.id, person: voller(vers), pflegegrad: grad as any, seit: new Date().toLocaleDateString('sv-SE'), leistungsart: d['leistung'] || 'PFLEGEGELD',
          pflegepersonen: d['pflegeperson'] ? [{ name: d['pflegeperson'], stundenProWoche: 10, rentenversichert: false }] : [], entlastungGenutzt: {}, verhinderungKurzzeitGenutzt: {} };
        a.store.pflege.push(akte);
      } else {
        akte.pflegegrad = grad as any;
      }
      return { text: `Pflegegrad ${grad} festgestellt`, nachricht: `nach dem Gutachten des Medizinischen Dienstes haben wir Pflegegrad ${grad} festgestellt. Die Leistungen erhalten Sie ab dem Monat der Antragstellung.` };
    }
    case 'ARBEITGEBERWECHSEL':
      if (vers) { vers.arbeitgeber = d['arbeitgeber']; vers.bruttoMonat = Number(d['brutto']); vers.beschaeftigung = 'ANGESTELLT';
        vers.versicherungsart = Number(d['brutto']) * 12 > 77400 ? 'FREIWILLIG' : 'PFLICHT'; }
      return {};
    case 'BESCHAEFTIGUNGSENDE':
      if (vers) { vers.arbeitgeber = undefined; if (d['anschluss'] === 'KEINE') vers.versicherungsart = 'FREIWILLIG'; }
      return {};
    case 'SELBSTSTAENDIGKEIT':
      if (vers && d['ereignis'] === 'BEGINN' && d['hauptberuflich'] === 'JA') { vers.beschaeftigung = 'SELBSTSTAENDIG'; vers.versicherungsart = 'FREIWILLIG'; vers.bruttoMonat = Number(d['einkommen']); }
      if (vers && d['ereignis'] === 'ENDE') { vers.beschaeftigung = 'ANGESTELLT'; vers.versicherungsart = 'PFLICHT'; }
      return {};
    case 'STUDIUM':
      if (vers && vers.beschaeftigung !== 'ANGESTELLT') { vers.beschaeftigung = 'STUDENT'; vers.versicherungsart = 'STUDENT'; }
      return {};
    case 'RENTE':
      if (vers) { vers.beschaeftigung = 'RENTNER'; vers.versicherungsart = d['kvdrVoraussichtlich'] ? 'KVDR' : 'FREIWILLIG'; }
      return {};
    case 'KUENDIGUNG':
      if (vers) vers.mitgliedBis = d['endeZum'];
      return { text: `Kündigung bestätigt zum ${d['endeZum']}`, nachricht: `wir bestätigen das Ende Ihrer Mitgliedschaft zum ${String(d['endeZum']).split('-').reverse().join('.')}. Schade, dass Sie gehen!` };
    case 'EINKOMMEN':
      if (vers) vers.bruttoMonat = Number(d['einkommen']);
      return { text: 'Beitrag neu festgesetzt' };
    case 'STEUERBESCHEID':
      if (vers) vers.bruttoMonat = Math.round(Number(d['einkuenfte']) / 12 * 100) / 100;
      return { text: 'Beitrag auf Grundlage des Steuerbescheids festgesetzt' };
    case 'STAMMDATEN_KORREKTUR':
      if (vers && d['feld'] === 'GEBURTSORT') vers.geburtsort = d['richtig'];
      if (vers && d['feld'] === 'GEBURTSNAME') vers.geburtsname = d['richtig'];
      if (vers && d['feld'] === 'GEBURTSDATUM') vers.geburtsdatum = String(d['richtig']).split('.').reverse().join('-');
      return { text: 'Stammdaten korrigiert' };
    case 'STAATSANGEHOERIGKEIT':
      if (vers) vers.staatsangehoerigkeit = d['staatsangehoerigkeit'];
      return {};
    case 'WIDERSPRUCH': {
      const bezug = a.store.vorgaenge.find(x => x.id === v.bezugVorgangId);
      if (bezug) {
        if (istBetragsTyp(bezug.typ) && bezug.betragBeantragt) bezug.betragErstattet = Number(zusatz['betrag']) || bezug.betragBeantragt;
        bezug.ablehnungsgrund = undefined;
        statusSetzen(bezug, 'GENEHMIGT', 'Abhilfe im Widerspruchsverfahren', 'Widerspruchsstelle');
      }
      return { text: 'Dem Widerspruch wurde abgeholfen', nachricht: `Ihrem Widerspruch geben wir statt. Der ursprüngliche Vorgang ${bezug?.vorgangsnummer || ''} wurde entsprechend geändert.` };
    }
    case 'ENTLASTUNGSBETRAG': {
      const akte = vers && a.store.pflege.find(p => p.benutzerId === vers.id);
      if (akte) akte.entlastungGenutzt[d['monat']] = (akte.entlastungGenutzt[d['monat']] || 0) + Number(a.body?.betrag || 0);
      return {};
    }
    case 'VERHINDERUNGSPFLEGE':
    case 'KURZZEITPFLEGE': {
      const akte = vers && a.store.pflege.find(p => p.benutzerId === vers.id);
      const jahr = String(d['von']).substring(0, 4);
      if (akte) akte.verhinderungKurzzeitGenutzt[jahr] = (akte.verhinderungKurzzeitGenutzt[jahr] || 0) + Number(a.body?.betrag || 0);
      return {};
    }
    case 'ZUZAHLUNGSBEFREIUNG':
      return { nachricht: `wir befreien Sie für ${d['jahr']} von weiteren Zuzahlungen. Ihren Befreiungsausweis finden Sie als Anhang.` };
    case 'FAMILIE_FRAGEBOGEN':
      if (d['voraussetzungEntfallen']) {
        const f = a.store.familie.find(x => x.id === d['familienmitgliedId']);
        if (f) { f.status = 'BEENDET'; f.abgemeldetAm = toIso(new Date(heute().getFullYear(), heute().getMonth() + 1, 0)); }
        return { text: 'Familienversicherung beendet (Voraussetzungen entfallen)', nachricht: 'nach Prüfung Ihrer Angaben endet die Familienversicherung zum Monatsende. Wir beraten Sie gern zu einer eigenen Versicherung.' };
      }
      return { text: 'Familienversicherung besteht fort' };
    case 'MITGLIEDSANTRAG': {
      const nr = neueVersichertennummer(String(d['nachname'] || 'X'));
      const [strasse, hausnummer] = String(d['strasse'] || '').match(/^(.*?)\s+(\d+\s*[a-zA-Z]?)$/)?.slice(1) ?? [d['strasse'], ''];
      const familie = (d['familieMitversichern'] && Array.isArray(d['familie']) ? d['familie'] : []).map((f: any, i: number) => ({
        vorname: f.vorname, nachname: f.nachname, geburtsdatum: f.geburtsdatum, beziehung: f.beziehung,
        versichertennummer: nr.substring(0, 1) + String(Number(nr.substring(1)) + i + 1).padStart(9, '0'),
      }));
      a.store.stammdaten.push({ versichertennummer: nr, vorname: d['vorname'], nachname: d['nachname'], geburtsdatum: d['geburtsdatum'], tarif: d['tarif'] || 'BASIS',
        beschaeftigung: ['ANGESTELLT', 'STUDENT', 'SELBSTSTAENDIG', 'RENTNER'].includes(d['status']) ? d['status'] : d['status'] === 'AUSZUBILDEND' ? 'ANGESTELLT' : 'ANGESTELLT',
        adresse: { strasse, hausnummer, plz: d['plz'], ort: d['ort'], land: 'Deutschland' }, registriert: false,
        anrede: d['anrede'], email: d['email'], telefon: d['telefon'], mitgliedSeit: d['beginn'], arbeitgeber: d['arbeitgeber'], bruttoMonat: Number(d['brutto']) || undefined, familie });
      v.daten['versichertennummer'] = nr;
      return { text: `Mitgliedschaft zum ${formatDatum(d['beginn'])} angelegt, Versichertennummer ${nr}` };
    }
    case 'TODESFALL': {
      const verstorben = a.store.benutzer.find(b => b.id === d['verstorbenerBenutzerId']);
      if (verstorben) { verstorben.mitgliedBis = d['sterbedatum']; verstorben.konto = 'GELOESCHT'; sitzungen.alleEntfernenFuer(verstorben.id); }
      return { text: 'Todesfall erfasst, Mitgliedschaft beendet', nachricht: 'unser herzliches Beileid. Wir haben die Mitgliedschaft beendet. Zu Sterbegeld-Ansprüchen und offenen Erstattungen melden wir uns gesondert bei Ihnen.' };
    }
    case 'DIGA': {
      const code = 'VP' + Math.random().toString(36).substring(2, 10).toUpperCase();
      d['freischaltcode'] = code;
      return { nachricht: `Ihr Freischaltcode für ${d['digaName']} lautet: ${code}` };
    }
    case 'RATENZAHLUNG':
      return { nachricht: `wir sind mit der Zahlung in ${d['raten']?.length} Raten zu je ${euro(d['rate'])} einverstanden. Bitte halten Sie die Termine ein, sonst wird der Gesamtbetrag sofort fällig.` };
    default:
      return {};
  }
}

function folgenAblehnung(a: Anfrage, v: Vorgang) {
  if (v.typ === 'FAMILIENVERSICHERUNG' || v.typ === 'GEBURT') {
    const f = a.store.familie.find(x => x.id === v.daten['familienmitgliedId']);
    if (f) f.status = 'ABGELEHNT';
  }
  if (v.typ === 'ERSATZKARTE') {
    a.store.karten = a.store.karten.filter(k => k.id !== v.daten['neueKarteId']);
  }
}

function rueckfrage(a: Anfrage) {
  const sb = a.benutzer!;
  const v = sbVorgang(a);
  const text = String(a.body?.text || '').trim();
  if (v.bearbeiterId !== sb.id) throw new ApiFehler(403, 'Bitte übernehmen Sie den Vorgang zuerst.');
  if (v.status !== 'IN_BEARBEITUNG') throw new ApiFehler(409, 'Rückfragen sind nur bei Vorgängen in Bearbeitung möglich.');
  if (text.length < 20) throw new ApiFehler(400, 'Bitte formulieren Sie die Rückfrage mit mindestens 20 Zeichen.', 'text');
  const bisher = v.historie.filter(h => h.status === 'RUECKFRAGE').length;
  if (bisher >= 3) throw new ApiFehler(409, 'Es wurden bereits 3 Rückfragen gestellt. Bitte entscheiden Sie nach Aktenlage.');
  v.rueckfrage = text;
  v.rueckfrageFrist = toIso(addTage(new Date(), RUECKFRAGE_FRIST_TAGE));
  statusSetzen(v, 'RUECKFRAGE', 'Rückfrage an Versicherten gestellt', voller(sb));
  const vers = a.store.benutzer.find(b => b.id === v.benutzerId)!;
  postfachNachricht(vers.id, `Rückfrage zu Ihrem Antrag ${v.vorgangsnummer}`,
    `${anrede(vers)},\n\n${text}\n\nSie können Unterlagen direkt in Ihrem Vorgang nachreichen.\n\nMit freundlichen Grüßen\n${voller(sb)}`,
    { kategorie: 'LEISTUNG', absender: 'VitaPlus Leistungsabteilung', vorgangId: v.id, wichtig: true });
  return detail(a);
}

function notiz(a: Anfrage) {
  const v = sbVorgang(a);
  const text = String(a.body?.text || '').trim();
  if (text.length < 3) throw new ApiFehler(400, 'Die Notiz ist zu kurz.', 'text');
  v.daten['notizen'] = [...(v.daten['notizen'] || []), { zeitpunkt: new Date().toISOString(), von: voller(a.benutzer!), text }];
  return detail(a);
}

function versicherte(a: Anfrage) {
  const s = (a.query.get('suche') || '').trim().toLowerCase();
  if (s.length < 3) throw new ApiFehler(400, 'Bitte geben Sie mindestens 3 Zeichen ein.', 'suche');
  return a.store.benutzer.filter(b => b.rolle === 'VERSICHERTER')
    .filter(b => `${b.vorname} ${b.nachname}`.toLowerCase().includes(s) || (b.versichertennummer || '').toLowerCase().includes(s) || b.email.toLowerCase().includes(s))
    .map(b => ({ id: b.id, name: voller(b), versichertennummer: b.versichertennummer, email: b.email, geburtsdatum: b.geburtsdatum, gesperrt: b.gesperrt, tarif: b.tarif, ort: b.adresse.ort }));
}

function entsperren(a: Anfrage) {
  const b = a.store.benutzer.find(x => x.id === a.params['id'] && x.rolle === 'VERSICHERTER');
  if (!b) throw new ApiFehler(404, 'Versicherte/r nicht gefunden.');
  if (!b.gesperrt) throw new ApiFehler(409, 'Der Zugang ist nicht gesperrt.');
  if (!a.body?.identitaetGeprueft) throw new ApiFehler(400, 'Bitte bestätigen Sie, dass die Identität geprüft wurde.', 'identitaetGeprueft');
  b.gesperrt = false;
  b.fehlversuche = 0;
  postfachNachricht(b.id, 'Ihr Zugang wurde entsperrt',
    `${anrede(b)},\n\nIhr Zugang zur Online-Geschäftsstelle wurde durch unseren Kundenservice entsperrt.\n\nIhre VitaPlus`,
    { kategorie: 'SYSTEM', absender: 'VitaPlus Sicherheit' });
  return { ok: true };
}

function sperren(a: Anfrage) {
  const b = a.store.benutzer.find(x => x.id === a.params['id'] && x.rolle === 'VERSICHERTER');
  if (!b) throw new ApiFehler(404, 'Versicherte/r nicht gefunden.');
  const grund = String(a.body?.grund || '').trim();
  if (grund.length < 10) throw new ApiFehler(400, 'Bitte dokumentieren Sie den Grund der Sperre (mindestens 10 Zeichen).', 'grund');
  b.gesperrt = true;
  sitzungen.alleEntfernenFuer(b.id);
  protokollieren({ benutzerId: b.id, akteurId: a.benutzer!.id, ereignis: 'KONTO_GESPERRT', details: `Sperre durch Mitarbeitende: ${grund}`, stufe: 'KRITISCH' });
  return { ok: true };
}

export const SB_ROUTEN: Route[] = [
  { methode: 'POST', muster: '/api/sb/versicherte/:id/sperren', handler: sperren, rolle: 'SACHBEARBEITER' },
  { methode: 'GET', muster: '/api/sb/vorgaenge', handler: eingang, rolle: 'SACHBEARBEITER' },
  { methode: 'GET', muster: '/api/sb/statistik', handler: statistik, rolle: 'SACHBEARBEITER' },
  { methode: 'GET', muster: '/api/sb/vorgaenge/:id', handler: detail, rolle: 'SACHBEARBEITER' },
  { methode: 'POST', muster: '/api/sb/vorgaenge/:id/uebernehmen', handler: uebernehmen, rolle: 'SACHBEARBEITER' },
  { methode: 'POST', muster: '/api/sb/vorgaenge/:id/freigeben', handler: freigeben, rolle: 'SACHBEARBEITER' },
  { methode: 'POST', muster: '/api/sb/vorgaenge/:id/entscheidung', handler: entscheiden, rolle: 'SACHBEARBEITER' },
  { methode: 'POST', muster: '/api/sb/vorgaenge/:id/rueckfrage', handler: rueckfrage, rolle: 'SACHBEARBEITER' },
  { methode: 'POST', muster: '/api/sb/vorgaenge/:id/notiz', handler: notiz, rolle: 'SACHBEARBEITER' },
  { methode: 'GET', muster: '/api/sb/versicherte', handler: versicherte, rolle: 'SACHBEARBEITER' },
  { methode: 'POST', muster: '/api/sb/versicherte/:id/entsperren', handler: entsperren, rolle: 'SACHBEARBEITER' },
];
