import { RUECKFRAGE_FRIST_TAGE, VERARBEITUNG, VORGANG_TYP_TEXT } from '../konfiguration';
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
  if (fehlendeUnterlagen(v)) rueckfrageStellen(a, v, sb ? voller(sb) : `Team ${v.zustaendig}`);
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

function rueckfrageStellen(a: Anfrage, v: Vorgang, von: string) {
  const feld = nachweisfeld(v.typ);
  const text = `Für die Prüfung Ihres Antrags benötigen wir noch folgende Unterlagen: ${feld?.label || 'Nachweise'}. Bitte reichen Sie diese über Ihren Vorgang ein.`;
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
    return { entscheidung: 'GENEHMIGT', betrag: Math.min(anspruch, v.betragBeantragt || anspruch) };
  }
  switch (v.typ) {
    case 'PFLEGEGRAD': {
      const akte = a.store.pflege.find(p => p.benutzerId === v.benutzerId);
      return { entscheidung: 'GENEHMIGT', zusatz: { pflegegrad: Math.min(5, akte ? akte.pflegegrad + 1 : 2) } };
    }
    case 'WIDERSPRUCH': {
      const bezug = a.store.vorgaenge.find(x => x.id === v.bezugVorgangId);
      return { entscheidung: 'GENEHMIGT', zusatz: { betrag: bezug?.betragBeantragt } };
    }
    default:
      return { entscheidung: 'GENEHMIGT' };
  }
}

/** Zahllauf: genehmigte Erstattungen aus dem Online-Kanal werden zeitnah überwiesen (Zahlungsavis im Postfach). */
export function zahllauf(store: Store, v: Vorgang): boolean {
  if (!v.verarbeitung) return false;
  if ((Date.now() - zeitpunkt(v.geaendertAm)) / 1000 < VERARBEITUNG.auszahlungNachSek) return false;
  const vers = store.benutzer.find(b => b.id === v.benutzerId);
  const konto = vers?.bank ? `${vers.bank.iban.substring(0, 4)} •••• ${vers.bank.iban.slice(-4)}` : 'Ihr hinterlegtes Konto';
  statusSetzen(v, 'AUSGEZAHLT', `${euro(v.betragErstattet || 0)} überwiesen`, 'Zahllauf');
  if (vers) {
    postfachNachricht(vers.id, `Zahlungsavis zu ${v.vorgangsnummer}`,
      `${anrede(vers)},\n\nwir haben heute ${euro(v.betragErstattet || 0)} auf ${konto} überwiesen.\nVerwendungszweck: ${v.vorgangsnummer} ${v.titel}\n\nDie Gutschrift erfolgt je nach Bank innerhalb von 1–2 Werktagen.\n\nIhre VitaPlus`,
      { kategorie: 'LEISTUNG', absender: 'VitaPlus Zahlungsverkehr', vorgangId: v.id });
  }
  return true;
}
