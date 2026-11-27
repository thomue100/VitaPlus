import { RUECKFRAGE_FRIST_TAGE, STATUS_TEXT, VERARBEITUNG, VORGANG_TYP_TEXT } from '../konfiguration';
import { formular, alleFelder } from '../formulare/formular-katalog';
import { Store, Vorgang } from '../models';
import { addTage, toIso } from '../util/datum';
import { Anfrage, anrede, euro, postfachNachricht, statusSetzen, voller } from './api-kontext';
import { BETRAGS_TYPEN, Entscheidung, entscheidungTreffen } from './handler-sachbearbeitung';

/**
 * Hintergrundverarbeitung für online eingegangene Anliegen.
 *
 * Spur DUNKEL: regelbasierte Entscheidung ohne menschliche Prüfung.
 * Spur SACHBEARBEITUNG: das zuständige Team übernimmt den Vorgang, stellt ggf. eine Rückfrage und entscheidet.
 * Vorgänge, die eine Sachbearbeiterin oder ein Sachbearbeiter manuell übernommen hat, bleiben unberührt.
 */
export function hintergrundverarbeitung(store: Store): void {
  if (!VERARBEITUNG.aktiv) return;
  nachrichtenBeantworten(store);
  const jetzt = Date.now();
  const a: Anfrage = { methode: 'INTERN', pfad: '', params: {}, query: new URLSearchParams(), body: {}, token: null, store };
  for (const v of store.vorgaenge) {
    const ver = v.verarbeitung;
    if (!ver || ver.manuell) continue;
    const seitAenderung = (jetzt - zeitpunkt(v.geaendertAm)) / 1000;
    const seitEingang = (jetzt - ver.eingang) / 1000;
    try {
      if (v.status === 'EINGEREICHT') {
        if (ver.spur === 'DUNKEL' && seitEingang >= VERARBEITUNG.dunkelEntscheidungNachSek) automatischEntscheiden(a, v, 'DUNKEL');
        else if (ver.spur === 'SACHBEARBEITUNG' && seitEingang >= VERARBEITUNG.zuweisungNachSek) zuweisen(a, v);
      } else if (v.status === 'IN_BEARBEITUNG') {
        const nachgereicht = v.historie.at(-1)?.text.startsWith('Unterlagen nachgereicht');
        const wartezeit = nachgereicht ? VERARBEITUNG.nachNachreichungSek : VERARBEITUNG.sachbearbeitungEntscheidungNachSek - VERARBEITUNG.zuweisungNachSek;
        if (seitAenderung >= wartezeit) automatischEntscheiden(a, v, ver.spur);
      }
    } catch (e) {
      // Fachliche Hürde (z. B. Freigabelimit): Vorgang bleibt für die manuelle Bearbeitung liegen
      ver.manuell = true;
      v.historie.push({ zeitpunkt: jetztLokal(), status: v.status, text: 'Zur manuellen Prüfung vorgelegt', von: 'Automatische Prüfung' });
    }
  }
}

function zeitpunkt(lokal: string): number {
  // Zeitstempel werden ohne Zeitzone als Ortszeit gespeichert
  return new Date(lokal.length === 10 ? lokal + 'T00:00:00' : lokal).getTime();
}

function jetztLokal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function bearbeiterFuer(a: Anfrage, v: Vorgang) {
  const id = VERARBEITUNG.teamZuweisung[v.zustaendig || 'Leistungen'] || 's1';
  return a.store.benutzer.find(b => b.id === id && b.rolle === 'SACHBEARBEITER' && !b.gesperrt);
}

function zuweisen(a: Anfrage, v: Vorgang) {
  const sb = bearbeiterFuer(a, v);
  v.bearbeiterId = sb?.id;
  statusSetzen(v, 'IN_BEARBEITUNG', `Vorgang dem Team ${v.zustaendig || 'Leistungen'} zugewiesen`, sb ? voller(sb) : 'Teamverteilung');
  if (v.typ === 'WIDERSPRUCH' && v.daten['begruendungFolgt'] && !v.verarbeitung?.rueckfrageGestellt) {
    rueckfrageStellen(a, v, sb ? voller(sb) : 'Widerspruchsstelle', 'Sie haben angekündigt, Ihren Widerspruch ausführlich zu begründen. Bitte reichen Sie die Begründung und ggf. Nachweise (z. B. ärztliche Stellungnahme) über Ihren Vorgang nach, damit wir den Widerspruch prüfen können.');
  } else if (fehlendeUnterlagen(v)) rueckfrageStellen(a, v, sb ? voller(sb) : `Team ${v.zustaendig}`);
}

/** Nachweisfeld eines Formulars, das für die Prüfung benötigt wird (keine „weiteren“ oder freiwilligen Unterlagen). */
function nachweisfeld(typ: string) {
  const def = formular(typ);
  return def ? alleFelder(def).find(f => f.typ === 'datei' && !/^(Weitere )?Unterlagen$|sofern vorhanden/.test(f.label)) : undefined;
}

/** Fehlen benötigte Nachweise, werden sie einmalig nachgefordert. */
function fehlendeUnterlagen(v: Vorgang): boolean {
  if (v.verarbeitung?.rueckfrageGestellt || v.anhaenge.length || v.benutzerId === 'extern') return false;
  return !!nachweisfeld(v.typ);
}

function rueckfrageStellen(a: Anfrage, v: Vorgang, von: string, eigenerText?: string) {
  const feld = nachweisfeld(v.typ);
  const text = eigenerText || `Für die Prüfung Ihres Antrags benötigen wir noch folgende Unterlagen: ${feld?.label || 'Nachweise'}. Bitte reichen Sie diese über Ihren Vorgang ein.`;
  v.rueckfrage = text;
  v.rueckfrageFrist = toIso(addTage(new Date(), RUECKFRAGE_FRIST_TAGE));
  v.verarbeitung!.rueckfrageGestellt = true;
  statusSetzen(v, 'RUECKFRAGE', 'Rückfrage an Versicherten gestellt', von);
  const vers = a.store.benutzer.find(b => b.id === v.benutzerId);
  if (vers) {
    postfachNachricht(vers.id, `Rückfrage zu Ihrem Antrag ${v.vorgangsnummer}`,
      `${anrede(vers)},\n\n${text}\n\nBitte antworten Sie bis zum ${v.rueckfrageFrist.split('-').reverse().join('.')}.\n\nMit freundlichen Grüßen\n${von}`,
      { kategorie: 'LEISTUNG', absender: 'VitaPlus ' + (v.zustaendig || 'Leistungsabteilung'), vorgangId: v.id, wichtig: true });
  }
}

function automatischEntscheiden(a: Anfrage, v: Vorgang, spur: 'DUNKEL' | 'SACHBEARBEITUNG') {
  if (spur === 'DUNKEL' && fehlendeUnterlagen(v)) {
    rueckfrageStellen(a, v, 'Automatische Prüfung');
    return;
  }
  const sb = spur === 'SACHBEARBEITUNG' ? a.store.benutzer.find(b => b.id === v.bearbeiterId) : undefined;
  const akteur = sb
    ? { name: voller(sb), absender: `${voller(sb)}\nTeam ${v.zustaendig || 'Leistungen'}` }
    : { name: 'Automatische Prüfung', absender: `Ihre VitaPlus\n(Dieser Bescheid wurde maschinell erstellt und ist ohne Unterschrift gültig.)` };
  entscheidungTreffen(a, v, regelentscheidung(a, v), akteur);
}

/** Entscheidungsregeln der maschinellen Prüfung je Vorgangstyp. */
function regelentscheidung(a: Anfrage, v: Vorgang): Entscheidung {
  const d = v.daten;
  if (v.typ in BETRAGS_TYPEN) {
    const anspruch = Math.round((Number(d[BETRAGS_TYPEN[v.typ]]) || v.betragBeantragt || 0) * 100) / 100;
    if (!(anspruch > 0)) {
      return { entscheidung: 'ABGELEHNT', begruendung: `Nach den Leistungsvoraussetzungen Ihres Tarifs besteht für ${VORGANG_TYP_TEXT[v.typ] || v.titel} derzeit kein (weiterer) Erstattungsanspruch.` };
    }
    const betrag = Math.min(anspruch, v.betragBeantragt || anspruch);
    return betrag < (v.betragBeantragt || 0) - 0.005
      ? { entscheidung: 'GENEHMIGT', betrag, begruendung: `Nach den Satzungsregelungen Ihres Tarifs übernehmen wir für diese Leistung ${euro(betrag)} der beantragten ${euro(v.betragBeantragt || 0)} (Erstattungssatz bzw. Jahreshöchstbetrag).` }
      : { entscheidung: 'GENEHMIGT', betrag };
  }
  switch (v.typ) {
    case 'PFLEGEGRAD': {
      const akte = a.store.pflege.find(p => p.benutzerId === v.benutzerId);
      return { entscheidung: 'GENEHMIGT', zusatz: { pflegegrad: Math.min(5, akte ? akte.pflegegrad + 1 : 2) } };
    }
    case 'WIDERSPRUCH': {
      // Abhilfe, wenn der Widerspruch substanziiert begründet oder belegt ist – sonst Zurückweisung
      const bezug = a.store.vorgaenge.find(x => x.id === v.bezugVorgangId);
      const begruendet = String(d['begruendung'] || '').trim().length >= 120 || v.anhaenge.length > 0 || v.historie.some(h => h.text.startsWith('Unterlagen nachgereicht'));
      return begruendet
        ? { entscheidung: 'GENEHMIGT', zusatz: { betrag: bezug?.betragBeantragt } }
        : { entscheidung: 'ABGELEHNT', begruendung: `Wir haben die angefochtene Entscheidung zu ${bezug?.vorgangsnummer || 'Ihrem Antrag'} vollständig überprüft. Ihr Widerspruch enthält keine neuen Gesichtspunkte, die eine andere Entscheidung rechtfertigen. Die Entscheidung entspricht den gesetzlichen Vorgaben und unserer Satzung.` };
    }
    default:
      return { entscheidung: 'GENEHMIGT' };
  }
}

const ANTWORT_TEAM: Record<string, string> = {
  ALLGEMEIN: 'Kundenservice', LEISTUNG: 'Leistungen', BEITRAG: 'Mitgliedschaft & Beiträge', MITGLIEDSCHAFT: 'Mitgliedschaft & Beiträge', BONUS: 'Bonusprogramm', BESCHWERDE: 'Beschwerdemanagement',
};

const ANTWORT_TEXT: Record<string, string> = {
  ALLGEMEIN: 'vielen Dank für Ihre Nachricht. Gern helfen wir Ihnen weiter. Viele Anliegen können Sie direkt in der Online-Geschäftsstelle erledigen – zum Beispiel Bescheinigungen herunterladen, Daten ändern oder Anträge stellen. Sollte Ihre Frage damit nicht beantwortet sein, rufen wir Sie gern zurück.',
  LEISTUNG: 'vielen Dank für Ihre Anfrage zu unseren Leistungen. Den aktuellen Umfang je Tarif finden Sie unter „Leistungen A–Z“. Für eine Kostenübernahme reichen Sie bitte den Antrag bzw. die Rechnung online ein – wir prüfen dann den konkreten Anspruch.',
  BEITRAG: 'vielen Dank für Ihre Anfrage zu Ihren Beiträgen. Der allgemeine Beitragssatz beträgt 14,6 %, unser Zusatzbeitrag 2,49 %. Ihren persönlichen Beitrag, Zahlungen und Bescheinigungen finden Sie jederzeit unter „Beiträge“.',
  MITGLIEDSCHAFT: 'vielen Dank für Ihre Nachricht zu Ihrer Mitgliedschaft. Änderungen Ihrer Lebenssituation (neuer Arbeitgeber, Studium, Rente) melden Sie am schnellsten über das Antragscenter. Ihre Versicherungszeiten sehen Sie unter „Meine Versicherung“.',
  BONUS: 'vielen Dank für Ihre Nachricht zum Bonusprogramm. Eingereichte Maßnahmen prüfen wir innerhalb weniger Tage. Ab 500 bestätigten Punkten können Sie Ihre Prämie anfordern.',
  BESCHWERDE: 'vielen Dank, dass Sie uns Ihre Kritik mitteilen. Es tut uns leid, dass Sie unzufrieden sind. Wir haben den Sachverhalt geprüft und mit den beteiligten Kolleginnen und Kollegen besprochen. Ihr Hinweis hilft uns, besser zu werden.',
};

/** Der Kundenservice beantwortet Nachrichten aus dem Postfach – mit Bezug zum Vorgang, falls angegeben. */
function nachrichtenBeantworten(store: Store) {
  const jetzt = Date.now();
  for (const n of store.nachrichten) {
    if (n.ordner !== 'GESENDET' || n.beantwortetAm || (jetzt - zeitpunkt(n.datum)) / 1000 < VERARBEITUNG.nachrichtAntwortNachSek) continue;
    const vers = store.benutzer.find(b => b.id === n.benutzerId);
    n.beantwortetAm = jetztLokal();
    if (!vers) continue;
    const v = n.vorgangId ? store.vorgaenge.find(x => x.id === n.vorgangId) : undefined;
    const team = ANTWORT_TEAM[n.kategorie] || 'Kundenservice';
    const sb = store.benutzer.find(b => b.id === (VERARBEITUNG.teamZuweisung[v?.zustaendig || team] || 's1'));
    const vorgangText = v
      ? `vielen Dank für Ihre Nachricht zu Ihrem Vorgang ${v.vorgangsnummer} („${v.titel}“). Der Vorgang hat derzeit den Status „${STATUS_TEXT[v.status] || v.status}“. ` +
        (v.status === 'RUECKFRAGE' ? 'Wir benötigen noch Unterlagen von Ihnen – bitte reichen Sie diese direkt im Vorgang nach.' :
          ['EINGEREICHT', 'IN_BEARBEITUNG'].includes(v.status) ? `Wir haben Ihre Hinweise zum Vorgang genommen und melden uns${v.fristBis ? ' voraussichtlich bis zum ' + v.fristBis.split('-').reverse().join('.') : ''} mit einer Entscheidung.` :
          'Die Entscheidung haben wir Ihnen bereits mitgeteilt. Wenn Sie damit nicht einverstanden sind, können Sie innerhalb eines Monats Widerspruch einlegen.')
      : ANTWORT_TEXT[n.kategorie] || ANTWORT_TEXT['ALLGEMEIN'];
    postfachNachricht(vers.id, n.betreff.startsWith('AW:') ? n.betreff : `AW: ${n.betreff}`.substring(0, 100),
      `${anrede(vers)},

${vorgangText}

Mit freundlichen Grüßen
${sb ? voller(sb) : 'Ihr Kundenservice'}
Team ${team}`,
      { kategorie: n.kategorie, absender: `VitaPlus ${team}`, antwortAufId: n.id, vorgangId: v?.id });
  }
}

/** Zahllauf: genehmigte Erstattungen aus dem Online-Kanal werden zeitnah überwiesen (Zahlungsavis im Postfach). */
export function zahllauf(store: Store, v: Vorgang): boolean {
  if (!v.verarbeitung) return false;
  if ((Date.now() - zeitpunkt(v.geaendertAm)) / 1000 < VERARBEITUNG.auszahlungNachSek) return false;
  const vers = store.benutzer.find(b => b.id === v.benutzerId);
  const konto = vers?.bank ? `${vers.bank.iban.substring(0, 4)} •••• ${vers.bank.iban.slice(-4)}` : 'Ihr hinterlegtes Konto';
  const betrag = Math.max(0, (v.betragErstattet || 0) - (v.betragAusgezahlt || 0));
  const nachzahlung = (v.betragAusgezahlt || 0) > 0;
  v.betragAusgezahlt = v.betragErstattet || 0;
  statusSetzen(v, 'AUSGEZAHLT', `${euro(betrag)} ${nachzahlung ? 'nachgezahlt' : 'überwiesen'}`, 'Zahllauf');
  if (vers) {
    postfachNachricht(vers.id, `Zahlungsavis zu ${v.vorgangsnummer}`,
      `${anrede(vers)},\n\nwir haben heute ${euro(betrag)}${nachzahlung ? ' (Nachzahlung nach Ihrem Widerspruch)' : ''} auf ${konto} überwiesen.\nVerwendungszweck: ${v.vorgangsnummer} ${v.titel}\n\nDie Gutschrift erfolgt je nach Bank innerhalb von 1–2 Werktagen.\n\nIhre VitaPlus`,
      { kategorie: 'LEISTUNG', absender: 'VitaPlus Zahlungsverkehr', vorgangId: v.id });
  }
  return true;
}
