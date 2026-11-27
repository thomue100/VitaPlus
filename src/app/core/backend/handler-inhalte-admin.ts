import { SERVICEZEITEN, TEAMS, VORGANG_TYP_TEXT } from '../konfiguration';
import { FORMULARE } from '../formulare/formular-katalog';
import { LEISTUNGEN } from '../inhalte/leistungen';
import { Benutzer } from '../models';
import { heute, heuteIso, jetztIso, parseIso, tageZwischen } from '../util/datum';
import { istEmailGueltig } from '../util/pruefungen';
import { antworten, begruessung, liveAntwort } from './assistent';
import { Anfrage, ApiFehler, ohnePasswort, pflicht, Route, voller } from './api-kontext';
import { neueId, sitzungen } from './db';
import { protokollieren } from './fachlogik';
import { mitStandard } from './seed-erweiterung';

// ---------------------------------------------------------------- Monitoring (wird vom Interceptor befüllt)

export interface Messpunkt { pfad: string; methode: string; status: number; dauerMs: number; zeitpunkt: number }
export interface Fehlereintrag { zeitpunkt: string; quelle: 'BACKEND' | 'FRONTEND'; meldung: string; details?: string; pfad?: string }

const METRIK_KEY = 'vp_metrics';
const FEHLER_KEY = 'vp_errors';

function laden<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

export function messpunktErfassen(m: Messpunkt) {
  const l = laden<Messpunkt>(METRIK_KEY);
  l.push(m);
  localStorage.setItem(METRIK_KEY, JSON.stringify(l.slice(-800)));
}

export function fehlerErfassen(f: Fehlereintrag) {
  const l = laden<Fehlereintrag>(FEHLER_KEY);
  l.push(f);
  localStorage.setItem(FEHLER_KEY, JSON.stringify(l.slice(-300)));
}

// ---------------------------------------------------------------- Öffentliche Inhalte

function faq(a: Anfrage) {
  const kat = a.query.get('kategorie');
  const q = (a.query.get('suche') || '').toLowerCase();
  return a.store.inhalte.faq.filter(f => f.sichtbar && (!kat || f.kategorie === kat) && (!q || f.frage.toLowerCase().includes(q) || f.antwort.toLowerCase().includes(q)))
    .sort((x, y) => x.reihenfolge - y.reihenfolge);
}

function faqBewerten(a: Anfrage) {
  const f = a.store.inhalte.faq.find(x => x.id === a.params['id']);
  if (!f) throw new ApiFehler(404, 'Eintrag nicht gefunden.');
  if (a.body?.hilfreich) f.hilfreich++; else f.nichtHilfreich++;
  return { ok: true };
}

function meldungen(a: Anfrage) {
  const h = heuteIso();
  const ziel = a.benutzer ? (a.benutzer.rolle === 'VERSICHERTER' ? 'VERSICHERTE' : 'MITARBEITENDE') : 'VERSICHERTE';
  return {
    wartungsmodus: a.store.system.wartungsmodus, wartungstext: a.store.system.wartungstext, version: a.store.system.version,
    meldungen: a.store.inhalte.meldungen.filter(m => m.aktivVon <= h && m.aktivBis >= h && (m.zielgruppe === 'ALLE' || m.zielgruppe === ziel)),
  };
}

function glossar(a: Anfrage) {
  return [...a.store.inhalte.glossar].sort((x, y) => x.begriff.localeCompare(y.begriff, 'de'));
}

function leistungen(a: Anfrage) {
  const tarif = a.benutzer?.tarif;
  return LEISTUNGEN.map(l => ({ ...l, meinAnspruch: tarif && l.anspruch ? l.anspruch[tarif] || 'nicht enthalten' : null }));
}

const SEITEN = [
  { titel: 'Persönliche Daten', route: '/profil', begriffe: ['adresse', 'umzug', 'telefon', 'e-mail', 'bank', 'iban', 'name', 'steuer'] },
  { titel: 'Gesundheitskarte', route: '/gesundheitskarte', begriffe: ['karte', 'egk', 'verloren', 'foto', 'pin', 'ersatzbescheinigung'] },
  { titel: 'Postfach', route: '/postfach', begriffe: ['nachricht', 'post', 'brief', 'bescheid'] },
  { titel: 'Meine Vorgänge', route: '/vorgaenge', begriffe: ['status', 'antrag', 'bearbeitung', 'nachreichen'] },
  { titel: 'Dokumente & Bescheinigungen', route: '/dokumente', begriffe: ['bescheinigung', 'mitgliedsbescheinigung', 'download', 'pdf'] },
  { titel: 'Beiträge', route: '/beitraege', begriffe: ['beitrag', 'zusatzbeitrag', 'zahlung', 'mahnung', 'sepa', 'lastschrift'] },
  { titel: 'Beitragsrechner', route: '/rechner/beitrag', begriffe: ['rechner', 'beitrag berechnen'] },
  { titel: 'Termine & Rückruf', route: '/termine', begriffe: ['termin', 'beratung', 'rückruf', 'filiale', 'video'] },
  { titel: 'Arztsuche', route: '/arztsuche', begriffe: ['arzt', 'praxis', 'zahnarzt', 'facharzt'] },
  { titel: 'Datenschutz-Center', route: '/datenschutz-center', begriffe: ['datenschutz', 'einwilligung', 'auskunft', 'dsgvo'] },
  { titel: 'Vollmachten', route: '/vollmachten', begriffe: ['vollmacht', 'vertretung', 'betreuung', 'angehörige'] },
  { titel: 'Einstellungen', route: '/einstellungen', begriffe: ['passwort', 'sicherheit', 'zwei-faktor', 'schrift', 'sprache', 'benachrichtigung'] },
  { titel: 'Kontakt', route: '/kontakt', begriffe: ['kontakt', 'telefon', 'hotline', 'chat', 'beschwerde'] },
];

function suche(a: Anfrage) {
  const q = (a.query.get('q') || '').trim().toLowerCase();
  if (q.length < 2) throw new ApiFehler(400, 'Bitte geben Sie mindestens 2 Zeichen ein.', 'q');
  const passt = (...texte: (string | undefined)[]) => texte.some(t => (t || '').toLowerCase().includes(q));
  const treffer: { art: string; titel: string; text: string; ziel: string }[] = [];
  SEITEN.filter(s => passt(s.titel, ...s.begriffe)).forEach(s => treffer.push({ art: 'FUNKTION', titel: s.titel, text: 'Bereich der Online-Geschäftsstelle', ziel: s.route }));
  FORMULARE.filter(f => !f.oeffentlich && passt(f.titel, f.kurz, ...f.suchbegriffe)).forEach(f => treffer.push({ art: 'ANTRAG', titel: f.titel, text: 'Online-Antrag', ziel: `/antraege/neu/${f.code}` }));
  LEISTUNGEN.filter(l => passt(l.titel, l.kurz, l.text, ...l.suchbegriffe)).forEach(l => treffer.push({ art: 'LEISTUNG', titel: l.titel, text: l.kurz, ziel: `/leistungen/${l.code}` }));
  a.store.inhalte.faq.filter(f => f.sichtbar && passt(f.frage, f.antwort)).forEach(f => treffer.push({ art: 'FAQ', titel: f.frage, text: f.antwort.substring(0, 120) + (f.antwort.length > 120 ? '…' : ''), ziel: `/hilfe?faq=${f.id}` }));
  a.store.inhalte.glossar.filter(g => passt(g.begriff)).forEach(g => treffer.push({ art: 'GLOSSAR', titel: g.begriff, text: g.erklaerung, ziel: `/hilfe/glossar#${encodeURIComponent(g.begriff)}` }));
  if (a.benutzer?.rolle === 'VERSICHERTER') {
    a.store.vorgaenge.filter(v => v.benutzerId === a.benutzer!.id && passt(v.vorgangsnummer, v.titel)).slice(0, 5)
      .forEach(v => treffer.push({ art: 'VORGANG', titel: `${v.vorgangsnummer} – ${v.titel}`, text: 'Ihr Vorgang', ziel: `/vorgaenge/${v.id}` }));
    a.store.nachrichten.filter(n => n.benutzerId === a.benutzer!.id && n.ordner !== 'PAPIERKORB' && passt(n.betreff)).slice(0, 5)
      .forEach(n => treffer.push({ art: 'NACHRICHT', titel: n.betreff, text: `Postfach, ${n.datum.substring(0, 10).split('-').reverse().join('.')}`, ziel: `/postfach/${n.id}` }));
  }
  return { anfrage: q, treffer: treffer.slice(0, 40) };
}

function leistungsfinder(a: Anfrage) {
  const { lebenslage, alter, kinder, pflegebeduerftig, chronisch } = a.body || {};
  if (!lebenslage) throw new ApiFehler(400, 'Bitte wählen Sie Ihre Lebenslage.', 'lebenslage');
  const a2 = Number(alter) || 0;
  let l = LEISTUNGEN.filter(x => x.lebenslagen.includes(lebenslage));
  if (chronisch) l = l.concat(LEISTUNGEN.filter(x => ['DMP', 'ZUZAHLUNG'].includes(x.code)));
  if (pflegebeduerftig) l = l.concat(LEISTUNGEN.filter(x => x.bereich === 'PFLEGE'));
  if (kinder) l = l.concat(LEISTUNGEN.filter(x => ['KINDERKRANKENGELD', 'KFO'].includes(x.code)));
  if (a2 >= 35) l = l.concat(LEISTUNGEN.filter(x => x.code === 'KREBSVORSORGE'));
  if (a2 > 0 && a2 < 18) l = l.filter(x => !['SEHHILFE', 'MUTTERSCHAFT'].includes(x.code));
  const eindeutig = Array.from(new Map(l.map(x => [x.code, x])).values());
  const antraege = FORMULARE.filter(f => f.lebenslagen.includes(lebenslage) && !f.oeffentlich).map(f => ({ code: f.code, titel: f.titel }));
  return { leistungen: eindeutig, antraege };
}

function istOffen(z: { wochentage: number[]; von: string; bis: string; samstagVon?: string; samstagBis?: string }, jetzt = new Date()) {
  const hm = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
  if (z.wochentage.includes(jetzt.getDay())) return hm >= z.von && hm < z.bis;
  if (jetzt.getDay() === 6 && z.samstagVon) return hm >= z.samstagVon && hm < z.samstagBis!;
  return false;
}

function kontakt(a: Anfrage) {
  const b = a.benutzer;
  const berater = b?.kundenberaterId ? a.store.benutzer.find(x => x.id === b.kundenberaterId) : undefined;
  return {
    telefon: { nummer: '0800 123 456 0', kostenfrei: true, offen: istOffen(SERVICEZEITEN.telefon), zeiten: 'Mo–Fr 8–20 Uhr, Sa 9–14 Uhr' },
    notfall: { nummer: '0800 123 456 9', text: 'Medizinische Hotline – rund um die Uhr' },
    chat: { offen: istOffen(SERVICEZEITEN.chat), zeiten: 'Mo–Fr 8–18 Uhr' },
    ausland: '+49 30 99887 0',
    ansprechpartner: berater ? { name: voller(berater), team: berater.team, telefon: '030 99887-' + (100 + Number(berater.id.substring(1))), email: berater.email } : null,
    zustaendig: b ? { leistungen: 'Leistungen', beitraege: 'Mitgliedschaft & Beiträge', pflege: 'Pflegekasse' } : null,
    aufsicht: [
      { name: 'Bundesamt für Soziale Sicherung', aufgabe: 'Aufsicht über bundesunmittelbare Krankenkassen', adresse: 'Friedrich-Ebert-Allee 38, 53113 Bonn' },
      { name: 'Die Bundesbeauftragte für den Datenschutz und die Informationsfreiheit', aufgabe: 'Datenschutzaufsicht', adresse: 'Graurheindorfer Straße 153, 53117 Bonn' },
      { name: 'Unabhängige Patientenberatung Deutschland', aufgabe: 'Kostenlose, unabhängige Beratung', adresse: 'Telefon 0800 011 77 22' },
      { name: 'Ombudsperson der VitaPlus', aufgabe: 'Schlichtung bei Konflikten', adresse: 'ombudsstelle@vitaplus.de' },
    ],
  };
}

function chat(a: Anfrage) {
  const text = String(a.body?.text || '').trim();
  if (!text) throw new ApiFehler(400, 'Bitte geben Sie eine Frage ein.', 'text');
  if (text.length > 500) throw new ApiFehler(400, 'Ihre Nachricht ist zu lang.', 'text');
  if (a.benutzer) {
    const e = a.store.einwilligungen.find(x => x.benutzerId === a.benutzer!.id && x.code === 'DIGITALER_ASSISTENT');
    if (!e?.erteilt && !a.body?.einwilligung) throw new ApiFehler(428, 'Für die Nutzung des digitalen Assistenten benötigen wir Ihre Einwilligung.', undefined, 'EINWILLIGUNG_FEHLT');
    if (!e?.erteilt) a.store.einwilligungen.push({ id: neueId('ew'), benutzerId: a.benutzer.id, code: 'DIGITALER_ASSISTENT', erteilt: true, zeitpunkt: jetztIso(), historie: [{ zeitpunkt: jetztIso(), erteilt: true, kanal: 'Chat' }] });
  }
  if (a.body?.live) {
    if (!istOffen(SERVICEZEITEN.chat)) return { von: 'SYSTEM', text: 'Unser Live-Chat ist Mo–Fr von 8 bis 18 Uhr besetzt. Möchten Sie einen Rückruf vereinbaren?', links: [{ text: 'Rückruf vereinbaren', ziel: '/antraege/neu/RUECKRUF' }], kontext: {} };
    return liveAntwort(text, a.benutzer);
  }
  return antworten(text, a.body?.kontext, a.store, a.benutzer);
}

function chatBegruessung(a: Anfrage) {
  return begruessung(a.benutzer);
}

function feedbackSenden(a: Anfrage) {
  const { bewertung, text, seite, art } = a.body || {};
  const n = Number(bewertung);
  if (!(n >= 1 && n <= 5)) throw new ApiFehler(400, 'Bitte vergeben Sie 1 bis 5 Sterne.', 'bewertung');
  if (text && String(text).length > 1000) throw new ApiFehler(400, 'Ihr Feedback darf höchstens 1.000 Zeichen lang sein.', 'text');
  if (art === 'BARRIERE' && (!text || String(text).trim().length < 10)) throw new ApiFehler(400, 'Bitte beschreiben Sie die Barriere (mindestens 10 Zeichen).', 'text');
  a.store.feedback.push({ id: neueId('fb'), benutzerId: a.benutzer?.id, zeitpunkt: jetztIso(), bewertung: n, text, seite: seite || '/', art: ['SERVICE', 'BARRIERE', 'ALLGEMEIN'].includes(art) ? art : 'ALLGEMEIN' });
  return { ok: true };
}

function seitenaufruf(a: Anfrage) {
  if (a.benutzer?.datenschutzPraeferenzen?.nutzungsanalyse) {
    a.store.seitenaufrufe.push({ seite: String(a.body?.seite || '/').replace(/\/[a-z]\w{6,}$/i, '/:id'), zeitpunkt: jetztIso() });
    if (a.store.seitenaufrufe.length > 5000) a.store.seitenaufrufe.splice(0, 1000);
  }
  return { ok: true };
}

function clientFehler(a: Anfrage) {
  fehlerErfassen({ zeitpunkt: jetztIso(), quelle: 'FRONTEND', meldung: String(a.body?.meldung || 'Unbekannter Fehler').substring(0, 300), details: String(a.body?.stack || '').substring(0, 1500), pfad: a.body?.seite });
  return { ok: true };
}

// ---------------------------------------------------------------- Administration

function mitarbeitende(a: Anfrage) {
  return a.store.benutzer.filter(b => b.rolle !== 'VERSICHERTER').map(b => ({ ...ohnePasswort(b), aktiveSitzungen: sitzungen.fuer(b.id).length }));
}

function mitarbeiterAnlegen(a: Anfrage) {
  const d = a.body || {};
  pflicht(d.vorname, 'vorname');
  pflicht(d.nachname, 'nachname');
  if (!istEmailGueltig(d.email) || !String(d.email).toLowerCase().endsWith('@vitaplus.de')) throw new ApiFehler(400, 'Bitte verwenden Sie eine dienstliche E-Mail-Adresse (@vitaplus.de).', 'email');
  if (a.store.benutzer.some(b => b.email.toLowerCase() === String(d.email).toLowerCase())) throw new ApiFehler(409, 'Diese E-Mail-Adresse ist bereits vergeben.', 'email');
  if (!['SACHBEARBEITER', 'ADMIN'].includes(d.rolle)) throw new ApiFehler(400, 'Bitte wählen Sie eine Rolle.', 'rolle');
  if (d.rolle === 'SACHBEARBEITER' && !TEAMS.includes(d.team)) throw new ApiFehler(400, 'Bitte wählen Sie ein Team.', 'team');
  const start = 'Start-' + Math.random().toString(36).substring(2, 8) + '!9A';
  const b: Benutzer = mitStandard({
    id: neueId('s'), rolle: d.rolle, email: String(d.email).trim().toLowerCase(), passwort: start, anrede: d.anrede || 'DIVERS', vorname: d.vorname, nachname: d.nachname,
    geburtsdatum: '1990-01-01', adresse: { strasse: 'Hauptverwaltung', hausnummer: '1', plz: '10117', ort: 'Berlin', land: 'Deutschland' }, tarif: 'BASIS',
    beschaeftigung: 'ANGESTELLT', mitgliedSeit: heuteIso(), zweiFaktorAktiv: true, zweiFaktorCode: String(100000 + Math.floor(Math.random() * 899999)),
    team: d.team, teamleitung: !!d.teamleitung, freigabeLimit: Number(d.freigabeLimit) || 1000,
  });
  a.store.benutzer.push(b);
  protokollieren({ akteurId: a.benutzer!.id, ereignis: 'MITARBEITER_ANGELEGT', details: `${voller(b)} (${b.rolle}${b.team ? ', ' + b.team : ''}) angelegt`, stufe: 'WARNUNG' });
  return { ...ohnePasswort(b), startpasswort: start, zweiFaktorCode: b.zweiFaktorCode };
}

function mitarbeiterAendern(a: Anfrage) {
  const b = a.store.benutzer.find(x => x.id === a.params['id'] && x.rolle !== 'VERSICHERTER');
  if (!b) throw new ApiFehler(404, 'Mitarbeiter/in nicht gefunden.');
  const d = a.body || {};
  if (b.id === a.benutzer!.id && (d.gesperrt || (d.rolle && d.rolle !== 'ADMIN'))) throw new ApiFehler(409, 'Sie können Ihre eigene Administrationsrolle nicht entziehen oder sich selbst sperren.');
  if (d.rolle && !['SACHBEARBEITER', 'ADMIN'].includes(d.rolle)) throw new ApiFehler(400, 'Ungültige Rolle', 'rolle');
  if (d.team !== undefined && d.team && !TEAMS.includes(d.team)) throw new ApiFehler(400, 'Ungültiges Team', 'team');
  if (d.freigabeLimit !== undefined && !(Number(d.freigabeLimit) >= 0 && Number(d.freigabeLimit) <= 1000000)) throw new ApiFehler(400, 'Ungültiges Freigabelimit', 'freigabeLimit');
  const vorher = `${b.rolle}/${b.team}/${b.freigabeLimit}/${b.teamleitung}/${b.gesperrt}`;
  if (d.rolle) b.rolle = d.rolle;
  if (d.team !== undefined) b.team = d.team || undefined;
  if (d.freigabeLimit !== undefined) b.freigabeLimit = Number(d.freigabeLimit);
  if (d.teamleitung !== undefined) b.teamleitung = !!d.teamleitung;
  if (d.gesperrt !== undefined) {
    b.gesperrt = !!d.gesperrt;
    if (b.gesperrt) sitzungen.alleEntfernenFuer(b.id);
  }
  protokollieren({ akteurId: a.benutzer!.id, ereignis: 'BERECHTIGUNG_GEAENDERT', details: `${voller(b)}: ${vorher} → ${b.rolle}/${b.team}/${b.freigabeLimit}/${b.teamleitung}/${b.gesperrt}`, stufe: 'WARNUNG' });
  return ohnePasswort(b);
}

function adminProtokoll(a: Anfrage) {
  const stufe = a.query.get('stufe');
  const ereignis = a.query.get('ereignis');
  const q = (a.query.get('suche') || '').toLowerCase();
  return a.store.protokoll.filter(p => (!stufe || p.stufe === stufe) && (!ereignis || p.ereignis === ereignis) && (!q || p.details.toLowerCase().includes(q)))
    .sort((x, y) => y.zeitpunkt.localeCompare(x.zeitpunkt)).slice(0, 300)
    .map(p => ({ ...p, benutzer: a.store.benutzer.find(b => b.id === p.benutzerId)?.email, akteur: a.store.benutzer.find(b => b.id === p.akteurId)?.email }));
}

function monitoring() {
  const m = laden<Messpunkt>(METRIK_KEY);
  const jetzt = Date.now();
  const letzteStunde = m.filter(x => jetzt - x.zeitpunkt < 3600000);
  const dauer = m.map(x => x.dauerMs).sort((x, y) => x - y);
  const p = (q: number) => (dauer.length ? dauer[Math.min(dauer.length - 1, Math.floor(dauer.length * q))] : 0);
  const proPfad: Record<string, { anzahl: number; fehler: number; summe: number }> = {};
  for (const x of m) {
    const k = `${x.methode} ${x.pfad}`;
    proPfad[k] = proPfad[k] || { anzahl: 0, fehler: 0, summe: 0 };
    proPfad[k].anzahl++;
    proPfad[k].summe += x.dauerMs;
    if (x.status >= 500) proPfad[k].fehler++;
  }
  const fehler5xx = m.filter(x => x.status >= 500).length;
  return {
    anfragen: m.length, anfragenLetzteStunde: letzteStunde.length, p50: p(0.5), p95: p(0.95), p99: p(0.99),
    fehlerquote: m.length ? Math.round(fehler5xx / m.length * 1000) / 10 : 0,
    verfuegbarkeit: m.length ? Math.round((1 - fehler5xx / m.length) * 10000) / 100 : 100,
    endpunkte: Object.entries(proPfad).map(([k, v]) => ({ endpunkt: k, anzahl: v.anzahl, fehler: v.fehler, mittelMs: Math.round(v.summe / v.anzahl) })).sort((x, y) => y.anzahl - x.anzahl).slice(0, 25),
    verlauf: Array.from({ length: 12 }, (_, i) => {
      const bis = jetzt - i * 300000;
      const fenster = m.filter(x => x.zeitpunkt <= bis && x.zeitpunkt > bis - 300000);
      return { bis: new Date(bis).toISOString(), anzahl: fenster.length, mittelMs: fenster.length ? Math.round(fenster.reduce((t, x) => t + x.dauerMs, 0) / fenster.length) : 0 };
    }).reverse(),
    dienste: [
      { name: 'Online-Geschäftsstelle (API)', status: fehler5xx > 5 ? 'GESTOERT' : 'OK' },
      { name: 'Kernsystem Mitglieder (Simulation)', status: 'OK' },
      { name: 'Leistungssystem (Simulation)', status: 'OK' },
      { name: 'Dokumentenmanagement (Simulation)', status: 'OK' },
      { name: 'E-Mail-/Push-Dienst (Simulation)', status: 'OK' },
      { name: 'ePA-Aktensystem (Simulation)', status: 'WARTUNG' },
    ],
  };
}

function fehlerprotokoll() {
  return laden<Fehlereintrag>(FEHLER_KEY).reverse();
}

function kennzahlen(a: Anfrage) {
  const abgeschlossen = a.store.vorgaenge.filter(v => ['GENEHMIGT', 'TEILWEISE_GENEHMIGT', 'ABGELEHNT', 'AUSGEZAHLT', 'VERSENDET'].includes(v.status) && v.benutzerId !== 'extern');
  const proTyp: Record<string, { anzahl: number; tage: number; genehmigt: number; inFrist: number }> = {};
  for (const v of abgeschlossen) {
    const eingang = v.historie.find(h => h.status === 'EINGEREICHT')?.zeitpunkt || v.erstelltAm;
    const entscheidung = v.historie.find(h => ['GENEHMIGT', 'TEILWEISE_GENEHMIGT', 'ABGELEHNT', 'VERSENDET'].includes(h.status))?.zeitpunkt || v.geaendertAm;
    const tage = Math.max(0, tageZwischen(eingang.substring(0, 10), entscheidung.substring(0, 10)));
    const t = proTyp[v.typ] = proTyp[v.typ] || { anzahl: 0, tage: 0, genehmigt: 0, inFrist: 0 };
    t.anzahl++;
    t.tage += tage;
    if (v.status !== 'ABGELEHNT') t.genehmigt++;
    if (tage <= (FORMULARE.find(f => f.code === v.typ)?.bearbeitungTage ?? 10)) t.inFrist++;
  }
  const offen = a.store.vorgaenge.filter(v => ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE'].includes(v.status));
  return {
    offenGesamt: offen.length,
    offenNachTeam: TEAMS.map(t => ({ team: t, anzahl: offen.filter(v => v.zustaendig === t).length })),
    nachTyp: Object.entries(proTyp).map(([typ, t]) => ({ typ, bezeichnung: VORGANG_TYP_TEXT[typ] || FORMULARE.find(f => f.code === typ)?.kurz || typ, anzahl: t.anzahl,
      mittlereTage: Math.round(t.tage / t.anzahl * 10) / 10, genehmigungsquote: Math.round(t.genehmigt / t.anzahl * 100), fristquote: Math.round(t.inFrist / t.anzahl * 100) })),
    registrierteNutzer: a.store.benutzer.filter(b => b.rolle === 'VERSICHERTER' && b.konto !== 'GELOESCHT').length,
    aktiveSitzungen: a.store.benutzer.reduce((t, b) => t + sitzungen.fuer(b.id).length, 0),
    nutzungsanalyse: Object.entries(a.store.seitenaufrufe.reduce((m: Record<string, number>, s) => ({ ...m, [s.seite]: (m[s.seite] || 0) + 1 }), {}))
      .map(([seite, anzahl]) => ({ seite, anzahl })).sort((x, y) => y.anzahl - x.anzahl).slice(0, 15),
  };
}

function feedbackAuswertung(a: Anfrage) {
  const l = a.store.feedback;
  const durchschnitt = l.length ? Math.round(l.reduce((t, f) => t + f.bewertung, 0) / l.length * 10) / 10 : 0;
  return {
    anzahl: l.length, durchschnitt,
    verteilung: [1, 2, 3, 4, 5].map(s => ({ sterne: s, anzahl: l.filter(f => f.bewertung === s).length })),
    nachArt: ['SERVICE', 'BARRIERE', 'ALLGEMEIN'].map(art => ({ art, anzahl: l.filter(f => f.art === art).length })),
    eintraege: [...l].sort((x, y) => y.zeitpunkt.localeCompare(x.zeitpunkt)),
    faq: a.store.inhalte.faq.map(f => ({ id: f.id, frage: f.frage, hilfreich: f.hilfreich, nichtHilfreich: f.nichtHilfreich })).sort((x, y) => y.nichtHilfreich - x.nichtHilfreich).slice(0, 10),
  };
}

function faqSpeichern(a: Anfrage) {
  const d = a.body || {};
  pflicht(d.frage, 'frage');
  pflicht(d.antwort, 'antwort');
  pflicht(d.kategorie, 'kategorie');
  if (String(d.frage).length > 200) throw new ApiFehler(400, 'Die Frage darf höchstens 200 Zeichen lang sein.', 'frage');
  if (String(d.antwort).length < 20) throw new ApiFehler(400, 'Die Antwort ist zu kurz.', 'antwort');
  const id = a.params['id'];
  if (id) {
    const f = a.store.inhalte.faq.find(x => x.id === id);
    if (!f) throw new ApiFehler(404, 'Eintrag nicht gefunden.');
    Object.assign(f, { frage: d.frage, antwort: d.antwort, kategorie: d.kategorie, sichtbar: !!d.sichtbar, reihenfolge: Number(d.reihenfolge) || f.reihenfolge });
    return f;
  }
  const f = { id: neueId('faq'), frage: d.frage, antwort: d.antwort, kategorie: d.kategorie, sichtbar: d.sichtbar !== false,
    reihenfolge: a.store.inhalte.faq.length + 1, hilfreich: 0, nichtHilfreich: 0 };
  a.store.inhalte.faq.push(f);
  protokollieren({ akteurId: a.benutzer!.id, ereignis: 'INHALT_GEAENDERT', details: `FAQ angelegt: ${f.frage}` });
  return f;
}

function faqLoeschen(a: Anfrage) {
  const vorher = a.store.inhalte.faq.length;
  a.store.inhalte.faq = a.store.inhalte.faq.filter(f => f.id !== a.params['id']);
  if (vorher === a.store.inhalte.faq.length) throw new ApiFehler(404, 'Eintrag nicht gefunden.');
  return { ok: true };
}

function meldungSpeichern(a: Anfrage) {
  const d = a.body || {};
  pflicht(d.titel, 'titel');
  pflicht(d.text, 'text');
  pflicht(d.aktivVon, 'aktivVon');
  pflicht(d.aktivBis, 'aktivBis');
  if (parseIso(d.aktivBis) < parseIso(d.aktivVon)) throw new ApiFehler(400, 'Das Ende darf nicht vor dem Beginn liegen.', 'aktivBis');
  if (!['INFO', 'WARNUNG', 'STOERUNG'].includes(d.typ)) throw new ApiFehler(400, 'Ungültiger Typ', 'typ');
  const id = a.params['id'];
  const werte = { titel: d.titel, text: d.text, typ: d.typ, aktivVon: d.aktivVon, aktivBis: d.aktivBis, zielgruppe: d.zielgruppe || 'ALLE' };
  if (id) {
    const m = a.store.inhalte.meldungen.find(x => x.id === id);
    if (!m) throw new ApiFehler(404, 'Meldung nicht gefunden.');
    Object.assign(m, werte);
    return m;
  }
  const m = { id: neueId('m'), ...werte };
  a.store.inhalte.meldungen.push(m);
  protokollieren({ akteurId: a.benutzer!.id, ereignis: 'INHALT_GEAENDERT', details: `Meldung veröffentlicht: ${m.titel}` });
  return m;
}

function meldungLoeschen(a: Anfrage) {
  a.store.inhalte.meldungen = a.store.inhalte.meldungen.filter(m => m.id !== a.params['id']);
  return { ok: true };
}

function system(a: Anfrage) {
  if (a.methode === 'PUT') {
    const { wartungsmodus, wartungstext, stoerung } = a.body || {};
    if (stoerung !== undefined) {
      a.store.system.stoerung = !!stoerung;
      protokollieren({ akteurId: a.benutzer!.id, ereignis: 'STOERUNG', details: stoerung ? 'Störung der Antragsannahme simuliert' : 'Störungssimulation beendet', stufe: 'WARNUNG' });
    }
    if (wartungsmodus !== undefined) {
      if (wartungsmodus && (!wartungstext || String(wartungstext).trim().length < 10)) throw new ApiFehler(400, 'Bitte geben Sie einen Hinweistext an.', 'wartungstext');
      a.store.system.wartungsmodus = !!wartungsmodus;
      if (wartungstext) a.store.system.wartungstext = wartungstext;
      if (wartungsmodus) a.store.benutzer.filter(b => b.rolle === 'VERSICHERTER').forEach(b => sitzungen.alleEntfernenFuer(b.id));
      protokollieren({ akteurId: a.benutzer!.id, ereignis: 'WARTUNGSMODUS', details: wartungsmodus ? 'Wartungsmodus aktiviert' : 'Wartungsmodus beendet', stufe: 'KRITISCH' });
    }
  }
  return { ...a.store.system, speicherKb: Math.round((localStorage.getItem('vp_db') || '').length / 1024), datensaetze: {
    benutzer: a.store.benutzer.length, vorgaenge: a.store.vorgaenge.length, nachrichten: a.store.nachrichten.length, protokoll: a.store.protokoll.length,
  } };
}

function datenbereinigung(a: Anfrage) {
  const grenze = new Date(heute());
  grenze.setDate(grenze.getDate() - 30);
  const vorher = a.store.nachrichten.length;
  a.store.nachrichten = a.store.nachrichten.filter(n => n.ordner !== 'PAPIERKORB' || new Date(n.datum) > grenze);
  const tokens = a.store.passwortResetTokens.length;
  a.store.passwortResetTokens = a.store.passwortResetTokens.filter(t => new Date(t.gueltigBis) > new Date());
  protokollieren({ akteurId: a.benutzer!.id, ereignis: 'LOESCHLAUF', details: `Löschlauf: ${vorher - a.store.nachrichten.length} Nachrichten, ${tokens - a.store.passwortResetTokens.length} Tokens entfernt` });
  return { nachrichten: vorher - a.store.nachrichten.length, tokens: tokens - a.store.passwortResetTokens.length };
}

export const INHALT_ADMIN_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/inhalte/faq', handler: faq, oeffentlich: true },
  { methode: 'POST', muster: '/api/inhalte/faq/:id/bewertung', handler: faqBewerten, oeffentlich: true },
  { methode: 'GET', muster: '/api/inhalte/meldungen', handler: meldungen, oeffentlich: true },
  { methode: 'GET', muster: '/api/inhalte/glossar', handler: glossar, oeffentlich: true },
  { methode: 'GET', muster: '/api/inhalte/leistungen', handler: leistungen, oeffentlich: true },
  { methode: 'GET', muster: '/api/suche', handler: suche, oeffentlich: true },
  { methode: 'POST', muster: '/api/leistungsfinder', handler: leistungsfinder, oeffentlich: true },
  { methode: 'GET', muster: '/api/kontakt', handler: kontakt, oeffentlich: true },
  { methode: 'POST', muster: '/api/chat', handler: chat, oeffentlich: true },
  { methode: 'GET', muster: '/api/chat/begruessung', handler: chatBegruessung, oeffentlich: true },
  { methode: 'POST', muster: '/api/feedback', handler: feedbackSenden, oeffentlich: true },
  { methode: 'POST', muster: '/api/analyse', handler: seitenaufruf, oeffentlich: true },
  { methode: 'POST', muster: '/api/fehler', handler: clientFehler, oeffentlich: true },
  { methode: 'GET', muster: '/api/admin/mitarbeitende', handler: mitarbeitende, rolle: 'ADMIN' },
  { methode: 'POST', muster: '/api/admin/mitarbeitende', handler: mitarbeiterAnlegen, rolle: 'ADMIN' },
  { methode: 'PUT', muster: '/api/admin/mitarbeitende/:id', handler: mitarbeiterAendern, rolle: 'ADMIN' },
  { methode: 'GET', muster: '/api/admin/protokoll', handler: adminProtokoll, rolle: 'ADMIN' },
  { methode: 'GET', muster: '/api/admin/monitoring', handler: monitoring, rolle: 'ADMIN' },
  { methode: 'GET', muster: '/api/admin/fehler', handler: fehlerprotokoll, rolle: 'ADMIN' },
  { methode: 'GET', muster: '/api/admin/kennzahlen', handler: kennzahlen, rolle: 'ADMIN' },
  { methode: 'GET', muster: '/api/admin/feedback', handler: feedbackAuswertung, rolle: 'ADMIN' },
  { methode: 'POST', muster: '/api/admin/faq', handler: faqSpeichern, rolle: 'ADMIN' },
  { methode: 'PUT', muster: '/api/admin/faq/:id', handler: faqSpeichern, rolle: 'ADMIN' },
  { methode: 'DELETE', muster: '/api/admin/faq/:id', handler: faqLoeschen, rolle: 'ADMIN' },
  { methode: 'POST', muster: '/api/admin/meldungen', handler: meldungSpeichern, rolle: 'ADMIN' },
  { methode: 'PUT', muster: '/api/admin/meldungen/:id', handler: meldungSpeichern, rolle: 'ADMIN' },
  { methode: 'DELETE', muster: '/api/admin/meldungen/:id', handler: meldungLoeschen, rolle: 'ADMIN' },
  { methode: 'GET', muster: '/api/admin/system', handler: system, rolle: 'ADMIN' },
  { methode: 'PUT', muster: '/api/admin/system', handler: system, rolle: 'ADMIN' },
  { methode: 'POST', muster: '/api/admin/loeschlauf', handler: datenbereinigung, rolle: 'ADMIN' },
];
