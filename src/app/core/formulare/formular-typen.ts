import { Beschaeftigung } from '../models';

export type FeldTyp =
  | 'text' | 'textarea' | 'zahl' | 'betrag' | 'datum' | 'uhrzeit' | 'auswahl' | 'radio' | 'checkbox' | 'mehrfach'
  | 'person' | 'kind' | 'datei' | 'telefon' | 'email' | 'iban' | 'info' | 'vorgang';

export interface Option {
  wert: string;
  text: string;
}

export interface Bedingung {
  feld: string;
  gleich?: any;
  ungleich?: any;
  in?: any[];
  gesetzt?: boolean;
}

export interface FeldDef {
  name: string;
  label: string;
  typ: FeldTyp;
  pflicht?: boolean;
  optionen?: Option[];
  min?: number;
  max?: number;
  minLaenge?: number;
  maxLaenge?: number;
  muster?: string;
  musterText?: string;
  nichtZukunft?: boolean;
  nichtVergangenheit?: boolean;
  maxTageZurueck?: number;
  maxTageVoraus?: number;
  sichtbarWenn?: Bedingung | Bedingung[];
  hilfe?: string;
  platzhalter?: string;
  maxDateien?: number;
  vorgangFilter?: { status?: string[]; typen?: string[] };
  breit?: boolean;
}

export interface SchrittDef {
  titel: string;
  beschreibung?: string;
  felder: FeldDef[];
}

export type FormularKategorie =
  | 'LEISTUNG' | 'PFLEGE' | 'MITGLIEDSCHAFT' | 'BEITRAG' | 'FAMILIE' | 'DIGITAL' | 'RECHT' | 'KONTAKT' | 'STAMMDATEN';

export interface FormularDef {
  code: string;
  titel: string;
  kurz: string;
  kategorie: FormularKategorie;
  zustaendig: string;
  bearbeitungTage: number;
  schritte: SchrittDef[];
  einwilligung?: string;
  entwurfErlaubt: boolean;
  nurFuer?: Beschaeftigung[];
  oeffentlich?: boolean;
  suchbegriffe: string[];
  lebenslagen: string[];
  hinweis?: string;
  automatischErledigt?: boolean;
}

export const FORMULAR_KATEGORIEN: Record<FormularKategorie, string> = {
  LEISTUNG: 'Leistungen & Behandlungen',
  PFLEGE: 'Pflege',
  MITGLIEDSCHAFT: 'Mitgliedschaft & Versicherung',
  BEITRAG: 'Beiträge & Zahlungen',
  FAMILIE: 'Familie & Lebensereignisse',
  DIGITAL: 'Digitale Gesundheit',
  RECHT: 'Widerspruch & Datenschutz',
  KONTAKT: 'Kontakt & Service',
  STAMMDATEN: 'Persönliche Daten',
};

export const LEBENSLAGEN: { code: string; titel: string; beschreibung: string; symbol: string; ton: string }[] = [
  { code: 'KRANK', titel: 'Ich bin krank', beschreibung: 'Krankmeldung, Krankengeld, Behandlungen und Hilfsmittel', symbol: 'thermometer', ton: '#c2507a' },
  { code: 'FAMILIE', titel: 'Familie & Nachwuchs', beschreibung: 'Schwangerschaft, Geburt, Familienversicherung, Kinderkrankengeld', symbol: 'baby', ton: '#d9822b' },
  { code: 'JOB', titel: 'Beruf & Ausbildung', beschreibung: 'Jobwechsel, Ausbildung, Studium, Selbstständigkeit', symbol: 'briefcase-business', ton: '#1d6fb8' },
  { code: 'RENTE', titel: 'Rente', beschreibung: 'Renteneintritt und Krankenversicherung der Rentner', symbol: 'sun', ton: '#b8860b' },
  { code: 'PFLEGE', titel: 'Pflege', beschreibung: 'Pflegegrad, Pflegegeld, Entlastung für Angehörige', symbol: 'heart-handshake', ton: '#7c5cc4' },
  { code: 'AUSLAND', titel: 'Ausland', beschreibung: 'Urlaub, Studium oder Arbeit im Ausland', symbol: 'plane', ton: '#1d8fb8' },
  { code: 'GELD', titel: 'Geld & Beiträge', beschreibung: 'Beiträge, Ratenzahlung, Zuzahlungen und Erstattungen', symbol: 'wallet', ton: '#0b6e69' },
  { code: 'TRAUER', titel: 'Trauerfall', beschreibung: 'Was im Todesfall zu tun ist', symbol: 'flower-2', ton: '#5b6b73' },
  { code: 'GESUND', titel: 'Gesund bleiben', beschreibung: 'Vorsorge, Bonusprogramm, Kurse', symbol: 'heart-pulse', ton: '#2a9d8f' },
];
