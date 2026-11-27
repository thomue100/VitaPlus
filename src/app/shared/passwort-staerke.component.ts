import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { bewertePasswort } from '../core/util/pruefungen';

@Component({
  selector: 'vp-passwort-staerke',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="staerke" aria-live="polite">
      <div class="balken"><span [style.width.%]="bewertung().staerke * 25" [class]="'s' + bewertung().staerke"></span></div>
      <span class="klein">Passwortstärke: {{ ['sehr schwach', 'schwach', 'mittel', 'gut', 'sehr gut'][bewertung().staerke] }}</span>
      <ul class="klein regeln">
        <li [class.ok]="bewertung().laenge">mindestens 10 Zeichen</li>
        <li [class.ok]="bewertung().gross">ein Großbuchstabe</li>
        <li [class.ok]="bewertung().klein">ein Kleinbuchstabe</li>
        <li [class.ok]="bewertung().ziffer">eine Ziffer</li>
        <li [class.ok]="bewertung().sonderzeichen">ein Sonderzeichen</li>
      </ul>
    </div>`,
  styles: [`.regeln{list-style:none;padding:0;margin:.3rem 0 0;display:flex;flex-wrap:wrap;gap:.2rem 1rem;color:var(--vp-text-leise)}
    .regeln li::before{content:'○ '}.regeln li.ok{color:var(--vp-erfolg)}.regeln li.ok::before{content:'✓ '}
    .balken span.s0,.balken span.s1{background:var(--vp-fehler)}.balken span.s2{background:var(--vp-akzent)}`],
})
export class PasswortStaerkeComponent {
  readonly passwort = input('');
  readonly bewertung = computed(() => bewertePasswort(this.passwort()));
}
