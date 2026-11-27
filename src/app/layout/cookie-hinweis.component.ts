import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

export const COOKIE_SCHLUESSEL = 'vp_einwilligung_cookies';

export function statistikErlaubt(): boolean {
  try { return !!JSON.parse(localStorage.getItem(COOKIE_SCHLUESSEL) || 'null')?.statistik; } catch { return false; }
}

/** Einwilligungsabfrage für nicht notwendige Speicherzugriffe (§ 25 TDDDG) beim ersten Besuch. */
@Component({
  selector: 'vp-cookie-hinweis',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (sichtbar()) {
      <section class="cookie" role="dialog" aria-labelledby="cookie-titel" aria-describedby="cookie-text">
        <h2 id="cookie-titel">Ihre Privatsphäre ist uns wichtig</h2>
        <p id="cookie-text">Wir verwenden technisch notwendige Speicherfunktionen, damit die Online-Geschäftsstelle sicher funktioniert.
          Mit Ihrer Einwilligung werten wir zusätzlich anonymisiert aus, welche Seiten genutzt werden, um unser Angebot zu verbessern.
          Ihre Auswahl können Sie jederzeit im Datenschutz-Center ändern. Mehr in unseren <a routerLink="/info/datenschutz">Datenschutzhinweisen</a>.</p>
        @if (details()) {
          <div class="optionen-cookie">
            <label class="auswahl"><input type="checkbox" checked disabled /> <span><strong>Notwendig</strong> – Anmeldung, Sitzung, Sicherheit (immer aktiv)</span></label>
            <label class="auswahl"><input type="checkbox" [checked]="statistik()" (change)="statistik.set($any($event.target).checked)" /> <span><strong>Statistik</strong> – anonyme Nutzungsauswertung</span></label>
          </div>
        }
        <div class="aktionen">
          <button type="button" class="btn primaer" (click)="speichern(true)">Alle akzeptieren</button>
          <button type="button" class="btn" (click)="speichern(false)">Nur notwendige</button>
          @if (details()) { <button type="button" class="btn link" (click)="speichern(statistik())">Auswahl speichern</button> }
          @else { <button type="button" class="btn link" (click)="details.set(true)">Einstellungen</button> }
        </div>
      </section>
    }`,
  styles: [`
    .cookie { position: fixed; left: 50%; bottom: 1rem; transform: translateX(-50%); width: min(720px, calc(100vw - 2rem)); z-index: 1100; background: #fff;
      border: 1px solid var(--vp-rand); border-radius: 16px; box-shadow: 0 16px 48px rgba(16,40,44,.25); padding: 1.25rem 1.5rem; }
    h2 { margin: 0 0 .4rem; font-size: 1.15rem; }
    p { margin: 0 0 .75rem; font-size: .92rem; }
    .optionen-cookie { display: grid; gap: .4rem; margin-bottom: .75rem; }
    .aktionen { margin: 0; }
  `],
})
export class CookieHinweisComponent {
  readonly sichtbar = signal(!localStorage.getItem(COOKIE_SCHLUESSEL));
  readonly details = signal(false);
  readonly statistik = signal(false);

  speichern(statistik: boolean) {
    localStorage.setItem(COOKIE_SCHLUESSEL, JSON.stringify({ notwendig: true, statistik, zeit: new Date().toISOString() }));
    this.sichtbar.set(false);
  }
}
