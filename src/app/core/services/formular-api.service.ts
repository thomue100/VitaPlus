import { inject, Injectable } from '@angular/core';
import { JsonSchema, UISchemaElement } from '@jsonforms/core';
import { Anhang } from '../models';
import { Api } from './api.service';

/** Formularbeschreibung, wie sie der Formular-Service liefert (JSON Schema + UI Schema). */
export interface FormularDefinition {
  code: string;
  titel: string;
  kurz: string;
  hinweis?: string;
  zustaendig: string;
  bearbeitungTage: number;
  entwurfErlaubt: boolean;
  einwilligung?: string;
  oeffentlich: boolean;
  schritte: { titel: string; felder: string[] }[];
  schema: JsonSchema & { properties: Record<string, any> };
  vorbelegung?: Record<string, any>;
  antragsteller?: { name: string; versichertennummer: string; anschrift: string; geburtsdatum: string };
  uischema: UISchemaElement & { elements: (UISchemaElement & { label: string; elements: UISchemaElement[]; options?: Record<string, any> })[] };
}

export interface Pruefergebnis {
  gueltig: boolean;
  fehler: { feld: string; meldung: string }[];
  hinweise: string[];
  betrag?: number;
}

export interface Eingangsbestaetigung {
  id?: string;
  vorgangsnummer: string;
  status: string;
  titel?: string;
  hinweise?: string[];
  kontakt?: string;
  entwurf?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FormularApi {
  private api = inject(Api);

  private basis(oeffentlich: boolean) {
    return oeffentlich ? '/api/oeffentlich/formulare' : '/api/formulare';
  }

  definition(code: string, oeffentlich = false) {
    return this.api.get<FormularDefinition>(`${this.basis(oeffentlich)}/${code}/definition`);
  }

  pruefen(code: string, daten: Record<string, any>, schritt: number, oeffentlich = false) {
    return this.api.post<Pruefergebnis>(`${this.basis(oeffentlich)}/${code}/pruefung`, { daten, schritt });
  }

  einreichen(code: string, daten: Record<string, any>, anhaenge: Anhang[], oeffentlich = false) {
    return oeffentlich
      ? this.api.post<Eingangsbestaetigung>(`/api/oeffentlich/formulare/${code}`, { daten, anhaenge })
      : this.api.post<Eingangsbestaetigung>('/api/antraege', { typ: code, daten, anhaenge, entwurf: false });
  }

  entwurfEinreichen(id: string, daten: Record<string, any>, anhaenge: Anhang[]) {
    return this.api.put<Eingangsbestaetigung>(`/api/antraege/${id}`, { daten, anhaenge, einreichen: true });
  }

  entwurfSpeichern(code: string, id: string | undefined, daten: Record<string, any>, anhaenge: Anhang[]) {
    return id
      ? this.api.put<Eingangsbestaetigung>(`/api/antraege/${id}`, { daten, anhaenge, einreichen: false })
      : this.api.post<Eingangsbestaetigung>('/api/antraege', { typ: code, daten, anhaenge, entwurf: true });
  }
}
