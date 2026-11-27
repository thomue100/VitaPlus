import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Arzt } from '../../core/models';
import { fehlertext } from '../../core/services/auth.interceptor';
import { ArztApi, ArztSuche } from '../../core/services/service-api.service';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';

const FACHRICHTUNGEN = ['Allgemeinmedizin', 'Augenheilkunde', 'Dermatologie', 'Gynäkologie', 'HNO-Heilkunde', 'Innere Medizin', 'Kardiologie',
  'Kinder- und Jugendmedizin', 'Orthopädie', 'Psychotherapie', 'Urologie', 'Zahnmedizin'];

@Component({
  selector: 'vp-arztsuche',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Arzt- und Praxissuche</h1><p class="leise">Finden Sie Praxen mit Kassenzulassung in Ihrer Nähe.</p></div></div>
    <form class="karte" (ngSubmit)="suchen(1)">
      <div class="feldgruppe">
        <div class="feld"><label for="a-fach">Fachrichtung</label><select id="a-fach" name="fach" [(ngModel)]="f.fachrichtung"><option value="">Alle</option>
          @for (x of fachrichtungen; track x) { <option [value]="x">{{ x }}</option> }</select></div>
        <div class="feld"><label for="a-ort">PLZ oder Ort</label><input id="a-ort" name="ort" [(ngModel)]="f.ort" placeholder="z. B. 10405 oder Berlin" /></div>
        <div class="feld"><label for="a-name">Name</label><input id="a-name" name="name" [(ngModel)]="f.name" /></div>
        <div class="feld"><label for="a-sprache">Sprache</label><select id="a-sprache" name="sprache" [(ngModel)]="f.sprache"><option value="">egal</option>
          @for (s of ['Englisch', 'Türkisch', 'Polnisch', 'Arabisch', 'Französisch']; track s) { <option [value]="s">{{ s }}</option> }</select></div>
        <div class="feld breit"><div class="auswahlgruppe zeile">
          <label class="auswahl"><input type="checkbox" name="bf" [(ngModel)]="f.barrierefrei" /> barrierefrei</label>
          <label class="auswahl"><input type="checkbox" name="ot" [(ngModel)]="f.onlineTermin" /> Online-Terminvergabe</label>
          <label class="auswahl"><input type="checkbox" name="np" [(ngModel)]="f.neuePatienten" /> nimmt neue Patienten auf</label></div></div>
        <div class="feld"><label for="a-sort">Sortierung</label><select id="a-sort" name="sort" [(ngModel)]="f.sortierung"><option value="NAME">Name</option><option value="PLZ">Postleitzahl</option></select></div>
      </div>
      <div class="aktionen"><button class="btn primaer" type="submit">Suchen</button><button class="btn link" type="button" (click)="zuruecksetzen()">Filter zurücksetzen</button>
        @if (sitzung.angemeldet()) { <button class="btn link" type="button" (click)="favoritenZeigen()">Meine Favoriten</button> }</div>
    </form>
    @if (ergebnis(); as e) {
      <p class="leise" aria-live="polite">{{ e.treffer }} Treffer{{ nurFavoriten() ? ' in Ihren Favoriten' : '' }}</p>
      <ul class="liste-ohne karte">
        @for (a of e.ergebnisse; track a.id) {
          <li>
            <div class="zeile">
              <div><strong>{{ a.titel }} {{ a.vorname }} {{ a.nachname }}</strong> <span class="badge">{{ a.fachrichtung }}</span><br />
                <span class="klein">{{ a.strasse }}, {{ a.plz }} {{ a.ort }} · Tel. {{ a.telefon }}</span><br />
                <span class="klein leise">{{ a.sprechzeiten }} · Sprachen: {{ a.sprachen.join(', ') }}</span><br />
                @if (a.barrierefrei) { <span class="badge blau">barrierefrei</span> }
                @if (a.onlineTermin) { <span class="badge blau">Online-Termin</span> }
                @if (!a.neuePatienten) { <span class="badge gelb">keine neuen Patienten</span> }
              </div>
              @if (sitzung.angemeldet()) {
                <button class="btn klein" type="button" (click)="favorit(a)" [attr.aria-pressed]="a.favorit">{{ a.favorit ? '★ Favorit' : '☆ Merken' }}</button>
              }
            </div>
          </li>
        } @empty { <li class="leer">Keine Praxen gefunden. Erweitern Sie Ihre Suche.</li> }
      </ul>
      @if (e.seiten > 1 && !nurFavoriten()) {
        <nav class="aktionen" aria-label="Seiten">
          <button class="btn klein" type="button" [disabled]="e.seite === 1" (click)="suchen(e.seite - 1)">← Zurück</button>
          <span>Seite {{ e.seite }} von {{ e.seiten }}</span>
          <button class="btn klein" type="button" [disabled]="e.seite === e.seiten" (click)="suchen(e.seite + 1)">Weiter →</button>
        </nav>
      }
    }`,
})
export class ArztsucheComponent implements OnInit {
  private api = inject(ArztApi);
  private ui = inject(UiService);
  readonly sitzung = inject(SitzungService);
  readonly fachrichtungen = FACHRICHTUNGEN;
  readonly ergebnis = signal<ArztSuche | null>(null);
  readonly nurFavoriten = signal(false);
  f = { fachrichtung: '', ort: '', name: '', sprache: '', barrierefrei: false, onlineTermin: false, neuePatienten: false, sortierung: 'NAME' };

  ngOnInit() {
    const u = this.sitzung.benutzer();
    if (u?.adresse?.plz) this.f.ort = u.adresse.plz.substring(0, 2);
    this.suchen(1);
  }

  async suchen(seite: number) {
    this.nurFavoriten.set(false);
    this.ergebnis.set(await this.api.suchen({ ...this.f, seite }));
  }

  zuruecksetzen() {
    this.f = { fachrichtung: '', ort: '', name: '', sprache: '', barrierefrei: false, onlineTermin: false, neuePatienten: false, sortierung: 'NAME' };
    this.suchen(1);
  }

  async favoritenZeigen() {
    const l = await this.api.favoriten();
    this.nurFavoriten.set(true);
    this.ergebnis.set({ treffer: l.length, seite: 1, seiten: 1, ergebnisse: l });
  }

  async favorit(a: Arzt & { favorit: boolean }) {
    try {
      await this.api.favorit(a.id, !a.favorit);
      a.favorit = !a.favorit;
      if (this.nurFavoriten()) this.favoritenZeigen();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
