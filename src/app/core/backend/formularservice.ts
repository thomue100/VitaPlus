import { formular } from '../formulare/formular-katalog';
import { optionenVon, pruefeFormular } from '../formulare/formular-pruefung';
import { Bedingung, FeldDef, FormularDef, Option } from '../formulare/formular-typen';
import { Benutzer, widerspruchsfaehig } from '../models';
import { addTage, heute, toIso } from '../util/datum';
import { Anfrage, ApiFehler, Route } from './api-kontext';
import { formularVerarbeiten, mitgliedsantragPruefen } from './handler-formulare';

/**
 * Formular-Service: liefert für jeden Online-Antrag ein JSON Schema (Datenmodell und Regeln) und ein
 * UI Schema (Schritte, Anordnung, Ein-/Ausblendregeln). Die Darstellung übernimmt JSON Forms im Frontend.
 */

interface Auswahlkontext {
  personen: Option[];
  angehoerige: Option[];
  vorgaenge: { id: string; text: string; status: string; typ: string; widerspruchsfaehig: boolean }[];
}

const MUSTER = {
  telefon: '^[+0-9][0-9 ()/-]{5,24}$',
  iban: '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$',
  uhrzeit: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
};

function auswahl(optionen: Option[]) {
  return optionen.length ? { oneOf: optionen.map(o => ({ const: o.wert, title: o.text })) } : {};
}

function optionenFuer(f: FeldDef, k: Auswahlkontext): Option[] {
  switch (f.typ) {
    case 'person': return k.personen;
    case 'kind': return k.angehoerige;
    case 'vorgang': return k.vorgaenge
      .filter(v => (!f.vorgangFilter?.nurWiderspruchsfaehig || v.widerspruchsfaehig) && (!f.vorgangFilter?.status || f.vorgangFilter.status.includes(v.status)) && (!f.vorgangFilter?.typen || f.vorgangFilter.typen.includes(v.typ)))
      .map(v => ({ wert: v.id, text: v.text }));
    default: return optionenVon(f);
  }
}

function feldSchema(f: FeldDef, k: Auswahlkontext): Record<string, any> {
  const basis: Record<string, any> = { title: f.label };
  if (f.hilfe) basis['description'] = f.hilfe;
  switch (f.typ) {
    case 'text':
    case 'textarea':
      return { ...basis, type: 'string', ...(f.minLaenge ? { minLength: f.minLaenge } : {}), ...(f.maxLaenge ? { maxLength: f.maxLaenge } : {}), ...(f.muster ? { pattern: f.muster } : {}) };
    case 'email': return { ...basis, type: 'string', format: 'email', maxLength: 120 };
    case 'telefon': return { ...basis, type: 'string', pattern: MUSTER.telefon };
    case 'iban': return { ...basis, type: 'string', pattern: MUSTER.iban };
    case 'zahl': return { ...basis, type: 'integer', ...(f.min !== undefined ? { minimum: f.min } : {}), ...(f.max !== undefined ? { maximum: f.max } : {}) };
    case 'betrag': return { ...basis, type: 'number', ...(f.min !== undefined ? { minimum: f.min } : {}), ...(f.max !== undefined ? { maximum: f.max } : {}) };
    case 'datum': return { ...basis, type: 'string', format: 'date' };
    case 'uhrzeit': return { ...basis, type: 'string', pattern: MUSTER.uhrzeit };
    case 'checkbox': return { ...basis, type: 'boolean', ...(f.pflicht ? { const: true } : {}) };
    case 'auswahl':
    case 'radio':
    case 'person':
    case 'kind':
    case 'vorgang':
      return { ...basis, type: 'string', ...auswahl(optionenFuer(f, k)) };
    case 'mehrfach':
      return { ...basis, type: 'array', uniqueItems: true, items: { type: 'string', ...auswahl(optionenVon(f)) }, ...(f.pflicht ? { minItems: 1 } : {}) };
    case 'datei':
      return { ...basis, type: 'array', items: { type: 'object' }, ...(f.maxDateien ? { maxItems: f.maxDateien } : {}), ...(f.pflicht ? { minItems: 1 } : {}) };
    case 'liste': {
      const unter = f.unterfelder || [];
      return {
        ...basis, type: 'array',
        ...(f.minEintraege ? { minItems: f.minEintraege } : {}), ...(f.maxEintraege ? { maxItems: f.maxEintraege } : {}),
        items: { type: 'object', properties: Object.fromEntries(unter.map(u => [u.name, feldSchema(u, k)])), required: unter.filter(u => u.pflicht).map(u => u.name) },
      };
    }
    default:
      return { ...basis, type: 'string' };
  }
}

function bedingungSchema(b: Bedingung): Record<string, any> {
  if (b.gesetzt !== undefined) return b.gesetzt ? { not: { enum: [false, '', null] } } : { enum: [false, '', null] };
  if (b.gleich !== undefined) return { const: b.gleich };
  if (b.ungleich !== undefined) return { not: { const: b.ungleich } };
  if (b.in) return { enum: b.in };
  return {};
}

function bedingungen(f: FeldDef): Bedingung[] {
  return !f.sichtbarWenn ? [] : Array.isArray(f.sichtbarWenn) ? f.sichtbarWenn : [f.sichtbarWenn];
}

/** Ein-/Ausblendregel für das UI Schema */
function regel(f: FeldDef) {
  const liste = bedingungen(f);
  if (!liste.length) return undefined;
  const einzeln = (b: Bedingung) => ({
    scope: `#/properties/${b.feld}`, schema: bedingungSchema(b),
    failWhenUndefined: b.ungleich === undefined && !(b.gesetzt === false),
  });
  return { effect: 'SHOW', condition: liste.length === 1 ? einzeln(liste[0]) : { type: 'AND', conditions: liste.map(einzeln) } };
}

/** Pflichtangabe, die nur gilt, wenn das Feld eingeblendet ist (if/then im JSON Schema) */
function bedingtePflicht(f: FeldDef) {
  const liste = bedingungen(f);
  const wenn = (b: Bedingung) => (b.ungleich !== undefined || b.gesetzt === false)
    ? { not: { properties: { [b.feld]: { not: bedingungSchema(b) } }, required: [b.feld] } }
    : { properties: { [b.feld]: bedingungSchema(b) }, required: [b.feld] };
  return { if: liste.length === 1 ? wenn(liste[0]) : { allOf: liste.map(wenn) }, then: { required: [f.name] } };
}

function control(f: FeldDef, pfad = '#/properties/'): Record<string, any> {
  const optionen: Record<string, any> = {};
  if (f.breit || ['textarea', 'mehrfach', 'radio', 'checkbox', 'datei', 'liste'].includes(f.typ)) optionen['breit'] = true;
  if (f.platzhalter) optionen['placeholder'] = f.platzhalter;
  if (f.musterText) optionen['musterText'] = f.musterText;
  if (f.typ === 'textarea') optionen['multi'] = true;
  if (f.typ === 'radio') optionen['format'] = 'radio';
  if (f.typ === 'betrag') optionen['format'] = 'betrag';
  if (f.typ === 'iban') optionen['format'] = 'iban';
  if (f.typ === 'telefon') optionen['format'] = 'telefon';
  if (f.typ === 'uhrzeit') optionen['format'] = 'uhrzeit';
  if (f.typ === 'datei') optionen['format'] = 'dateien';
  if (f.typ === 'person' || f.typ === 'kind' || f.typ === 'vorgang') optionen['leerText'] = f.typ === 'vorgang' ? 'Es gibt derzeit keinen passenden Vorgang.' : 'Es ist keine passende Person mitversichert.';
  if (f.typ === 'datum') {
    if (f.nichtZukunft) optionen['max'] = toIso(heute());
    if (f.nichtVergangenheit) optionen['min'] = toIso(heute());
    if (f.maxTageZurueck !== undefined) optionen['min'] = toIso(addTage(heute(), -f.maxTageZurueck));
    if (f.maxTageVoraus !== undefined) optionen['max'] = toIso(addTage(heute(), f.maxTageVoraus));
  }
  if (f.typ === 'liste') {
    optionen['eintrag'] = f.eintragBezeichnung || 'Eintrag';
    optionen['detail'] = { type: 'VerticalLayout', elements: (f.unterfelder || []).map(u => control(u)) };
  }
  const c: Record<string, any> = { type: 'Control', scope: `${pfad}${f.name}`, label: f.label };
  if (Object.keys(optionen).length) c['options'] = optionen;
  const r = regel(f);
  if (r) c['rule'] = r;
  return c;
}

export function formularBeschreibung(def: FormularDef, k: Auswahlkontext) {
  const felder = def.schritte.flatMap(s => s.felder).filter(f => f.typ !== 'info');
  const schema: Record<string, any> = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://api.vitaplus.de/formulare/${def.code}.schema.json`,
    title: def.titel,
    type: 'object',
    properties: Object.fromEntries(felder.map(f => [f.name, feldSchema(f, k)])),
    required: felder.filter(f => f.pflicht && !f.sichtbarWenn).map(f => f.name),
  };
  const bedingt = felder.filter(f => f.pflicht && f.sichtbarWenn).map(bedingtePflicht);
  if (bedingt.length) schema['allOf'] = bedingt;
  const uischema = {
    type: 'Categorization',
    elements: def.schritte.map((s, i) => ({
      type: 'Category', label: s.titel,
      ...(s.beschreibung ? { options: { beschreibung: s.beschreibung, schritt: i } } : { options: { schritt: i } }),
      elements: s.felder.map(f => f.typ === 'info' ? { type: 'Label', text: f.label, ...(regel(f) ? { rule: regel(f) } : {}) } : control(f)),
    })),
  };
  return {
    code: def.code, titel: def.titel, kurz: def.kurz, hinweis: def.hinweis, zustaendig: def.zustaendig, bearbeitungTage: def.bearbeitungTage,
    entwurfErlaubt: def.entwurfErlaubt, einwilligung: def.einwilligung, oeffentlich: !!def.oeffentlich,
    schritte: def.schritte.map(s => ({ titel: s.titel, felder: s.felder.filter(f => f.typ !== 'info').map(f => f.name) })),
    schema, uischema,
  };
}

function kontextFuer(a: Anfrage, b?: Benutzer): Auswahlkontext {
  if (!b) return { personen: [], angehoerige: [], vorgaenge: [] };
  const familie = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status === 'AKTIV');
  const angehoerige = familie.map(f => ({ wert: f.id, text: `${f.vorname} ${f.nachname}` }));
  return {
    personen: [{ wert: 'SELBST', text: `${b.vorname} ${b.nachname} (ich)` }, ...angehoerige],
    angehoerige,
    vorgaenge: a.store.vorgaenge.filter(v => v.benutzerId === b.id && v.status !== 'ENTWURF')
      .sort((x, y) => y.erstelltAm.localeCompare(x.erstelltAm))
      .map(v => ({ id: v.id, text: `${v.vorgangsnummer} – ${v.titel}`, status: v.status, typ: v.typ, widerspruchsfaehig: widerspruchsfaehig(v) })),
  };
}

function definitionLaden(a: Anfrage, oeffentlich: boolean): FormularDef {
  const def = formular(a.params['code']);
  if (!def || (oeffentlich ? !def.oeffentlich : (def.oeffentlich && def.code !== 'TODESFALL'))) throw new ApiFehler(404, 'Dieses Formular ist nicht verfügbar.');
  if (!oeffentlich && def.nurFuer && !def.nurFuer.includes(a.benutzer!.beschaeftigung)) throw new ApiFehler(403, 'Dieser Antrag steht für Ihre Versicherungsart nicht zur Verfügung.');
  return def;
}

/** Angaben aus dem Versichertenkonto, mit denen Formulare vorbelegt bzw. Anträge gekennzeichnet werden */
function antragsteller(b: Benutzer, def: FormularDef) {
  const felder = def.schritte.flatMap(s => s.felder.map(f => f.name));
  const quelle: Record<string, string | undefined> = {
    telefon: b.mobil || b.telefon, email: b.email, iban: b.bank?.iban, kontoinhaber: b.bank?.kontoinhaber,
    strasse: `${b.adresse.strasse} ${b.adresse.hausnummer}`.trim(), plz: b.adresse.plz, ort: b.adresse.ort,
  };
  const vorbelegung = Object.fromEntries(Object.entries(quelle).filter(([k, w]) => w && felder.includes(k)));
  return {
    vorbelegung,
    antragsteller: {
      name: `${b.titel ? b.titel + ' ' : ''}${b.vorname} ${b.nachname}`, versichertennummer: b.versichertennummer,
      anschrift: `${b.adresse.strasse} ${b.adresse.hausnummer}, ${b.adresse.plz} ${b.adresse.ort}`, geburtsdatum: b.geburtsdatum,
    },
  };
}

function definition(a: Anfrage) {
  const def = definitionLaden(a, false);
  return { ...formularBeschreibung(def, kontextFuer(a, a.benutzer)), ...antragsteller(a.benutzer!, def) };
}

function oeffentlicheDefinition(a: Anfrage) {
  return formularBeschreibung(definitionLaden(a, true), kontextFuer(a));
}

/**
 * Vorabprüfung eines Schritts: formale Prüfung aller Felder bis einschließlich des Schritts.
 * Beim letzten Schritt zusätzlich ein Probelauf der fachlichen Prüfung, damit Fehler vor dem Absenden auffallen.
 */
function schrittPruefen(a: Anfrage, oeffentlich: boolean) {
  const def = definitionLaden(a, oeffentlich);
  const daten: Record<string, any> = a.body?.daten || {};
  const schritt = Math.min(Number(a.body?.schritt ?? def.schritte.length - 1), def.schritte.length - 1);
  const fehler = def.schritte.slice(0, schritt + 1).flatMap((_, i) => pruefeFormular(def, daten, i));
  if (fehler.length) return { gueltig: false, fehler, hinweise: [] };
  if (schritt < def.schritte.length - 1) {
    // Fachliche Regeln, die sich nur auf bereits erfasste Angaben beziehen, schon jetzt melden
    const bisher = def.schritte.slice(0, schritt + 1).flatMap(s => s.felder.map(f => f.name));
    if (oeffentlich && def.code === 'MITGLIEDSANTRAG') {
      try {
        mitgliedsantragPruefen({ ...a, trocken: true }, daten);
      } catch (e) {
        if (e instanceof ApiFehler && e.feld && bisher.includes(e.feld)) return { gueltig: false, fehler: [{ feld: e.feld, meldung: e.meldung }], hinweise: [] };
      }
    }
    return { gueltig: true, fehler: [], hinweise: [] };
  }
  const dateiFelder = def.schritte.flatMap(s => s.felder).filter(f => f.typ === 'datei').map(f => f.name);
  const anhaenge = dateiFelder.flatMap(n => daten[n] || []);
  const ohneDateien = Object.fromEntries(Object.entries(daten).filter(([n]) => !dateiFelder.includes(n)));
  try {
    const probe: Anfrage = { ...a, trocken: true, store: structuredClone(a.store) };
    if (oeffentlich) {
      const hinweise = def.code === 'MITGLIEDSANTRAG' ? mitgliedsantragPruefen(probe, ohneDateien) : [];
      return { gueltig: true, fehler: [], hinweise };
    }
    probe.benutzer = probe.store.benutzer.find(x => x.id === a.benutzer!.id);
    const e = formularVerarbeiten(probe, probe.benutzer!, def.code, ohneDateien, anhaenge, false);
    return { gueltig: true, fehler: [], hinweise: e.hinweise || [], betrag: e.betrag };
  } catch (e) {
    if (e instanceof ApiFehler && e.status < 500) {
      const details: { feld: string; meldung: string }[] = e.details || [{ feld: e.feld || '', meldung: e.meldung }];
      return { gueltig: false, fehler: details, hinweise: [] };
    }
    throw e;
  }
}

export const FORMULARSERVICE_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/formulare/:code/definition', handler: definition, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/formulare/:code/pruefung', handler: a => schrittPruefen(a, false), rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/oeffentlich/formulare/:code/definition', handler: oeffentlicheDefinition, oeffentlich: true },
  { methode: 'POST', muster: '/api/oeffentlich/formulare/:code/pruefung', handler: a => schrittPruefen(a, true), oeffentlich: true },
];
