import { EINWILLIGUNGEN } from '../konfiguration';
import { Vollmacht } from '../models';
import { alterAm, heute, heuteIso, jetztIso, parseIso } from '../util/datum';
import { istEmailGueltig, istSteuerIdGueltig } from '../util/pruefungen';
import { Anfrage, ApiFehler, anrede, ohnePasswort, pflicht, postfachNachricht, Route, voller } from './api-kontext';
import { neueId, sitzungen } from './db';
import { aenderungMerken, protokollieren } from './fachlogik';
import { OFFENE_STATUS } from './handler-vorgaenge';

// ---------------------------------------------------------------- Sitzungen & Sicherheit

function sitzungsListe(a: Anfrage) {
  return sitzungen.fuer(a.benutzer!.id).map(s => ({
    id: s.token.substring(0, 8), geraet: s.geraet, angemeldetSeit: new Date(s.erstellt).toISOString(),
    letzteAktivitaet: new Date(s.letzteAktivitaet).toISOString(), aktuell: s.token === a.token,
  }));
}

function sitzungBeenden(a: Anfrage) {
  const ziel = sitzungen.fuer(a.benutzer!.id).find(s => s.token.startsWith(a.params['id']));
  if (!ziel) throw new ApiFehler(404, 'Sitzung nicht gefunden.');
  if (ziel.token === a.token) throw new ApiFehler(400, 'Die aktuelle Sitzung beenden Sie über „Abmelden“.');
  sitzungen.entfernen(ziel.token);
  protokollieren({ benutzerId: a.benutzer!.id, akteurId: a.benutzer!.id, ereignis: 'SITZUNG_BEENDET', details: `Sitzung auf ${ziel.geraet} beendet` });
  return { ok: true };
}

function alleAnderenBeenden(a: Anfrage) {
  sitzungen.alleEntfernenFuer(a.benutzer!.id, a.token || undefined);
  protokollieren({ benutzerId: a.benutzer!.id, akteurId: a.benutzer!.id, ereignis: 'SITZUNG_BEENDET', details: 'Alle anderen Sitzungen beendet' });
  return { ok: true };
}

function geraete(a: Anfrage) {
  return a.benutzer!.bekannteGeraete.map(g => ({ name: g, aktiv: sitzungen.fuer(a.benutzer!.id).some(s => s.geraet === g) }));
}

function geraetEntfernen(a: Anfrage) {
  const b = a.benutzer!;
  const name = decodeURIComponent(a.params['name']);
  if (!b.bekannteGeraete.includes(name)) throw new ApiFehler(404, 'Gerät nicht gefunden.');
  b.bekannteGeraete = b.bekannteGeraete.filter(g => g !== name);
  sitzungen.fuer(b.id).filter(s => s.geraet === name && s.token !== a.token).forEach(s => sitzungen.entfernen(s.token));
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'GERAET_ENTFERNT', details: `Gerät „${name}“ entfernt und abgemeldet` });
  return geraete(a);
}

function sicherheitsprotokoll(a: Anfrage) {
  const b = a.benutzer!;
  const nurZugriffe = a.query.get('art') === 'ZUGRIFFE';
  return a.store.protokoll.filter(p => p.benutzerId === b.id && (!nurZugriffe || p.ereignis === 'DATENZUGRIFF'))
    .sort((x, y) => y.zeitpunkt.localeCompare(x.zeitpunkt)).slice(0, 100)
    .map(p => ({ ...p, akteur: p.akteurId && p.akteurId !== b.id ? (a.store.benutzer.find(x => x.id === p.akteurId)?.rolle === 'VERSICHERTER' ? 'Bevollmächtigte Person' : 'Mitarbeitende/r der VitaPlus') : 'Sie' }));
}

function selbstSperren(a: Anfrage) {
  const b = a.benutzer!;
  if (a.body?.bestaetigung !== 'SPERREN') throw new ApiFehler(400, 'Bitte geben Sie zur Bestätigung SPERREN ein.', 'bestaetigung');
  b.konto = 'SELBST_GESPERRT';
  sitzungen.alleEntfernenFuer(b.id);
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'KONTO_GESPERRT', details: 'Zugang wegen Missbrauchsverdacht selbst gesperrt', stufe: 'KRITISCH' });
  return { ok: true };
}

function kontoLoeschen(a: Anfrage) {
  const b = a.benutzer!;
  if (a.body?.passwort !== b.passwort) throw new ApiFehler(403, 'Das Passwort ist nicht korrekt.', 'passwort');
  const offen = a.store.vorgaenge.filter(v => v.benutzerId === b.id && OFFENE_STATUS.includes(v.status));
  if (offen.length && !a.body?.trotzdem) {
    throw new ApiFehler(409, `Sie haben noch ${offen.length} offene Vorgänge. Antworten erhalten Sie nach der Löschung per Post.`, undefined, 'OFFENE_VORGAENGE', { anzahl: offen.length });
  }
  b.konto = 'GELOESCHT';
  b.email = `geloescht-${b.id}@vitaplus.invalid`;
  b.kommunikation = { ...b.kommunikation, email: false, post: true };
  sitzungen.alleEntfernenFuer(b.id);
  a.store.nachrichten = a.store.nachrichten.filter(n => n.benutzerId !== b.id || n.kategorie === 'BEITRAG');
  a.store.benachrichtigungen = a.store.benachrichtigungen.filter(n => n.benutzerId !== b.id);
  const st = a.store.stammdaten.find(s => s.versichertennummer === b.versichertennummer);
  if (st) st.registriert = false;
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'KONTO_GELOESCHT', details: 'Online-Konto gelöscht – Mitgliedschaft besteht fort', stufe: 'WARNUNG' });
  return { ok: true };
}

// ---------------------------------------------------------------- Einstellungen

function darstellung(a: Anfrage) {
  const b = a.benutzer!;
  const { sprache, hoherKontrast, schriftgroesse } = a.body || {};
  if (sprache && !['de', 'en'].includes(sprache)) throw new ApiFehler(400, 'Sprache wird nicht unterstützt.', 'sprache');
  if (schriftgroesse && !['NORMAL', 'GROSS', 'SEHR_GROSS'].includes(schriftgroesse)) throw new ApiFehler(400, 'Ungültige Schriftgröße', 'schriftgroesse');
  if (sprache) b.sprache = sprache;
  if (hoherKontrast !== undefined) b.hoherKontrast = !!hoherKontrast;
  if (schriftgroesse) b.schriftgroesse = schriftgroesse;
  return ohnePasswort(b);
}

function benachrichtigungsEinstellungen(a: Anfrage) {
  const b = a.benutzer!;
  const e = a.body || {};
  if (e.sms && !b.mobil) throw new ApiFehler(400, 'Für SMS-Benachrichtigungen hinterlegen Sie bitte eine Mobilnummer.', 'sms');
  if (e.ruhezeitAktiv && (!/^\d{2}:\d{2}$/.test(e.ruhezeitVon) || !/^\d{2}:\d{2}$/.test(e.ruhezeitBis))) throw new ApiFehler(400, 'Bitte geben Sie gültige Uhrzeiten an.', 'ruhezeitVon');
  if (e.ruhezeitAktiv && e.ruhezeitVon === e.ruhezeitBis) throw new ApiFehler(400, 'Beginn und Ende der Ruhezeit dürfen nicht gleich sein.', 'ruhezeitBis');
  if (e.kategorien && e.kategorien.SICHERHEIT === false) throw new ApiFehler(400, 'Sicherheitshinweise können nicht deaktiviert werden.', 'SICHERHEIT');
  b.benachrichtigungen = {
    email: !!e.email, push: !!e.push, sms: !!e.sms,
    kategorien: { ...b.benachrichtigungen.kategorien, ...(e.kategorien || {}), SICHERHEIT: true },
    ruhezeitAktiv: !!e.ruhezeitAktiv, ruhezeitVon: e.ruhezeitVon || '22:00', ruhezeitBis: e.ruhezeitBis || '07:00',
  };
  return ohnePasswort(b);
}

function datenschutzPraeferenzen(a: Anfrage) {
  const b = a.benutzer!;
  b.datenschutzPraeferenzen = { nutzungsanalyse: !!a.body?.nutzungsanalyse, komfortCookies: !!a.body?.komfortCookies };
  if (!b.datenschutzPraeferenzen.nutzungsanalyse) a.store.seitenaufrufe = a.store.seitenaufrufe.filter(() => true);
  return ohnePasswort(b);
}

function weitereAngaben(a: Anfrage) {
  const b = a.benutzer!;
  const { steuerId } = a.body || {};
  if (steuerId !== undefined) {
    const n = String(steuerId).replace(/\s/g, '');
    if (n && !istSteuerIdGueltig(n)) throw new ApiFehler(400, 'Die steuerliche Identifikationsnummer ist ungültig.', 'steuerId');
    aenderungMerken(b, 'Steuer-ID', b.steuerId ? '•••••••' + b.steuerId.slice(-4) : '–', n ? '•••••••' + n.slice(-4) : '–', voller(b));
    b.steuerId = n || undefined;
  }
  return ohnePasswort(b);
}

function aenderungshistorie(a: Anfrage) {
  return a.store.aenderungshistorie.filter(h => h.benutzerId === a.benutzer!.id).sort((x, y) => y.zeitpunkt.localeCompare(x.zeitpunkt));
}

// ---------------------------------------------------------------- Benachrichtigungen

function benachrichtigungen(a: Anfrage) {
  const l = a.store.benachrichtigungen.filter(n => n.benutzerId === a.benutzer!.id).sort((x, y) => y.zeitpunkt.localeCompare(x.zeitpunkt));
  const kat = a.query.get('kategorie');
  return { ungelesen: l.filter(n => !n.gelesen).length, eintraege: (kat ? l.filter(n => n.kategorie === kat) : l).slice(0, 100) };
}

/** Leichtgewichtige Statusabfrage der geöffneten Anwendung (Glocke, Postfach, neue Ereignisse). */
function takt(a: Anfrage) {
  const b = a.benutzer!;
  const seit = a.query.get('seit') || '';
  const l = a.store.benachrichtigungen.filter(n => n.benutzerId === b.id);
  return {
    ungelesen: l.filter(n => !n.gelesen).length,
    postfachUngelesen: a.store.nachrichten.filter(n => n.benutzerId === b.id && !n.gelesen && n.ordner === 'EINGANG').length,
    neu: l.filter(n => !n.gelesen && n.zeitpunkt > seit).sort((x, y) => x.zeitpunkt.localeCompare(y.zeitpunkt)).slice(-3),
    stand: l.reduce((m, n) => (n.zeitpunkt > m ? n.zeitpunkt : m), seit),
  };
}

function benachrichtigungGelesen(a: Anfrage) {
  const id = a.params['id'];
  a.store.benachrichtigungen.filter(n => n.benutzerId === a.benutzer!.id && (id === 'alle' || n.id === id)).forEach(n => (n.gelesen = true));
  return benachrichtigungen(a);
}

function benachrichtigungLoeschen(a: Anfrage) {
  a.store.benachrichtigungen = a.store.benachrichtigungen.filter(n => !(n.benutzerId === a.benutzer!.id && n.id === a.params['id']));
  return benachrichtigungen(a);
}

// ---------------------------------------------------------------- Einwilligungen & Datenschutz

function einwilligungen(a: Anfrage) {
  const b = a.benutzer!;
  return EINWILLIGUNGEN.map(def => {
    const e = a.store.einwilligungen.find(x => x.benutzerId === b.id && x.code === def.code);
    return { ...def, erteilt: e?.erteilt ?? false, zeitpunkt: e?.zeitpunkt ?? null, historie: e?.historie ?? [] };
  });
}

function einwilligungSetzen(a: Anfrage) {
  const b = a.benutzer!;
  const code = a.params['code'];
  const def = EINWILLIGUNGEN.find(x => x.code === code);
  if (!def) throw new ApiFehler(404, 'Unbekannte Einwilligung');
  const erteilt = !!a.body?.erteilt;
  if (!erteilt && code === 'BONUS_DATEN' && b.bonusTeilnahmeSeit && !a.body?.bonusBeenden) {
    throw new ApiFehler(409, 'Ohne diese Einwilligung ist keine Teilnahme am Bonusprogramm möglich. Möchten Sie die Teilnahme beenden?', undefined, 'BONUS_TEILNAHME');
  }
  let e = a.store.einwilligungen.find(x => x.benutzerId === b.id && x.code === code);
  if (!e) {
    e = { id: neueId('ew'), benutzerId: b.id, code, erteilt, zeitpunkt: jetztIso(), historie: [] };
    a.store.einwilligungen.push(e);
  }
  e.erteilt = erteilt;
  e.zeitpunkt = jetztIso();
  e.historie.push({ zeitpunkt: e.zeitpunkt, erteilt, kanal: 'Online' });
  if (!erteilt && code === 'BONUS_DATEN') b.bonusTeilnahmeSeit = undefined;
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: erteilt ? 'EINWILLIGUNG_ERTEILT' : 'EINWILLIGUNG_WIDERRUFEN', details: def.titel });
  return einwilligungen(a);
}

function datenexport(a: Anfrage) {
  const b = a.benutzer!;
  const freigegeben = a.store.vorgaenge.some(v => v.benutzerId === b.id && v.typ === 'DATENSCHUTZANFRAGE' && ['AUSKUNFT', 'UEBERTRAGBARKEIT'].includes(v.daten['recht']) && v.status === 'GENEHMIGT');
  if (!freigegeben) throw new ApiFehler(403, 'Bitte beantragen Sie zuerst eine Datenauskunft.', undefined, 'KEINE_AUSKUNFT');
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'DATENEXPORT', details: 'Kopie der gespeicherten Daten heruntergeladen', stufe: 'WARNUNG' });
  const s = a.store;
  const eigene = <T extends { benutzerId: string }>(l: T[]) => l.filter(x => x.benutzerId === b.id);
  return {
    erstelltAm: jetztIso(),
    stammdaten: ohnePasswort(b),
    familie: s.familie.filter(f => f.hauptversicherterId === b.id),
    vorgaenge: eigene(s.vorgaenge).map(v => ({ ...v, anhaenge: v.anhaenge.map(x => x.name) })),
    nachrichten: eigene(s.nachrichten).map(n => ({ datum: n.datum, betreff: n.betreff, absender: n.absender })),
    bonus: eigene(s.bonus), gesundheitskarten: eigene(s.karten), termine: eigene(s.termine), beitragskonto: eigene(s.beitragskonto),
    zuzahlungen: eigene(s.zuzahlungen), leistungsdaten: eigene(s.leistungsdaten), einwilligungen: eigene(s.einwilligungen),
    vollmachten: eigene(s.vollmachten), protokoll: s.protokoll.filter(p => p.benutzerId === b.id),
  };
}

// ---------------------------------------------------------------- Vollmachten & Vertretung

const UMFAENGE = ['POSTFACH', 'ANTRAEGE', 'AUSKUNFT', 'PFLEGE', 'BEITRAEGE', 'ALLES'];

function vollmachten(a: Anfrage) {
  const b = a.benutzer!;
  a.store.vollmachten.filter(v => v.benutzerId === b.id && v.status === 'AKTIV' && v.gueltigBis && parseIso(v.gueltigBis) < heute()).forEach(v => (v.status = 'ABGELAUFEN'));
  const erteilt = a.store.vollmachten.filter(v => v.benutzerId === b.id);
  const erhalten = a.store.vollmachten.filter(v => v.status === 'AKTIV' && `${v.vorname} ${v.nachname}`.toLowerCase() === `${b.vorname} ${b.nachname}`.toLowerCase() && v.geburtsdatum === b.geburtsdatum)
    .map(v => ({ ...v, vollmachtgeber: voller(a.store.benutzer.find(x => x.id === v.benutzerId)!) }));
  const gesetzlich = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status === 'AKTIV' && alterAm(f.geburtsdatum) < 18)
    .map(f => ({ id: f.id, name: `${f.vorname} ${f.nachname}`, alter: alterAm(f.geburtsdatum), endetAm: `${Number(f.geburtsdatum.substring(0, 4)) + 18}${f.geburtsdatum.substring(4)}`,
      eigenerZugangAb: `${Number(f.geburtsdatum.substring(0, 4)) + 15}${f.geburtsdatum.substring(4)}` }));
  return { erteilt, erhalten, gesetzlich, umfaenge: UMFAENGE };
}

function vollmachtErteilen(a: Anfrage) {
  const b = a.benutzer!;
  const d = a.body || {};
  pflicht(d.vorname, 'vorname');
  pflicht(d.nachname, 'nachname');
  pflicht(d.geburtsdatum, 'geburtsdatum');
  pflicht(d.beziehung, 'beziehung');
  if (!Array.isArray(d.umfang) || !d.umfang.length || d.umfang.some((u: string) => !UMFAENGE.includes(u))) throw new ApiFehler(400, 'Bitte wählen Sie den Umfang der Vollmacht.', 'umfang');
  if (alterAm(d.geburtsdatum) < 18) throw new ApiFehler(422, 'Bevollmächtigte Personen müssen volljährig sein.', 'geburtsdatum');
  if (d.onlineZugriff && !istEmailGueltig(d.email)) throw new ApiFehler(400, 'Für den Online-Zugriff benötigen wir die E-Mail-Adresse der bevollmächtigten Person.', 'email');
  if (d.gueltigBis && parseIso(d.gueltigBis) <= heute()) throw new ApiFehler(400, 'Das Ende der Vollmacht muss in der Zukunft liegen.', 'gueltigBis');
  if (['BETREUUNG', 'VORSORGEVOLLMACHT'].includes(d.art) && !d.nachweis) throw new ApiFehler(400, 'Bitte laden Sie die Betreuungsurkunde bzw. Vorsorgevollmacht hoch.', 'nachweis');
  const aktive = a.store.vollmachten.filter(v => v.benutzerId === b.id && v.status !== 'WIDERRUFEN' && v.status !== 'ABGELAUFEN');
  if (aktive.length >= 3) throw new ApiFehler(409, 'Sie können höchstens 3 Personen gleichzeitig bevollmächtigen.');
  if (aktive.some(v => v.vorname.toLowerCase() === String(d.vorname).toLowerCase() && v.nachname.toLowerCase() === String(d.nachname).toLowerCase() && v.geburtsdatum === d.geburtsdatum)) {
    throw new ApiFehler(409, 'Für diese Person besteht bereits eine Vollmacht. Bitte widerrufen Sie diese zuerst, um sie zu ändern.');
  }
  const v: Vollmacht = {
    id: neueId('vm'), benutzerId: b.id, vorname: String(d.vorname).trim(), nachname: String(d.nachname).trim(), geburtsdatum: d.geburtsdatum,
    email: d.email, beziehung: d.beziehung, umfang: d.umfang.includes('ALLES') ? ['ALLES'] : d.umfang, gueltigAb: d.gueltigAb || heuteIso(),
    gueltigBis: d.gueltigBis || undefined, onlineZugriff: !!d.onlineZugriff, status: d.onlineZugriff ? 'AUSSTEHEND' : 'AKTIV', erteiltAm: jetztIso(),
    art: d.art || 'VOLLMACHT',
  };
  a.store.vollmachten.push(v);
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'VOLLMACHT_ERTEILT', details: `Vollmacht für ${v.vorname} ${v.nachname} (${v.umfang.join(', ')})`, stufe: 'WARNUNG' });
  postfachNachricht(b.id, 'Bestätigung Ihrer Vollmacht',
    `${anrede(b)},\n\nSie haben ${v.vorname} ${v.nachname} bevollmächtigt. ` +
    (v.onlineZugriff ? `Wir haben eine Einladung an ${v.email} gesendet. Die Vollmacht wird wirksam, sobald die Person die Einladung bestätigt.` : 'Die Vollmacht ist ab sofort wirksam.') +
    '\n\nSie können die Vollmacht jederzeit widerrufen.\n\nIhre VitaPlus', { kategorie: 'MITGLIEDSCHAFT' });
  return v;
}

function vollmachtWiderrufen(a: Anfrage) {
  const v = a.store.vollmachten.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!v) throw new ApiFehler(404, 'Vollmacht nicht gefunden.');
  if (v.status === 'WIDERRUFEN') throw new ApiFehler(409, 'Die Vollmacht wurde bereits widerrufen.');
  if (v.art === 'BETREUUNG') throw new ApiFehler(409, 'Eine gerichtliche Betreuung kann nur durch das Betreuungsgericht aufgehoben werden.');
  v.status = 'WIDERRUFEN';
  v.widerrufenAm = jetztIso();
  protokollieren({ benutzerId: a.benutzer!.id, akteurId: a.benutzer!.id, ereignis: 'VOLLMACHT_WIDERRUFEN', details: `Vollmacht für ${v.vorname} ${v.nachname} widerrufen`, stufe: 'WARNUNG' });
  return v;
}

function einladungAnnehmen(a: Anfrage) {
  const b = a.benutzer!;
  const v = a.store.vollmachten.find(x => x.id === a.params['id'] && x.status === 'AUSSTEHEND');
  if (!v) throw new ApiFehler(404, 'Keine offene Einladung gefunden.');
  if (`${v.vorname} ${v.nachname}`.toLowerCase() !== `${b.vorname} ${b.nachname}`.toLowerCase() || v.geburtsdatum !== b.geburtsdatum) {
    throw new ApiFehler(403, 'Diese Einladung ist nicht für Sie bestimmt.');
  }
  v.status = 'AKTIV';
  return v;
}

function einladungen(a: Anfrage) {
  const b = a.benutzer!;
  return a.store.vollmachten.filter(v => v.status === 'AUSSTEHEND' && `${v.vorname} ${v.nachname}`.toLowerCase() === `${b.vorname} ${b.nachname}`.toLowerCase() && v.geburtsdatum === b.geburtsdatum)
    .map(v => ({ ...v, vollmachtgeber: voller(a.store.benutzer.find(x => x.id === v.benutzerId)!) }));
}

/** Zugriff als bevollmächtigte Person: liefert die freigegebenen Daten des Vollmachtgebers. */
function vertretungsansicht(a: Anfrage) {
  const b = a.benutzer!;
  const v = a.store.vollmachten.find(x => x.id === a.params['id'] && x.status === 'AKTIV' && x.onlineZugriff &&
    `${x.vorname} ${x.nachname}`.toLowerCase() === `${b.vorname} ${b.nachname}`.toLowerCase() && x.geburtsdatum === b.geburtsdatum);
  if (!v) throw new ApiFehler(403, 'Sie sind für diese Person nicht (mehr) bevollmächtigt.');
  const geber = a.store.benutzer.find(x => x.id === v.benutzerId)!;
  const darf = (u: string) => v.umfang.includes('ALLES') || v.umfang.includes(u);
  protokollieren({ benutzerId: geber.id, akteurId: b.id, ereignis: 'DATENZUGRIFF', details: `Zugriff durch bevollmächtigte Person ${voller(b)}` });
  return {
    vollmachtgeber: voller(geber), umfang: v.umfang,
    nachrichten: darf('POSTFACH') ? a.store.nachrichten.filter(n => n.benutzerId === geber.id && n.ordner === 'EINGANG').slice(0, 20) : null,
    vorgaenge: darf('ANTRAEGE') || darf('AUSKUNFT') ? a.store.vorgaenge.filter(x => x.benutzerId === geber.id && x.status !== 'ENTWURF').map(x => ({ vorgangsnummer: x.vorgangsnummer, titel: x.titel, status: x.status, geaendertAm: x.geaendertAm })) : null,
    pflege: darf('PFLEGE') ? a.store.pflege.find(p => p.benutzerId === geber.id) || null : null,
  };
}

export const KONTO_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/konto/sitzungen', handler: sitzungsListe },
  { methode: 'DELETE', muster: '/api/konto/sitzungen/andere', handler: alleAnderenBeenden },
  { methode: 'DELETE', muster: '/api/konto/sitzungen/:id', handler: sitzungBeenden },
  { methode: 'GET', muster: '/api/konto/geraete', handler: geraete, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/konto/geraete/:name', handler: geraetEntfernen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/konto/protokoll', handler: sicherheitsprotokoll },
  { methode: 'POST', muster: '/api/konto/sperren', handler: selbstSperren, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/konto/loeschen', handler: kontoLoeschen, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/konto/darstellung', handler: darstellung },
  { methode: 'PUT', muster: '/api/konto/benachrichtigungen', handler: benachrichtigungsEinstellungen, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/konto/datenschutz', handler: datenschutzPraeferenzen },
  { methode: 'PUT', muster: '/api/profil/weitere', handler: weitereAngaben, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/profil/historie', handler: aenderungshistorie, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/benachrichtigungen', handler: benachrichtigungen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/takt', handler: takt, rolle: 'VERSICHERTER', hintergrund: true },
  { methode: 'PUT', muster: '/api/benachrichtigungen/:id/gelesen', handler: benachrichtigungGelesen, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/benachrichtigungen/:id', handler: benachrichtigungLoeschen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/einwilligungen', handler: einwilligungen, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/einwilligungen/:code', handler: einwilligungSetzen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/datenschutz/export', handler: datenexport, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/vollmachten', handler: vollmachten, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/vollmachten/einladungen', handler: einladungen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/vollmachten', handler: vollmachtErteilen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/vollmachten/:id/widerrufen', handler: vollmachtWiderrufen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/vollmachten/:id/annehmen', handler: einladungAnnehmen, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/vollmachten/:id/ansicht', handler: vertretungsansicht, rolle: 'VERSICHERTER' },
];
