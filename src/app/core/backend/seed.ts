import { Arzt, Benutzer, Store } from '../models';
import { ergaenzeStartdaten, mitStandard } from './seed-erweiterung';

const kommunikationStandard = { email: true, post: false, sms: false, newsletter: false, erinnerungVorsorge: true };

function aerzte(): Arzt[] {
  const fach = [
    'Allgemeinmedizin', 'Innere Medizin', 'Kinder- und Jugendmedizin', 'Zahnmedizin', 'Augenheilkunde',
    'Dermatologie', 'Gynäkologie', 'Orthopädie', 'HNO-Heilkunde', 'Psychotherapie', 'Kardiologie', 'Urologie',
  ];
  const orte: [string, string, string][] = [
    ['10117', 'Berlin', 'Friedrichstraße'], ['10405', 'Berlin', 'Prenzlauer Allee'], ['12043', 'Berlin', 'Karl-Marx-Straße'],
    ['20095', 'Hamburg', 'Mönckebergstraße'], ['22765', 'Hamburg', 'Ottenser Hauptstraße'],
    ['80331', 'München', 'Sendlinger Straße'], ['80801', 'München', 'Leopoldstraße'],
    ['50667', 'Köln', 'Hohe Straße'], ['60311', 'Frankfurt am Main', 'Töngesgasse'], ['04109', 'Leipzig', 'Grimmaische Straße'],
  ];
  const vornamen = ['Julia', 'Stefan', 'Miriam', 'Andreas', 'Katrin', 'Ole', 'Sevgi', 'Martin', 'Ines', 'Piotr', 'Hanna', 'Tobias', 'Leyla', 'Frank'];
  const nachnamen = ['Hoffmann', 'Krüger', 'Lange', 'Neumann', 'Özdemir', 'Schulz', 'Wolf', 'Zimmermann', 'Braun', 'Kowalski', 'Hartmann', 'Richter', 'Arslan', 'Vogel', 'Fischer'];
  const sprachen = [['Deutsch'], ['Deutsch', 'Englisch'], ['Deutsch', 'Türkisch'], ['Deutsch', 'Polnisch', 'Englisch'], ['Deutsch', 'Arabisch'], ['Deutsch', 'Englisch', 'Französisch']];
  const zeiten = [
    'Mo–Fr 08:00–12:00, Di + Do 15:00–18:00',
    'Mo, Di, Do 08:00–18:00, Mi + Fr 08:00–13:00',
    'Mo–Do 07:30–16:00, Fr 07:30–12:00',
    'Nach Vereinbarung',
  ];
  const liste: Arzt[] = [];
  for (let i = 0; i < 48; i++) {
    const o = orte[(i * 7) % orte.length];
    liste.push({
      id: 'A' + String(1000 + i),
      titel: i % 5 === 0 ? 'Prof. Dr. med.' : i % 3 === 0 ? 'Dipl.-Psych.' : 'Dr. med.',
      vorname: vornamen[(i * 5) % vornamen.length],
      nachname: nachnamen[(i * 11) % nachnamen.length],
      fachrichtung: fach[i % fach.length],
      strasse: `${o[2]} ${(i * 13) % 140 + 1}`,
      plz: o[0],
      ort: o[1],
      telefon: `0${30 + (i % 60)} ${100000 + i * 3791}`,
      barrierefrei: i % 3 !== 1,
      onlineTermin: i % 4 !== 2,
      sprachen: sprachen[i % sprachen.length],
      sprechzeiten: zeiten[i % zeiten.length],
      neuePatienten: i % 6 !== 0,
    });
  }
  // Psychotherapeuten tragen keinen Dr. med.
  liste.filter(a => a.fachrichtung === 'Psychotherapie').forEach(a => (a.titel = 'Dipl.-Psych.'));
  liste.filter(a => a.fachrichtung === 'Zahnmedizin').forEach(a => (a.titel = 'Dr. med. dent.'));
  return liste;
}

export const AERZTE: Arzt[] = aerzte();

export function erzeugeStartdaten(): Store {
  return ergaenzeStartdaten({
    version: 5,
    zaehler: 1200,
    benutzer: ([
      {
        id: 'u1', rolle: 'VERSICHERTER', email: 'anna.schmidt@example.de', passwort: 'VitaPlus2026!',
        versichertennummer: 'A123456789', anrede: 'FRAU', vorname: 'Anna', nachname: 'Schmidt', geburtsdatum: '1986-05-17',
        telefon: '030 1234567', mobil: '0171 2345678',
        adresse: { strasse: 'Lindenallee', hausnummer: '12a', plz: '10405', ort: 'Berlin', land: 'Deutschland' },
        bank: { kontoinhaber: 'Anna Schmidt', iban: 'DE46100500001234567890', bic: 'BELADEBEXXX', bankname: 'Berliner Sparkasse', sepaMandat: true },
        tarif: 'KOMFORT', beschaeftigung: 'ANGESTELLT', arbeitgeber: 'Nordlicht Logistik GmbH', bruttoMonat: 4250, mitgliedSeit: '2009-01-01',
        zweiFaktorAktiv: false, zweiFaktorCode: '482913', gesperrt: false, fehlversuche: 0,
        kommunikation: { ...kommunikationStandard, newsletter: true }, schriftgroesse: 'NORMAL', kinderAnzahl: 1,
        letzterLogin: '2026-11-20T18:42:00',
      },
      {
        id: 'u2', rolle: 'VERSICHERTER', email: 'max.mustermann@example.de', passwort: 'Sicher#2026',
        versichertennummer: 'B987654321', anrede: 'HERR', vorname: 'Max', nachname: 'Mustermann', geburtsdatum: '2003-02-08',
        mobil: '0152 9876543',
        adresse: { strasse: 'Studentenweg', hausnummer: '3', plz: '04109', ort: 'Leipzig', land: 'Deutschland' },
        tarif: 'BASIS', beschaeftigung: 'STUDENT', bruttoMonat: 450, mitgliedSeit: '2021-10-01',
        zweiFaktorAktiv: true, zweiFaktorCode: '246810', gesperrt: false, fehlversuche: 0,
        kommunikation: { ...kommunikationStandard, sms: true }, schriftgroesse: 'NORMAL', kinderAnzahl: 0,
      },
      {
        id: 'u3', rolle: 'VERSICHERTER', email: 'erika.weber@example.de', passwort: 'Erika!Weber1',
        versichertennummer: 'C246813579', anrede: 'FRAU', titel: 'Dr.', vorname: 'Erika', nachname: 'Weber', geburtsdatum: '1955-11-30',
        telefon: '089 445566',
        adresse: { strasse: 'Leopoldstraße', hausnummer: '201', plz: '80804', ort: 'München', land: 'Deutschland' },
        bank: { kontoinhaber: 'Dr. Erika Weber', iban: 'DE70700202704455667788', bic: 'HYVEDEMMXXX', bankname: 'UniCredit Bank', sepaMandat: false },
        tarif: 'PREMIUM', beschaeftigung: 'RENTNER', bruttoMonat: 1980, mitgliedSeit: '1978-04-01',
        zweiFaktorAktiv: false, zweiFaktorCode: '975310', gesperrt: false, fehlversuche: 0,
        kommunikation: { email: false, post: true, sms: false, newsletter: false, erinnerungVorsorge: true }, schriftgroesse: 'GROSS', kinderAnzahl: 2,
      },
      {
        id: 'u4', rolle: 'VERSICHERTER', email: 'jonas.klein@example.de', passwort: 'Jonas#Klein9',
        versichertennummer: 'D135792468', anrede: 'HERR', vorname: 'Jonas', nachname: 'Klein', geburtsdatum: '1979-07-21',
        adresse: { strasse: 'Zeil', hausnummer: '5', plz: '60313', ort: 'Frankfurt am Main', land: 'Deutschland' },
        bank: { kontoinhaber: 'Jonas Klein', iban: 'DE96500105175432112345', sepaMandat: true },
        tarif: 'KOMFORT', beschaeftigung: 'SELBSTSTAENDIG', bruttoMonat: 3600, mitgliedSeit: '2015-07-01',
        zweiFaktorAktiv: false, zweiFaktorCode: '112233', gesperrt: true, fehlversuche: 3,
        kommunikation: kommunikationStandard, schriftgroesse: 'NORMAL', kinderAnzahl: 0,
      },
      {
        id: 's1', rolle: 'SACHBEARBEITER', email: 'sabine.mueller@vitaplus.de', passwort: 'Sachbearbeitung1!',
        anrede: 'FRAU', vorname: 'Sabine', nachname: 'Müller', geburtsdatum: '1990-03-03',
        adresse: { strasse: 'Hauptverwaltung', hausnummer: '1', plz: '10117', ort: 'Berlin', land: 'Deutschland' },
        tarif: 'BASIS', beschaeftigung: 'ANGESTELLT', mitgliedSeit: '2018-01-01',
        zweiFaktorAktiv: true, zweiFaktorCode: '135790', gesperrt: false, fehlversuche: 0,
        kommunikation: kommunikationStandard, schriftgroesse: 'NORMAL', kinderAnzahl: 0, freigabeLimit: 1000,
      },
      {
        id: 's2', rolle: 'SACHBEARBEITER', email: 'kai.brandt@vitaplus.de', passwort: 'Teamleitung1!',
        anrede: 'HERR', vorname: 'Kai', nachname: 'Brandt', geburtsdatum: '1981-08-14',
        adresse: { strasse: 'Hauptverwaltung', hausnummer: '1', plz: '10117', ort: 'Berlin', land: 'Deutschland' },
        tarif: 'BASIS', beschaeftigung: 'ANGESTELLT', mitgliedSeit: '2012-01-01',
        zweiFaktorAktiv: true, zweiFaktorCode: '864200', gesperrt: false, fehlversuche: 0,
        kommunikation: kommunikationStandard, schriftgroesse: 'NORMAL', kinderAnzahl: 0, freigabeLimit: 999999, teamleitung: true,
      },
    ] as Partial<Benutzer>[]).map(mitStandard),
    stammdaten: [
      { versichertennummer: 'E111222333', vorname: 'Laura', nachname: 'Becker', geburtsdatum: '1995-04-12', tarif: 'KOMFORT', beschaeftigung: 'ANGESTELLT', adresse: { strasse: 'Ottenser Hauptstraße', hausnummer: '44', plz: '22765', ort: 'Hamburg', land: 'Deutschland' }, registriert: false },
      { versichertennummer: 'F444555666', vorname: 'Felix', nachname: 'Wagner', geburtsdatum: '2001-09-30', tarif: 'BASIS', beschaeftigung: 'STUDENT', adresse: { strasse: 'Zülpicher Straße', hausnummer: '9', plz: '50674', ort: 'Köln', land: 'Deutschland' }, registriert: false },
      { versichertennummer: 'G777888999', vorname: 'Mehmet', nachname: 'Yılmaz', geburtsdatum: '1988-12-01', tarif: 'PREMIUM', beschaeftigung: 'SELBSTSTAENDIG', adresse: { strasse: 'Karl-Marx-Straße', hausnummer: '150', plz: '12043', ort: 'Berlin', land: 'Deutschland' }, registriert: false },
      { versichertennummer: 'A123456789', vorname: 'Anna', nachname: 'Schmidt', geburtsdatum: '1986-05-17', tarif: 'KOMFORT', beschaeftigung: 'ANGESTELLT', adresse: { strasse: 'Lindenallee', hausnummer: '12a', plz: '10405', ort: 'Berlin', land: 'Deutschland' }, registriert: true },
    ],
    familie: [
      { id: 'f1', hauptversicherterId: 'u1', vorname: 'Thomas', nachname: 'Schmidt', geburtsdatum: '1984-09-02', geschlecht: 'M', beziehung: 'EHEPARTNER', versichertennummer: 'A123456790', status: 'AKTIV', einkommenMonat: 0, inAusbildung: false, anderweitigVersichert: false, beantragtAm: '2012-06-01' },
      { id: 'f2', hauptversicherterId: 'u1', vorname: 'Lena', nachname: 'Schmidt', geburtsdatum: '2018-03-11', geschlecht: 'W', beziehung: 'KIND', versichertennummer: 'A123456791', status: 'AKTIV', einkommenMonat: 0, inAusbildung: false, anderweitigVersichert: false, beantragtAm: '2018-03-20' },
      { id: 'f3', hauptversicherterId: 'u3', vorname: 'Paul', nachname: 'Weber', geburtsdatum: '1990-01-15', geschlecht: 'M', beziehung: 'KIND', versichertennummer: 'C246813580', status: 'BEENDET', einkommenMonat: 0, inAusbildung: false, anderweitigVersichert: true, beantragtAm: '1990-02-01' },
    ],
    vorgaenge: [
      {
        id: 'v1', vorgangsnummer: 'VP-2026-001031', benutzerId: 'u1', typ: 'KOSTENERSTATTUNG', titel: 'Professionelle Zahnreinigung',
        status: 'AUSGEZAHLT', erstelltAm: '2026-03-10T09:12:00', geaendertAm: '2026-03-14T11:00:00', betragBeantragt: 95, betragErstattet: 76,
        daten: { leistung: 'PZR', rechnungsdatum: '2026-03-02', leistungserbringer: 'Zahnarztpraxis Dr. Lange', patient: 'Anna Schmidt', rechnungsnummer: 'R-2026-0412' },
        anhaenge: [{ id: 'd1', name: 'Rechnung_PZR.pdf', groesseBytes: 182044, mimeType: 'application/pdf', hochgeladenAm: '2026-03-10T09:11:00' }],
        historie: [
          { zeitpunkt: '2026-03-10T09:12:00', status: 'EINGEREICHT', text: 'Antrag online eingereicht', von: 'Anna Schmidt' },
          { zeitpunkt: '2026-03-12T14:30:00', status: 'GENEHMIGT', text: 'Erstattung über 76,00 € genehmigt', von: 'Sabine Müller' },
          { zeitpunkt: '2026-03-14T11:00:00', status: 'AUSGEZAHLT', text: 'Betrag überwiesen', von: 'System' },
        ],
      },
      {
        id: 'v2', vorgangsnummer: 'VP-2026-001108', benutzerId: 'u1', typ: 'ARBEITSUNFAEHIGKEIT', titel: 'Arbeitsunfähigkeit 05.10.–09.10.2026',
        status: 'GENEHMIGT', erstelltAm: '2026-10-05T16:40:00', geaendertAm: '2026-10-06T08:15:00',
        daten: { von: '2026-10-05', bis: '2026-10-09', arzt: 'Dr. med. Julia Hoffmann', erstbescheinigung: true, unfall: false, arbeitgeber: 'Nordlicht Logistik GmbH' },
        anhaenge: [],
        historie: [
          { zeitpunkt: '2026-10-05T16:40:00', status: 'EINGEREICHT', text: 'Krankmeldung erfasst', von: 'Anna Schmidt' },
          { zeitpunkt: '2026-10-06T08:15:00', status: 'GENEHMIGT', text: 'Arbeitsunfähigkeit registriert, Arbeitgeber informiert', von: 'System' },
        ],
      },
      {
        id: 'v3', vorgangsnummer: 'VP-2026-001187', benutzerId: 'u1', typ: 'KOSTENERSTATTUNG', titel: 'Osteopathie',
        status: 'IN_BEARBEITUNG', erstelltAm: '2026-11-18T20:05:00', geaendertAm: '2026-11-19T09:00:00', betragBeantragt: 180,
        daten: { leistung: 'OSTEO', rechnungsdatum: '2026-11-11', leistungserbringer: 'Praxis für Osteopathie Vogel', patient: 'Anna Schmidt', rechnungsnummer: '2026-883', sitzungen: 2 },
        anhaenge: [
          { id: 'd2', name: 'Rechnung_Osteopathie.pdf', groesseBytes: 99012, mimeType: 'application/pdf', hochgeladenAm: '2026-11-18T20:03:00' },
          { id: 'd3', name: 'Verordnung.jpg', groesseBytes: 1402331, mimeType: 'image/jpeg', hochgeladenAm: '2026-11-18T20:04:00' },
        ],
        historie: [
          { zeitpunkt: '2026-11-18T20:05:00', status: 'EINGEREICHT', text: 'Antrag online eingereicht', von: 'Anna Schmidt' },
          { zeitpunkt: '2026-11-19T09:00:00', status: 'IN_BEARBEITUNG', text: 'Vorgang übernommen', von: 'Sabine Müller' },
        ],
        bearbeiterId: 's1',
      },
      {
        id: 'v4', vorgangsnummer: 'VP-2026-001193', benutzerId: 'u2', typ: 'KOSTENERSTATTUNG', titel: 'Reiseschutzimpfung',
        status: 'RUECKFRAGE', erstelltAm: '2026-11-02T12:00:00', geaendertAm: '2026-11-04T10:20:00', betragBeantragt: 120,
        daten: { leistung: 'REISEIMPF', rechnungsdatum: '2026-10-28', leistungserbringer: 'Tropeninstitut Leipzig', patient: 'Max Mustermann', rechnungsnummer: 'TI-55102', reiseziel: 'Thailand' },
        anhaenge: [{ id: 'd4', name: 'foto_rechnung.png', groesseBytes: 2310442, mimeType: 'image/png', hochgeladenAm: '2026-11-02T11:58:00' }],
        historie: [
          { zeitpunkt: '2026-11-02T12:00:00', status: 'EINGEREICHT', text: 'Antrag online eingereicht', von: 'Max Mustermann' },
          { zeitpunkt: '2026-11-04T10:20:00', status: 'RUECKFRAGE', text: 'Rückfrage an Versicherten gestellt', von: 'Sabine Müller' },
        ],
        bearbeiterId: 's1',
        rueckfrage: 'Auf der eingereichten Rechnung ist der Impfstoff nicht erkennbar. Bitte reichen Sie zusätzlich eine Kopie Ihres Impfausweises ein.',
      },
      {
        id: 'v5', vorgangsnummer: 'VP-2026-001201', benutzerId: 'u3', typ: 'ZAHNERSATZ', titel: 'Zahnersatz – Heil- und Kostenplan',
        status: 'EINGEREICHT', erstelltAm: '2026-11-20T10:44:00', geaendertAm: '2026-11-20T10:44:00', betragBeantragt: 1850,
        daten: { zahnarzt: 'Dr. med. dent. Stefan Krüger', bonusheftJahre: 10, regelversorgung: 1850, geplanterBeginn: '2027-01-11', festzuschussProzent: 75 },
        anhaenge: [{ id: 'd5', name: 'HKP_Weber.pdf', groesseBytes: 311200, mimeType: 'application/pdf', hochgeladenAm: '2026-11-20T10:43:00' }],
        historie: [{ zeitpunkt: '2026-11-20T10:44:00', status: 'EINGEREICHT', text: 'Antrag online eingereicht', von: 'Dr. Erika Weber' }],
      },
      {
        id: 'v6', vorgangsnummer: 'VP-2025-000874', benutzerId: 'u1', typ: 'BONUS_AUSZAHLUNG', titel: 'Bonusauszahlung 2025',
        status: 'AUSGEZAHLT', erstelltAm: '2025-12-28T19:00:00', geaendertAm: '2026-01-05T09:00:00', betragBeantragt: 70, betragErstattet: 70,
        daten: { punkte: 700, jahr: 2025, art: 'AUSZAHLUNG' }, anhaenge: [],
        historie: [
          { zeitpunkt: '2025-12-28T19:00:00', status: 'EINGEREICHT', text: 'Auszahlung von 700 Punkten beantragt', von: 'Anna Schmidt' },
          { zeitpunkt: '2026-01-05T09:00:00', status: 'AUSGEZAHLT', text: '70,00 € überwiesen', von: 'System' },
        ],
      },
    ],
    nachrichten: [
      {
        id: 'n1', benutzerId: 'u1', ordner: 'EINGANG', betreff: 'Ihre Kostenerstattung wurde ausgezahlt', absender: 'VitaPlus Leistungsabteilung', empfaenger: 'Anna Schmidt',
        text: 'Sehr geehrte Frau Schmidt,\n\nfür Ihre Rechnung vom 02.03.2026 (Professionelle Zahnreinigung) haben wir 76,00 € erstattet. Der Betrag wurde auf Ihr Konto DE46 **** **** **** **7890 überwiesen.\n\nMit freundlichen Grüßen\nIhre VitaPlus',
        datum: '2026-03-14T11:00:00', gelesen: true, kategorie: 'LEISTUNG', anhaenge: [], vorgangId: 'v1', wichtig: false,
      },
      {
        id: 'n2', benutzerId: 'u1', ordner: 'EINGANG', betreff: 'Neuer Zusatzbeitrag ab 01.01.2027', absender: 'VitaPlus Mitgliederservice', empfaenger: 'Anna Schmidt',
        text: 'Sehr geehrte Frau Schmidt,\n\nder Verwaltungsrat der VitaPlus hat beschlossen, den Zusatzbeitrag zum 01.01.2027 stabil bei 2,49 % zu halten. Für Sie ändert sich damit nichts.\n\nIhr Sonderkündigungsrecht bleibt davon unberührt.\n\nMit freundlichen Grüßen\nIhre VitaPlus',
        datum: '2026-11-15T08:00:00', gelesen: false, kategorie: 'BEITRAG', anhaenge: [{ id: 'd6', name: 'Beitragsinformation_2027.pdf', groesseBytes: 88211, mimeType: 'application/pdf', hochgeladenAm: '2026-11-15T08:00:00' }], wichtig: true,
      },
      {
        id: 'n3', benutzerId: 'u1', ordner: 'EINGANG', betreff: 'Noch 2 Bonusmaßnahmen bis zum Jahresende', absender: 'VitaPlus Bonusprogramm', empfaenger: 'Anna Schmidt',
        text: 'Hallo Frau Schmidt,\n\nSie haben in diesem Jahr bereits fleißig Punkte gesammelt. Denken Sie daran: Maßnahmen aus 2026 können Sie noch bis zum 31.03.2027 einreichen.\n\nIhr VitaPlus Bonusteam',
        datum: '2026-11-22T10:30:00', gelesen: false, kategorie: 'BONUS', anhaenge: [], wichtig: false,
      },
      {
        id: 'n4', benutzerId: 'u1', ordner: 'GESENDET', betreff: 'Frage zur Familienversicherung meines Mannes', absender: 'Anna Schmidt', empfaenger: 'VitaPlus Kundenservice',
        text: 'Guten Tag,\n\nmein Mann beginnt im Januar eine selbstständige Tätigkeit. Bleibt er familienversichert?\n\nViele Grüße\nAnna Schmidt',
        datum: '2026-11-10T21:14:00', gelesen: true, kategorie: 'MITGLIEDSCHAFT', anhaenge: [], wichtig: false,
      },
      {
        id: 'n5', benutzerId: 'u1', ordner: 'EINGANG', betreff: 'AW: Frage zur Familienversicherung meines Mannes', absender: 'VitaPlus Kundenservice', empfaenger: 'Anna Schmidt',
        text: 'Sehr geehrte Frau Schmidt,\n\neine hauptberufliche Selbstständigkeit schließt die Familienversicherung aus. Bitte melden Sie uns die Aufnahme der Tätigkeit, damit wir Ihren Mann zur freiwilligen Mitgliedschaft beraten können. Gern vereinbaren wir dafür einen Beratungstermin.\n\nMit freundlichen Grüßen\nSabine Müller',
        datum: '2026-11-12T09:05:00', gelesen: true, kategorie: 'MITGLIEDSCHAFT', anhaenge: [], antwortAufId: 'n4', wichtig: false,
      },
      {
        id: 'n6', benutzerId: 'u2', ordner: 'EINGANG', betreff: 'Rückfrage zu Ihrem Antrag VP-2026-001193', absender: 'VitaPlus Leistungsabteilung', empfaenger: 'Max Mustermann',
        text: 'Sehr geehrter Herr Mustermann,\n\nauf der eingereichten Rechnung ist der Impfstoff nicht erkennbar. Bitte reichen Sie zusätzlich eine Kopie Ihres Impfausweises ein. Sie können das Dokument direkt in Ihrem Vorgang hochladen.\n\nMit freundlichen Grüßen\nSabine Müller',
        datum: '2026-11-04T10:20:00', gelesen: false, kategorie: 'LEISTUNG', anhaenge: [], vorgangId: 'v4', wichtig: true,
      },
      {
        id: 'n7', benutzerId: 'u3', ordner: 'EINGANG', betreff: 'Willkommen in der Online-Geschäftsstelle', absender: 'VitaPlus', empfaenger: 'Dr. Erika Weber',
        text: 'Sehr geehrte Frau Dr. Weber,\n\nschön, dass Sie unsere Online-Geschäftsstelle nutzen. Hier erledigen Sie viele Anliegen rund um die Uhr.\n\nIhre VitaPlus',
        datum: '2026-01-08T12:00:00', gelesen: true, kategorie: 'SYSTEM', anhaenge: [], wichtig: false,
      },
    ],
    bonus: [
      { id: 'b1', benutzerId: 'u1', code: 'CHECKUP', datum: '2025-03-01', punkte: 300, status: 'BESTAETIGT', eingereichtAm: '2025-03-01T12:00:00', eingeloest: true },
      { id: 'b2', benutzerId: 'u1', code: 'VEREIN', datum: '2025-06-15', punkte: 200, status: 'BESTAETIGT', eingereichtAm: '2025-06-15T12:00:00', eingeloest: true },
      { id: 'b3', benutzerId: 'u1', code: 'ZAHN', datum: '2025-09-09', punkte: 150, status: 'BESTAETIGT', eingereichtAm: '2025-09-09T12:00:00', eingeloest: true },
      { id: 'b4', benutzerId: 'u1', code: 'BLUTSPENDE', datum: '2025-11-02', punkte: 50, status: 'BESTAETIGT', eingereichtAm: '2025-11-02T12:00:00', eingeloest: true },
      { id: 'b5', benutzerId: 'u1', code: 'CHECKUP', datum: '2026-02-14', punkte: 300, status: 'BESTAETIGT', eingereichtAm: '2026-02-14T12:00:00', eingeloest: false },
      { id: 'b6', benutzerId: 'u1', code: 'ZAHN', datum: '2026-04-02', punkte: 150, status: 'BESTAETIGT', eingereichtAm: '2026-04-02T12:00:00', eingeloest: false },
      { id: 'b7', benutzerId: 'u1', code: 'VEREIN', datum: '2026-09-01', punkte: 200, status: 'ERFASST', eingereichtAm: '2026-11-26T19:20:00', eingeloest: false },
      { id: 'b8', benutzerId: 'u2', code: 'FITNESS', datum: '2026-01-20', punkte: 200, status: 'BESTAETIGT', eingereichtAm: '2026-01-20T12:00:00', eingeloest: false },
      { id: 'b9', benutzerId: 'u3', code: 'NICHTRAUCHER', datum: '2026-01-10', punkte: 150, status: 'BESTAETIGT', eingereichtAm: '2026-01-10T12:00:00', eingeloest: false },
      { id: 'b10', benutzerId: 'u3', code: 'HAUT', datum: '2026-05-19', punkte: 150, status: 'BESTAETIGT', eingereichtAm: '2026-05-19T12:00:00', eingeloest: false },
      { id: 'b11', benutzerId: 'u3', code: 'IMPFUNG', datum: '2026-10-21', punkte: 100, status: 'BESTAETIGT', eingereichtAm: '2026-10-21T12:00:00', eingeloest: false },
    ],
    karten: [
      { id: 'k1', benutzerId: 'u1', inhaber: 'Anna Schmidt', kartennummer: '80276 00123 45678 9', gueltigBis: '2029-12-31', status: 'AKTIV', fotoVorhanden: true },
      { id: 'k2', benutzerId: 'u1', familienmitgliedId: 'f1', inhaber: 'Thomas Schmidt', kartennummer: '80276 00123 45679 0', gueltigBis: '2029-12-31', status: 'AKTIV', fotoVorhanden: true },
      { id: 'k3', benutzerId: 'u1', familienmitgliedId: 'f2', inhaber: 'Lena Schmidt', kartennummer: '80276 00123 45680 1', gueltigBis: '2028-03-31', status: 'AKTIV', fotoVorhanden: false },
      { id: 'k4', benutzerId: 'u2', inhaber: 'Max Mustermann', kartennummer: '80276 00987 65432 1', gueltigBis: '2027-03-31', status: 'AKTIV', fotoVorhanden: true },
      { id: 'k5', benutzerId: 'u3', inhaber: 'Dr. Erika Weber', kartennummer: '80276 00246 81357 9', gueltigBis: '2026-10-31', status: 'AKTIV', fotoVorhanden: false },
      { id: 'k6', benutzerId: 'u4', inhaber: 'Jonas Klein', kartennummer: '80276 00135 79246 8', gueltigBis: '2028-06-30', status: 'AKTIV', fotoVorhanden: true },
    ],
    termine: [
      { id: 't1', benutzerId: 'u1', thema: 'Krankengeld', kanal: 'TELEFON', datum: '2026-12-03', uhrzeit: '10:30', telefon: '0171 2345678', status: 'GEBUCHT', gebuchtAm: '2026-11-12T09:30:00' },
      { id: 't2', benutzerId: 'u1', thema: 'Familienversicherung', kanal: 'FILIALE', filiale: 'Berlin-Mitte, Friedrichstraße 112', datum: '2026-06-18', uhrzeit: '14:00', status: 'DURCHGEFUEHRT', gebuchtAm: '2026-06-01T12:00:00' },
    ],
    dokumente: [],
    arztFavoriten: { u1: ['A1002', 'A1015'] },
    passwortResetTokens: [],
    postausgang: [],
    dateien: [],
  } as any);
}
