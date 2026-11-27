import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Bildmarke und Wortmarke der VitaPlus. */
@Component({
  selector: 'vp-logo',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { 'class': 'vp-logo', '[class.hell]': 'hell()' },
  template: `
    <svg class="marke" viewBox="0 0 40 40" aria-hidden="true">
      <defs><linearGradient [attr.id]="verlaufId" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#095e59"/><stop offset="1" stop-color="#1fae9c"/></linearGradient></defs>
      <rect width="40" height="40" rx="11" [attr.fill]="'url(#' + verlaufId + ')'"/>
      <path d="M9.5 13.5 L18.5 29 L26.5 15.5" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M30.5 6.8v8.4M26.3 11h8.4" stroke="#bff3e9" stroke-width="2.8" stroke-linecap="round"/>
    </svg>
    <span class="wort">Vita<strong>Plus</strong></span>`,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: .5rem; }
    .marke { width: 2.1rem; height: 2.1rem; flex-shrink: 0; }
    .wort { font-size: 1.45rem; letter-spacing: -.025em; color: var(--vp-text); font-weight: 500; }
    .wort strong { color: var(--vp-primaer); font-weight: 800; }
    :host(.hell) .wort { color: #fff; } :host(.hell) .wort strong { color: #8fe0d2; }
  `],
})
export class LogoComponent {
  readonly hell = input(false);
  readonly verlaufId = 'vp-logo-' + Math.random().toString(36).slice(2, 8);
}
