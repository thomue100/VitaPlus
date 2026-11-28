import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { StatusComponent } from '../../shared/bausteine';
import { DatumPipe, EuroPipe, TypTextPipe } from '../../shared/pipes';
import { DatumEingabeComponent } from '../../shared/datum-eingabe.component';

@Component({
  selector: 'vp-pflege',
  imports: [DatumEingabeComponent, FormsModule, RouterLink, StatusComponent, DatumPipe, EuroPipe, TypTextPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="seitenbuehne">
      <div><h1>Pflege</h1><p>VitaPlus Pflegekasse – Leistungen für Pflegebedürftige und pflegende Angehörige</p>
        <div class="aktionen"><a class="btn" routerLink="/termine">Pflegeberatung vereinbaren</a></div></div>
    </section>
    @if (p(); as p) {
      @if (p.akte; as a) {
        <div class="raster-3">
          <section class="karte hervor"><h2>Pflegegrad {{ a.pflegegrad }}</h2><p>seit {{ a.seit | datum }}, {{ leistungsart[a.leistungsart] }}</p>
            <p class="kennzahl">{{ (a.leistungsart === 'SACHLEISTUNG' ? p.sachleistung : p.pflegegeld) | euro }}</p><p class="klein leise">monatlich</p>
            @if (a.pflegegrad < 5) { <a class="klein" routerLink="/antraege/neu/PFLEGEGRAD">Höherstufung beantragen</a> }</section>
          <section class="karte"><h2>Entlastungsbetrag {{ jahr }}</h2><p class="kennzahl">{{ p.entlastung.verfuegbar | euro }}</p>
            <p class="klein leise">verfügbar, Anspruch {{ p.entlastung.anspruch | euro }}, genutzt {{ p.entlastung.genutzt | euro }}{{ p.entlastung.uebertrag ? ', Übertrag Vorjahr ' + (p.entlastung.uebertrag | euro) : '' }}</p>
            <a class="klein" routerLink="/antraege/neu/ENTLASTUNGSBETRAG">Rechnung einreichen</a></section>
          <section class="karte"><h2>Verhinderungs- & Kurzzeitpflege</h2><p class="kennzahl">{{ p.budget.rest | euro }}</p>
            <div class="balken"><span [style.width.%]="p.budget.genutzt / p.budget.gesamt * 100"></span></div>
            <p class="klein leise">von {{ p.budget.gesamt | euro }} Jahresbetrag verfügbar</p></section>
        </div>
        <section class="karte"><h2>Pflegepersonen</h2>
          <ul class="liste-ohne">@for (pp of a.pflegepersonen; track pp.name) { <li class="zeile">{{ pp.name }} <span class="klein">{{ pp.stundenProWoche }} Std./Woche, {{ pp.rentenversichert ? 'rentenversichert über die Pflegekasse' : 'nicht rentenversichert' }}</span></li> }
            @empty { <li class="leer">Keine Pflegeperson gemeldet.</li> }</ul>
          <a class="btn klein" routerLink="/antraege/neu/PFLEGEPERSON">Pflegeperson melden</a></section>
      } @else {
        <section class="karte hervor"><h2>Pflegebedürftig?</h2>
          <p>Wenn Sie oder ein Angehöriger im Alltag dauerhaft Hilfe benötigen, beantragen Sie einen Pflegegrad. Der Medizinische Dienst begutachtet die Situation – meist bei Ihnen zu Hause.</p>
          <a class="btn primaer" routerLink="/antraege/neu/PFLEGEGRAD">Pflegegrad beantragen</a></section>
      }
      @if (offeneBegutachtung(p); as v) {
        <section class="karte"><h2>Begutachtung durch den Medizinischen Dienst</h2>
          @if (v.daten['begutachtung']?.datum) { <p>Termin: <strong>{{ v.daten['begutachtung'].datum | datum }} um {{ v.daten['begutachtung'].uhrzeit }} Uhr</strong> ({{ v.daten['begutachtung'].gutachter }})</p> }
          @else {
            <p>Bitte wählen Sie einen Wunschtermin für die Begutachtung:</p>
            <div class="filterleiste"><div class="feld"><label for="bg-datum">Datum</label><vp-datum id="bg-datum" [(ngModel)]="termin.datum" /></div>
              <div class="feld"><label for="bg-zeit">Uhrzeit</label><select id="bg-zeit" [(ngModel)]="termin.uhrzeit"><option value="09:00">09:00 Uhr</option><option value="11:00">11:00 Uhr</option><option value="14:00">14:00 Uhr</option></select></div>
              <button class="btn" type="button" (click)="terminWaehlen()">Termin bestätigen</button></div>
          }
          <p class="klein leise">Halten Sie Arztberichte, Medikamentenplan und ggf. ein Pflegetagebuch bereit.</p></section>
      }
      <h2>Leistungen und Anträge</h2>
      <div class="raster">
        @for (l of leistungen; track l[0]) { <a class="kachel" [routerLink]="l[2]"><span class="titel">{{ l[0] }}</span><br /><span class="klein leise">{{ l[1] }}</span></a> }
      </div>
      <section class="karte mt-2"><h2>Leistungsübersicht nach Pflegegrad</h2>
        <table class="tabelle"><thead><tr><th>Pflegegrad</th><th class="betrag">Pflegegeld</th><th class="betrag">Sachleistung</th></tr></thead><tbody>
          @for (g of [2, 3, 4, 5]; track g) { <tr [class.fett]="p.akte?.pflegegrad === g"><td>{{ g }}</td><td class="betrag">{{ p.werte.pflegegeld[g] | euro }}</td><td class="betrag">{{ p.werte.sachleistung[g] | euro }}</td></tr> }
        </tbody></table><p class="klein leise">Pflegegrad 1: Entlastungsbetrag, Pflegehilfsmittel, Wohnumfeldverbesserung und Beratung.</p></section>
      <section class="karte"><h2>Ihre Pflege-Vorgänge</h2>
        <ul class="liste-ohne">@for (v of p.antraege; track v.id) { <li class="zeile"><a [routerLink]="['/vorgaenge', v.id]">{{ v.titel }}</a><span class="klein">{{ v.typ | typText }}, {{ v.erstelltAm | datum }} <vp-status [wert]="v.status" /></span></li> }
          @empty { <li class="leer">Keine</li> }</ul></section>
    }`,
})
export class PflegeComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly p = signal<any>(null);
  readonly jahr = new Date().getFullYear();
  readonly leistungsart: Record<string, string> = { PFLEGEGELD: 'Pflegegeld', SACHLEISTUNG: 'Pflegesachleistung', KOMBINATION: 'Kombinationsleistung' };
  readonly leistungen: [string, string, string][] = [
    ['Verhinderungspflege', 'Ersatzpflege bei Urlaub oder Krankheit', '/antraege/neu/VERHINDERUNGSPFLEGE'],
    ['Kurzzeitpflege', 'Vorübergehend vollstationär', '/antraege/neu/KURZZEITPFLEGE'],
    ['Pflegehilfsmittel', 'Handschuhe, Desinfektion, Pflegebett', '/antraege/neu/PFLEGEHILFSMITTEL'],
    ['Wohnumfeld verbessern', 'Bis zu 4.180 € Zuschuss', '/antraege/neu/WOHNUMFELD'],
    ['Tages- und Nachtpflege', 'Teilstationäre Betreuung', '/leistungen/TAGESPFLEGE'],
    ['Pflegekurse', 'Kostenfrei für Angehörige', '/kurse'],
  ];
  termin = { datum: '', uhrzeit: '11:00' };

  async ngOnInit() {
    this.p.set(await this.api.get('/api/pflege'));
  }

  offeneBegutachtung(p: any) {
    return p.antraege.find((v: any) => v.typ === 'PFLEGEGRAD' && ['EINGEREICHT', 'IN_BEARBEITUNG'].includes(v.status));
  }

  async terminWaehlen() {
    try {
      await this.api.post('/api/pflege/begutachtung', this.termin);
      this.ui.erfolg('Ihr Begutachtungstermin ist bestätigt.');
      this.ngOnInit();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
