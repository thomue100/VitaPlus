import { Benutzer, Buchung, Leistungsdatensatz, Store, Zuzahlung } from '../models';
import { berechneBeitrag } from '../util/berechnungen';
import { alterAm } from '../util/datum';

const BENACHRICHTIGUNG_STANDARD = {
  email: true, push: false, sms: false,
  kategorien: { NACHRICHT: true, STATUS: true, DOKUMENT: true, FRIST: true, BONUS: true, SICHERHEIT: true },
  ruhezeitAktiv: false, ruhezeitVon: '22:00', ruhezeitBis: '07:00',
};

export function mitStandard(b: Partial<Benutzer>): Benutzer {
  return {
    sprache: 'de',
    hoherKontrast: false,
    benachrichtigungen: structuredClone(BENACHRICHTIGUNG_STANDARD),
    bekannteGeraete: [],
    konto: 'AKTIV',
    datenschutzPraeferenzen: { nutzungsanalyse: false, komfortCookies: true },
    kommunikation: { email: true, post: false, sms: false, newsletter: false, erinnerungVorsorge: true },
    schriftgroesse: 'NORMAL',
    kinderAnzahl: 0,
    fehlversuche: 0,
    gesperrt: false,
    zweiFaktorAktiv: false,
    zweiFaktorCode: '000000',
    ...b,
  } as Benutzer;
}

export interface Kurs {
  id: string;
  titel: string;
  kategorie: 'BEWEGUNG' | 'ERNAEHRUNG' | 'STRESS' | 'SUCHT' | 'PFLEGE';
  anbieter: string;
  plz: string;
  ort: string;
  online: boolean;
  start: string;
  termine: number;
  preis: number;
  zertifiziert: boolean;
  plaetze: number;
  belegt: number;
  beschreibung: string;
}

export const KURSE: Kurs[] = [
  { id: 'K01', titel: 'Rückenfit – Haltung und Kraft', kategorie: 'BEWEGUNG', anbieter: 'Physio am Park', plz: '10405', ort: 'Berlin', online: false, start: '2027-01-12', termine: 10, preis: 120, zertifiziert: true, plaetze: 12, belegt: 9, beschreibung: 'Funktionsgymnastik zur Kräftigung der Rumpfmuskulatur.' },
  { id: 'K02', titel: 'Hatha-Yoga für Einsteiger', kategorie: 'STRESS', anbieter: 'Yogaraum Altona', plz: '22765', ort: 'Hamburg', online: false, start: '2027-01-08', termine: 8, preis: 96, zertifiziert: true, plaetze: 15, belegt: 15, beschreibung: 'Atem, Bewegung und Entspannung – ideal für den Einstieg.' },
  { id: 'K03', titel: 'Progressive Muskelentspannung (online)', kategorie: 'STRESS', anbieter: 'VitaPlus Akademie', plz: '', ort: 'Online', online: true, start: '2026-12-07', termine: 8, preis: 0, zertifiziert: true, plaetze: 200, belegt: 87, beschreibung: 'Entspannungsverfahren nach Jacobson, live per Video.' },
  { id: 'K04', titel: 'Gesund abnehmen mit Genuss', kategorie: 'ERNAEHRUNG', anbieter: 'Ernährungspraxis Lange', plz: '80331', ort: 'München', online: false, start: '2027-02-02', termine: 10, preis: 150, zertifiziert: true, plaetze: 10, belegt: 4, beschreibung: 'Alltagstaugliche Ernährungsumstellung ohne Verbote.' },
  { id: 'K05', titel: 'Rauchfrei in 6 Wochen', kategorie: 'SUCHT', anbieter: 'Rauchfrei e. V.', plz: '50667', ort: 'Köln', online: false, start: '2027-01-19', termine: 6, preis: 180, zertifiziert: true, plaetze: 12, belegt: 3, beschreibung: 'Verhaltenstherapeutisches Gruppenprogramm.' },
  { id: 'K06', titel: 'Aqua-Fitness', kategorie: 'BEWEGUNG', anbieter: 'Stadtbad Leipzig', plz: '04109', ort: 'Leipzig', online: false, start: '2027-01-05', termine: 12, preis: 132, zertifiziert: false, plaetze: 20, belegt: 11, beschreibung: 'Gelenkschonendes Training im Wasser. Kein zertifizierter Präventionskurs.' },
  { id: 'K07', titel: 'Achtsamkeit im Job (MBSR kompakt)', kategorie: 'STRESS', anbieter: 'VitaPlus Akademie', plz: '', ort: 'Online', online: true, start: '2027-01-14', termine: 8, preis: 0, zertifiziert: true, plaetze: 150, belegt: 150, beschreibung: 'Stressbewältigung durch Achtsamkeit.' },
  { id: 'K08', titel: 'Pflegekurs: Zuhause pflegen', kategorie: 'PFLEGE', anbieter: 'VitaPlus Pflegekasse', plz: '80331', ort: 'München', online: false, start: '2026-12-10', termine: 4, preis: 0, zertifiziert: true, plaetze: 14, belegt: 6, beschreibung: 'Grundlagen der häuslichen Pflege für Angehörige. Kostenfrei.' },
  { id: 'K09', titel: 'Pflegekurs Demenz (online)', kategorie: 'PFLEGE', anbieter: 'VitaPlus Pflegekasse', plz: '', ort: 'Online', online: true, start: '2027-01-21', termine: 3, preis: 0, zertifiziert: true, plaetze: 40, belegt: 12, beschreibung: 'Umgang mit Menschen mit Demenz im Alltag.' },
  { id: 'K10', titel: 'Nordic Walking', kategorie: 'BEWEGUNG', anbieter: 'TSV Prenzlauer Berg', plz: '10405', ort: 'Berlin', online: false, start: '2027-03-02', termine: 10, preis: 85, zertifiziert: true, plaetze: 16, belegt: 2, beschreibung: 'Ausdauertraining an der frischen Luft.' },
  { id: 'K11', titel: 'Vegetarisch kochen für Familien', kategorie: 'ERNAEHRUNG', anbieter: 'Kochschule Mitte', plz: '10117', ort: 'Berlin', online: false, start: '2027-02-15', termine: 6, preis: 140, zertifiziert: true, plaetze: 10, belegt: 7, beschreibung: 'Ausgewogene Ernährung für Groß und Klein.' },
  { id: 'K12', titel: 'Autogenes Training', kategorie: 'STRESS', anbieter: 'Praxis Dr. Wolf', plz: '60311', ort: 'Frankfurt am Main', online: false, start: '2027-01-26', termine: 8, preis: 110, zertifiziert: true, plaetze: 10, belegt: 5, beschreibung: 'Selbstentspannung durch Konzentration.' },
];

function beitragskonto(benutzerId: string, monatsbeitrag: number, offeneMonate: string[], gutschrift?: number): Buchung[] {
  const l: Buchung[] = [];
  let n = 0;
  for (let m = 1; m <= 11; m++) {
    const monat = `2026-${String(m).padStart(2, '0')}`;
    const faellig = m === 12 ? '2027-01-15' : `2026-${String(m + 1).padStart(2, '0')}-15`;
    l.push({ id: `bk${benutzerId}${++n}`, benutzerId, datum: `${monat}-01`, faellig, monat, art: 'SOLL', betrag: monatsbeitrag, text: `Beitrag ${monat.substring(5)}/2026` });
    if (!offeneMonate.includes(monat) && faellig <= '2026-11-27') {
      l.push({ id: `bk${benutzerId}${++n}`, benutzerId, datum: faellig.replace('-15', '-14'), monat, art: 'ZAHLUNG', betrag: monatsbeitrag, text: 'SEPA-Lastschrift' });
    }
  }
  if (gutschrift) l.push({ id: `bk${benutzerId}${++n}`, benutzerId, datum: '2026-04-20', art: 'GUTSCHRIFT', betrag: gutschrift, text: 'Erstattung Überzahlung 2025' });
  return l;
}

function zuzahlungen(): Zuzahlung[] {
  const l: Zuzahlung[] = [];
  const apotheken = ['Löwen-Apotheke', 'Apotheke am Markt', 'Stern-Apotheke'];
  let i = 0;
  for (let m = 1; m <= 11; m++) {
    for (let k = 0; k < 2; k++) {
      l.push({ id: 'z' + ++i, benutzerId: 'u3', person: 'Dr. Erika Weber', datum: `2026-${String(m).padStart(2, '0')}-${String(4 + k * 13).padStart(2, '0')}`,
        art: 'ARZNEIMITTEL', betrag: [5, 7.5, 10, 6.32][(m + k) % 4], leistungserbringer: apotheken[(m + k) % 3] });
    }
  }
  l.push({ id: 'z' + ++i, benutzerId: 'u3', person: 'Dr. Erika Weber', datum: '2026-05-12', art: 'KRANKENHAUS', betrag: 50, leistungserbringer: 'Klinikum Schwabing (5 Tage)' });
  l.push({ id: 'z' + ++i, benutzerId: 'u3', person: 'Dr. Erika Weber', datum: '2026-06-03', art: 'HEILMITTEL', betrag: 28.4, leistungserbringer: 'Physiotherapie Leopold' });
  l.push({ id: 'z' + ++i, benutzerId: 'u1', person: 'Anna Schmidt', datum: '2026-02-20', art: 'ARZNEIMITTEL', betrag: 5, leistungserbringer: 'Apotheke am Markt' });
  l.push({ id: 'z' + ++i, benutzerId: 'u1', person: 'Anna Schmidt', datum: '2026-07-08', art: 'HEILMITTEL', betrag: 36.8, leistungserbringer: 'Physio am Park' });
  l.push({ id: 'z' + ++i, benutzerId: 'u1', person: 'Thomas Schmidt', datum: '2026-09-15', art: 'ARZNEIMITTEL', betrag: 7.2, leistungserbringer: 'Löwen-Apotheke' });
  l.push({ id: 'z' + ++i, benutzerId: 'u1', person: 'Anna Schmidt', datum: '2025-03-02', art: 'ARZNEIMITTEL', betrag: 10, leistungserbringer: 'Stern-Apotheke' });
  return l;
}

function leistungsdaten(): Leistungsdatensatz[] {
  const l: Leistungsdatensatz[] = [];
  const quartale = ['2025-1', '2025-2', '2025-3', '2025-4', '2026-1', '2026-2', '2026-3'];
  const personen: [string, string, string[]][] = [
    ['u1', 'Anna Schmidt', ['Dr. med. Julia Hoffmann (Allgemeinmedizin)', 'Dr. med. dent. Ines Lange (Zahnmedizin)', 'Dr. med. Martin Braun (Gynäkologie)']],
    ['u1', 'Lena Schmidt', ['Dr. med. Katrin Zimmermann (Kinder- und Jugendmedizin)']],
    ['u3', 'Dr. Erika Weber', ['Prof. Dr. med. Stefan Krüger (Kardiologie)', 'Dr. med. Hanna Richter (Innere Medizin)', 'Dr. med. Ole Neumann (Augenheilkunde)']],
    ['u2', 'Max Mustermann', ['Dr. med. Tobias Schulz (Allgemeinmedizin)']],
  ];
  let i = 0;
  personen.forEach(([bid, person, praxen], pi) => {
    quartale.forEach((q, qi) => {
      if ((qi + pi) % 3 === 2 && bid !== 'u3') return;
      const praxis = praxen[(qi + pi) % praxen.length];
      const [jahr, nr] = q.split('-');
      const monat = String((Number(nr) - 1) * 3 + 1 + (qi % 3)).padStart(2, '0');
      l.push({ id: 'ld' + ++i, benutzerId: bid, person, quartal: `${nr}/${jahr}`, datum: `${jahr}-${monat}-${String(5 + qi * 3).padStart(2, '0')}`,
        bereich: praxis.includes('dent') ? 'ZAHNAERZTLICH' : 'AERZTLICH', leistungserbringer: praxis,
        beschreibung: praxis.includes('dent') ? 'Kontrolluntersuchung, Zahnstein entfernen' : 'Grundpauschale, Untersuchung und Beratung',
        betrag: Math.round((38 + ((qi * 17 + pi * 11) % 60)) * 100) / 100 });
      if (bid === 'u3') {
        l.push({ id: 'ld' + ++i, benutzerId: bid, person, quartal: `${nr}/${jahr}`, datum: `${jahr}-${monat}-${String(8 + qi * 2).padStart(2, '0')}`,
          bereich: 'ARZNEIMITTEL', leistungserbringer: 'Löwen-Apotheke', beschreibung: 'Metoprolol 47,5 mg, 100 St.; Ramipril 5 mg, 98 St.', betrag: 64.18 });
      }
    });
  });
  l.push({ id: 'ld' + ++i, benutzerId: 'u3', person: 'Dr. Erika Weber', quartal: '2/2026', datum: '2026-05-12', bereich: 'KRANKENHAUS',
    leistungserbringer: 'Klinikum Schwabing', beschreibung: 'Stationärer Aufenthalt 12.05.–16.05.2026 (Fallpauschale)', betrag: 4812.4 });
  return l;
}

export function ergaenzeStartdaten(s: Store): Store {
  const zusatz: Record<string, Partial<Benutzer>> = {
    u1: { familienstand: 'VERHEIRATET', staatsangehoerigkeit: 'deutsch', geburtsort: 'Potsdam', geburtsname: 'Krause', steuerId: '46158037216',
      bonusTeilnahmeSeit: '2019-01-01', kundenberaterId: 's1', versicherungsart: 'PFLICHT', bekannteGeraete: ['Firefox auf Windows'], passwortGeaendertAm: '2026-02-01',
      benachrichtigungen: { ...BENACHRICHTIGUNG_STANDARD, push: true, kategorien: { ...BENACHRICHTIGUNG_STANDARD.kategorien } } },
    u2: { familienstand: 'LEDIG', staatsangehoerigkeit: 'deutsch', geburtsort: 'Halle (Saale)', bonusTeilnahmeSeit: '2024-03-01', versicherungsart: 'STUDENT', kundenberaterId: 's3' },
    u3: { familienstand: 'VERWITWET', staatsangehoerigkeit: 'österreichisch', geburtsort: 'Salzburg', geburtsname: 'Huber', steuerId: '57182930451',
      bonusTeilnahmeSeit: '2016-01-01', versicherungsart: 'KVDR', kundenberaterId: 's4', schriftgroesse: 'GROSS', hoherKontrast: true },
    u4: { familienstand: 'GESCHIEDEN', staatsangehoerigkeit: 'deutsch', geburtsort: 'Offenbach', steuerId: '38201475638', versicherungsart: 'FREIWILLIG', kundenberaterId: 's3' },
    s1: { team: 'Leistungen' },
    s2: { team: 'Leistungen' },
  };
  s.benutzer = s.benutzer.map(b => mitStandard({ ...b, ...(zusatz[b.id] || {}) }));
  s.benutzer.push(
    mitStandard({ id: 'u5', rolle: 'VERSICHERTER', email: 'paul.weber@example.de', passwort: 'Paul#Weber90', versichertennummer: 'H192837465', anrede: 'HERR',
      vorname: 'Paul', nachname: 'Weber', geburtsdatum: '1990-01-15', mobil: '0160 5551234', adresse: { strasse: 'Belgradstraße', hausnummer: '7', plz: '80796', ort: 'München', land: 'Deutschland' },
      bank: { kontoinhaber: 'Paul Weber', iban: 'DE83200400000987654321', bic: 'COBADEHHXXX', bankname: 'Commerzbank Hamburg', sepaMandat: false },
      tarif: 'BASIS', beschaeftigung: 'ANGESTELLT', arbeitgeber: 'Isar Software AG', bruttoMonat: 5100, mitgliedSeit: '2014-10-01', versicherungsart: 'PFLICHT',
      familienstand: 'LEDIG', staatsangehoerigkeit: 'deutsch', zweiFaktorAktiv: false, zweiFaktorCode: '314159', kundenberaterId: 's4' }),
    mitStandard({ id: 's3', rolle: 'SACHBEARBEITER', email: 'nicole.hartmann@vitaplus.de', passwort: 'Mitgliedschaft1!', anrede: 'FRAU', vorname: 'Nicole', nachname: 'Hartmann',
      geburtsdatum: '1987-06-22', adresse: { strasse: 'Hauptverwaltung', hausnummer: '1', plz: '10117', ort: 'Berlin', land: 'Deutschland' },
      tarif: 'BASIS', beschaeftigung: 'ANGESTELLT', mitgliedSeit: '2014-01-01', zweiFaktorAktiv: true, zweiFaktorCode: '246802', freigabeLimit: 2500, team: 'Mitgliedschaft & Beiträge' }),
    mitStandard({ id: 's4', rolle: 'SACHBEARBEITER', email: 'oemer.arslan@vitaplus.de', passwort: 'Pflegekasse1!', anrede: 'HERR', vorname: 'Ömer', nachname: 'Arslan',
      geburtsdatum: '1992-12-09', adresse: { strasse: 'Hauptverwaltung', hausnummer: '1', plz: '10117', ort: 'Berlin', land: 'Deutschland' },
      tarif: 'BASIS', beschaeftigung: 'ANGESTELLT', mitgliedSeit: '2019-01-01', zweiFaktorAktiv: true, zweiFaktorCode: '135791', freigabeLimit: 5000, team: 'Pflegekasse' }),
    mitStandard({ id: 'a1', rolle: 'ADMIN', email: 'admin@vitaplus.de', passwort: 'Administration1!', anrede: 'DIVERS', vorname: 'System', nachname: 'Administration',
      geburtsdatum: '1980-01-01', adresse: { strasse: 'Hauptverwaltung', hausnummer: '1', plz: '10117', ort: 'Berlin', land: 'Deutschland' },
      tarif: 'BASIS', beschaeftigung: 'ANGESTELLT', mitgliedSeit: '2010-01-01', zweiFaktorAktiv: true, zweiFaktorCode: '102938' }),
  );

  const jonas = s.benutzer.find(b => b.id === 'u4')!;
  const bJonas = berechneBeitrag({ beschaeftigung: 'SELBSTSTAENDIG', bruttoMonat: jonas.bruttoMonat!, kinder: 0, alter: alterAm(jonas.geburtsdatum), krankengeldanspruch: true, bundesland: '' });
  const max = s.benutzer.find(b => b.id === 'u2')!;
  const bMax = berechneBeitrag({ beschaeftigung: 'STUDENT', bruttoMonat: 0, kinder: 0, alter: alterAm(max.geburtsdatum), krankengeldanspruch: false, bundesland: '' });
  s.beitragskonto = [
    ...beitragskonto('u4', bJonas.summeVersicherter, ['2026-09', '2026-10']),
    { id: 'bku4sz1', benutzerId: 'u4', datum: '2026-11-16', art: 'SAEUMNISZUSCHLAG', betrag: 7.5, text: 'Säumniszuschlag Beitrag 09/2026' },
    { id: 'bku4mg1', benutzerId: 'u4', datum: '2026-11-02', art: 'MAHNGEBUEHR', betrag: 5, text: 'Mahngebühr 1. Mahnung' },
    ...beitragskonto('u2', bMax.summeVersicherter, [], 18.4),
  ];
  s.arbeitgebermeldungen = [
    { id: 'am1', benutzerId: 'u1', arbeitgeber: 'Nordlicht Logistik GmbH', zeitraumVon: '2025-01-01', zeitraumBis: '2025-12-31', grund: 'JAHRESMELDUNG', entgelt: 49800, eingang: '2026-02-11' },
    { id: 'am2', benutzerId: 'u1', arbeitgeber: 'Nordlicht Logistik GmbH', zeitraumVon: '2024-01-01', zeitraumBis: '2024-12-31', grund: 'JAHRESMELDUNG', entgelt: 47400, eingang: '2025-02-09' },
    { id: 'am3', benutzerId: 'u1', arbeitgeber: 'Nordlicht Logistik GmbH', zeitraumVon: '2025-01-06', zeitraumBis: '2025-03-14', grund: 'UNTERBRECHUNG', entgelt: 0, eingang: '2025-03-20' },
    { id: 'am4', benutzerId: 'u1', arbeitgeber: 'Nordlicht Logistik GmbH', zeitraumVon: '2019-04-01', zeitraumBis: '2019-04-01', grund: 'ANMELDUNG', entgelt: 0, eingang: '2019-04-03' },
  ];
  s.zuzahlungen = zuzahlungen();
  s.leistungsdaten = leistungsdaten();
  s.pflege = [{
    id: 'p1', benutzerId: 'u3', person: 'Dr. Erika Weber', pflegegrad: 2, seit: '2025-08-01', leistungsart: 'PFLEGEGELD',
    pflegepersonen: [{ name: 'Paul Weber', stundenProWoche: 12, rentenversichert: true }],
    entlastungGenutzt: { '2026-03': 131, '2026-04': 131, '2026-06': 98.5, '2026-09': 131 },
    verhinderungKurzzeitGenutzt: { '2026': 1240 },
  }];
  s.epa = [
    { benutzerId: 'u1', status: 'AKTIV', appGekoppelt: true, gesundheitsId: 'AKTIV', widerspruchMedikation: false, widerspruchForschung: true,
      berechtigungen: [
        { id: 'e1', einrichtung: 'Praxis Dr. med. Julia Hoffmann, Berlin', art: 'Hausarztpraxis', bis: '2027-01-28', quelle: 'EGK', aktiv: true },
        { id: 'e2', einrichtung: 'Apotheke am Markt, Berlin', art: 'Apotheke', bis: '2026-11-30', quelle: 'EGK', aktiv: true },
        { id: 'e3', einrichtung: 'Zahnarztpraxis Dr. Lange, Berlin', art: 'Zahnarztpraxis', bis: '2026-03-31', quelle: 'EGK', aktiv: false },
      ],
      zugriffe: [
        { zeitpunkt: '2026-10-29T09:14:00', einrichtung: 'Praxis Dr. med. Julia Hoffmann, Berlin', aktion: 'Dokument eingestellt: Arztbrief' },
        { zeitpunkt: '2026-11-21T16:02:00', einrichtung: 'Apotheke am Markt, Berlin', aktion: 'Medikationsliste gelesen' },
      ] },
    { benutzerId: 'u2', status: 'AKTIV', appGekoppelt: false, gesundheitsId: 'KEINE', widerspruchMedikation: false, widerspruchForschung: false, berechtigungen: [], zugriffe: [] },
    { benutzerId: 'u3', status: 'WIDERSPROCHEN', appGekoppelt: false, gesundheitsId: 'KEINE', widerspruchMedikation: true, widerspruchForschung: true, berechtigungen: [], zugriffe: [] },
    { benutzerId: 'u4', status: 'AKTIV', appGekoppelt: false, gesundheitsId: 'KEINE', widerspruchMedikation: false, widerspruchForschung: false, berechtigungen: [], zugriffe: [] },
    { benutzerId: 'u5', status: 'AKTIV', appGekoppelt: false, gesundheitsId: 'AKTIV', widerspruchMedikation: false, widerspruchForschung: false, berechtigungen: [], zugriffe: [] },
  ];
  s.vollmachten = [{
    id: 'vm1', benutzerId: 'u3', vorname: 'Paul', nachname: 'Weber', geburtsdatum: '1990-01-15', email: 'paul.weber@example.de', beziehung: 'Sohn',
    umfang: ['POSTFACH', 'ANTRAEGE', 'PFLEGE', 'AUSKUNFT'], gueltigAb: '2025-08-01', onlineZugriff: true, status: 'AKTIV', erteiltAm: '2025-07-28', art: 'VORSORGEVOLLMACHT',
  }];
  s.einwilligungen = [
    { id: 'ew1', benutzerId: 'u1', code: 'BONUS_DATEN', erteilt: true, zeitpunkt: '2019-01-01T10:00:00', historie: [{ zeitpunkt: '2019-01-01T10:00:00', erteilt: true, kanal: 'Papier' }] },
    { id: 'ew2', benutzerId: 'u1', code: 'WERBUNG_EMAIL', erteilt: true, zeitpunkt: '2023-05-04T19:22:00', historie: [{ zeitpunkt: '2023-05-04T19:22:00', erteilt: true, kanal: 'Online' }] },
    { id: 'ew3', benutzerId: 'u1', code: 'PERSONALISIERTE_INFOS', erteilt: false, zeitpunkt: '2025-02-11T08:00:00',
      historie: [{ zeitpunkt: '2024-01-15T12:00:00', erteilt: true, kanal: 'Online' }, { zeitpunkt: '2025-02-11T08:00:00', erteilt: false, kanal: 'Online' }] },
    { id: 'ew4', benutzerId: 'u2', code: 'BONUS_DATEN', erteilt: true, zeitpunkt: '2024-03-01T15:00:00', historie: [{ zeitpunkt: '2024-03-01T15:00:00', erteilt: true, kanal: 'App' }] },
    { id: 'ew5', benutzerId: 'u3', code: 'BONUS_DATEN', erteilt: true, zeitpunkt: '2016-01-01T09:00:00', historie: [{ zeitpunkt: '2016-01-01T09:00:00', erteilt: true, kanal: 'Papier' }] },
  ];
  s.benachrichtigungen = [
    { id: 'bn1', benutzerId: 'u1', zeitpunkt: '2026-11-22T10:30:00', kategorie: 'BONUS', titel: 'Neue Nachricht vom Bonusprogramm', text: 'Noch 2 Bonusmaßnahmen bis zum Jahresende', link: '/postfach', gelesen: false },
    { id: 'bn2', benutzerId: 'u1', zeitpunkt: '2026-11-19T09:00:00', kategorie: 'STATUS', titel: 'Vorgang VP-2026-001187', text: 'Status geändert: In Bearbeitung', link: '/vorgaenge/v3', gelesen: true },
    { id: 'bn3', benutzerId: 'u1', zeitpunkt: '2026-11-15T08:00:00', kategorie: 'DOKUMENT', titel: 'Neues Dokument', text: 'Beitragsinformation 2027 ist in Ihrem Postfach', link: '/postfach', gelesen: false },
    { id: 'bn4', benutzerId: 'u2', zeitpunkt: '2026-11-04T10:20:00', kategorie: 'FRIST', titel: 'Bitte reichen Sie Unterlagen nach', text: 'Rückfrage zu VP-2026-001193 – Frist 18.11.2026', link: '/vorgaenge/v4', gelesen: false },
  ];
  s.protokoll = [
    { id: 'pr1', benutzerId: 'u1', akteurId: 'u1', zeitpunkt: '2026-11-20T18:42:00', ereignis: 'ANMELDUNG', details: 'Erfolgreiche Anmeldung', geraet: 'Firefox auf Windows', stufe: 'INFO' },
    { id: 'pr2', benutzerId: 'u1', akteurId: 's1', zeitpunkt: '2026-11-19T09:00:00', ereignis: 'DATENZUGRIFF', details: 'Vorgang VP-2026-001187 durch Sachbearbeitung geöffnet', stufe: 'INFO' },
    { id: 'pr3', benutzerId: 'u4', zeitpunkt: '2026-11-25T22:13:00', ereignis: 'ANMELDUNG_FEHLGESCHLAGEN', details: 'Falsches Passwort (Versuch 3)', geraet: 'Chrome auf Android', stufe: 'WARNUNG' },
    { id: 'pr4', benutzerId: 'u4', zeitpunkt: '2026-11-25T22:13:00', ereignis: 'KONTO_GESPERRT', details: 'Automatische Sperre nach 3 Fehlversuchen', geraet: 'Chrome auf Android', stufe: 'KRITISCH' },
  ];
  s.aenderungshistorie = [
    { id: 'ah1', benutzerId: 'u1', zeitpunkt: '2024-06-02T11:20:00', bereich: 'Adresse', alt: 'Schönhauser Allee 80, 10439 Berlin', neu: 'Lindenallee 12a, 10405 Berlin', von: 'Anna Schmidt' },
    { id: 'ah2', benutzerId: 'u1', zeitpunkt: '2025-01-10T08:15:00', bereich: 'Mobilnummer', alt: '0171 1111111', neu: '0171 2345678', von: 'Anna Schmidt' },
  ];
  s.feedback = [
    { id: 'fb1', zeitpunkt: '2026-11-02T10:00:00', bewertung: 4, text: 'Erstattung ging schnell.', seite: '/erstattung', art: 'SERVICE', benutzerId: 'u1' },
    { id: 'fb2', zeitpunkt: '2026-11-12T21:30:00', bewertung: 2, text: 'Upload vom Handy hat beim ersten Mal nicht geklappt.', seite: '/vorgaenge', art: 'SERVICE', benutzerId: 'u2' },
    { id: 'fb3', zeitpunkt: '2026-11-18T14:00:00', bewertung: 3, text: 'Kontrast der grauen Hinweistexte ist zu schwach.', seite: '/start', art: 'BARRIERE' },
  ];
  s.inhalte = { faq: FAQ_START.map((f, i) => ({ ...f, id: 'faq' + (i + 1), sichtbar: true, reihenfolge: i + 1, hilfreich: (i * 7) % 23, nichtHilfreich: i % 4 })), meldungen: [
    { id: 'm1', titel: 'Wartungsarbeiten', text: 'Am Sonntag, 06.12.2026, ist die Online-Geschäftsstelle zwischen 02:00 und 06:00 Uhr nicht erreichbar.', typ: 'WARNUNG', aktivVon: '2026-11-25', aktivBis: '2026-12-06', zielgruppe: 'ALLE' },
    { id: 'm2', titel: 'Zusatzbeitrag 2027 bleibt stabil', text: 'Der Zusatzbeitrag der VitaPlus bleibt 2027 bei 2,49 %.', typ: 'INFO', aktivVon: '2026-11-01', aktivBis: '2027-01-31', zielgruppe: 'VERSICHERTE' },
  ], glossar: GLOSSAR };
  s.karten.push({ id: 'k7', benutzerId: 'u5', inhaber: 'Paul Weber', kartennummer: '80276 00192 83746 5', gueltigBis: '2030-09-30', status: 'AKTIV', fotoVorhanden: true });
  s.kursbuchungen = [{ id: 'kb1', benutzerId: 'u1', kursId: 'K10', gebuchtAm: '2026-11-03T20:00:00', status: 'GEBUCHT' }];
  s.gesundheitsziele = [{ id: 'gz1', benutzerId: 'u1', titel: 'Zweimal pro Woche laufen', kategorie: 'BEWEGUNG', zielwert: 40, einheit: 'Läufe', aktuell: 27, bis: '2026-12-31', erreicht: false }];
  s.challengeTeilnahmen = [{ benutzerId: 'u1', challengeId: 'C1', seit: '2026-11-10', fortschritt: 14 }];
  s.krankengeldZahlungen = [
    { id: 'kg1', benutzerId: 'u1', vorgangId: 'v0kg', zeitraumVon: '2025-02-17', zeitraumBis: '2025-02-28', tage: 12, brutto: 1034.4, abzuege: 128.53, netto: 905.87, ausgezahltAm: '2025-03-04' },
    { id: 'kg2', benutzerId: 'u1', vorgangId: 'v0kg', zeitraumVon: '2025-03-01', zeitraumBis: '2025-03-14', tage: 14, brutto: 1206.8, abzuege: 149.95, netto: 1056.85, ausgezahltAm: '2025-03-18' },
  ];
  s.vorgaenge.push(
    {
      id: 'v0kg', vorgangsnummer: 'VP-2025-000112', benutzerId: 'u1', typ: 'ARBEITSUNFAEHIGKEIT', titel: 'Arbeitsunfähigkeit 06.01.–14.03.2025', status: 'GENEHMIGT',
      erstelltAm: '2025-01-06T11:00:00', geaendertAm: '2025-03-18T09:00:00',
      daten: { von: '2025-01-06', bis: '2025-03-14', arzt: 'Dr. med. Julia Hoffmann', erstbescheinigung: true, tage: 68, kettenTage: 68, krankengeld: true, arbeitgeber: 'Nordlicht Logistik GmbH' },
      anhaenge: [], historie: [
        { zeitpunkt: '2025-01-06T11:00:00', status: 'EINGEREICHT', text: 'Krankmeldung erfasst', von: 'Anna Schmidt' },
        { zeitpunkt: '2025-01-07T08:00:00', status: 'GENEHMIGT', text: 'Arbeitsunfähigkeit registriert, Arbeitgeber informiert', von: 'System' },
        { zeitpunkt: '2025-02-17T08:00:00', status: 'GENEHMIGT', text: 'Krankengeldzahlung ab 17.02.2025 aufgenommen', von: 'System' },
      ], zustaendig: 'Krankengeld-Team',
    },
    {
      id: 'v7', vorgangsnummer: 'VP-2026-001176', benutzerId: 'u2', typ: 'KOSTENERSTATTUNG', titel: 'Naturheilverfahren / Homöopathie', status: 'ABGELEHNT',
      erstelltAm: '2026-11-06T13:00:00', geaendertAm: '2026-11-10T15:40:00', bescheidAm: '2026-11-10', betragBeantragt: 85,
      daten: { leistung: 'NATUR', rechnungsdatum: '2026-10-30', leistungserbringer: 'Heilpraxis Sonnenblume', patient: 'Max Mustermann', rechnungsnummer: 'HP-2210' },
      anhaenge: [{ id: 'd7', name: 'Rechnung_HP.pdf', groesseBytes: 120333, mimeType: 'application/pdf', hochgeladenAm: '2026-11-06T12:59:00' }],
      historie: [
        { zeitpunkt: '2026-11-06T13:00:00', status: 'EINGEREICHT', text: 'Antrag online eingereicht (Papiereingang digitalisiert)', von: 'Posteingang' },
        { zeitpunkt: '2026-11-10T15:40:00', status: 'ABGELEHNT', text: 'Antrag abgelehnt', von: 'Sabine Müller' },
      ], ablehnungsgrund: 'Leistungen von Heilpraktikern sind im Tarif VitaPlus Basis nicht erstattungsfähig.', zustaendig: 'Leistungen', bearbeiterId: 's1',
    },
    {
      id: 'v8', vorgangsnummer: 'VP-2026-001150', benutzerId: 'u1', typ: 'FAMILIE_FRAGEBOGEN', titel: 'Bestandsprüfung Familienversicherung 2026', status: 'RUECKFRAGE',
      erstelltAm: '2026-10-20T07:00:00', geaendertAm: '2026-10-20T07:00:00', rueckfrageFrist: '2026-12-15',
      rueckfrage: 'Bitte bestätigen Sie die aktuellen Einkommensverhältnisse Ihrer familienversicherten Angehörigen.', daten: { jahr: 2026 }, anhaenge: [],
      historie: [{ zeitpunkt: '2026-10-20T07:00:00', status: 'RUECKFRAGE', text: 'Fragebogen zur Familienversicherung versendet', von: 'System' }], zustaendig: 'Mitgliedschaft & Beiträge',
    },
  );
  s.vorgaenge.forEach(v => {
    if (!v.zustaendig) v.zustaendig = ['FAMILIENVERSICHERUNG', 'NAMENSAENDERUNG', 'ERSATZKARTE'].includes(v.typ) ? 'Mitgliedschaft & Beiträge' : 'Leistungen';
    if (v.typ === 'KOSTENERSTATTUNG' && v.status === 'RUECKFRAGE') v.rueckfrageFrist = '2026-11-18';
  });
  s.nachrichten.push({
    id: 'n8', benutzerId: 'u2', ordner: 'EINGANG', betreff: 'Bescheid zu Ihrem Antrag VP-2026-001176', absender: 'VitaPlus Leistungsabteilung', empfaenger: 'Max Mustermann',
    text: 'Sehr geehrter Herr Mustermann,\n\nleider können wir Ihrem Antrag „Naturheilverfahren / Homöopathie“ nicht entsprechen.\n\nBegründung: Leistungen von Heilpraktikern sind im Tarif VitaPlus Basis nicht erstattungsfähig.\n\nGegen diese Entscheidung können Sie innerhalb eines Monats nach Bekanntgabe Widerspruch einlegen.\n\nMit freundlichen Grüßen\nSabine Müller',
    datum: '2026-11-10T15:40:00', gelesen: true, kategorie: 'LEISTUNG', anhaenge: [{ id: 'd8', name: 'Bescheid_VP-2026-001176.pdf', groesseBytes: 64000, mimeType: 'application/pdf', hochgeladenAm: '2026-11-10T15:40:00' }],
    vorgangId: 'v7', wichtig: true,
  });
  s.system = { wartungsmodus: false, wartungstext: 'Die Online-Geschäftsstelle wird gerade gewartet. Bitte versuchen Sie es später erneut.', version: '4.12.0' };
  s.seitenaufrufe = [];
  return s;
}

const FAQ_START = [
  { kategorie: 'Online-Geschäftsstelle', frage: 'Wie registriere ich mich für die Online-Geschäftsstelle?', antwort: 'Sie benötigen Ihre Versichertennummer (auf Ihrer Gesundheitskarte) und Ihr Geburtsdatum. Anschließend bestätigen Sie Ihre Identität per Online-Ausweis, GesundheitsID oder Aktivierungscode per Post.' },
  { kategorie: 'Online-Geschäftsstelle', frage: 'Mein Zugang ist gesperrt. Was kann ich tun?', antwort: 'Nach drei falschen Passworteingaben wird Ihr Zugang aus Sicherheitsgründen gesperrt. Über „Passwort vergessen“ setzen Sie Ihr Passwort zurück und entsperren damit gleichzeitig Ihren Zugang.' },
  { kategorie: 'Online-Geschäftsstelle', frage: 'Warum werde ich automatisch abgemeldet?', antwort: 'Zum Schutz Ihrer Sozialdaten beenden wir die Sitzung nach 15 Minuten ohne Aktivität.' },
  { kategorie: 'Gesundheitskarte', frage: 'Ich habe meine Gesundheitskarte verloren.', antwort: 'Sperren Sie die Karte unter „Gesundheitskarte“ und bestellen Sie eine Ersatzkarte. Bis zum Eintreffen können Sie eine Ersatzbescheinigung für Ihre Arztpraxis anfordern.' },
  { kategorie: 'Gesundheitskarte', frage: 'Brauche ich ein Foto für die Gesundheitskarte?', antwort: 'Ab dem 15. Lebensjahr ist ein Lichtbild erforderlich. Laden Sie ein aktuelles, biometrietaugliches Foto als JPG oder PNG hoch.' },
  { kategorie: 'Leistungen', frage: 'Welche Rechnungen kann ich zur Erstattung einreichen?', antwort: 'Je nach Tarif erstatten wir u. a. professionelle Zahnreinigung, Osteopathie, Reiseschutzimpfungen und Naturheilverfahren. Den voraussichtlichen Erstattungsbetrag sehen Sie bereits bei der Eingabe.' },
  { kategorie: 'Leistungen', frage: 'Wie lange darf eine Rechnung alt sein?', antwort: 'Rechnungen können bis zu 12 Monate nach Rechnungsdatum eingereicht werden.' },
  { kategorie: 'Leistungen', frage: 'Ab wann bekomme ich Krankengeld?', antwort: 'In der Regel zahlt Ihr Arbeitgeber 6 Wochen Ihr Gehalt weiter. Danach erhalten Sie Krankengeld von der VitaPlus – höchstens 78 Wochen innerhalb von drei Jahren für dieselbe Erkrankung.' },
  { kategorie: 'Leistungen', frage: 'Wie beantrage ich eine Befreiung von Zuzahlungen?', antwort: 'Sobald Ihre Zuzahlungen 2 % (bei chronischer Erkrankung 1 %) Ihrer jährlichen Bruttoeinnahmen zum Lebensunterhalt überschreiten, können Sie die Befreiung online beantragen. Unser Rechner zeigt Ihnen Ihre persönliche Belastungsgrenze.' },
  { kategorie: 'Familie', frage: 'Wer kann familienversichert werden?', antwort: 'Ehe- und Lebenspartner sowie Kinder, wenn sie nicht selbst versichert sind und ihr Einkommen die Einkommensgrenze nicht übersteigt. Kinder sind bis 18, ohne Erwerbstätigkeit bis 23 und während einer Ausbildung bis 25 Jahre mitversichert.' },
  { kategorie: 'Familie', frage: 'Wie melde ich mein Neugeborenes an?', antwort: 'Nutzen Sie den Antrag „Geburt melden“. Die Familienversicherung beginnt mit dem Tag der Geburt.' },
  { kategorie: 'Beiträge', frage: 'Wie hoch ist der Zusatzbeitrag der VitaPlus?', antwort: 'Der Zusatzbeitrag beträgt 2,49 % und wird bei Beschäftigten je zur Hälfte von Arbeitgeber und Mitglied getragen.' },
  { kategorie: 'Beiträge', frage: 'Ich kann meine Beiträge nicht zahlen. Was nun?', antwort: 'Sprechen Sie uns frühzeitig an. Sie können online eine Ratenzahlung oder Stundung beantragen.' },
  { kategorie: 'Bonus', frage: 'Bis wann kann ich Bonusmaßnahmen einreichen?', antwort: 'Maßnahmen eines Jahres können bis zum 31. März des Folgejahres eingereicht werden. Die Prämie für das laufende Jahr fordern Sie ab 1. November an.' },
  { kategorie: 'Bonus', frage: 'Wie viel ist ein Bonuspunkt wert?', antwort: 'Ein Punkt entspricht 10 Cent. Wählen Sie statt der Auszahlung das Gesundheitsbudget, erhalten Sie 20 % mehr.' },
  { kategorie: 'Digitale Gesundheit', frage: 'Was ist die elektronische Patientenakte (ePA)?', antwort: 'Die ePA speichert Ihre medizinischen Unterlagen digital. Sie entscheiden, wer darauf zugreifen darf, und können der Nutzung jederzeit widersprechen.' },
  { kategorie: 'Digitale Gesundheit', frage: 'Wie bekomme ich eine DiGA?', antwort: 'Mit einem Rezept Ihrer Ärztin oder Ihres Arztes oder per Antrag mit Nachweis der Diagnose. Nach der Genehmigung erhalten Sie einen Freischaltcode.' },
  { kategorie: 'Pflege', frage: 'Wie beantrage ich einen Pflegegrad?', antwort: 'Stellen Sie den Antrag online – auch für Angehörige mit Vollmacht. Anschließend vereinbart der Medizinische Dienst einen Begutachtungstermin.' },
  { kategorie: 'Datenschutz', frage: 'Wie erhalte ich eine Auskunft über meine gespeicherten Daten?', antwort: 'Im Datenschutz-Center können Sie eine Auskunft nach Art. 15 DSGVO beantragen und eine Kopie Ihrer Daten herunterladen.' },
  { kategorie: 'Datenschutz', frage: 'Wer darf meine Daten sehen?', antwort: 'Nur Mitarbeitende, die Ihr Anliegen bearbeiten. Jeder Zugriff wird protokolliert und ist für Sie im Sicherheitsprotokoll einsehbar.' },
];

const GLOSSAR = [
  { begriff: 'AU-Bescheinigung', erklaerung: 'Ärztliche Bescheinigung über eine Arbeitsunfähigkeit. Wird heute meist elektronisch (eAU) an die Krankenkasse übermittelt.' },
  { begriff: 'Beitragsbemessungsgrenze', erklaerung: 'Einkommensgrenze, bis zu der Beiträge berechnet werden. Einkommen darüber ist beitragsfrei.' },
  { begriff: 'Belastungsgrenze', erklaerung: 'Höchstbetrag an Zuzahlungen pro Jahr: 2 % der Bruttoeinnahmen, für chronisch Kranke 1 %.' },
  { begriff: 'DiGA', erklaerung: 'Digitale Gesundheitsanwendung – eine „App auf Rezept“, die vom BfArM geprüft wurde.' },
  { begriff: 'DMP', erklaerung: 'Disease-Management-Programm: strukturiertes Behandlungsprogramm für chronisch Kranke.' },
  { begriff: 'eGK', erklaerung: 'Elektronische Gesundheitskarte – Ihr Versicherungsnachweis in der Arztpraxis.' },
  { begriff: 'ePA', erklaerung: 'Elektronische Patientenakte – digitale Sammlung Ihrer Gesundheitsdaten.' },
  { begriff: 'Entlastungsbetrag', erklaerung: 'Leistung der Pflegeversicherung von 131 € monatlich für anerkannte Angebote zur Unterstützung im Alltag.' },
  { begriff: 'E-Rezept', erklaerung: 'Elektronische Verordnung, die mit der Gesundheitskarte oder App in der Apotheke eingelöst wird.' },
  { begriff: 'Familienversicherung', erklaerung: 'Beitragsfreie Mitversicherung von Ehepartnern und Kindern ohne eigenes ausreichendes Einkommen.' },
  { begriff: 'Festzuschuss', erklaerung: 'Fester Betrag, den die Krankenkasse für Zahnersatz zahlt. Er erhöht sich mit lückenlos geführtem Bonusheft.' },
  { begriff: 'GesundheitsID', erklaerung: 'Digitale Identität für Anwendungen im Gesundheitswesen, z. B. die ePA-App.' },
  { begriff: 'Heil- und Kostenplan', erklaerung: 'Behandlungsplan Ihrer Zahnarztpraxis, der vor Beginn von der Krankenkasse genehmigt werden muss.' },
  { begriff: 'Krankengeld', erklaerung: 'Lohnersatzleistung bei Arbeitsunfähigkeit nach Ende der Entgeltfortzahlung.' },
  { begriff: 'KVdR', erklaerung: 'Krankenversicherung der Rentner – Pflichtversicherung für Rentnerinnen und Rentner mit ausreichender Vorversicherungszeit.' },
  { begriff: 'Medizinischer Dienst', erklaerung: 'Unabhängiger Gutachterdienst, der z. B. die Pflegebedürftigkeit begutachtet.' },
  { begriff: 'Pflegegrad', erklaerung: 'Einstufung der Pflegebedürftigkeit von 1 bis 5. Er bestimmt die Höhe der Pflegeleistungen.' },
  { begriff: 'Satzungsleistung', erklaerung: 'Zusätzliche Leistung, die eine Krankenkasse in ihrer Satzung freiwillig anbietet.' },
  { begriff: 'Säumniszuschlag', erklaerung: 'Zuschlag von 1 % pro angefangenem Monat auf rückständige Beiträge (abgerundet auf volle 50 €).' },
  { begriff: 'Verhinderungspflege', erklaerung: 'Ersatzpflege, wenn die Pflegeperson z. B. wegen Urlaub oder Krankheit verhindert ist.' },
  { begriff: 'Versicherungspflichtgrenze', erklaerung: 'Jahresentgelt, ab dem Beschäftigte sich freiwillig gesetzlich oder privat versichern können.' },
  { begriff: 'Widerspruch', erklaerung: 'Rechtsbehelf gegen einen Bescheid. Die Frist beträgt einen Monat nach Bekanntgabe.' },
  { begriff: 'Zusatzbeitrag', erklaerung: 'Kassenindividueller Beitragsanteil zusätzlich zum allgemeinen Beitragssatz von 14,6 %.' },
  { begriff: 'Zuzahlung', erklaerung: 'Gesetzlicher Eigenanteil, z. B. 10 % des Arzneimittelpreises, mindestens 5 €, höchstens 10 €.' },
];
