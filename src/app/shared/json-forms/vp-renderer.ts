import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Directive, inject, OnInit } from '@angular/core';
import { JsonFormsAngularService, JsonFormsBaseRenderer, JsonFormsControl, JsonFormsOutlet } from '@jsonforms/angular';
import {
  Actions, and, composePaths, ControlElement, isBooleanControl, isControl, isDateControl, isIntegerControl, isNumberControl, isOneOfEnumControl,
  isStringControl, JsonSchema, LabelElement, Layout, mapStateToLabelProps, mapStateToLayoutProps, optionIs, or, rankWith, schemaMatches, StatePropsOfControl,
  uiTypeIs,
} from '@jsonforms/core';
import { Anhang } from '../../core/models';
import { DateienComponent } from '../bausteine';
import { DatumEingabeComponent } from '../datum-eingabe.component';
import { SuchauswahlComponent, SuchOption } from '../suchauswahl.component';

interface Auswahl { const: string; title: string }

/**
 * Basis aller Eingabe-Renderer im VitaPlus-Design. Fehler werden erst nach Verlassen des Feldes
 * oder nach dem ersten Versuch, den Schritt abzuschließen, angezeigt.
 */
@Directive({
  host: { 'class': 'feld', '[class.breit]': 'breit', '[style.display]': "hidden ? 'none' : null" },
})
abstract class VpControl extends JsonFormsControl {
  protected cdr = inject(ChangeDetectorRef);
  pflichtfeld = false;
  beruehrt = false;
  private alleFehler = false;

  get optionen(): Record<string, any> { return this.uischema?.options ?? {}; }
  get breit(): boolean { return !!this.optionen['breit']; }
  get fehlerId(): string { return `${this.id}-fehler`; }

  override mapAdditionalProps(props: StatePropsOfControl) {
    this.pflichtfeld = !!props.required;
    this.label = props.label;
    this.alleFehler = !!props.config?.alleFehlerZeigen;
    this.zusatzwerte(props);
    this.cdr.markForCheck();
  }

  protected zusatzwerte(_props: StatePropsOfControl) {}

  meldung(): string | null {
    if (!this.error || !(this.beruehrt || this.alleFehler)) return null;
    return [...new Set(this.error.split('\n'))].join(' ');
  }

  setzen(wert: unknown) {
    this.jsonFormsService.updateCore(Actions.update(this.propsPath, () => wert));
    this.triggerValidation();
  }

  verlassen() {
    this.beruehrt = true;
    this.cdr.markForCheck();
  }
}

const FEHLER = `
  @if (description) { <span class="hilfe" [id]="id + '-hilfe'">{{ description }}</span> }
  @if (meldung(); as m) { <span class="feldfehler" role="alert" [id]="fehlerId">{{ m }}</span> }`;

@Component({
  selector: 'vp-jf-text',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <label [for]="id" [class.pflicht]="pflichtfeld">{{ label }}</label>
    @if (optionen['multi']) {
      <textarea [id]="id" [value]="data ?? ''" rows="5" [attr.maxlength]="maxLaenge" [attr.aria-invalid]="!!meldung()" [attr.aria-describedby]="meldung() ? fehlerId : null"
        (input)="eingabe($any($event.target).value)" (blur)="verlassen()"></textarea>
      @if (maxLaenge) { <span class="hilfe zaehler">{{ (data ?? '').length }} / {{ maxLaenge }} Zeichen</span> }
    } @else {
      <input [id]="id" [type]="typ" [value]="data ?? ''" [attr.maxlength]="maxLaenge" [attr.placeholder]="optionen['placeholder'] || null" [attr.autocomplete]="autocomplete"
        [attr.inputmode]="optionen['format'] === 'telefon' ? 'tel' : null" [attr.aria-invalid]="!!meldung()" [attr.aria-describedby]="meldung() ? fehlerId : null"
        (input)="eingabe($any($event.target).value)" (blur)="verlassen()" />
    }
    ${FEHLER}`,
})
export class TextRenderer extends VpControl {
  get typ() { return this.scopedSchema?.format === 'email' ? 'email' : this.optionen['format'] === 'telefon' ? 'tel' : 'text'; }
  get maxLaenge() { return this.scopedSchema?.maxLength ?? null; }
  get autocomplete() {
    const name = this.propsPath?.split('.').at(-1) ?? '';
    return ({ email: 'email', vorname: 'given-name', nachname: 'family-name', strasse: 'street-address', plz: 'postal-code', ort: 'address-level2', telefon: 'tel', iban: 'off' } as Record<string, string>)[name] ?? null;
  }
  eingabe(roh: string) {
    let wert = roh;
    if (this.optionen['format'] === 'iban') wert = roh.toUpperCase().replace(/\s+/g, '');
    this.setzen(wert === '' ? undefined : wert);
  }
}

@Component({
  selector: 'vp-jf-zahl',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <label [for]="id" [class.pflicht]="pflichtfeld">{{ label }}</label>
    <div class="eingabe-einheit">
      <input [id]="id" type="number" [value]="data ?? ''" [attr.step]="betrag ? '0.01' : '1'" [attr.min]="scopedSchema.minimum ?? null" [attr.max]="scopedSchema.maximum ?? null"
        [attr.inputmode]="betrag ? 'decimal' : 'numeric'" [attr.aria-invalid]="!!meldung()" [attr.aria-describedby]="meldung() ? fehlerId : null"
        (input)="eingabe($any($event.target).value)" (blur)="verlassen()" />
      @if (betrag) { <span class="einheit" aria-hidden="true">€</span> }
    </div>
    ${FEHLER}`,
})
export class ZahlRenderer extends VpControl {
  get betrag() { return this.optionen['format'] === 'betrag'; }
  eingabe(roh: string) {
    if (roh === '') return this.setzen(undefined);
    const n = Number(String(roh).replace(',', '.'));
    this.setzen(isNaN(n) ? roh : n);
  }
}

@Component({
  selector: 'vp-jf-datum',
  imports: [DatumEingabeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <label [for]="id" [class.pflicht]="pflichtfeld">{{ label }}</label>
    <vp-datum [id]="id" [startwert]="data ?? ''" [min]="optionen['min'] || null" [max]="optionen['max'] || null"
      [fehlerhaft]="!!meldung()" [beschreibung]="meldung() ? fehlerId : null"
      (geaendert)="setzen($event || undefined)" (formatfehler)="setzen($event)" (verlassen)="verlassen()" />
    ${FEHLER}`,
})
export class DatumRenderer extends VpControl {}

@Component({
  selector: 'vp-jf-auswahl',
  imports: [SuchauswahlComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (optionen['format'] === 'radio') {
      <fieldset [attr.aria-describedby]="meldung() ? fehlerId : null">
        <legend [class.pflicht]="pflichtfeld">{{ label }}</legend>
        <div class="optionen">
          @for (o of auswahl; track o.const) {
            <label class="auswahl"><input type="radio" [name]="id" [value]="o.const" [checked]="data === o.const" (change)="setzen(o.const); verlassen()" /> {{ o.title }}</label>
          }
        </div>
      </fieldset>
    } @else if (auswahl.length > 12) {
      <label [for]="id" [class.pflicht]="pflichtfeld">{{ label }}</label>
      <vp-suchauswahl [id]="id" [optionen]="suchoptionen" [startwert]="data ?? null" [beschriftung]="label" [fehlerhaft]="!!meldung()"
        [beschreibung]="meldung() ? fehlerId : null" (geaendert)="setzen($event || undefined)" (verlassen)="verlassen()" />
    } @else {
      <label [for]="id" [class.pflicht]="pflichtfeld">{{ label }}</label>
      <select [id]="id" [attr.aria-invalid]="!!meldung()" [attr.aria-describedby]="meldung() ? fehlerId : null" (change)="setzen($any($event.target).value || undefined)" (blur)="verlassen()">
        <option value="" [selected]="!data">Bitte wählen</option>
        @for (o of auswahl; track o.const) { <option [value]="o.const" [selected]="data === o.const">{{ o.title }}</option> }
      </select>
    }
    ${FEHLER}`,
})
export class AuswahlRenderer extends VpControl {
  auswahl: Auswahl[] = [];
  suchoptionen: SuchOption[] = [];
  protected override zusatzwerte() {
    const neu = ((this.scopedSchema?.oneOf ?? []) as Auswahl[]);
    if (neu.length !== this.auswahl.length || neu.some((o, i) => o.const !== this.auswahl[i]?.const)) {
      this.auswahl = neu;
      this.suchoptionen = neu.map(o => ({ wert: String(o.const), text: o.title }));
    }
  }
}

@Component({
  selector: 'vp-jf-leer',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<span class="label">{{ label }}</span><div class="hinweis info klein">{{ optionen['leerText'] }}</div>`,
})
export class LeereAuswahlRenderer extends VpControl {}

@Component({
  selector: 'vp-jf-checkbox',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <label class="auswahl"><input type="checkbox" [id]="id" [checked]="!!data" [attr.aria-describedby]="meldung() ? fehlerId : null"
      (change)="setzen($any($event.target).checked || undefined); verlassen()" /> <span [class.pflicht]="pflichtfeld">{{ label }}</span></label>
    ${FEHLER}`,
})
export class CheckboxRenderer extends VpControl {}

@Component({
  selector: 'vp-jf-mehrfach',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <fieldset [attr.aria-describedby]="meldung() ? fehlerId : null">
      <legend [class.pflicht]="pflichtfeld">{{ label }}</legend>
      <div class="optionen">
        @for (o of auswahl; track o.const) {
          <label class="auswahl"><input type="checkbox" [checked]="(data || []).includes(o.const)" (change)="umschalten(o.const)" /> {{ o.title }}</label>
        }
      </div>
    </fieldset>
    ${FEHLER}`,
})
export class MehrfachRenderer extends VpControl {
  auswahl: Auswahl[] = [];
  protected override zusatzwerte() { this.auswahl = (((this.scopedSchema?.items as JsonSchema)?.oneOf ?? []) as Auswahl[]); }
  umschalten(wert: string) {
    const liste: string[] = this.data || [];
    const neu = liste.includes(wert) ? liste.filter(x => x !== wert) : [...liste, wert];
    this.setzen(neu.length ? neu : undefined);
    this.verlassen();
  }
}

@Component({
  selector: 'vp-jf-dateien',
  imports: [DateienComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <vp-dateien [label]="label" [hilfe]="description || undefined" [pflicht]="pflichtfeld" [max]="scopedSchema.maxItems ?? 5"
      [dateien]="data || []" (dateienChange)="aendern($event)" />
    @if (meldung(); as m) { <span class="feldfehler" role="alert" [id]="fehlerId">{{ m }}</span> }`,
})
export class DateienRenderer extends VpControl {
  aendern(liste: Anhang[]) {
    this.setzen(liste.length ? liste : undefined);
    this.verlassen();
  }
}

/** Wiederholbare Gruppe (z. B. mitzuversichernde Angehörige) – jede Zeile wird wieder mit JSON Forms dargestellt. */
@Component({
  selector: 'vp-jf-liste',
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <fieldset class="liste">
      <legend [class.pflicht]="pflichtfeld">{{ label }}</legend>
      @for (z of zeilen; track z.path; let i = $index) {
        <div class="listeneintrag">
          <div class="zeile"><strong>{{ optionen['eintrag'] || 'Eintrag' }} {{ i + 1 }}</strong>
            <button type="button" class="btn link klein" (click)="entfernen(i)">Entfernen</button></div>
          <jsonforms-outlet [renderProps]="z" />
        </div>
      }
      <button type="button" class="btn klein" (click)="hinzufuegen()" [disabled]="voll">+ {{ optionen['eintrag'] || 'Eintrag' }} hinzufügen</button>
    </fieldset>
    ${FEHLER}`,
})
export class ListeRenderer extends VpControl {
  zeilen: { schema: JsonSchema; uischema: any; path: string }[] = [];
  get voll() { return (this.data?.length ?? 0) >= (this.scopedSchema?.maxItems ?? 99); }
  protected override zusatzwerte() {
    const anzahl = this.data?.length ?? 0;
    if (anzahl !== this.zeilen.length) {
      this.zeilen = Array.from({ length: anzahl }, (_, i) => ({
        schema: this.scopedSchema.items as JsonSchema, uischema: this.optionen['detail'], path: composePaths(this.propsPath, String(i)),
      }));
    }
  }
  hinzufuegen() {
    this.setzen([...(this.data || []), {}]);
  }
  entfernen(i: number) {
    const neu = (this.data || []).filter((_: unknown, j: number) => j !== i);
    this.setzen(neu.length ? neu : undefined);
    this.verlassen();
  }
}

/** Anordnung der Felder im Raster (zweispaltig, breite Felder über beide Spalten). */
@Component({
  selector: 'vp-jf-layout',
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '[style.display]': "sichtbar ? null : 'none'" },
  template: `<div class="feldgruppe">@for (p of elemente; track $index) { <jsonforms-outlet [renderProps]="p" /> }</div>`,
})
export class LayoutRenderer extends JsonFormsBaseRenderer<Layout> implements OnInit {
  private dienst = inject(JsonFormsAngularService);
  private cdr = inject(ChangeDetectorRef);
  elemente: { schema: JsonSchema; uischema: any; path: string }[] = [];
  sichtbar = true;
  ngOnInit() {
    this.elemente = this.uischema.elements.map(e => ({ schema: this.schema, uischema: e, path: this.path }));
    this.addSubscription(this.dienst.$state.subscribe({
      next: state => {
        this.sichtbar = mapStateToLayoutProps(state, { uischema: this.uischema, schema: this.schema, path: this.path }).visible;
        this.cdr.markForCheck();
      },
    }));
  }
}

@Component({
  selector: 'vp-jf-hinweis',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { 'class': 'feld breit', '[style.display]': "sichtbar ? null : 'none'" },
  template: `<div class="hinweis info">{{ text }}</div>`,
})
export class HinweisRenderer extends JsonFormsBaseRenderer<LabelElement> implements OnInit {
  private dienst = inject(JsonFormsAngularService);
  private cdr = inject(ChangeDetectorRef);
  text = '';
  sichtbar = true;
  ngOnInit() {
    this.addSubscription(this.dienst.$state.subscribe({
      next: state => {
        const p = mapStateToLabelProps(state, { uischema: this.uischema, path: this.path } as any);
        this.text = p.text;
        this.sichtbar = p.visible;
        this.cdr.markForCheck();
      },
    }));
  }
}

const istListe = schemaMatches(s => s.type === 'array' && (s.items as JsonSchema)?.type === 'object');
const istMehrfach = schemaMatches(s => s.type === 'array' && !!(s.items as JsonSchema)?.oneOf);
const ohneAuswahl = and(isControl, schemaMatches(s => s.type === 'string' && !s.oneOf), (ui) => !!(ui as ControlElement).options?.['leerText']);

/** Renderer-Set der Online-Geschäftsstelle */
export const VP_RENDERER = [
  { tester: rankWith(1, or(uiTypeIs('VerticalLayout'), uiTypeIs('HorizontalLayout'), uiTypeIs('Group'))), renderer: LayoutRenderer },
  { tester: rankWith(1, uiTypeIs('Label')), renderer: HinweisRenderer },
  { tester: rankWith(1, isStringControl), renderer: TextRenderer },
  { tester: rankWith(2, or(isNumberControl, isIntegerControl)), renderer: ZahlRenderer },
  { tester: rankWith(2, isBooleanControl), renderer: CheckboxRenderer },
  { tester: rankWith(3, isDateControl), renderer: DatumRenderer },
  { tester: rankWith(3, isOneOfEnumControl), renderer: AuswahlRenderer },
  { tester: rankWith(4, and(isControl, istMehrfach)), renderer: MehrfachRenderer },
  { tester: rankWith(4, and(isControl, istListe)), renderer: ListeRenderer },
  { tester: rankWith(5, and(isControl, optionIs('format', 'dateien'))), renderer: DateienRenderer },
  { tester: rankWith(5, ohneAuswahl), renderer: LeereAuswahlRenderer },
];
