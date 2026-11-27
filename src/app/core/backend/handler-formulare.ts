import { BEITRAG, BINDUNGSFRIST_MONATE, DIGA_LISTE, DMP_PROGRAMME, PFLEGE, WIDERSPRUCHSFRIST_TAGE } from '../konfiguration';
import { alleFelder, formular, FORMULARE } from '../formulare/formular-katalog';
import { bereinige, pruefeFormular } from '../formulare/formular-pruefung';
import { FormularDef } from '../formulare/formular-typen';
import { Benutzer, Familienmitglied, Vorgang, widerspruchsfaehig } from '../models';
import { berechneBeitrag } from '../util/berechnungen';
import { addMonate, addTage, alterAm, formatDatum, heute, heuteIso, istFeiertag, istWochenende, jetztIso, parseIso, tageZwischen, toIso } from '../util/datum';
import { Anfrage, ApiFehler, anrede, euro, postfachNachricht, Route, statusSetzen, voller, eingangErfassen, verarbeitungStarten, versenden } from './api-kontext';
import { neueId, neueVorgangsnummer } from './db';
import { belastungsgrenze, entlastungVerfuegbar, gemeinsamesBudget, kontostand, pflegeakte, protokollieren, zuzahlungenSumme } from './fachlogik';
import { anhaengePruefen, ANTRAG_TYPEN, antragValidieren, detail, neuerVorgang } from './handler-vorgaenge';

interface Ergebnis {
  titel?: string;
  daten?: Record<string, any>;
  betrag?: number;
  /** Status, der unmittelbar nach dem Einreichen gesetzt wird */
  folgeStatus?: Vorgang['status'];
  folgeText?: string;
  hinweise?: string[];
}

interface Kontext {
  a: Anfrage;
  b: Benutzer;
  d: Record<string, any>;
  def: FormularDef;
  familie: Familienmitglied[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fehler = (meldung: string, feld?: string, status = 422) => new ApiFehler(status, meldung, feld);

function personAlter(k: Kontext, feld = 'person'): number {
  const id = k.d[feld];
  if (!id || id === 'SELBST') return alterAm(k.b.geburtsdatum);
  const f = k.familie.find(x => x.id === id);
  return f ? alterAm(f.geburtsdatum) : alterAm(k.b.geburtsdatum);
}

function personName(k: Kontext, feld = 'person'): string {
  const id = k.d[feld];
  if (!id || id === 'SELBST') return `${k.b.vorname} ${k.b.nachname}`;
  const f = k.familie.find(x => x.id === id);
  return f ? `${f.vorname} ${f.nachname}` : '';
}

function offenerVorgang(k: Kontext, typ: string, extra: (v: Vorgang) => boolean = () => true) {
  return k.a.store.vorgaenge.find(v => v.benutzerId === k.b.id && v.typ === typ && ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE'].includes(v.status) && extra(v));
}

function zeitraum(k: Kontext, von = 'von', bis = 'bis') {
  if (k.d[von] && k.d[bis] && parseIso(k.d[bis]) < parseIso(k.d[von])) throw fehler('Das Ende darf nicht vor dem Beginn liegen.', bis, 400);
  return k.d[von] && k.d[bis] ? tageZwischen(k.d[von], k.d[bis]) + 1 : 0;
}

function arbeitstageZwischen(von: string, bis: Date): number {
  let n = 0;
  let d = addTage(parseIso(von), 1);
  while (d <= bis) {
    if (!istWochenende(d) && !istFeiertag(d)) n++;
    d = addTage(d, 1);
  }
  return n;
}

function pflegegradMindestens(k: Kontext, grad: number) {
  const akte = pflegeakte(k.a.store, k.b.id);
  if (!akte || akte.pflegegrad < grad) {
    throw fehler(grad === 1 ? 'Diese Leistung setzt einen anerkannten Pflegegrad voraus.' : `Diese Leistung setzt mindestens Pflegegrad ${grad} voraus.`);
  }
  return akte;
}

const SONDERREGELN: Record<string, (k: Kontext) => Ergebnis | void> = {
  HAUSHALTSHILFE_SCHWANGERSCHAFT: k => {
    zeitraum(k);
    const et = parseIso(k.d['entbindungstermin']);
    if (et < addTage(heute(), -56) || et > addMonate(heute(), 9)) throw fehler('Bitte prüfen Sie den Entbindungstermin.', 'entbindungstermin', 400);
  },
  HAEUSLICHE_KRANKENPFLEGE: k => {
    const tage = zeitraum(k);
    if (tage > 28 && parseIso(k.d['von']) <= heute()) throw fehler('Eine Erstverordnung umfasst höchstens 4 Wochen. Bitte reichen Sie eine Folgeverordnung ein.', 'bis');
    const verspaetet = arbeitstageZwischen(k.d['verordnungsdatum'], heute()) > 3;
    return { daten: { verspaetet }, hinweise: verspaetet ? ['Die Verordnung wurde später als 3 Arbeitstage nach Ausstellung eingereicht. Kosten bis zum Eingang können ggf. nicht übernommen werden.'] : [] };
  },
  HEILMITTEL: () => undefined,
  REHA: k => {
    if (k.d['letzteReha'] && tageZwischen(k.d['letzteReha'], heute()) < 4 * 365 && k.d['art'] !== 'MUTTER_KIND') {
      throw fehler('Eine erneute Reha ist in der Regel frühestens 4 Jahre nach der letzten Maßnahme möglich. Bitte fügen Sie eine ärztliche Begründung für die vorzeitige Reha bei.', 'letzteReha');
    }
    if (offenerVorgang(k, 'REHA')) throw fehler('Es liegt bereits ein Reha-Antrag zur Bearbeitung vor.', undefined, 409);
    const erwerbstaetig = ['ANGESTELLT', 'SELBSTSTAENDIG'].includes(k.b.beschaeftigung) && k.d['person'] === 'SELBST';
    if (erwerbstaetig && alterAm(k.b.geburtsdatum) < 63 && k.d['art'] !== 'MUTTER_KIND') {
      return {
        daten: { weitergeleitetAn: 'Deutsche Rentenversicherung' }, folgeStatus: 'IN_BEARBEITUNG',
        folgeText: 'Zuständigkeit geprüft: Antrag an die Deutsche Rentenversicherung weitergeleitet (§ 14 SGB IX)',
        hinweise: ['Für Erwerbstätige ist in der Regel die Rentenversicherung zuständig. Wir haben Ihren Antrag dorthin weitergeleitet.'],
      };
    }
    return undefined;
  },
  ANSCHLUSSREHA: k => {
    zeitraum(k, 'aufnahme', 'entlassung');
    if (tageZwischen(k.d['entlassung'], heute()) > 14) throw fehler('Eine Anschlussreha muss innerhalb von 14 Tagen nach der Entlassung beginnen.', 'entlassung');
    return { folgeStatus: 'GENEHMIGT', folgeText: 'Anschlussrehabilitation im Direktverfahren genehmigt' };
  },
  FAHRKOSTEN: k => {
    if (k.d['anlass'] === 'SONSTIGES' && !k.d['genehmigungVorhanden']) {
      throw fehler('Fahrten zu sonstigen ambulanten Behandlungen müssen vorab genehmigt werden. Bitte stellen Sie zuerst einen Antrag auf Genehmigung.', 'genehmigungVorhanden');
    }
    const kosten = k.d['verkehrsmittel'] === 'PKW' ? r2(Number(k.d['kilometer']) * 0.3) : Number(k.d['kosten']);
    const zuzahlung = r2(Math.min(kosten, Math.max(5, Math.min(10, kosten * 0.1))));
    return { daten: { kostenBerechnet: kosten, zuzahlung, erstattung: r2(Math.max(0, kosten - zuzahlung)) }, betrag: kosten };
  },
  KRANKENTRANSPORT: () => undefined,
  KIEFERORTHOPAEDIE: k => {
    if (Number(k.d['kig']) < 3) throw fehler('Kieferorthopädische Behandlungen werden ab KIG-Grad 3 übernommen.', 'kig');
    if (personAlter(k) >= 18 && !k.d['kieferchirurgisch']) {
      throw fehler('Bei Erwachsenen übernehmen wir die Kosten nur bei schweren Kieferanomalien mit kombiniert kieferchirurgischer Behandlung.', 'kieferchirurgisch');
    }
    const kosten = Number(k.d['kosten']);
    return { betrag: kosten, daten: { kassenanteil: r2(kosten * 0.8), eigenanteilVorlaeufig: r2(kosten * 0.2) },
      hinweise: ['Ihren Eigenanteil von 20 % erstatten wir nach erfolgreichem Abschluss der Behandlung.'] };
  },
  KUENSTLICHE_BEFRUCHTUNG: k => {
    if (k.d['verheiratet'] !== 'JA') throw fehler('Die Krankenkasse darf Kosten nur für verheiratete Paare übernehmen.', 'verheiratet');
    const alter = alterAm(k.b.geburtsdatum);
    const alterPartner = alterAm(k.d['geburtsdatumPartner']);
    const frauMax = 40, mannMax = 50;
    const eigeneMax = k.b.anrede === 'HERR' ? mannMax : frauMax;
    const partnerMax = k.b.anrede === 'HERR' ? frauMax : mannMax;
    if (alter < 25 || alterPartner < 25) throw fehler('Beide Partner müssen mindestens 25 Jahre alt sein.');
    if (alter > eigeneMax || alterPartner > partnerMax) throw fehler('Die Altersgrenze für eine Kostenbeteiligung ist überschritten.');
    const maxVersuche = k.d['methode'] === 'IUI' ? 8 : 3;
    if (Number(k.d['versuch']) > maxVersuche) throw fehler(`Für diese Methode übernehmen wir höchstens ${maxVersuche} Versuche.`, 'versuch');
    const quote = k.b.tarif === 'PREMIUM' ? 75 : 50;
    return { betrag: Number(k.d['kosten']), daten: { zuschussProzent: quote, zuschuss: r2(Number(k.d['kosten']) * quote / 100) } };
  },
  PSYCHOTHERAPIE: k => {
    if (Number(k.d['absagen']) < 5) {
      throw fehler('Bitte weisen Sie mindestens 5 Absagen von Praxen mit Kassenzulassung nach oder nutzen Sie die Terminservicestelle (116117).', 'absagen');
    }
  },
  DIGA: k => {
    const diga = DIGA_LISTE.find(x => x.id === k.d['diga'])!;
    const aktiv = k.a.store.vorgaenge.find(v => v.benutzerId === k.b.id && v.typ === 'DIGA' && v.daten['diga'] === diga.id &&
      ['EINGEREICHT', 'IN_BEARBEITUNG', 'GENEHMIGT'].includes(v.status) && tageZwischen(v.erstelltAm.substring(0, 10), heute()) < diga.dauerTage);
    if (aktiv) throw fehler(`Für „${diga.name}“ besteht bereits eine laufende Verordnung (${aktiv.vorgangsnummer}).`, 'diga', 409);
    const daten = { digaName: diga.name, preis: diga.preis, laufzeitTage: diga.dauerTage };
    if (k.d['weg'] === 'REZEPT') {
      const code = 'VP' + Math.random().toString(36).substring(2, 8).toUpperCase() + Date.now().toString(36).slice(-6).toUpperCase();
      return { daten: { ...daten, freischaltcode: code }, betrag: diga.preis, folgeStatus: 'GENEHMIGT', folgeText: 'Rezept geprüft, Freischaltcode erzeugt' };
    }
    return { daten, betrag: diga.preis };
  },
  DMP: k => {
    const bereits = k.a.store.vorgaenge.find(v => v.benutzerId === k.b.id && v.typ === 'DMP' && v.daten['programm'] === k.d['programm'] && !['ABGELEHNT', 'STORNIERT'].includes(v.status));
    if (bereits) throw fehler('Sie sind bereits in dieses Programm eingeschrieben oder die Einschreibung wird geprüft.', 'programm', 409);
    return { titel: `DMP: ${DMP_PROGRAMME.find(p => p.code === k.d['programm'])?.name}` };
  },
  ZUZAHLUNGSBEFREIUNG: k => {
    const jahr = String(k.d['jahr']);
    const bereits = k.a.store.vorgaenge.find(v => v.benutzerId === k.b.id && v.typ === 'ZUZAHLUNGSBEFREIUNG' && v.daten['jahr'] === jahr && !['ABGELEHNT', 'STORNIERT'].includes(v.status));
    if (bereits) throw fehler(`Für ${jahr} liegt bereits ein Antrag vor (${bereits.vorgangsnummer}).`, 'jahr', 409);
    const g = belastungsgrenze(Number(k.d['bruttoeinnahmen']), Number(k.d['angehoerige']), Number(k.d['kinder']), !!k.d['chronisch']);
    const erfasst = zuzahlungenSumme(k.a.store, k.b.id, jahr);
    if (k.d['art'] === 'ERSTATTUNG') {
      const geleistet = Number(k.d['geleistet']);
      if (geleistet <= g.grenze) {
        throw fehler(`Ihre Belastungsgrenze von ${euro(g.grenze)} ist mit ${euro(geleistet)} noch nicht erreicht.`, 'geleistet');
      }
      return { betrag: r2(geleistet - g.grenze), titel: `Zuzahlungsbefreiung ${jahr}`,
        daten: { ...g, erfasst, erstattung: r2(geleistet - g.grenze), plausibel: Math.abs(erfasst - geleistet) < 50 } };
    }
    return { betrag: g.grenze, titel: `Zuzahlungsbefreiung ${jahr} (Vorauszahlung)`, daten: { ...g, erfasst, vorauszahlung: g.grenze },
      hinweise: [`Nach Zahlung von ${euro(g.grenze)} erhalten Sie Ihren Befreiungsausweis.`] };
  },
  PFLEGEGRAD: k => {
    if (offenerVorgang(k, 'PFLEGEGRAD')) throw fehler('Es liegt bereits ein Antrag auf einen Pflegegrad vor.', undefined, 409);
    const fuerSelbst = k.d['fuer'] === 'SELBST';
    if (!fuerSelbst) {
      const angehoeriger = k.a.store.benutzer.find(b => b.versichertennummer === k.d['versichertennummerAngehoeriger']);
      const vollmacht = k.a.store.vollmachten.find(v => v.status === 'AKTIV' && v.umfang.includes('PFLEGE') && angehoeriger && v.benutzerId === angehoeriger.id &&
        `${v.vorname} ${v.nachname}`.toLowerCase() === `${k.b.vorname} ${k.b.nachname}`.toLowerCase());
      if (!angehoeriger) throw fehler('Zu dieser Versichertennummer ist keine Person bei der VitaPlus versichert.', 'versichertennummerAngehoeriger');
      if (!vollmacht) return { hinweise: ['Bitte reichen Sie eine Vollmacht der pflegebedürftigen Person nach.'], daten: { vollmachtFehlt: true } };
      return undefined;
    }
    const akte = pflegeakte(k.a.store, k.b.id);
    if (k.d['antragsart'] === 'ERST' && akte && akte.pflegegrad > 0) throw fehler(`Sie haben bereits Pflegegrad ${akte.pflegegrad}. Bitte beantragen Sie eine Höherstufung.`, 'antragsart', 409);
    if (k.d['antragsart'] === 'HOEHER' && !akte) throw fehler('Eine Höherstufung setzt einen bestehenden Pflegegrad voraus.', 'antragsart');
    if (k.d['antragsart'] === 'HOEHER' && akte?.pflegegrad === 5) throw fehler('Sie haben bereits den höchsten Pflegegrad.', 'antragsart');
    if (k.d['begutachtung'] === 'TELEFON' && k.d['antragsart'] !== 'HOEHER') throw fehler('Ein Telefoninterview ist nur bei Höherstufungen möglich.', 'begutachtung', 400);
    if ((k.d['bereiche'] || []).length === 0) throw fehler('Bitte wählen Sie mindestens einen Bereich.', 'bereiche', 400);
    return { titel: k.d['antragsart'] === 'HOEHER' ? 'Höherstufung Pflegegrad' : 'Antrag auf Pflegegrad' };
  },
  VERHINDERUNGSPFLEGE: k => {
    const akte = pflegegradMindestens(k, 2);
    const tage = zeitraum(k);
    if (tage > PFLEGE.verhinderungspflegeMaxTage) throw fehler(`Verhinderungspflege ist bis zu ${PFLEGE.verhinderungspflegeMaxTage / 7} Wochen pro Jahr möglich.`, 'bis');
    const budget = gemeinsamesBudget(akte, k.d['von'].substring(0, 4));
    let max = budget.rest;
    if (k.d['ersatzpflege'] === 'VERWANDT') max = Math.min(max, PFLEGE.pflegegeld[akte.pflegegrad] * 2);
    const erstattbar = r2(Math.min(Number(k.d['kosten']), max));
    if (erstattbar <= 0) throw fehler('Ihr Jahresbudget für Verhinderungs- und Kurzzeitpflege ist ausgeschöpft.');
    return { betrag: Number(k.d['kosten']), daten: { erstattbar, budgetRest: budget.rest, tage },
      hinweise: erstattbar < Number(k.d['kosten']) ? [`Voraussichtlich erstattungsfähig: ${euro(erstattbar)}.`] : [] };
  },
  KURZZEITPFLEGE: k => {
    const akte = pflegegradMindestens(k, 2);
    const tage = zeitraum(k);
    if (tage > PFLEGE.kurzzeitpflegeMaxTage) throw fehler(`Kurzzeitpflege ist bis zu ${PFLEGE.kurzzeitpflegeMaxTage / 7} Wochen pro Jahr möglich.`, 'bis');
    const budget = gemeinsamesBudget(akte, k.d['von'].substring(0, 4));
    return { betrag: Number(k.d['kosten']), daten: { erstattbar: r2(Math.min(Number(k.d['kosten']), budget.rest)), budgetRest: budget.rest, tage } };
  },
  PFLEGEHILFSMITTEL: k => {
    pflegegradMindestens(k, 1);
    if (k.d['art'] === 'VERBRAUCH') {
      const laufend = k.a.store.vorgaenge.find(v => v.benutzerId === k.b.id && v.typ === 'PFLEGEHILFSMITTEL' && v.daten['art'] === 'VERBRAUCH' && v.status === 'GENEHMIGT');
      if (laufend) throw fehler('Sie erhalten bereits regelmäßig Pflegehilfsmittel zum Verbrauch. Änderungen teilen Sie bitte Ihrem Lieferanten mit.', 'art', 409);
      return { daten: { monatsbudget: PFLEGE.pflegehilfsmittelMonat }, folgeStatus: 'GENEHMIGT', folgeText: `Monatliche Versorgung bis ${euro(PFLEGE.pflegehilfsmittelMonat)} genehmigt` };
    }
    return undefined;
  },
  WOHNUMFELD: k => {
    pflegegradMindestens(k, 1);
    if (k.d['eigentum'] === 'MIETE' && !k.d['zustimmungVermieter']) throw fehler('Bitte holen Sie vor dem Umbau die Zustimmung Ihres Vermieters ein.', 'zustimmungVermieter', 400);
    const kosten = Number(k.d['kosten']);
    return { betrag: kosten, daten: { zuschuss: Math.min(kosten, PFLEGE.wohnumfeldMax) },
      hinweise: kosten > PFLEGE.wohnumfeldMax ? [`Der Zuschuss ist auf ${euro(PFLEGE.wohnumfeldMax)} je Maßnahme begrenzt.`] : [] };
  },
  ENTLASTUNGSBETRAG: k => {
    const akte = pflegegradMindestens(k, 1);
    const monat = k.d['leistungsmonat'].substring(0, 7);
    const v = entlastungVerfuegbar(akte, parseIso(k.d['leistungsmonat']));
    const betrag = Number(k.d['betrag']);
    if (v.verfuegbar <= 0) throw fehler('Ihr Entlastungsbetrag für diesen Zeitraum ist bereits ausgeschöpft.');
    return { betrag, titel: `Entlastungsbetrag ${monat.substring(5)}/${monat.substring(0, 4)}`, daten: { monat, erstattbar: r2(Math.min(betrag, v.verfuegbar)), verfuegbar: v.verfuegbar } };
  },
  PFLEGEPERSON: k => {
    const rv = Number(k.d['stunden']) >= PFLEGE.pflegepersonMindestStunden && Number(k.d['tage']) >= 2 && Number(k.d['erwerbsstunden']) <= 30;
    return { daten: { rentenversicherungspflichtig: rv },
      hinweise: [rv ? 'Wir zahlen für die Pflegeperson Beiträge zur Rentenversicherung.' : 'Die Voraussetzungen für Rentenversicherungsbeiträge sind nicht erfüllt (mind. 10 Stunden an 2 Tagen, höchstens 30 Stunden Erwerbstätigkeit).'] };
  },
  ARBEITGEBERWECHSEL: k => {
    if (k.b.beschaeftigung === 'RENTNER' && !k.d['mehrfach']) {
      // Rentner mit Beschäftigung bleiben KVdR-versichert
    }
    if (parseIso(k.d['beginn']) < addTage(heute(), -42)) throw fehler('Der Beginn liegt mehr als 6 Wochen zurück. Bitte wenden Sie sich an Ihren Arbeitgeber, der uns die Anmeldung übermittelt.', 'beginn');
    const hinweise: string[] = [];
    if (Number(k.d['brutto']) * 12 > BEITRAG.versicherungspflichtgrenzeJahr) hinweise.push('Ihr Entgelt liegt über der Versicherungspflichtgrenze. Sie werden freiwilliges Mitglied – wir beraten Sie gern.');
    if (k.d['art'] === 'MINIJOB') hinweise.push('Bei einem Minijob besteht keine eigene Versicherungspflicht. Bitte prüfen Sie, ob eine Familienversicherung möglich ist.');
    return { hinweise, titel: `Neuer Arbeitgeber: ${k.d['arbeitgeber']}` };
  },
  BESCHAEFTIGUNGSENDE: k => {
    if (k.b.beschaeftigung !== 'ANGESTELLT') throw fehler('Diese Meldung ist nur für Beschäftigte vorgesehen.');
    const hinweise = k.d['anschluss'] === 'KEINE' ? ['Ohne Anschlussversicherung führen wir Ihre Versicherung als freiwillige Mitgliedschaft fort (obligatorische Anschlussversicherung). Bitte reichen Sie Ihre Einkommensnachweise ein.'] : [];
    return { hinweise };
  },
  SELBSTSTAENDIGKEIT: k => {
    if (k.d['ereignis'] === 'ENDE' && k.b.beschaeftigung !== 'SELBSTSTAENDIG') throw fehler('Für Sie ist keine Selbstständigkeit gespeichert.', 'ereignis');
    if (k.d['ereignis'] === 'BEGINN' && k.b.beschaeftigung === 'SELBSTSTAENDIG') throw fehler('Sie sind bereits als selbstständig gespeichert.', 'ereignis');
    if (k.d['ereignis'] === 'BEGINN' && k.d['hauptberuflich'] === 'JA') {
      const beitrag = berechneBeitrag({ beschaeftigung: 'SELBSTSTAENDIG', bruttoMonat: Number(k.d['einkommen']), kinder: k.b.kinderAnzahl, alter: alterAm(k.b.geburtsdatum), krankengeldanspruch: k.d['krankengeld'] === 'JA', bundesland: '' });
      return { daten: { voraussichtlicherBeitrag: beitrag.summeVersicherter }, hinweise: [`Ihr voraussichtlicher Monatsbeitrag: ${euro(beitrag.summeVersicherter)}.`] };
    }
    return undefined;
  },
  STUDIUM: k => {
    if (alterAm(k.b.geburtsdatum) >= 30) return { hinweise: ['Ab dem 30. Lebensjahr ist eine studentische Versicherung nur in Ausnahmefällen möglich. Wir prüfen Ihren Fall.'] };
    return undefined;
  },
  AUSBILDUNG: k => {
    zeitraum(k, 'beginn', 'ende');
    return Number(k.d['verguetung']) <= 325 ? { hinweise: ['Bei einer Vergütung bis 325 € trägt Ihr Ausbildungsbetrieb die Beiträge allein.'] } : undefined;
  },
  RENTE: k => {
    const jahre = tageZwischen(k.b.mitgliedSeit, heute()) / 365;
    return { daten: { kvdrVoraussichtlich: jahre >= 25 }, hinweise: [jahre >= 25 ? 'Sie erfüllen voraussichtlich die Vorversicherungszeit für die Krankenversicherung der Rentner.' : 'Wir prüfen, ob Sie die Vorversicherungszeit für die Krankenversicherung der Rentner erfüllen.'] };
  },
  AUSLAND: k => {
    zeitraum(k);
    const hinweise: string[] = [];
    if (k.d['eu'] === 'NEIN') hinweise.push('Außerhalb von EU/EWR/Schweiz besteht kein gesetzlicher Versicherungsschutz. Wir empfehlen eine private Auslandsreise-Krankenversicherung.');
    if (k.d['art'] === 'WOHNSITZ') hinweise.push('Mit der Verlegung des Wohnsitzes kann Ihre Mitgliedschaft enden. Eine Beraterin bzw. ein Berater meldet sich bei Ihnen.');
    return { hinweise };
  },
  KUENDIGUNG: k => {
    const g = k.d['grund'];
    if (g === 'GKV_WECHSEL') throw fehler('Bei einem Wechsel zu einer anderen gesetzlichen Krankenkasse ist keine Kündigung erforderlich. Ihre neue Kasse übernimmt die Meldung.', 'grund');
    if (g === 'SONDERKUENDIGUNG') throw fehler('Ein Sonderkündigungsrecht besteht derzeit nicht, da die VitaPlus ihren Zusatzbeitrag nicht erhöht hat.', 'grund');
    const bindungEnde = addMonate(parseIso(k.b.mitgliedSeit), BINDUNGSFRIST_MONATE);
    if (g === 'PKV') {
      const versicherungsfrei = k.b.beschaeftigung === 'SELBSTSTAENDIG' || (k.b.beschaeftigung === 'ANGESTELLT' && (k.b.bruttoMonat || 0) * 12 > BEITRAG.versicherungspflichtgrenzeJahr);
      if (!versicherungsfrei) throw fehler('Sie sind versicherungspflichtig. Ein Wechsel in die private Krankenversicherung ist nicht möglich.', 'grund');
      if (bindungEnde > heute()) throw fehler(`Sie sind bis ${formatDatum(toIso(bindungEnde))} an die VitaPlus gebunden (Bindungsfrist ${BINDUNGSFRIST_MONATE} Monate).`, 'grund');
    }
    const ende = new Date(heute().getFullYear(), heute().getMonth() + 3, 0);
    const offen = kontostand(k.a.store, k.b.id).offen;
    return { titel: 'Kündigung der Mitgliedschaft', daten: { endeZum: toIso(ende), offeneBeitraege: offen },
      hinweise: [`Ihre Mitgliedschaft endet zum ${formatDatum(toIso(ende))}.`, ...(offen > 0 ? [`Bitte begleichen Sie offene Beiträge in Höhe von ${euro(offen)}.`] : [])] };
  },
  EINKOMMEN: k => {
    const neu = berechneBeitrag({ beschaeftigung: k.b.beschaeftigung, bruttoMonat: Number(k.d['einkommen']), kinder: k.b.kinderAnzahl, alter: alterAm(k.b.geburtsdatum), krankengeldanspruch: true, bundesland: '' });
    const alt = berechneBeitrag({ beschaeftigung: k.b.beschaeftigung, bruttoMonat: k.b.bruttoMonat || 0, kinder: k.b.kinderAnzahl, alter: alterAm(k.b.geburtsdatum), krankengeldanspruch: true, bundesland: '' });
    return { daten: { beitragAlt: alt.summeVersicherter, beitragNeu: neu.summeVersicherter }, hinweise: [`Ihr Beitrag ändert sich voraussichtlich von ${euro(alt.summeVersicherter)} auf ${euro(neu.summeVersicherter)} monatlich.`] };
  },
  STEUERBESCHEID: k => {
    const doppelt = k.a.store.vorgaenge.find(v => v.benutzerId === k.b.id && v.typ === 'STEUERBESCHEID' && v.daten['jahr'] === k.d['jahr'] && v.status !== 'STORNIERT');
    if (doppelt) throw fehler(`Der Bescheid für ${k.d['jahr']} liegt uns bereits vor.`, 'jahr', 409);
    return { titel: `Einkommensteuerbescheid ${k.d['jahr']}` };
  },
  RATENZAHLUNG: k => {
    const kto = kontostand(k.a.store, k.b.id);
    if (kto.offen <= 0) throw fehler('Für Sie bestehen keine offenen Beitragsforderungen.');
    if (offenerVorgang(k, 'RATENZAHLUNG') || offenerVorgang(k, 'STUNDUNG')) throw fehler('Es liegt bereits ein Antrag auf Ratenzahlung oder Stundung vor.', undefined, 409);
    const rate = r2(kto.offen / Number(k.d['anzahlRaten']));
    if (rate < 50) throw fehler('Eine Rate muss mindestens 50 € betragen. Bitte wählen Sie weniger Raten.', 'anzahlRaten');
    const raten = Array.from({ length: Number(k.d['anzahlRaten']) }, (_, i) => ({ faellig: toIso(addMonate(parseIso(k.d['ersteRate']), i)), betrag: rate }));
    return { betrag: kto.offen, daten: { offen: kto.offen, rate, raten } };
  },
  STUNDUNG: k => {
    const kto = kontostand(k.a.store, k.b.id);
    if (kto.offen <= 0) throw fehler('Für Sie bestehen keine offenen Beitragsforderungen.');
    if (parseIso(k.d['bis']) > addMonate(heute(), 6)) throw fehler('Eine Stundung ist höchstens für 6 Monate möglich.', 'bis');
    if (parseIso(k.d['bis']) <= heute()) throw fehler('Das Datum muss in der Zukunft liegen.', 'bis', 400);
    if (offenerVorgang(k, 'RATENZAHLUNG') || offenerVorgang(k, 'STUNDUNG')) throw fehler('Es liegt bereits ein Antrag auf Ratenzahlung oder Stundung vor.', undefined, 409);
    return { betrag: kto.offen, daten: { offen: kto.offen, stundungszinsProzent: 0.5 } };
  },
  GEBURT: k => {
    if (tageZwischen(k.d['geburtsdatum'], heute()) > 365) throw fehler('Für Kinder, die älter als ein Jahr sind, nutzen Sie bitte die Anmeldung zur Familienversicherung.', 'geburtsdatum');
    if (k.familie.some(f => f.vorname.toLowerCase() === String(k.d['vorname']).trim().toLowerCase() && f.geburtsdatum === k.d['geburtsdatum'])) {
      throw fehler('Dieses Kind ist bereits angemeldet.', 'vorname', 409);
    }
    if (k.d['anderesElternteilVersicherung'] === 'PKV' && k.d['verheiratet']) {
      const ek = Number(k.d['einkommenAnderesElternteil']);
      if (ek * 12 > BEITRAG.versicherungspflichtgrenzeJahr && ek > (k.b.bruttoMonat || 0)) {
        throw fehler('Ihr Kind kann nicht familienversichert werden, weil der privat versicherte Elternteil mehr verdient und über der Versicherungspflichtgrenze liegt. Bitte versichern Sie Ihr Kind privat.');
      }
    }
    return { titel: `Geburt von ${k.d['vorname']} ${k.d['nachname']}` };
  },
  ELTERNZEIT: k => {
    const tage = zeitraum(k);
    if (tage > 3 * 366) throw fehler('Elternzeit kann höchstens 3 Jahre je Kind betragen.', 'bis');
    const kind = k.familie.find(f => f.id === k.d['kind']);
    if (kind && alterAm(kind.geburtsdatum, parseIso(k.d['bis'])) >= 8) throw fehler('Elternzeit ist bis zum 8. Geburtstag des Kindes möglich.', 'bis');
    return { hinweise: k.d['teilzeit'] === 'JA' ? [] : ['Während der Elternzeit sind Sie beitragsfrei versichert, solange Sie Elterngeld beziehen oder Elternzeit nehmen.'] };
  },
  FAMILIENSTAND: k => {
    if (k.d['familienstand'] === k.b.familienstand) throw fehler('Dieser Familienstand ist bereits gespeichert.', 'familienstand', 400);
    const hinweise: string[] = [];
    if (['VERHEIRATET', 'LEBENSPARTNERSCHAFT'].includes(k.d['familienstand'])) hinweise.push('Ist Ihr Partner bzw. Ihre Partnerin nicht selbst versichert? Dann prüfen Sie die kostenlose Familienversicherung.');
    if (k.d['namensaenderung']) hinweise.push('Bitte beantragen Sie die Namensänderung zusätzlich unter „Persönliche Daten“.');
    return { hinweise, folgeStatus: 'GENEHMIGT', folgeText: 'Familienstand gespeichert' };
  },
  FAMILIE_FRAGEBOGEN: k => {
    const f = k.familie.find(x => x.id === k.d['angehoeriger']);
    if (!f) throw fehler('Bitte wählen Sie eine familienversicherte Person.', 'angehoeriger', 400);
    const grenze = k.d['status'] === 'MINIJOB' ? BEITRAG.familienEinkommensgrenzeMinijob : BEITRAG.familienEinkommensgrenze;
    const ende = Number(k.d['einkommen']) > grenze || ['BESCHAEFTIGT', 'SELBSTSTAENDIG'].includes(k.d['status']) || !!k.d['anderweitigVersichert'];
    const offen = k.a.store.vorgaenge.find(v => v.benutzerId === k.b.id && v.typ === 'FAMILIE_FRAGEBOGEN' && v.status === 'RUECKFRAGE');
    if (offen && !k.a.trocken) statusSetzen(offen, 'IN_BEARBEITUNG', `Fragebogen für ${f.vorname} beantwortet`, voller(k.b));
    return { titel: `Fragebogen Familienversicherung – ${f.vorname} ${f.nachname}`, daten: { familienmitgliedId: f.id, voraussetzungEntfallen: ende },
      hinweise: ende ? ['Nach Ihren Angaben sind die Voraussetzungen der Familienversicherung möglicherweise entfallen. Wir prüfen das und melden uns.'] : [] };
  },
  TODESFALL: k => {
    const v = k.a.store.benutzer.find(b => b.versichertennummer && b.versichertennummer === k.d['versichertennummer']);
    return { daten: { verstorbenerBenutzerId: v?.id || null } };
  },
  STAMMDATEN_KORREKTUR: k => {
    if (k.d['feld'] === 'GEBURTSDATUM' && !/^\d{2}\.\d{2}\.\d{4}$/.test(k.d['richtig'])) throw fehler('Bitte geben Sie das Datum im Format TT.MM.JJJJ an.', 'richtig', 400);
  },
  STAATSANGEHOERIGKEIT: k => {
    if (String(k.d['staatsangehoerigkeit']).trim().toLowerCase() === (k.b.staatsangehoerigkeit || '').toLowerCase()) throw fehler('Diese Staatsangehörigkeit ist bereits gespeichert.', 'staatsangehoerigkeit', 400);
  },
  WIDERSPRUCH: k => {
    const bezug = k.a.store.vorgaenge.find(v => v.id === k.d['bezugVorgangId'] && v.benutzerId === k.b.id);
    if (!bezug || !widerspruchsfaehig(bezug)) throw fehler('Gegen diesen Vorgang ist kein Widerspruch möglich.', 'bezugVorgangId', 400);
    const bescheid = bezug.bescheidAm || bezug.geaendertAm.substring(0, 10);
    // Bekanntgabe gilt am dritten Tag nach Versand als erfolgt
    const fristEnde = addTage(addMonate(parseIso(bescheid), 1), 3);
    if (heute() > fristEnde) throw fehler(`Die Widerspruchsfrist ist am ${formatDatum(toIso(fristEnde))} abgelaufen.`, 'bezugVorgangId');
    if (k.a.store.vorgaenge.some(v => v.typ === 'WIDERSPRUCH' && v.bezugVorgangId === bezug.id && v.status !== 'STORNIERT')) {
      throw fehler('Gegen diese Entscheidung haben Sie bereits Widerspruch eingelegt.', 'bezugVorgangId', 409);
    }
    return { titel: `Widerspruch gegen ${bezug.vorgangsnummer}`, daten: { bezugVorgangsnummer: bezug.vorgangsnummer, fristEnde: toIso(fristEnde), widerspruchsfristTage: WIDERSPRUCHSFRIST_TAGE } };
  },
  AKTENEINSICHT: () => undefined,
  DATENSCHUTZANFRAGE: k => {
    if (['AUSKUNFT', 'UEBERTRAGBARKEIT'].includes(k.d['recht'])) {
      return { folgeStatus: 'GENEHMIGT', folgeText: 'Datenauskunft bereitgestellt', hinweise: ['Ihre Datenkopie steht im Datenschutz-Center zum Download bereit.'] };
    }
    if (k.d['recht'] === 'LOESCHUNG') return { hinweise: ['Bitte beachten Sie: Sozialdaten unterliegen gesetzlichen Aufbewahrungsfristen und können erst danach gelöscht werden.'] };
    return undefined;
  },
  DATENSCHUTZBESCHWERDE: () => undefined,
  LEISTUNGSAUSKUNFT: k => {
    zeitraum(k);
    return { folgeStatus: 'GENEHMIGT', folgeText: 'Patientenquittung erstellt', hinweise: ['Ihre Leistungsauskunft finden Sie unter „Dokumente“.'] };
  },
  RUECKRUF: k => {
    const d = parseIso(k.d['datum']);
    if (istWochenende(d) || istFeiertag(d)) throw fehler('Rückrufe sind montags bis freitags möglich.', 'datum', 400);
    if (k.d['datum'] === heuteIso()) {
      const ende = Number(String(k.d['zeitfenster']).split('-')[1]);
      if (new Date().getHours() + 1 > ende) throw fehler('Dieses Zeitfenster ist heute nicht mehr verfügbar.', 'zeitfenster', 400);
    }
    if (offenerVorgang(k, 'RUECKRUF')) throw fehler('Sie haben bereits einen Rückruf vereinbart.', undefined, 409);
    const [v, b] = String(k.d['zeitfenster']).split('-');
    return { titel: `Rückruf am ${formatDatum(k.d['datum'])}, ${v}–${b} Uhr` };
  },
  BESCHWERDE: () => ({ hinweise: ['Sie erhalten innerhalb von 2 Werktagen eine persönliche Rückmeldung von unserem Beschwerdemanagement.'] }),
};

function referenzenPruefen(k: Kontext) {
  for (const feld of alleFelder(k.def)) {
    const w = k.d[feld.name];
    if (!w) continue;
    if (feld.typ === 'person' && w !== 'SELBST' && !k.familie.some(f => f.id === w)) throw fehler('Die ausgewählte Person ist bei Ihnen nicht mitversichert.', feld.name, 400);
    if (feld.typ === 'kind' && !k.familie.some(f => f.id === w)) throw fehler('Bitte wählen Sie eine mitversicherte Person.', feld.name, 400);
    if (feld.typ === 'vorgang' && !k.a.store.vorgaenge.some(v => v.id === w && v.benutzerId === k.b.id)) throw fehler('Der Vorgang wurde nicht gefunden.', feld.name, 400);
  }
}

export function formularVerarbeiten(a: Anfrage, b: Benutzer, code: string, roh: Record<string, any>, anhaenge: any[], entwurf: boolean): Ergebnis & { titel: string } {
  const def = formular(code);
  if (!def) throw new ApiFehler(400, 'Unbekannte Antragsart', 'typ');
  if (def.nurFuer && !def.nurFuer.includes(b.beschaeftigung)) throw fehler('Dieser Antrag steht für Ihre Versicherungsart nicht zur Verfügung.', undefined, 403);
  if (entwurf) {
    if (!def.entwurfErlaubt) throw fehler('Für diesen Antrag ist kein Zwischenspeichern möglich.', undefined, 400);
    return { titel: `${def.kurz} (Entwurf)`, daten: roh };
  }
  const daten = { ...roh, anhaenge };
  const feldFehler = pruefeFormular(def, daten);
  if (feldFehler.length) throw new ApiFehler(400, feldFehler[0].meldung, feldFehler[0].feld, 'VALIDIERUNG', feldFehler);
  if (def.einwilligung && !roh['einwilligung']) throw new ApiFehler(400, 'Bitte bestätigen Sie die Erklärung.', 'einwilligung');
  const dateiFeld = alleFelder(def).find(f => f.typ === 'datei');
  anhaengePruefen(anhaenge, false, dateiFeld?.maxDateien ?? 5);
  const familie = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status === 'AKTIV');
  const k: Kontext = { a, b, d: bereinige(def, roh), def, familie };
  referenzenPruefen(k);
  if (ANTRAG_TYPEN.includes(code)) {
    const r = antragValidieren(a, code, k.d, false);
    return { titel: r.titel, daten: r.daten, betrag: r.betrag };
  }
  const r = SONDERREGELN[code]?.(k) || {};
  const person = alleFelder(def).some(f => f.typ === 'person') ? personName(k) : undefined;
  return {
    ...r,
    titel: r.titel || (person && k.d['person'] !== 'SELBST' ? `${def.kurz} für ${person}` : def.kurz),
    daten: { ...k.d, ...(person ? { personName: person } : {}), ...(r.daten || {}) },
  };
}

function nachEinreichen(a: Anfrage, b: Benutzer, v: Vorgang, def: FormularDef, e: Ergebnis) {
  if (e.folgeStatus) statusSetzen(v, e.folgeStatus, e.folgeText || 'Automatisch bearbeitet', 'System');
  v.fristBis = toIso(addTage(heute(), def.bearbeitungTage));
  if (v.typ === 'GEBURT') {
    const f: Familienmitglied = {
      id: neueId('f'), hauptversicherterId: b.id, vorname: v.daten['vorname'], nachname: v.daten['nachname'], geburtsdatum: v.daten['geburtsdatum'],
      geschlecht: v.daten['geschlecht'], beziehung: 'KIND', status: 'BEANTRAGT', einkommenMonat: 0, inAusbildung: false, anderweitigVersichert: false,
      beantragtAm: heuteIso(), vorgangId: v.id,
    };
    a.store.familie.push(f);
    v.daten['familienmitgliedId'] = f.id;
  }
  if (v.typ === 'FAMILIENSTAND') {
    b.familienstand = v.daten['familienstand'];
  }
  if (v.typ === 'DIGA' && v.status === 'GENEHMIGT') {
    postfachNachricht(b.id, `Ihr Freischaltcode für ${v.daten['digaName']}`,
      `${anrede(b)},\n\nIhr Freischaltcode lautet: ${v.daten['freischaltcode']}\n\nGeben Sie den Code in der App ein. Die Nutzung ist für ${v.daten['laufzeitTage']} Tage freigeschaltet.\n\nIhre VitaPlus`,
      { kategorie: 'LEISTUNG', vorgangId: v.id, wichtig: true });
  }
  if (v.typ === 'LEISTUNGSAUSKUNFT') {
    a.store.dokumente.push({ id: neueId('d'), benutzerId: b.id, typ: 'PATIENTENQUITTUNG', bezeichnung: `Leistungsauskunft ${formatDatum(v.daten['von'])}–${formatDatum(v.daten['bis'])}`,
      angefordertAm: jetztIso(), dateiname: `Leistungsauskunft_${v.daten['von']}_${v.daten['bis']}.pdf`, parameter: { von: v.daten['von'], bis: v.daten['bis'], bereiche: (v.daten['bereiche'] || []).join(',') } });
  }
  if (v.typ === 'DATENSCHUTZANFRAGE' && v.status === 'GENEHMIGT') {
    protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'DATENAUSKUNFT', details: `Datenauskunft (${v.daten['recht']}) bereitgestellt` });
  }
  if (v.typ === 'BESCHWERDE') v.zustaendig = 'Beschwerdemanagement';
  if (!e.folgeStatus || e.folgeStatus !== 'GENEHMIGT') {
    postfachNachricht(b.id, `Eingangsbestätigung ${v.vorgangsnummer}`,
      `${anrede(b)},\n\nwir haben Ihren Antrag „${v.titel}“ erhalten. Zuständig ist unser Team ${v.zustaendig}. ` +
      `Die Bearbeitung dauert in der Regel bis zu ${def.bearbeitungTage} Tage.` + (e.hinweise?.length ? `\n\nHinweise:\n- ${e.hinweise.join('\n- ')}` : '') + '\n\nIhre VitaPlus',
      { kategorie: def.kategorie === 'PFLEGE' ? 'LEISTUNG' : def.kategorie === 'BEITRAG' ? 'BEITRAG' : def.kategorie === 'MITGLIEDSCHAFT' ? 'MITGLIEDSCHAFT' : 'LEISTUNG', vorgangId: v.id });
  }
}

function antragAnlegen(a: Anfrage) {
  const b = a.benutzer!;
  const { typ, daten, anhaenge, entwurf } = a.body || {};
  const def = formular(typ);
  if (!def) throw new ApiFehler(400, 'Unbekannte Antragsart', 'typ');
  if (entwurf && a.store.vorgaenge.filter(v => v.benutzerId === b.id && v.status === 'ENTWURF').length >= 5) {
    throw new ApiFehler(409, 'Sie können höchstens 5 Entwürfe speichern. Bitte löschen Sie nicht mehr benötigte Entwürfe.');
  }
  const e = formularVerarbeiten(a, b, typ, daten || {}, anhaenge || [], !!entwurf);
  const v = neuerVorgang(b, typ, e.titel, e.daten || {}, anhaenge || [], e.betrag);
  v.zustaendig = def.zustaendig;
  if (e.daten?.['bezugVorgangId']) v.bezugVorgangId = e.daten['bezugVorgangId'];
  if (entwurf) {
    v.status = 'ENTWURF';
    v.historie.push({ zeitpunkt: jetztIso(), status: 'ENTWURF', text: 'Entwurf gespeichert', von: voller(b) });
  } else {
    statusSetzen(v, 'EINGEREICHT', 'Antrag online eingereicht', voller(b));
    nachEinreichen(a, b, v, def, e);
  }
  eingangErfassen(a.store, v);
  return { ...v, hinweise: e.hinweise || [] };
}

function entwurfAktualisieren(a: Anfrage) {
  const v = detail(a);
  if (v.status !== 'ENTWURF') throw new ApiFehler(409, 'Nur Entwürfe können bearbeitet werden.');
  const def = formular(v.typ)!;
  const { daten, anhaenge, einreichen } = a.body || {};
  if (!einreichen) {
    v.daten = daten || {};
    v.anhaenge = anhaenge || [];
    v.geaendertAm = jetztIso();
    return v;
  }
  const e = formularVerarbeiten(a, a.benutzer!, v.typ, daten || {}, anhaenge || [], false);
  v.titel = e.titel;
  v.daten = e.daten || {};
  v.betragBeantragt = e.betrag;
  v.anhaenge = anhaenge || [];
  v.erstelltAm = jetztIso();
  v.zustaendig = def.zustaendig;
  statusSetzen(v, 'EINGEREICHT', 'Antrag online eingereicht', voller(a.benutzer!));
  nachEinreichen(a, a.benutzer!, v, def, e);
  verarbeitungStarten(v);
  return { ...v, hinweise: e.hinweise || [] };
}

function formulareListe(a: Anfrage) {
  const b = a.benutzer!;
  return FORMULARE.filter(f => !f.oeffentlich || f.code === 'TODESFALL').map(f => ({
    code: f.code, titel: f.titel, kurz: f.kurz, kategorie: f.kategorie, lebenslagen: f.lebenslagen, suchbegriffe: f.suchbegriffe,
    verfuegbar: !f.nurFuer || f.nurFuer.includes(b.beschaeftigung), bearbeitungTage: f.bearbeitungTage,
  }));
}

/** Fachliche Prüfung des Mitgliedsantrags (Beginn, Fristen, Vorversicherung, Angehörige). Liefert Hinweise oder wirft Fehler. */
export function mitgliedsantragPruefen(a: Anfrage, d: Record<string, any>): string[] {
  const hinweise: string[] = [];
  const alter = d['geburtsdatum'] ? alterAm(d['geburtsdatum']) : 30;
  if (d['geburtsdatum'] && alter < 15) throw fehler('Kinder und Jugendliche unter 15 Jahren werden in der Regel über die Familienversicherung eines Elternteils versichert.', 'geburtsdatum');
  if (d['vorversicherung'] === 'PKV' && alter >= 55) throw fehler('Eine Rückkehr aus der privaten in die gesetzliche Krankenversicherung ist ab 55 Jahren in der Regel nicht möglich.', 'vorversicherung');
  if (d['beginn']) {
    const beginn = parseIso(d['beginn']);
    if (beginn.getDate() !== 1) throw fehler('Die Mitgliedschaft kann nur zum Monatsersten beginnen.', 'beginn');
    if (beginn < new Date(heute().getFullYear(), heute().getMonth(), 1)) throw fehler('Ein rückwirkender Beginn ist nicht möglich.', 'beginn');
    if (d['vorversicherung'] === 'GKV' && d['versichertSeit']) {
      const fruehestens = addMonate(parseIso(d['versichertSeit']), BINDUNGSFRIST_MONATE);
      const ersterNachBindung = fruehestens.getDate() === 1 ? fruehestens : new Date(fruehestens.getFullYear(), fruehestens.getMonth() + 1, 1);
      if (beginn < ersterNachBindung) throw fehler(`Wegen der Bindungsfrist von ${BINDUNGSFRIST_MONATE} Monaten ist ein Wechsel frühestens zum ${formatDatum(toIso(ersterNachBindung))} möglich.`, 'beginn');
      const kuendigungsfrist = new Date(heute().getFullYear(), heute().getMonth() + 3, 1);
      if (beginn < kuendigungsfrist) throw fehler(`Wegen der Kündigungsfrist von 2 Monaten zum Monatsende ist der früheste Beginn der ${formatDatum(toIso(kuendigungsfrist))}.`, 'beginn');
    }
  }
  if (d['status'] === 'ANGESTELLT' && Number(d['brutto']) * 12 > BEITRAG.versicherungspflichtgrenzeJahr) hinweise.push('Ihr Einkommen liegt über der Versicherungspflichtgrenze – Sie werden als freiwilliges Mitglied versichert.');
  if (d['status'] === 'STUDENT' && alter >= 30) hinweise.push('Ab 30 Jahren ist eine studentische Versicherung nur in Ausnahmefällen möglich.');
  if (d['status'] === 'ARBEITSLOS') hinweise.push('Bitte teilen Sie der Agentur für Arbeit bzw. dem Jobcenter mit, dass Sie zur VitaPlus wechseln.');
  if (d['email'] && a.store.benutzer.some(b => b.email.toLowerCase() === String(d['email']).toLowerCase())) throw fehler('Zu dieser E-Mail-Adresse besteht bereits eine Mitgliedschaft. Bitte melden Sie sich an.', 'email', 409);
  if (d['familieMitversichern'] && Array.isArray(d['familie'])) {
    const partner = d['familie'].filter((f: any) => ['EHEPARTNER', 'LEBENSPARTNER'].includes(f?.beziehung));
    if (partner.length > 1) throw fehler('Es kann nur ein Ehe- oder Lebenspartner mitversichert werden.', 'familie');
    for (const f of d['familie']) {
      if (!f?.geburtsdatum) continue;
      const fa = alterAm(f.geburtsdatum);
      if (['KIND', 'STIEFKIND', 'ENKELKIND'].includes(f.beziehung) && fa >= 25) throw fehler(`${f.vorname} ist ${fa} Jahre alt. Kinder ab 25 Jahren können nur bei einer Behinderung mitversichert werden – bitte sprechen Sie uns an.`, 'familie');
      if (['KIND', 'STIEFKIND', 'ENKELKIND'].includes(f.beziehung) && fa >= 18) hinweise.push(`Für ${f.vorname} benötigen wir eine Schul- oder Ausbildungsbescheinigung. Wir melden uns dazu.`);
    }
  }
  if (d['iban'] && !d['kontoinhaber']) throw fehler('Bitte geben Sie den Kontoinhaber an.', 'kontoinhaber');
  return hinweise;
}

function oeffentlichEinreichen(a: Anfrage) {
  const code = a.params['code'];
  const def = formular(code);
  if (!def || !def.oeffentlich) throw new ApiFehler(404, 'Formular nicht gefunden.');
  const d = a.body?.daten || {};
  const anhaenge = a.body?.anhaenge || [];
  const feldFehler = pruefeFormular(def, { ...d, anhaenge });
  if (feldFehler.length) throw new ApiFehler(400, feldFehler[0].meldung, feldFehler[0].feld, 'VALIDIERUNG', feldFehler);
  if (def.einwilligung && !d['einwilligung']) throw new ApiFehler(400, 'Bitte bestätigen Sie die Erklärung.', 'einwilligung');
  anhaengePruefen(anhaenge, false, 5);
  const hinweise: string[] = [];
  const daten: Record<string, any> = bereinige(def, d);
  let titel = def.kurz;
  if (code === 'MITGLIEDSANTRAG') {
    hinweise.push(...mitgliedsantragPruefen(a, d));
    titel = `Mitgliedsantrag ${d['vorname']} ${d['nachname']}`;
  }
  if (code === 'TODESFALL') titel = `Todesfallmeldung ${d['name']}`;
  const v: Vorgang = {
    id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), benutzerId: 'extern', typ: code, titel, status: 'EINGEREICHT',
    erstelltAm: jetztIso(), geaendertAm: jetztIso(), daten, anhaenge, historie: [], zustaendig: def.zustaendig,
    externKontakt: { name: code === 'TODESFALL' ? d['melder'] : `${d['vorname']} ${d['nachname']}`, email: d['email'] || d['kontaktEmail'] },
    fristBis: toIso(addTage(heute(), def.bearbeitungTage)),
  };
  v.historie.push({ zeitpunkt: v.erstelltAm, status: 'EINGEREICHT', text: 'Über die Website eingereicht', von: v.externKontakt!.name });
  eingangErfassen(a.store, v);
  if (v.externKontakt?.email) {
    versenden('EMAIL', v.externKontakt.email, `Eingangsbestätigung ${v.vorgangsnummer}`,
      `Guten Tag ${v.externKontakt.name},\n\nvielen Dank – wir haben Ihre Angaben „${def.titel}“ erhalten. Ihre Vorgangsnummer lautet ${v.vorgangsnummer}.\n\n` +
      (code === 'MITGLIEDSANTRAG' ? 'Wir prüfen Ihren Antrag und senden Ihnen Ihre Mitgliedsbestätigung mit Ihrer Versichertennummer per E-Mail. Danach können Sie sich in der Online-Geschäftsstelle registrieren.' : 'Wir melden uns, sobald wir Ihr Anliegen bearbeitet haben.') +
      (hinweise.length ? `\n\nBitte beachten Sie:\n- ${hinweise.join('\n- ')}` : '') + '\n\nIhre VitaPlus');
  }
  return { vorgangsnummer: v.vorgangsnummer, status: v.status, hinweise, kontakt: v.externKontakt?.email };
}

export const FORMULAR_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/formulare', handler: formulareListe, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/antraege', handler: antragAnlegen, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/antraege/:id', handler: entwurfAktualisieren, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/oeffentlich/formulare/:code', handler: oeffentlichEinreichen, oeffentlich: true },
];
