import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SitzungService } from '../../core/services/sitzung.service';

@Component({
  selector: 'vp-nicht-gefunden',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="karte zentriert" style="max-width:600px;margin:2rem auto">
      <img class="leer-bild" src="bilder/nicht-gefunden.svg" alt="" width="300" height="210" />
      <h1>Seite nicht gefunden</h1>
      <p>Die aufgerufene Seite existiert nicht oder wurde verschoben.</p>
      <div class="aktionen" style="justify-content:center">
        <a class="btn primaer" [routerLink]="sitzung.angemeldet() ? sitzung.startseite() : '/anmelden'">Zur Startseite</a>
        <a class="btn" routerLink="/hilfe">Hilfe</a>
      </div>
    </section>`,
})
export class NichtGefundenComponent {
  readonly sitzung = inject(SitzungService);
}
