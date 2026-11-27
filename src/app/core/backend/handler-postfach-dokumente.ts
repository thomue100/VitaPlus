import { TARIFE } from '../konfiguration';
import { Nachricht, NachrichtKategorie, Ordner } from '../models';
import { berechneBeitrag } from '../util/berechnungen';
import { addTage, alterAm, formatDatum, heute, heuteIso, jetztIso, parseIso, tageZwischen } from '../util/datum';
import { Anfrage, ApiFehler, anrede, euro, pflicht, postfachNachricht, Route, voller } from './api-kontext';
import { neueId } from './db';
import { anhaengePruefen } from './handler-vorgaenge';
import { AERZTE } from './seed';

// ---------------------------------------------------------------- Postfach

function nachrichten(a: Anfrage) {
  const ordner = (a.query.get('ordner') || 'EINGANG') as Ordner;
  const suche = (a.query.get('suche') || '').toLowerCase();
  const nurUngelesen = a.query.get('ungelesen') === 'true';
  return a.store.nachrichten
    .filter(n => n.benutzerId === a.benutzer!.id && n.ordner === ordner)
    .filter(n => !suche || n.betreff.toLowerCase().includes(suche) || n.text.toLowerCase().includes(suche) || n.absender.toLowerCase().includes(suche))
    .filter(n => !nurUngelesen || !n.gelesen)
    .sort((x, y) => y.datum.localeCompare(x.datum))
    .map(n => ({ ...n, text: n.text.substring(0, 140) }));
}

function zaehler(a: Anfrage) {
  const eigene = a.store.nachrichten.filter(n => n.benutzerId === a.benutzer!.id);
  return {
    ungelesen: eigene.filter(n => n.ordner === 'EINGANG' && !n.gelesen).length,
    EINGANG: eigene.filter(n => n.ordner === 'EINGANG').length,
    GESENDET: eigene.filter(n => n.ordner === 'GESENDET').length,
    ARCHIV: eigene.filter(n => n.ordner === 'ARCHIV').length,
    PAPIERKORB: eigene.filter(n => n.ordner === 'PAPIERKORB').length,
  };
}

function eigeneNachricht(a: Anfrage): Nachricht {
  const n = a.store.nachrichten.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!n) throw new ApiFehler(404, 'Nachricht nicht gefunden.');
  return n;
}

function nachricht(a: Anfrage) {
  const n = eigeneNachricht(a);
  n.gelesen = true;
  const verlauf: Nachricht[] = [];
  let vorher = n.antwortAufId;
  while (vorher) {
    const v = a.store.nachrichten.find(x => x.id === vorher);
    if (!v) break;
    verlauf.push(v);
    vorher = v.antwortAufId;
  }
  return { ...n, verlauf };
}

function nachrichtAendern(a: Anfrage) {
  const n = eigeneNachricht(a);
  const { gelesen, ordner, wichtig } = a.body || {};
  if (gelesen !== undefined) n.gelesen = !!gelesen;
  if (wichtig !== undefined) n.wichtig = !!wichtig;
  if (ordner) {
    if (!['EINGANG', 'GESENDET', 'ARCHIV', 'PAPIERKORB'].includes(ordner)) throw new ApiFehler(400, 'Unbekannter Ordner');
    if (ordner === 'EINGANG' && n.absender === voller(a.benutzer!)) throw new ApiFehler(400, 'Gesendete Nachrichten können nicht in den Posteingang verschoben werden.');
    if (ordner === 'GESENDET' && n.absender !== voller(a.benutzer!)) throw new ApiFehler(400, 'Empfangene Nachrichten können nicht in „Gesendet“ verschoben werden.');
    n.ordner = ordner;
  }
  return n;
}

function nachrichtLoeschen(a: Anfrage) {
  const n = eigeneNachricht(a);
  if (n.ordner !== 'PAPIERKORB') {
    if (n.wichtig && n.kategorie === 'BEITRAG') throw new ApiFehler(409, 'Beitragsbescheide müssen aufbewahrt werden und können nur archiviert werden.');
    n.ordner = 'PAPIERKORB';
    return { verschoben: true };
  }
  a.store.nachrichten = a.store.nachrichten.filter(x => x.id !== n.id);
  return { geloescht: true };
}

function papierkorbLeeren(a: Anfrage) {
  const vorher = a.store.nachrichten.length;
  a.store.nachrichten = a.store.nachrichten.filter(n => !(n.benutzerId === a.benutzer!.id && n.ordner === 'PAPIERKORB'));
  return { geloescht: vorher - a.store.nachrichten.length };
}

const AUTO_ANTWORT: Record<NachrichtKategorie, string> = {
  ALLGEMEIN: 'Wir beantworten Ihre Anfrage in der Regel innerhalb von 3 Werktagen.',
  LEISTUNG: 'Unsere Leistungsabteilung meldet sich innerhalb von 5 Werktagen bei Ihnen.',
  BEITRAG: 'Unsere Beitragsabteilung meldet sich innerhalb von 5 Werktagen bei Ihnen.',
  MITGLIEDSCHAFT: 'Wir beantworten Ihre Anfrage in der Regel innerhalb von 3 Werktagen.',
  BONUS: 'Unser Bonusteam meldet sich innerhalb von 3 Werktagen.',
  BESCHWERDE: 'Ihr Anliegen wurde an unser Beschwerdemanagement weitergeleitet. Sie erhalten innerhalb von 2 Werktagen eine persönliche Rückmeldung.',
  SYSTEM: '',
};

function senden(a: Anfrage) {
  const b = a.benutzer!;
  const { betreff, text, kategorie, anhaenge, antwortAufId } = a.body || {};
  pflicht(betreff, 'betreff');
  pflicht(text, 'text');
  if (String(betreff).trim().length < 5 || String(betreff).length > 100) throw new ApiFehler(400, 'Der Betreff muss zwischen 5 und 100 Zeichen lang sein.', 'betreff');
  if (String(text).trim().length < 20) throw new ApiFehler(400, 'Bitte beschreiben Sie Ihr Anliegen mit mindestens 20 Zeichen.', 'text');
  if (String(text).length > 2000) throw new ApiFehler(400, 'Die Nachricht darf höchstens 2.000 Zeichen lang sein.', 'text');
  if (!kategorie || kategorie === 'SYSTEM' || !(kategorie in AUTO_ANTWORT)) throw new ApiFehler(400, 'Bitte wählen Sie ein Thema.', 'kategorie');
  anhaengePruefen(anhaenge, false, 3);
  if (antwortAufId) {
    const ursprung = a.store.nachrichten.find(n => n.id === antwortAufId && n.benutzerId === b.id);
    if (!ursprung) throw new ApiFehler(404, 'Die ursprüngliche Nachricht wurde nicht gefunden.');
    if (ursprung.kategorie === 'SYSTEM') throw new ApiFehler(422, 'Auf Systemnachrichten kann nicht geantwortet werden.');
  }
  const heuteGesendet = a.store.nachrichten.filter(n => n.benutzerId === b.id && n.ordner === 'GESENDET' && n.datum.startsWith(heuteIso())).length;
  if (heuteGesendet >= 10) throw new ApiFehler(429, 'Sie haben heute bereits 10 Nachrichten gesendet. Bitte versuchen Sie es morgen erneut oder rufen Sie uns an.');
  const n: Nachricht = {
    id: neueId('n'), benutzerId: b.id, ordner: 'GESENDET', betreff: String(betreff).trim(), text: String(text).trim(),
    absender: voller(b), empfaenger: 'VitaPlus Kundenservice', datum: jetztIso(), gelesen: true, kategorie,
    anhaenge: anhaenge || [], antwortAufId, wichtig: kategorie === 'BESCHWERDE',
  };
  a.store.nachrichten.push(n);
  postfachNachricht(b.id, `Eingangsbestätigung: ${n.betreff}`,
    `${anrede(b)},\n\nvielen Dank für Ihre Nachricht. ${AUTO_ANTWORT[kategorie as NachrichtKategorie]}\n\nIhre VitaPlus`,
    { kategorie: 'SYSTEM', absender: 'VitaPlus Kundenservice', antwortAufId: n.id });
  return n;
}

// ---------------------------------------------------------------- Arztsuche

function aerzte(a: Anfrage) {
  const q = a.query;
  const fach = q.get('fachrichtung');
  const ort = (q.get('ort') || '').trim().toLowerCase();
  const name = (q.get('name') || '').trim().toLowerCase();
  const sprache = q.get('sprache');
  const seite = Math.max(1, Number(q.get('seite')) || 1);
  const proSeite = 10;
  let l = AERZTE.filter(x => !fach || x.fachrichtung === fach)
    .filter(x => !ort || x.plz.startsWith(ort) || x.ort.toLowerCase().includes(ort))
    .filter(x => !name || `${x.vorname} ${x.nachname}`.toLowerCase().includes(name) || x.nachname.toLowerCase().startsWith(name))
    .filter(x => q.get('barrierefrei') !== 'true' || x.barrierefrei)
    .filter(x => q.get('onlineTermin') !== 'true' || x.onlineTermin)
    .filter(x => q.get('neuePatienten') !== 'true' || x.neuePatienten)
    .filter(x => !sprache || x.sprachen.includes(sprache));
  const sortierung = q.get('sortierung') || 'NAME';
  l = [...l].sort((x, y) => sortierung === 'PLZ' ? x.plz.localeCompare(y.plz) || x.nachname.localeCompare(y.nachname) : x.nachname.localeCompare(y.nachname, 'de'));
  const favoriten = a.benutzer ? a.store.arztFavoriten[a.benutzer.id] || [] : [];
  return {
    treffer: l.length,
    seite,
    seiten: Math.max(1, Math.ceil(l.length / proSeite)),
    ergebnisse: l.slice((seite - 1) * proSeite, seite * proSeite).map(x => ({ ...x, favorit: favoriten.includes(x.id) })),
  };
}

function favoriten(a: Anfrage) {
  const ids = a.store.arztFavoriten[a.benutzer!.id] || [];
  return AERZTE.filter(x => ids.includes(x.id)).map(x => ({ ...x, favorit: true }));
}

function favoritSetzen(a: Anfrage) {
  const id = a.params['id'];
  if (!AERZTE.some(x => x.id === id)) throw new ApiFehler(404, 'Arzt nicht gefunden.');
  const l = a.store.arztFavoriten[a.benutzer!.id] || [];
  if (a.methode === 'DELETE') {
    a.store.arztFavoriten[a.benutzer!.id] = l.filter(x => x !== id);
  } else {
    if (l.length >= 10) throw new ApiFehler(409, 'Sie können höchstens 10 Favoriten speichern.');
    if (!l.includes(id)) l.push(id);
    a.store.arztFavoriten[a.benutzer!.id] = l;
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Dokumente

const EU_LAENDER = ['Belgien', 'Bulgarien', 'Dänemark', 'Estland', 'Finnland', 'Frankreich', 'Griechenland', 'Irland', 'Island', 'Italien',
  'Kroatien', 'Lettland', 'Liechtenstein', 'Litauen', 'Luxemburg', 'Malta', 'Niederlande', 'Norwegen', 'Österreich', 'Polen', 'Portugal',
  'Rumänien', 'Schweden', 'Schweiz', 'Slowakei', 'Slowenien', 'Spanien', 'Tschechien', 'Ungarn', 'Zypern'];

function dokumentTypen(a: Anfrage) {
  const b = a.benutzer!;
  const typen = [
    { typ: 'MITGLIEDSBESCHEINIGUNG', bezeichnung: 'Mitgliedsbescheinigung', beschreibung: 'Nachweis Ihrer Mitgliedschaft, z. B. für Behörden', verfuegbar: true },
    { typ: 'FAMILIENVERSICHERUNG', bezeichnung: 'Bescheinigung über die Familienversicherung', beschreibung: 'Für mitversicherte Angehörige',
      verfuegbar: a.store.familie.some(f => f.hauptversicherterId === b.id && f.status === 'AKTIV') },
    { typ: 'ARBEITGEBER', bezeichnung: 'Versicherungsbestätigung für den Arbeitgeber', beschreibung: 'Bei Aufnahme einer Beschäftigung',
      verfuegbar: b.beschaeftigung === 'ANGESTELLT' },
    { typ: 'STUDIUM', bezeichnung: 'Versicherungsnachweis für die Hochschule', beschreibung: 'Zur Einschreibung oder Rückmeldung',
      verfuegbar: b.beschaeftigung === 'STUDENT' },
    { typ: 'BEITRAGSBESCHEINIGUNG', bezeichnung: 'Beitragsbescheinigung für das Finanzamt', beschreibung: 'Gezahlte Beiträge eines Kalenderjahres',
      verfuegbar: b.beschaeftigung === 'SELBSTSTAENDIG' || b.beschaeftigung === 'STUDENT' || b.beschaeftigung === 'RENTNER' },
    { typ: 'EHIC', bezeichnung: 'Provisorische Ersatzbescheinigung (EHIC)', beschreibung: 'Ersatz für die Europäische Krankenversicherungskarte', verfuegbar: true },
  ];
  return { typen, euLaender: EU_LAENDER, historie: a.store.dokumente.filter(d => d.benutzerId === b.id).sort((x, y) => y.angefordertAm.localeCompare(x.angefordertAm)) };
}

function dokumentErstellen(a: Anfrage) {
  const b = a.benutzer!;
  const { typ, parameter = {} } = a.body || {};
  const verf = dokumentTypen(a).typen.find(t => t.typ === typ);
  if (!verf) throw new ApiFehler(400, 'Unbekannter Dokumenttyp');
  if (!verf.verfuegbar) throw new ApiFehler(403, 'Dieses Dokument steht Ihnen nicht zur Verfügung.');
  const kopf = [`${voller(b)}`, `${b.adresse.strasse} ${b.adresse.hausnummer}`, `${b.adresse.plz} ${b.adresse.ort}`, '', `Versichertennummer: ${b.versichertennummer}`, `Datum: ${formatDatum(heuteIso())}`, ''];
  let titel = verf.bezeichnung;
  let zeilen: string[] = [];
  switch (typ) {
    case 'MITGLIEDSBESCHEINIGUNG':
      zeilen = [`Hiermit bestätigen wir, dass ${voller(b)}, geboren am ${formatDatum(b.geburtsdatum)},`,
        `seit dem ${formatDatum(b.mitgliedSeit)} Mitglied der VitaPlus Krankenkasse ist.`, '',
        `Versicherungsart: ${({ ANGESTELLT: 'Pflichtversicherung (Beschäftigte)', SELBSTSTAENDIG: 'Freiwillige Versicherung', STUDENT: 'Versicherungspflicht als Studierende/r', RENTNER: 'Krankenversicherung der Rentner' })[b.beschaeftigung]}`,
        `Tarif: ${TARIFE[b.tarif].name}`, '', 'Die Mitgliedschaft besteht ungekündigt fort.'];
      break;
    case 'FAMILIENVERSICHERUNG': {
      const f = a.store.familie.find(x => x.id === parameter.familienmitgliedId && x.hauptversicherterId === b.id && x.status === 'AKTIV');
      if (!f) throw new ApiFehler(400, 'Bitte wählen Sie eine familienversicherte Person.', 'familienmitgliedId');
      titel = `Bescheinigung über die Familienversicherung – ${f.vorname} ${f.nachname}`;
      zeilen = [`${f.vorname} ${f.nachname}, geboren am ${formatDatum(f.geburtsdatum)}, ist über das Mitglied`,
        `${voller(b)} beitragsfrei familienversichert.`, '', `Versichertennummer: ${f.versichertennummer}`, `Familienversichert seit: ${formatDatum(f.beantragtAm)}`];
      break;
    }
    case 'ARBEITGEBER':
      pflicht(parameter.arbeitgeber, 'arbeitgeber');
      pflicht(parameter.beschaeftigungsbeginn, 'beschaeftigungsbeginn');
      zeilen = [`Zur Vorlage bei: ${parameter.arbeitgeber}`, '', `${voller(b)} ist ab dem ${formatDatum(parameter.beschaeftigungsbeginn)} bei der VitaPlus versichert.`,
        'Bitte melden Sie Ihre neue Mitarbeiterin bzw. Ihren neuen Mitarbeiter bei uns an.', '', 'Betriebsnummer der VitaPlus: 98765432'];
      break;
    case 'STUDIUM':
      pflicht(parameter.hochschule, 'hochschule');
      pflicht(parameter.semester, 'semester');
      if (alterAm(b.geburtsdatum) >= 30) zeilen.push('Hinweis: Die studentische Versicherung endet mit Vollendung des 30. Lebensjahres.');
      zeilen = [`Zur Vorlage bei: ${parameter.hochschule}`, `Semester: ${parameter.semester}`, '',
        `${voller(b)} ist bei der VitaPlus gesetzlich krankenversichert.`, 'Absendernummer: V9876543', 'Die Meldung erfolgt zusätzlich elektronisch an die Hochschule.', ...zeilen];
      break;
    case 'BEITRAGSBESCHEINIGUNG': {
      const jahr = Number(parameter.jahr);
      const aktuell = heute().getFullYear();
      if (!(jahr >= aktuell - 4 && jahr < aktuell)) throw new ApiFehler(400, `Beitragsbescheinigungen sind für die Jahre ${aktuell - 4} bis ${aktuell - 1} verfügbar.`, 'jahr');
      if (jahr < Number(b.mitgliedSeit.substring(0, 4))) throw new ApiFehler(400, 'In diesem Jahr bestand noch keine Mitgliedschaft.', 'jahr');
      const e = berechneBeitrag({ beschaeftigung: b.beschaeftigung, bruttoMonat: b.bruttoMonat || 0, kinder: b.kinderAnzahl, alter: alterAm(b.geburtsdatum),
        krankengeldanspruch: true, bundesland: '' });
      titel = `Beitragsbescheinigung ${jahr}`;
      zeilen = [`Im Kalenderjahr ${jahr} wurden folgende Beiträge gezahlt:`, '',
        `Krankenversicherung (inkl. Zusatzbeitrag): ${euro((e.kvAnteilVersicherter + e.zusatzAnteilVersicherter) * 12)}`,
        `davon Anteil für Krankengeld (4 %): ${euro((e.kvAnteilVersicherter) * 12 * 0.04)}`,
        `Pflegeversicherung: ${euro(e.pvAnteilVersicherter * 12)}`, '', `Summe: ${euro(e.summeVersicherter * 12)}`, '',
        'Diese Bescheinigung wurde maschinell erstellt und ist ohne Unterschrift gültig.'];
      break;
    }
    case 'EHIC': {
      pflicht(parameter.land, 'land');
      pflicht(parameter.von, 'von');
      pflicht(parameter.bis, 'bis');
      if (!EU_LAENDER.includes(parameter.land)) throw new ApiFehler(400, 'Die Ersatzbescheinigung gilt nur in Ländern der EU, des EWR und der Schweiz.', 'land');
      if (parseIso(parameter.von) < heute()) throw new ApiFehler(400, 'Der Reisebeginn darf nicht in der Vergangenheit liegen.', 'von');
      if (parseIso(parameter.bis) < parseIso(parameter.von)) throw new ApiFehler(400, 'Das Reiseende darf nicht vor dem Beginn liegen.', 'bis');
      if (tageZwischen(parameter.von, parameter.bis) > 90) throw new ApiFehler(400, 'Die Ersatzbescheinigung kann für höchstens 90 Tage ausgestellt werden.', 'bis');
      if (parseIso(parameter.von) > addTage(heute(), 30)) throw new ApiFehler(400, 'Die Bescheinigung kann frühestens 30 Tage vor Reisebeginn angefordert werden.', 'von');
      zeilen = [`Reiseland: ${parameter.land}`, `Gültig von ${formatDatum(parameter.von)} bis ${formatDatum(parameter.bis)}`, '',
        'Kennnummer des Trägers: 102030405 – VitaPlus', `Kartennummer: ${a.store.karten.find(k => k.benutzerId === b.id && !k.familienmitgliedId)?.kartennummer || '-'}`, '',
        'Diese Bescheinigung berechtigt zur Inanspruchnahme medizinisch notwendiger Leistungen während eines vorübergehenden Aufenthalts.'];
      break;
    }
  }
  const dateiname = `${titel.replace(/[^A-Za-z0-9ÄÖÜäöüß]+/g, '_').replace(/_+$/, '')}_${heuteIso()}.pdf`;
  a.store.dokumente.push({ id: neueId('d'), benutzerId: b.id, typ, bezeichnung: titel, angefordertAm: jetztIso(), dateiname, parameter });
  return { titel, dateiname, zeilen: [...kopf, ...zeilen, '', 'Mit freundlichen Grüßen', 'Ihre VitaPlus Krankenkasse'] };
}

export const POSTFACH_DOKUMENT_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/nachrichten', handler: nachrichten, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/nachrichten/zaehler', handler: zaehler, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/nachrichten/papierkorb', handler: papierkorbLeeren, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/nachrichten/:id', handler: nachricht, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/nachrichten/:id', handler: nachrichtAendern, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/nachrichten/:id', handler: nachrichtLoeschen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/nachrichten', handler: senden, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/aerzte', handler: aerzte, oeffentlich: true },
  { methode: 'GET', muster: '/api/aerzte/favoriten', handler: favoriten },
  { methode: 'POST', muster: '/api/aerzte/:id/favorit', handler: favoritSetzen },
  { methode: 'DELETE', muster: '/api/aerzte/:id/favorit', handler: favoritSetzen },
  { methode: 'GET', muster: '/api/dokumente', handler: dokumentTypen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/dokumente', handler: dokumentErstellen, rolle: 'VERSICHERTER' },
];
