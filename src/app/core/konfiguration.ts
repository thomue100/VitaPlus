import { BonusMassnahmeDef, Tarif, VorgangTyp } from './models';

/** Rechengrößen der VitaPlus (fiktiv). */
export const BEITRAG = {
  allgemeinerSatz: 14.6,
  ermaessigterSatz: 14.0,
  zusatzbeitrag: 2.49,
  pflegeSatz: 3.6,
  pflegeKinderlosZuschlag: 0.6,
  pflegeAbschlagProKind: 0.25,
  pflegeAbschlagMaxKinder: 5,
  bemessungsgrenzeMonat: 5812.5,
  versicherungspflichtgrenzeJahr: 77400,
  mindestbemessungSelbststaendig: 1248.33,
  studentBeitragKv: 92.25,
  studentBeitragPv: 33.9,
  minijobGrenze: 603,
  familienEinkommensgrenze: 565,
  familienEinkommensgrenzeMinijob: 603,
};

export const TARIFE: Record<Tarif, { name: string; monatsZuschlag: number; beschreibung: string }> = {
  BASIS: { name: 'VitaPlus Basis', monatsZuschlag: 0, beschreibung: 'Gesetzliche Leistungen und digitale Services' },
  KOMFORT: { name: 'VitaPlus Komfort', monatsZuschlag: 0, beschreibung: 'Zusätzlich Osteopathie, Zahnreinigung und Naturheilverfahren' },
  PREMIUM: { name: 'VitaPlus Premium', monatsZuschlag: 0, beschreibung: 'Maximale Zusatzleistungen inkl. Sehhilfen und erweiterter Vorsorge' },
};

export interface ErstattungsRegel {
  code: string;
  bezeichnung: string;
  /** Erstattungsquote in Prozent je Tarif; 0 = keine Leistung im Tarif */
  quote: Record<Tarif, number>;
  /** Jahreshöchstbetrag je Tarif in Euro */
  jahresMax: Record<Tarif, number>;
  maxAnzahlProJahr?: number;
  hinweis?: string;
  mindestalter?: number;
}

export const ERSTATTUNGEN: ErstattungsRegel[] = [
  {
    code: 'PZR',
    bezeichnung: 'Professionelle Zahnreinigung',
    quote: { BASIS: 50, KOMFORT: 80, PREMIUM: 100 },
    jahresMax: { BASIS: 40, KOMFORT: 80, PREMIUM: 120 },
    maxAnzahlProJahr: 2,
  },
  {
    code: 'OSTEO',
    bezeichnung: 'Osteopathie',
    quote: { BASIS: 0, KOMFORT: 80, PREMIUM: 90 },
    jahresMax: { BASIS: 0, KOMFORT: 240, PREMIUM: 360 },
    maxAnzahlProJahr: 6,
    hinweis: 'Ärztliche Verordnung erforderlich.',
  },
  {
    code: 'REISEIMPF',
    bezeichnung: 'Reiseschutzimpfung',
    quote: { BASIS: 100, KOMFORT: 100, PREMIUM: 100 },
    jahresMax: { BASIS: 150, KOMFORT: 250, PREMIUM: 400 },
  },
  {
    code: 'NATUR',
    bezeichnung: 'Naturheilverfahren / Homöopathie',
    quote: { BASIS: 0, KOMFORT: 50, PREMIUM: 80 },
    jahresMax: { BASIS: 0, KOMFORT: 200, PREMIUM: 300 },
  },
  {
    code: 'SEHHILFE',
    bezeichnung: 'Brille / Kontaktlinsen',
    quote: { BASIS: 0, KOMFORT: 0, PREMIUM: 100 },
    jahresMax: { BASIS: 0, KOMFORT: 0, PREMIUM: 150 },
    maxAnzahlProJahr: 1,
    mindestalter: 18,
  },
  {
    code: 'SPORTMED',
    bezeichnung: 'Sportmedizinische Untersuchung',
    quote: { BASIS: 0, KOMFORT: 80, PREMIUM: 100 },
    jahresMax: { BASIS: 0, KOMFORT: 100, PREMIUM: 150 },
    maxAnzahlProJahr: 1,
  },
  {
    code: 'KURS',
    bezeichnung: 'Zertifizierter Gesundheitskurs',
    quote: { BASIS: 80, KOMFORT: 80, PREMIUM: 100 },
    jahresMax: { BASIS: 150, KOMFORT: 150, PREMIUM: 200 },
    maxAnzahlProJahr: 2,
    hinweis: 'Bitte reichen Sie die Teilnahmebescheinigung (mind. 80 % Anwesenheit) mit ein.',
  },
  {
    code: 'ARZNEI',
    bezeichnung: 'Rezeptfreie Arzneimittel (Privatrezept)',
    quote: { BASIS: 0, KOMFORT: 50, PREMIUM: 80 },
    jahresMax: { BASIS: 0, KOMFORT: 100, PREMIUM: 150 },
    hinweis: 'Nur apothekenpflichtige Arzneimittel auf ärztlichem Privatrezept (grünes Rezept).',
  },
];

/** Beträge bis zu dieser Höhe werden automatisch genehmigt. */
export const AUTO_GENEHMIGUNG_BIS = 50;
/** Rechnungen dürfen höchstens so viele Monate alt sein. */
export const RECHNUNG_MAX_ALTER_MONATE = 12;
export const RECHNUNG_MAX_BETRAG = 10000;

export const BONUS_KATALOG: BonusMassnahmeDef[] = [
  { code: 'CHECKUP', bezeichnung: 'Gesundheits-Check-up', kategorie: 'VORSORGE', punkte: 300, maxProJahr: 1, nachweisErforderlich: true, mindestalter: 18 },
  { code: 'ZAHN', bezeichnung: 'Zahnärztliche Vorsorgeuntersuchung', kategorie: 'VORSORGE', punkte: 150, maxProJahr: 2, nachweisErforderlich: true },
  { code: 'KREBS', bezeichnung: 'Krebsfrüherkennung', kategorie: 'VORSORGE', punkte: 200, maxProJahr: 1, nachweisErforderlich: true, mindestalter: 20 },
  { code: 'HAUT', bezeichnung: 'Hautkrebs-Screening', kategorie: 'VORSORGE', punkte: 150, maxProJahr: 1, nachweisErforderlich: true, mindestalter: 35 },
  { code: 'IMPFUNG', bezeichnung: 'Schutzimpfung (STIKO-empfohlen)', kategorie: 'IMPFUNG', punkte: 100, maxProJahr: 3, nachweisErforderlich: true },
  { code: 'VEREIN', bezeichnung: 'Mitgliedschaft im Sportverein', kategorie: 'BEWEGUNG', punkte: 200, maxProJahr: 1, nachweisErforderlich: true },
  { code: 'FITNESS', bezeichnung: 'Mitgliedschaft im zertifizierten Fitnessstudio', kategorie: 'BEWEGUNG', punkte: 200, maxProJahr: 1, nachweisErforderlich: true },
  { code: 'SPORTABZ', bezeichnung: 'Deutsches Sportabzeichen', kategorie: 'BEWEGUNG', punkte: 250, maxProJahr: 1, nachweisErforderlich: true },
  { code: 'KURS', bezeichnung: 'Zertifizierter Präventionskurs', kategorie: 'ERNAEHRUNG', punkte: 250, maxProJahr: 2, nachweisErforderlich: true },
  { code: 'NICHTRAUCHER', bezeichnung: 'Nichtraucher-Erklärung', kategorie: 'LEBENSSTIL', punkte: 150, maxProJahr: 1, nachweisErforderlich: false },
  { code: 'BMI', bezeichnung: 'BMI im Normalbereich (ärztlich bestätigt)', kategorie: 'LEBENSSTIL', punkte: 100, maxProJahr: 1, nachweisErforderlich: true },
  { code: 'BLUTSPENDE', bezeichnung: 'Blutspende', kategorie: 'LEBENSSTIL', punkte: 50, maxProJahr: 4, nachweisErforderlich: true },
];

export const BONUS = {
  euroProPunkt: 0.1,
  mindestpunkteAuszahlung: 500,
  maxPunkteProJahr: 2500,
  gesundheitsbudgetAufschlagProzent: 20,
};

export const FILIALEN = [
  'Berlin-Mitte, Friedrichstraße 112',
  'Hamburg-Altona, Große Bergstraße 45',
  'München-Schwabing, Leopoldstraße 78',
  'Köln-Innenstadt, Hohe Straße 21',
  'Frankfurt, Zeil 90',
  'Leipzig, Petersstraße 15',
];

export const BERATUNGSTHEMEN = [
  'Mitgliedschaft & Versicherungsschutz',
  'Beiträge & Zahlungen',
  'Familienversicherung',
  'Krankengeld',
  'Zahnersatz',
  'Pflege',
  'Bonusprogramm',
  'Auslandsaufenthalt',
  'Sonstiges',
];

export const VORGANG_TYP_TEXT: Record<VorgangTyp, string> = {
  KOSTENERSTATTUNG: 'Kostenerstattung',
  ARBEITSUNFAEHIGKEIT: 'Arbeitsunfähigkeit',
  FAMILIENVERSICHERUNG: 'Familienversicherung',
  ERSATZKARTE: 'Ersatzkarte',
  BONUS_AUSZAHLUNG: 'Bonusauszahlung',
  NAMENSAENDERUNG: 'Namensänderung',
  HAUSHALTSHILFE: 'Haushaltshilfe',
  ZAHNERSATZ: 'Zahnersatz',
  MUTTERSCHAFTSGELD: 'Mutterschaftsgeld',
  KINDERKRANKENGELD: 'Kinderkrankengeld',
  HILFSMITTEL: 'Hilfsmittel',
};

export const STATUS_TEXT: Record<string, string> = {
  ENTWURF: 'Entwurf',
  EINGEREICHT: 'Eingereicht',
  IN_BEARBEITUNG: 'In Bearbeitung',
  RUECKFRAGE: 'Rückfrage',
  GENEHMIGT: 'Genehmigt',
  TEILWEISE_GENEHMIGT: 'Teilweise genehmigt',
  ABGELEHNT: 'Abgelehnt',
  AUSGEZAHLT: 'Ausgezahlt',
  VERSENDET: 'Versendet',
  STORNIERT: 'Storniert',
  BEANTRAGT: 'Beantragt',
  AKTIV: 'Aktiv',
  BEENDET: 'Beendet',
  GESPERRT: 'Gesperrt',
  IN_PRODUKTION: 'In Produktion',
  ABGELAUFEN: 'Abgelaufen',
  GEBUCHT: 'Gebucht',
  DURCHGEFUEHRT: 'Durchgeführt',
  ERFASST: 'Erfasst',
  BESTAETIGT: 'Bestätigt',
};

export const SESSION_TIMEOUT_MINUTEN = 15;
export const MAX_LOGIN_FEHLVERSUCHE = 3;
export const MAX_OFFENE_TERMINE = 3;
export const MAX_ANHANG_BYTES = 5 * 1024 * 1024;
export const ERLAUBTE_DATEITYPEN = ['application/pdf', 'image/jpeg', 'image/png'];
export const KINDERKRANKENGELD_TAGE_PRO_KIND = 15;

export const TEAMS = ['Leistungen', 'Mitgliedschaft & Beiträge', 'Pflegekasse', 'Kundenservice', 'Datenschutz'] as const;

export const ZUZAHLUNG = {
  belastungsgrenzeProzent: 2,
  belastungsgrenzeChronikerProzent: 1,
  freibetragErsterAngehoeriger: 7140,
  freibetragWeitereAngehoerige: 4760,
  freibetragKind: 9600,
  mindestbemessungJahr: 6741,
};

export const PFLEGE = {
  pflegegeld: [0, 0, 347, 599, 800, 990],
  sachleistung: [0, 0, 796, 1497, 1859, 2299],
  entlastungsbetragMonat: 131,
  entlastungsuebertragBis: '06-30',
  gemeinsamerJahresbetrag: 3539,
  kurzzeitpflegeMaxTage: 56,
  verhinderungspflegeMaxTage: 56,
  pflegehilfsmittelMonat: 42,
  wohnumfeldMax: 4180,
  pflegepersonMindestStunden: 10,
};

export const KRANKENGELD = {
  prozentBrutto: 70,
  maxProzentNetto: 90,
  hoechstbetragTag: 135.63,
  beginnNachTagen: 42,
  maxWochen: 78,
};

export const EINWILLIGUNGEN = [
  { code: 'BONUS_DATEN', titel: 'Verarbeitung meiner Daten im Bonusprogramm', text: 'Ich willige ein, dass die VitaPlus die von mir eingereichten Nachweise zur Berechnung meines Bonus verarbeitet.', pflichtFuer: 'BONUS' },
  { code: 'PERSONALISIERTE_INFOS', titel: 'Individuelle Gesundheitsinformationen', text: 'Die VitaPlus darf meine Abrechnungsdaten auswerten, um mich gezielt über passende Vorsorge- und Versorgungsangebote zu informieren (§ 68b SGB V).' },
  { code: 'WERBUNG_EMAIL', titel: 'Angebote per E-Mail', text: 'Ich möchte Informationen zu Zusatzangeboten, Aktionen und Kursen per E-Mail erhalten.' },
  { code: 'WERBUNG_TELEFON', titel: 'Telefonische Beratung', text: 'Die VitaPlus darf mich zu Zusatzangeboten telefonisch kontaktieren.' },
  { code: 'KUNDENBEFRAGUNG', titel: 'Teilnahme an Kundenbefragungen', text: 'Ich nehme gelegentlich an Befragungen zur Servicequalität teil.' },
  { code: 'DIGITALER_ASSISTENT', titel: 'Digitaler Assistent', text: 'Meine Eingaben im Service-Chat dürfen zur Beantwortung automatisiert ausgewertet werden.', pflichtFuer: 'CHAT' },
];

export const DIGA_LISTE = [
  { id: 'DIGA01', name: 'somnio', bereich: 'Schlafstörungen', dauerTage: 90, preis: 224.99 },
  { id: 'DIGA02', name: 'Vivira', bereich: 'Rückenschmerzen', dauerTage: 90, preis: 239.96 },
  { id: 'DIGA03', name: 'zanadio', bereich: 'Adipositas', dauerTage: 90, preis: 218.0 },
  { id: 'DIGA04', name: 'Kalmeda', bereich: 'Tinnitus', dauerTage: 90, preis: 203.97 },
  { id: 'DIGA05', name: 'HelloBetter Stress und Burnout', bereich: 'Psychische Gesundheit', dauerTage: 90, preis: 599.0 },
  { id: 'DIGA06', name: 'Mika', bereich: 'Krebserkrankungen', dauerTage: 90, preis: 419.0 },
  { id: 'DIGA07', name: 'Endo-App', bereich: 'Endometriose', dauerTage: 90, preis: 340.0 },
  { id: 'DIGA08', name: 'Kranus Edera', bereich: 'Erektile Dysfunktion', dauerTage: 90, preis: 552.0 },
];

export const DMP_PROGRAMME = [
  { code: 'DIABETES2', name: 'Diabetes mellitus Typ 2' },
  { code: 'DIABETES1', name: 'Diabetes mellitus Typ 1' },
  { code: 'KHK', name: 'Koronare Herzkrankheit' },
  { code: 'ASTHMA', name: 'Asthma bronchiale' },
  { code: 'COPD', name: 'COPD' },
  { code: 'BRUSTKREBS', name: 'Brustkrebs' },
  { code: 'RUECKEN', name: 'Chronischer Rückenschmerz' },
  { code: 'DEPRESSION', name: 'Depression' },
  { code: 'OSTEOPOROSE', name: 'Osteoporose' },
  { code: 'RHEUMA', name: 'Rheumatoide Arthritis' },
];

export const CHALLENGES = [
  { id: 'C1', titel: '30 Tage Treppe statt Aufzug', zielwert: 30, einheit: 'Tage', punkte: 50, bis: '2026-12-31' },
  { id: 'C2', titel: 'Winter-Schrittchallenge: 300.000 Schritte', zielwert: 300000, einheit: 'Schritte', punkte: 80, bis: '2027-02-28' },
  { id: 'C3', titel: 'Trink-Challenge: 2 Liter täglich', zielwert: 21, einheit: 'Tage', punkte: 30, bis: '2026-12-20' },
];

export const SERVICEZEITEN = {
  telefon: { wochentage: [1, 2, 3, 4, 5], von: '08:00', bis: '20:00', samstagVon: '09:00', samstagBis: '14:00' },
  chat: { wochentage: [1, 2, 3, 4, 5], von: '08:00', bis: '18:00' },
  rueckruf: { wochentage: [1, 2, 3, 4, 5], von: '08:00', bis: '18:00' },
};

export const BINDUNGSFRIST_MONATE = 12;
export const RUECKFRAGE_FRIST_TAGE = 14;

/**
 * Maschinelle Weiterverarbeitung online eingegangener Anliegen (Sekunden nach Eingang bzw. letzter Statusänderung).
 * DUNKEL: regelbasierte Entscheidung ohne Sachbearbeitung; SACHBEARBEITUNG: Zuweisung an das zuständige Team.
 */
export const VERARBEITUNG = {
  aktiv: true,
  dunkelEntscheidungNachSek: 45,
  zuweisungNachSek: 40,
  sachbearbeitungEntscheidungNachSek: 150,
  nachNachreichungSek: 60,
  auszahlungNachSek: 90,
  /** Antwort des Kundenservice auf Nachrichten aus dem Postfach */
  nachrichtAntwortNachSek: 120,
  /** Vorgangstypen, die ohne Sachbearbeitung regelbasiert entschieden werden */
  dunkelTypen: ['KOSTENERSTATTUNG', 'FAHRKOSTEN', 'ZUZAHLUNGSBEFREIUNG', 'DIGA', 'DMP', 'FAMILIENSTAND', 'STAATSANGEHOERIGKEIT', 'ARBEITGEBERWECHSEL',
    'BESCHAEFTIGUNGSENDE', 'AUSBILDUNG', 'STUDIUM', 'AUSLAND', 'EINKOMMEN', 'LEISTUNGSAUSKUNFT', 'DATENSCHUTZANFRAGE', 'RUECKRUF', 'MITGLIEDSANTRAG',
    'PFLEGEHILFSMITTEL', 'ENTLASTUNGSBETRAG', 'ELTERNZEIT', 'KINDERKRANKENGELD', 'HAUSHALTSHILFE', 'KRANKENTRANSPORT', 'AKTENEINSICHT', 'BONUS_AUSZAHLUNG'],
  /** Team → Sachbearbeiter-Kennung, an die das Team neue Vorgänge verteilt */
  teamZuweisung: { 'Leistungen': 's1', 'Mitgliedschaft & Beiträge': 's3', 'Pflegekasse': 's4', 'Beschwerdemanagement': 's2', 'Widerspruchsstelle': 's2', 'Datenschutz': 's2', 'Kundenservice': 's1' } as Record<string, string>,
};
export const WIDERSPRUCHSFRIST_TAGE = 31;
export const PAPIERKORB_AUFBEWAHRUNG_TAGE = 30;
export const SAEUMNISZUSCHLAG_PROZENT = 1;
export const MAHNGEBUEHR = 5;
