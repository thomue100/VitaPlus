import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/services/api.service';
import { SitzungService } from '../../core/services/sitzung.service';
import { DatumPipe, EuroPipe } from '../../shared/pipes';
import { pdfHerunterladen } from '../../shared/pdf';

@Component({
  selector: 'vp-krankengeld',
  imports: [RouterLink, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Krankengeld</h1><p class="leise">Lohnersatz bei längerer Arbeitsunfähigkeit</p></div><a class="btn" routerLink="/krankmeldung">Krankmeldung erfassen</a></div>
    @if (k(); as k) {
      @if (!k.anspruch) { <div class="hinweis info">Nach Ihrer Versicherungsart besteht kein Anspruch auf Krankengeld.</div> }
      <div class="raster-3">
        <div class="karte"><h2>So funktioniert's</h2><p class="klein">Ihr Arbeitgeber zahlt bis zu 6 Wochen Ihr Gehalt weiter. Danach zahlen wir {{ k.regeln.prozentBrutto }} % Ihres Bruttoentgelts,
          höchstens {{ k.regeln.maxProzentNetto }} % des Nettoentgelts – bis zu {{ k.regeln.maxWochen }} Wochen.</p></div>
        <div class="karte"><h2>Ihr Krankengeld (Schätzung)</h2><p class="kennzahl">{{ k.schaetzungTag | euro }}</p><p class="klein leise">brutto pro Kalendertag, vor Abzug der Sozialversicherungsbeiträge</p></div>
        <div class="karte"><h2>Fälle mit Krankengeld</h2>
          <ul class="liste-ohne">@for (f of k.faelle; track f.id) { <li><a [routerLink]="['/vorgaenge', f.id]">{{ f.titel }}</a> <span class="klein leise">({{ f.kettenTage }} Tage)</span></li> }
            @empty { <li class="leer">Keine</li> }</ul></div>
      </div>
      <section class="karte"><h2>Zahlungen</h2>
        <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Zeitraum</th><th>Tage</th><th class="betrag">Brutto</th><th class="betrag">Abzüge</th><th class="betrag">Ausgezahlt</th><th>Datum</th><th></th></tr></thead><tbody>
          @for (z of k.zahlungen; track z.id) {
            <tr><td>{{ z.zeitraumVon | datum }} – {{ z.zeitraumBis | datum }}</td><td>{{ z.tage }}</td><td class="betrag">{{ z.brutto | euro }}</td><td class="betrag">{{ z.abzuege | euro }}</td>
              <td class="betrag fett">{{ z.netto | euro }}</td><td>{{ z.ausgezahltAm | datum }}</td>
              <td><button class="btn link klein" type="button" (click)="bescheinigung(z)">Bescheinigung</button></td></tr>
          } @empty { <tr><td colspan="7" class="leer">Bisher wurde kein Krankengeld gezahlt.</td></tr> }
        </tbody></table></div>
      </section>
    }`,
})
export class KrankengeldComponent implements OnInit {
  private api = inject(Api);
  private sitzung = inject(SitzungService);
  readonly k = signal<any>(null);
  async ngOnInit() {
    this.k.set(await this.api.get('/api/krankengeld'));
  }
  bescheinigung(z: any) {
    const b = this.sitzung.benutzer()!;
    const d = new DatumPipe();
    const e = new EuroPipe();
    pdfHerunterladen('Bescheinigung über den Bezug von Krankengeld', [
      `${b.vorname} ${b.nachname}, Versichertennummer ${b.versichertennummer}`, '',
      `Zeitraum: ${d.transform(z.zeitraumVon)} bis ${d.transform(z.zeitraumBis)} (${z.tage} Kalendertage)`,
      `Krankengeld brutto: ${e.transform(z.brutto)}`, `Abzüge (Renten-, Arbeitslosen-, Pflegeversicherung): ${e.transform(z.abzuege)}`,
      `Ausgezahlt am ${d.transform(z.ausgezahltAm)}: ${e.transform(z.netto)}`, '',
      'Diese Bescheinigung dient zur Vorlage beim Finanzamt (Progressionsvorbehalt) und wurde maschinell erstellt.',
    ], `Krankengeldbescheinigung_${z.zeitraumVon}.pdf`);
  }
}

const ZUZAHLUNGSARTEN: Record<string, string> = { ARZNEIMITTEL: 'Arzneimittel', KRANKENHAUS: 'Krankenhaus', HEILMITTEL: 'Heilmittel', HILFSMITTEL: 'Hilfsmittel', FAHRKOSTEN: 'Fahrkosten', HAUSLICHE_PFLEGE: 'Häusliche Krankenpflege' };

@Component({
  selector: 'vp-zuzahlungen',
  imports: [RouterLink, FormsModule, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Zuzahlungen</h1><p class="leise">Ihre gesetzlichen Eigenanteile und Ihre persönliche Belastungsgrenze</p></div>
      <div class="feld"><label for="zz-jahr">Jahr</label><select id="zz-jahr" [(ngModel)]="jahr" (ngModelChange)="laden()">@for (j of jahre; track j) { <option [value]="j">{{ j }}</option> }</select></div></div>
    @if (z(); as z) {
      @if (z.befreit) { <div class="hinweis erfolg">Sie sind für {{ z.jahr }} von Zuzahlungen befreit (Vorgang {{ z.befreiungsnummer }}).</div> }
      <div class="raster-3">
        <div class="karte"><h2>Gezahlt {{ z.jahr }}</h2><p class="kennzahl">{{ z.summe | euro }}</p></div>
        <div class="karte"><h2>Ihre Belastungsgrenze</h2><p class="kennzahl">{{ z.schaetzung.grenze | euro }}</p>
          <p class="klein leise">{{ z.schaetzung.prozent }} % Ihrer Bruttoeinnahmen{{ z.schaetzung.chroniker ? ' (chronisch krank)' : '' }} – Schätzung</p></div>
        <div class="karte hervor"><h2>Fortschritt</h2>
          <div class="balken" role="progressbar" [attr.aria-valuenow]="z.schaetzung.prozentErreicht" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="z.schaetzung.prozentErreicht"></span></div>
          <p class="klein">{{ z.schaetzung.prozentErreicht }} % erreicht</p>
          @if (z.schaetzung.erreicht && !z.befreit) { <a class="btn primaer klein" routerLink="/antraege/neu/ZUZAHLUNGSBEFREIUNG">Befreiung beantragen</a> }
          @else if (!z.befreit) { <a class="klein" routerLink="/rechner/zuzahlung">Belastungsgrenze genau berechnen</a> }</div>
      </div>
      <section class="karte"><h2>Einzelaufstellung</h2>
        <p class="klein">@for (a of arten(z); track a[0]) { <span class="badge">{{ artText[a[0]] }}: {{ a[1] | euro }}</span> }</p>
        <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Datum</th><th>Person</th><th>Art</th><th>Leistungserbringer</th><th class="betrag">Betrag</th></tr></thead><tbody>
          @for (x of z.liste; track x.id) { <tr><td>{{ x.datum | datum }}</td><td>{{ x.person }}</td><td>{{ artText[x.art] }}</td><td>{{ x.leistungserbringer }}</td><td class="betrag">{{ x.betrag | euro }}</td></tr> }
          @empty { <tr><td colspan="5" class="leer">Für {{ z.jahr }} sind keine Zuzahlungen erfasst.</td></tr> }
        </tbody></table></div>
        <p class="klein leise">Zuzahlungen in Apotheken werden uns mit Verzögerung gemeldet. Quittungen anderer Stellen reichen Sie mit dem Befreiungsantrag ein.</p>
      </section>
    }`,
})
export class ZuzahlungenComponent implements OnInit {
  private api = inject(Api);
  readonly z = signal<any>(null);
  readonly jahre = [String(new Date().getFullYear()), String(new Date().getFullYear() - 1)];
  readonly artText = ZUZAHLUNGSARTEN;
  jahr = this.jahre[0];
  ngOnInit() {
    this.laden();
  }
  async laden() {
    this.z.set(await this.api.get('/api/zuzahlungen', { jahr: this.jahr }));
  }
  arten(z: any): [string, number][] {
    return Object.entries(z.nachArt) as [string, number][];
  }
}

const BUCHUNGSART: Record<string, string> = { SOLL: 'Beitrag', ZAHLUNG: 'Zahlung', GUTSCHRIFT: 'Gutschrift', SAEUMNISZUSCHLAG: 'Säumniszuschlag', MAHNGEBUEHR: 'Mahngebühr', RATE: 'Rate' };
const ZAHLUNGSWEG: Record<string, string> = { ARBEITGEBER: 'über Ihren Arbeitgeber', RENTENVERSICHERUNG: 'über die Rentenversicherung', LASTSCHRIFT: 'per SEPA-Lastschrift', UEBERWEISUNG: 'per Überweisung' };

@Component({
  selector: 'vp-beitraege',
  imports: [RouterLink, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Beiträge</h1><p class="leise">Beitragshöhe, Zahlungen und Bescheinigungen</p></div>
      <div class="aktionen"><a class="btn" routerLink="/rechner/beitrag">Beitragsrechner</a><a class="btn" routerLink="/dokumente">Beitragsbescheinigung</a></div></div>
    @if (b(); as b) {
      @if (b.kontostand?.mahnstufe) {
        <div class="hinweis fehler" role="alert"><strong>Zahlungsrückstand:</strong> {{ b.kontostand.ueberfaellig | euro }} überfällig seit {{ b.kontostand.aeltesteFaelligkeit | datum }} (Mahnstufe {{ b.kontostand.mahnstufe }}).
          Weitere Säumniszuschläge: ca. {{ b.kontostand.saeumniszuschlagVorschau | euro }}.
          <div class="aktionen"><a class="btn klein" routerLink="/antraege/neu/RATENZAHLUNG">Ratenzahlung beantragen</a><a class="btn klein" routerLink="/antraege/neu/STUNDUNG">Stundung beantragen</a></div></div>
      }
      <div class="raster-2">
        <section class="karte hervor"><h2>Ihr monatlicher Beitrag</h2>
          <p class="kennzahl">{{ b.aktuell.summeVersicherter | euro }}</p>
          <p class="leise">Zahlung {{ zahlungsweg[b.zahlungsweg] }}</p>
          <table class="tabelle mt"><tbody>
            @if (b.aktuell.bemessungsgrundlage) { <tr><td>Beitragspflichtige Einnahmen</td><td class="betrag">{{ b.aktuell.bemessungsgrundlage | euro }}</td></tr> }
            <tr><td>Krankenversicherung {{ b.aktuell.kvSatz ? '(' + komma(b.aktuell.kvSatz) + ' %)' : '' }}</td><td class="betrag">{{ b.aktuell.kvAnteilVersicherter | euro }}</td></tr>
            <tr><td>Zusatzbeitrag ({{ komma(b.zusatzbeitrag) }} %)</td><td class="betrag">{{ b.aktuell.zusatzAnteilVersicherter | euro }}</td></tr>
            <tr><td>Pflegeversicherung</td><td class="betrag">{{ b.aktuell.pvAnteilVersicherter | euro }}</td></tr>
            @if (b.aktuell.summeArbeitgeber) { <tr><td>Anteil Arbeitgeber / Rentenversicherung</td><td class="betrag leise">{{ b.aktuell.summeArbeitgeber | euro }}</td></tr> }
          </tbody></table>
          @for (h of b.aktuell.hinweise; track h) { <p class="klein leise">{{ h }}</p> }
        </section>
        <section class="karte"><h2>Beitragsentwicklung</h2>
          <div class="diagramm" role="img" [attr.aria-label]="'Beitragsentwicklung ' + entwicklungText()">
            @for (e of b.entwicklung; track e.jahr) {
              <div class="saeule"><span class="wert">{{ e.monatsbeitrag | euro }}</span><span class="bar" [style.height.%]="hoehe(e.monatsbeitrag)"></span><span class="jahr">{{ e.jahr }}</span></div>
            }
          </div>
          <table class="tabelle klein mt"><thead><tr><th>Jahr</th><th>Zusatzbeitrag</th><th class="betrag">Ihr Monatsbeitrag</th></tr></thead><tbody>
            @for (e of b.entwicklung; track e.jahr) { <tr><td>{{ e.jahr }}</td><td>{{ komma(e.zusatzbeitrag) }} %</td><td class="betrag">{{ e.monatsbeitrag | euro }}</td></tr> }
          </tbody></table>
        </section>
      </div>
      @if (b.selbstzahler) {
        <section class="karte"><h2>Beitragskonto</h2>
          @if (b.kontostand; as k) {
            <div class="raster-3"><div><span class="leise">Soll gesamt</span><br /><strong>{{ k.soll | euro }}</strong></div><div><span class="leise">Gezahlt</span><br /><strong>{{ k.gezahlt | euro }}</strong></div>
              <div><span class="leise">Offen</span><br /><strong [class.feldfehler]="k.offen > 0">{{ k.offen | euro }}</strong></div></div>
          }
          @if (b.ratenplan) {
            <h3>Ihr Ratenplan</h3>
            <ul>@for (r of b.ratenplan; track r.faellig) { <li>{{ r.faellig | datum }}: {{ r.betrag | euro }}</li> }</ul>
          }
          <div class="tabelle-wrapper mt"><table class="tabelle"><thead><tr><th>Datum</th><th>Fällig</th><th>Buchung</th><th>Text</th><th class="betrag">Betrag</th></tr></thead><tbody>
            @for (x of b.konto; track x.id) { <tr><td>{{ x.datum | datum }}</td><td>{{ x.faellig ? (x.faellig | datum) : '' }}</td><td>{{ buchungsart[x.art] }}</td><td>{{ x.text }}</td>
              <td class="betrag" [class.leise]="x.art === 'SOLL'">{{ (['ZAHLUNG', 'GUTSCHRIFT', 'RATE'].includes(x.art) ? '+' : '−') }} {{ x.betrag | euro }}</td></tr> }
          </tbody></table></div>
        </section>
      }
      @if (b.arbeitgebermeldungen.length) {
        <section class="karte"><h2>Meldungen Ihres Arbeitgebers</h2>
          <table class="tabelle"><thead><tr><th>Zeitraum</th><th>Arbeitgeber</th><th>Grund</th><th class="betrag">Entgelt</th><th>Eingang</th></tr></thead><tbody>
            @for (m of b.arbeitgebermeldungen; track m.id) { <tr><td>{{ m.zeitraumVon | datum }} – {{ m.zeitraumBis | datum }}</td><td>{{ m.arbeitgeber }}</td><td>{{ meldegrund[m.grund] }}</td>
              <td class="betrag">{{ m.entgelt ? (m.entgelt | euro) : '–' }}</td><td>{{ m.eingang | datum }}</td></tr> }
          </tbody></table>
        </section>
      }
      <section class="karte"><h2>Weitere Möglichkeiten</h2><ul class="liste-ohne">
        <li><a routerLink="/profil">Bankverbindung und SEPA-Mandat verwalten</a></li>
        <li><a routerLink="/antraege/neu/EINKOMMEN">Einkommensänderung mitteilen</a></li>
        <li><a routerLink="/antraege/neu/STEUERBESCHEID">Einkommensteuerbescheid hochladen</a></li>
        <li><a routerLink="/antraege/neu/RATENZAHLUNG">Ratenzahlung</a> oder <a routerLink="/antraege/neu/STUNDUNG">Stundung</a> beantragen</li>
      </ul></section>
    }`,
  styles: [`.diagramm{display:flex;align-items:flex-end;gap:.75rem;height:160px;padding-top:1.5rem}.saeule{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
    .bar{width:70%;background:var(--vp-primaer);border-radius:4px 4px 0 0;min-height:4px}.wert{font-size:.7rem;color:var(--vp-text-leise)}.jahr{font-size:.8rem;margin-top:.2rem}`],
})
export class BeitraegeComponent implements OnInit {
  private api = inject(Api);
  readonly b = signal<any>(null);
  readonly buchungsart = BUCHUNGSART;
  readonly zahlungsweg = ZAHLUNGSWEG;
  readonly meldegrund: Record<string, string> = { ANMELDUNG: 'Anmeldung', JAHRESMELDUNG: 'Jahresmeldung', ABMELDUNG: 'Abmeldung', UNTERBRECHUNG: 'Unterbrechung (Krankengeld)' };
  private max = computed(() => Math.max(1, ...(this.b()?.entwicklung || []).map((e: any) => e.monatsbeitrag)));
  async ngOnInit() {
    this.b.set(await this.api.get('/api/beitraege'));
  }
  hoehe(w: number) {
    return (w / this.max()) * 100;
  }
  komma(n: number) {
    return String(n).replace('.', ',');
  }
  entwicklungText() {
    return (this.b()?.entwicklung || []).map((e: any) => `${e.jahr}: ${e.monatsbeitrag} Euro`).join(', ');
  }
}
