import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FORMULAR_KATEGORIEN, FormularKategorie, LEBENSLAGEN } from '../../core/formulare/formular-typen';
import { Vorgang } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { VorgangApi } from '../../core/services/vorgang-api.service';
import { DatumPipe, TypTextPipe } from '../../shared/pipes';

interface FormularInfo { code: string; titel: string; kurz: string; kategorie: FormularKategorie; lebenslagen: string[]; suchbegriffe: string[]; verfuegbar: boolean; bearbeitungTage: number }

const SONDERSEITEN: { titel: string; route: string; kategorie: FormularKategorie; begriffe: string }[] = [
  { titel: 'Rechnung zur Kostenerstattung einreichen', route: '/erstattung', kategorie: 'LEISTUNG', begriffe: 'rechnung zahnreinigung osteopathie impfung brille' },
  { titel: 'Krankmeldung erfassen', route: '/krankmeldung', kategorie: 'LEISTUNG', begriffe: 'au krank arbeitsunfähig' },
  { titel: 'Familienangehörige anmelden', route: '/familie', kategorie: 'FAMILIE', begriffe: 'familienversicherung ehepartner kind' },
  { titel: 'Ersatz für die Gesundheitskarte', route: '/gesundheitskarte', kategorie: 'MITGLIEDSCHAFT', begriffe: 'karte verloren gestohlen foto' },
  { titel: 'Bonusmaßnahme einreichen', route: '/bonus', kategorie: 'LEISTUNG', begriffe: 'bonus punkte vorsorge sport' },
  { titel: 'Beratungstermin buchen', route: '/termine', kategorie: 'KONTAKT', begriffe: 'termin beratung filiale' },
  { titel: 'Namensänderung mitteilen', route: '/profil', kategorie: 'STAMMDATEN', begriffe: 'name heirat' },
  { titel: 'Vollmacht erteilen', route: '/vollmachten', kategorie: 'RECHT', begriffe: 'vollmacht vertretung' },
];

@Component({
  selector: 'vp-antraege',
  imports: [FormsModule, RouterLink, DatumPipe, TypTextPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Anträge & Meldungen</h1><p class="leise">Alle Anliegen digital – ohne Papier und Unterschrift.</p></div>
      <a class="btn" routerLink="/leistungen/finder">Welcher Antrag passt? Leistungsfinder</a></div>

    @if (entwuerfe().length) {
      <section class="karte hervor"><h2>Ihre gespeicherten Entwürfe</h2>
        <ul class="liste-ohne">@for (e of entwuerfe(); track e.id) {
          <li class="zeile"><span><strong>{{ e.typ | typText }}</strong> <span class="klein leise">zuletzt bearbeitet {{ e.geaendertAm | datum: true }}</span></span>
            <span><a class="btn klein primaer" [routerLink]="['/antraege/entwurf', e.id]">Fortsetzen</a> <button class="btn klein link" type="button" (click)="entwurfLoeschen(e)">Löschen</button></span></li>
        }</ul>
      </section>
    }

    <div class="filterleiste">
      <div class="feld" style="flex:1"><label for="a-suche">Antrag suchen</label><input id="a-suche" type="search" [(ngModel)]="suche" placeholder="z. B. Reha, Fahrkosten, Pflegegrad" /></div>
      <div class="feld"><label for="a-lage">Lebenslage</label><select id="a-lage" [(ngModel)]="lage"><option value="">Alle</option>
        @for (l of lebenslagen; track l.code) { <option [value]="l.code">{{ l.titel }}</option> }</select></div>
    </div>

    @for (g of gruppen(); track g.kategorie) {
      <h2>{{ g.titel }}</h2>
      <div class="raster">
        @for (f of g.formulare; track f.code) {
          <a class="kachel" [class.deaktiviert]="!f.verfuegbar" [routerLink]="f.verfuegbar ? ['/antraege/neu', f.code] : null" [attr.aria-disabled]="!f.verfuegbar" [attr.tabindex]="f.verfuegbar ? null : -1">
            <span class="titel">{{ f.titel }}</span><br />
            <span class="klein leise">{{ f.verfuegbar ? 'Bearbeitung ca. ' + f.bearbeitungTage + ' Tage' : 'Für Ihre Versicherungsart nicht verfügbar' }}</span></a>
        }
        @for (s of g.sonder; track s.route) { <a class="kachel" [routerLink]="s.route"><span class="titel">{{ s.titel }}</span><br /><span class="klein leise">Eigener Bereich</span></a> }
      </div>
    } @empty { <p class="leer">Kein passender Antrag gefunden. <a routerLink="/postfach/neu">Schreiben Sie uns einfach.</a></p> }`,
})
export class AntraegeComponent implements OnInit {
  private api = inject(Api);
  private vorgangApi = inject(VorgangApi);
  private ui = inject(UiService);
  readonly lebenslagen = LEBENSLAGEN;
  readonly formulare = signal<FormularInfo[]>([]);
  readonly entwuerfe = signal<Vorgang[]>([]);
  suche = '';
  lage = '';

  async ngOnInit() {
    const [f, e] = await Promise.all([this.api.get<FormularInfo[]>('/api/formulare'), this.vorgangApi.liste({ status: 'ENTWURF' })]);
    this.formulare.set(f);
    this.entwuerfe.set(e);
  }

  gruppen() {
    const q = this.suche.trim().toLowerCase();
    const passt = (f: FormularInfo) => (!q || (f.titel + ' ' + f.suchbegriffe.join(' ')).toLowerCase().includes(q)) && (!this.lage || f.lebenslagen.includes(this.lage));
    return (Object.keys(FORMULAR_KATEGORIEN) as FormularKategorie[]).map(k => ({
      kategorie: k, titel: FORMULAR_KATEGORIEN[k],
      formulare: this.formulare().filter(f => f.kategorie === k && passt(f)).sort((a, b) => a.titel.localeCompare(b.titel)),
      sonder: this.lage ? [] : SONDERSEITEN.filter(s => s.kategorie === k && (!q || (s.titel + ' ' + s.begriffe).toLowerCase().includes(q))),
    })).filter(g => g.formulare.length || g.sonder.length);
  }

  async entwurfLoeschen(e: Vorgang) {
    if (!(await this.ui.bestaetigen('Entwurf löschen', 'Möchten Sie den Entwurf endgültig löschen?', { bestaetigen: 'Löschen', gefaehrlich: true }))) return;
    try {
      await this.vorgangApi.entwurfLoeschen(e.id);
      this.entwuerfe.update(l => l.filter(x => x.id !== e.id));
      this.ui.erfolg('Der Entwurf wurde gelöscht.');
    } catch (err) {
      this.ui.fehler(fehlertext(err));
    }
  }
}

