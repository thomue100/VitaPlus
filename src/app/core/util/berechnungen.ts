import { BEITRAG, BONUS, ERSTATTUNGEN, ErstattungsRegel } from '../konfiguration';
import { Beschaeftigung, Tarif } from '../models';

export interface BeitragsEingabe {
  beschaeftigung: Beschaeftigung | 'MINIJOB';
  bruttoMonat: number;
  kinder: number;
  alter: number;
  krankengeldanspruch: boolean;
  bundesland: string;
}

export interface BeitragsErgebnis {
  bemessungsgrundlage: number;
  kvSatz: number;
  kvGesamt: number;
  kvAnteilVersicherter: number;
  zusatzGesamt: number;
  zusatzAnteilVersicherter: number;
  pvSatz: number;
  pvGesamt: number;
  pvAnteilVersicherter: number;
  summeVersicherter: number;
  summeArbeitgeber: number;
  summeGesamt: number;
  hinweise: string[];
  versicherungsfrei?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function pflegeSatzVersicherter(kinder: number, alter: number): { satz: number; arbeitgeberSatz: number } {
  const ag = BEITRAG.pflegeSatz / 2;
  let an = BEITRAG.pflegeSatz / 2;
  if (kinder === 0 && alter >= 23) an += BEITRAG.pflegeKinderlosZuschlag;
  if (kinder >= 2) {
    const abschlagKinder = Math.min(kinder, BEITRAG.pflegeAbschlagMaxKinder) - 1;
    an -= abschlagKinder * BEITRAG.pflegeAbschlagProKind;
  }
  // Sachsen-Sonderregel: Arbeitgeber trägt 0,5 Prozentpunkte weniger
  return { satz: r2(an), arbeitgeberSatz: ag };
}

export function berechneBeitrag(e: BeitragsEingabe): BeitragsErgebnis {
  const hinweise: string[] = [];
  let pv = pflegeSatzVersicherter(e.kinder, e.alter);
  if (e.bundesland === 'Sachsen') {
    pv = { satz: r2(pv.satz + 0.5), arbeitgeberSatz: pv.arbeitgeberSatz - 0.5 };
    hinweise.push('In Sachsen tragen Beschäftigte einen höheren Anteil am Pflegebeitrag.');
  }

  if (e.beschaeftigung === 'MINIJOB' || (e.beschaeftigung === 'ANGESTELLT' && e.bruttoMonat <= BEITRAG.minijobGrenze)) {
    return {
      bemessungsgrundlage: 0, kvSatz: 0, kvGesamt: 0, kvAnteilVersicherter: 0, zusatzGesamt: 0, zusatzAnteilVersicherter: 0,
      pvSatz: 0, pvGesamt: 0, pvAnteilVersicherter: 0, summeVersicherter: 0, summeArbeitgeber: 0, summeGesamt: 0,
      hinweise: [`Bis ${BEITRAG.minijobGrenze.toFixed(2).replace('.', ',')} € monatlich handelt es sich um einen Minijob. Es fallen für Sie keine eigenen Beiträge an.`],
      versicherungsfrei: true,
    };
  }

  if (e.beschaeftigung === 'STUDENT') {
    const kv = BEITRAG.studentBeitragKv;
    const pvBeitrag = e.kinder === 0 && e.alter >= 23 ? r2(BEITRAG.studentBeitragPv * 1.17) : BEITRAG.studentBeitragPv;
    hinweise.push('Für Studierende gilt ein pauschaler Beitrag unabhängig vom Einkommen.');
    if (e.alter >= 30) hinweise.push('Ab dem 30. Lebensjahr endet die studentische Krankenversicherung in der Regel.');
    if (e.bruttoMonat > 0) hinweise.push('Einkünfte aus Nebenjobs bis 20 Wochenstunden bleiben in der Regel beitragsfrei.');
    return {
      bemessungsgrundlage: 0, kvSatz: 0, kvGesamt: kv, kvAnteilVersicherter: kv, zusatzGesamt: 0, zusatzAnteilVersicherter: 0,
      pvSatz: 0, pvGesamt: pvBeitrag, pvAnteilVersicherter: pvBeitrag, summeVersicherter: r2(kv + pvBeitrag), summeArbeitgeber: 0,
      summeGesamt: r2(kv + pvBeitrag), hinweise,
    };
  }

  let grundlage = Math.min(e.bruttoMonat, BEITRAG.bemessungsgrenzeMonat);
  if (e.bruttoMonat > BEITRAG.bemessungsgrenzeMonat) {
    hinweise.push('Ihr Einkommen liegt über der Beitragsbemessungsgrenze. Der Beitrag wird aus der Bemessungsgrenze berechnet.');
  }
  if (e.beschaeftigung === 'ANGESTELLT' && e.bruttoMonat * 12 > BEITRAG.versicherungspflichtgrenzeJahr) {
    hinweise.push('Ihr Jahreseinkommen überschreitet die Versicherungspflichtgrenze. Sie sind freiwillig versichert.');
  }

  if (e.beschaeftigung === 'SELBSTSTAENDIG') {
    if (grundlage < BEITRAG.mindestbemessungSelbststaendig) {
      grundlage = BEITRAG.mindestbemessungSelbststaendig;
      hinweise.push('Für Selbstständige gilt eine Mindestbemessungsgrundlage.');
    }
    const kvSatz = e.krankengeldanspruch ? BEITRAG.allgemeinerSatz : BEITRAG.ermaessigterSatz;
    if (!e.krankengeldanspruch) hinweise.push('Ohne Krankengeldanspruch gilt der ermäßigte Beitragssatz.');
    const kv = r2(grundlage * kvSatz / 100);
    const zb = r2(grundlage * BEITRAG.zusatzbeitrag / 100);
    const pvSatzGesamt = pv.satz + pv.arbeitgeberSatz;
    const pvB = r2(grundlage * pvSatzGesamt / 100);
    return {
      bemessungsgrundlage: grundlage, kvSatz, kvGesamt: kv, kvAnteilVersicherter: kv, zusatzGesamt: zb, zusatzAnteilVersicherter: zb,
      pvSatz: r2(pvSatzGesamt), pvGesamt: pvB, pvAnteilVersicherter: pvB, summeVersicherter: r2(kv + zb + pvB), summeArbeitgeber: 0,
      summeGesamt: r2(kv + zb + pvB), hinweise,
    };
  }

  // Angestellte und Rentner: paritätische Finanzierung
  const kvSatz = BEITRAG.allgemeinerSatz;
  const kvGesamt = r2(grundlage * kvSatz / 100);
  const zbGesamt = r2(grundlage * BEITRAG.zusatzbeitrag / 100);
  const pvAn = r2(grundlage * pv.satz / 100);
  const pvAg = e.beschaeftigung === 'RENTNER' ? 0 : r2(grundlage * pv.arbeitgeberSatz / 100);
  const pvAnRentner = e.beschaeftigung === 'RENTNER' ? r2(grundlage * (pv.satz + pv.arbeitgeberSatz) / 100) : pvAn;
  if (e.beschaeftigung === 'RENTNER') {
    hinweise.push('Den Pflegebeitrag tragen Rentnerinnen und Rentner allein. Die Rentenversicherung übernimmt die Hälfte des Krankenversicherungsbeitrags.');
  }
  const kvAn = r2(kvGesamt / 2);
  const zbAn = r2(zbGesamt / 2);
  const summeAn = r2(kvAn + zbAn + pvAnRentner);
  const summeAg = r2(kvGesamt - kvAn + zbGesamt - zbAn + pvAg);
  return {
    bemessungsgrundlage: grundlage, kvSatz, kvGesamt, kvAnteilVersicherter: kvAn, zusatzGesamt: zbGesamt, zusatzAnteilVersicherter: zbAn,
    pvSatz: r2(pv.satz + pv.arbeitgeberSatz), pvGesamt: r2(pvAnRentner + pvAg), pvAnteilVersicherter: pvAnRentner,
    summeVersicherter: summeAn, summeArbeitgeber: summeAg, summeGesamt: r2(summeAn + summeAg), hinweise,
  };
}

export interface ErstattungsVorschau {
  regel?: ErstattungsRegel;
  moeglich: boolean;
  betrag: number;
  restJahresbudget: number;
  gruende: string[];
}

export function berechneErstattung(
  code: string,
  tarif: Tarif,
  rechnungsbetrag: number,
  bereitsErstattetImJahr: number,
  anzahlImJahr: number,
  alterPatient: number,
): ErstattungsVorschau {
  const regel = ERSTATTUNGEN.find(r => r.code === code);
  const gruende: string[] = [];
  if (!regel) return { moeglich: false, betrag: 0, restJahresbudget: 0, gruende: ['Unbekannte Leistung'] };
  const quote = regel.quote[tarif];
  const max = regel.jahresMax[tarif];
  if (quote === 0 || max === 0) {
    return { regel, moeglich: false, betrag: 0, restJahresbudget: 0, gruende: ['Diese Leistung ist in Ihrem Tarif nicht enthalten.'] };
  }
  if (regel.mindestalter && alterPatient < regel.mindestalter) {
    return { regel, moeglich: false, betrag: 0, restJahresbudget: max, gruende: [`Die Leistung wird erst ab ${regel.mindestalter} Jahren erstattet.`] };
  }
  if (regel.maxAnzahlProJahr && anzahlImJahr >= regel.maxAnzahlProJahr) {
    return { regel, moeglich: false, betrag: 0, restJahresbudget: Math.max(0, max - bereitsErstattetImJahr), gruende: [`Die Leistung kann höchstens ${regel.maxAnzahlProJahr}× pro Kalenderjahr erstattet werden.`] };
  }
  const rest = Math.max(0, r2(max - bereitsErstattetImJahr));
  if (rest === 0) gruende.push('Ihr Jahresbudget für diese Leistung ist ausgeschöpft.');
  const roh = r2(rechnungsbetrag * quote / 100);
  const betrag = Math.min(roh, rest);
  if (roh > rest && rest > 0) gruende.push(`Erstattung begrenzt auf das verbleibende Jahresbudget von ${rest.toFixed(2).replace('.', ',')} €.`);
  return { regel, moeglich: betrag > 0, betrag: r2(betrag), restJahresbudget: rest, gruende };
}

export function bonusEuro(punkte: number, gesundheitsbudget: boolean): number {
  const basis = punkte * BONUS.euroProPunkt;
  return r2(gesundheitsbudget ? basis * (1 + BONUS.gesundheitsbudgetAufschlagProzent / 100) : basis);
}

export function festzuschussProzent(bonusheftJahre: number, haertefall: boolean): number {
  if (haertefall) return 100;
  if (bonusheftJahre >= 10) return 75;
  if (bonusheftJahre >= 5) return 70;
  return 60;
}
