import { DIGA_LISTE, DMP_PROGRAMME } from '../konfiguration';
import { FeldDef, FormularDef, Option } from './formular-typen';

const o = (...werte: [string, string][]): Option[] => werte.map(([wert, text]) => ({ wert, text }));
const jaNein = o(['JA', 'Ja'], ['NEIN', 'Nein']);

const f = {
  text: (name: string, label: string, extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'text', pflicht: true, maxLaenge: 120, ...extra }),
  lang: (name: string, label: string, extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'textarea', pflicht: true, minLaenge: 10, maxLaenge: 2000, breit: true, ...extra }),
  datum: (name: string, label: string, extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'datum', pflicht: true, ...extra }),
  betrag: (name: string, label: string, extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'betrag', pflicht: true, min: 0.01, max: 100000, ...extra }),
  zahl: (name: string, label: string, extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'zahl', pflicht: true, ...extra }),
  wahl: (name: string, label: string, optionen: Option[], extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'auswahl', pflicht: true, optionen, ...extra }),
  radio: (name: string, label: string, optionen: Option[], extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'radio', pflicht: true, optionen, ...extra }),
  mehrfach: (name: string, label: string, optionen: Option[], extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'mehrfach', pflicht: true, optionen, breit: true, ...extra }),
  check: (name: string, label: string, extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'checkbox', ...extra }),
  datei: (name: string, label: string, extra: Partial<FeldDef> = {}): FeldDef => ({ name, label, typ: 'datei', pflicht: true, maxDateien: 5, breit: true, ...extra }),
  info: (text: string): FeldDef => ({ name: 'info_' + text.length, label: text, typ: 'info', breit: true }),
  person: (name = 'person', label = 'Für wen stellen Sie den Antrag?'): FeldDef => ({ name, label, typ: 'person', pflicht: true }),
};

/** Häufige Staatsangehörigkeiten (Adjektiv, wie in den Stammdaten gespeichert), deutsch zuerst */
const STAATSANGEHOERIGKEITEN = ['deutsch', 'afghanisch', 'ägyptisch', 'albanisch', 'algerisch', 'amerikanisch', 'argentinisch', 'armenisch', 'aserbaidschanisch',
  'äthiopisch', 'australisch', 'belgisch', 'bosnisch-herzegowinisch', 'brasilianisch', 'britisch', 'bulgarisch', 'chilenisch', 'chinesisch', 'dänisch', 'eritreisch',
  'estnisch', 'finnisch', 'französisch', 'georgisch', 'ghanaisch', 'griechisch', 'indisch', 'indonesisch', 'irakisch', 'iranisch', 'irisch', 'isländisch',
  'israelisch', 'italienisch', 'japanisch', 'jordanisch', 'kanadisch', 'kasachisch', 'kenianisch', 'kolumbianisch', 'koreanisch', 'kosovarisch', 'kroatisch',
  'lettisch', 'libanesisch', 'liechtensteinisch', 'litauisch', 'luxemburgisch', 'maltesisch', 'marokkanisch', 'mexikanisch', 'moldauisch', 'montenegrinisch',
  'niederländisch', 'nigerianisch', 'nordmazedonisch', 'norwegisch', 'österreichisch', 'pakistanisch', 'philippinisch', 'polnisch', 'portugiesisch',
  'rumänisch', 'russisch', 'schwedisch', 'schweizerisch', 'serbisch', 'slowakisch', 'slowenisch', 'somalisch', 'spanisch', 'sri-lankisch', 'südafrikanisch',
  'syrisch', 'thailändisch', 'tschechisch', 'tunesisch', 'türkisch', 'ukrainisch', 'ungarisch', 'usbekisch', 'vietnamesisch', 'zyprisch', 'staatenlos', 'ungeklärt'];

/** Gesetzliche Krankenkassen für die Angabe der Vorversicherung (Auswahl) */
const KRANKENKASSEN = ['AOK Baden-Württemberg', 'AOK Bayern', 'AOK Bremen/Bremerhaven', 'AOK Hessen', 'AOK Niedersachsen', 'AOK Nordost', 'AOK NordWest', 'AOK PLUS',
  'AOK Rheinland/Hamburg', 'AOK Rheinland-Pfalz/Saarland', 'AOK Sachsen-Anhalt', 'Audi BKK', 'BARMER', 'BIG direkt gesund', 'BKK firmus', 'BKK Mobil Oil',
  'DAK-Gesundheit', 'Handelskrankenkasse (hkk)', 'HEK – Hanseatische Krankenkasse', 'IKK classic', 'IKK gesund plus', 'IKK – Die Innovationskasse', 'IKK Südwest',
  'KKH Kaufmännische Krankenkasse', 'KNAPPSCHAFT', 'mhplus Krankenkasse', 'Mobil Krankenkasse', 'pronova BKK', 'SBK Siemens-Betriebskrankenkasse',
  'SVLFG Landwirtschaftliche Krankenkasse', 'Techniker Krankenkasse', 'VIACTIV Krankenkasse', 'andere Betriebskrankenkasse (BKK)', 'andere gesetzliche Krankenkasse',
  'private Krankenversicherung', 'Krankenversicherung im Ausland'];

const BUNDESLAENDER = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
  'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'];

export const FORMULARE: FormularDef[] = [
  // ------------------------------------------------------------ Leistungen
  {
    code: 'HAUSHALTSHILFE', titel: 'Haushaltshilfe beantragen', kurz: 'Haushaltshilfe', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 5, entwurfErlaubt: true,
    suchbegriffe: ['haushalt', 'hilfe', 'krankenhaus', 'kinderbetreuung'], lebenslagen: ['KRANK', 'FAMILIE'],
    schritte: [
      { titel: 'Zeitraum und Grund', felder: [
        f.datum('von', 'Beginn'), f.datum('bis', 'Ende'),
        f.wahl('grund', 'Grund', o(['KRANKENHAUS', 'Krankenhausaufenthalt'], ['REHA', 'Reha-Maßnahme'], ['SCHWERE_ERKRANKUNG', 'Schwere Erkrankung (ambulant)'], ['OPERATION', 'Ambulante Operation'])),
        f.zahl('stundenProTag', 'Benötigte Stunden pro Tag', { min: 1, max: 8 }),
        f.check('pflegebeduerftigesKind', 'Im Haushalt lebt ein behindertes oder pflegebedürftiges Kind'),
        f.check('keineAnderePerson', 'Keine andere im Haushalt lebende Person kann den Haushalt weiterführen', { pflicht: true }),
      ] },
      { titel: 'Haushaltshilfe', felder: [
        f.radio('art', 'Wer übernimmt die Haushaltshilfe?', o(['DIENST', 'Professioneller Dienst'], ['PRIVAT', 'Private Person (Nachbarn, Bekannte)'], ['VERWANDT', 'Verwandte/Verschwägerte bis 2. Grades'])),
        f.text('anbieter', 'Name des Dienstes bzw. der Person'),
        f.info('Verwandte und Verschwägerte bis zum 2. Grad erhalten keine Vergütung, sondern nur Fahrkosten und Verdienstausfall.'),
        f.datei('anhaenge', 'Ärztliche Bescheinigung', { pflicht: false }),
      ] },
    ],
  },
  {
    code: 'HAUSHALTSHILFE_SCHWANGERSCHAFT', titel: 'Haushaltshilfe bei Schwangerschaft und Entbindung', kurz: 'Haushaltshilfe Schwangerschaft', kategorie: 'LEISTUNG',
    zustaendig: 'Leistungen', bearbeitungTage: 3, entwurfErlaubt: true, suchbegriffe: ['schwanger', 'entbindung', 'geburt', 'haushalt'], lebenslagen: ['FAMILIE'],
    schritte: [{ titel: 'Angaben', felder: [
      f.datum('entbindungstermin', 'Voraussichtlicher oder tatsächlicher Entbindungstermin'),
      f.datum('von', 'Beginn der Haushaltshilfe'), f.datum('bis', 'Ende der Haushaltshilfe'),
      f.zahl('stundenProTag', 'Stunden pro Tag', { min: 1, max: 8 }),
      f.radio('anlass', 'Anlass', o(['SCHWANGERSCHAFT', 'Beschwerden in der Schwangerschaft'], ['ENTBINDUNG', 'Nach der Entbindung'])),
      f.datei('anhaenge', 'Ärztliche Bescheinigung oder Bescheinigung der Hebamme', { maxDateien: 2 }),
    ] }],
  },
  {
    code: 'HAEUSLICHE_KRANKENPFLEGE', titel: 'Häusliche Krankenpflege', kurz: 'Häusliche Krankenpflege', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 3,
    entwurfErlaubt: true, suchbegriffe: ['pflegedienst', 'verordnung', 'wundversorgung', 'spritzen'], lebenslagen: ['KRANK'],
    hinweis: 'Bitte reichen Sie die Verordnung spätestens am dritten Arbeitstag nach Ausstellung ein.',
    schritte: [{ titel: 'Verordnung', felder: [
      f.person(),
      f.datum('verordnungsdatum', 'Ausgestellt am', { nichtZukunft: true }),
      f.datum('von', 'Pflege ab'), f.datum('bis', 'Pflege bis'),
      f.mehrfach('massnahmen', 'Verordnete Maßnahmen', o(['MEDIKAMENTE', 'Medikamentengabe'], ['INJEKTION', 'Injektionen'], ['WUNDE', 'Wundversorgung'], ['KOMPRESSION', 'Kompressionsstrümpfe'], ['GRUNDPFLEGE', 'Grundpflege'], ['HAUSWIRTSCHAFT', 'Hauswirtschaftliche Versorgung'])),
      f.text('pflegedienst', 'Pflegedienst'),
      f.datei('anhaenge', 'Verordnung (Muster 12)'),
    ] }],
  },
  {
    code: 'HILFSMITTEL', titel: 'Hilfsmittel beantragen', kurz: 'Hilfsmittel', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 7, entwurfErlaubt: true,
    suchbegriffe: ['rollator', 'rollstuhl', 'hörgerät', 'einlagen', 'bandage', 'orthese'], lebenslagen: ['KRANK', 'PFLEGE'],
    schritte: [{ titel: 'Hilfsmittel', felder: [
      f.person(),
      f.wahl('hilfsmittel', 'Hilfsmittel', o(['Rollator', 'Rollator'], ['Rollstuhl', 'Rollstuhl'], ['Hörgerät', 'Hörgerät'], ['Orthopädische Einlagen', 'Orthopädische Einlagen'], ['Bandage', 'Bandage / Orthese'], ['Inhalationsgerät', 'Inhalationsgerät'], ['Blutzuckermessgerät', 'Blutzuckermessgerät'], ['Sonstiges', 'Sonstiges'])),
      f.text('beschreibung', 'Genaue Bezeichnung', { sichtbarWenn: { feld: 'hilfsmittel', gleich: 'Sonstiges' } }),
      f.datum('verordnungsdatum', 'Datum der Verordnung', { nichtZukunft: true }),
      f.text('sanitaetshaus', 'Gewünschtes Sanitätshaus', { pflicht: false }),
      f.datei('anhaenge', 'Verordnung und Kostenvoranschlag'),
    ] }],
  },
  {
    code: 'HEILMITTEL', titel: 'Langfristiger Heilmittelbedarf', kurz: 'Heilmittel', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 28, entwurfErlaubt: true,
    suchbegriffe: ['physiotherapie', 'ergotherapie', 'logopädie', 'krankengymnastik'], lebenslagen: ['KRANK'],
    schritte: [{ titel: 'Angaben', felder: [
      f.person(),
      f.wahl('heilmittel', 'Heilmittel', o(['PHYSIO', 'Physiotherapie'], ['ERGO', 'Ergotherapie'], ['LOGO', 'Logopädie'], ['PODO', 'Podologie'])),
      f.text('diagnose', 'Diagnose (ICD-10, falls bekannt)', { pflicht: false, muster: '^[A-Z]\\d{2}(\\.\\d{1,2})?$', musterText: 'Format z. B. M54.5' }),
      f.lang('begruendung', 'Begründung des langfristigen Bedarfs'),
      f.datei('anhaenge', 'Heilmittelverordnung und ärztliche Stellungnahme'),
    ] }],
  },
  {
    code: 'REHA', titel: 'Medizinische Rehabilitation', kurz: 'Reha', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 21, entwurfErlaubt: true,
    suchbegriffe: ['kur', 'reha', 'rehabilitation', 'mutter-kind-kur'], lebenslagen: ['KRANK', 'FAMILIE'],
    schritte: [
      { titel: 'Art der Reha', felder: [
        f.person(),
        f.radio('art', 'Art der Maßnahme', o(['AMBULANT', 'Ambulante Rehabilitation'], ['STATIONAER', 'Stationäre Rehabilitation'], ['MUTTER_KIND', 'Mutter-/Vater-Kind-Maßnahme'])),
        f.datum('letzteReha', 'Datum der letzten Reha (falls vorhanden)', { pflicht: false, nichtZukunft: true }),
        f.lang('ziel', 'Was soll mit der Reha erreicht werden?'),
      ] },
      { titel: 'Einrichtung und Unterlagen', felder: [
        f.text('wunscheinrichtung', 'Wunsch-Einrichtung', { pflicht: false }),
        f.check('begleitperson', 'Eine Begleitperson ist medizinisch erforderlich'),
        f.datei('anhaenge', 'Ärztliche Verordnung (Muster 61)'),
      ] },
    ],
  },
  {
    code: 'ANSCHLUSSREHA', titel: 'Anschlussrehabilitation (AHB)', kurz: 'Anschlussreha', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 2, entwurfErlaubt: false,
    suchbegriffe: ['ahb', 'anschlussheilbehandlung', 'krankenhaus', 'operation'], lebenslagen: ['KRANK'],
    schritte: [{ titel: 'Krankenhausaufenthalt', felder: [
      f.person(),
      f.text('krankenhaus', 'Krankenhaus'),
      f.datum('aufnahme', 'Aufnahme im Krankenhaus', { nichtZukunft: true }),
      f.datum('entlassung', 'Entlassung (geplant oder erfolgt)'),
      f.text('einrichtung', 'Reha-Einrichtung (lt. Sozialdienst)', { pflicht: false }),
      f.datei('anhaenge', 'AHB-Antrag des Sozialdienstes und Befundbericht'),
    ] }],
  },
  {
    code: 'FAHRKOSTEN', titel: 'Fahrkosten erstatten lassen', kurz: 'Fahrkosten', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 10, entwurfErlaubt: true,
    suchbegriffe: ['taxi', 'fahrt', 'dialyse', 'chemotherapie', 'kilometer'], lebenslagen: ['KRANK', 'GELD'],
    schritte: [
      { titel: 'Fahrt', felder: [
        f.person(),
        f.wahl('anlass', 'Anlass der Fahrt', o(['STATIONAER', 'Stationäre Behandlung'], ['AMBULANTE_OP', 'Ambulante Operation'], ['DIALYSE', 'Dialyse'], ['CHEMO', 'Chemo- oder Strahlentherapie'], ['SCHWERBEHINDERT', 'Fahrt mit Merkzeichen aG, Bl oder H'], ['SONSTIGES', 'Sonstige ambulante Behandlung'])),
        f.datum('fahrtdatum', 'Datum der Fahrt', { nichtZukunft: true, maxTageZurueck: 1460 }),
        f.radio('verkehrsmittel', 'Verkehrsmittel', o(['PKW', 'Privat-PKW'], ['OEPNV', 'Öffentliche Verkehrsmittel'], ['TAXI', 'Taxi / Mietwagen'])),
        f.zahl('kilometer', 'Gefahrene Kilometer (Hin- und Rückfahrt)', { min: 1, max: 2000, sichtbarWenn: { feld: 'verkehrsmittel', gleich: 'PKW' } }),
        f.betrag('kosten', 'Kosten laut Beleg', { sichtbarWenn: { feld: 'verkehrsmittel', in: ['OEPNV', 'TAXI'] } }),
      ] },
      { titel: 'Nachweise', felder: [
        f.check('genehmigungVorhanden', 'Die Fahrt wurde vorab von der VitaPlus genehmigt', { sichtbarWenn: { feld: 'anlass', gleich: 'SONSTIGES' } }),
        f.datei('anhaenge', 'Verordnung einer Krankenbeförderung und Belege'),
      ] },
    ],
  },
  {
    code: 'KRANKENTRANSPORT', titel: 'Krankentransport genehmigen lassen', kurz: 'Krankentransport', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 2, entwurfErlaubt: false,
    suchbegriffe: ['krankenwagen', 'ktw', 'liegendtransport'], lebenslagen: ['KRANK'],
    schritte: [{ titel: 'Transport', felder: [
      f.person(),
      f.radio('transportart', 'Art des Transports', o(['KTW', 'Krankentransportwagen'], ['TRAGESTUHL', 'Tragestuhl / Rollstuhl-Transport'])),
      f.datum('termin', 'Termin', { nichtVergangenheit: true }),
      f.text('ziel', 'Ziel (Praxis, Klinik)'),
      f.check('regelmaessig', 'Es handelt sich um eine Serienbehandlung'),
      f.datei('anhaenge', 'Verordnung einer Krankenbeförderung (Muster 4)'),
    ] }],
  },
  {
    code: 'ZAHNERSATZ', titel: 'Heil- und Kostenplan Zahnersatz', kurz: 'Zahnersatz', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 14, entwurfErlaubt: true,
    suchbegriffe: ['krone', 'brücke', 'implantat', 'prothese', 'festzuschuss', 'bonusheft'], lebenslagen: ['KRANK', 'GELD'],
    schritte: [
      { titel: 'Behandlung', felder: [
        f.text('zahnarzt', 'Zahnarztpraxis'),
        f.betrag('regelversorgung', 'Kosten der Regelversorgung laut Heil- und Kostenplan'),
        f.datum('geplanterBeginn', 'Geplanter Behandlungsbeginn', { pflicht: false }),
      ] },
      { titel: 'Bonusheft', felder: [
        f.wahl('bonusheftJahre', 'Lückenlos geführtes Bonusheft', o(['0', 'Nicht oder weniger als 5 Jahre'], ['5', '5 bis 9 Jahre'], ['10', '10 Jahre und mehr'])),
        f.check('bonusheftHochgeladen', 'Bonusheft ist als Nachweis beigefügt', { sichtbarWenn: { feld: 'bonusheftJahre', in: ['5', '10'] } }),
        f.check('haertefall', 'Ich beantrage die Härtefallregelung (geringes Einkommen)'),
        f.datei('anhaenge', 'Heil- und Kostenplan, ggf. Bonusheft'),
      ] },
    ],
  },
  {
    code: 'MUTTERSCHAFTSGELD', titel: 'Mutterschaftsgeld beantragen', kurz: 'Mutterschaftsgeld', kategorie: 'FAMILIE', zustaendig: 'Leistungen', bearbeitungTage: 7, entwurfErlaubt: true,
    suchbegriffe: ['mutterschutz', 'schwangerschaft', 'mutterschaftsgeld', 'schutzfrist'], lebenslagen: ['FAMILIE'],
    schritte: [{ titel: 'Schwangerschaft', felder: [
      f.datum('entbindungstermin', 'Voraussichtlicher Entbindungstermin'),
      f.check('mehrlinge', 'Mehrlingsschwangerschaft'),
      f.check('fruehgeburt', 'Frühgeburt oder Behinderung des Kindes festgestellt'),
      f.text('arbeitgeber', 'Arbeitgeber', { pflicht: false }),
      f.datei('anhaenge', 'Zeugnis über den mutmaßlichen Entbindungstermin', { maxDateien: 2 }),
    ] }],
  },
  {
    code: 'KINDERKRANKENGELD', titel: 'Kinderkrankengeld beantragen', kurz: 'Kinderkrankengeld', kategorie: 'FAMILIE', zustaendig: 'Leistungen', bearbeitungTage: 5, entwurfErlaubt: false,
    nurFuer: ['ANGESTELLT'], suchbegriffe: ['kind krank', 'kinderkrank', 'betreuung krankes kind'], lebenslagen: ['FAMILIE', 'KRANK'],
    schritte: [{ titel: 'Angaben', felder: [
      { name: 'kindId', label: 'Erkranktes Kind', typ: 'kind', pflicht: true },
      f.datum('von', 'Erster Tag', { maxTageZurueck: 365 }), f.datum('bis', 'Letzter Tag'),
      f.check('alleinerziehend', 'Ich bin alleinerziehend'),
      f.check('behinderung', 'Das Kind ist behindert und auf Hilfe angewiesen'),
      f.datei('anhaenge', 'Ärztliche Bescheinigung (Muster 21)', { pflicht: false }),
    ] }],
  },
  {
    code: 'KIEFERORTHOPAEDIE', titel: 'Kieferorthopädische Behandlung', kurz: 'Kieferorthopädie', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 21, entwurfErlaubt: true,
    suchbegriffe: ['zahnspange', 'kig', 'kieferorthopäde'], lebenslagen: ['FAMILIE'],
    schritte: [{ titel: 'Behandlungsplan', felder: [
      f.person('person', 'Patient/in'),
      f.text('kieferorthopaede', 'Kieferorthopädische Praxis'),
      f.wahl('kig', 'KIG-Behandlungsbedarfsgrad laut Plan', o(['1', 'Grad 1'], ['2', 'Grad 2'], ['3', 'Grad 3'], ['4', 'Grad 4'], ['5', 'Grad 5'])),
      f.check('kieferchirurgisch', 'Kombiniert kieferchirurgische Behandlung (bei Erwachsenen erforderlich)'),
      f.betrag('kosten', 'Geplante Gesamtkosten'),
      f.datei('anhaenge', 'Kieferorthopädischer Behandlungsplan'),
    ] }],
  },
  {
    code: 'KUENSTLICHE_BEFRUCHTUNG', titel: 'Künstliche Befruchtung', kurz: 'Künstliche Befruchtung', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 14, entwurfErlaubt: true,
    suchbegriffe: ['kinderwunsch', 'ivf', 'icsi', 'insemination'], lebenslagen: ['FAMILIE'],
    schritte: [{ titel: 'Behandlung', felder: [
      f.radio('verheiratet', 'Sind Sie mit Ihrem Partner bzw. Ihrer Partnerin verheiratet?', jaNein),
      f.datum('geburtsdatumPartner', 'Geburtsdatum Partner/in', { nichtZukunft: true }),
      f.wahl('methode', 'Methode', o(['IUI', 'Insemination'], ['IVF', 'In-vitro-Fertilisation'], ['ICSI', 'ICSI'])),
      f.zahl('versuch', 'Der wievielte Versuch ist geplant?', { min: 1, max: 10 }),
      f.betrag('kosten', 'Kosten laut Behandlungsplan'),
      f.datei('anhaenge', 'Behandlungsplan'),
    ] }],
  },
  {
    code: 'PSYCHOTHERAPIE', titel: 'Kostenerstattung Psychotherapie', kurz: 'Psychotherapie', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 21, entwurfErlaubt: true,
    suchbegriffe: ['therapie', 'psychotherapeut', 'depression', 'privatpraxis'], lebenslagen: ['KRANK'],
    hinweis: 'Eine Kostenerstattung für Privatpraxen ist nur möglich, wenn kein zugelassener Therapieplatz in zumutbarer Zeit verfügbar ist.',
    schritte: [{ titel: 'Angaben', felder: [
      f.person(),
      f.check('sprechstundeErfolgt', 'Eine psychotherapeutische Sprechstunde hat stattgefunden', { pflicht: true }),
      f.zahl('absagen', 'Anzahl der Absagen von Praxen mit Kassenzulassung', { min: 0, max: 50 }),
      f.text('privatpraxis', 'Behandelnde Privatpraxis'),
      f.wahl('verfahren', 'Verfahren', o(['VT', 'Verhaltenstherapie'], ['TP', 'Tiefenpsychologisch fundiert'], ['AP', 'Analytische Psychotherapie'], ['ST', 'Systemische Therapie'])),
      f.datei('anhaenge', 'PTV 11, Absageliste und Dringlichkeitsbescheinigung'),
    ] }],
  },
  {
    code: 'DIGA', titel: 'Digitale Gesundheitsanwendung (DiGA)', kurz: 'DiGA', kategorie: 'DIGITAL', zustaendig: 'Leistungen', bearbeitungTage: 3, entwurfErlaubt: false,
    suchbegriffe: ['app auf rezept', 'diga', 'gesundheitsapp', 'freischaltcode'], lebenslagen: ['KRANK'],
    schritte: [{ titel: 'Anwendung', felder: [
      f.wahl('diga', 'Anwendung', DIGA_LISTE.map(d => ({ wert: d.id, text: `${d.name} (${d.bereich})` }))),
      f.radio('weg', 'Wie liegt die Verordnung vor?', o(['REZEPT', 'Ärztliches Rezept'], ['NACHWEIS', 'Ohne Rezept – Nachweis der Diagnose'])),
      f.text('rezeptcode', 'Code vom Rezept (16-stellig)', { sichtbarWenn: { feld: 'weg', gleich: 'REZEPT' }, muster: '^[A-Z0-9]{16}$', musterText: '16 Zeichen, nur Großbuchstaben und Ziffern' }),
      f.datei('anhaenge', 'Nachweis der Diagnose', { sichtbarWenn: { feld: 'weg', gleich: 'NACHWEIS' } }),
    ] }],
  },
  {
    code: 'DMP', titel: 'Teilnahme an einem Behandlungsprogramm (DMP)', kurz: 'DMP-Teilnahme', kategorie: 'DIGITAL', zustaendig: 'Leistungen', bearbeitungTage: 7, entwurfErlaubt: false,
    suchbegriffe: ['chroniker', 'diabetes', 'asthma', 'copd', 'behandlungsprogramm'], lebenslagen: ['KRANK'],
    schritte: [{ titel: 'Programm', felder: [
      f.wahl('programm', 'Programm', DMP_PROGRAMME.map(p => ({ wert: p.code, text: p.name }))),
      f.text('arzt', 'Koordinierende Arztpraxis'),
      f.datum('einschreibung', 'Datum der Einschreibung in der Praxis', { nichtZukunft: true }),
      f.datei('anhaenge', 'Teilnahme- und Einwilligungserklärung'),
    ] }],
    einwilligung: 'Ich willige ein, dass meine Behandlungsdaten im Rahmen des Programms verarbeitet werden.',
  },
  {
    code: 'ZUZAHLUNGSBEFREIUNG', titel: 'Befreiung von Zuzahlungen', kurz: 'Zuzahlungsbefreiung', kategorie: 'LEISTUNG', zustaendig: 'Leistungen', bearbeitungTage: 10, entwurfErlaubt: true,
    suchbegriffe: ['zuzahlung', 'befreiung', 'belastungsgrenze', 'chroniker', 'befreiungsausweis'], lebenslagen: ['GELD', 'KRANK'],
    schritte: [
      { titel: 'Einkommen', beschreibung: 'Wir berechnen Ihre persönliche Belastungsgrenze aus den Bruttoeinnahmen aller Haushaltsangehörigen.', felder: [
        f.wahl('jahr', 'Kalenderjahr', o(['2026', '2026'], ['2025', '2025'])),
        f.betrag('bruttoeinnahmen', 'Jährliche Bruttoeinnahmen zum Lebensunterhalt (Haushalt)'),
        f.zahl('angehoerige', 'Anzahl weiterer Angehöriger im Haushalt (ohne Kinder)', { min: 0, max: 5 }),
        f.zahl('kinder', 'Anzahl Kinder im Haushalt', { min: 0, max: 10 }),
        f.check('chronisch', 'Ich bin chronisch krank (Bescheinigung Muster 55 liegt vor)'),
      ] },
      { titel: 'Zuzahlungen', felder: [
        f.radio('art', 'Was möchten Sie beantragen?', o(['ERSTATTUNG', 'Erstattung bereits geleisteter Zuzahlungen'], ['VORAUSZAHLUNG', 'Befreiung im Voraus (Vorauszahlung der Belastungsgrenze)'])),
        f.betrag('geleistet', 'Summe der geleisteten Zuzahlungen', { sichtbarWenn: { feld: 'art', gleich: 'ERSTATTUNG' }, min: 0 }),
        f.datei('anhaenge', 'Einkommensnachweise, Quittungen, ggf. Chroniker-Bescheinigung'),
      ] },
    ],
  },
  // ------------------------------------------------------------ Pflege
  {
    code: 'PFLEGEGRAD', titel: 'Pflegegrad beantragen', kurz: 'Pflegegrad', kategorie: 'PFLEGE', zustaendig: 'Pflegekasse', bearbeitungTage: 25, entwurfErlaubt: true,
    suchbegriffe: ['pflegegrad', 'pflegestufe', 'medizinischer dienst', 'begutachtung', 'höherstufung'], lebenslagen: ['PFLEGE'],
    schritte: [
      { titel: 'Pflegebedürftige Person', felder: [
        f.radio('fuer', 'Für wen beantragen Sie den Pflegegrad?', o(['SELBST', 'Für mich'], ['ANGEHOERIGER', 'Für einen Angehörigen (bei der VitaPlus versichert)'])),
        f.text('nameAngehoeriger', 'Name der pflegebedürftigen Person', { sichtbarWenn: { feld: 'fuer', gleich: 'ANGEHOERIGER' } }),
        f.text('versichertennummerAngehoeriger', 'Versichertennummer', { sichtbarWenn: { feld: 'fuer', gleich: 'ANGEHOERIGER' }, muster: '^[A-Z]\\d{9}$', musterText: 'Ein Buchstabe und 9 Ziffern' }),
        f.radio('antragsart', 'Art des Antrags', o(['ERST', 'Erstantrag'], ['HOEHER', 'Höherstufung'])),
      ] },
      { titel: 'Pflegesituation', felder: [
        f.mehrfach('bereiche', 'In welchen Bereichen wird Hilfe benötigt?', o(['MOBILITAET', 'Mobilität'], ['KOGNITION', 'Orientierung und Kommunikation'], ['VERHALTEN', 'Verhalten und Psyche'], ['SELBSTVERSORGUNG', 'Körperpflege, Essen, Toilette'], ['THERAPIE', 'Umgang mit Medikamenten und Therapien'], ['ALLTAG', 'Gestaltung des Alltags'])),
        f.radio('wohnsituation', 'Wohnsituation', o(['ALLEIN', 'Lebt allein'], ['ANGEHOERIGE', 'Lebt mit Angehörigen'], ['HEIM', 'Pflegeeinrichtung'])),
        f.radio('leistung', 'Gewünschte Leistung', o(['PFLEGEGELD', 'Pflegegeld (Pflege durch Angehörige)'], ['SACHLEISTUNG', 'Pflegesachleistung (Pflegedienst)'], ['KOMBINATION', 'Kombination'])),
        f.radio('begutachtung', 'Begutachtung durch den Medizinischen Dienst', o(['HAUSBESUCH', 'Hausbesuch'], ['TELEFON', 'Telefoninterview (nur Höherstufung)'])),
        f.text('pflegeperson', 'Name der Pflegeperson', { pflicht: false }),
      ] },
    ],
  },
  {
    code: 'VERHINDERUNGSPFLEGE', titel: 'Verhinderungspflege abrechnen', kurz: 'Verhinderungspflege', kategorie: 'PFLEGE', zustaendig: 'Pflegekasse', bearbeitungTage: 14, entwurfErlaubt: true,
    suchbegriffe: ['ersatzpflege', 'urlaub pflegeperson', 'verhinderung'], lebenslagen: ['PFLEGE'],
    schritte: [{ titel: 'Ersatzpflege', felder: [
      f.datum('von', 'Beginn', { nichtZukunft: true }), f.datum('bis', 'Ende', { nichtZukunft: true }),
      f.radio('ersatzpflege', 'Wer hat die Ersatzpflege übernommen?', o(['DIENST', 'Pflegedienst'], ['PRIVAT', 'Nicht verwandte Person'], ['VERWANDT', 'Verwandte/r bis 2. Grades oder im Haushalt lebend'])),
      f.text('ersatzperson', 'Name der Ersatzpflegeperson bzw. des Dienstes'),
      f.betrag('kosten', 'Entstandene Kosten'),
      f.datei('anhaenge', 'Rechnung oder Quittung'),
    ] }],
  },
  {
    code: 'KURZZEITPFLEGE', titel: 'Kurzzeitpflege beantragen', kurz: 'Kurzzeitpflege', kategorie: 'PFLEGE', zustaendig: 'Pflegekasse', bearbeitungTage: 7, entwurfErlaubt: true,
    suchbegriffe: ['kurzzeitpflege', 'pflegeheim vorübergehend', 'nach krankenhaus'], lebenslagen: ['PFLEGE'],
    schritte: [{ titel: 'Kurzzeitpflege', felder: [
      f.text('einrichtung', 'Pflegeeinrichtung'),
      f.datum('von', 'Aufnahme'), f.datum('bis', 'Entlassung'),
      f.betrag('kosten', 'Voraussichtliche pflegebedingte Kosten'),
      f.datei('anhaenge', 'Kostenvoranschlag der Einrichtung', { pflicht: false }),
    ] }],
  },
  {
    code: 'PFLEGEHILFSMITTEL', titel: 'Pflegehilfsmittel', kurz: 'Pflegehilfsmittel', kategorie: 'PFLEGE', zustaendig: 'Pflegekasse', bearbeitungTage: 7, entwurfErlaubt: false,
    suchbegriffe: ['handschuhe', 'desinfektion', 'bettschutz', 'pflegebett', 'hausnotruf'], lebenslagen: ['PFLEGE'],
    schritte: [{ titel: 'Hilfsmittel', felder: [
      f.radio('art', 'Art', o(['VERBRAUCH', 'Zum Verbrauch bestimmte Pflegehilfsmittel (monatliche Box)'], ['TECHNISCH', 'Technische Pflegehilfsmittel'])),
      f.mehrfach('produkte', 'Produkte', o(['HANDSCHUHE', 'Einmalhandschuhe'], ['DESINFEKTION', 'Desinfektionsmittel'], ['BETTSCHUTZ', 'Bettschutzeinlagen'], ['MUNDSCHUTZ', 'Mundschutz'], ['SCHUERZEN', 'Schutzschürzen']), { sichtbarWenn: { feld: 'art', gleich: 'VERBRAUCH' } }),
      f.wahl('technisch', 'Technisches Hilfsmittel', o(['PFLEGEBETT', 'Pflegebett'], ['HAUSNOTRUF', 'Hausnotruf'], ['LAGERUNG', 'Lagerungshilfen']), { sichtbarWenn: { feld: 'art', gleich: 'TECHNISCH' } }),
      f.text('lieferant', 'Lieferant / Sanitätshaus'),
    ] }],
  },
  {
    code: 'WOHNUMFELD', titel: 'Zuschuss für Wohnumfeldverbesserung', kurz: 'Wohnumfeld', kategorie: 'PFLEGE', zustaendig: 'Pflegekasse', bearbeitungTage: 21, entwurfErlaubt: true,
    suchbegriffe: ['umbau', 'barrierefrei', 'treppenlift', 'dusche', 'rampe'], lebenslagen: ['PFLEGE'],
    schritte: [{ titel: 'Maßnahme', felder: [
      f.wahl('massnahme', 'Maßnahme', o(['DUSCHE', 'Bodengleiche Dusche'], ['TREPPENLIFT', 'Treppenlift'], ['TUEREN', 'Türverbreiterung'], ['RAMPE', 'Rampe'], ['SONSTIGES', 'Sonstige Umbaumaßnahme'])),
      f.betrag('kosten', 'Kosten laut Kostenvoranschlag'),
      f.datum('beginn', 'Geplanter Beginn', { nichtVergangenheit: true }),
      f.radio('eigentum', 'Wohnverhältnis', o(['EIGENTUM', 'Eigentum'], ['MIETE', 'Miete (Zustimmung Vermieter erforderlich)'])),
      f.check('zustimmungVermieter', 'Zustimmung des Vermieters liegt vor', { sichtbarWenn: { feld: 'eigentum', gleich: 'MIETE' } }),
      f.datei('anhaenge', 'Kostenvoranschlag, ggf. Fotos'),
    ] }],
  },
  {
    code: 'ENTLASTUNGSBETRAG', titel: 'Entlastungsbetrag abrechnen', kurz: 'Entlastungsbetrag', kategorie: 'PFLEGE', zustaendig: 'Pflegekasse', bearbeitungTage: 10, entwurfErlaubt: false,
    suchbegriffe: ['entlastung', 'alltagshilfe', 'haushaltshilfe pflege', '131'], lebenslagen: ['PFLEGE', 'GELD'],
    schritte: [{ titel: 'Rechnung', felder: [
      f.text('anbieter', 'Anerkannter Anbieter'),
      f.datum('leistungsmonat', 'Leistungsmonat (beliebiger Tag)', { nichtZukunft: true }),
      f.betrag('betrag', 'Rechnungsbetrag'),
      f.datei('anhaenge', 'Rechnung'),
    ] }],
  },
  {
    code: 'PFLEGEPERSON', titel: 'Angaben zur Pflegeperson', kurz: 'Pflegeperson', kategorie: 'PFLEGE', zustaendig: 'Pflegekasse', bearbeitungTage: 14, entwurfErlaubt: true,
    suchbegriffe: ['pflegeperson', 'rentenversicherung pflege', 'pflegezeit'], lebenslagen: ['PFLEGE'],
    schritte: [{ titel: 'Pflegeperson', felder: [
      f.text('name', 'Name der Pflegeperson'),
      f.datum('geburtsdatum', 'Geburtsdatum', { nichtZukunft: true }),
      f.zahl('stunden', 'Pflegestunden pro Woche', { min: 1, max: 168 }),
      f.zahl('tage', 'Verteilt auf wie viele Tage pro Woche?', { min: 1, max: 7 }),
      f.zahl('erwerbsstunden', 'Eigene Erwerbstätigkeit in Stunden pro Woche', { min: 0, max: 60 }),
    ] }],
  },
  // ------------------------------------------------------------ Mitgliedschaft
  {
    code: 'MITGLIEDSANTRAG', titel: 'Mitglied werden', kurz: 'Mitglied werden', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 3,
    entwurfErlaubt: false, oeffentlich: true, suchbegriffe: ['wechsel', 'mitglied', 'beitritt', 'kassenwechsel'], lebenslagen: ['JOB'],
    einwilligung: 'Ich habe die Datenschutzhinweise gelesen und bin mit der Verarbeitung meiner Daten zur Durchführung der Mitgliedschaft einverstanden.',
    schritte: [
      { titel: 'Persönliche Daten', felder: [
        f.wahl('anrede', 'Anrede', o(['FRAU', 'Frau'], ['HERR', 'Herr'], ['DIVERS', 'Divers'])),
        f.text('vorname', 'Vorname'), f.text('nachname', 'Nachname'),
        f.datum('geburtsdatum', 'Geburtsdatum', { nichtZukunft: true }),
        f.text('geburtsort', 'Geburtsort', { pflicht: false }),
        f.wahl('staatsangehoerigkeit', 'Staatsangehörigkeit', STAATSANGEHOERIGKEITEN.map(w => ({ wert: w, text: w }))),
      ] },
      { titel: 'Kontakt und Anschrift', felder: [
        { name: 'email', label: 'E-Mail-Adresse', typ: 'email', pflicht: true, hilfe: 'An diese Adresse senden wir Ihre Bestätigung und Ihre Versichertennummer.' },
        { name: 'telefon', label: 'Telefon (für Rückfragen)', typ: 'telefon' },
        f.text('strasse', 'Straße und Hausnummer'), f.text('plz', 'PLZ', { muster: '^\\d{5}$', musterText: '5 Ziffern' }), f.text('ort', 'Ort'),
        f.wahl('bundesland', 'Bundesland', BUNDESLAENDER.map(b => ({ wert: b, text: b }))),
      ] },
      { titel: 'Beschäftigung', felder: [
        f.wahl('status', 'Beschäftigungsstatus', o(['ANGESTELLT', 'Angestellt'], ['AUSZUBILDEND', 'In Ausbildung'], ['STUDENT', 'Student/in'], ['SELBSTSTAENDIG', 'Selbstständig'], ['RENTNER', 'Rentner/in'], ['ARBEITSLOS', 'Arbeitslos'])),
        f.text('arbeitgeber', 'Arbeitgeber', { sichtbarWenn: { feld: 'status', in: ['ANGESTELLT', 'AUSZUBILDEND'] } }),
        f.text('arbeitgeberOrt', 'Ort des Arbeitgebers', { pflicht: false, sichtbarWenn: { feld: 'status', in: ['ANGESTELLT', 'AUSZUBILDEND'] } }),
        f.betrag('brutto', 'Monatliches Bruttoeinkommen', { sichtbarWenn: { feld: 'status', in: ['ANGESTELLT', 'SELBSTSTAENDIG'] } }),
        f.text('hochschule', 'Hochschule', { sichtbarWenn: { feld: 'status', gleich: 'STUDENT' } }),
        f.info('Arbeitslosengeld-Beziehende melden wir über die Agentur für Arbeit an – bitte teilen Sie uns dort Ihre Kassenwahl mit.'),
      ] },
      { titel: 'Bisherige Versicherung', felder: [
        f.radio('vorversicherung', 'Wie waren Sie bisher versichert?', o(['GKV', 'Gesetzlich'], ['PKV', 'Privat'], ['FAMILIE', 'Familienversichert'], ['KEINE', 'Nicht versichert / aus dem Ausland'])),
        f.wahl('bisherigeKasse', 'Bisherige Krankenkasse', KRANKENKASSEN.map(w => ({ wert: w, text: w })), { sichtbarWenn: { feld: 'vorversicherung', in: ['GKV', 'PKV', 'FAMILIE'] } }),
        f.datum('versichertSeit', 'Dort versichert seit', { nichtZukunft: true, sichtbarWenn: { feld: 'vorversicherung', in: ['GKV'] } }),
        f.info('Bei einem Wechsel innerhalb der gesetzlichen Krankenversicherung müssen Sie nicht selbst kündigen – das übernehmen wir.'),
      ] },
      { titel: 'Beginn und Tarif', felder: [
        { name: 'beginn', label: 'Gewünschter Beginn bei der VitaPlus', typ: 'auswahl', pflicht: true, optionenQuelle: 'MONATSERSTE',
          hilfe: 'Eine Mitgliedschaft beginnt immer am Monatsersten. Bei einem Kassenwechsel gilt eine Kündigungsfrist von zwei Monaten zum Monatsende.' },
        f.radio('tarif', 'Tarif', o(['BASIS', 'VitaPlus Basis – alle gesetzlichen Leistungen'], ['KOMFORT', 'VitaPlus Komfort – mit Zahnreinigung, Osteopathie, Reiseimpfungen'], ['PREMIUM', 'VitaPlus Premium – höchste Zuschüsse und Gesundheitsbudget'])),
        f.check('familieMitversichern', 'Ich möchte Familienangehörige beitragsfrei mitversichern'),
        { name: 'familie', label: 'Mitzuversichernde Angehörige', typ: 'liste', pflicht: true, minEintraege: 1, maxEintraege: 6, eintragBezeichnung: 'Angehörige/r', breit: true,
          sichtbarWenn: { feld: 'familieMitversichern', gleich: true },
          unterfelder: [
            f.text('vorname', 'Vorname'), f.text('nachname', 'Nachname'),
            f.datum('geburtsdatum', 'Geburtsdatum', { nichtZukunft: true }),
            f.wahl('beziehung', 'Beziehung', o(['EHEPARTNER', 'Ehepartner/in'], ['LEBENSPARTNER', 'Eingetragene/r Lebenspartner/in'], ['KIND', 'Kind'], ['STIEFKIND', 'Stiefkind'], ['ENKELKIND', 'Enkelkind'])),
          ] },
      ] },
      { titel: 'Bankverbindung', beschreibung: 'Für Erstattungen und – falls Sie Ihre Beiträge selbst zahlen – für den Beitragseinzug.', felder: [
        { name: 'iban', label: 'IBAN', typ: 'iban', pflicht: false },
        f.text('kontoinhaber', 'Kontoinhaber/in', { pflicht: false }),
        f.check('sepaMandat', 'Ich erteile der VitaPlus ein SEPA-Lastschriftmandat für meine Beiträge', { sichtbarWenn: { feld: 'status', in: ['SELBSTSTAENDIG', 'STUDENT', 'RENTNER'] } }),
      ] },
    ],
  },
  {
    code: 'ARBEITGEBERWECHSEL', titel: 'Neuen Arbeitgeber melden', kurz: 'Arbeitgeberwechsel', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 3,
    entwurfErlaubt: false, suchbegriffe: ['jobwechsel', 'neuer job', 'arbeitgeber'], lebenslagen: ['JOB'],
    schritte: [{ titel: 'Neue Beschäftigung', felder: [
      f.text('arbeitgeber', 'Neuer Arbeitgeber'),
      f.datum('beginn', 'Beginn der Beschäftigung'),
      f.betrag('brutto', 'Monatliches Bruttoentgelt'),
      f.radio('art', 'Art der Beschäftigung', o(['VOLLZEIT', 'Vollzeit'], ['TEILZEIT', 'Teilzeit'], ['MINIJOB', 'Minijob'])),
      f.check('mehrfach', 'Ich habe zusätzlich weitere Beschäftigungen'),
    ] }],
  },
  {
    code: 'BESCHAEFTIGUNGSENDE', titel: 'Ende der Beschäftigung melden', kurz: 'Beschäftigungsende', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 5,
    entwurfErlaubt: false, suchbegriffe: ['kündigung job', 'arbeitslos', 'jobverlust'], lebenslagen: ['JOB'],
    schritte: [{ titel: 'Ende', felder: [
      f.datum('ende', 'Letzter Arbeitstag'),
      f.wahl('grund', 'Grund', o(['KUENDIGUNG_AN', 'Eigene Kündigung'], ['KUENDIGUNG_AG', 'Kündigung durch Arbeitgeber'], ['BEFRISTUNG', 'Befristung ausgelaufen'], ['AUFHEBUNG', 'Aufhebungsvertrag'])),
      f.wahl('anschluss', 'Wie geht es weiter?', o(['NEUER_JOB', 'Neue Beschäftigung'], ['ALG1', 'Arbeitslosengeld'], ['SELBSTSTAENDIG', 'Selbstständigkeit'], ['AUSLAND', 'Wegzug ins Ausland'], ['KEINE', 'Noch offen / keine Einkünfte'])),
    ] }],
  },
  {
    code: 'SELBSTSTAENDIGKEIT', titel: 'Selbstständigkeit melden', kurz: 'Selbstständigkeit', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 7,
    entwurfErlaubt: true, suchbegriffe: ['selbstständig', 'freiberuflich', 'gründung', 'gewerbe'], lebenslagen: ['JOB'],
    schritte: [{ titel: 'Tätigkeit', felder: [
      f.radio('ereignis', 'Was möchten Sie melden?', o(['BEGINN', 'Aufnahme einer Selbstständigkeit'], ['ENDE', 'Ende der Selbstständigkeit'])),
      f.datum('datum', 'Datum'),
      f.text('taetigkeit', 'Art der Tätigkeit', { sichtbarWenn: { feld: 'ereignis', gleich: 'BEGINN' } }),
      f.betrag('einkommen', 'Voraussichtliches monatliches Einkommen', { sichtbarWenn: { feld: 'ereignis', gleich: 'BEGINN' }, min: 0 }),
      f.radio('hauptberuflich', 'Hauptberuflich?', jaNein, { sichtbarWenn: { feld: 'ereignis', gleich: 'BEGINN' } }),
      f.radio('krankengeld', 'Möchten Sie Anspruch auf Krankengeld?', jaNein, { sichtbarWenn: { feld: 'ereignis', gleich: 'BEGINN' } }),
    ] }],
  },
  {
    code: 'STUDIUM', titel: 'Studium melden', kurz: 'Studienbescheinigung', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 3,
    entwurfErlaubt: false, suchbegriffe: ['studium', 'immatrikulation', 'studienbescheinigung', 'semester'], lebenslagen: ['JOB'],
    schritte: [{ titel: 'Studium', felder: [
      f.text('hochschule', 'Hochschule'),
      f.text('semester', 'Semester', { platzhalter: 'z. B. WiSe 2026/27', muster: '^(WiSe|SoSe) \\d{4}(\\/\\d{2})?$', musterText: 'Format: WiSe 2026/27 oder SoSe 2027' }),
      f.datum('studienende', 'Voraussichtliches Studienende', { nichtVergangenheit: true, pflicht: false }),
      f.datei('anhaenge', 'Immatrikulationsbescheinigung', { maxDateien: 1 }),
    ] }],
  },
  {
    code: 'AUSBILDUNG', titel: 'Ausbildungsbeginn melden', kurz: 'Ausbildung', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 3,
    entwurfErlaubt: false, suchbegriffe: ['ausbildung', 'azubi', 'lehre'], lebenslagen: ['JOB', 'FAMILIE'],
    schritte: [{ titel: 'Ausbildung', felder: [
      f.person('person', 'Wer beginnt die Ausbildung?'),
      f.text('betrieb', 'Ausbildungsbetrieb / Schule'),
      f.datum('beginn', 'Beginn'), f.datum('ende', 'Voraussichtliches Ende'),
      f.betrag('verguetung', 'Monatliche Ausbildungsvergütung', { min: 0 }),
      f.datei('anhaenge', 'Ausbildungsvertrag oder Schulbescheinigung', { pflicht: false }),
    ] }],
  },
  {
    code: 'RENTE', titel: 'Rentenantrag / Renteneintritt melden', kurz: 'Rente', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 14,
    entwurfErlaubt: true, suchbegriffe: ['rente', 'ruhestand', 'kvdr', 'rentner'], lebenslagen: ['RENTE'],
    schritte: [{ titel: 'Rente', felder: [
      f.wahl('rentenart', 'Rentenart', o(['ALTER', 'Altersrente'], ['ERWERBSMINDERUNG', 'Erwerbsminderungsrente'], ['WITWEN', 'Hinterbliebenenrente'], ['WAISEN', 'Waisenrente'])),
      f.datum('beginn', 'Rentenbeginn'),
      f.datum('antragGestelltAm', 'Rentenantrag gestellt am', { nichtZukunft: true }),
      f.text('traeger', 'Rentenversicherungsträger', { platzhalter: 'z. B. Deutsche Rentenversicherung Bund' }),
      f.check('weiterBeschaeftigt', 'Ich arbeite neben der Rente weiter'),
      f.datei('anhaenge', 'Rentenbescheid (sofern vorhanden)', { pflicht: false }),
    ] }],
  },
  {
    code: 'AUSLAND', titel: 'Auslandsaufenthalt melden', kurz: 'Ausland', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 5,
    entwurfErlaubt: true, suchbegriffe: ['ausland', 'auslandssemester', 'entsendung', 'auswandern'], lebenslagen: ['AUSLAND'],
    schritte: [{ titel: 'Aufenthalt', felder: [
      f.wahl('art', 'Art des Aufenthalts', o(['STUDIUM', 'Studium / Praktikum'], ['ENTSENDUNG', 'Entsendung durch Arbeitgeber'], ['ARBEIT', 'Arbeit bei ausländischem Arbeitgeber'], ['WOHNSITZ', 'Verlegung des Wohnsitzes'], ['LANGZEITREISE', 'Längere Reise (über 6 Wochen)'])),
      f.text('land', 'Land'),
      f.datum('von', 'Von'), f.datum('bis', 'Bis', { pflicht: false }),
      f.radio('eu', 'Liegt das Land in der EU, im EWR oder der Schweiz?', jaNein),
    ] }],
  },
  {
    code: 'KUENDIGUNG', titel: 'Mitgliedschaft beenden', kurz: 'Kündigung', kategorie: 'MITGLIEDSCHAFT', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 14,
    entwurfErlaubt: false, suchbegriffe: ['kündigen', 'austritt', 'wechseln', 'sonderkündigung', 'private krankenversicherung'], lebenslagen: ['JOB', 'AUSLAND'],
    hinweis: 'Bei einem Wechsel zu einer anderen gesetzlichen Krankenkasse müssen Sie nicht selbst kündigen – die neue Kasse informiert uns elektronisch.',
    einwilligung: 'Mir ist bewusst, dass mit dem Ende der Mitgliedschaft auch die Familienversicherung meiner Angehörigen endet.',
    schritte: [{ titel: 'Kündigung', felder: [
      f.wahl('grund', 'Grund', o(['PKV', 'Wechsel in die private Krankenversicherung'], ['AUSLAND', 'Wegzug ins Ausland'], ['GKV_WECHSEL', 'Wechsel zu einer anderen gesetzlichen Kasse'], ['SONDERKUENDIGUNG', 'Sonderkündigung wegen Erhöhung des Zusatzbeitrags'])),
      f.text('neueVersicherung', 'Neue Versicherung', { sichtbarWenn: { feld: 'grund', in: ['PKV', 'GKV_WECHSEL'] } }),
      f.datei('anhaenge', 'Versicherungsnachweis der privaten Krankenversicherung', { sichtbarWenn: { feld: 'grund', gleich: 'PKV' } }),
      f.lang('anmerkung', 'Möchten Sie uns etwas mitteilen?', { pflicht: false, minLaenge: 0 }),
    ] }],
  },
  {
    code: 'EINKOMMEN', titel: 'Einkommensänderung mitteilen', kurz: 'Einkommen', kategorie: 'BEITRAG', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 10,
    entwurfErlaubt: true, nurFuer: ['SELBSTSTAENDIG', 'RENTNER'], suchbegriffe: ['einkommen', 'beitrag neu', 'steuerbescheid', 'einnahmen'], lebenslagen: ['GELD'],
    schritte: [{ titel: 'Einkommen', felder: [
      f.betrag('einkommen', 'Neues monatliches Einkommen (brutto)', { min: 0 }),
      f.datum('ab', 'Gültig ab'),
      f.wahl('art', 'Art der Einnahmen', o(['GEWINN', 'Gewinn aus selbstständiger Tätigkeit'], ['RENTE', 'Rente / Versorgungsbezüge'], ['MIETE', 'Vermietung und Verpachtung'], ['KAPITAL', 'Kapitalerträge'])),
      f.datei('anhaenge', 'Nachweis (z. B. Einkommensteuerbescheid)', { pflicht: false }),
    ] }],
  },
  {
    code: 'STEUERBESCHEID', titel: 'Einkommensteuerbescheid einreichen', kurz: 'Steuerbescheid', kategorie: 'BEITRAG', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 14,
    entwurfErlaubt: false, nurFuer: ['SELBSTSTAENDIG'], suchbegriffe: ['steuerbescheid', 'finanzamt', 'beitragsfestsetzung'], lebenslagen: ['GELD'],
    schritte: [{ titel: 'Bescheid', felder: [
      f.wahl('jahr', 'Veranlagungsjahr', o(['2025', '2025'], ['2024', '2024'], ['2023', '2023'])),
      f.datum('bescheiddatum', 'Datum des Bescheids', { nichtZukunft: true }),
      f.betrag('einkuenfte', 'Summe der Einkünfte laut Bescheid', { min: 0 }),
      f.datei('anhaenge', 'Einkommensteuerbescheid (alle Seiten)'),
    ] }],
  },
  {
    code: 'RATENZAHLUNG', titel: 'Ratenzahlung beantragen', kurz: 'Ratenzahlung', kategorie: 'BEITRAG', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 7,
    entwurfErlaubt: false, suchbegriffe: ['raten', 'rückstand', 'schulden', 'mahnung'], lebenslagen: ['GELD'],
    schritte: [{ titel: 'Raten', felder: [
      f.zahl('anzahlRaten', 'Anzahl der Raten', { min: 2, max: 12 }),
      f.datum('ersteRate', 'Erste Rate am', { nichtVergangenheit: true }),
      f.lang('begruendung', 'Begründung'),
    ] }],
  },
  {
    code: 'STUNDUNG', titel: 'Stundung beantragen', kurz: 'Stundung', kategorie: 'BEITRAG', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 7,
    entwurfErlaubt: false, suchbegriffe: ['stundung', 'zahlungsaufschub', 'beitrag später'], lebenslagen: ['GELD'],
    schritte: [{ titel: 'Stundung', felder: [
      f.datum('bis', 'Stundung bis'),
      f.lang('begruendung', 'Begründung (vorübergehende Zahlungsschwierigkeiten)'),
      f.datei('anhaenge', 'Nachweise über die wirtschaftliche Situation'),
    ] }],
  },
  // ------------------------------------------------------------ Familie
  {
    code: 'GEBURT', titel: 'Geburt melden und Kind anmelden', kurz: 'Geburt', kategorie: 'FAMILIE', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 3,
    entwurfErlaubt: false, suchbegriffe: ['baby', 'neugeboren', 'geburt', 'kind anmelden'], lebenslagen: ['FAMILIE'],
    schritte: [
      { titel: 'Ihr Kind', felder: [
        f.text('vorname', 'Vorname des Kindes'), f.text('nachname', 'Nachname des Kindes'),
        f.datum('geburtsdatum', 'Geburtsdatum', { nichtZukunft: true }),
        f.wahl('geschlecht', 'Geschlecht', o(['W', 'weiblich'], ['M', 'männlich'], ['D', 'divers'])),
        f.check('mehrlinge', 'Mehrlingsgeburt'),
      ] },
      { titel: 'Anderer Elternteil', felder: [
        f.radio('anderesElternteilVersicherung', 'Wie ist der andere Elternteil versichert?', o(['VITAPLUS', 'Bei der VitaPlus'], ['GKV', 'Andere gesetzliche Kasse'], ['PKV', 'Privat'], ['KEINE', 'Nicht vorhanden / unbekannt'])),
        f.betrag('einkommenAnderesElternteil', 'Monatliches Bruttoeinkommen des anderen Elternteils', { sichtbarWenn: { feld: 'anderesElternteilVersicherung', gleich: 'PKV' }, min: 0 }),
        f.check('verheiratet', 'Wir sind verheiratet', { sichtbarWenn: { feld: 'anderesElternteilVersicherung', gleich: 'PKV' } }),
        f.datei('anhaenge', 'Geburtsurkunde (für Krankenkassenzwecke)'),
      ] },
    ],
  },
  {
    code: 'ELTERNZEIT', titel: 'Elternzeit melden', kurz: 'Elternzeit', kategorie: 'FAMILIE', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 5, entwurfErlaubt: false,
    nurFuer: ['ANGESTELLT'], suchbegriffe: ['elternzeit', 'elterngeld', 'babypause'], lebenslagen: ['FAMILIE', 'JOB'],
    schritte: [{ titel: 'Elternzeit', felder: [
      { name: 'kind', label: 'Für welches Kind?', typ: 'kind', pflicht: true },
      f.datum('von', 'Beginn'), f.datum('bis', 'Ende'),
      f.radio('teilzeit', 'Arbeiten Sie während der Elternzeit in Teilzeit?', jaNein),
      f.zahl('stunden', 'Wochenstunden', { min: 1, max: 32, sichtbarWenn: { feld: 'teilzeit', gleich: 'JA' } }),
      f.check('elterngeld', 'Ich beziehe Elterngeld'),
    ] }],
  },
  {
    code: 'FAMILIENSTAND', titel: 'Familienstand ändern', kurz: 'Familienstand', kategorie: 'STAMMDATEN', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 3, entwurfErlaubt: false,
    suchbegriffe: ['heirat', 'scheidung', 'verwitwet', 'eingetragene partnerschaft', 'familienstand'], lebenslagen: ['FAMILIE', 'TRAUER'],
    schritte: [{ titel: 'Familienstand', felder: [
      f.wahl('familienstand', 'Neuer Familienstand', o(['LEDIG', 'ledig'], ['VERHEIRATET', 'verheiratet'], ['LEBENSPARTNERSCHAFT', 'eingetragene Lebenspartnerschaft'], ['GETRENNT', 'getrennt lebend'], ['GESCHIEDEN', 'geschieden'], ['VERWITWET', 'verwitwet'])),
      f.datum('seit', 'Seit', { nichtZukunft: true }),
      f.check('namensaenderung', 'Mit der Änderung ändert sich auch mein Name'),
      f.datei('anhaenge', 'Nachweis (z. B. Heiratsurkunde)', { pflicht: false }),
    ] }],
  },
  {
    code: 'FAMILIE_FRAGEBOGEN', titel: 'Fragebogen zur Familienversicherung', kurz: 'Familienfragebogen', kategorie: 'FAMILIE', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 14,
    entwurfErlaubt: true, suchbegriffe: ['bestandsprüfung', 'fragebogen', 'einkommen angehörige'], lebenslagen: ['FAMILIE'],
    schritte: [{ titel: 'Angaben zu Ihren Angehörigen', felder: [
      { name: 'angehoeriger', label: 'Angehörige/r', typ: 'kind', pflicht: true, hilfe: 'Füllen Sie den Fragebogen für jede Person einzeln aus.' },
      f.betrag('einkommen', 'Regelmäßiges monatliches Gesamteinkommen', { min: 0 }),
      f.radio('status', 'Aktueller Status', o(['SCHULE', 'Schule / Kita / ohne Beschäftigung'], ['AUSBILDUNG', 'Ausbildung / Studium'], ['MINIJOB', 'Minijob'], ['BESCHAEFTIGT', 'Sozialversicherungspflichtig beschäftigt'], ['SELBSTSTAENDIG', 'Selbstständig'])),
      f.check('anderweitigVersichert', 'Die Person ist inzwischen anderweitig versichert'),
    ] }],
  },
  {
    code: 'TODESFALL', titel: 'Todesfall melden', kurz: 'Todesfall', kategorie: 'FAMILIE', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 5, entwurfErlaubt: false, oeffentlich: true,
    suchbegriffe: ['tod', 'verstorben', 'sterbefall', 'hinterbliebene'], lebenslagen: ['TRAUER'],
    hinweis: 'Unser herzliches Beileid. Wir kümmern uns um alle Formalitäten und melden uns bei Ihnen.',
    schritte: [{ titel: 'Angaben', felder: [
      f.text('name', 'Name der verstorbenen Person'),
      f.text('versichertennummer', 'Versichertennummer (falls bekannt)', { pflicht: false, muster: '^[A-Z]\\d{9}$', musterText: 'Ein Buchstabe und 9 Ziffern' }),
      f.datum('sterbedatum', 'Sterbedatum', { nichtZukunft: true }),
      f.text('melder', 'Ihr Name'), f.text('beziehung', 'Ihre Beziehung zur verstorbenen Person'),
      { name: 'kontaktEmail', label: 'Ihre E-Mail-Adresse', typ: 'email', pflicht: true },
      f.datei('anhaenge', 'Sterbeurkunde', { pflicht: false }),
    ] }],
  },
  // ------------------------------------------------------------ Stammdaten
  {
    code: 'STAMMDATEN_KORREKTUR', titel: 'Fehlerhafte Geburtsdaten korrigieren', kurz: 'Geburtsdaten', kategorie: 'STAMMDATEN', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 5,
    entwurfErlaubt: false, suchbegriffe: ['geburtsdatum falsch', 'geburtsort', 'geburtsname', 'korrektur'], lebenslagen: [],
    schritte: [{ titel: 'Korrektur', felder: [
      f.wahl('feld', 'Welche Angabe ist falsch?', o(['GEBURTSDATUM', 'Geburtsdatum'], ['GEBURTSORT', 'Geburtsort'], ['GEBURTSNAME', 'Geburtsname'])),
      f.text('richtig', 'Richtige Angabe'),
      f.datei('anhaenge', 'Nachweis (Personalausweis, Geburtsurkunde)'),
    ] }],
  },
  {
    code: 'STAATSANGEHOERIGKEIT', titel: 'Staatsangehörigkeit ändern', kurz: 'Staatsangehörigkeit', kategorie: 'STAMMDATEN', zustaendig: 'Mitgliedschaft & Beiträge', bearbeitungTage: 5,
    entwurfErlaubt: false, suchbegriffe: ['einbürgerung', 'staatsangehörigkeit', 'nationalität'], lebenslagen: [],
    schritte: [{ titel: 'Staatsangehörigkeit', felder: [
      f.wahl('staatsangehoerigkeit', 'Neue Staatsangehörigkeit', STAATSANGEHOERIGKEITEN.map(w => ({ wert: w, text: w }))),
      f.datum('seit', 'Seit', { nichtZukunft: true }),
      f.datei('anhaenge', 'Einbürgerungsurkunde oder Ausweis', { maxDateien: 2 }),
    ] }],
  },
  // ------------------------------------------------------------ Recht & Datenschutz
  {
    code: 'WIDERSPRUCH', titel: 'Widerspruch einlegen', kurz: 'Widerspruch', kategorie: 'RECHT', zustaendig: 'Widerspruchsstelle', bearbeitungTage: 90, entwurfErlaubt: true,
    suchbegriffe: ['widerspruch', 'ablehnung', 'bescheid', 'einspruch'], lebenslagen: ['GELD'],
    hinweis: 'Der Widerspruch muss innerhalb eines Monats nach Bekanntgabe des Bescheids eingehen.',
    schritte: [{ titel: 'Widerspruch', felder: [
      { name: 'bezugVorgangId', label: 'Gegen welche Entscheidung legen Sie Widerspruch ein?', typ: 'vorgang', pflicht: true, vorgangFilter: { nurWiderspruchsfaehig: true } },
      f.lang('begruendung', 'Begründung', { minLaenge: 30, hilfe: 'Sie können die Begründung auch später nachreichen.' }),
      f.check('begruendungFolgt', 'Ich reiche eine ausführliche Begründung nach'),
      f.datei('anhaenge', 'Weitere Unterlagen', { pflicht: false }),
    ] }],
  },
  {
    code: 'AKTENEINSICHT', titel: 'Akteneinsicht beantragen', kurz: 'Akteneinsicht', kategorie: 'RECHT', zustaendig: 'Widerspruchsstelle', bearbeitungTage: 14, entwurfErlaubt: false,
    suchbegriffe: ['akte', 'einsicht', 'unterlagen'], lebenslagen: [],
    schritte: [{ titel: 'Akteneinsicht', felder: [
      { name: 'bezugVorgangId', label: 'Zu welchem Vorgang?', typ: 'vorgang', pflicht: false },
      f.radio('form', 'Form der Einsicht', o(['DIGITAL', 'Digitale Kopie in mein Postfach'], ['VOR_ORT', 'Einsicht in einer Geschäftsstelle'])),
      f.lang('anliegen', 'Ihr Anliegen', { pflicht: false, minLaenge: 0 }),
    ] }],
  },
  {
    code: 'DATENSCHUTZANFRAGE', titel: 'Datenschutzanfrage stellen', kurz: 'Datenschutzanfrage', kategorie: 'RECHT', zustaendig: 'Datenschutz', bearbeitungTage: 30, entwurfErlaubt: false,
    suchbegriffe: ['dsgvo', 'auskunft', 'löschung', 'berichtigung', 'datenübertragbarkeit'], lebenslagen: [],
    schritte: [{ titel: 'Anfrage', felder: [
      f.wahl('recht', 'Ihr Anliegen', o(['AUSKUNFT', 'Auskunft über gespeicherte Daten (Art. 15 DSGVO)'], ['BERICHTIGUNG', 'Berichtigung (Art. 16 DSGVO)'], ['LOESCHUNG', 'Löschung (Art. 17 DSGVO)'], ['EINSCHRAENKUNG', 'Einschränkung der Verarbeitung (Art. 18 DSGVO)'], ['UEBERTRAGBARKEIT', 'Datenübertragbarkeit (Art. 20 DSGVO)'], ['WIDERSPRUCH', 'Widerspruch gegen Verarbeitung (Art. 21 DSGVO)'])),
      f.lang('beschreibung', 'Beschreibung', { sichtbarWenn: { feld: 'recht', in: ['BERICHTIGUNG', 'LOESCHUNG', 'EINSCHRAENKUNG', 'WIDERSPRUCH'] } }),
    ] }],
  },
  {
    code: 'DATENSCHUTZBESCHWERDE', titel: 'Datenschutzbeauftragten kontaktieren', kurz: 'Datenschutzbeschwerde', kategorie: 'RECHT', zustaendig: 'Datenschutz', bearbeitungTage: 14,
    entwurfErlaubt: false, suchbegriffe: ['datenschutzbeauftragter', 'datenpanne', 'beschwerde datenschutz'], lebenslagen: [],
    schritte: [{ titel: 'Ihr Anliegen', felder: [
      f.lang('anliegen', 'Ihr Anliegen', { minLaenge: 20 }),
      f.datum('vorfallAm', 'Wann ist der Vorfall aufgetreten?', { pflicht: false, nichtZukunft: true }),
      f.datei('anhaenge', 'Unterlagen', { pflicht: false }),
    ] }],
  },
  {
    code: 'LEISTUNGSAUSKUNFT', titel: 'Auskunft über in Anspruch genommene Leistungen', kurz: 'Leistungsauskunft', kategorie: 'DIGITAL', zustaendig: 'Kundenservice', bearbeitungTage: 1,
    entwurfErlaubt: false, automatischErledigt: true, suchbegriffe: ['patientenquittung', 'leistungsauskunft', 'abrechnung', '§ 305'], lebenslagen: [],
    schritte: [{ titel: 'Zeitraum', felder: [
      f.datum('von', 'Von', { nichtZukunft: true, maxTageZurueck: 1500 }), f.datum('bis', 'Bis', { nichtZukunft: true }),
      f.mehrfach('bereiche', 'Bereiche', o(['AERZTLICH', 'Ärztliche Leistungen'], ['ZAHNAERZTLICH', 'Zahnärztliche Leistungen'], ['ARZNEIMITTEL', 'Arzneimittel'], ['KRANKENHAUS', 'Krankenhaus'], ['HEILMITTEL', 'Heilmittel'])),
    ] }],
  },
  // ------------------------------------------------------------ Kontakt
  {
    code: 'RUECKRUF', titel: 'Rückruf vereinbaren', kurz: 'Rückruf', kategorie: 'KONTAKT', zustaendig: 'Kundenservice', bearbeitungTage: 1, entwurfErlaubt: false,
    suchbegriffe: ['rückruf', 'anrufen', 'telefon'], lebenslagen: [],
    schritte: [{ titel: 'Rückruf', felder: [
      f.wahl('thema', 'Thema', o(['ALLGEMEIN', 'Allgemeine Fragen'], ['LEISTUNG', 'Leistungen'], ['BEITRAG', 'Beiträge'], ['PFLEGE', 'Pflege'], ['ONLINE', 'Online-Geschäftsstelle'])),
      { name: 'telefon', label: 'Telefonnummer für den Rückruf', typ: 'telefon', pflicht: true },
      f.datum('datum', 'Wunschtag', { nichtVergangenheit: true, maxTageVoraus: 14 }),
      f.wahl('zeitfenster', 'Zeitfenster', o(['08-10', '08:00–10:00 Uhr'], ['10-12', '10:00–12:00 Uhr'], ['12-14', '12:00–14:00 Uhr'], ['14-16', '14:00–16:00 Uhr'], ['16-18', '16:00–18:00 Uhr'])),
      f.lang('anliegen', 'Worum geht es?', { pflicht: false, minLaenge: 0, maxLaenge: 300 }),
    ] }],
  },
  {
    code: 'BESCHWERDE', titel: 'Beschwerde einreichen', kurz: 'Beschwerde', kategorie: 'KONTAKT', zustaendig: 'Kundenservice', bearbeitungTage: 2, entwurfErlaubt: false,
    suchbegriffe: ['beschwerde', 'unzufrieden', 'reklamation'], lebenslagen: [],
    schritte: [{ titel: 'Beschwerde', felder: [
      f.wahl('bereich', 'Bereich', o(['SERVICE', 'Service / Erreichbarkeit'], ['BEARBEITUNG', 'Bearbeitungsdauer'], ['ENTSCHEIDUNG', 'Entscheidung zu einem Antrag'], ['ONLINE', 'Online-Geschäftsstelle'], ['SONSTIGES', 'Sonstiges'])),
      { name: 'bezugVorgangId', label: 'Betrifft die Beschwerde einen Vorgang?', typ: 'vorgang', pflicht: false },
      f.lang('beschreibung', 'Beschreibung', { minLaenge: 20 }),
      f.radio('rueckmeldung', 'Wie möchten Sie Antwort erhalten?', o(['POSTFACH', 'Postfach'], ['TELEFON', 'Telefon'], ['POST', 'Brief'])),
    ] }],
  },
];

export function formular(code: string): FormularDef | undefined {
  return FORMULARE.find(x => x.code === code);
}

export function alleFelder(def: FormularDef): FeldDef[] {
  return def.schritte.flatMap(s => s.felder);
}
