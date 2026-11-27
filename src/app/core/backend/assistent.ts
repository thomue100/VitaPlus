import { ERSTATTUNGEN, SERVICEZEITEN, STATUS_TEXT } from '../konfiguration';
import { FORMULARE } from '../formulare/formular-katalog';
import { Benutzer, Store } from '../models';
import { euro } from './api-kontext';
import { kontostand } from './fachlogik';

/**
 * Digitaler Assistent der Online-Geschäftsstelle.
 *
 * Arbeitet regelbasiert in drei Stufen: (1) Antwort auf eine offene Rückfrage des Assistenten,
 * (2) Erkennung eines Anliegens mit ggf. geführtem Dialog, (3) Gesprächsführung nach dem ELIZA-Prinzip
 * (Spiegeln von Aussagen, Rückfragen). Der Gesprächskontext wird vom Client mitgeschickt.
 */

export interface ChatLink { text: string; ziel: string }

export interface ChatKontext {
  thema?: string;
  erwartet?: { frage: string; optionen: { wert: string; text: string; worte: string[] }[] };
  unverstanden?: number;
  person?: string;
  verlauf?: string[];
  /** zuletzt erkannte Angaben (z. B. Leistung), für Anschlussfragen */
  merke?: Record<string, string>;
}

export interface ChatAntwort {
  von: 'BOT' | 'SYSTEM' | 'MITARBEITER';
  text: string;
  name?: string;
  links?: ChatLink[];
  vorschlaege?: string[];
  uebergabe?: boolean;
  kontext: ChatKontext;
}

interface Thema {
  id: string;
  worte: (string | RegExp)[];
  antwort: (z: Zustand) => Omit<ChatAntwort, 'von' | 'kontext'> & { erwartet?: ChatKontext['erwartet']; neuesThema?: string; merke?: Record<string, string> };
  /** Antwort auf „Wie geht das?“ im laufenden Thema */
  anleitung?: string;
  ziel?: ChatLink;
}

interface Zustand {
  text: string;
  roh: string;
  b?: Benutzer;
  s: Store;
  k: ChatKontext;
  option?: string;
}

const normal = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ?!.,-]/g, ' ').replace(/\s+/g, ' ').trim();
const enthaelt = (t: string, w: string | RegExp) => typeof w === 'string' ? new RegExp(`(^|\\W)${normal(w)}`).test(t) : w.test(t);
const option = (wert: string, text: string, ...worte: string[]) => ({ wert, text, worte: [normal(text), ...worte.map(normal)] });
const anrede = (b?: Benutzer) => b ? (b.anrede === 'FRAU' ? `Frau ${b.nachname}` : b.anrede === 'HERR' ? `Herr ${b.nachname}` : `${b.vorname} ${b.nachname}`) : '';
const ANMELDEN: ChatLink = { text: 'Zur Anmeldung', ziel: '/anmelden' };

function oeffnungszeit(z: { wochentage: number[]; von: string; bis: string }, jetzt = new Date()): boolean {
  const hm = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
  return z.wochentage.includes(jetzt.getDay()) && hm >= z.von && hm < z.bis;
}

const THEMEN: Thema[] = [
  {
    id: 'KARTE', worte: ['karte', 'ersatzbescheinigung', 'gesundheitskarte', 'egk', 'versichertenkarte', /karte.*(verloren|gestohlen|weg|kaputt|defekt)/],
    ziel: { text: 'Gesundheitskarte verwalten', ziel: '/gesundheitskarte' },
    anleitung: 'Unter „Gesundheitskarte“ wählen Sie die Karte aus, klicken auf „Sperren“ und bestätigen den Grund. Danach können Sie direkt eine Ersatzkarte bestellen – bei Bedarf mit neuem Foto.',
    antwort: z => {
      if (z.option === 'ICH' || z.option === 'ANGEHOERIGE') {
        const fuer = z.option === 'ICH' ? 'Ihre Karte' : 'die Karte Ihres Angehörigen';
        return { text: `Verstanden. Sperren Sie ${fuer} bitte sofort, damit sie nicht missbraucht werden kann. Eine Ersatzkarte kommt in etwa 10 Tagen. Bis dahin stellen wir Ihrer Praxis auf Wunsch eine elektronische Ersatzbescheinigung aus. Wurde die Karte gestohlen?`,
          links: [{ text: 'Karte sperren', ziel: '/gesundheitskarte' }],
          erwartet: { frage: 'gestohlen', optionen: [option('JA_GESTOHLEN', 'Ja, gestohlen', 'ja', 'gestohlen', 'geklaut'), option('NEIN', 'Nein, verloren', 'nein', 'verloren', 'verlegt')] } };
      }
      if (z.option === 'JA_GESTOHLEN') return { text: 'Dann empfehlen wir zusätzlich eine Anzeige bei der Polizei. Ab dem zweiten Verlust im Jahr berechnen wir für die Ersatzkarte 5 €. Kann ich sonst noch etwas für Sie tun?', vorschlaege: ['Ersatzbescheinigung für die Praxis', 'Nein, danke'] };
      if (z.option === 'NEIN') return { text: 'Dann reicht die Sperre in der Online-Geschäftsstelle. Taucht die Karte wieder auf, verwenden Sie sie bitte nicht mehr. Kann ich sonst noch helfen?', vorschlaege: ['Nein, danke'] };
      if (/ersatzbescheinigung|praxis|arzt/.test(z.text)) return { text: 'Solange Sie keine Karte haben, senden wir Ihrer Arztpraxis auf Ihren Wunsch eine elektronische Ersatzbescheinigung – für das laufende Quartal. Das geht unter „Gesundheitskarte“ mit „Ersatzbescheinigung an Praxis senden“.', links: [{ text: 'Ersatzbescheinigung anfordern', ziel: z.b ? '/gesundheitskarte' : '/anmelden' }] };
      if (/(wann|versand|kommt|unterwegs|sendung)/.test(z.text)) return { text: z.b ? 'Den Versandstatus Ihrer Karte sehen Sie unter „Gesundheitskarte“ – inklusive Sendungsverfolgung. Die Produktion dauert in der Regel 7 bis 10 Tage.' : 'Die Produktion einer Karte dauert in der Regel 7 bis 10 Tage. Den Versandstatus sehen Sie nach der Anmeldung.', links: [z.b ? { text: 'Versandstatus', ziel: '/gesundheitskarte' } : ANMELDEN] };
      if (/foto|bild/.test(z.text)) return { text: 'Ein neues Foto laden Sie unter „Gesundheitskarte“ hoch (JPG oder PNG). Sie können dabei direkt eine neue Karte anfordern.', links: [{ text: 'Foto aktualisieren', ziel: '/gesundheitskarte' }] };
      if (/(verloren|gestohlen|weg|geklaut|kaputt|defekt)/.test(z.text)) {
        return { text: 'Das tut mir leid! Geht es um Ihre eigene Karte oder um die Karte eines mitversicherten Angehörigen?',
          erwartet: { frage: 'fuer', optionen: [option('ICH', 'Meine eigene', 'meine', 'ich', 'eigene', 'mir'), option('ANGEHOERIGE', 'Angehörige', 'kind', 'tochter', 'sohn', 'frau', 'mann', 'partner')] } };
      }
      return { text: 'Rund um die Gesundheitskarte kann ich Ihnen bei Verlust, Sperre, neuem Foto oder dem Versandstatus helfen. Worum geht es?', vorschlaege: ['Karte verloren', 'Neues Foto', 'Wann kommt meine Karte?'] };
    },
  },
  {
    id: 'BESCHEINIGUNG', worte: ['bescheinigung', 'nachweis', 'mitgliedsbescheinigung', 'versicherungsnachweis', 'bestaetigung', 'ehic', 'auslandskrankenschein'],
    ziel: { text: 'Bescheinigungen', ziel: '/dokumente' },
    anleitung: 'Unter „Dokumente“ wählen Sie die gewünschte Bescheinigung aus und klicken auf „PDF erstellen und herunterladen“. Das PDF ist sofort gültig.',
    antwort: z => {
      const arten: Record<string, string> = {
        MITGLIED: 'Die Mitgliedsbescheinigung erstellen Sie sofort als PDF – zum Beispiel für Behörden oder den Vermieter.',
        ARBEITGEBER: 'Die Versicherungsbestätigung für Ihren neuen Arbeitgeber erhalten Sie sofort als PDF. Ihr Arbeitgeber kann die Mitgliedschaft außerdem elektronisch bei uns abfragen.',
        HOCHSCHULE: 'Für die Hochschule melden wir Ihren Versicherungsstatus elektronisch. Den Nachweis können Sie zusätzlich als PDF herunterladen.',
        FINANZAMT: 'Die Beitragsbescheinigung für das Finanzamt steht Selbstzahlenden für die letzten vier Jahre zur Verfügung.',
        EHIC: 'Für Reisen in der EU nutzen Sie die Rückseite Ihrer Gesundheitskarte. Ist sie nicht dabei, erstellen wir eine provisorische Ersatzbescheinigung (bis 90 Tage).',
      };
      const art = z.option || (/(arbeitgeber|job|beschaeftigung)/.test(z.text) ? 'ARBEITGEBER' : /(uni|hochschule|studium)/.test(z.text) ? 'HOCHSCHULE' : /(finanzamt|steuer)/.test(z.text) ? 'FINANZAMT' : /(ehic|ausland|urlaub|reise)/.test(z.text) ? 'EHIC' : /mitglied/.test(z.text) ? 'MITGLIED' : undefined);
      if (art && arten[art]) return { text: arten[art] + (z.b ? '' : ' Melden Sie sich dazu bitte an.'), links: [z.b ? { text: 'Bescheinigung erstellen', ziel: '/dokumente' } : ANMELDEN] };
      return { text: 'Gern. Welche Bescheinigung benötigen Sie?',
        erwartet: { frage: 'art', optionen: [option('MITGLIED', 'Mitgliedsbescheinigung', 'mitglied'), option('ARBEITGEBER', 'Für den Arbeitgeber', 'arbeitgeber', 'job'), option('HOCHSCHULE', 'Für die Hochschule', 'uni', 'hochschule'),
          option('FINANZAMT', 'Für das Finanzamt', 'steuer', 'finanzamt'), option('EHIC', 'Für eine Auslandsreise', 'ausland', 'urlaub', 'reise', 'ehic')] } };
    },
  },
  {
    id: 'ERSTATTUNG', worte: ['rechnung', 'erstattung', 'erstatten', 'zahnreinigung', 'osteopath', 'impfung', 'brille', 'homoeopath', 'heilpraktiker', 'kostenuebernahme', 'zuschuss', 'geld zurueck'],
    ziel: { text: 'Rechnung einreichen', ziel: '/erstattung' },
    anleitung: 'Unter „Kostenerstattung“ wählen Sie die Leistung, tragen Rechnungsdatum, -nummer und Betrag ein und laden ein Foto oder PDF der Rechnung hoch. Den voraussichtlichen Erstattungsbetrag sehen Sie schon während der Eingabe.',
    antwort: z => {
      const regel = ERSTATTUNGEN.find(r => normal(r.bezeichnung).split(/[ /]+/).some(w => w.length > 4 && z.text.includes(w.substring(0, 6))) || (z.option && r.code === z.option))
        ?? ERSTATTUNGEN.find(r => r.code === z.k.merke?.['leistung']);
      if (regel) {
        const tarif = z.b?.tarif;
        const info = tarif
          ? `In Ihrem Tarif ${tarif.charAt(0) + tarif.slice(1).toLowerCase()} erstatten wir ${regel.quote[tarif]} % bis zu ${euro(regel.jahresMax[tarif])} im Jahr.`
          : `Je nach Tarif erstatten wir ${regel.quote.BASIS}–${regel.quote.PREMIUM} % (Basis bis Premium).`;
        return { text: `${regel.bezeichnung}: ${info}${regel.quote[tarif || 'BASIS'] === 0 ? ' Ein Wechsel in einen höheren Tarif lohnt sich hier.' : ' Reichen Sie die Rechnung einfach online ein – die Auszahlung erfolgt meist innerhalb weniger Tage.'}`,
          links: [{ text: 'Rechnung einreichen', ziel: z.b ? '/erstattung' : '/anmelden' }], merke: { leistung: regel.code } };
      }
      return { text: 'Für welche Leistung möchten Sie eine Rechnung einreichen?',
        erwartet: { frage: 'leistung', optionen: ERSTATTUNGEN.slice(0, 6).map(r => option(r.code, r.bezeichnung, ...normal(r.bezeichnung).split(/[ /]+/).filter(w => w.length > 4))) } };
    },
  },
  {
    id: 'STATUS', worte: ['status', 'wo steht', 'bearbeitungsstand', 'stand meines', 'wie lange dauert', 'noch nichts gehoert', 'antwort', 'entscheidung', /mein(en)? (antrag|vorgang)/],
    ziel: { text: 'Meine Vorgänge', ziel: '/vorgaenge' },
    antwort: z => {
      if (!z.b) return { text: 'Den Stand Ihrer Anträge kann ich Ihnen nach der Anmeldung zeigen.', links: [ANMELDEN] };
      const offen = z.s.vorgaenge.filter(v => v.benutzerId === z.b!.id && ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE'].includes(v.status)).sort((x, y) => y.erstelltAm.localeCompare(x.erstelltAm));
      if (!offen.length) return { text: 'Sie haben derzeit keine offenen Vorgänge. Ihre abgeschlossenen Anträge finden Sie unter „Meine Vorgänge“.', links: [{ text: 'Meine Vorgänge', ziel: '/vorgaenge' }] };
      const zeilen = offen.slice(0, 3).map(v => `• ${v.titel} (${v.vorgangsnummer}): ${STATUS_TEXT[v.status] || v.status}${v.status === 'RUECKFRAGE' ? ' – wir warten auf Unterlagen von Ihnen' : ''}`);
      const rueckfrage = offen.find(v => v.status === 'RUECKFRAGE');
      return { text: `Sie haben ${offen.length} offene${offen.length === 1 ? 'n Vorgang' : ' Vorgänge'}:\n${zeilen.join('\n')}`,
        links: rueckfrage ? [{ text: 'Unterlagen nachreichen', ziel: `/vorgaenge/${rueckfrage.id}` }] : [{ text: 'Alle Vorgänge', ziel: '/vorgaenge' }] };
    },
  },
  {
    id: 'KRANK', worte: ['krankmeldung', 'krankgeschrieben', 'krank geschrieben', 'arbeitsunfaehig', ' au ', 'krankschreibung', 'krankengeld', 'gelber schein'],
    ziel: { text: 'Krankmeldung', ziel: '/krankmeldung' },
    anleitung: 'Ihre Arztpraxis übermittelt die Arbeitsunfähigkeit elektronisch an uns – Ihr Arbeitgeber ruft sie dort ab. Selbst erfassen müssen Sie nur Bescheinigungen aus dem Ausland oder von Privatärzten.',
    antwort: z => /krankengeld/.test(z.text)
      ? { text: 'Krankengeld zahlen wir, wenn Sie länger als sechs Wochen arbeitsunfähig sind – 70 % des Bruttos, höchstens 90 % des Nettos. Zahlungen und Bescheinigungen finden Sie im Bereich Krankengeld.', links: [{ text: 'Krankengeld', ziel: z.b ? '/krankengeld' : '/anmelden' }] }
      : { text: 'Gute Besserung! In den meisten Fällen müssen Sie nichts tun: Die Praxis sendet die Krankmeldung elektronisch an uns. Möchten Sie trotzdem eine Bescheinigung selbst einreichen?',
        erwartet: { frage: 'selbst', optionen: [option('JA', 'Ja, selbst einreichen', 'ja', 'einreichen'), option('NEIN', 'Nein, danke', 'nein')] } },
  },
  {
    id: 'MITGLIEDSCHAFT', worte: ['mitglied werden', 'wechseln', 'wechsel', 'beitreten', 'kuendigen', 'kuendigung', 'mitgliedschaft', 'versichern lassen'],
    ziel: { text: 'Mitglied werden', ziel: '/mitglied-werden' },
    antwort: z => {
      if (z.option === 'WECHSEL' || (!z.option && /(wechsel|mitglied werden|beitreten|versichern lassen)/.test(z.text))) {
        return { text: 'Schön, dass Sie zu uns möchten! Der Wechsel dauert online nur wenige Minuten. Ihre bisherige Kasse und Ihren Arbeitgeber informieren wir. Beachten Sie die Bindungsfrist von 12 Monaten bei Ihrer bisherigen Kasse.', links: [{ text: 'Jetzt Mitglied werden', ziel: '/mitglied-werden' }] };
      }
      if (z.option === 'KUENDIGUNG' || /(kuendig|beenden)/.test(z.text)) {
        return { text: 'Schade! Wechseln Sie zu einer anderen gesetzlichen Kasse, müssen Sie nicht kündigen – das übernimmt die neue Kasse. Eine Kündigung brauchen Sie nur beim Wechsel in die private Versicherung oder bei Wegzug ins Ausland.', links: [{ text: 'Kündigung', ziel: z.b ? '/antraege/neu/KUENDIGUNG' : '/anmelden' }] };
      }
      return { text: 'Möchten Sie Mitglied der VitaPlus werden oder Ihre Mitgliedschaft beenden?',
        erwartet: { frage: 'richtung', optionen: [option('WECHSEL', 'Mitglied werden', 'werden', 'beitreten', 'wechseln'), option('KUENDIGUNG', 'Mitgliedschaft beenden', 'beenden', 'kuendigen', 'austreten')] } };
    },
  },
  {
    id: 'FAMILIE', worte: ['familienversicherung', 'familienversichert', 'mitversichern', 'mitversichert', 'kind anmelden', 'ehepartner', 'ehefrau', 'ehemann'],
    ziel: { text: 'Familie', ziel: '/familie' },
    anleitung: 'Unter „Familie“ klicken Sie auf „Angehörige anmelden“, geben die Daten ein und bestätigen, dass Ihr Angehöriger nicht anderweitig versichert ist und höchstens 565 € im Monat verdient.',
    antwort: z => ({ text: 'Ehe- und Lebenspartner sowie Kinder sind beitragsfrei mitversichert, wenn sie höchstens 565 € im Monat verdienen (Minijob 603 €) und nicht selbst versichert sind. Kinder bis 18, in Ausbildung bis 25 Jahre.', links: [{ text: 'Angehörige anmelden', ziel: z.b ? '/familie' : '/anmelden' }] }),
  },
  {
    id: 'GEBURT', worte: ['baby', 'geburt', 'schwanger', 'entbindung', 'mutterschaftsgeld', 'neugeboren'],
    ziel: { text: 'Geburt melden', ziel: '/antraege/neu/GEBURT' },
    antwort: z => /schwanger|mutterschaft/.test(z.text)
      ? { text: 'Herzlichen Glückwunsch! Während der Schwangerschaft übernehmen wir alle Vorsorgeuntersuchungen und Hebammenhilfe. Mutterschaftsgeld beantragen Sie online mit dem Zeugnis über den Entbindungstermin.', links: [{ text: 'Mutterschaftsgeld beantragen', ziel: z.b ? '/antraege/neu/MUTTERSCHAFTSGELD' : '/anmelden' }] }
      : { text: 'Herzlichen Glückwunsch zum Nachwuchs! Melden Sie die Geburt online – Ihr Kind ist dann ab Geburt familienversichert und erhält eine eigene Gesundheitskarte.', links: [{ text: 'Geburt melden', ziel: z.b ? '/antraege/neu/GEBURT' : '/anmelden' }] },
  },
  {
    id: 'BEITRAG', worte: ['beitrag', 'beitraege', 'zusatzbeitrag', 'beitragssatz', 'was kostet', 'kosten mich', 'zahlen', 'lastschrift', 'mahnung', 'rueckstand'],
    ziel: { text: 'Beiträge', ziel: '/beitraege' },
    antwort: z => {
      if (z.b && ['SELBSTSTAENDIG', 'STUDENT', 'RENTNER'].includes(z.b.beschaeftigung)) {
        const k = kontostand(z.s, z.b.id);
        return { text: `Unser Zusatzbeitrag beträgt 2,49 %. ${k.offen > 0 ? `Auf Ihrem Beitragskonto ist derzeit ${euro(k.offen)} offen.` : 'Ihr Beitragskonto ist ausgeglichen.'} Details und Zahlungen sehen Sie unter „Beiträge“.`, links: [{ text: 'Beitragskonto', ziel: '/beitraege' }] };
      }
      return { text: 'Der allgemeine Beitragssatz beträgt 14,6 %, dazu kommt unser Zusatzbeitrag von 2,49 %. Als Beschäftigte/r tragen Sie die Hälfte, den Rest Ihr Arbeitgeber – er führt den Beitrag auch ab.', links: [{ text: 'Beitrag berechnen', ziel: '/rechner/beitrag' }] };
    },
  },
  {
    id: 'BONUS', worte: ['bonus', 'punkte', 'praemie', 'bonusprogramm', 'vorsorge', 'check-up', 'checkup'],
    ziel: { text: 'Bonusprogramm', ziel: '/bonus' },
    antwort: z => {
      const jahr = new Date().getFullYear();
      if (z.b) {
        const punkte = z.s.bonus.filter(e => e.benutzerId === z.b!.id && e.datum.startsWith(String(jahr)) && e.status !== 'ABGELEHNT').reduce((s, e) => s + e.punkte, 0);
        return { text: `Sie haben ${jahr} bisher ${punkte} Bonuspunkte gesammelt${punkte >= 500 ? ' – genug für eine Prämie' : ` – noch ${500 - punkte} bis zur ersten Prämie`}. Jeder Punkt ist 10 Cent wert.`, links: [{ text: 'Zum Bonusprogramm', ziel: '/bonus' }] };
      }
      return { text: 'In unserem Bonusprogramm sammeln Sie Punkte für Vorsorge, Sport und Impfungen. Ab 500 Punkten zahlen wir aus – 10 Cent pro Punkt, als Gesundheitsbudget sogar 20 % mehr.', links: [ANMELDEN] };
    },
  },
  {
    id: 'PFLEGE', worte: ['pflege', 'pflegegrad', 'pflegegeld', 'pflegedienst', 'verhinderungspflege', 'kurzzeitpflege', 'entlastungsbetrag', 'pflegebeduerftig'],
    ziel: { text: 'Pflege', ziel: '/pflege' },
    anleitung: 'Den Pflegegrad beantragen Sie online – für sich oder einen Angehörigen. Danach vereinbart der Medizinische Dienst einen Begutachtungstermin. Die Leistungen gelten ab dem Monat der Antragstellung.',
    antwort: z => ({ text: 'Bei Pflegebedürftigkeit stellen Sie zuerst einen Antrag auf einen Pflegegrad. Je nach Grad gibt es Pflegegeld, Sachleistungen und den Entlastungsbetrag von 131 € im Monat. Gern berät Sie auch unsere Pflegeberatung.', links: [{ text: 'Pflegegrad beantragen', ziel: z.b ? '/antraege/neu/PFLEGEGRAD' : '/anmelden' }, { text: 'Pflegeberatung', ziel: z.b ? '/termine' : '/kontakt' }] }),
  },
  {
    id: 'ADRESSE', worte: ['adresse', 'persoenliche daten', 'umzug', 'umgezogen', 'anschrift', 'neue wohnung', 'telefonnummer', 'e-mail aendern', 'bankverbindung', 'iban', 'konto aendern', 'name geaendert', 'geheiratet'],
    ziel: { text: 'Persönliche Daten', ziel: '/profil' },
    anleitung: 'Unter „Persönliche Daten“ wählen Sie den passenden Reiter (Adresse, Telefon & E-Mail, Bankverbindung) und speichern die Änderung. Eine Bestätigung erhalten Sie in Ihr Postfach.',
    antwort: z => /(geheiratet|name)/.test(z.text)
      ? { text: 'Herzlichen Glückwunsch! Ihren neuen Namen ändern Sie unter „Persönliche Daten“ mit einem Nachweis (z. B. Heiratsurkunde). Sie erhalten danach automatisch eine neue Gesundheitskarte.', links: [{ text: 'Namensänderung', ziel: z.b ? '/profil' : '/anmelden' }] }
      : { text: 'Ihre Daten ändern Sie direkt unter „Persönliche Daten“ – die Änderung gilt sofort.', links: [{ text: 'Daten ändern', ziel: z.b ? '/profil' : '/anmelden' }] },
  },
  {
    id: 'LOGIN', worte: ['passwort', 'kennwort', 'anmelden', 'einloggen', 'login', 'gesperrt', 'registrieren', 'zugang', 'sms code', 'sicherheitscode'],
    ziel: { text: 'Passwort vergessen', ziel: '/passwort-vergessen' },
    antwort: z => /(registr|zugang einricht|kein zugang)/.test(z.text)
      ? { text: 'Für die Registrierung brauchen Sie Ihre Versichertennummer (auf der Gesundheitskarte) und Ihr Geburtsdatum. Ihre Identität bestätigen Sie mit Online-Ausweis, GesundheitsID oder per Brief.', links: [{ text: 'Registrieren', ziel: '/registrieren' }] }
      : { text: 'Über „Passwort vergessen“ setzen Sie Ihr Passwort mit E-Mail-Adresse und Geburtsdatum zurück – damit wird ein gesperrter Zugang auch wieder entsperrt.', links: [{ text: 'Passwort vergessen', ziel: '/passwort-vergessen' }] },
  },
  {
    id: 'ANTRAG', worte: ['antrag', 'antraege', 'beantragen', 'formular', 'reha', 'kur', 'zahnersatz', 'haushaltshilfe', 'hilfsmittel', 'fahrkosten', 'zuzahlung', 'befreiung', 'widerspruch', 'kieferorthop', 'kuenstliche befruchtung', 'diga', 'app auf rezept'],
    ziel: { text: 'Antragscenter', ziel: '/antraege' },
    antwort: z => {
      const treffer = FORMULARE.filter(f => !f.oeffentlich && (f.suchbegriffe.some(s => z.text.includes(normal(s))) || z.text.includes(normal(f.kurz))));
      if (treffer.length === 1) {
        const f = treffer[0];
        return { text: `Den Antrag „${f.titel}“ stellen Sie online in wenigen Schritten. Die Bearbeitung dauert in der Regel bis zu ${f.bearbeitungTage} Tage.${f.hinweis ? ' ' + f.hinweis : ''}`, links: [{ text: f.titel, ziel: z.b ? `/antraege/neu/${f.code}` : '/anmelden' }] };
      }
      if (treffer.length > 1) {
        return { text: 'Dazu gibt es mehrere Anträge. Welchen meinen Sie?',
          erwartet: { frage: 'antrag', optionen: treffer.slice(0, 4).map(f => option(f.code, f.kurz, ...f.suchbegriffe)) } };
      }
      if (z.option) {
        const f = FORMULARE.find(x => x.code === z.option);
        if (f) return { text: `„${f.titel}“ – hier geht es direkt zum Antrag.`, links: [{ text: f.titel, ziel: z.b ? `/antraege/neu/${f.code}` : '/anmelden' }] };
      }
      return { text: 'Wir haben über 40 Anträge online – von Haushaltshilfe bis Zahnersatz. Worum geht es denn?', vorschlaege: ['Reha', 'Zahnersatz', 'Fahrkosten', 'Zuzahlungsbefreiung'], links: [{ text: 'Alle Anträge', ziel: z.b ? '/antraege' : '/anmelden' }] };
    },
  },
  {
    id: 'AUSLAND', worte: ['ausland', 'urlaub', 'reise', 'reisen', 'auslandsreise'],
    ziel: { text: 'Leistungen im Ausland', ziel: '/leistungen' },
    antwort: () => ({ text: 'In der EU, im EWR und in der Schweiz gilt Ihre Gesundheitskarte (Rückseite). Außerhalb dieser Länder empfehlen wir eine private Auslandsreise-Krankenversicherung. Reiseschutzimpfungen erstatten wir je nach Tarif.', vorschlaege: ['Reiseimpfung erstatten', 'Ersatzbescheinigung für die Reise'] }),
  },
  {
    id: 'BESCHWERDE', worte: ['beschwerde', 'beschweren', 'unzufrieden', 'frechheit', 'unverschaemt', 'schlechter service', 'aergern', 'aergerlich'],
    ziel: { text: 'Beschwerde einreichen', ziel: '/antraege/neu/BESCHWERDE' },
    antwort: z => ({ text: 'Das tut mir leid – Ihr Ärger ist verständlich. Schildern Sie uns den Fall gern über unser Beschwerdeformular, unser Beschwerdemanagement meldet sich innerhalb von zwei Werktagen. Oder möchten Sie direkt mit jemandem sprechen?', links: [{ text: 'Beschwerde einreichen', ziel: z.b ? '/antraege/neu/BESCHWERDE' : '/kontakt' }], vorschlaege: ['Mit Mitarbeiter sprechen'] }),
  },
  {
    id: 'KONTAKT', worte: ['mitarbeiter', 'kontakt', 'mensch', 'berater', 'persoenlich', 'anrufen', 'telefon', 'rueckruf', 'filiale', 'geschaeftsstelle vor ort', 'termin', 'sprechen'],
    antwort: () => ({ text: '', uebergabe: true }),
  },
];

/** ELIZA-Spiegelung: Ich-Aussagen werden in Sie-Form zurückgegeben */
const SPIEGEL: [RegExp, string][] = [
  [/\bich bin\b/g, 'Sie sind'], [/\bich habe\b/g, 'Sie haben'], [/\bich\b/g, 'Sie'], [/\bmich\b/g, 'sich'], [/\bmir\b/g, 'Ihnen'],
  [/\bmein\b/g, 'Ihr'], [/\bmeine\b/g, 'Ihre'], [/\bmeinen\b/g, 'Ihren'], [/\bmeinem\b/g, 'Ihrem'], [/\bmeiner\b/g, 'Ihrer'],
  [/\bbin\b/g, 'sind'], [/\bhabe\b/g, 'haben'], [/\bdu\b/g, 'ich'], [/\bdir\b/g, 'mir'], [/\bdich\b/g, 'mich'], [/\bdein\b/g, 'mein'],
];

function spiegeln(t: string): string {
  let r = ` ${t.replace(/[.!?]+$/, '')} `;
  for (const [m, e] of SPIEGEL) r = r.replace(m, `\u0000${e}\u0000`);
  return r.replace(/\u0000/g, '').trim();
}

const ELIZA: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/(suizid|umbringen|nicht mehr leben|selbstmord|das leben beenden)/i, () => 'Es tut mir sehr leid, dass es Ihnen so schlecht geht. Bitte sprechen Sie sofort mit jemandem: Die Telefonseelsorge ist rund um die Uhr kostenfrei erreichbar unter 0800 111 0 111 oder 0800 111 0 222. Im Notfall wählen Sie 112.'],
  [/\b(schmerzen|fieber|notfall|unfall|blutet|atemnot)\b/i, () => 'Das klingt ernst. Bei akuten Beschwerden wenden Sie sich bitte an Ihre Arztpraxis oder an den ärztlichen Bereitschaftsdienst unter 116 117 – im Notfall wählen Sie 112. Kann ich Ihnen danach bei etwas Organisatorischem helfen?'],
  [/\bich bin (so |sehr |total |ganz )?(traurig|einsam|verzweifelt|ueberfordert|gestresst|erschoepft|frustriert|wuetend|verunsichert)\b/i, m => `Das tut mir leid. Was macht Sie ${m[2] === 'wuetend' ? 'wütend' : m[2] === 'ueberfordert' ? 'überfordert' : m[2] === 'erschoepft' ? 'erschöpft' : m[2]}?`],
  [/\bich fuehle mich (.+)/i, () => ''],
  [/\bich bin (.+)/i, () => ''],
  [/\bich habe angst\b(.*)/i, () => 'Angst ist ein belastendes Gefühl. Wovor genau haben Sie Angst – geht es um Ihre Gesundheit, um Kosten oder um einen Antrag?'],
  [/\bich (weiss nicht|verstehe nicht|bin unsicher|komme nicht weiter)\b/i, () => 'Kein Problem, wir finden das gemeinsam heraus. Wobei kommen Sie gerade nicht weiter?'],
  [/\b(mein|meine) (mutter|vater|mann|frau|kind|tochter|sohn|oma|opa|partner|partnerin)\b/i, m => {
    const wer = m[2];
    const maennlich = /^(mann|vater|sohn|opa|partner)$/.test(wer);
    const artikel = wer === 'kind' ? 'Ihr' : maennlich ? 'Ihren' : 'Ihre';
    const name = wer.charAt(0).toUpperCase() + wer.slice(1);
    return `Erzählen Sie mir mehr über ${artikel} ${name}. Geht es um eine Versicherung, Pflege oder einen Antrag für ${wer === 'kind' ? 'Ihr Kind' : maennlich ? 'ihn' : 'sie'}?`;
  }],
  [/\bweil\b/i, () => 'Ist das der einzige Grund? Erzählen Sie gern mehr – vielleicht kann ich Ihnen weiterhelfen.'],
  [/^(nein|ne|nee|noe)\b/i, () => 'In Ordnung. Wobei kann ich Ihnen stattdessen helfen?'],
  [/\b(immer|nie|niemals|jedes mal)\b/i, () => 'Können Sie mir ein konkretes Beispiel nennen?'],
];

const SMALLTALK: [RegExp, string][] = [
  [/^(hallo|hi|hey|guten (morgen|tag|abend)|moin|servus|gruess gott)\b/, 'Hallo! Wie kann ich Ihnen helfen?'],
  [/\b(danke|vielen dank|dankeschoen|super|prima|perfekt|klasse)\b/, 'Gern geschehen! Kann ich sonst noch etwas für Sie tun?'],
  [/\b(tschuess|auf wiedersehen|bis bald|ciao|nein,? danke)\b/, 'Gern geschehen – ich wünsche Ihnen alles Gute und bleiben Sie gesund!'],
  [/\b(wer bist du|bist du ein (mensch|bot|roboter)|was kannst du)\b/, 'Ich bin der digitale Assistent der VitaPlus – ein Computerprogramm. Ich beantworte Fragen zu Mitgliedschaft, Bescheinigungen, Erstattungen und Anträgen und zeige Ihnen den richtigen Weg im Portal. Für alles andere verbinde ich Sie mit unserem Kundenservice.'],
  [/\b(idiot|bloed|dumm|scheiss|mist)\b/, 'Ich merke, dass Sie verärgert sind. Das tut mir leid. Sagen Sie mir, worum es geht – oder ich verbinde Sie mit einer Kollegin oder einem Kollegen.'],
];

const EINSTIEG = ['Karte verloren', 'Bescheinigung herunterladen', 'Rechnung einreichen', 'Wo steht mein Antrag?', 'Mitglied werden'];

function uebergabe(k: ChatKontext): ChatAntwort {
  const offen = oeffnungszeit(SERVICEZEITEN.chat);
  return offen
    ? { von: 'BOT', text: 'Gern verbinde ich Sie mit einer Kollegin oder einem Kollegen aus dem Kundenservice. Die Wartezeit beträgt derzeit etwa 2 Minuten.', uebergabe: true, kontext: { ...k, erwartet: undefined } }
    : { von: 'BOT', text: 'Unser Live-Chat ist Mo–Fr von 8 bis 18 Uhr besetzt. Gern rufen wir Sie zu Ihrer Wunschzeit zurück, oder Sie vereinbaren einen Termin – telefonisch, per Video oder in der Geschäftsstelle.',
      links: [{ text: 'Rückruf vereinbaren', ziel: '/antraege/neu/RUECKRUF' }, { text: 'Termin buchen', ziel: '/termine' }, { text: 'Kontakt', ziel: '/kontakt' }], kontext: { ...k, erwartet: undefined } };
}

export function begruessung(b?: Benutzer): ChatAntwort {
  const tageszeit = new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Guten Tag' : 'Guten Abend';
  return { von: 'BOT', text: `${tageszeit}${b ? ', ' + anrede(b) : ''}! Ich bin der digitale Assistent der VitaPlus. Stellen Sie mir Ihre Frage in eigenen Worten – oder wählen Sie ein Thema:`, vorschlaege: EINSTIEG, kontext: {} };
}

function themaErkennen(t: string): Thema[] {
  // Gewichtung nach Länge der Treffer: spezifische Begriffe („Zahnreinigung“) schlagen allgemeine („was kostet“)
  const gewicht = (w: string | RegExp) => typeof w === 'string' ? normal(w).length : 12;
  const punkte = THEMEN.map(th => ({ th, p: th.worte.filter(w => enthaelt(` ${t} `, w)).reduce((s, w) => s + gewicht(w), 0) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p);
  if (!punkte.length) return [];
  return punkte.filter(x => x.p === punkte[0].p).map(x => x.th);
}

export function antworten(roh: string, kontextEin: ChatKontext | undefined, s: Store, b?: Benutzer): ChatAntwort {
  const k: ChatKontext = { ...(kontextEin || {}), verlauf: [...(kontextEin?.verlauf || []), roh].slice(-6) };
  const t = normal(roh);
  const z: Zustand = { text: t, roh, b, s, k };

  // 1) Antwort auf eine offene Rückfrage des Assistenten
  if (k.erwartet && k.thema) {
    const nummer = Number(t.match(/^\d$/)?.[0]);
    const treffer = k.erwartet.optionen.find((o, i) => nummer === i + 1 || o.worte.some(w => w && (t === w || t.includes(w))));
    if (treffer) {
      const thema = THEMEN.find(x => x.id === k.thema)!;
      if (k.thema === 'KRANK' && k.erwartet.frage === 'selbst') {
        return treffer.wert === 'JA'
          ? { von: 'BOT', text: 'Dann erfassen Sie die Bescheinigung unter „Krankmeldung“ und laden ein Foto davon hoch. Bitte reichen Sie sie innerhalb einer Woche ein.', links: [{ text: 'Krankmeldung erfassen', ziel: b ? '/krankmeldung' : '/anmelden' }], kontext: { ...k, erwartet: undefined, unverstanden: 0 } }
          : { von: 'BOT', text: 'Alles klar. Werden Sie schnell wieder gesund! Kann ich sonst noch helfen?', kontext: { ...k, erwartet: undefined, unverstanden: 0 } };
      }
      return ausThema(thema, { ...z, option: treffer.wert });
    }
  }

  // 2) Krisen- und Gesundheitshinweise haben Vorrang
  for (const [m, f] of ELIZA.slice(0, 2)) if (m.test(t)) return { von: 'BOT', text: f(t.match(m)!), kontext: { ...k, erwartet: undefined } };

  // 3) Anschlussfragen im laufenden Thema
  const aktuell = THEMEN.find(x => x.id === k.thema);
  const neuesThema = themaErkennen(t).length > 0;
  if (aktuell && !neuesThema && /^(wie geht das|wie mache ich das|wie funktioniert das|und wie|wie denn|wo finde ich das|wo genau|und wo)\??$/.test(t)) {
    return { von: 'BOT', text: aktuell.anleitung || 'Am einfachsten über den folgenden Link – dort führen wir Sie Schritt für Schritt durch.', links: aktuell.ziel ? [aktuell.ziel] : undefined, kontext: { ...k, erwartet: undefined } };
  }
  if (aktuell && !neuesThema && /^(und )?(fuer|bei) (meine|meinen|mein|meinem|meiner) (tochter|sohn|kind|kinder|frau|mann|partner|partnerin|mutter|vater)\b/.test(t)) {
    const r = ausThema(aktuell, { ...z, text: `${t} ${aktuell.worte.find(w => typeof w === 'string')}` });
    return { ...r, text: `Für Angehörige gilt dasselbe: ${r.text}` };
  }
  if (aktuell && !neuesThema && /^(und |auch )?(fuer|bei|zum|zur|fuers) /.test(t)) return ausThema(aktuell, z);

  // 4) Smalltalk
  for (const [m, antwort] of SMALLTALK) if (m.test(t) && !themaErkennen(t).length) {
    const ende = /tschuess|auf wiedersehen|bis bald|ciao|nein,? danke/.test(t);
    return { von: 'BOT', text: antwort, vorschlaege: ende || /^(hallo|hi|hey|guten|moin|servus)/.test(t) ? (ende ? undefined : EINSTIEG) : undefined, kontext: ende ? {} : { ...k, erwartet: undefined } };
  }

  // 5) Anliegen erkennen
  const themen = themaErkennen(t);
  if (themen.length === 1) return ausThema(themen[0], z);
  if (themen.length > 1) {
    const namen: Record<string, string> = { KARTE: 'Gesundheitskarte', BESCHEINIGUNG: 'Bescheinigungen', ERSTATTUNG: 'Rechnung/Erstattung', STATUS: 'Stand meines Antrags', KRANK: 'Krankmeldung', MITGLIEDSCHAFT: 'Mitgliedschaft',
      FAMILIE: 'Familienversicherung', GEBURT: 'Schwangerschaft & Geburt', BEITRAG: 'Beiträge', BONUS: 'Bonusprogramm', PFLEGE: 'Pflege', ADRESSE: 'Persönliche Daten', LOGIN: 'Anmeldung & Passwort', ANTRAG: 'Anträge',
      AUSLAND: 'Ausland', BESCHWERDE: 'Beschwerde', KONTAKT: 'Kontakt' };
    return { von: 'BOT', text: `Ich bin nicht ganz sicher, was Sie meinen. Geht es um ${themen.slice(0, 3).map(x => `„${namen[x.id]}“`).join(' oder ')}?`, vorschlaege: themen.slice(0, 3).map(x => namen[x.id]), kontext: { ...k, erwartet: undefined } };
  }

  // 6) Gesprächsführung (ELIZA)
  for (const [m, f] of ELIZA.slice(2)) {
    const treffer = t.match(m);
    if (!treffer) continue;
    let text = f(treffer);
    if (!text) {
      const rest = spiegeln(roh.replace(/^.*?\b(ich fühle mich|ich fuehle mich|ich bin)\b/i, '').trim());
      text = /fuehle|fühle/i.test(roh) ? `Warum fühlen Sie sich ${rest}?` : `Seit wann sind Sie ${rest}? Und wie kann ich Ihnen dabei helfen?`;
    }
    return { von: 'BOT', text, kontext: { ...k, erwartet: undefined, unverstanden: 0 } };
  }

  // 7) FAQ-Suche
  const worte = t.split(/\W+/).filter(w => w.length > 3);
  const faq = s.inhalte.faq.filter(f => f.sichtbar)
    .map(f => ({ f, p: worte.filter(w => normal(f.frage + ' ' + f.antwort).includes(w)).length }))
    .sort((x, y) => y.p - x.p)[0];
  if (faq && faq.p >= 2) return { von: 'BOT', text: faq.f.antwort, links: [{ text: 'Mehr in der Hilfe', ziel: `/hilfe?faq=${faq.f.id}` }], kontext: { ...k, erwartet: undefined, unverstanden: 0 } };

  // 8) Nicht verstanden: zuerst nachfragen, dann Übergabe anbieten
  const n = (k.unverstanden || 0) + 1;
  if (n >= 3) return { ...uebergabe(k), text: 'Ich komme hier leider nicht weiter. ' + uebergabe(k).text, kontext: { ...k, unverstanden: 0, erwartet: undefined } };
  const gespiegelt = /\b(ich|mein|meine|mir|mich)\b/i.test(roh) ? `Sie sagen „${spiegeln(roh)}“ – ` : '';
  return { von: 'BOT', text: `${gespiegelt}${n === 1 ? 'das habe ich noch nicht ganz verstanden. Können Sie es mit anderen Worten beschreiben? Oft hilft ein Stichwort wie „Rechnung“, „Karte“ oder „Bescheinigung“.' : 'ich bin mir leider immer noch unsicher. Geht es um eines dieser Themen?'}`,
    vorschlaege: n === 2 ? [...EINSTIEG.slice(0, 3), 'Mit Mitarbeiter sprechen'] : undefined, kontext: { ...k, unverstanden: n, erwartet: undefined } };
}

function ausThema(th: Thema, z: Zustand): ChatAntwort {
  if (th.id === 'KONTAKT') return uebergabe({ ...z.k, thema: undefined });
  const r = th.antwort(z);
  const { erwartet, neuesThema, merke, ...rest } = r;
  const vorschlaege = erwartet ? erwartet.optionen.map(o => o.text) : rest.vorschlaege;
  const thema = neuesThema || th.id;
  return { von: 'BOT', ...rest, vorschlaege, kontext: { ...z.k, thema, erwartet, unverstanden: 0, merke: thema === z.k.thema ? { ...z.k.merke, ...merke } : merke } };
}

export function liveAntwort(roh: string, b?: Benutzer): ChatAntwort {
  const t = normal(roh);
  const name = 'Jana (Kundenservice)';
  if (/^live-chat starten$/.test(t)) return { von: 'MITARBEITER', name, text: `Hallo${b ? ' ' + anrede(b) : ''}, hier ist Jana vom VitaPlus-Kundenservice. Wie kann ich Ihnen helfen?`, kontext: {} };
  if (/(danke|tschuess|auf wiedersehen)/.test(t)) return { von: 'MITARBEITER', name, text: 'Sehr gern! Ich wünsche Ihnen einen schönen Tag. Den Chat können Sie jetzt schließen.', kontext: {} };
  return { von: 'MITARBEITER', name, text: `Danke für die Information. Ich habe Ihr Anliegen notiert${b ? ' und in Ihrer Kundenakte vermerkt' : ''}. Eine Kollegin aus dem Fachbereich meldet sich innerhalb von zwei Werktagen${b ? ' über Ihr Postfach' : ' bei Ihnen'}. Kann ich sonst noch etwas tun?`, kontext: {} };
}

