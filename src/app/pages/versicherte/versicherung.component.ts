import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/services/api.service';
import { DatumPipe } from '../../shared/pipes';

const ARTEN: Record<string, string> = { PFLICHT: 'Pflichtversicherung', FREIWILLIG: 'Freiwillige Versicherung', KVDR: 'Krankenversicherung der Rentner', STUDENT: 'Versicherung der Studierenden' };
const BESCHAEFTIGUNG: Record<string, string> = { ANGESTELLT: 'Beschäftigt', SELBSTSTAENDIG: 'Selbstständig', STUDENT: 'Studium', RENTNER: 'Rente' };

@Component({
  selector: 'vp-versicherung',
  imports: [RouterLink, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Meine Versicherung</h1><p class="leise">Status, Versicherungszeiten und Änderungen Ihrer Lebenssituation</p></div>
      <a class="btn" routerLink="/dokumente">Mitgliedsbescheinigung herunterladen</a></div>
    @if (v(); as v) {
      @if (v.status === 'GEKUENDIGT') { <div class="hinweis warnung">Ihre Mitgliedschaft ist gekündigt und endet am {{ v.mitgliedBis | datum }} (Vorgang {{ v.kuendigungVorgang }}).</div> }
      <div class="raster-2">
        <section class="karte hervor"><h2>Versicherungsstatus</h2><dl class="daten">
          <dt>Status</dt><dd><span class="badge" [class.gruen]="v.status === 'AKTIV'" [class.gelb]="v.status === 'GEKUENDIGT'" [class.rot]="v.status === 'BEENDET'">{{ v.status === 'AKTIV' ? 'Versichert' : v.status === 'GEKUENDIGT' ? 'Gekündigt' : 'Beendet' }}</span></dd>
          <dt>Versicherungsart</dt><dd>{{ arten[v.versicherungsart] || '–' }}</dd>
          <dt>Tätigkeit</dt><dd>{{ beschaeftigung[v.beschaeftigung] }}{{ v.arbeitgeber ? ' bei ' + v.arbeitgeber : '' }}</dd>
          <dt>Mitglied seit</dt><dd>{{ v.mitgliedSeit | datum }}</dd>
          <dt>Mitglied bis</dt><dd>{{ v.mitgliedBis ? (v.mitgliedBis | datum) : 'unbefristet' }}</dd>
          <dt>Tarif</dt><dd>{{ v.tarifName }}<br /><span class="klein leise">{{ v.tarifBeschreibung }}</span></dd>
          <dt>Pflegeversicherung</dt><dd>VitaPlus Pflegekasse</dd>
          <dt>Krankengeld</dt><dd>{{ v.krankengeldanspruch ? 'mit Anspruch' : 'ohne Anspruch' }}</dd>
        </dl></section>
        <section class="karte"><h2>Versicherungszeiten</h2>
          <ul class="zeitleiste">@for (z of v.zeiten; track z.von) { <li><strong>{{ z.von | datum }} – {{ z.bis ? (z.bis | datum) : 'heute' }}</strong><br />{{ z.art }}, {{ z.kasse }}</li> }</ul>
          @if (v.kundenberater; as k) { <h3>Ihr Ansprechpartner</h3><p>{{ k.name }} (Team {{ k.team }})<br />Telefon {{ k.telefon }}</p> }
        </section>
      </div>
      <h2>Hat sich etwas geändert?</h2>
      <div class="raster">
        @for (e of ereignisse; track e[0]) { <a class="kachel" [routerLink]="['/antraege/neu', e[0]]"><span class="titel">{{ e[1] }}</span><br /><span class="klein leise">{{ e[2] }}</span></a> }
      </div>
      <h2>Mitgliedschaft beenden</h2>
      <div class="karte"><p>Sie wechseln zu einer anderen gesetzlichen Krankenkasse? Dann müssen Sie nicht kündigen – die neue Kasse meldet sich bei uns. In allen anderen Fällen können Sie hier kündigen.</p>
        <a class="btn gefahr" routerLink="/antraege/neu/KUENDIGUNG">Mitgliedschaft kündigen</a></div>
    } @else { <p class="lade">Wird geladen …</p> }`,
})
export class VersicherungComponent implements OnInit {
  private api = inject(Api);
  readonly v = signal<any>(null);
  readonly arten = ARTEN;
  readonly beschaeftigung = BESCHAEFTIGUNG;
  readonly ereignisse: [string, string, string][] = [
    ['ARBEITGEBERWECHSEL', 'Neuer Arbeitgeber', 'Jobwechsel melden'], ['BESCHAEFTIGUNGSENDE', 'Beschäftigung endet', 'Kündigung, Befristung, Aufhebung'],
    ['SELBSTSTAENDIGKEIT', 'Selbstständigkeit', 'Beginn oder Ende melden'], ['STUDIUM', 'Studium', 'Studienbescheinigung einreichen'],
    ['AUSBILDUNG', 'Ausbildung', 'Ausbildungsbeginn mitteilen'], ['RENTE', 'Rente', 'Renteneintritt melden'],
    ['AUSLAND', 'Auslandsaufenthalt', 'Studium, Arbeit oder Umzug ins Ausland'], ['ELTERNZEIT', 'Elternzeit', 'Elternzeit mitteilen'],
    ['EINKOMMEN', 'Einkommen', 'Einkommensänderung mitteilen'],
  ];

  async ngOnInit() {
    this.v.set(await this.api.get('/api/versicherung'));
  }
}
