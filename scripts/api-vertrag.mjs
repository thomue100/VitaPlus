// Erzeugt den API-Vertrag (OpenAPI 3.1) aus den Routen des Simulations-Backends.
//
//   npm run api:vertrag
//
// Grundlage sind die Routentabellen in src/app/core/backend (Methode, Pfad, Anmeldung, Rolle) und die
// Handler dahinter: Antwortschemas kommen aus den TypeScript-Typen, Anfragefelder und Fehlercodes werden
// aus dem Quelltext der Handler abgeleitet. Zusätzlich wird der Formularkatalog als JSON exportiert,
// damit ein anderes Backend dieselben Formulare ausliefern und prüfen kann.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(WURZEL, 'src/app/core/backend');
const ZIEL = join(WURZEL, 'docs/api');
const paket = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));

const konfig = ts.getParsedCommandLineOfConfigFile(join(WURZEL, 'tsconfig.app.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const programm = ts.createProgram({ rootNames: konfig.fileNames, options: { ...konfig.options, noEmit: true } });
const pruefer = programm.getTypeChecker();
const quellen = programm.getSourceFiles().filter(f => f.fileName.startsWith(BACKEND));

const BEREICHE = {
  'handler-auth': 'Anmeldung & Registrierung', 'handler-profil': 'Persönliche Daten', 'handler-vorgaenge': 'Vorgänge & Anträge',
  'handler-familie-karten': 'Familie & Gesundheitskarte', 'handler-bonus-termine': 'Bonus, Kurse & Termine', 'handler-postfach-dokumente': 'Postfach & Dokumente',
  'handler-sachbearbeitung': 'Sachbearbeitung', 'handler-formulare': 'Formulare', formularservice: 'Formulare', 'handler-demo': 'Demo-Umgebung',
  'handler-konto': 'Konto & Einstellungen', 'handler-versicherung': 'Versicherung & Beiträge', 'handler-inhalte-admin': 'Inhalte, Chat & Betrieb', 'handler-dateien': 'Dateien',
};

// ------------------------------------------------------------------ Typen → JSON Schema
const komponenten = {};
const inArbeit = new Set();

function istEigenerTyp(sym) {
  const d = sym?.declarations?.[0];
  return !!d && d.getSourceFile().fileName.startsWith(join(WURZEL, 'src/app')) && sym.name !== '__type' && sym.name !== '__object';
}

function schemaVon(t, tiefe = 0) {
  if (tiefe > 10) return {};
  const f = t.flags;
  if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
  if (f & ts.TypeFlags.StringLiteral) return { type: 'string', const: t.value };
  if (f & ts.TypeFlags.NumberLiteral) return { type: 'number', const: t.value };
  if (f & ts.TypeFlags.BooleanLiteral) return { type: 'boolean', const: t.intrinsicName === 'true' };
  if (f & ts.TypeFlags.String) return { type: 'string' };
  if (f & ts.TypeFlags.Number) return { type: 'number' };
  if (f & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (f & ts.TypeFlags.Null) return { type: 'null' };
  if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return {};
  if (t.isUnion()) {
    const teile = t.types.filter(x => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
    if (teile.every(x => x.flags & ts.TypeFlags.StringLiteral)) return { type: 'string', enum: teile.map(x => x.value) };
    if (teile.every(x => x.flags & ts.TypeFlags.BooleanLiteral)) return { type: 'boolean' };
    const schemas = teile.map(x => schemaVon(x, tiefe + 1));
    return schemas.length === 1 ? schemas[0] : { anyOf: schemas };
  }
  if (pruefer.isArrayType(t) || pruefer.isTupleType(t)) {
    const arg = pruefer.getTypeArguments(t);
    return { type: 'array', items: arg.length === 1 ? schemaVon(arg[0], tiefe + 1) : { anyOf: arg.map(x => schemaVon(x, tiefe + 1)) } };
  }
  const name = (t.aliasSymbol && istEigenerTyp(t.aliasSymbol) ? t.aliasSymbol : t.symbol && istEigenerTyp(t.symbol) && (t.symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) ? t.symbol : null)?.name;
  if (t.symbol?.name === 'Blob' || t.symbol?.name === 'File') return { type: 'string', format: 'binary' };
  if (t.symbol?.name === 'Date') return { type: 'string', format: 'date-time' };
  if (name) {
    if (!komponenten[name] && !inArbeit.has(name)) {
      inArbeit.add(name);
      komponenten[name] = objektSchema(t, tiefe);
      const doku = ts.displayPartsToString((t.aliasSymbol || t.symbol).getDocumentationComment(pruefer));
      if (doku) komponenten[name].description = doku;
      inArbeit.delete(name);
    }
    return { $ref: `#/components/schemas/${name}` };
  }
  if (f & ts.TypeFlags.Object || t.isIntersection()) return objektSchema(t, tiefe);
  return {};
}

function objektSchema(t, tiefe) {
  if (pruefer.getSignaturesOfType(t, ts.SignatureKind.Call).length && !pruefer.getPropertiesOfType(t).length) return {};
  const schema = { type: 'object', properties: {} };
  const pflicht = [];
  for (const p of pruefer.getPropertiesOfType(t)) {
    const decl = p.valueDeclaration || p.declarations?.[0];
    const pt = decl ? pruefer.getTypeOfSymbolAtLocation(p, decl) : pruefer.getTypeOfSymbol(p);
    if (pruefer.getSignaturesOfType(pt, ts.SignatureKind.Call).length) continue;
    const s = schemaVon(pt, tiefe + 1);
    const doku = ts.displayPartsToString(p.getDocumentationComment(pruefer));
    schema.properties[p.name] = doku ? { ...s, description: doku } : s;
    if (!(p.flags & ts.SymbolFlags.Optional) && !(pt.isUnion() && pt.types.some(x => x.flags & ts.TypeFlags.Undefined))) pflicht.push(p.name);
  }
  const index = pruefer.getIndexInfosOfType(t)[0];
  if (index) schema.additionalProperties = schemaVon(index.type, tiefe + 1);
  if (pflicht.length) schema.required = pflicht;
  return schema;
}

// ------------------------------------------------------------------ Handler-Quelltext auswerten
function deklarationVon(ausdruck) {
  if (ts.isArrowFunction(ausdruck) || ts.isFunctionExpression(ausdruck)) return ausdruck;
  let sym = pruefer.getSymbolAtLocation(ausdruck);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = pruefer.getAliasedSymbol(sym);
  const d = sym?.valueDeclaration || sym?.declarations?.[0];
  if (!d) return undefined;
  if (ts.isVariableDeclaration(d) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) return d.initializer;
  return d;
}

function aufgerufeneFunktionen(knoten) {
  const ziele = [];
  const besuchen = n => {
    if (ts.isCallExpression(n)) {
      const d = deklarationVon(n.expression);
      if (d && (ts.isFunctionDeclaration(d) || ts.isArrowFunction(d)) && d.getSourceFile().fileName.startsWith(BACKEND)) ziele.push(d);
    }
    ts.forEachChild(n, besuchen);
  };
  besuchen(knoten);
  return ziele;
}

/** Fehler (Status, Code, Meldung) aus `new ApiFehler(...)` und `fehler(...)`, auch in direkt aufgerufenen Hilfsfunktionen */
function fehlerVon(fn, tiefe = 0, gesehen = new Set()) {
  if (!fn || gesehen.has(fn) || tiefe > 2) return [];
  gesehen.add(fn);
  const liste = [];
  const text = k => (k && (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) ? k.text : k && ts.isTemplateExpression(k) ? k.getText().slice(1, -1) : undefined);
  const besuchen = n => {
    if (ts.isNewExpression(n) && n.expression.getText() === 'ApiFehler' && n.arguments?.length) {
      const status = Number(n.arguments[0].getText());
      if (status) liste.push({ status, meldung: text(n.arguments[1]), code: text(n.arguments[3]) });
    }
    if (ts.isCallExpression(n) && n.expression.getText() === 'fehler' && n.arguments.length >= 3) {
      const status = Number(n.arguments[2].getText());
      if (status) liste.push({ status, meldung: text(n.arguments[0]) });
    }
    ts.forEachChild(n, besuchen);
  };
  besuchen(fn);
  for (const z of aufgerufeneFunktionen(fn)) liste.push(...fehlerVon(z, tiefe + 1, gesehen));
  return liste;
}

function feldtyp(name, verwendung) {
  if (/^(Number|parseFloat|parseInt)\($/.test(verwendung)) return { type: 'number' };
  if (/^anhaenge$|^dateien$/.test(name)) return { type: 'array', items: { $ref: '#/components/schemas/Anhang' } };
  if (/^(foto|nachweis)$/.test(name)) return { $ref: '#/components/schemas/Anhang' };
  if (/(datum|Datum|Am|Ab|Bis|^von$|^bis$|beginn|ende)$/.test(name)) return { type: 'string', format: 'date' };
  if (/^(betrag|punkte|jahr|anzahl|menge|monat)/i.test(name)) return { type: 'number' };
  if (/^(ist|hat|aktiv|erteilt|einverstanden|zustimmung|richtigkeit)/.test(name)) return { type: 'boolean' };
  return {};
}

/** Anfragefelder: `a.body.x`, Destrukturierung `const { x } = a.body || {}`, Hilfsvariablen `const d = a.body || {}` */
function anfrageVon(fn) {
  const param = fn.parameters?.[0]?.name.getText() || 'a';
  const body = `${param}.body`;
  const felder = new Map();
  const variablen = new Map([[body, null]]);
  let ganzWeitergereicht = false;
  const pflicht = new Set();
  const query = new Set();
  const hinzu = (wurzel, name, verwendung = '') => {
    const pfad = variablen.get(wurzel);
    const ziel = pfad ? (felder.get(pfad)?.unter ?? (felder.set(pfad, { unter: new Map() }), felder.get(pfad).unter)) : felder;
    if (!ziel.has(name)) ziel.set(name, { schema: feldtyp(name, verwendung) });
  };
  const ohneFragezeichen = s => s.replace(/\?/g, '').replace(/\s/g, '');
  const besuchen = n => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = ohneFragezeichen(n.initializer.getText()).replace(/\|\|\{\}$|\|\|\[\]$/, '');
      if (ts.isIdentifier(n.name) && (init === body || init.startsWith(body + '.'))) {
        const rest = init.substring(body.length + 1);
        variablen.set(n.name.text, rest || null);
        if (rest) felder.set(rest, { unter: new Map() });
      } else if (ts.isObjectBindingPattern(n.name) && variablen.has(init)) {
        for (const el of n.name.elements) hinzu(init, (el.propertyName || el.name).getText());
      }
    }
    if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n))) {
      const basis = ohneFragezeichen(n.expression.getText());
      if (variablen.has(basis)) {
        const name = ts.isPropertyAccessExpression(n) ? n.name.text : (ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : undefined);
        const verwendung = n.parent && ts.isCallExpression(n.parent) ? n.parent.expression.getText() + '(' : '';
        if (name) hinzu(basis, name, verwendung);
      }
      if (basis === `${param}.query` && ts.isPropertyAccessExpression(n) && n.name.text === 'get' && ts.isCallExpression(n.parent) && ts.isStringLiteral(n.parent.arguments[0])) query.add(n.parent.arguments[0].text);
    }
    if (ts.isCallExpression(n)) {
      if (n.expression.getText() === 'pflicht' && n.arguments[1] && ts.isStringLiteral(n.arguments[1])) pflicht.add(n.arguments[1].text);
      if (n.arguments.some(arg => variablen.has(ohneFragezeichen(arg.getText()).replace(/\|\|\{\}$/, '')))) ganzWeitergereicht = true;
    }
    ts.forEachChild(n, besuchen);
  };
  besuchen(fn);
  const alsSchema = map => {
    const s = { type: 'object', properties: {} };
    for (const [k, v] of map) s.properties[k] = v.unter ? alsSchema(v.unter) : v.schema;
    const req = [...map.keys()].filter(k => pflicht.has(k));
    if (req.length) s.required = req;
    return s;
  };
  const schema = alsSchema(felder);
  if (ganzWeitergereicht) schema.additionalProperties = true;
  return { schema: felder.size || ganzWeitergereicht ? schema : null, query: [...query] };
}

function rueckgabeVon(fn) {
  const sig = pruefer.getSignatureFromDeclaration(fn);
  if (!sig) return {};
  let t = pruefer.getReturnTypeOfSignature(sig);
  if (t.symbol?.name === 'Promise') t = pruefer.getTypeArguments(t)[0] ?? t;
  return schemaVon(t);
}

// ------------------------------------------------------------------ Routentabellen einsammeln
const routen = [];
for (const datei of quellen) {
  const besuchen = n => {
    if (ts.isObjectLiteralExpression(n)) {
      const props = Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(), p.initializer]));
      if (props.methode && props.muster && props.handler && ts.isStringLiteral(props.methode) && ts.isStringLiteral(props.muster)) {
        const flag = k => props[k]?.kind === ts.SyntaxKind.TrueKeyword;
        routen.push({
          datei: relative(BACKEND, datei.fileName).replace(/\.ts$/, ''), methode: props.methode.text, muster: props.muster.text,
          handler: props.handler, oeffentlich: flag('oeffentlich'), hintergrund: flag('hintergrund'), multipart: flag('multipart'), dateiAntwort: flag('dateiAntwort'),
          rolle: props.rolle && ts.isStringLiteral(props.rolle) ? props.rolle.text : undefined,
        });
      }
    }
    ts.forEachChild(n, besuchen);
  };
  besuchen(datei);
}

// ------------------------------------------------------------------ OpenAPI zusammensetzen
const STATUSTEXT = { 400: 'Ungültige Anfrage', 401: 'Nicht angemeldet oder Sitzung abgelaufen', 403: 'Keine Berechtigung', 404: 'Nicht gefunden', 409: 'Konflikt mit dem aktuellen Zustand',
  410: 'Nicht mehr verfügbar', 413: 'Inhalt zu groß', 415: 'Nicht unterstütztes Format', 422: 'Fachlich nicht verarbeitbar', 423: 'Gesperrt', 429: 'Zu viele Anfragen', 503: 'Dienst nicht verfügbar' };

const pfade = {};
for (const r of routen.sort((x, y) => x.muster.localeCompare(y.muster) || x.methode.localeCompare(y.methode))) {
  const fn = deklarationVon(r.handler);
  const pfad = r.muster.replace(/:(\w+)/g, '{$1}');
  const parameter = [...r.muster.matchAll(/:(\w+)/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
  const op = { tags: [BEREICHE[r.datei] || r.datei], operationId: `${r.methode.toLowerCase()}${r.muster.replace(/\/api|[/:]/g, ' ').replace(/[-\s]+(\w)/g, (_, c) => c.toUpperCase())}` };
  const doku = fn && ts.getJSDocCommentsAndTags(ts.isArrowFunction(fn) ? fn.parent : fn).map(j => typeof j.comment === 'string' ? j.comment : '').filter(Boolean).join('\n');
  op.summary = doku?.split('\n')[0] || `${r.methode} ${r.muster}`;
  if (doku && doku.includes('\n')) op.description = doku;
  if (fn) {
    const { schema, query } = anfrageVon(fn);
    parameter.push(...query.map(q => ({ name: q, in: 'query', required: false, schema: { type: 'string' } })));
    if (r.multipart) op.requestBody = { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['datei'], properties: { datei: { type: 'string', format: 'binary' } } } } } };
    else if (schema && r.methode !== 'GET' && r.methode !== 'DELETE') op.requestBody = { content: { 'application/json': { schema } } };
  }
  if (parameter.length) op.parameters = parameter;
  const ok = r.methode === 'POST' ? '201' : '200';
  op.responses = { [ok]: r.dateiAntwort
    ? { description: 'Dateiinhalt', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }
    : { description: 'Erfolg', content: { 'application/json': { schema: fn ? rueckgabeVon(fn) : {} } } } };
  const fehler = fn ? fehlerVon(fn) : [];
  if (!r.oeffentlich) fehler.push({ status: 401, code: 'SITZUNG_ABGELAUFEN', meldung: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.' });
  if (r.rolle) fehler.push({ status: 403, meldung: 'Keine Berechtigung für diese Funktion.' });
  const nachStatus = new Map();
  for (const f of fehler) (nachStatus.get(f.status) ?? nachStatus.set(f.status, []).get(f.status)).push(f);
  for (const [status, liste] of [...nachStatus].sort((a, b) => a[0] - b[0])) {
    const codes = [...new Set(liste.map(f => f.code).filter(Boolean))];
    const beispiele = [...new Set(liste.map(f => f.meldung).filter(Boolean))].slice(0, 6);
    op.responses[status] = {
      description: [STATUSTEXT[status] || 'Fehler', codes.length ? `Codes: ${codes.join(', ')}` : '', ...beispiele.map(b => `- ${b}`)].filter(Boolean).join('\n'),
      content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
    };
  }
  op.security = r.oeffentlich ? [{}, { sitzung: [] }] : [{ sitzung: [] }];
  if (r.rolle) op['x-rolle'] = r.rolle;
  if (r.hintergrund) op['x-hintergrund'] = true;
  (pfade[pfad] ??= {})[r.methode.toLowerCase()] = op;
}

komponenten.Problem = {
  type: 'object', description: 'Fehlerantwort nach RFC 9457 (Problem Details for HTTP APIs) mit fachlichen Erweiterungen.',
  required: ['type', 'title', 'status', 'detail'],
  properties: {
    type: { type: 'string', description: 'URI-Referenz der Fehlerart, z. B. /probleme/sitzung-abgelaufen; about:blank ohne fachlichen Code' },
    title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string', description: 'Meldung für die Versicherten (deutsch)' },
    instance: { type: 'string' }, code: { type: 'string', description: 'Fachlicher Fehlercode, z. B. SITZUNG_ABGELAUFEN, GESPERRT, PFLICHTFELD' },
    feld: { type: 'string', description: 'Betroffenes Eingabefeld' },
    details: { type: 'array', items: { type: 'object', properties: { feld: { type: 'string' }, meldung: { type: 'string' } } }, description: 'Mehrere Feldfehler (Formulare)' },
  },
};

const vertrag = {
  openapi: '3.1.0',
  info: {
    title: 'VitaPlus Online-Geschäftsstelle – REST-Schnittstelle',
    version: paket.version,
    description: [
      'Vertrag zwischen Frontend und Backend der Online-Geschäftsstelle, erzeugt aus dem Simulations-Backend (`npm run api:vertrag`).',
      '',
      '**Anmeldung:** `POST /api/auth/login` liefert ein Token; ist die Zwei-Faktor-Anmeldung aktiv, ist es vorläufig und wird mit `POST /api/auth/zwei-faktor` bestätigt. Danach als `Authorization: Bearer <token>` senden. Sitzungen laufen nach 15 Minuten ohne Aktivität ab; Hintergrundabfragen (`x-hintergrund`) verlängern sie nicht.',
      '**Fehler:** immer `application/problem+json` (RFC 9457). Das Frontend zeigt `detail` an und wertet `code` und `feld` aus.',
      '**Dateien:** zuerst `POST /api/dateien` (multipart), die Antwort (Anhang) wird in Anträgen und Nachrichten referenziert. Das Backend akzeptiert nur Anhänge, die es selbst angenommen hat.',
      '**Zeitangaben:** ISO 8601; Zeitpunkte ohne Zonenangabe sind Ortszeit Europe/Berlin, Datumsangaben `JJJJ-MM-TT`.',
      '**Formulare:** Die Felder der Formular-Endpunkte ergeben sich aus dem Formularkatalog (`formularkatalog.json`); `GET /api/formulare/{code}/definition` liefert JSON Schema und UI-Schema.',
      '**Rollen:** `x-rolle` nennt die erforderliche Rolle (VERSICHERTER, SACHBEARBEITER, ADMIN).',
      '',
      'Anfragefelder sind aus dem Quelltext der Handler abgeleitet; Felder ohne Typangabe sind fachlich frei (meist Text).',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Gleicher Ursprung wie das Frontend' }],
  tags: [...new Set(Object.values(BEREICHE))].map(name => ({ name })),
  paths: pfade,
  components: {
    securitySchemes: { sitzung: { type: 'http', scheme: 'bearer', description: 'Sitzungstoken aus der Anmeldung' } },
    schemas: Object.fromEntries(Object.entries(komponenten).sort(([a], [b]) => a.localeCompare(b))),
  },
};

mkdirSync(ZIEL, { recursive: true });
writeFileSync(join(ZIEL, 'openapi.json'), JSON.stringify(vertrag, null, 2) + '\n');

// ------------------------------------------------------------------ Formularkatalog als JSON
const esbuild = join(WURZEL, 'node_modules/.bin/esbuild');
const katalogJs = execFileSync(esbuild, [join(WURZEL, 'src/app/core/formulare/formular-katalog.ts'), '--bundle', '--format=esm', '--platform=node', '--log-level=error'], { encoding: 'utf8' });
const modul = await import('data:text/javascript;base64,' + Buffer.from(katalogJs).toString('base64'));
writeFileSync(join(ZIEL, 'formularkatalog.json'), JSON.stringify({ formulare: modul.FORMULARE }, null, 2) + '\n');

const anzahl = Object.values(pfade).reduce((n, p) => n + Object.keys(p).length, 0);
console.log(`API-Vertrag: ${anzahl} Operationen, ${Object.keys(komponenten).length} Schemas → docs/api/openapi.json`);
console.log(`Formularkatalog: ${modul.FORMULARE.length} Formulare → docs/api/formularkatalog.json`);
