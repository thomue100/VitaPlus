import { MAX_LOGIN_FEHLVERSUCHE, SESSION_TIMEOUT_MINUTEN } from '../konfiguration';
import { Benutzer } from '../models';
import { addTage, heuteIso, jetztIso } from '../util/datum';
import { enthaeltPersoenlicheDaten, istPasswortRegelkonform, istVersichertennummerFormal } from '../util/pruefungen';
import { Anfrage, ApiFehler, ohnePasswort, pflicht, postfachNachricht, Route, versenden } from './api-kontext';
import { geraetBeschreibung, neueId, sitzungen } from './db';
import { benachrichtigen, protokollieren } from './fachlogik';
import { mitStandard } from './seed-erweiterung';

function findeBenutzer(a: Anfrage, kennung: string): Benutzer | undefined {
  const k = (kennung || '').trim().toLowerCase();
  return a.store.benutzer.find(b => b.email.toLowerCase() === k || (b.versichertennummer || '').toLowerCase() === k);
}

function maskiereNummer(nr?: string): string {
  if (!nr) return '';
  const ziffern = nr.replace(/\D/g, '');
  return ziffern.substring(0, 4) + ' ••• ' + ziffern.substring(ziffern.length - 3);
}

function login(a: Anfrage) {
  const { kennung, passwort } = a.body || {};
  pflicht(kennung, 'kennung');
  pflicht(passwort, 'passwort');
  const b = findeBenutzer(a, kennung);
  if (!b || b.konto === 'GELOESCHT') throw new ApiFehler(401, 'Die Kombination aus Benutzerkennung und Passwort ist nicht bekannt.', undefined, 'LOGIN_FEHLER');
  if (a.store.system.wartungsmodus && b.rolle === 'VERSICHERTER') throw new ApiFehler(503, a.store.system.wartungstext, undefined, 'WARTUNG');
  if (b.konto === 'NICHT_AKTIVIERT') {
    throw new ApiFehler(423, 'Bitte aktivieren Sie Ihren Zugang zuerst mit dem Aktivierungscode aus unserem Brief.', undefined, 'NICHT_AKTIVIERT');
  }
  if (b.konto === 'SELBST_GESPERRT') {
    throw new ApiFehler(423, 'Sie haben Ihren Zugang selbst gesperrt. Zum Entsperren setzen Sie Ihr Passwort zurück oder wenden sich an den Kundenservice.', undefined, 'GESPERRT');
  }
  if (b.gesperrt) {
    throw new ApiFehler(423, 'Ihr Zugang ist gesperrt. Setzen Sie Ihr Passwort zurück oder wenden Sie sich an unseren Kundenservice.', undefined, 'GESPERRT');
  }
  if (b.passwort !== passwort) {
    b.fehlversuche++;
    protokollieren({ benutzerId: b.id, ereignis: 'ANMELDUNG_FEHLGESCHLAGEN', details: `Falsches Passwort (Versuch ${b.fehlversuche})`, geraet: geraetBeschreibung(), stufe: 'WARNUNG' });
    if (b.fehlversuche >= MAX_LOGIN_FEHLVERSUCHE) {
      b.gesperrt = true;
      protokollieren({ benutzerId: b.id, ereignis: 'KONTO_GESPERRT', details: `Automatische Sperre nach ${MAX_LOGIN_FEHLVERSUCHE} Fehlversuchen`, geraet: geraetBeschreibung(), stufe: 'KRITISCH' });
      throw new ApiFehler(423, `Ihr Zugang wurde nach ${MAX_LOGIN_FEHLVERSUCHE} fehlgeschlagenen Anmeldeversuchen gesperrt.`, undefined, 'GESPERRT');
    }
    const rest = MAX_LOGIN_FEHLVERSUCHE - b.fehlversuche;
    throw new ApiFehler(401, `Die Kombination aus Benutzerkennung und Passwort ist nicht bekannt. Noch ${rest} Versuch${rest === 1 ? '' : 'e'}.`, undefined, 'LOGIN_FEHLER');
  }
  b.fehlversuche = 0;
  if (b.zweiFaktorAktiv) {
    const s = sitzungen.erstellen(b.id, true, 5);
    smsCodeSenden(b);
    return { zweiFaktorErforderlich: true, token: s.token, ziel: maskiereNummer(b.mobil || b.telefon) || 'Ihre hinterlegte Rufnummer' };
  }
  return anmeldungAbschliessen(b);
}

function anmeldungAbschliessen(b: Benutzer, methode = 'Passwort') {
  const s = sitzungen.erstellen(b.id, false, SESSION_TIMEOUT_MINUTEN);
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'ANMELDUNG', details: `Erfolgreiche Anmeldung (${methode})`, geraet: s.geraet });
  if (b.rolle === 'VERSICHERTER' && !b.bekannteGeraete.includes(s.geraet)) {
    b.bekannteGeraete.push(s.geraet);
    if (b.bekannteGeraete.length > 1) {
      protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'NEUES_GERAET', details: `Anmeldung von neuem Gerät: ${s.geraet}`, geraet: s.geraet, stufe: 'WARNUNG' });
      benachrichtigen(b.id, 'SICHERHEIT', 'Anmeldung von einem neuen Gerät', `${s.geraet} – waren Sie das nicht? Ändern Sie sofort Ihr Passwort.`, '/einstellungen/sicherheit');
    }
  }
  const vorher = b.letzterLogin;
  b.letzterLogin = jetztIso();
  return { zweiFaktorErforderlich: false, token: s.token, benutzer: ohnePasswort(b), letzterLogin: vorher };
}

function zweiFaktor(a: Anfrage) {
  const { token, code } = a.body || {};
  const s = sitzungen.finden(token);
  if (!s || !s.vorlaeufig) throw new ApiFehler(401, 'Die Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.', undefined, 'SITZUNG_ABGELAUFEN');
  const b = a.store.benutzer.find(x => x.id === s.benutzerId)!;
  if (String(code || '').trim() !== b.zweiFaktorCode) {
    s.codeFehlversuche++;
    if (s.codeFehlversuche >= 3) {
      sitzungen.entfernen(s.token);
      protokollieren({ benutzerId: b.id, ereignis: 'ZWEI_FAKTOR_FEHLGESCHLAGEN', details: 'Sicherheitscode dreimal falsch eingegeben', geraet: s.geraet, stufe: 'WARNUNG' });
      throw new ApiFehler(401, 'Der Sicherheitscode wurde zu oft falsch eingegeben. Bitte melden Sie sich erneut an.', undefined, 'SITZUNG_ABGELAUFEN');
    }
    sitzungen.aktualisieren(s);
    throw new ApiFehler(400, 'Der Sicherheitscode ist nicht korrekt.', 'code');
  }
  sitzungen.entfernen(s.token);
  // Nach der Anmeldung gehören die Codes wieder nur der angemeldeten Person
  (a.store.postausgang || []).forEach(n => { if (n.empfaengerId === b.id && n.kanal === 'SMS') n.ohneAnmeldung = false; });
  return anmeldungAbschliessen(b, 'Passwort + SMS-Code');
}

/** Simulierte Anmeldung über die GesundheitsID bzw. den Online-Ausweis (Weiterleitung an den Identitätsdienst). */
function externeIdentitaet(a: Anfrage) {
  const { verfahren, versichertennummer, pin } = a.body || {};
  if (!['GESUNDHEITSID', 'EID'].includes(verfahren)) throw new ApiFehler(400, 'Unbekanntes Verfahren');
  const b = a.store.benutzer.find(x => x.versichertennummer === String(versichertennummer || '').toUpperCase() && x.rolle === 'VERSICHERTER');
  if (!b) throw new ApiFehler(401, 'Die Identität konnte nicht bestätigt werden.', undefined, 'LOGIN_FEHLER');
  if (!/^\d{6}$/.test(String(pin || ''))) throw new ApiFehler(400, 'Die PIN besteht aus 6 Ziffern.', 'pin');
  if (verfahren === 'GESUNDHEITSID' && a.store.epa.find(e => e.benutzerId === b.id)?.gesundheitsId !== 'AKTIV') {
    throw new ApiFehler(409, 'Für Sie ist noch keine GesundheitsID eingerichtet.', undefined, 'KEINE_GESUNDHEITSID');
  }
  if (b.gesperrt) {
    b.gesperrt = false;
    b.fehlversuche = 0;
    protokollieren({ benutzerId: b.id, ereignis: 'KONTO_ENTSPERRT', details: `Entsperrung durch Identifizierung (${verfahren})` });
  }
  if (b.konto !== 'AKTIV') throw new ApiFehler(423, 'Ihr Online-Zugang ist nicht aktiv.', undefined, 'GESPERRT');
  return anmeldungAbschliessen(b, verfahren === 'EID' ? 'Online-Ausweis' : 'GesundheitsID');
}

function smsCodeSenden(b: Benutzer) {
  versenden('SMS', b.mobil || b.telefon || 'unbekannt', 'VitaPlus Sicherheitscode',
    `Ihr VitaPlus-Sicherheitscode lautet ${b.zweiFaktorCode}. Er ist 5 Minuten gültig. Geben Sie ihn niemals am Telefon weiter.`, undefined, { id: b.id, ohneAnmeldung: true });
}

function codeErneutSenden(a: Anfrage) {
  const s = sitzungen.finden(a.body?.token);
  if (!s || !s.vorlaeufig) throw new ApiFehler(401, 'Die Sitzung ist abgelaufen.', undefined, 'SITZUNG_ABGELAUFEN');
  smsCodeSenden(a.store.benutzer.find(x => x.id === s.benutzerId)!);
  return { gesendet: true };
}

function logout(a: Anfrage) {
  const s = sitzungen.finden(a.token);
  if (s) protokollieren({ benutzerId: s.benutzerId, akteurId: s.benutzerId, ereignis: 'ABMELDUNG', details: 'Abmeldung', geraet: s.geraet });
  if (a.token) sitzungen.entfernen(a.token);
  return { ok: true };
}

function ich(a: Anfrage) {
  return ohnePasswort(a.benutzer!);
}

function registrierungPruefen(a: Anfrage) {
  const { versichertennummer, geburtsdatum } = a.body || {};
  pflicht(versichertennummer, 'versichertennummer');
  pflicht(geburtsdatum, 'geburtsdatum');
  const nr = String(versichertennummer).trim().toUpperCase();
  if (!istVersichertennummerFormal(nr)) throw new ApiFehler(400, 'Die Versichertennummer hat ein ungültiges Format.', 'versichertennummer');
  const st = a.store.stammdaten.find(s => s.versichertennummer === nr && s.geburtsdatum === geburtsdatum);
  if (!st) throw new ApiFehler(404, 'Zu diesen Angaben konnten wir keine Mitgliedschaft finden.');
  if (st.registriert || a.store.benutzer.some(b => b.versichertennummer === nr)) {
    throw new ApiFehler(409, 'Für diese Versichertennummer besteht bereits ein Online-Zugang.', undefined, 'BEREITS_REGISTRIERT');
  }
  return { vorname: st.vorname, nachname: st.nachname, ort: st.adresse.ort, email: st.email };
}

function registrieren(a: Anfrage) {
  const { versichertennummer, geburtsdatum, email, passwort, mobil, nutzungsbedingungen, datenschutz, identifizierung } = a.body || {};
  if (!['EID', 'GESUNDHEITSID', 'POST'].includes(identifizierung)) throw new ApiFehler(400, 'Bitte wählen Sie ein Verfahren zur Identifizierung.', 'identifizierung');
  const daten = registrierungPruefen(a);
  pflicht(email, 'email');
  pflicht(passwort, 'passwort');
  if (!nutzungsbedingungen || !datenschutz) throw new ApiFehler(400, 'Bitte stimmen Sie den Nutzungsbedingungen und der Datenschutzerklärung zu.');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new ApiFehler(400, 'Bitte geben Sie eine gültige E-Mail-Adresse ein.', 'email');
  if (a.store.benutzer.some(b => b.email.toLowerCase() === String(email).toLowerCase())) {
    throw new ApiFehler(409, 'Diese E-Mail-Adresse wird bereits verwendet.', 'email');
  }
  if (!istPasswortRegelkonform(passwort)) throw new ApiFehler(400, 'Das Passwort erfüllt nicht die Sicherheitsanforderungen.', 'passwort');
  if (enthaeltPersoenlicheDaten(passwort, daten.vorname, daten.nachname, String(geburtsdatum).substring(0, 4))) {
    throw new ApiFehler(400, 'Das Passwort darf weder Ihren Namen noch Ihr Geburtsjahr enthalten.', 'passwort');
  }
  const nr = String(versichertennummer).trim().toUpperCase();
  const st = a.store.stammdaten.find(s => s.versichertennummer === nr)!;
  st.registriert = true;
  const b: Benutzer = mitStandard({
    id: neueId('u'), rolle: 'VERSICHERTER', email: String(email).trim(), passwort, versichertennummer: nr,
    anrede: st.anrede || 'DIVERS', vorname: st.vorname, nachname: st.nachname, geburtsdatum: st.geburtsdatum, mobil, telefon: st.telefon,
    adresse: { ...st.adresse }, tarif: st.tarif, beschaeftigung: st.beschaeftigung, mitgliedSeit: st.mitgliedSeit || '2020-01-01',
    arbeitgeber: st.arbeitgeber, bruttoMonat: st.bruttoMonat,
    zweiFaktorAktiv: false, zweiFaktorCode: String(100000 + Math.floor(Math.random() * 899999)), gesperrt: false, fehlversuche: 0,
    kommunikation: { email: true, post: false, sms: false, newsletter: false, erinnerungVorsorge: true },
    schriftgroesse: 'NORMAL', kinderAnzahl: 0, versicherungsart: st.beschaeftigung === 'STUDENT' ? 'STUDENT' : 'PFLICHT',
  });
  a.store.benutzer.push(b);
  a.store.karten.push({
    id: neueId('k'), benutzerId: b.id, inhaber: `${b.vorname} ${b.nachname}`,
    kartennummer: '80276 ' + nr.substring(1, 6) + ' ' + nr.substring(6) + '0 0', gueltigBis: '2030-12-31', status: 'AKTIV', fotoVorhanden: true,
  });
  (st.familie || []).forEach((f, i) => {
    const id = neueId('f');
    a.store.familie.push({ id, hauptversicherterId: b.id, vorname: f.vorname, nachname: f.nachname, geburtsdatum: f.geburtsdatum, geschlecht: 'D',
      beziehung: f.beziehung, status: 'AKTIV', einkommenMonat: 0, inAusbildung: false, anderweitigVersichert: false, beantragtAm: st.mitgliedSeit || heuteIso(),
      versichertennummer: f.versichertennummer });
    a.store.karten.push({ id: 'k' + id, benutzerId: b.id, familienmitgliedId: id, inhaber: `${f.vorname} ${f.nachname}`,
      kartennummer: `80276 ${f.versichertennummer.substring(1, 6)} ${f.versichertennummer.substring(6)}0 ${i + 1}`, gueltigBis: '2030-12-31', status: 'VERSENDET', fotoVorhanden: false });
  });
  if (['FRAU', 'HERR'].includes(st.anrede || '')) b.anrede = st.anrede!;
  if (identifizierung === 'POST') {
    b.konto = 'NICHT_AKTIVIERT';
    b.aktivierungscode = 'VP' + String(Math.floor(Math.random() * 90 + 10)) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    versenden('BRIEF', `${b.vorname} ${b.nachname}, ${b.adresse.strasse} ${b.adresse.hausnummer}, ${b.adresse.plz} ${b.adresse.ort}`.replace(/\s+,/g, ','), 'Ihr Aktivierungscode für die Online-Geschäftsstelle',
      `Guten Tag ${b.vorname} ${b.nachname},\n\nSie haben einen Zugang zur Online-Geschäftsstelle eingerichtet. Ihr persönlicher Aktivierungscode lautet:\n\n${b.aktivierungscode}\n\nGeben Sie den Code zusammen mit Ihrer Versichertennummer ${b.versichertennummer} unter „Aktivierungscode eingeben“ ein.\n\nIhre VitaPlus`,
      { text: 'Zugang aktivieren', ziel: `/aktivieren?nr=${b.versichertennummer}` }, { id: b.id, ohneAnmeldung: true });
  } else {
    versenden('EMAIL', b.email, 'Willkommen in der Online-Geschäftsstelle', `Guten Tag ${b.vorname} ${b.nachname},\n\nIhr Online-Zugang ist eingerichtet. Sie können sich ab sofort mit Ihrer E-Mail-Adresse anmelden.\n\nIhre VitaPlus`,
      { text: 'Jetzt anmelden', ziel: '/anmelden' }, { id: b.id, ohneAnmeldung: true });
  }
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'REGISTRIERUNG', details: `Online-Zugang eingerichtet (Identifizierung: ${identifizierung})` });
  postfachNachricht(b.id, 'Willkommen in der Online-Geschäftsstelle',
    `Guten Tag ${b.vorname} ${b.nachname},\n\nIhr Online-Zugang ist eingerichtet. Bitte ergänzen Sie in Ihrem Profil Ihre Anrede und Ihre Bankverbindung.\n\nIhre VitaPlus`,
    { kategorie: 'SYSTEM', absender: 'VitaPlus' });
  return { ok: true, aktivierungPerPost: b.konto === 'NICHT_AKTIVIERT', entwicklerCode: b.aktivierungscode };
}

function aktivieren(a: Anfrage) {
  const { versichertennummer, aktivierungscode } = a.body || {};
  const b = a.store.benutzer.find(x => x.versichertennummer === String(versichertennummer || '').toUpperCase());
  if (!b || !b.aktivierungscode) throw new ApiFehler(404, 'Für diese Versichertennummer ist keine Aktivierung offen.');
  if (b.aktivierungscode !== String(aktivierungscode || '').trim().toUpperCase()) throw new ApiFehler(400, 'Der Aktivierungscode ist nicht korrekt.', 'aktivierungscode');
  b.aktivierungscode = undefined;
  b.konto = 'AKTIV';
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'AKTIVIERUNG', details: 'Zugang mit Aktivierungscode freigeschaltet' });
  return { ok: true };
}

function passwortVergessen(a: Anfrage) {
  const { email, geburtsdatum } = a.body || {};
  pflicht(email, 'email');
  pflicht(geburtsdatum, 'geburtsdatum');
  const b = a.store.benutzer.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase() && x.geburtsdatum === geburtsdatum);
  let link: string | undefined;
  if (b && b.rolle === 'VERSICHERTER') {
    const token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    a.store.passwortResetTokens = a.store.passwortResetTokens.filter(t => t.benutzerId !== b.id);
    a.store.passwortResetTokens.push({ token, benutzerId: b.id, gueltigBis: addTage(new Date(), 1).toISOString() });
    link = `/passwort-neu?token=${token}`;
    versenden('EMAIL', b.email, 'Passwort zurücksetzen', `Guten Tag ${b.vorname} ${b.nachname},\n\nüber die Online-Geschäftsstelle wurde ein neues Passwort angefordert. Der Link ist 24 Stunden gültig. Falls Sie das nicht waren, ignorieren Sie diese E-Mail.\n\nIhre VitaPlus`,
      { text: 'Neues Passwort festlegen', ziel: link }, { id: b.id, ohneAnmeldung: true });
  }
  // Aus Sicherheitsgründen immer dieselbe Antwort; der Link wird nur in der Entwicklungsumgebung mitgeliefert.
  return { meldung: 'Falls die Angaben zu einem Zugang passen, haben wir Ihnen eine E-Mail mit einem Link gesendet.', entwicklerLink: link };
}

function passwortTokenPruefen(a: Anfrage) {
  const t = a.store.passwortResetTokens.find(x => x.token === a.query.get('token'));
  if (!t || new Date(t.gueltigBis) < new Date()) throw new ApiFehler(410, 'Der Link ist ungültig oder abgelaufen.');
  return { gueltig: true };
}

function passwortZuruecksetzen(a: Anfrage) {
  const { token, passwort } = a.body || {};
  const t = a.store.passwortResetTokens.find(x => x.token === token);
  if (!t || new Date(t.gueltigBis) < new Date()) throw new ApiFehler(410, 'Der Link ist ungültig oder abgelaufen.');
  const b = a.store.benutzer.find(x => x.id === t.benutzerId)!;
  if (!istPasswortRegelkonform(passwort)) throw new ApiFehler(400, 'Das Passwort erfüllt nicht die Sicherheitsanforderungen.', 'passwort');
  if (passwort === b.passwort) throw new ApiFehler(400, 'Das neue Passwort muss sich vom bisherigen unterscheiden.', 'passwort');
  b.passwort = passwort;
  b.gesperrt = false;
  b.fehlversuche = 0;
  if (b.konto === 'SELBST_GESPERRT') b.konto = 'AKTIV';
  b.passwortGeaendertAm = jetztIso();
  protokollieren({ benutzerId: b.id, akteurId: b.id, ereignis: 'PASSWORT_ZURUECKGESETZT', details: 'Passwort über E-Mail-Link zurückgesetzt, Zugang entsperrt', stufe: 'WARNUNG' });
  a.store.passwortResetTokens = a.store.passwortResetTokens.filter(x => x.token !== token);
  sitzungen.alleEntfernenFuer(b.id);
  postfachNachricht(b.id, 'Ihr Passwort wurde geändert',
    'Ihr Passwort für die Online-Geschäftsstelle wurde zurückgesetzt. Falls Sie das nicht waren, kontaktieren Sie uns bitte umgehend.',
    { kategorie: 'SYSTEM', absender: 'VitaPlus Sicherheit', wichtig: true });
  return { ok: true };
}

export const AUTH_ROUTEN: Route[] = [
  { methode: 'POST', muster: '/api/auth/login', handler: login, oeffentlich: true },
  { methode: 'POST', muster: '/api/auth/zwei-faktor', handler: zweiFaktor, oeffentlich: true },
  { methode: 'POST', muster: '/api/auth/extern', handler: externeIdentitaet, oeffentlich: true },
  { methode: 'POST', muster: '/api/auth/zwei-faktor/erneut', handler: codeErneutSenden, oeffentlich: true },
  { methode: 'POST', muster: '/api/auth/logout', handler: logout, oeffentlich: true },
  { methode: 'GET', muster: '/api/auth/ich', handler: ich },
  { methode: 'POST', muster: '/api/registrierung/pruefen', handler: registrierungPruefen, oeffentlich: true },
  { methode: 'POST', muster: '/api/registrierung', handler: registrieren, oeffentlich: true },
  { methode: 'POST', muster: '/api/registrierung/aktivieren', handler: aktivieren, oeffentlich: true },
  { methode: 'POST', muster: '/api/passwort/vergessen', handler: passwortVergessen, oeffentlich: true },
  { methode: 'GET', muster: '/api/passwort/token', handler: passwortTokenPruefen, oeffentlich: true },
  { methode: 'POST', muster: '/api/passwort/neu', handler: passwortZuruecksetzen, oeffentlich: true },
];
