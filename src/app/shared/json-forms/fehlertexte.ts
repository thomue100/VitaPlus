import { ErrorTranslator, JsonFormsI18nState, UISchemaElement } from '@jsonforms/core';

const zahl = (n: unknown) => Number(n).toLocaleString('de-DE');

/** Deutsche Fehlertexte für die Schema-Prüfung (AJV) – optional übersteuert durch Hinweise im UI Schema. */
export const fehlertext: ErrorTranslator = (fehler, _t, uischema?: UISchemaElement) => {
  const optionen = (uischema as any)?.options ?? {};
  const p = fehler.params as any;
  const s = fehler.parentSchema as any;
  switch (fehler.keyword) {
    case 'required': return 'Bitte füllen Sie dieses Feld aus.';
    case 'const': return s?.type === 'boolean' ? 'Bitte bestätigen Sie diese Angabe.' : 'Bitte wählen Sie eine gültige Option.';
    case 'oneOf':
    case 'enum': return 'Bitte wählen Sie eine gültige Option.';
    case 'pattern':
      if (optionen.musterText) return optionen.musterText;
      if (optionen.format === 'iban') return 'Bitte geben Sie eine gültige IBAN ein (z. B. DE89 3704 0044 0532 0130 00).';
      if (optionen.format === 'telefon') return 'Bitte prüfen Sie die Telefonnummer.';
      if (optionen.format === 'uhrzeit') return 'Bitte geben Sie eine Uhrzeit im Format HH:MM ein.';
      return 'Bitte prüfen Sie das Format.';
    case 'format':
      if (p.format === 'email') return 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
      if (p.format === 'date') return 'Bitte geben Sie ein gültiges Datum im Format TT.MM.JJJJ ein, z. B. 17.05.1990.';
      return 'Bitte prüfen Sie das Format.';
    case 'minLength': return `Bitte geben Sie mindestens ${p.limit} Zeichen ein.`;
    case 'maxLength': return `Höchstens ${p.limit} Zeichen erlaubt.`;
    case 'minimum': return `Der Wert muss mindestens ${zahl(p.limit)} betragen.`;
    case 'maximum': return `Der Wert darf höchstens ${zahl(p.limit)} betragen.`;
    case 'type': return p.type === 'integer' ? 'Bitte geben Sie eine ganze Zahl ein.' : p.type === 'number' ? 'Bitte geben Sie eine Zahl ein.' : 'Ungültige Angabe.';
    case 'minItems':
      if (optionen.format === 'dateien') return p.limit === 1 ? 'Bitte laden Sie mindestens eine Datei hoch.' : `Bitte laden Sie mindestens ${p.limit} Dateien hoch.`;
      if (optionen.eintrag) return `Bitte erfassen Sie mindestens ${p.limit === 1 ? 'eine/n' : p.limit} ${optionen.eintrag}.`;
      return p.limit === 1 ? 'Bitte wählen Sie mindestens eine Option.' : `Bitte wählen Sie mindestens ${p.limit} Optionen.`;
    case 'maxItems': return optionen.format === 'dateien' ? `Höchstens ${p.limit} Dateien erlaubt.` : `Höchstens ${p.limit} Einträge möglich.`;
    case 'uniqueItems': return 'Bitte wählen Sie jede Option nur einmal.';
    default: return fehler.message || 'Bitte prüfen Sie Ihre Angabe.';
  }
};

export const DEUTSCH: JsonFormsI18nState = {
  locale: 'de',
  translate: (_schluessel: string, standard?: string) => standard as string,
  translateError: fehlertext,
};
