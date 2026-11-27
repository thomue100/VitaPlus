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

export const LEBENSLAGEN: { code: string; titel: string; beschreibung: string }[] = [
  { code: 'KRANK', titel: 'Ich bin krank', beschreibung: 'Krankmeldung, Krankengeld, Behandlungen und Hilfsmittel' },
  { code: 'FAMILIE', titel: 'Familie & Nachwuchs', beschreibung: 'Schwangerschaft, Geburt, Familienversicherung, Kinderkrankengeld' },
  { code: 'JOB', titel: 'Beruf & Ausbildung', beschreibung: 'Jobwechsel, Ausbildung, Studium, Selbstständigkeit' },
  { code: 'RENTE', titel: 'Rente', beschreibung: 'Renteneintritt und Krankenversicherung der Rentner' },
  { code: 'PFLEGE', titel: 'Pflege', beschreibung: 'Pflegegrad, Pflegegeld, Entlastung für Angehörige' },
  { code: 'AUSLAND', titel: 'Ausland', beschreibung: 'Urlaub, Studium oder Arbeit im Ausland' },
  { code: 'GELD', titel: 'Geld & Beiträge', beschreibung: 'Beiträge, Ratenzahlung, Zuzahlungen und Erstattungen' },
  { code: 'TRAUER', titel: 'Trauerfall', beschreibung: 'Was im Todesfall zu tun ist' },
  { code: 'GESUND', titel: 'Gesund bleiben', beschreibung: 'Vorsorge, Bonusprogramm, Kurse' },
];
