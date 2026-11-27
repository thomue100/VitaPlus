import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LogoComponent } from './logo.component';

/** Darstellung der elektronischen Gesundheitskarte im Kartenformat (ID-1, 85,6 × 54 mm). */
@Component({
  selector: 'vp-egk',
  imports: [LogoComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { 'class': 'vp-egk', '[class.gesperrt]': 'inaktiv()', 'role': 'img', '[attr.aria-label]': 'beschreibung()' },
  template: `
    <svg class="muster" viewBox="0 0 320 202" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 150 C 80 110, 160 190, 320 120 L320 202 L0 202 Z" fill="rgba(255,255,255,.07)"/>
      <path d="M0 175 C 90 140, 180 215, 320 150 L320 202 L0 202 Z" fill="rgba(255,255,255,.07)"/>
      <circle cx="290" cy="20" r="70" fill="rgba(255,255,255,.06)"/>
    </svg>
    <div class="kopfzeile">
      <vp-logo [hell]="true" />
      <span class="art">Gesundheitskarte</span>
    </div>
    <div class="mitte">
      <span class="chip" aria-hidden="true"><i></i><i></i><i></i></span>
      <svg class="nfc" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7.5a6 6 0 0 1 0 9M12 5a9.5 9.5 0 0 1 0 14M5 10a2.5 2.5 0 0 1 0 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      @if (foto()) {
        <span class="foto" aria-hidden="true"><svg viewBox="0 0 40 48"><rect width="40" height="48" rx="3" fill="#d7ebe7"/><circle cx="20" cy="18" r="8" fill="#8bb5ae"/><path d="M6 46c1-9 7-14 14-14s13 5 14 14z" fill="#8bb5ae"/></svg></span>
      }
    </div>
    <div class="daten">
      <span class="name">{{ name() }}</span>
      <span class="nummer">{{ versichertennummer() }}</span>
      <span class="fuss"><span>{{ kartennummer() }}</span>@if (gueltigBis()) { <span>gültig bis {{ gueltigText() }}</span> }</span>
    </div>
    @if (inaktiv()) { <span class="stempel">{{ statusText() }}</span> }
  `,
  styles: [`
    :host { position: relative; display: block; aspect-ratio: 85.6 / 54; width: 100%; max-width: 380px; border-radius: 16px; overflow: hidden; color: #fff; padding: 5% 6%;
      background: linear-gradient(135deg, #07524e 0%, #0b6e69 45%, #1fa696 100%); box-shadow: 0 10px 24px rgba(7, 60, 56, .28), inset 0 1px 0 rgba(255,255,255,.2);
      display: flex; flex-direction: column; justify-content: space-between; font-size: clamp(.62rem, 2.6cqw, .9rem); container-type: inline-size; }
    :host(.gesperrt) { filter: grayscale(.85); opacity: .8; }
    .muster { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .kopfzeile { position: relative; display: flex; justify-content: space-between; align-items: center; }
    .kopfzeile vp-logo { transform: scale(.78); transform-origin: left center; }
    .art { font-size: .78em; letter-spacing: .12em; text-transform: uppercase; opacity: .85; }
    .mitte { position: relative; display: flex; align-items: center; gap: 4%; }
    .chip { width: 15%; aspect-ratio: 1.3; border-radius: 6px; background: linear-gradient(135deg, #f7dc8b, #d6a84a 60%, #f2cf74); position: relative; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(120, 80, 10, .35); }
    .chip i { position: absolute; background: rgba(120, 80, 10, .35); }
    .chip i:nth-child(1) { left: 0; right: 0; top: 33%; height: 1px; } .chip i:nth-child(2) { left: 0; right: 0; top: 66%; height: 1px; } .chip i:nth-child(3) { top: 0; bottom: 0; left: 50%; width: 1px; }
    .nfc { width: 7%; opacity: .8; transform: rotate(0deg); }
    .foto { margin-left: auto; width: 15%; } .foto svg { width: 100%; display: block; border-radius: 4px; }
    .daten { position: relative; display: flex; flex-direction: column; gap: .1em; }
    .name { font-weight: 700; font-size: 1.15em; }
    .nummer { font-family: 'Source Code Pro', ui-monospace, Menlo, monospace; letter-spacing: .14em; font-size: 1.15em; }
    .fuss { display: flex; justify-content: space-between; font-size: .78em; opacity: .85; gap: 1em; }
    .stempel { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%) rotate(-12deg); border: 3px solid #fff; border-radius: 8px; padding: .2em .8em; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; font-size: 1.2em; background: rgba(179, 38, 30, .85); }
  `],
})
export class EgkComponent {
  readonly name = input('');
  readonly versichertennummer = input('');
  readonly kartennummer = input('');
  readonly gueltigBis = input<string | undefined>(undefined);
  readonly status = input('AKTIV');
  readonly foto = input(true);

  readonly inaktiv = computed(() => ['GESPERRT', 'ABGELAUFEN'].includes(this.status()));
  readonly statusText = computed(() => this.status() === 'GESPERRT' ? 'Gesperrt' : 'Abgelaufen');
  readonly gueltigText = computed(() => { const d = this.gueltigBis(); if (!d) return ''; const [j, m] = d.split('-'); return `${m}/${j.slice(2)}`; });
  readonly beschreibung = computed(() => `Gesundheitskarte von ${this.name()}, Versichertennummer ${this.versichertennummer()}${this.inaktiv() ? ', ' + this.statusText() : ''}`);
}
