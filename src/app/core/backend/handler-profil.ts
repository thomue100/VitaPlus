import { Benutzer } from '../models';
import { addMonate, heute, jetztIso, parseIso } from '../util/datum';
import {
  enthaeltPersoenlicheDaten, ibanLand, istIbanGueltig, istPasswortRegelkonform, istPlzGueltig, istTelefonGueltig,
  maskiereIban, normalisiereIban,
} from '../util/pruefungen';
import { Anfrage, ApiFehler, anrede, ohnePasswort, pflicht, postfachNachricht, Route, statusSetzen, versenden, voller, eingangErfassen } from './api-kontext';
import { neueId, neueVorgangsnummer, sitzungen } from './db';
import { anhaengePruefen } from './handler-vorgaenge';

const SEPA_LAENDER = ['DE', 'AT', 'BE', 'CH', 'DK', 'ES', 'FR', 'IT', 'LU', 'NL', 'PL'];
const BANKEN: Record<string, [string, string]> = {
  '10050000': ['Berliner Sparkasse', 'BELADEBEXXX'],
  '20040000': ['Commerzbank Hamburg', 'COBADEHHXXX'],
  '70020270': ['UniCredit Bank', 'HYVEDEMMXXX'],
  '50010517': ['ING-DiBa', 'INGDDEFFXXX'],
  '37040044': ['Commerzbank Köln', 'COBADEFFXXX'],
  '86055592': ['Sparkasse Leipzig', 'WELADE8LXXX'],
};

/** Eigene Stammdaten; die IBAN wird zusätzlich maskiert geliefert */
function profil(a: Anfrage): Omit<ReturnType<typeof ohnePasswort>, 'bank'> & { bank?: NonNullable<Benutzer['bank']> & { ibanMaskiert: string } } {
  const p = ohnePasswort(a.benutzer!);
  return { ...p, bank: p.bank ? { ...p.bank, ibanMaskiert: maskiereIban(p.bank.iban) } : undefined };
}

function bankLookup(a: Anfrage) {
  const iban = normalisiereIban(a.query.get('iban') || '');
  if (!istIbanGueltig(iban)) throw new ApiFehler(400, 'Die IBAN ist ungültig.', 'iban');
  if (ibanLand(iban) !== 'DE') return { bankname: null, bic: null };
  const blz = iban.substring(4, 12);
  const treffer = BANKEN[blz];
  return { bankname: treffer?.[0] ?? null, bic: treffer?.[1] ?? null };
}

function adresseAendern(a: Anfrage) {
  const b = a.benutzer!;
  const { strasse, hausnummer, plz, ort, land, gueltigAb, fuerFamilie } = a.body || {};
  pflicht(strasse, 'strasse');
  pflicht(hausnummer, 'hausnummer');
  pflicht(plz, 'plz');
  pflicht(ort, 'ort');
  pflicht(gueltigAb, 'gueltigAb');
  if (land && land !== 'Deutschland') {
    throw new ApiFehler(422, 'Ein Umzug ins Ausland kann nicht online gemeldet werden, da sich Ihr Versicherungsschutz ändern kann. Bitte vereinbaren Sie einen Beratungstermin.', 'land', 'AUSLAND');
  }
  if (!istPlzGueltig(plz)) throw new ApiFehler(400, 'Bitte geben Sie eine gültige Postleitzahl ein.', 'plz');
  if (!/^\d+\s?[a-zA-Z]?(\s?[-\/]\s?\d+\s?[a-zA-Z]?)?$/.test(String(hausnummer).trim())) {
    throw new ApiFehler(400, 'Bitte prüfen Sie die Hausnummer.', 'hausnummer');
  }
  const ab = parseIso(gueltigAb);
  if (ab < addMonate(heute(), -3) || ab > addMonate(heute(), 3)) {
    throw new ApiFehler(400, 'Das Umzugsdatum darf höchstens 3 Monate in der Vergangenheit oder Zukunft liegen.', 'gueltigAb');
  }
  const alt = { ...b.adresse };
  b.adresse = { strasse: String(strasse).trim(), hausnummer: String(hausnummer).trim(), plz, ort: String(ort).trim(), land: 'Deutschland' };
  let familie = 0;
  if (fuerFamilie) {
    familie = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status === 'AKTIV').length;
  }
  postfachNachricht(b.id, 'Bestätigung Ihrer Adressänderung',
    `${anrede(b)},\n\nwir haben Ihre neue Anschrift ab ${ab.toLocaleDateString('de-DE')} gespeichert:\n${b.adresse.strasse} ${b.adresse.hausnummer}\n${b.adresse.plz} ${b.adresse.ort}\n\n` +
    (familie > 0 ? `Die Anschrift wurde auch für ${familie} mitversicherte Familienangehörige übernommen.\n\n` : '') +
    `Ihre bisherige Anschrift: ${alt.strasse} ${alt.hausnummer}, ${alt.plz} ${alt.ort}\n\nMit freundlichen Grüßen\nIhre VitaPlus`,
    { kategorie: 'MITGLIEDSCHAFT' });
  return profil(a);
}

function kontaktAendern(a: Anfrage) {
  const b = a.benutzer!;
  const { telefon, mobil } = a.body || {};
  if (!istTelefonGueltig(telefon)) throw new ApiFehler(400, 'Bitte prüfen Sie die Telefonnummer.', 'telefon');
  if (!istTelefonGueltig(mobil)) throw new ApiFehler(400, 'Bitte prüfen Sie die Mobilnummer.', 'mobil');
  if (b.zweiFaktorAktiv && !mobil) {
    throw new ApiFehler(409, 'Die Mobilnummer wird für die Zwei-Faktor-Anmeldung benötigt und kann nicht entfernt werden.', 'mobil');
  }
  b.telefon = telefon || undefined;
  b.mobil = mobil || undefined;
  return profil(a);
}

function emailAendern(a: Anfrage) {
  const b = a.benutzer!;
  const { email, passwort } = a.body || {};
  pflicht(email, 'email');
  if (passwort !== b.passwort) throw new ApiFehler(403, 'Das Passwort ist nicht korrekt.', 'passwort');
  const neu = String(email).trim();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(neu)) throw new ApiFehler(400, 'Bitte geben Sie eine gültige E-Mail-Adresse ein.', 'email');
  if (neu.toLowerCase() === b.email.toLowerCase()) throw new ApiFehler(400, 'Die neue E-Mail-Adresse entspricht der bisherigen.', 'email');
  if (a.store.benutzer.some(x => x.id !== b.id && x.email.toLowerCase() === neu.toLowerCase())) {
    throw new ApiFehler(409, 'Diese E-Mail-Adresse wird bereits verwendet.', 'email');
  }
  const alt = b.email;
  b.email = neu;
  postfachNachricht(b.id, 'Ihre E-Mail-Adresse wurde geändert',
    `${anrede(b)},\n\nIhre E-Mail-Adresse wurde von ${alt} auf ${neu} geändert. Bitte verwenden Sie die neue Adresse ab sofort für die Anmeldung.\n\nIhre VitaPlus`,
    { kategorie: 'SYSTEM', absender: 'VitaPlus Sicherheit' });
  return profil(a);
}

function bankSpeichern(a: Anfrage) {
  const b = a.benutzer!;
  const { kontoinhaber, iban, bic, sepaMandat, zustimmungKontoinhaber } = a.body || {};
  pflicht(kontoinhaber, 'kontoinhaber');
  pflicht(iban, 'iban');
  const n = normalisiereIban(iban);
  if (!istIbanGueltig(n)) throw new ApiFehler(400, 'Die IBAN ist ungültig.', 'iban');
  if (!SEPA_LAENDER.includes(ibanLand(n))) throw new ApiFehler(422, 'Konten aus diesem Land können wir leider nicht verwenden.', 'iban');
  if (ibanLand(n) !== 'DE' && !bic) throw new ApiFehler(400, 'Für ausländische Konten ist die BIC erforderlich.', 'bic');
  const eigenerName = `${b.vorname} ${b.nachname}`.toLowerCase();
  const inhaber = String(kontoinhaber).trim().toLowerCase().replace(/^dr\.?\s+/, '');
  if (!inhaber.includes(b.nachname.toLowerCase()) && inhaber !== eigenerName && !zustimmungKontoinhaber) {
    throw new ApiFehler(400, 'Bei abweichendem Kontoinhaber ist dessen Zustimmung erforderlich.', 'zustimmungKontoinhaber');
  }
  const blz = n.substring(4, 12);
  b.bank = {
    kontoinhaber: String(kontoinhaber).trim(),
    iban: n,
    bic: bic || BANKEN[blz]?.[1],
    bankname: BANKEN[blz]?.[0] || (ibanLand(n) === 'DE' ? 'Unbekanntes Kreditinstitut' : undefined),
    sepaMandat: !!sepaMandat,
  };
  postfachNachricht(b.id, 'Ihre Bankverbindung wurde geändert',
    `${anrede(b)},\n\nab sofort verwenden wir für Erstattungen die IBAN ${maskiereIban(n)}.` +
    (sepaMandat ? '\n\nDas SEPA-Lastschriftmandat für Ihre Beiträge wurde erteilt.' : '') + '\n\nIhre VitaPlus',
    { kategorie: 'BEITRAG', absender: 'VitaPlus Beitragsabteilung' });
  return profil(a);
}

function bankLoeschen(a: Anfrage) {
  const b = a.benutzer!;
  const offen = a.store.vorgaenge.filter(v => v.benutzerId === b.id &&
    ['KOSTENERSTATTUNG', 'BONUS_AUSZAHLUNG'].includes(v.typ) &&
    ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE', 'GENEHMIGT', 'TEILWEISE_GENEHMIGT'].includes(v.status));
  if (offen.length) {
    throw new ApiFehler(409, `Die Bankverbindung wird noch für ${offen.length} offene${offen.length === 1 ? 'n' : ''} Vorgang/Vorgänge benötigt.`);
  }
  if (b.bank?.sepaMandat && b.beschaeftigung === 'SELBSTSTAENDIG') {
    throw new ApiFehler(409, 'Ihre Beiträge werden per Lastschrift eingezogen. Bitte hinterlegen Sie statt einer Löschung eine neue Bankverbindung.');
  }
  b.bank = undefined;
  return profil(a);
}

function kommunikationAendern(a: Anfrage) {
  const b = a.benutzer!;
  const k = a.body || {};
  if (!k.email && !k.post) throw new ApiFehler(400, 'Mindestens ein Kanal (E-Mail oder Post) muss für wichtige Mitteilungen aktiv bleiben.');
  if (k.sms && !b.mobil) throw new ApiFehler(400, 'Für SMS-Benachrichtigungen hinterlegen Sie bitte eine Mobilnummer.', 'sms');
  b.kommunikation = { email: !!k.email, post: !!k.post, sms: !!k.sms, newsletter: !!k.newsletter, erinnerungVorsorge: !!k.erinnerungVorsorge };
  return profil(a);
}

function passwortAendern(a: Anfrage) {
  const b = a.benutzer!;
  const { altesPasswort, neuesPasswort } = a.body || {};
  if (altesPasswort !== b.passwort) throw new ApiFehler(403, 'Das aktuelle Passwort ist nicht korrekt.', 'altesPasswort');
  if (!istPasswortRegelkonform(neuesPasswort)) throw new ApiFehler(400, 'Das neue Passwort erfüllt nicht die Sicherheitsanforderungen.', 'neuesPasswort');
  if (neuesPasswort === altesPasswort) throw new ApiFehler(400, 'Das neue Passwort muss sich vom bisherigen unterscheiden.', 'neuesPasswort');
  if (enthaeltPersoenlicheDaten(neuesPasswort, b.vorname, b.nachname, b.geburtsdatum.substring(0, 4))) {
    throw new ApiFehler(400, 'Das Passwort darf weder Ihren Namen noch Ihr Geburtsjahr enthalten.', 'neuesPasswort');
  }
  b.passwort = neuesPasswort;
  sitzungen.alleEntfernenFuer(b.id);
  return { ok: true, neuAnmelden: true };
}

function zweiFaktorAendern(a: Anfrage) {
  const b = a.benutzer!;
  const { aktiv, passwort, code } = a.body || {};
  if (passwort !== b.passwort) throw new ApiFehler(403, 'Das Passwort ist nicht korrekt.', 'passwort');
  if (aktiv) {
    if (!b.mobil) throw new ApiFehler(409, 'Bitte hinterlegen Sie zuerst eine Mobilnummer.');
    if (!code) {
      b.zweiFaktorCode = String(100000 + Math.floor(Math.random() * 899999));
      versenden('SMS', b.mobil, 'VitaPlus Bestätigungscode', `Ihr Code zur Aktivierung der Zwei-Faktor-Anmeldung: ${b.zweiFaktorCode}`);
      return { codeGesendet: true, entwicklerCode: b.zweiFaktorCode };
    }
    if (String(code).trim() !== b.zweiFaktorCode) throw new ApiFehler(400, 'Der Bestätigungscode ist nicht korrekt.', 'code');
    b.zweiFaktorAktiv = true;
  } else {
    if (b.rolle === 'SACHBEARBEITER') throw new ApiFehler(403, 'Für Mitarbeitende ist die Zwei-Faktor-Anmeldung verpflichtend.');
    b.zweiFaktorAktiv = false;
  }
  return profil(a);
}

function schriftgroesse(a: Anfrage) {
  const w = a.body?.schriftgroesse;
  if (!['NORMAL', 'GROSS', 'SEHR_GROSS'].includes(w)) throw new ApiFehler(400, 'Ungültiger Wert');
  a.benutzer!.schriftgroesse = w;
  return profil(a);
}

function namensaenderung(a: Anfrage) {
  const b = a.benutzer!;
  const { nachname, grund, gueltigAb, anhaenge } = a.body || {};
  pflicht(nachname, 'nachname');
  pflicht(grund, 'grund');
  if (!/^[A-Za-zÄÖÜäöüßéèáàçğışİ' -]{2,60}$/.test(nachname)) throw new ApiFehler(400, 'Der Name enthält ungültige Zeichen.', 'nachname');
  if (String(nachname).trim() === b.nachname) throw new ApiFehler(400, 'Der neue Name entspricht dem bisherigen.', 'nachname');
  if (!anhaenge?.length) throw new ApiFehler(400, 'Bitte laden Sie einen Nachweis (z. B. Heiratsurkunde) hoch.', 'anhaenge');
  anhaengePruefen(anhaenge, true, 3);
  if (a.store.vorgaenge.some(v => v.benutzerId === b.id && v.typ === 'NAMENSAENDERUNG' && ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE'].includes(v.status))) {
    throw new ApiFehler(409, 'Es liegt bereits eine Namensänderung zur Bearbeitung vor.');
  }
  const v = {
    id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), zustaendig: 'Mitgliedschaft & Beiträge', benutzerId: b.id, typ: 'NAMENSAENDERUNG' as const,
    titel: `Namensänderung ${b.nachname} → ${String(nachname).trim()}`, status: 'EINGEREICHT' as const, erstelltAm: jetztIso(), geaendertAm: jetztIso(),
    daten: { bisherigerName: b.nachname, neuerName: String(nachname).trim(), grund, gueltigAb }, anhaenge, historie: [],
  };
  statusSetzen(v as any, 'EINGEREICHT', 'Namensänderung online beantragt', voller(b));
  eingangErfassen(a.store, v as any);
  return v;
}

export function benutzerAusSitzung(a: Anfrage): Benutzer | undefined {
  return a.benutzer;
}

export const PROFIL_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/profil', handler: profil },
  { methode: 'GET', muster: '/api/bank/suche', handler: bankLookup },
  { methode: 'PUT', muster: '/api/profil/adresse', handler: adresseAendern, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/profil/kontakt', handler: kontaktAendern },
  { methode: 'PUT', muster: '/api/profil/email', handler: emailAendern },
  { methode: 'PUT', muster: '/api/profil/bank', handler: bankSpeichern, rolle: 'VERSICHERTER' },
  { methode: 'DELETE', muster: '/api/profil/bank', handler: bankLoeschen, rolle: 'VERSICHERTER' },
  { methode: 'PUT', muster: '/api/profil/kommunikation', handler: kommunikationAendern },
  { methode: 'PUT', muster: '/api/profil/passwort', handler: passwortAendern },
  { methode: 'PUT', muster: '/api/profil/zwei-faktor', handler: zweiFaktorAendern },
  { methode: 'PUT', muster: '/api/profil/schriftgroesse', handler: schriftgroesse },
  { methode: 'POST', muster: '/api/profil/namensaenderung', handler: namensaenderung, rolle: 'VERSICHERTER' },
];
