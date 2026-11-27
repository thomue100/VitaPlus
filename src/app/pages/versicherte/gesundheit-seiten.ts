import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EpaAkte } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { StatusComponent } from '../../shared/bausteine';
import { DatumPipe, EuroPipe } from '../../shared/pipes';
import { pdfHerunterladen } from '../../shared/pdf';
import { SymbolComponent } from '../../shared/symbol.component';

@Component({
  selector: 'vp-vorsorge',
  imports: [FormsModule, RouterLink, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Vorsorge & Gesundheitsziele</h1><p class="leise">Ihre persönlichen Vorsorgeansprüche nach Alter und Geschlecht</p></div>
      <a class="btn" routerLink="/bonus">Zum Bonusprogramm</a></div>
    <section class="karte"><h2>Ihr Vorsorgekalender</h2>
      <ul class="liste-ohne">@for (v of vorsorge(); track v.code) {
        <li class="zeile"><span><strong>{{ v.titel }}</strong><br /><span class="klein leise">{{ v.intervall }}{{ v.bonuspunkte ? ' · ' + v.bonuspunkte + ' Bonuspunkte' : '' }}</span></span>
          @if (v.erledigtImJahr) { <span class="badge gruen">in diesem Jahr erledigt</span> } @else { <span class="badge">offen</span> }</li>
      }</ul>
      <p class="klein">Impfungen: Alle von der STIKO empfohlenen Impfungen sind kostenfrei. <a routerLink="/leistungen/IMPFUNGEN">Mehr erfahren</a></p>
    </section>
    @if (daten(); as d) {
      <div class="raster-2">
        <section class="karte"><h2>Meine Gesundheitsziele</h2>
          <ul class="liste-ohne">@for (z of d.ziele; track z.id) {
            <li><div class="zeile"><strong>{{ z.titel }}</strong> @if (z.erreicht) { <span class="badge gruen">erreicht</span> } @else { <span class="klein leise">bis {{ z.bis | datum }}</span> }</div>
              <div class="balken"><span [style.width.%]="z.aktuell / z.zielwert * 100"></span></div>
              <div class="zeile klein"><span>{{ z.aktuell }} / {{ z.zielwert }} {{ z.einheit }}</span>
                @if (!z.erreicht) { <span><label class="sr-only" [for]="'zf-' + z.id">Fortschritt</label><input [id]="'zf-' + z.id" type="number" min="0" style="width:6rem" [ngModel]="z.aktuell" (change)="fortschritt(z.id, $any($event.target).value)" /></span> }</div></li>
          } @empty { <li class="leer">Noch keine Ziele angelegt.</li> }</ul>
          <form class="mt" (ngSubmit)="zielAnlegen()">
            <h3>Neues Ziel</h3>
            <div class="feldgruppe">
              <div class="feld breit"><label for="z-titel">Was möchten Sie erreichen?</label><input id="z-titel" name="titel" [(ngModel)]="ziel.titel" placeholder="z. B. 10 kg abnehmen" /></div>
              <div class="feld"><label for="z-wert">Zielwert</label><input id="z-wert" name="wert" type="number" min="1" [(ngModel)]="ziel.zielwert" /></div>
              <div class="feld"><label for="z-einheit">Einheit</label><input id="z-einheit" name="einheit" [(ngModel)]="ziel.einheit" placeholder="kg, km, Tage …" /></div>
              <div class="feld"><label for="z-bis">Bis</label><input id="z-bis" name="bis" type="date" [(ngModel)]="ziel.bis" /></div>
            </div>
            <button class="btn mt" type="submit">Ziel anlegen</button>
          </form>
        </section>
        <section class="karte"><h2>Aktuelle Challenges</h2>
          <ul class="liste-ohne">@for (c of d.challenges; track c.id) {
            <li><strong>{{ c.titel }}</strong> <span class="klein leise">bis {{ c.bis | datum }} · {{ c.punkte }} Bonuspunkte</span>
              @if (c.teilnahme) {
                <div class="balken mt"><span [style.width.%]="c.teilnahme.fortschritt / c.zielwert * 100"></span></div>
                <div class="zeile klein"><span>{{ c.teilnahme.fortschritt }} / {{ c.zielwert }} {{ c.einheit }}</span>
                  <span><button class="btn link klein" type="button" (click)="challenge(c.id, 'PLUS', c.teilnahme.fortschritt + (c.einheit === 'Schritte' ? 10000 : 1))">+ {{ c.einheit === 'Schritte' ? '10.000' : '1' }}</button>
                    <button class="btn link klein" type="button" (click)="challenge(c.id, 'ENDE')">Verlassen</button></span></div>
              } @else { <div><button class="btn klein mt" type="button" (click)="challenge(c.id, 'START')">Mitmachen</button></div> }
            </li>
          }</ul>
        </section>
      </div>
    }`,
})
export class VorsorgeComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly vorsorge = signal<any[]>([]);
  readonly daten = signal<any>(null);
  ziel = { titel: '', zielwert: null as number | null, einheit: '', bis: '' };

  async ngOnInit() {
    const [v, z] = await Promise.all([this.api.get('/api/vorsorge'), this.api.get('/api/ziele')]);
    this.vorsorge.set(v);
    this.daten.set(z);
  }

  private async aktion(f: () => Promise<any>) {
    try {
      this.daten.set(await f());
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  zielAnlegen() {
    this.aktion(async () => {
      const r = await this.api.post('/api/ziele', this.ziel);
      this.ziel = { titel: '', zielwert: null, einheit: '', bis: '' };
      return r;
    });
  }

  fortschritt(id: string, wert: string) {
    this.aktion(() => this.api.put(`/api/ziele/${id}`, { aktuell: Number(wert) }));
  }

  challenge(id: string, art: 'START' | 'ENDE' | 'PLUS', wert?: number) {
    this.aktion(() => art === 'START' ? this.api.post(`/api/challenges/${id}`) : art === 'ENDE' ? this.api.delete(`/api/challenges/${id}`) : this.api.put(`/api/challenges/${id}`, { fortschritt: wert }));
  }
}

@Component({
  selector: 'vp-epa',
  imports: [FormsModule, RouterLink, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Elektronische Patientenakte (ePA)</h1><p class="leise">Ihre Gesundheitsdaten – sicher an einem Ort. Sie entscheiden, wer zugreifen darf.</p></div></div>
    @if (epa(); as e) {
      <div class="raster-3">
        <section class="karte hervor"><h2>Status</h2>
          <p><span class="badge" [class.gruen]="e.status === 'AKTIV'" [class.rot]="e.status === 'WIDERSPROCHEN'">{{ e.status === 'AKTIV' ? 'ePA aktiv' : e.status === 'WIDERSPROCHEN' ? 'Widersprochen' : 'nicht eingerichtet' }}</span></p>
          @if (e.status === 'AKTIV') { <button class="btn gefahr klein" type="button" (click)="aktion('WIDERSPRECHEN', 'Der ePA widersprechen', 'Ihre ePA und alle gespeicherten Dokumente werden gelöscht. Fortfahren?')">Der ePA widersprechen</button> }
          @else { <button class="btn klein" type="button" (click)="aktion('WIDERSPRUCH_ZURUECK')">Widerspruch zurücknehmen</button> }</section>
        <section class="karte"><h2>GesundheitsID</h2>
          <p>{{ e.gesundheitsId === 'AKTIV' ? 'eingerichtet' : e.gesundheitsId === 'BEANTRAGT' ? 'beantragt – bitte PIN festlegen' : 'nicht eingerichtet' }}</p>
          @switch (e.gesundheitsId) {
            @case ('KEINE') { <button class="btn klein" type="button" (click)="aktion('GESUNDHEITSID_BEANTRAGEN')">GesundheitsID einrichten</button> }
            @case ('BEANTRAGT') { <div class="feld"><label for="gid-pin">6-stellige PIN festlegen</label><input id="gid-pin" type="password" maxlength="6" inputmode="numeric" [(ngModel)]="pin" /></div>
              <button class="btn klein mt" type="button" (click)="aktion('GESUNDHEITSID_AKTIVIEREN')">Aktivieren</button> }
          }</section>
        <section class="karte"><h2>ePA-App</h2>
          <p>{{ e.appGekoppelt ? 'Die VitaPlus ePA-App ist mit Ihrer Akte verbunden.' : 'Mit der App sehen Sie Ihre Dokumente und vergeben Berechtigungen.' }}</p>
          @if (!e.appGekoppelt && e.status === 'AKTIV') { <button class="btn klein" type="button" (click)="aktion('APP_KOPPELN')">App koppeln</button> }</section>
      </div>
      @if (e.status === 'AKTIV') {
        <section class="karte"><h2>Zugriffsberechtigungen</h2>
          <p class="klein leise">Wenn Sie Ihre Gesundheitskarte in einer Praxis einlesen, erhält diese automatisch für 90 Tage Zugriff (Apotheken: 3 Tage).</p>
          <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Einrichtung</th><th>Art</th><th>Berechtigt bis</th><th>Quelle</th><th>Status</th><th></th></tr></thead><tbody>
            @for (b of e.berechtigungen; track b.id) {
              <tr><td>{{ b.einrichtung }}</td><td>{{ b.art }}</td><td>{{ b.bis | datum }}</td><td>{{ b.quelle === 'EGK' ? 'Gesundheitskarte' : 'App' }}</td>
                <td><span class="badge" [class.gruen]="b.aktiv">{{ b.aktiv ? 'aktiv' : 'beendet' }}</span></td>
                <td>@if (b.aktiv) { <button class="btn link klein" type="button" (click)="aktion('BERECHTIGUNG_ENTZIEHEN', undefined, undefined, { berechtigungId: b.id })">Entziehen</button> }
                  @if (e.appGekoppelt) { <button class="btn link klein" type="button" (click)="verlaengern(b.id)">Verlängern</button> }</td></tr>
            } @empty { <tr><td colspan="6" class="leer">Derzeit hat keine Einrichtung Zugriff.</td></tr> }
          </tbody></table></div>
          @if (e.appGekoppelt) {
            <form class="filterleiste mt" (ngSubmit)="aktion('BERECHTIGUNG_ERTEILEN', undefined, undefined, { einrichtung: neueEinrichtung, bis: neuBis })">
              <div class="feld"><label for="epa-neu">Einrichtung</label><input id="epa-neu" name="einr" [(ngModel)]="neueEinrichtung" /></div>
              <div class="feld"><label for="epa-bis">bis</label><input id="epa-bis" name="bis" type="date" [(ngModel)]="neuBis" /></div>
              <button class="btn" type="submit">Zugriff erteilen</button></form>
          }
        </section>
        <div class="raster-2">
          <section class="karte"><h2>Widerspruchsmöglichkeiten</h2>
            <label class="auswahl"><input type="checkbox" [checked]="e.widerspruchMedikation" (change)="aktion('WIDERSPRUCH_MEDIKATION')" /> Widerspruch gegen die elektronische Medikationsliste</label>
            <label class="auswahl"><input type="checkbox" [checked]="e.widerspruchForschung" (change)="aktion('WIDERSPRUCH_FORSCHUNG')" /> Widerspruch gegen die Datenfreigabe für die Forschung (Forschungsdatenzentrum)</label></section>
          <section class="karte"><h2>Zugriffsprotokoll</h2>
            <ul class="liste-ohne klein">@for (z of e.zugriffe; track z.zeitpunkt) { <li>{{ z.zeitpunkt | datum: true }} – {{ z.einrichtung }}: {{ z.aktion }}</li> } @empty { <li class="leer">Keine Zugriffe</li> }</ul></section>
        </div>
      }
      <p class="klein"><a routerLink="/hilfe" [queryParams]="{ faq: 'faq16' }">Häufige Fragen zur ePA</a> · <a routerLink="/kontakt">ePA-Support kontaktieren</a></p>
    }`,
})
export class EpaComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly epa = signal<EpaAkte | null>(null);
  pin = '';
  neueEinrichtung = '';
  neuBis = '';

  async ngOnInit() {
    this.epa.set(await this.api.get('/api/epa'));
  }

  async aktion(aktion: string, titel?: string, text?: string, extra: Record<string, any> = {}) {
    if (titel && !(await this.ui.bestaetigen(titel, text || '', { gefaehrlich: true, bestaetigen: 'Ja, widersprechen' }))) return;
    try {
      this.epa.set(await this.api.post('/api/epa', { aktion, pin: this.pin, ...extra }));
      this.ui.erfolg('Ihre Einstellung wurde gespeichert.');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
      this.epa.set(await this.api.get('/api/epa'));
    }
  }

  verlaengern(id: string) {
    const bis = prompt('Berechtigung verlängern bis (JJJJ-MM-TT):');
    if (bis) this.aktion('BERECHTIGUNG_VERLAENGERN', undefined, undefined, { berechtigungId: id, bis });
  }
}

@Component({
  selector: 'vp-digital',
  imports: [RouterLink, StatusComponent, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Digitale Gesundheit</h1><p class="leise">E-Rezept, eAU, Apps auf Rezept und Behandlungsprogramme</p></div></div>
    <div class="raster-2">
      <section class="karte"><h2>E-Rezept</h2><p>Lösen Sie Ihre Rezepte in jeder Apotheke mit Ihrer Gesundheitskarte ein – oder mit der E-Rezept-App bzw. der ePA-App, auch für Versandapotheken.</p>
        <a routerLink="/leistungen/EREZEPT">Mehr zum E-Rezept</a></section>
      <section class="karte"><h2>Elektronische AU (eAU)</h2><p>Ihre Praxis übermittelt die Krankmeldung direkt an uns, Ihr Arbeitgeber ruft sie ab. Sie müssen keinen „gelben Schein“ mehr weiterleiten.</p>
        <a routerLink="/krankmeldung">Zur Krankmeldung</a></section>
    </div>
    @if (d(); as d) {
      <section class="karte"><h2>Apps auf Rezept (DiGA)</h2>
        <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Anwendung</th><th>Bereich</th><th>Laufzeit</th><th class="betrag">Preis</th></tr></thead><tbody>
          @for (x of d.digas; track x.id) { <tr><td>{{ x.name }}</td><td>{{ x.bereich }}</td><td>{{ x.dauerTage }} Tage</td><td class="betrag">{{ x.preis | euro }}</td></tr> }
        </tbody></table></div>
        <div class="aktionen"><a class="btn primaer" routerLink="/antraege/neu/DIGA">Freischaltcode anfordern</a></div></section>
      <section class="karte"><h2>Behandlungsprogramme für chronisch Kranke (DMP)</h2>
        <p>@for (p of d.dmps; track p.code) { <span class="badge">{{ p.name }}</span> }</p>
        <a class="btn" routerLink="/antraege/neu/DMP">Teilnahme melden</a></section>
      <section class="karte"><h2>Ihre digitalen Leistungen</h2>
        <ul class="liste-ohne">@for (v of d.eigene; track v.id) {
          <li class="zeile"><a [routerLink]="['/vorgaenge', v.id]">{{ v.titel }}</a><span>{{ v.erstelltAm | datum }} <vp-status [wert]="v.status" />
            @if (v.daten['freischaltcode'] && v.status === 'GENEHMIGT') { <code>{{ v.daten['freischaltcode'] }}</code> }</span></li>
        } @empty { <li class="leer">Keine</li> }</ul></section>
      <section class="karte"><h2>Telemedizin & Beratung</h2><ul>
        <li>Videosprechstunde mit unseren Beraterinnen und Beratern – <a routerLink="/termine">Termin buchen</a></li>
        <li>Medizinische Hotline rund um die Uhr: 0800 123 456 9</li>
        <li>Arzneimittelberatung durch unsere Apothekerinnen und Apotheker – <a routerLink="/postfach/neu">Frage stellen</a></li>
      </ul></section>
    }`,
})
export class DigitalComponent implements OnInit {
  private api = inject(Api);
  readonly d = signal<any>(null);
  async ngOnInit() {
    this.d.set(await this.api.get('/api/digital'));
  }
}

const BEREICH: Record<string, string> = { AERZTLICH: 'Ärztlich', ZAHNAERZTLICH: 'Zahnärztlich', ARZNEIMITTEL: 'Arzneimittel', KRANKENHAUS: 'Krankenhaus', HEILMITTEL: 'Heilmittel' };

@Component({
  selector: 'vp-patientenquittung',
  imports: [FormsModule, RouterLink, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Patientenquittung</h1><p class="leise">Welche Leistungen wurden für Sie abgerechnet? (§ 305 SGB V)</p></div>
      <div class="aktionen"><button class="btn" type="button" (click)="pdf()">Als PDF herunterladen</button><a class="btn link" routerLink="/antraege/neu/LEISTUNGSAUSKUNFT">Auskunft beantragen</a></div></div>
    <form class="filterleiste" (ngSubmit)="laden()">
      <div class="feld"><label for="pq-von">Von</label><input id="pq-von" name="von" type="date" [(ngModel)]="f.von" /></div>
      <div class="feld"><label for="pq-bis">Bis</label><input id="pq-bis" name="bis" type="date" [(ngModel)]="f.bis" /></div>
      <div class="feld"><label for="pq-ber">Bereich</label><select id="pq-ber" name="ber" [(ngModel)]="f.bereich"><option value="">Alle</option>@for (b of bereiche; track b[0]) { <option [value]="b[0]">{{ b[1] }}</option> }</select></div>
      <div class="feld"><label for="pq-pers">Person</label><select id="pq-pers" name="pers" [(ngModel)]="f.person"><option value="">Alle</option>@for (p of d()?.personen || []; track p) { <option [value]="p">{{ p }}</option> }</select></div>
      <button class="btn" type="submit">Anzeigen</button>
    </form>
    @if (d(); as d) {
      <section class="karte">
        <p>Abgerechnete Kosten im Zeitraum: <strong>{{ d.summe | euro }}</strong></p>
        <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Datum</th><th>Quartal</th><th>Person</th><th>Bereich</th><th>Leistungserbringer</th><th>Leistung</th><th class="betrag">Betrag</th></tr></thead><tbody>
          @for (x of d.eintraege; track x.id) { <tr><td>{{ x.datum | datum }}</td><td>{{ x.quartal }}</td><td>{{ x.person }}</td><td>{{ bereich[x.bereich] }}</td><td>{{ x.leistungserbringer }}</td><td>{{ x.beschreibung }}</td><td class="betrag">{{ x.betrag | euro }}</td></tr> }
          @empty { <tr><td colspan="7" class="leer">Keine abgerechneten Leistungen im gewählten Zeitraum.</td></tr> }
        </tbody></table></div>
        <p class="klein leise">Abrechnungsdaten liegen uns in der Regel erst 6–9 Monate nach dem Quartal vor. Unstimmigkeiten? <a routerLink="/postfach/neu">Teilen Sie es uns mit.</a></p>
      </section>
    }`,
})
export class PatientenquittungComponent implements OnInit {
  private api = inject(Api);
  private sitzung = inject(SitzungService);
  readonly d = signal<any>(null);
  readonly bereiche = Object.entries(BEREICH);
  readonly bereich = BEREICH;
  f = { von: `${new Date().getFullYear() - 1}-01-01`, bis: new Date().toLocaleDateString('sv-SE'), bereich: '', person: '' };
  ngOnInit() {
    this.laden();
  }
  async laden() {
    this.d.set(await this.api.get('/api/leistungsdaten', this.f));
  }
  pdf() {
    const b = this.sitzung.benutzer()!;
    const dp = new DatumPipe();
    const e = new EuroPipe();
    pdfHerunterladen('Patientenquittung', [`${b.vorname} ${b.nachname}, Versichertennummer ${b.versichertennummer}`, `Zeitraum ${dp.transform(this.f.von)} bis ${dp.transform(this.f.bis)}`, '',
      ...this.d().eintraege.map((x: any) => `${dp.transform(x.datum)}  ${x.person}  ${BEREICH[x.bereich]}  ${x.leistungserbringer}: ${x.beschreibung}  ${e.transform(x.betrag)}`),
      '', `Summe: ${e.transform(this.d().summe)}`], `Patientenquittung_${this.f.von}_${this.f.bis}.pdf`);
  }
}
