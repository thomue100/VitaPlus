import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { DatumPipe, EuroPipe } from '../../shared/pipes';

@Component({
  selector: 'vp-kurse',
  imports: [FormsModule, RouterLink, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Gesundheitskurse</h1><p class="leise">Zertifizierte Kurse bezuschussen wir mit bis zu 80 % – zwei Kurse pro Jahr.</p></div></div>
    <form class="filterleiste" (ngSubmit)="laden()">
      <div class="feld"><label for="k-kat">Thema</label><select id="k-kat" name="kat" [(ngModel)]="filter.kategorie" (ngModelChange)="laden()">
        <option value="">Alle Themen</option><option value="BEWEGUNG">Bewegung</option><option value="ERNAEHRUNG">Ernährung</option>
        <option value="STRESS">Stress & Entspannung</option><option value="SUCHT">Suchtprävention</option><option value="PFLEGE">Pflegekurse</option></select></div>
      <div class="feld"><label for="k-ort">PLZ oder Ort</label><input id="k-ort" name="ort" [(ngModel)]="filter.ort" /></div>
      <label class="auswahl"><input type="checkbox" name="online" [(ngModel)]="filter.online" (ngModelChange)="laden()" /> nur Online-Kurse</label>
      <label class="auswahl"><input type="checkbox" name="zert" [(ngModel)]="filter.zertifiziert" (ngModelChange)="laden()" /> nur zertifiziert</label>
      <button class="btn" type="submit">Suchen</button>
    </form>
    <p class="leise">{{ kurse().length }} Kurse gefunden</p>
    <div class="raster">
      @for (k of kurse(); track k.id) {
        <article class="karte">
          <h3>{{ k.titel }}</h3>
          <p class="klein leise">{{ k.anbieter }} · {{ k.online ? 'Online' : k.plz + ' ' + k.ort }}</p>
          <p class="klein">{{ k.beschreibung }}</p>
          <p class="klein">Start: {{ k.start | datum }} · {{ k.termine }} Termine · {{ k.preis ? (k.preis | euro) : 'kostenfrei' }}</p>
          @if (k.zertifiziert) { <span class="badge gruen">zertifiziert</span> } @else { <span class="badge">nicht bezuschussungsfähig</span> }
          <span class="badge" [class.rot]="k.frei === 0">{{ k.frei === 0 ? 'ausgebucht' : k.frei + ' Plätze frei' }}</span>
          <div class="aktionen">
            @if (k.gebucht) { <span class="badge gruen">gebucht</span> <button class="btn klein" type="button" (click)="stornieren(k.id)">Stornieren</button> }
            @else if (sitzung.angemeldet()) { <button class="btn klein primaer" type="button" (click)="buchen(k.id)" [disabled]="k.frei === 0">Platz buchen</button> }
            @else { <a class="btn klein" routerLink="/anmelden" [queryParams]="{ ziel: '/kurse' }">Zum Buchen anmelden</a> }
          </div>
        </article>
      } @empty { <p class="leer">Keine Kurse gefunden.</p> }
    </div>`,
})
export class KurseComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly sitzung = inject(SitzungService);
  readonly kurse = signal<any[]>([]);
  filter = { kategorie: '', ort: '', online: false, zertifiziert: false };

  ngOnInit() {
    this.laden();
  }

  async laden() {
    this.kurse.set(await this.api.get('/api/kurse', this.filter));
  }

  async buchen(id: string) {
    try {
      await this.api.post(`/api/kurse/${id}/buchen`);
      this.ui.erfolg('Ihr Platz ist reserviert. Die Bestätigung finden Sie im Postfach.');
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async stornieren(id: string) {
    if (!(await this.ui.bestaetigen('Kurs stornieren', 'Möchten Sie Ihre Buchung wirklich stornieren?', { bestaetigen: 'Stornieren', gefaehrlich: true }))) return;
    try {
      await this.api.post(`/api/kurse/${id}/stornieren`);
      this.ui.erfolg('Ihre Buchung wurde storniert.');
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
