/**
 * Fachliche Datenmodelle der VitaPlus Online-Geschäftsstelle.
 * Alle Daten sind fiktiv und werden ausschließlich im localStorage des Browsers gehalten.
 */

export type Rolle = 'VERSICHERTER' | 'SACHBEARBEITER' | 'ADMIN';
export type Tarif = 'BASIS' | 'KOMFORT' | 'PREMIUM';
export type Beschaeftigung = 'ANGESTELLT' | 'SELBSTSTAENDIG' | 'STUDENT' | 'RENTNER';
export type Anrede = 'FRAU' | 'HERR' | 'DIVERS';

export interface Adresse {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  land: string;
}

export interface Bankverbindung {
  kontoinhaber: string;
  iban: string;
  bic?: string;
  bankname?: string;
  sepaMandat: boolean;
}

export interface Kommunikation {
  email: boolean;
  post: boolean;
  sms: boolean;
  newsletter: boolean;
  erinnerungVorsorge: boolean;
}

export interface Benutzer {
  id: string;
  rolle: Rolle;
  email: string;
  passwort: string;
  versichertennummer?: string;
  anrede: Anrede;
  titel?: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string; // ISO yyyy-mm-dd
  telefon?: string;
  mobil?: string;
  adresse: Adresse;
  bank?: Bankverbindung;
  tarif: Tarif;
  beschaeftigung: Beschaeftigung;
  arbeitgeber?: string;
  mitgliedSeit: string;
  zweiFaktorAktiv: boolean;
  zweiFaktorCode: string;
  gesperrt: boolean;
  fehlversuche: number;
  kommunikation: Kommunikation;
  schriftgroesse: 'NORMAL' | 'GROSS' | 'SEHR_GROSS';
  kinderAnzahl: number;
  letzterLogin?: string;
  bruttoMonat?: number;
  freigabeLimit?: number;
  teamleitung?: boolean;
  team?: string;
  familienstand?: Familienstand;
  staatsangehoerigkeit?: string;
  geburtsort?: string;
  geburtsname?: string;
  steuerId?: string;
  sprache: 'de' | 'en';
  hoherKontrast: boolean;
  benachrichtigungen: BenachrichtigungsEinstellungen;
  bonusTeilnahmeSeit?: string;
  kundenberaterId?: string;
  mitgliedBis?: string;
  versicherungsart?: 'PFLICHT' | 'FREIWILLIG' | 'KVDR' | 'STUDENT';
  bekannteGeraete: string[];
  konto: 'AKTIV' | 'SELBST_GESPERRT' | 'GELOESCHT' | 'NICHT_AKTIVIERT';
  aktivierungscode?: string;
  passwortGeaendertAm?: string;
  datenschutzPraeferenzen: { nutzungsanalyse: boolean; komfortCookies: boolean };
}

export type Familienstand = 'LEDIG' | 'VERHEIRATET' | 'LEBENSPARTNERSCHAFT' | 'GESCHIEDEN' | 'VERWITWET' | 'GETRENNT';

export interface BenachrichtigungsEinstellungen {
  email: boolean;
  push: boolean;
  sms: boolean;
  kategorien: Record<'NACHRICHT' | 'STATUS' | 'DOKUMENT' | 'FRIST' | 'BONUS' | 'SICHERHEIT', boolean>;
  ruhezeitAktiv: boolean;
  ruhezeitVon: string;
  ruhezeitBis: string;
}

/** Stammdaten von Mitgliedern, die noch kein Online-Konto besitzen (für die Registrierung). */
export interface Stammdatensatz {
  versichertennummer: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  tarif: Tarif;
  beschaeftigung: Beschaeftigung;
  adresse: Adresse;
  registriert: boolean;
  anrede?: Anrede;
  email?: string;
  telefon?: string;
  mitgliedSeit?: string;
  arbeitgeber?: string;
  bruttoMonat?: number;
  familie?: { vorname: string; nachname: string; geburtsdatum: string; beziehung: Beziehung; versichertennummer: string }[];
}

export type Beziehung = 'EHEPARTNER' | 'LEBENSPARTNER' | 'KIND' | 'STIEFKIND' | 'ENKELKIND';
export type FamilienStatus = 'BEANTRAGT' | 'AKTIV' | 'ABGELEHNT' | 'BEENDET';

export interface Familienmitglied {
  id: string;
  hauptversicherterId: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  geschlecht: 'W' | 'M' | 'D';
  beziehung: Beziehung;
  versichertennummer?: string;
  status: FamilienStatus;
  einkommenMonat: number;
  inAusbildung: boolean;
  anderweitigVersichert: boolean;
  beantragtAm: string;
  vorgangId?: string;
  abgemeldetAm?: string;
}

export type VorgangTyp =
  | string
  | 'KOSTENERSTATTUNG'
  | 'ARBEITSUNFAEHIGKEIT'
  | 'FAMILIENVERSICHERUNG'
  | 'ERSATZKARTE'
  | 'BONUS_AUSZAHLUNG'
  | 'NAMENSAENDERUNG'
  | 'HAUSHALTSHILFE'
  | 'ZAHNERSATZ'
  | 'MUTTERSCHAFTSGELD'
  | 'KINDERKRANKENGELD'
  | 'HILFSMITTEL';

export type VorgangStatus =
  | 'ENTWURF'
  | 'EINGEREICHT'
  | 'IN_BEARBEITUNG'
  | 'RUECKFRAGE'
  | 'GENEHMIGT'
  | 'TEILWEISE_GENEHMIGT'
  | 'ABGELEHNT'
  | 'AUSGEZAHLT'
  | 'VERSENDET'
  | 'STORNIERT';

export interface Anhang {
  id: string;
  name: string;
  groesseBytes: number;
  mimeType: string;
  hochgeladenAm: string;
}

export interface Historieneintrag {
  zeitpunkt: string;
  status: VorgangStatus;
  text: string;
  von: string;
}

export interface Vorgang {
  id: string;
  vorgangsnummer: string;
  benutzerId: string;
  typ: VorgangTyp;
  titel: string;
  status: VorgangStatus;
  erstelltAm: string;
  geaendertAm: string;
  betragBeantragt?: number;
  betragErstattet?: number;
  /** Bereits überwiesener Betrag (für Nachzahlungen nach Widerspruch) */
  betragAusgezahlt?: number;
  daten: Record<string, any>;
  anhaenge: Anhang[];
  historie: Historieneintrag[];
  bearbeiterId?: string;
  ablehnungsgrund?: string;
  rueckfrage?: string;
  rueckfrageFrist?: string;
  zustaendig?: string;
  fristBis?: string;
  archiviert?: boolean;
  bezugVorgangId?: string;
  bescheidAm?: string;
  externKontakt?: { name: string; email: string };
  /** Steuerung der maschinellen Weiterverarbeitung (Eingangszeitpunkt, Bearbeitungsspur) */
  verarbeitung?: { eingang: number; spur: 'DUNKEL' | 'SACHBEARBEITUNG'; manuell?: boolean; rueckfrageGestellt?: boolean };
}

export type NachrichtKategorie =
  | 'ALLGEMEIN'
  | 'LEISTUNG'
  | 'BEITRAG'
  | 'MITGLIEDSCHAFT'
  | 'BONUS'
  | 'BESCHWERDE'
  | 'SYSTEM';

export type Ordner = 'EINGANG' | 'GESENDET' | 'ARCHIV' | 'PAPIERKORB';

export interface Nachricht {
  id: string;
  benutzerId: string;
  ordner: Ordner;
  betreff: string;
  text: string;
  absender: string;
  empfaenger: string;
  datum: string;
  gelesen: boolean;
  kategorie: NachrichtKategorie;
  anhaenge: Anhang[];
  vorgangId?: string;
  antwortAufId?: string;
  wichtig: boolean;
  /** Bei gesendeten Nachrichten: Zeitpunkt der Antwort des Kundenservice */
  beantwortetAm?: string;
}

export interface BonusMassnahmeDef {
  code: string;
  bezeichnung: string;
  kategorie: 'VORSORGE' | 'BEWEGUNG' | 'ERNAEHRUNG' | 'IMPFUNG' | 'LEBENSSTIL';
  punkte: number;
  maxProJahr: number;
  nachweisErforderlich: boolean;
  mindestalter?: number;
}

export interface BonusEintrag {
  id: string;
  benutzerId: string;
  code: string;
  datum: string;
  punkte: number;
  status: 'ERFASST' | 'BESTAETIGT' | 'ABGELEHNT';
  nachweis?: Anhang;
  eingeloest: boolean;
  eingereichtAm: string;
}

export type KartenStatus = 'AKTIV' | 'GESPERRT' | 'IN_PRODUKTION' | 'VERSENDET' | 'ABGELAUFEN';

export interface Gesundheitskarte {
  id: string;
  benutzerId: string;
  familienmitgliedId?: string;
  inhaber: string;
  kartennummer: string;
  gueltigBis: string;
  status: KartenStatus;
  fotoVorhanden: boolean;
  sperrgrund?: 'VERLUST' | 'DIEBSTAHL' | 'DEFEKT' | 'NAMENSAENDERUNG';
  gesperrtAm?: string;
}

export type TerminKanal = 'FILIALE' | 'TELEFON' | 'VIDEO';

export interface Termin {
  id: string;
  benutzerId: string;
  thema: string;
  kanal: TerminKanal;
  filiale?: string;
  datum: string;
  uhrzeit: string;
  telefon?: string;
  anmerkung?: string;
  status: 'GEBUCHT' | 'STORNIERT' | 'DURCHGEFUEHRT';
  gebuchtAm: string;
}

export interface Arzt {
  id: string;
  titel: string;
  vorname: string;
  nachname: string;
  fachrichtung: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  barrierefrei: boolean;
  onlineTermin: boolean;
  sprachen: string[];
  sprechzeiten: string;
  neuePatienten: boolean;
}

export interface DokumentAnforderung {
  id: string;
  benutzerId: string;
  typ: string;
  bezeichnung: string;
  angefordertAm: string;
  dateiname: string;
  parameter: Record<string, string>;
}

export interface Store {
  version: number;
  benutzer: Benutzer[];
  stammdaten: Stammdatensatz[];
  familie: Familienmitglied[];
  vorgaenge: Vorgang[];
  nachrichten: Nachricht[];
  bonus: BonusEintrag[];
  karten: Gesundheitskarte[];
  termine: Termin[];
  dokumente: DokumentAnforderung[];
  arztFavoriten: Record<string, string[]>;
  beitragskonto: Buchung[];
  arbeitgebermeldungen: Arbeitgebermeldung[];
  zuzahlungen: Zuzahlung[];
  leistungsdaten: Leistungsdatensatz[];
  pflege: Pflegeakte[];
  epa: EpaAkte[];
  vollmachten: Vollmacht[];
  einwilligungen: Einwilligung[];
  benachrichtigungen: Benachrichtigung[];
  protokoll: Protokolleintrag[];
  aenderungshistorie: Aenderung[];
  feedback: Feedback[];
  inhalte: { faq: FaqEintrag[]; meldungen: Meldung[]; glossar: GlossarEintrag[] };
  kursbuchungen: Kursbuchung[];
  gesundheitsziele: Gesundheitsziel[];
  challengeTeilnahmen: { benutzerId: string; challengeId: string; seit: string; fortschritt: number }[];
  krankengeldZahlungen: KrankengeldZahlung[];
  system: { wartungsmodus: boolean; wartungstext: string; version: string; stoerung?: boolean };
  seitenaufrufe: { seite: string; zeitpunkt: string }[];
  passwortResetTokens: { token: string; benutzerId: string; gueltigBis: string }[];
  /** Simulierter Versand über externe Kanäle (E-Mail-Gateway, SMS-Gateway, Druckstraße) */
  postausgang: AusgehendeNachricht[];
  /** Metadaten hochgeladener Dateien; die Inhalte liegen in der Dokumentenablage */
  dateien?: Datei[];
  zaehler: number;
}

export interface AusgehendeNachricht {
  id: string;
  kanal: 'EMAIL' | 'SMS' | 'BRIEF';
  an: string;
  betreff: string;
  text: string;
  zeitpunkt: string;
  link?: { text: string; ziel: string };
  gelesen?: boolean;
}

export interface Buchung {
  id: string;
  benutzerId: string;
  datum: string;
  faellig?: string;
  monat?: string;
  art: 'SOLL' | 'ZAHLUNG' | 'GUTSCHRIFT' | 'SAEUMNISZUSCHLAG' | 'MAHNGEBUEHR' | 'RATE';
  betrag: number;
  text: string;
}

export interface Arbeitgebermeldung {
  id: string;
  benutzerId: string;
  arbeitgeber: string;
  zeitraumVon: string;
  zeitraumBis: string;
  grund: 'ANMELDUNG' | 'JAHRESMELDUNG' | 'ABMELDUNG' | 'UNTERBRECHUNG';
  entgelt: number;
  eingang: string;
}

export interface Zuzahlung {
  id: string;
  benutzerId: string;
  person: string;
  datum: string;
  art: 'ARZNEIMITTEL' | 'KRANKENHAUS' | 'HEILMITTEL' | 'HILFSMITTEL' | 'FAHRKOSTEN' | 'HAUSLICHE_PFLEGE';
  betrag: number;
  leistungserbringer: string;
}

export interface Leistungsdatensatz {
  id: string;
  benutzerId: string;
  person: string;
  quartal: string;
  datum: string;
  bereich: 'AERZTLICH' | 'ZAHNAERZTLICH' | 'ARZNEIMITTEL' | 'KRANKENHAUS' | 'HEILMITTEL';
  leistungserbringer: string;
  beschreibung: string;
  betrag: number;
}

export interface Pflegeakte {
  id: string;
  benutzerId: string;
  person: string;
  pflegegrad: 0 | 1 | 2 | 3 | 4 | 5;
  seit: string;
  leistungsart: 'PFLEGEGELD' | 'SACHLEISTUNG' | 'KOMBINATION';
  pflegepersonen: { name: string; stundenProWoche: number; rentenversichert: boolean }[];
  entlastungGenutzt: Record<string, number>;
  verhinderungKurzzeitGenutzt: Record<string, number>;
  begutachtung?: { datum: string; uhrzeit: string; art: 'HAUSBESUCH' | 'TELEFON'; gutachter: string };
}

export interface EpaAkte {
  benutzerId: string;
  status: 'AKTIV' | 'WIDERSPROCHEN' | 'NICHT_EINGERICHTET';
  appGekoppelt: boolean;
  gesundheitsId: 'KEINE' | 'BEANTRAGT' | 'AKTIV';
  widerspruchMedikation: boolean;
  widerspruchForschung: boolean;
  berechtigungen: { id: string; einrichtung: string; art: string; bis: string; quelle: 'EGK' | 'APP'; aktiv: boolean }[];
  zugriffe: { zeitpunkt: string; einrichtung: string; aktion: string }[];
}

export interface Vollmacht {
  id: string;
  benutzerId: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  email?: string;
  beziehung: string;
  umfang: string[];
  gueltigAb: string;
  gueltigBis?: string;
  onlineZugriff: boolean;
  status: 'AKTIV' | 'WIDERRUFEN' | 'ABGELAUFEN' | 'AUSSTEHEND';
  erteiltAm: string;
  widerrufenAm?: string;
  art: 'VOLLMACHT' | 'BETREUUNG' | 'VORSORGEVOLLMACHT';
}

export interface Einwilligung {
  id: string;
  benutzerId: string;
  code: string;
  erteilt: boolean;
  zeitpunkt: string;
  historie: { zeitpunkt: string; erteilt: boolean; kanal: string }[];
}

export interface Benachrichtigung {
  id: string;
  benutzerId: string;
  zeitpunkt: string;
  kategorie: 'NACHRICHT' | 'STATUS' | 'DOKUMENT' | 'FRIST' | 'BONUS' | 'SICHERHEIT';
  titel: string;
  text: string;
  link?: string;
  gelesen: boolean;
}

export interface Protokolleintrag {
  id: string;
  benutzerId?: string;
  akteurId?: string;
  zeitpunkt: string;
  ereignis: string;
  details: string;
  geraet?: string;
  stufe: 'INFO' | 'WARNUNG' | 'KRITISCH';
}

export interface Aenderung {
  id: string;
  benutzerId: string;
  zeitpunkt: string;
  bereich: string;
  alt: string;
  neu: string;
  von: string;
}

export interface Feedback {
  id: string;
  benutzerId?: string;
  zeitpunkt: string;
  bewertung: number;
  text?: string;
  seite: string;
  art: 'SERVICE' | 'BARRIERE' | 'ALLGEMEIN';
}

export interface FaqEintrag {
  id: string;
  frage: string;
  antwort: string;
  kategorie: string;
  sichtbar: boolean;
  reihenfolge: number;
  hilfreich: number;
  nichtHilfreich: number;
}

export interface Meldung {
  id: string;
  titel: string;
  text: string;
  typ: 'INFO' | 'WARNUNG' | 'STOERUNG';
  aktivVon: string;
  aktivBis: string;
  zielgruppe: 'ALLE' | 'VERSICHERTE' | 'MITARBEITENDE';
}

export interface GlossarEintrag {
  begriff: string;
  erklaerung: string;
}

export interface Kursbuchung {
  id: string;
  benutzerId: string;
  kursId: string;
  gebuchtAm: string;
  status: 'GEBUCHT' | 'STORNIERT' | 'ABGESCHLOSSEN';
}

export interface Gesundheitsziel {
  id: string;
  benutzerId: string;
  titel: string;
  kategorie: string;
  zielwert: number;
  einheit: string;
  aktuell: number;
  bis: string;
  erreicht: boolean;
}

export interface KrankengeldZahlung {
  id: string;
  benutzerId: string;
  vorgangId: string;
  zeitraumVon: string;
  zeitraumBis: string;
  tage: number;
  brutto: number;
  abzuege: number;
  netto: number;
  ausgezahltAm: string;
}

/** Gegen ablehnende oder nur teilweise stattgebende Entscheidungen ist ein Widerspruch zulässig – auch wenn der Teilbetrag schon ausgezahlt wurde. */
export function widerspruchsfaehig(v: Pick<Vorgang, 'typ' | 'status' | 'betragBeantragt' | 'betragErstattet'>): boolean {
  if (v.typ === 'WIDERSPRUCH') return false;
  if (v.status === 'ABGELEHNT' || v.status === 'TEILWEISE_GENEHMIGT') return true;
  return v.status === 'AUSGEZAHLT' && v.betragBeantragt != null && (v.betragErstattet ?? 0) < v.betragBeantragt;
}

/** Hochgeladene Datei: Metadaten wie beim Anhang, dazu der Eigentümer (fehlt bei Uploads ohne Anmeldung) */
export interface Datei extends Anhang {
  benutzerId?: string;
}
