import {
  afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, forwardRef, HostListener, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';
import { SymbolComponent } from './symbol.component';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WOCHENTAGE = [['Mo', 'Montag'], ['Di', 'Dienstag'], ['Mi', 'Mittwoch'], ['Do', 'Donnerstag'], ['Fr', 'Freitag'], ['Sa', 'Samstag'], ['So', 'Sonntag']];

let zaehler = 0;

function zweistellig(n: number) { return String(n).padStart(2, '0'); }
function isoVon(d: Date) { return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`; }
function datumVon(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}
function deutsch(iso: string) { const d = datumVon(iso); return d ? `${zweistellig(d.getDate())}.${zweistellig(d.getMonth() + 1)}.${d.getFullYear()}` : ''; }

/** Liest „17.05.1990“, „17.5.1990“, „17051990“, „17.05.90“ und „1990-05-17“; liefert ISO oder null. */
export function datumLesen(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let tag: number, monat: number, jahr: number;
  if (m) { jahr = +m[1]; monat = +m[2]; tag = +m[3]; }
  else if ((m = /^(\d{1,2})[.\/ -](\d{1,2})[.\/ -](\d{2}|\d{4})$/.exec(t))) { tag = +m[1]; monat = +m[2]; jahr = +m[3]; }
  else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(t))) { tag = +m[1]; monat = +m[2]; jahr = +m[3]; }
  else return null;
  if (jahr < 100) jahr += jahr > (new Date().getFullYear() % 100) + 10 ? 1900 : 2000;
  const d = new Date(jahr, monat - 1, tag);
  if (d.getFullYear() !== jahr || d.getMonth() !== monat - 1 || d.getDate() !== tag) return null;
  return isoVon(d);
}

/**
 * Datumseingabe im deutschen Format mit Kalender (Muster „Date Picker Dialog“ der WAI-ARIA Authoring Practices).
 * Der Wert ist ein ISO-Datum (JJJJ-MM-TT). Funktioniert mit Reactive Forms und ngModel und prüft Format, min und max.
 */
@Component({
  selector: 'vp-datum',
  imports: [SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatumEingabeComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DatumEingabeComponent), multi: true },
  ],
  host: { '[attr.id]': 'null', class: 'vp-datum' },
  template: `
    <div class="datum-feld" [class.offen]="offen()">
      <input #eingabe [id]="id()" type="text" inputmode="numeric" autocomplete="off" placeholder="TT.MM.JJJJ" maxlength="10"
        [value]="text()" [disabled]="gesperrt()" [attr.aria-invalid]="ungueltig() || fehlerhaft() || null" [attr.aria-describedby]="hinweisId + (beschreibung() ? ' ' + beschreibung() : '')"
        (input)="tippen($any($event.target).value)" (blur)="verlassen()" (keydown.alt.arrowdown)="oeffnen($event)" />
      <button #kalenderKnopf type="button" class="kalender-knopf" [disabled]="gesperrt()" (click)="umschalten()"
        [attr.aria-label]="'Kalender öffnen' + (wert() ? ', gewählt: ' + anzeige() : '')" aria-haspopup="dialog" [attr.aria-expanded]="offen()">
        <vp-symbol name="calendar" [groesse]="18" />
      </button>
      <span [id]="hinweisId" class="sr-only">Format TT.MM.JJJJ</span>
    </div>
    @if (offen()) {
      <div #dialog class="kalender" role="dialog" aria-modal="true" [attr.aria-label]="'Datum wählen, ' + monatsTitel()" (keydown)="dialogTaste($event)">
        <div class="kopf">
          <button type="button" class="nav" (click)="blaettern(-1)" aria-label="Vorheriger Monat"><vp-symbol name="chevron-left" [groesse]="16" /></button>
          <!-- Monat und Jahr direkt wählbar, z. B. für Geburtsdaten -->
          <select class="monatswahl" aria-label="Monat" [value]="ansicht().getMonth()" (change)="springen(+$any($event.target).value, ansicht().getFullYear())">
            @for (m of monate; track $index) { <option [value]="$index" [selected]="$index === ansicht().getMonth()">{{ m }}</option> }
          </select>
          <select class="jahreswahl" aria-label="Jahr" (change)="springen(ansicht().getMonth(), +$any($event.target).value)">
            @for (j of jahre(); track j) { <option [value]="j" [selected]="j === ansicht().getFullYear()">{{ j }}</option> }
          </select>
          <button type="button" class="nav" (click)="blaettern(1)" aria-label="Nächster Monat"><vp-symbol name="chevron-right" [groesse]="16" /></button>
          <span class="sr-only" aria-live="polite">{{ monatsTitel() }}</span>
        </div>
        <table role="grid" [attr.aria-label]="monatsTitel()" (keydown)="rasterTaste($event)">
          <thead><tr>@for (w of wochentage; track w[0]) { <th scope="col" [attr.abbr]="w[1]">{{ w[0] }}</th> }</tr></thead>
          <tbody>
            @for (woche of wochen(); track $index) {
              <tr>
                @for (t of woche; track t.iso) {
                  <td [attr.aria-selected]="t.iso === wert()" [class.fremd]="!t.imMonat" [class.heute]="t.iso === heuteIso"
                      [class.gewaehlt]="t.iso === wert()" [class.gesperrt]="!t.erlaubt"
                      [attr.tabindex]="t.iso === fokusIso() ? 0 : -1" [attr.data-iso]="t.iso" [attr.aria-disabled]="!t.erlaubt || null"
                      [attr.aria-label]="t.lang" (click)="waehlen(t.iso, t.erlaubt)">{{ t.tag }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
        <div class="fuss">
          <button type="button" class="btn link klein" (click)="waehlen(heuteIso, erlaubt(heuteIso))" [disabled]="!erlaubt(heuteIso)">Heute</button>
          <button type="button" class="btn link klein" (click)="schliessen()">Abbrechen</button>
        </div>
        <p class="sr-only">Pfeiltasten wechseln den Tag, Bild auf und Bild ab den Monat, Eingabetaste übernimmt das Datum, Escape schließt.</p>
      </div>
    }`,
  styles: [`
    :host { display: block; position: relative; }
    .datum-feld { display: flex; }
    .datum-feld input { flex: 1; min-width: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
    .kalender-knopf { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; border: 1px solid #8a9ca0; border-left: none;
      border-radius: 0 var(--vp-radius-klein) var(--vp-radius-klein) 0; background: #fff; color: var(--vp-primaer); cursor: pointer; }
    .kalender-knopf:hover { background: var(--vp-primaer-hell); }
    .kalender-knopf:disabled { color: var(--vp-text-leise); cursor: not-allowed; }
    .kalender { position: absolute; z-index: 900; top: calc(100% + .3rem); left: 0; width: 19.5rem; max-width: calc(100vw - 2rem); background: #fff;
      border: 1px solid var(--vp-rand); border-radius: var(--vp-radius); box-shadow: var(--vp-schatten-hoch); padding: .75rem; }
    .kopf { display: flex; align-items: center; gap: .15rem; margin-bottom: .4rem; }
    .monatswahl, .jahreswahl { flex: 1; min-width: 0; padding: .3rem .4rem; font-weight: 700; }
    .jahreswahl { flex: .8; }
    .nav { width: 2rem; height: 2rem; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: var(--vp-radius-klein); background: none; color: var(--vp-primaer); cursor: pointer; }
    .nav:hover { border-color: var(--vp-rand); }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { font-size: .8rem; font-weight: 700; color: var(--vp-text-leise); padding: .2rem 0; text-align: center; }
    td { text-align: center; padding: 0; height: 2.25rem; border-radius: var(--vp-radius-klein); cursor: pointer; font-variant-numeric: tabular-nums; }
    td:hover { background: var(--vp-primaer-hell); }
    td.fremd { color: var(--vp-text-leise); }
    td.heute { font-weight: 700; box-shadow: inset 0 0 0 1px var(--vp-primaer); }
    td.gewaehlt { background: var(--vp-primaer); color: #fff; font-weight: 700; }
    td.gesperrt { color: #a9b5b8; text-decoration: line-through; cursor: not-allowed; background: none; }
    td:focus-visible { outline: 3px solid var(--vp-fokus, #f2a541); outline-offset: -1px; }
    .fuss { display: flex; justify-content: space-between; margin-top: .4rem; }
  `],
})
export class DatumEingabeComponent implements ControlValueAccessor, Validator {
  /** ID des Eingabefelds, damit <label for> funktioniert */
  readonly id = input<string>(`datum-${++zaehler}`);
  readonly min = input<string | null | undefined>(null);
  readonly max = input<string | null | undefined>(null);
  /** Fehlerzustand und Fehlertext-ID von außen (z. B. aus JSON Forms) */
  readonly fehlerhaft = input(false);
  readonly beschreibung = input<string | null>(null);
  /** Für die Verwendung ohne Formularmodul (z. B. in JSON-Forms-Renderern) */
  readonly startwert = input<string | null | undefined>(undefined);
  readonly geaendert = output<string | null>();
  /** Ungültiger Text beim Verlassen (für JSON Forms, damit dort die Formatmeldung erscheint) */
  readonly formatfehler = output<string>();
  readonly verlassen$ = output<void>({ alias: 'verlassen' });

  readonly hinweisId = `datum-hinweis-${zaehler}`;
  readonly heuteIso = isoVon(new Date());
  readonly wochentage = WOCHENTAGE;
  readonly monate = MONATE;

  readonly wert = signal<string | null>(null);
  readonly text = signal('');
  readonly ungueltig = signal(false);
  readonly gesperrt = signal(false);
  readonly offen = signal(false);
  /** Erster Tag des angezeigten Monats */
  readonly ansicht = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly fokusIso = signal(this.heuteIso);

  private eingabe = viewChild<ElementRef<HTMLInputElement>>('eingabe');
  private kalenderKnopf = viewChild<ElementRef<HTMLButtonElement>>('kalenderKnopf');
  private dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private fokusNachRender = false;

  private onChange: (v: string | null) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};

  constructor(private host: ElementRef<HTMLElement>) {
    afterRenderEffect(() => {
      const iso = this.fokusIso();
      if (!this.offen() || !this.fokusNachRender) return;
      untracked(() => (this.dialog()?.nativeElement.querySelector(`td[data-iso="${iso}"]`) as HTMLElement | null)?.focus());
    });
    // Startwert ohne Formularmodul übernehmen
    effect(() => {
      const s = this.startwert();
      if (s !== undefined && s !== untracked(this.wert)) untracked(() => this.writeValue(s));
    });
  }

  /** Jahre für die Auswahl: aus min/max, sonst 110 Jahre zurück bis 10 Jahre voraus */
  readonly jahre = computed(() => {
    const jetzt = new Date().getFullYear();
    const von = this.min() ? +this.min()!.substring(0, 4) : jetzt - 110;
    const bis = this.max() ? +this.max()!.substring(0, 4) : jetzt + 10;
    const liste: number[] = [];
    for (let j = bis; j >= von; j--) liste.push(j);
    return liste;
  });

  readonly anzeige = computed(() => deutsch(this.wert() || ''));
  readonly monatsTitel = computed(() => `${MONATE[this.ansicht().getMonth()]} ${this.ansicht().getFullYear()}`);

  readonly wochen = computed(() => {
    const erster = this.ansicht();
    const start = new Date(erster);
    start.setDate(1 - ((erster.getDay() + 6) % 7));
    const wochen: { iso: string; tag: number; imMonat: boolean; erlaubt: boolean; lang: string }[][] = [];
    const letzter = new Date(erster.getFullYear(), erster.getMonth() + 1, 0);
    for (let w = 0; w < 6; w++) {
      if (new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7) > letzter) break;
      const woche = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
        const iso = isoVon(d);
        woche.push({ iso, tag: d.getDate(), imMonat: d.getMonth() === erster.getMonth(), erlaubt: this.erlaubt(iso),
          lang: `${WOCHENTAGE[(d.getDay() + 6) % 7][1]}, ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}` });
      }
      wochen.push(woche);
    }
    return wochen;
  });

  erlaubt(iso: string) {
    const min = this.min(), max = this.max();
    return (!min || iso >= min) && (!max || iso <= max);
  }

  // --- ControlValueAccessor
  writeValue(v: string | null | undefined) {
    const iso = datumVon(v || '') ? v! : null;
    this.wert.set(iso);
    this.text.set(iso ? deutsch(iso) : (v || ''));
    this.ungueltig.set(false);
  }
  registerOnChange(fn: (v: string | null) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(gesperrt: boolean) { this.gesperrt.set(gesperrt); }

  // --- Validator: ungültiges Format sowie min/max
  validate(_: AbstractControl): ValidationErrors | null {
    if (this.ungueltig()) return { datumFormat: true };
    const w = this.wert();
    if (w && this.min() && w < this.min()!) return { datumMin: { min: deutsch(this.min()!) } };
    if (w && this.max() && w > this.max()!) return { datumMax: { max: deutsch(this.max()!) } };
    return null;
  }
  registerOnValidatorChange(fn: () => void) { this.onValidatorChange = fn; }

  private uebernehmen(iso: string | null, ungueltig = false) {
    const vorher = this.wert();
    this.wert.set(iso);
    this.ungueltig.set(ungueltig);
    if (iso !== vorher || ungueltig) {
      this.onChange(iso);
      this.geaendert.emit(iso);
    }
    this.onValidatorChange();
  }

  /** Beim Tippen Punkte ergänzen, Wert erst bei vollständiger Eingabe übernehmen */
  tippen(roh: string) {
    let t = roh;
    if (/^\d{2}$/.test(t) || /^\d{1,2}\.\d{2}$/.test(t)) t += '.';
    this.text.set(t);
    const el = this.eingabe()?.nativeElement;
    if (el && el.value !== t) el.value = t;
    const iso = datumLesen(t);
    if (iso) this.uebernehmen(iso);
    else if (!t.trim()) this.uebernehmen(null);
  }

  verlassen() {
    const t = this.text().trim();
    const iso = datumLesen(t);
    if (iso) { this.text.set(deutsch(iso)); this.uebernehmen(iso); }
    else if (t) { this.uebernehmen(null, true); this.formatfehler.emit(t); }
    else this.uebernehmen(null);
    this.onTouched();
    this.verlassen$.emit();
  }

  // --- Kalender
  oeffnen(ev?: Event) {
    ev?.preventDefault();
    const basis = this.wert() || (this.max() && this.heuteIso > this.max()! ? this.max()! : this.min() && this.heuteIso < this.min()! ? this.min()! : this.heuteIso);
    const d = datumVon(basis)!;
    this.ansicht.set(new Date(d.getFullYear(), d.getMonth(), 1));
    this.fokusNachRender = true;
    this.fokusIso.set(basis);
    this.offen.set(true);
  }
  umschalten() { this.offen() ? this.schliessen() : this.oeffnen(); }
  schliessen(fokusZurueck = true) {
    this.offen.set(false);
    this.fokusNachRender = false;
    if (fokusZurueck) this.kalenderKnopf()?.nativeElement.focus();
  }
  blaettern(monate: number) {
    const a = this.ansicht();
    this.ansicht.set(new Date(a.getFullYear(), a.getMonth() + monate, 1));
    const f = datumVon(this.fokusIso())!;
    const ziel = new Date(f.getFullYear(), f.getMonth() + monate, 1);
    const letzter = new Date(ziel.getFullYear(), ziel.getMonth() + 1, 0).getDate();
    this.fokusNachRender = false;
    this.fokusIso.set(isoVon(new Date(ziel.getFullYear(), ziel.getMonth(), Math.min(f.getDate(), letzter))));
  }
  springen(monat: number, jahr: number) {
    const f = datumVon(this.fokusIso())!;
    const letzter = new Date(jahr, monat + 1, 0).getDate();
    this.ansicht.set(new Date(jahr, monat, 1));
    this.fokusNachRender = false;
    this.fokusIso.set(isoVon(new Date(jahr, monat, Math.min(f.getDate(), letzter))));
  }

  waehlen(iso: string, erlaubt: boolean) {
    if (!erlaubt) return;
    this.text.set(deutsch(iso));
    this.uebernehmen(iso);
    this.onTouched();
    this.schliessen();
  }

  rasterTaste(ev: KeyboardEvent) {
    const f = datumVon(this.fokusIso())!;
    const neu = (d: Date) => { ev.preventDefault(); this.fokusNachRender = true; this.ansicht.set(new Date(d.getFullYear(), d.getMonth(), 1)); this.fokusIso.set(isoVon(d)); };
    const tag = (n: number) => new Date(f.getFullYear(), f.getMonth(), f.getDate() + n);
    const monat = (n: number) => { const z = new Date(f.getFullYear(), f.getMonth() + n, 1); return new Date(z.getFullYear(), z.getMonth(), Math.min(f.getDate(), new Date(z.getFullYear(), z.getMonth() + 1, 0).getDate())); };
    switch (ev.key) {
      case 'ArrowLeft': return neu(tag(-1));
      case 'ArrowRight': return neu(tag(1));
      case 'ArrowUp': return neu(tag(-7));
      case 'ArrowDown': return neu(tag(7));
      case 'Home': return neu(tag(-((f.getDay() + 6) % 7)));
      case 'End': return neu(tag(6 - ((f.getDay() + 6) % 7)));
      case 'PageUp': return neu(monat(ev.shiftKey ? -12 : -1));
      case 'PageDown': return neu(monat(ev.shiftKey ? 12 : 1));
      case 'Enter': case ' ': ev.preventDefault(); return this.waehlen(this.fokusIso(), this.erlaubt(this.fokusIso()));
    }
  }

  /** Fokus im Dialog halten, Escape schließt */
  dialogTaste(ev: KeyboardEvent) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.schliessen(); return; }
    if (ev.key !== 'Tab') return;
    const el = this.dialog()?.nativeElement;
    if (!el) return;
    const fokussierbar = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), select, td[tabindex="0"]'));
    const erstes = fokussierbar[0], letztes = fokussierbar[fokussierbar.length - 1];
    if (ev.shiftKey && document.activeElement === erstes) { ev.preventDefault(); letztes.focus(); }
    else if (!ev.shiftKey && document.activeElement === letztes) { ev.preventDefault(); erstes.focus(); }
  }

  @HostListener('document:pointerdown', ['$event'])
  aussenKlick(ev: PointerEvent) {
    if (this.offen() && !this.host.nativeElement.contains(ev.target as Node)) this.schliessen(false);
  }
}
