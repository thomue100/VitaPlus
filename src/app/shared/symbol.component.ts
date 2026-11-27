import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { SYMBOLE } from './symbole';

/** Einheitliches Liniensymbol (24er-Raster), erbt die Textfarbe. */
@Component({
  selector: 'vp-symbol',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { 'class': 'vp-symbol', 'aria-hidden': 'true', '[style.width.px]': 'groesse()', '[style.height.px]': 'groesse()', '[innerHTML]': 'svg()' },
  template: '',
  styles: [':host { display: inline-flex; flex-shrink: 0; vertical-align: middle; line-height: 0; } :host ::ng-deep svg { width: 100%; height: 100%; }'],
})
export class SymbolComponent {
  private sanitizer = inject(DomSanitizer);
  readonly name = input.required<string>();
  readonly groesse = input(20);
  readonly strich = input(1.75);

  readonly svg = computed(() => {
    const inhalt = SYMBOLE[this.name()] ?? SYMBOLE['circle-help'];
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${this.strich()}" stroke-linecap="round" stroke-linejoin="round">${inhalt}</svg>`);
  });
}
