import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BEITRAG, ERSTATTUNGEN, ZUZAHLUNG } from '../../core/konfiguration';
import { Tarif } from '../../core/models';
import { SitzungService } from '../../core/services/sitzung.service';
import { berechneBeitrag, berechneErstattung, BeitragsErgebnis } from '../../core/util/berechnungen';
import { alterAm } from '../../core/util/datum';
import { EuroPipe } from '../../shared/pipes';

const BUNDESLAENDER = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
  'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'];

@Component({
  selector: 'vp-rechner',
  imports: [FormsModule, RouterLink, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Rechner</h1><p class="leise">Unverbindliche Berechnung – maßgeblich ist Ihr Bescheid.</p></div></div>
    <nav class="reiter">
      <a routerLink="/rechner/beitrag" [class.aktiv]="art() === 'beitrag'">Beitragsrechner</a>
      <a routerLink="/rechner/zuzahlung" [class.aktiv]="art() === 'zuzahlung'">Belastungsgrenze</a>
      <a routerLink="/rechner/erstattung" [class.aktiv]="art() === 'erstattung'">Erstattungsrechner</a>
    </nav>
    @switch (art()) {
      @case ('beitrag') {
        <div class="raster-2">
          <form class="karte">
            <div class="feldgruppe">
              <div class="feld breit"><label for="r-status">Ich bin …</label>
                <select id="r-status" name="status" [(ngModel)]="b.beschaeftigung" (ngModelChange)="rechnen()">
                  <option value="ANGESTELLT">angestellt</option><option value="MINIJOB">im Minijob</option><option value="SELBSTSTAENDIG">selbstständig</option>
                  <option value="STUDENT">Student/in</option><option value="RENTNER">Rentner/in</option></select></div>
              @if (b.beschaeftigung !== 'STUDENT') {
                <div class="feld"><label for="r-brutto">{{ b.beschaeftigung === 'RENTNER' ? 'Monatliche Rente (brutto)' : b.beschaeftigung === 'SELBSTSTAENDIG' ? 'Monatlicher Gewinn' : 'Monatliches Bruttogehalt' }}</label>
                  <input id="r-brutto" name="brutto" type="number" min="0" step="10" [(ngModel)]="b.bruttoMonat" (ngModelChange)="rechnen()" /></div>
              }
              <div class="feld"><label for="r-alter">Alter</label><input id="r-alter" name="alter" type="number" min="14" max="99" [(ngModel)]="b.alter" (ngModelChange)="rechnen()" /></div>
              <div class="feld"><label for="r-kinder">Anzahl Kinder</label><input id="r-kinder" name="kinder" type="number" min="0" max="10" [(ngModel)]="b.kinder" (ngModelChange)="rechnen()" /></div>
              <div class="feld"><label for="r-land">Bundesland (Arbeitsort)</label>
                <select id="r-land" name="land" [(ngModel)]="b.bundesland" (ngModelChange)="rechnen()">@for (l of laender; track l) { <option [value]="l">{{ l }}</option> }</select></div>
              @if (b.beschaeftigung === 'SELBSTSTAENDIG') {
                <label class="auswahl breit"><input type="checkbox" name="kg" [(ngModel)]="b.krankengeldanspruch" (ngModelChange)="rechnen()" /> mit Anspruch auf Krankengeld</label>
              }
            </div>
          </form>
          <div class="karte hervor" aria-live="polite">
            @if (ergebnis(); as e) {
              <h2>Ihr monatlicher Beitrag</h2>
              <p class="kennzahl">{{ e.summeVersicherter | euro }}</p>
              @if (e.summeArbeitgeber > 0) { <p class="leise">Ihr Arbeitgeber zahlt zusätzlich {{ e.summeArbeitgeber | euro }}.</p> }
              <table class="tabelle mt"><tbody>
                @if (e.bemessungsgrundlage) { <tr><td>Beitragspflichtiges Einkommen</td><td class="betrag">{{ e.bemessungsgrundlage | euro }}</td></tr> }
                <tr><td>Krankenversicherung{{ e.kvSatz ? ' (' + e.kvSatz.toString().replace('.', ',') + ' %)' : '' }}</td><td class="betrag">{{ e.kvAnteilVersicherter | euro }}</td></tr>
                <tr><td>Zusatzbeitrag ({{ zusatz }} %)</td><td class="betrag">{{ e.zusatzAnteilVersicherter | euro }}</td></tr>
                <tr><td>Pflegeversicherung</td><td class="betrag">{{ e.pvAnteilVersicherter | euro }}</td></tr>
                <tr class="fett"><td>Ihr Anteil</td><td class="betrag">{{ e.summeVersicherter | euro }}</td></tr>
              </tbody></table>
              @for (h of e.hinweise; track h) { <div class="hinweis info klein">{{ h }}</div> }
            }
          </div>
        </div>
      }
      @case ('zuzahlung') {
        <div class="raster-2">
          <form class="karte">
            <div class="feldgruppe">
              <div class="feld breit"><label for="z-brutto">Jährliche Bruttoeinnahmen des Haushalts</label><input id="z-brutto" name="brutto" type="number" min="0" [(ngModel)]="z.brutto" /></div>
              <div class="feld"><label for="z-ang">Ehe-/Lebenspartner im Haushalt</label><select id="z-ang" name="ang" [(ngModel)]="z.angehoerige"><option [ngValue]="0">Nein</option><option [ngValue]="1">Ja</option></select></div>
              <div class="feld"><label for="z-kinder">Kinder im Haushalt</label><input id="z-kinder" name="kinder" type="number" min="0" max="10" [(ngModel)]="z.kinder" /></div>
              <label class="auswahl breit"><input type="checkbox" name="chron" [(ngModel)]="z.chronisch" /> chronisch krank (schwerwiegend)</label>
            </div>
          </form>
          <div class="karte hervor" aria-live="polite">
            <h2>Ihre Belastungsgrenze</h2>
            <p class="kennzahl">{{ grenze().grenze | euro }}</p>
            <p class="leise">{{ grenze().prozent }} % von {{ grenze().grundlage | euro }} (nach Abzug von {{ grenze().abzug | euro }} Freibeträgen)</p>
            <p>Liegen Ihre Zuzahlungen im Jahr darüber, können Sie sich befreien lassen.</p>
            <a class="btn" routerLink="/antraege/neu/ZUZAHLUNGSBEFREIUNG">Befreiung beantragen</a>
          </div>
        </div>
      }
      @case ('erstattung') {
        <div class="raster-2">
          <form class="karte">
            <div class="feldgruppe">
              <div class="feld"><label for="e-tarif">Tarif</label><select id="e-tarif" name="tarif" [(ngModel)]="e.tarif">
                <option value="BASIS">VitaPlus Basis</option><option value="KOMFORT">VitaPlus Komfort</option><option value="PREMIUM">VitaPlus Premium</option></select></div>
              <div class="feld"><label for="e-leistung">Leistung</label><select id="e-leistung" name="leistung" [(ngModel)]="e.leistung">
                @for (r of regeln; track r.code) { <option [value]="r.code">{{ r.bezeichnung }}</option> }</select></div>
              <div class="feld"><label for="e-betrag">Rechnungsbetrag</label><input id="e-betrag" name="betrag" type="number" min="0" step="0.01" [(ngModel)]="e.betrag" /></div>
              <div class="feld"><label for="e-bisher">Bereits erstattet in diesem Jahr</label><input id="e-bisher" name="bisher" type="number" min="0" step="0.01" [(ngModel)]="e.bisher" /></div>
            </div>
          </form>
          <div class="karte hervor" aria-live="polite">
            @let v = erstattung();
            <h2>Voraussichtliche Erstattung</h2>
            <p class="kennzahl">{{ v.betrag | euro }}</p>
            @for (g of v.gruende; track g) { <div class="hinweis warnung klein">{{ g }}</div> }
            @if (v.regel?.hinweis) { <p class="klein">{{ v.regel?.hinweis }}</p> }
            <a class="btn" routerLink="/erstattung">Rechnung einreichen</a>
          </div>
        </div>
      }
    }`,
})
export class RechnerComponent {
  private sitzung = inject(SitzungService);
  readonly art = input<string>('beitrag');
  readonly laender = BUNDESLAENDER;
  readonly regeln = ERSTATTUNGEN;
  readonly zusatz = BEITRAG.zusatzbeitrag.toString().replace('.', ',');
  readonly ergebnis = signal<BeitragsErgebnis | null>(null);

  b = { beschaeftigung: 'ANGESTELLT' as any, bruttoMonat: 3500, alter: 35, kinder: 0, bundesland: 'Berlin', krankengeldanspruch: true };
  z = { brutto: 30000, angehoerige: 0, kinder: 0, chronisch: false };
  e = { tarif: 'KOMFORT' as Tarif, leistung: 'PZR', betrag: 100, bisher: 0 };

  constructor() {
    const u = this.sitzung.benutzer();
    if (u && u.rolle === 'VERSICHERTER') {
      this.b = { ...this.b, beschaeftigung: u.beschaeftigung, bruttoMonat: u.bruttoMonat || this.b.bruttoMonat, alter: alterAm(u.geburtsdatum), kinder: u.kinderAnzahl };
      this.e.tarif = u.tarif;
    }
    this.rechnen();
  }

  rechnen() {
    this.ergebnis.set(berechneBeitrag({ ...this.b, bruttoMonat: Number(this.b.bruttoMonat) || 0, alter: Number(this.b.alter) || 0, kinder: Number(this.b.kinder) || 0 }));
  }

  grenze() {
    let abzug = 0;
    if (Number(this.z.angehoerige) > 0) abzug += ZUZAHLUNG.freibetragErsterAngehoeriger;
    abzug += (Number(this.z.kinder) || 0) * ZUZAHLUNG.freibetragKind;
    const grundlage = Math.max((Number(this.z.brutto) || 0) - abzug, ZUZAHLUNG.mindestbemessungJahr);
    const prozent = this.z.chronisch ? ZUZAHLUNG.belastungsgrenzeChronikerProzent : ZUZAHLUNG.belastungsgrenzeProzent;
    return { grundlage, abzug, prozent, grenze: Math.round(grundlage * prozent) / 100 };
  }

  erstattung() {
    return berechneErstattung(this.e.leistung, this.e.tarif, Number(this.e.betrag) || 0, Number(this.e.bisher) || 0, 0, 40);
  }
}

