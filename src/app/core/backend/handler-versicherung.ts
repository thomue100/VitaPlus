import { BEITRAG, BONUS_KATALOG, CHALLENGES, DIGA_LISTE, DMP_PROGRAMME, KRANKENGELD, PFLEGE, TARIFE } from '../konfiguration';
import { Gesundheitskarte } from '../models';
import { berechneBeitrag } from '../util/berechnungen';
import { addMonate, addTage, alterAm, formatDatum, heute, heuteIso, istWochenende, jetztIso, parseIso, toIso } from '../util/datum';
import { Anfrage, ApiFehler, anrede, pflicht, postfachNachricht, Route, statusSetzen, voller, eingangErfassen } from './api-kontext';
import { neueId, neueVorgangsnummer } from './db';
import { belastungsgrenze, entlastungVerfuegbar, gemeinsamesBudget, kontostand, pflegeakte, protokollieren, zuzahlungenSumme } from './fachlogik';
import { anhaengePruefen } from './handler-vorgaenge';
import { KURSE } from './seed-erweiterung';

// ---------------------------------------------------------------- Versicherung

function versicherung(a: Anfrage) {
  const b = a.benutzer!;
  const zeiten = [
    { von: b.mitgliedSeit, bis: b.mitgliedBis || null, art: ({ PFLICHT: 'Pflichtversicherung', FREIWILLIG: 'Freiwillige Versicherung', KVDR: 'Krankenversicherung der Rentner', STUDENT: 'Versicherung der Studierenden' } as any)[b.versicherungsart || 'PFLICHT'], kasse: 'VitaPlus' },
  ];
  if (b.id === 'u1') zeiten.push({ von: '2004-09-01', bis: '2008-12-31', art: 'Familienversicherung / Studierende', kasse: 'VitaPlus' });
  if (b.id === 'u3') zeiten.push({ von: '1955-11-30', bis: '1978-03-31', art: 'Familienversicherung', kasse: 'AOK Bayern' });
  const kuendigung = a.store.vorgaenge.find(v => v.benutzerId === b.id && v.typ === 'KUENDIGUNG' && !['ABGELEHNT', 'STORNIERT'].includes(v.status));
  return {
    status: b.mitgliedBis && parseIso(b.mitgliedBis) < heute() ? 'BEENDET' : kuendigung ? 'GEKUENDIGT' : 'AKTIV',
    versicherungsart: b.versicherungsart, beschaeftigung: b.beschaeftigung, arbeitgeber: b.arbeitgeber, tarif: b.tarif, tarifName: TARIFE[b.tarif].name,
    tarifBeschreibung: TARIFE[b.tarif].beschreibung, mitgliedSeit: b.mitgliedSeit, mitgliedBis: b.mitgliedBis || kuendigung?.daten['endeZum'] || null,
    kuendigungVorgang: kuendigung?.vorgangsnummer || null, zeiten: zeiten.sort((x, y) => y.von.localeCompare(x.von)),
    pflegeversichert: true, krankengeldanspruch: ['ANGESTELLT', 'SELBSTSTAENDIG'].includes(b.beschaeftigung),
    kundenberater: (() => { const k = a.store.benutzer.find(x => x.id === b.kundenberaterId); return k ? { name: voller(k), team: k.team, telefon: '030 99887-' + (100 + Number(k.id.substring(1))) } : null; })(),
  };
}

function beitraege(a: Anfrage) {
  const b = a.benutzer!;
  const eingabe = { beschaeftigung: b.beschaeftigung, bruttoMonat: b.bruttoMonat || 0, kinder: b.kinderAnzahl, alter: alterAm(b.geburtsdatum), krankengeldanspruch: true, bundesland: '' };
  const aktuell = berechneBeitrag(eingabe);
  const entwicklung = [2022, 2023, 2024, 2025, 2026].map(j => {
    const zb = ({ 2022: 1.3, 2023: 1.6, 2024: 1.7, 2025: 2.29, 2026: 2.49 } as any)[j];
    const faktor = (BEITRAG.allgemeinerSatz + zb) / (BEITRAG.allgemeinerSatz + BEITRAG.zusatzbeitrag);
    return { jahr: j, zusatzbeitrag: zb, monatsbeitrag: Math.round(aktuell.summeVersicherter * faktor * (0.92 + (j - 2022) * 0.02) * 100) / 100 };
  });
  const selbstzahler = ['SELBSTSTAENDIG', 'STUDENT'].includes(b.beschaeftigung) || b.versicherungsart === 'FREIWILLIG';
  return {
    aktuell, zusatzbeitrag: BEITRAG.zusatzbeitrag, allgemeinerSatz: BEITRAG.allgemeinerSatz, selbstzahler,
    zahlungsweg: b.beschaeftigung === 'ANGESTELLT' ? 'ARBEITGEBER' : b.beschaeftigung === 'RENTNER' ? 'RENTENVERSICHERUNG' : b.bank?.sepaMandat ? 'LASTSCHRIFT' : 'UEBERWEISUNG',
    entwicklung,
    konto: selbstzahler ? a.store.beitragskonto.filter(x => x.benutzerId === b.id).sort((x, y) => y.datum.localeCompare(x.datum)) : [],
    kontostand: selbstzahler ? kontostand(a.store, b.id) : null,
    arbeitgebermeldungen: a.store.arbeitgebermeldungen.filter(m => m.benutzerId === b.id).sort((x, y) => y.zeitraumVon.localeCompare(x.zeitraumVon)),
    ratenplan: a.store.vorgaenge.find(v => v.benutzerId === b.id && v.typ === 'RATENZAHLUNG' && v.status === 'GENEHMIGT')?.daten['raten'] || null,
  };
}

function zuzahlungen(a: Anfrage) {
  const b = a.benutzer!;
  const jahr = a.query.get('jahr') || String(heute().getFullYear());
  const liste = a.store.zuzahlungen.filter(z => z.benutzerId === b.id && z.datum.startsWith(jahr)).sort((x, y) => y.datum.localeCompare(x.datum));
  const familie = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status === 'AKTIV');
  const angehoerige = familie.filter(f => ['EHEPARTNER', 'LEBENSPARTNER'].includes(f.beziehung)).length;
  const kinder = familie.length - angehoerige;
  const chroniker = a.store.vorgaenge.some(v => v.benutzerId === b.id && v.typ === 'DMP' && v.status === 'GENEHMIGT') || b.id === 'u3';
  const grenze = belastungsgrenze((b.bruttoMonat || 0) * 12, angehoerige, kinder, chroniker);
  const befreiung = a.store.vorgaenge.find(v => v.benutzerId === b.id && v.typ === 'ZUZAHLUNGSBEFREIUNG' && v.daten['jahr'] === jahr && v.status === 'GENEHMIGT');
  const summe = zuzahlungenSumme(a.store, b.id, jahr);
  return { jahr, liste, summe, nachArt: liste.reduce((m: any, z) => ({ ...m, [z.art]: Math.round(((m[z.art] || 0) + z.betrag) * 100) / 100 }), {}),
    schaetzung: { ...grenze, chroniker, angehoerige, kinder, erreicht: summe >= grenze.grenze, prozentErreicht: Math.min(100, Math.round(summe / Math.max(grenze.grenze, 1) * 100)) },
    befreit: !!befreiung, befreiungsnummer: befreiung?.vorgangsnummer || null };
}

function leistungsdaten(a: Anfrage) {
  const b = a.benutzer!;
  const von = a.query.get('von') || '0000';
  const bis = a.query.get('bis') || '9999';
  const bereich = a.query.get('bereich');
  const person = a.query.get('person');
  const l = a.store.leistungsdaten.filter(x => x.benutzerId === b.id && x.datum >= von && x.datum <= bis && (!bereich || x.bereich === bereich) && (!person || x.person === person))
    .sort((x, y) => y.datum.localeCompare(x.datum));
  return { eintraege: l, summe: Math.round(l.reduce((t, x) => t + x.betrag, 0) * 100) / 100, personen: Array.from(new Set(a.store.leistungsdaten.filter(x => x.benutzerId === b.id).map(x => x.person))) };
}

function krankengeld(a: Anfrage) {
  const b = a.benutzer!;
  const zahlungen = a.store.krankengeldZahlungen.filter(z => z.benutzerId === b.id).sort((x, y) => y.zeitraumVon.localeCompare(x.zeitraumVon));
  const laufend = a.store.vorgaenge.filter(v => v.benutzerId === b.id && v.typ === 'ARBEITSUNFAEHIGKEIT' && v.daten['krankengeld']);
  const brutto = b.bruttoMonat || 0;
  const tagBrutto = Math.min(brutto / 30 * KRANKENGELD.prozentBrutto / 100, KRANKENGELD.hoechstbetragTag);
  return {
    anspruch: ['ANGESTELLT', 'SELBSTSTAENDIG'].includes(b.beschaeftigung), zahlungen, faelle: laufend.map(v => ({ id: v.id, vorgangsnummer: v.vorgangsnummer, titel: v.titel, kettenTage: v.daten['kettenTage'] })),
    schaetzungTag: Math.round(tagBrutto * 100) / 100, regeln: KRANKENGELD,
  };
}

// ---------------------------------------------------------------- Pflege

function pflege(a: Anfrage) {
  const b = a.benutzer!;
  const akte = pflegeakte(a.store, b.id);
  const antraege = a.store.vorgaenge.filter(v => v.benutzerId === b.id && ['PFLEGEGRAD', 'VERHINDERUNGSPFLEGE', 'KURZZEITPFLEGE', 'PFLEGEHILFSMITTEL', 'WOHNUMFELD', 'ENTLASTUNGSBETRAG', 'PFLEGEPERSON'].includes(v.typ));
  if (!akte) return { akte: null, antraege, werte: PFLEGE };
  return {
    akte, antraege, werte: PFLEGE,
    pflegegeld: PFLEGE.pflegegeld[akte.pflegegrad], sachleistung: PFLEGE.sachleistung[akte.pflegegrad],
    entlastung: entlastungVerfuegbar(akte), budget: gemeinsamesBudget(akte),
    bescheide: a.store.nachrichten.filter(n => n.benutzerId === b.id && /Pflegegrad/.test(n.betreff)).map(n => ({ id: n.id, betreff: n.betreff, datum: n.datum })),
  };
}

function begutachtungstermin(a: Anfrage) {
  const akte = pflegeakte(a.store, a.benutzer!.id);
  const offen = a.store.vorgaenge.find(v => v.benutzerId === a.benutzer!.id && v.typ === 'PFLEGEGRAD' && ['EINGEREICHT', 'IN_BEARBEITUNG'].includes(v.status));
  if (!offen) throw new ApiFehler(404, 'Es ist keine Begutachtung geplant.');
  const { datum, uhrzeit } = a.body || {};
  const d = parseIso(datum);
  if (istWochenende(d) || d <= addTage(heute(), 2)) throw new ApiFehler(400, 'Bitte wählen Sie einen Werktag frühestens in 3 Tagen.', 'datum');
  if (!['09:00', '11:00', '14:00'].includes(uhrzeit)) throw new ApiFehler(400, 'Bitte wählen Sie ein angebotenes Zeitfenster.', 'uhrzeit');
  offen.daten['begutachtung'] = { datum, uhrzeit, art: offen.daten['begutachtung'] || 'HAUSBESUCH', gutachter: 'Medizinischer Dienst Bayern' };
  if (akte) akte.begutachtung = offen.daten['begutachtung'];
  offen.historie.push({ zeitpunkt: jetztIso(), status: offen.status, text: `Begutachtungstermin ${formatDatum(datum)} ${uhrzeit} Uhr bestätigt`, von: voller(a.benutzer!) });
  return offen;
}

// ---------------------------------------------------------------- ePA & digitale Angebote

function epaAkte(a: Anfrage) {
  let e = a.store.epa.find(x => x.benutzerId === a.benutzer!.id);
  if (!e) {
    e = { benutzerId: a.benutzer!.id, status: 'AKTIV', appGekoppelt: false, gesundheitsId: 'KEINE', widerspruchMedikation: false, widerspruchForschung: false, berechtigungen: [], zugriffe: [] };
    a.store.epa.push(e);
  }
  return e;
}

function epa(a: Anfrage) {
  const e = epaAkte(a);
  e.berechtigungen.forEach(x => { if (x.aktiv && parseIso(x.bis) < heute()) x.aktiv = false; });
  return e;
}

function epaAendern(a: Anfrage) {
  const e = epaAkte(a);
  const b = a.benutzer!;
  const { aktion, berechtigungId, bis, einrichtung } = a.body || {};
  switch (aktion) {
    case 'WIDERSPRECHEN':
      if (e.status === 'WIDERSPROCHEN') throw new ApiFehler(409, 'Sie haben der ePA bereits widersprochen.');
      e.status = 'WIDERSPROCHEN';
      e.berechtigungen = [];
      e.appGekoppelt = false;
      postfachNachricht(b.id, 'Ihr Widerspruch gegen die ePA', `${anrede(b)},\n\nwir haben Ihren Widerspruch gegen die elektronische Patientenakte erhalten. Ihre ePA und alle darin gespeicherten Daten werden gelöscht. Sie können die ePA jederzeit wieder einrichten lassen.\n\nIhre VitaPlus`, { kategorie: 'ALLGEMEIN' });
      break;
    case 'WIDERSPRUCH_ZURUECK':
      if (e.status !== 'WIDERSPROCHEN') throw new ApiFehler(409, 'Es liegt kein Widerspruch vor.');
      e.status = 'AKTIV';
      break;
    case 'WIDERSPRUCH_MEDIKATION':
      e.widerspruchMedikation = !e.widerspruchMedikation;
      break;
    case 'WIDERSPRUCH_FORSCHUNG':
      e.widerspruchForschung = !e.widerspruchForschung;
      break;
    case 'BERECHTIGUNG_ENTZIEHEN': {
      const x = e.berechtigungen.find(y => y.id === berechtigungId);
      if (!x) throw new ApiFehler(404, 'Berechtigung nicht gefunden.');
      x.aktiv = false;
      break;
    }
    case 'BERECHTIGUNG_VERLAENGERN': {
      if (!e.appGekoppelt) throw new ApiFehler(409, 'Berechtigungen können Sie nur über die ePA-App verwalten. Bitte koppeln Sie zuerst die App.');
      const x = e.berechtigungen.find(y => y.id === berechtigungId);
      if (!x) throw new ApiFehler(404, 'Berechtigung nicht gefunden.');
      if (!bis || parseIso(bis) <= heute() || parseIso(bis) > addMonate(heute(), 36)) throw new ApiFehler(400, 'Die Berechtigung kann bis zu 3 Jahre im Voraus erteilt werden.', 'bis');
      x.bis = bis;
      x.aktiv = true;
      x.quelle = 'APP';
      break;
    }
    case 'BERECHTIGUNG_ERTEILEN':
      if (!e.appGekoppelt) throw new ApiFehler(409, 'Bitte koppeln Sie zuerst die ePA-App.');
      pflicht(einrichtung, 'einrichtung');
      e.berechtigungen.push({ id: neueId('e'), einrichtung, art: 'Praxis', bis: bis || toIso(addTage(heute(), 90)), quelle: 'APP', aktiv: true });
      break;
    case 'GESUNDHEITSID_BEANTRAGEN':
      if (e.gesundheitsId !== 'KEINE') throw new ApiFehler(409, 'Die GesundheitsID ist bereits beantragt oder aktiv.');
      if (!b.mobil) throw new ApiFehler(409, 'Für die GesundheitsID benötigen wir Ihre Mobilnummer.');
      e.gesundheitsId = 'BEANTRAGT';
      break;
    case 'GESUNDHEITSID_AKTIVIEREN':
      if (e.gesundheitsId !== 'BEANTRAGT') throw new ApiFehler(409, 'Es liegt keine beantragte GesundheitsID vor.');
      if (!/^\d{6}$/.test(String(a.body?.pin || ''))) throw new ApiFehler(400, 'Bitte vergeben Sie eine 6-stellige PIN.', 'pin');
      e.gesundheitsId = 'AKTIV';
      break;
    case 'APP_KOPPELN':
      if (e.status !== 'AKTIV') throw new ApiFehler(409, 'Die ePA ist nicht aktiv.');
      if (e.gesundheitsId !== 'AKTIV') throw new ApiFehler(409, 'Für die ePA-App benötigen Sie eine aktive GesundheitsID.');
      e.appGekoppelt = true;
      break;
    default:
      throw new ApiFehler(400, 'Unbekannte Aktion');
  }
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'EPA_' + aktion, details: `ePA: ${aktion}` });
  return e;
}

function digitaleAngebote(a: Anfrage) {
  const b = a.benutzer!;
  const eigene = a.store.vorgaenge.filter(v => v.benutzerId === b.id && ['DIGA', 'DMP'].includes(v.typ));
  return { digas: DIGA_LISTE, dmps: DMP_PROGRAMME, eigene };
}

// ---------------------------------------------------------------- Karten-Erweiterungen

function eigeneKarte(a: Anfrage): Gesundheitskarte {
  const k = a.store.karten.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!k) throw new ApiFehler(404, 'Karte nicht gefunden.');
  return k;
}

function fotoAktualisieren(a: Anfrage) {
  const k = eigeneKarte(a);
  const foto = a.body?.foto;
  if (!foto) throw new ApiFehler(400, 'Bitte laden Sie ein Foto hoch.', 'foto');
  anhaengePruefen([foto], true, 1);
  if (foto.mimeType === 'application/pdf') throw new ApiFehler(415, 'Das Lichtbild muss als JPG oder PNG hochgeladen werden.', 'foto');
  if (foto.groesseBytes < 20000) throw new ApiFehler(400, 'Das Foto hat eine zu geringe Auflösung.', 'foto');
  k.fotoVorhanden = true;
  if (a.body?.neueKarte) {
    k.status = 'GESPERRT';
    k.sperrgrund = undefined;
    const neu: Gesundheitskarte = { ...k, id: neueId('k'), status: 'IN_PRODUKTION', kartennummer: k.kartennummer.substring(0, 18) + Math.floor(Math.random() * 10) };
    a.store.karten.push(neu);
    return neu;
  }
  return k;
}

function pinAnfordern(a: Anfrage) {
  const k = eigeneKarte(a);
  if (k.status !== 'AKTIV') throw new ApiFehler(409, 'Eine PIN kann nur für aktive Karten angefordert werden.');
  const { verfahren } = a.body || {};
  if (!['POSTIDENT', 'EID', 'FILIALE'].includes(verfahren)) throw new ApiFehler(400, 'Bitte wählen Sie ein Identifizierungsverfahren.', 'verfahren');
  const v = { id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), benutzerId: a.benutzer!.id, typ: 'EGK_PIN', titel: `PIN-Brief für Karte ${k.kartennummer}`,
    status: 'EINGEREICHT' as const, erstelltAm: jetztIso(), geaendertAm: jetztIso(), daten: { karteId: k.id, verfahren }, anhaenge: [], historie: [], zustaendig: 'Mitgliedschaft & Beiträge' };
  statusSetzen(v as any, 'EINGEREICHT', 'PIN angefordert', voller(a.benutzer!));
  if (verfahren === 'EID') statusSetzen(v as any, 'VERSENDET', 'Identität per Online-Ausweis bestätigt, PIN-Brief versendet', 'System');
  eingangErfassen(a.store, v as any);
  return v;
}

function ersatzbescheinigung(a: Anfrage) {
  const b = a.benutzer!;
  const { karteId, praxis, behandlungsdatum } = a.body || {};
  const k = a.store.karten.find(x => x.id === karteId && x.benutzerId === b.id);
  if (!k) throw new ApiFehler(400, 'Bitte wählen Sie die Person.', 'karteId');
  pflicht(praxis, 'praxis');
  pflicht(behandlungsdatum, 'behandlungsdatum');
  const d = parseIso(behandlungsdatum);
  const quartalsbeginn = new Date(heute().getFullYear(), Math.floor(heute().getMonth() / 3) * 3, 1);
  if (d < quartalsbeginn || d > addTage(heute(), 14)) throw new ApiFehler(400, 'Die Ersatzbescheinigung gilt nur für Behandlungen im laufenden Quartal.', 'behandlungsdatum');
  const quartalsende = new Date(quartalsbeginn.getFullYear(), quartalsbeginn.getMonth() + 3, 0);
  const doc = { id: neueId('d'), benutzerId: b.id, typ: 'EEB', bezeichnung: `Elektronische Ersatzbescheinigung – ${k.inhaber}`, angefordertAm: jetztIso(),
    dateiname: `Ersatzbescheinigung_${heuteIso()}.pdf`, parameter: { praxis, behandlungsdatum, gueltigBis: toIso(quartalsende), inhaber: k.inhaber } };
  a.store.dokumente.push(doc);
  return { ...doc, uebermittelt: true, hinweis: `Die Bescheinigung wurde elektronisch an „${praxis}“ übermittelt und gilt bis ${formatDatum(toIso(quartalsende))}.` };
}

function karteErstbestellen(a: Anfrage) {
  const b = a.benutzer!;
  const f = a.store.familie.find(x => x.id === a.body?.familienmitgliedId && x.hauptversicherterId === b.id && x.status === 'AKTIV');
  if (!f) throw new ApiFehler(400, 'Bitte wählen Sie eine familienversicherte Person.', 'familienmitgliedId');
  if (a.store.karten.some(k => k.familienmitgliedId === f.id && ['AKTIV', 'IN_PRODUKTION', 'VERSENDET'].includes(k.status))) throw new ApiFehler(409, 'Für diese Person existiert bereits eine Karte.');
  if (alterAm(f.geburtsdatum) >= 15 && !a.body?.foto) throw new ApiFehler(400, 'Für Versicherte ab 15 Jahren benötigen wir ein Lichtbild.', 'foto', 'FOTO_FEHLT');
  const k: Gesundheitskarte = { id: neueId('k'), benutzerId: b.id, familienmitgliedId: f.id, inhaber: `${f.vorname} ${f.nachname}`,
    kartennummer: `80276 ${String(Math.floor(Math.random() * 99999)).padStart(5, '0')} ${String(Math.floor(Math.random() * 99999)).padStart(5, '0')} 1`,
    gueltigBis: toIso(addMonate(heute(), 60)), status: 'IN_PRODUKTION', fotoVorhanden: !!a.body?.foto };
  a.store.karten.push(k);
  return k;
}

function sendungsverfolgung(a: Anfrage) {
  const k = eigeneKarte(a);
  if (!['IN_PRODUKTION', 'VERSENDET'].includes(k.status)) throw new ApiFehler(404, 'Für diese Karte gibt es keinen Versand.');
  const schritte = [
    { text: 'Auftrag an Kartenhersteller übermittelt', erledigt: true },
    { text: 'Karte produziert', erledigt: k.status === 'VERSENDET' },
    { text: 'An Deutsche Post übergeben', erledigt: k.status === 'VERSENDET' },
    { text: 'Zugestellt', erledigt: false },
  ];
  return { kartennummer: k.kartennummer, status: k.status, sendungsnummer: k.status === 'VERSENDET' ? 'RR' + k.id.toUpperCase().padEnd(9, '0').substring(0, 9) + 'DE' : null, schritte };
}

// ---------------------------------------------------------------- Vorgänge archivieren

function archivieren(a: Anfrage) {
  const v = a.store.vorgaenge.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!v) throw new ApiFehler(404, 'Vorgang nicht gefunden.');
  if (['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE', 'ENTWURF'].includes(v.status)) throw new ApiFehler(409, 'Nur abgeschlossene Vorgänge können archiviert werden.');
  v.archiviert = !v.archiviert;
  return v;
}

// ---------------------------------------------------------------- Prävention

function bonusTeilnahme(a: Anfrage) {
  const b = a.benutzer!;
  if (a.body?.teilnehmen) {
    if (b.bonusTeilnahmeSeit) throw new ApiFehler(409, 'Sie nehmen bereits am Bonusprogramm teil.');
    if (!a.body?.einwilligung) throw new ApiFehler(400, 'Bitte willigen Sie in die Verarbeitung Ihrer Bonusdaten ein.', 'einwilligung');
    b.bonusTeilnahmeSeit = heuteIso();
    let e = a.store.einwilligungen.find(x => x.benutzerId === b.id && x.code === 'BONUS_DATEN');
    if (!e) a.store.einwilligungen.push(e = { id: neueId('ew'), benutzerId: b.id, code: 'BONUS_DATEN', erteilt: true, zeitpunkt: jetztIso(), historie: [] });
    e.erteilt = true;
    e.historie.push({ zeitpunkt: jetztIso(), erteilt: true, kanal: 'Online' });
  } else {
    if (!b.bonusTeilnahmeSeit) throw new ApiFehler(409, 'Sie nehmen nicht am Bonusprogramm teil.');
    b.bonusTeilnahmeSeit = undefined;
  }
  return { teilnahmeSeit: b.bonusTeilnahmeSeit || null };
}

const VORSORGE = [
  { code: 'U', titel: 'Kinder-Untersuchungen U1–U9, J1', ab: 0, bis: 17, intervall: 'nach Plan', bonus: null },
  { code: 'ZAHN', titel: 'Zahnärztliche Kontrolle', ab: 6, bis: 120, intervall: 'halbjährlich', bonus: 'ZAHN' },
  { code: 'CHECKUP1', titel: 'Gesundheits-Check-up (einmalig)', ab: 18, bis: 34, intervall: 'einmalig', bonus: 'CHECKUP' },
  { code: 'CHECKUP', titel: 'Gesundheits-Check-up', ab: 35, bis: 120, intervall: 'alle 3 Jahre', bonus: 'CHECKUP' },
  { code: 'GEBAERMUTTER', titel: 'Gebärmutterhalskrebs-Früherkennung', ab: 20, bis: 120, intervall: 'jährlich', bonus: 'KREBS', geschlecht: 'FRAU' },
  { code: 'HAUT', titel: 'Hautkrebs-Screening', ab: 35, bis: 120, intervall: 'alle 2 Jahre', bonus: 'HAUT' },
  { code: 'BRUST', titel: 'Mammographie-Screening', ab: 50, bis: 75, intervall: 'alle 2 Jahre', bonus: 'KREBS', geschlecht: 'FRAU' },
  { code: 'DARM', titel: 'Darmkrebs-Früherkennung', ab: 50, bis: 120, intervall: 'nach Plan', bonus: 'KREBS' },
  { code: 'PROSTATA', titel: 'Prostatakrebs-Früherkennung', ab: 45, bis: 120, intervall: 'jährlich', bonus: 'KREBS', geschlecht: 'HERR' },
  { code: 'AORTA', titel: 'Ultraschall Bauchaorta', ab: 65, bis: 120, intervall: 'einmalig', bonus: null, geschlecht: 'HERR' },
  { code: 'GRIPPE', titel: 'Grippeschutzimpfung', ab: 60, bis: 120, intervall: 'jährlich im Herbst', bonus: 'IMPFUNG' },
];

function vorsorge(a: Anfrage) {
  const b = a.benutzer!;
  const alter = alterAm(b.geburtsdatum);
  const jahr = String(heute().getFullYear());
  return VORSORGE.filter(v => alter >= v.ab && alter <= v.bis && (!v.geschlecht || v.geschlecht === b.anrede)).map(v => ({
    ...v, erledigtImJahr: !!v.bonus && a.store.bonus.some(e => e.benutzerId === b.id && e.code === v.bonus && e.datum.startsWith(jahr)),
    bonuspunkte: v.bonus ? BONUS_KATALOG.find(k => k.code === v.bonus)?.punkte ?? null : null,
  }));
}

function ziele(a: Anfrage) {
  return {
    ziele: a.store.gesundheitsziele.filter(z => z.benutzerId === a.benutzer!.id),
    challenges: CHALLENGES.map(c => ({ ...c, teilnahme: a.store.challengeTeilnahmen.find(t => t.benutzerId === a.benutzer!.id && t.challengeId === c.id) || null })),
  };
}

function zielAnlegen(a: Anfrage) {
  const { titel, kategorie, zielwert, einheit, bis } = a.body || {};
  pflicht(titel, 'titel');
  if (!(Number(zielwert) > 0)) throw new ApiFehler(400, 'Bitte geben Sie einen Zielwert an.', 'zielwert');
  if (!bis || parseIso(bis) <= heute()) throw new ApiFehler(400, 'Das Zieldatum muss in der Zukunft liegen.', 'bis');
  if (a.store.gesundheitsziele.filter(z => z.benutzerId === a.benutzer!.id && !z.erreicht).length >= 5) throw new ApiFehler(409, 'Sie können höchstens 5 offene Ziele verfolgen.');
  a.store.gesundheitsziele.push({ id: neueId('gz'), benutzerId: a.benutzer!.id, titel, kategorie: kategorie || 'SONSTIGES', zielwert: Number(zielwert), einheit: einheit || '', aktuell: 0, bis, erreicht: false });
  return ziele(a);
}

function zielFortschritt(a: Anfrage) {
  const z = a.store.gesundheitsziele.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!z) throw new ApiFehler(404, 'Ziel nicht gefunden.');
  const wert = Number(a.body?.aktuell);
  if (isNaN(wert) || wert < 0) throw new ApiFehler(400, 'Ungültiger Wert', 'aktuell');
  z.aktuell = wert;
  z.erreicht = wert >= z.zielwert;
  return ziele(a);
}

function challenge(a: Anfrage) {
  const c = CHALLENGES.find(x => x.id === a.params['id']);
  if (!c) throw new ApiFehler(404, 'Challenge nicht gefunden.');
  if (parseIso(c.bis) < heute()) throw new ApiFehler(409, 'Die Challenge ist beendet.');
  const t = a.store.challengeTeilnahmen.find(x => x.benutzerId === a.benutzer!.id && x.challengeId === c.id);
  if (a.body?.fortschritt !== undefined) {
    if (!t) throw new ApiFehler(409, 'Sie nehmen an dieser Challenge nicht teil.');
    t.fortschritt = Math.min(c.zielwert, Math.max(0, Number(a.body.fortschritt)));
  } else if (a.methode === 'DELETE') {
    a.store.challengeTeilnahmen = a.store.challengeTeilnahmen.filter(x => x !== t);
  } else {
    if (t) throw new ApiFehler(409, 'Sie nehmen bereits teil.');
    a.store.challengeTeilnahmen.push({ benutzerId: a.benutzer!.id, challengeId: c.id, seit: heuteIso(), fortschritt: 0 });
  }
  return ziele(a);
}

// ---------------------------------------------------------------- Kurse

function kurse(a: Anfrage) {
  const kat = a.query.get('kategorie');
  const ort = (a.query.get('ort') || '').toLowerCase();
  const online = a.query.get('online') === 'true';
  const nurZertifiziert = a.query.get('zertifiziert') === 'true';
  const buchungen = a.benutzer ? a.store.kursbuchungen.filter(k => k.benutzerId === a.benutzer!.id && k.status === 'GEBUCHT') : [];
  return KURSE.filter(k => (!kat || k.kategorie === kat) && (!ort || k.plz.startsWith(ort) || k.ort.toLowerCase().includes(ort)) && (!online || k.online) && (!nurZertifiziert || k.zertifiziert))
    .map(k => {
      const zusaetzlich = a.store.kursbuchungen.filter(x => x.kursId === k.id && x.status === 'GEBUCHT' && x.id !== 'kb1').length;
      const belegt = k.belegt + zusaetzlich;
      return { ...k, belegt, frei: Math.max(0, k.plaetze - belegt), gebucht: buchungen.some(x => x.kursId === k.id), zuschussMoeglich: k.zertifiziert && k.preis > 0 };
    });
}

function kursBuchen(a: Anfrage) {
  const b = a.benutzer!;
  const k = KURSE.find(x => x.id === a.params['id']);
  if (!k) throw new ApiFehler(404, 'Kurs nicht gefunden.');
  if (parseIso(k.start) <= heute()) throw new ApiFehler(409, 'Der Kurs hat bereits begonnen.');
  const belegt = k.belegt + a.store.kursbuchungen.filter(x => x.kursId === k.id && x.status === 'GEBUCHT' && x.id !== 'kb1').length;
  if (belegt >= k.plaetze) throw new ApiFehler(409, 'Der Kurs ist ausgebucht.');
  if (a.store.kursbuchungen.some(x => x.kursId === k.id && x.benutzerId === b.id && x.status === 'GEBUCHT')) throw new ApiFehler(409, 'Sie haben diesen Kurs bereits gebucht.');
  const jahr = k.start.substring(0, 4);
  const imJahr = a.store.kursbuchungen.filter(x => x.benutzerId === b.id && x.status === 'GEBUCHT' && KURSE.find(y => y.id === x.kursId)?.start.startsWith(jahr) && KURSE.find(y => y.id === x.kursId)?.kategorie !== 'PFLEGE').length;
  if (imJahr >= 2 && k.kategorie !== 'PFLEGE') throw new ApiFehler(422, 'Pro Kalenderjahr können Sie höchstens 2 Präventionskurse über die VitaPlus buchen.');
  a.store.kursbuchungen.push({ id: neueId('kb'), benutzerId: b.id, kursId: k.id, gebuchtAm: jetztIso(), status: 'GEBUCHT' });
  postfachNachricht(b.id, `Kursbuchung: ${k.titel}`, `${anrede(b)},\n\nSie sind für „${k.titel}“ (${k.anbieter}) ab ${formatDatum(k.start)} angemeldet.` +
    (k.zertifiziert && k.preis > 0 ? ' Nach Kursende erstatten wir Ihnen bis zu 80 % der Kursgebühr – reichen Sie dazu die Teilnahmebescheinigung ein.' : '') + '\n\nIhre VitaPlus', { kategorie: 'BONUS' });
  return kurse(a);
}

function kursStornieren(a: Anfrage) {
  const x = a.store.kursbuchungen.find(y => y.kursId === a.params['id'] && y.benutzerId === a.benutzer!.id && y.status === 'GEBUCHT');
  if (!x) throw new ApiFehler(404, 'Buchung nicht gefunden.');
  const k = KURSE.find(y => y.id === x.kursId)!;
  if (addTage(heute(), 7) > parseIso(k.start)) throw new ApiFehler(422, 'Eine Stornierung ist nur bis 7 Tage vor Kursbeginn möglich.');
  x.status = 'STORNIERT';
  return kurse(a);
}

export const VERSICHERUNG_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/versicherung', handler: versicherung, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/beitraege', handler: beitraege, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/zuzahlungen', handler: zuzahlungen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/leistungsdaten', handler: leistungsdaten, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/krankengeld', handler: krankengeld, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/pflege', handler: pflege, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/pflege/begutachtung', handler: begutachtungstermin, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/epa', handler: epa, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/epa', handler: epaAendern, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/digital', handler: digitaleAngebote, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/karten/erstbestellung', handler: karteErstbestellen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/karten/ersatzbescheinigung', handler: ersatzbescheinigung, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/karten/:id/foto', handler: fotoAktualisieren, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/karten/:id/pin', handler: pinAnfordern, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/karten/:id/versand', handler: sendungsverfolgung, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/vorgaenge/:id/archivieren', handler: archivieren, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/bonus/teilnahme', handler: bonusTeilnahme, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/vorsorge', handler: vorsorge, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/ziele', handler: ziele, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/ziele', handler: zielAnlegen, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/ziele/:id', handler: zielFortschritt, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/challenges/:id', handler: challenge, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/challenges/:id', handler: challenge, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/challenges/:id', handler: challenge, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/kurse', handler: kurse, oeffentlich: true },
  { methode: 'POST', muster: '/api/kurse/:id/buchen', handler: kursBuchen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/kurse/:id/stornieren', handler: kursStornieren, rolle: 'VERSICHERTER' },
];
