import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LEBENSLAGEN } from '../../core/formulare/formular-typen';
import { formular } from '../../core/formulare/formular-katalog';
import { Leistung } from '../../core/inhalte/leistungen';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { SymbolComponent } from '../../shared/symbol.component';

type LeistungMitAnspruch = Leistung & { meinAnspruch: string | null };

const BEREICHE: Record<string, string> = {
  VORSORGE: 'Vorsorge & Prävention', BEHANDLUNG: 'Behandlung', ZAHN: 'Zähne', FAMILIE: 'Familie & Schwangerschaft',
  PFLEGE: 'Pflege', GELD: 'Geldleistungen & Zuzahlungen', DIGITAL: 'Digitale Angebote', SATZUNG: 'VitaPlus-Extras',
};

@Component({
  selector: 'vp-leistungen',
  imports: [FormsModule, RouterLink, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="seitenbuehne">
      <div><h1>Leistungen A–Z</h1><p>Was die VitaPlus für Sie übernimmt – von der Vorsorge über Zahnersatz bis zur Pflege. Wählen Sie eine Lebenslage oder suchen Sie gezielt.</p>
        <div class="aktionen"><a class="btn primaer" routerLink="/leistungen/finder"><vp-symbol name="sparkles" [groesse]="18" /> Leistungsfinder starten</a></div></div>
      <img src="bilder/hero-familie.svg" alt="" width="600" height="420" />
    </section>
    <h2>Nach Lebenslage</h2>
    <div class="kachelraster">
      @for (l of lebenslagen; track l.code) {
        <button type="button" class="symbolkachel lebenslage" [class.aktiv-kachel]="lage() === l.code" [attr.aria-pressed]="lage() === l.code" (click)="lage.set(lage() === l.code ? '' : l.code)">
          <span class="kachel-symbol" [style.--ton]="l.ton"><vp-symbol [name]="l.symbol" [groesse]="24" /></span>
          <span class="kachel-titel">{{ l.titel }}</span><span class="kachel-text">{{ l.beschreibung }}</span></button>
      }
    </div>
    <div class="filterleiste mt">
      <div class="feld"><label for="l-suche">Leistung suchen</label><input id="l-suche" type="search" [(ngModel)]="suche" /></div>
      <div class="feld"><label for="l-bereich">Bereich</label><select id="l-bereich" [(ngModel)]="bereich"><option value="">Alle</option>
        @for (b of bereiche; track b[0]) { <option [value]="b[0]">{{ b[1] }}</option> }</select></div>
    </div>
    @for (gruppe of gruppiert(); track gruppe.bereich) {
      <h2>{{ gruppe.titel }}</h2>
      <div class="raster">
        @for (l of gruppe.leistungen; track l.code) {
          <a class="kachel" [routerLink]="['/leistungen', l.code]"><span class="titel">{{ l.titel }}</span><br />
            <span class="klein">{{ l.kurz }}</span>
            @if (l.meinAnspruch) { <br /><span class="badge" [class.gruen]="l.meinAnspruch !== 'nicht enthalten'">Ihr Tarif: {{ l.meinAnspruch }}</span> }
          </a>
        }
      </div>
    } @empty { <p class="leer">Keine Leistungen gefunden.</p> }`,
  styles: [`button.kachel,button.symbolkachel{text-align:left;font:inherit;cursor:pointer}.aktiv-kachel{border-color:var(--vp-primaer);background:var(--vp-primaer-hell);box-shadow:inset 0 0 0 1px var(--vp-primaer)}`],
})
export class LeistungenComponent implements OnInit {
  private api = inject(Api);
  readonly lebenslagen = LEBENSLAGEN;
  readonly bereiche = Object.entries(BEREICHE);
  readonly alle = signal<LeistungMitAnspruch[]>([]);
  readonly lage = signal('');
  suche = '';
  bereich = '';

  async ngOnInit() {
    this.alle.set(await this.api.get('/api/inhalte/leistungen'));
  }

  gruppiert() {
    const q = this.suche.toLowerCase();
    const l = this.alle().filter(x => (!this.bereich || x.bereich === this.bereich) && (!this.lage() || x.lebenslagen.includes(this.lage())) &&
      (!q || (x.titel + x.kurz + x.suchbegriffe.join(' ')).toLowerCase().includes(q)));
    return Object.keys(BEREICHE).map(b => ({ bereich: b, titel: BEREICHE[b], leistungen: l.filter(x => x.bereich === b).sort((a, c) => a.titel.localeCompare(c.titel)) }))
      .filter(g => g.leistungen.length);
  }
}

@Component({
  selector: 'vp-leistung-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/leistungen">Leistungen A–Z</a> › {{ leistung()?.titel }}</p>
    @if (leistung(); as l) {
      <article class="karte" style="max-width:860px">
        <h1>{{ l.titel }}</h1>
        <p class="leise">{{ l.kurz }}</p>
        <p>{{ l.text }}</p>
        @if (l.anspruch) {
          <h2>Anspruch je Tarif</h2>
          <table class="tabelle"><thead><tr><th>Tarif</th><th>Leistung</th></tr></thead><tbody>
            @for (t of ['BASIS', 'KOMFORT', 'PREMIUM']; track t) {
              <tr [class.fett]="sitzung.benutzer()?.tarif === t"><td>VitaPlus {{ t.charAt(0) + t.slice(1).toLowerCase() }}{{ sitzung.benutzer()?.tarif === t ? ' (Ihr Tarif)' : '' }}</td>
                <td>{{ $any(l.anspruch)[t] || 'nicht enthalten' }}</td></tr>
            }
          </tbody></table>
        }
        <div class="aktionen">
          @if (l.formular) { <a class="btn primaer" [routerLink]="sitzung.angemeldet() ? ['/antraege/neu', l.formular] : ['/anmelden']" [queryParams]="sitzung.angemeldet() ? {} : { ziel: '/antraege/neu/' + l.formular }">{{ antragTitel(l.formular) }}</a> }
          @if (l.route) { <a class="btn" [routerLink]="l.route">Zur Funktion</a> }
          <a class="btn link" routerLink="/kontakt">Fragen? Kontakt aufnehmen</a>
        </div>
      </article>
    } @else if (geladen()) { <div class="karte">Diese Leistung gibt es nicht.</div> }`,
})
export class LeistungDetailComponent implements OnInit {
  private api = inject(Api);
  readonly sitzung = inject(SitzungService);
  readonly code = input.required<string>();
  readonly alle = signal<LeistungMitAnspruch[]>([]);
  readonly geladen = signal(false);
  readonly leistung = computed(() => this.alle().find(l => l.code === this.code()));

  async ngOnInit() {
    this.alle.set(await this.api.get('/api/inhalte/leistungen'));
    this.geladen.set(true);
  }

  antragTitel(code: string) {
    return formular(code)?.titel || 'Antrag stellen';
  }
}

@Component({
  selector: 'vp-leistungsfinder',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/leistungen">Leistungen A–Z</a> › Leistungsfinder</p>
    <h1>Leistungsfinder</h1>
    <p class="leise">Beantworten Sie ein paar Fragen – wir zeigen Ihnen passende Leistungen und Anträge.</p>
    <form class="karte formular" (ngSubmit)="finden()">
      <div class="feldgruppe">
        <div class="feld breit"><label for="lf-lage" class="pflicht">In welcher Lebenssituation sind Sie?</label>
          <select id="lf-lage" name="lage" [(ngModel)]="eingabe.lebenslage"><option value="">Bitte wählen</option>
            @for (l of lebenslagen; track l.code) { <option [value]="l.code">{{ l.titel }}</option> }</select></div>
        <div class="feld"><label for="lf-alter">Ihr Alter</label><input id="lf-alter" name="alter" type="number" min="0" max="120" [(ngModel)]="eingabe.alter" /></div>
        <div class="feld"><span class="label">Weitere Angaben</span>
          <label class="auswahl"><input type="checkbox" name="kinder" [(ngModel)]="eingabe.kinder" /> Kinder unter 18 im Haushalt</label>
          <label class="auswahl"><input type="checkbox" name="chronisch" [(ngModel)]="eingabe.chronisch" /> chronische Erkrankung</label>
          <label class="auswahl"><input type="checkbox" name="pflege" [(ngModel)]="eingabe.pflegebeduerftig" /> Pflegebedarf in der Familie</label></div>
      </div>
      @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }
      <div class="aktionen"><button class="btn primaer" type="submit">Passende Leistungen finden</button></div>
    </form>
    @if (ergebnis(); as e) {
      <h2>Das könnte für Sie passen</h2>
      <div class="raster">@for (l of e.leistungen; track l.code) { <a class="kachel" [routerLink]="['/leistungen', l.code]"><span class="titel">{{ l.titel }}</span><br /><span class="klein">{{ l.kurz }}</span></a> }</div>
      @if (e.antraege.length) {
        <h2>Passende Anträge</h2>
        <ul>@for (a of e.antraege; track a.code) { <li><a [routerLink]="['/antraege/neu', a.code]">{{ a.titel }}</a></li> }</ul>
      }
    }`,
})
export class LeistungsfinderComponent {
  private api = inject(Api);
  private router = inject(Router);
  readonly lebenslagen = LEBENSLAGEN;
  readonly ergebnis = signal<{ leistungen: Leistung[]; antraege: { code: string; titel: string }[] } | null>(null);
  readonly fehler = signal<string | null>(null);
  eingabe = { lebenslage: '', alter: null as number | null, kinder: false, chronisch: false, pflegebeduerftig: false };

  async finden() {
    this.fehler.set(null);
    try {
      this.ergebnis.set(await this.api.post('/api/leistungsfinder', this.eingabe));
    } catch (e) {
      this.fehler.set(fehlertext(e));
    }
  }
}
