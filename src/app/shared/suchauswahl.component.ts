import { ChangeDetectionStrategy, Component, computed, effect, forwardRef, input, output, signal, untracked } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Combobox, ComboboxPopup, ComboboxWidget } from '@angular/aria/combobox';
import { Listbox, Option } from '@angular/aria/listbox';
import { SymbolComponent } from './symbol.component';

export interface SuchOption { wert: string; text: string }

let zaehler = 0;

function normal(t: string) {
  return t.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Auswahlfeld mit Suche (Combobox nach WAI-ARIA, umgesetzt mit den Angular-Aria-Primitives Combobox und Listbox).
 * Für lange Listen wie Staatsangehörigkeiten oder Krankenkassen: tippen filtert, Pfeiltasten wählen, Enter übernimmt.
 */
@Component({
  selector: 'vp-suchauswahl',
  imports: [Combobox, ComboboxPopup, ComboboxWidget, Listbox, Option, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SuchauswahlComponent), multi: true }],
  host: { '[attr.id]': 'null', class: 'vp-suchauswahl' },
  template: `
    <div class="feldrahmen">
      <input [id]="id()" ngCombobox #combobox="ngCombobox" [(value)]="suche" [(expanded)]="offen" [disabled]="gesperrt()"
        autocomplete="off" [placeholder]="platzhalter()" [attr.aria-invalid]="fehlerhaft() || null" [attr.aria-describedby]="beschreibung()"
        (focus)="fokussiert()" (click)="offen.set(true)" (blur)="verlassen()" />
      <vp-symbol class="pfeil" name="chevron-down" [groesse]="18" aria-hidden="true" />
      <ng-template ngComboboxPopup [combobox]="combobox">
        <div class="liste" ngComboboxWidget ngListbox #listbox="ngListbox" focusMode="activedescendant" selectionMode="explicit"
          [activeDescendant]="listbox.activeDescendant()" [value]="auswahlListe()" (valueChange)="gewaehlt($event)" [attr.aria-label]="beschriftung() || null">
          @for (o of gefiltert(); track o.wert) {
            <div class="option" ngOption [value]="o.wert" [label]="o.text" [class.gewaehlt]="o.wert === wert()">{{ o.text }}</div>
          }
        </div>
      </ng-template>
      <div class="sr-only" role="status" aria-live="polite">{{ ansage() }}</div>
      @if (filtern() && suche() && !gefiltert().length && aktiv()) { <div class="keine" aria-hidden="true">Keine Übereinstimmung für „{{ suche() }}“</div> }
    </div>`,
  styles: [`
    :host { display: block; position: relative; }
    .feldrahmen { position: relative; }
    input { width: 100%; padding-right: 2.25rem; }
    .pfeil { position: absolute; right: .7rem; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--vp-text-leise); }
    .liste, .keine { position: absolute; z-index: 900; top: calc(100% + .25rem); left: 0; right: 0; background: #fff; border: 1px solid var(--vp-rand);
      border-radius: var(--vp-radius); box-shadow: var(--vp-schatten-hoch); }
    .liste { max-height: 16rem; overflow-y: auto; padding: .25rem 0; }
    .liste:empty { display: none; }
    .option { padding: .45rem .75rem; cursor: pointer; }
    .option:hover { background: var(--vp-primaer-hell); }
    .option[data-active='true'], .option[aria-selected='true'] { background: var(--vp-primaer-hell); }
    .option[data-active='true'] { outline: 2px solid var(--vp-primaer); outline-offset: -2px; }
    .option.gewaehlt { font-weight: 700; }
    .keine { padding: .6rem .75rem; color: var(--vp-text-leise); }
  `],
})
export class SuchauswahlComponent implements ControlValueAccessor {
  readonly id = input<string>(`suchauswahl-${++zaehler}`);
  readonly optionen = input<SuchOption[]>([]);
  readonly platzhalter = input('Bitte wählen oder eintippen');
  readonly beschriftung = input<string | null>(null);
  readonly fehlerhaft = input(false);
  readonly beschreibung = input<string | null>(null);
  /** Für die Verwendung ohne Formularmodul */
  readonly startwert = input<string | null | undefined>(undefined);
  readonly geaendert = output<string | null>();
  readonly verlassen$ = output<void>({ alias: 'verlassen' });

  readonly wert = signal<string | null>(null);
  readonly suche = signal('');
  readonly offen = signal(false);
  readonly gesperrt = signal(false);
  /** Solange niemand tippt, zeigt die Liste alle Einträge */
  readonly filtern = signal(false);
  readonly aktiv = signal(false);
  /** Ansage für Screenreader: Anzahl der Treffer */
  readonly ansage = computed(() => !this.filtern() || !this.suche() ? '' : this.gefiltert().length ? `${this.gefiltert().length} Treffer` : 'Keine Übereinstimmung');

  private onChange: (v: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  readonly auswahlListe = computed(() => (this.wert() ? [this.wert()!] : []));
  readonly gefiltert = computed(() => {
    const alle = this.optionen();
    if (!this.filtern()) return alle;
    const q = normal(this.suche());
    if (!q) return alle;
    const beginnt = alle.filter(o => normal(o.text).startsWith(q));
    const enthaelt = alle.filter(o => !normal(o.text).startsWith(q) && normal(o.text).includes(q));
    return [...beginnt, ...enthaelt];
  });

  constructor() {
    // Eingetippter Text schaltet die Filterung ein
    effect(() => {
      const s = this.suche();
      untracked(() => { if (s !== this.text(this.wert())) { this.filtern.set(true); if (!this.offen() && s) this.offen.set(true); } });
    });
    effect(() => {
      const s = this.startwert();
      if (s !== undefined) untracked(() => this.writeValue(s));
    });
  }

  private text(w: string | null) { return this.optionen().find(o => o.wert === w)?.text ?? ''; }

  writeValue(v: string | null | undefined) {
    this.wert.set(v || null);
    this.filtern.set(false);
    this.suche.set(this.text(v || null) || (v ?? ''));
  }
  registerOnChange(fn: (v: string | null) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(g: boolean) { this.gesperrt.set(g); }

  private setzen(w: string | null) {
    const vorher = this.wert();
    this.wert.set(w);
    this.filtern.set(false);
    this.suche.set(this.text(w));
    if (w !== vorher) { this.onChange(w); this.geaendert.emit(w); }
  }

  gewaehlt(werte: string[]) {
    const w = werte.find(x => x !== this.wert()) ?? werte[0] ?? null;
    if (w) this.setzen(w);
    this.offen.set(false);
  }

  fokussiert() { this.filtern.set(false); this.aktiv.set(true); }

  /** Beim Verlassen: exakter Treffer wird übernommen, leeres Feld leert den Wert, sonst bleibt die bisherige Auswahl */
  verlassen() {
    setTimeout(() => {
      const q = normal(this.suche());
      if (!q) this.setzen(null);
      else {
        const treffer = this.optionen().find(o => normal(o.text) === q) ?? (this.gefiltert().length === 1 && this.filtern() ? this.gefiltert()[0] : undefined);
        this.setzen(treffer ? treffer.wert : this.wert());
      }
      this.offen.set(false);
      this.aktiv.set(false);
      this.onTouched();
      this.verlassen$.emit();
    }, 150);
  }
}
