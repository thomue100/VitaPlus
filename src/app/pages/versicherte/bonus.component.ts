import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Anhang, BonusEintrag } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { BonusApi, BonusDaten, BonusJahr } from '../../core/services/service-api.service';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { bonusEuro } from '../../core/util/berechnungen';
import { heuteIso } from '../../core/util/datum';
import { DateienComponent, StatusComponent } from '../../shared/bausteine';
import { DatumPipe, EuroPipe } from '../../shared/pipes';

const KATEGORIEN: Record<string, string> = { VORSORGE: 'Vorsorge', BEWEGUNG: 'Bewegung', ERNAEHRUNG: 'Ernährung & Kurse', IMPFUNG: 'Impfungen', LEBENSSTIL: 'Lebensstil' };

@Component({
  selector: 'vp-bonus',
  imports: [FormsModule, RouterLink, DateienComponent, StatusComponent, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="seitenbuehne">
      <div><h1>Bonusprogramm „VitaPlus aktiv“</h1><p>Gesund leben lohnt sich: 1 Punkt = 10 Cent, als Gesundheitsbudget sogar 20 % mehr.</p>
        <div class="aktionen"><a class="btn" routerLink="/vorsorge">Vorsorgekalender & Ziele</a></div></div>
      <img src="bilder/bonus-pokal.svg" alt="" width="300" height="220" style="width:200px" />
    </section>

    @if (!sitzung.benutzer()?.bonusTeilnahmeSeit) {
      <section class="karte hervor">
        <h2>Jetzt teilnehmen</h2>
        <p>Sammeln Sie Punkte für Vorsorge, Sport und Impfungen und erhalten Sie bis zu {{ maxEuro | euro }} pro Jahr.</p>
        <label class="auswahl"><input type="checkbox" [(ngModel)]="einwilligung" /> <span class="pflicht">Ich willige ein, dass die VitaPlus meine Nachweise zur Berechnung des Bonus verarbeitet. Die Einwilligung kann ich jederzeit widerrufen.</span></label>
        <div class="aktionen"><button class="btn primaer" type="button" (click)="teilnehmen()" [disabled]="!einwilligung">Am Bonusprogramm teilnehmen</button></div>
      </section>
    } @else if (daten(); as d) {
      <div class="raster-3">
        @for (j of d.jahre.slice(0, 2); track j.jahr) {
          <section class="karte" [class.hervor]="j.jahr === jahr">
            <h2>{{ j.jahr }}</h2>
            <p class="kennzahl">{{ j.bestaetigt }} Punkte</p>
            @if (j.offen) { <p class="klein leise">+ {{ j.offen }} Punkte in Prüfung</p> }
            @if (j.bestaetigt > d.regeln.maxPunkteProJahr) { <p class="klein">Angerechnet werden höchstens {{ d.regeln.maxPunkteProJahr }} Punkte.</p> }
            <div class="balken"><span [style.width.%]="min(100, j.bestaetigt / d.regeln.mindestpunkteAuszahlung * 100)"></span></div>
            @if (j.eingeloest) { <p class="mt"><span class="badge gruen">Prämie eingelöst</span></p> }
            @else if (j.auszahlbar) { <button class="btn primaer mt" type="button" (click)="praemieWaehlen(j)">Prämie anfordern</button> }
            @else if (j.bestaetigt < d.regeln.mindestpunkteAuszahlung) { <p class="klein mt">Noch {{ d.regeln.mindestpunkteAuszahlung - j.bestaetigt }} Punkte bis zur Prämie</p> }
            @else { <p class="klein mt">Prämie ab 1. November anforderbar</p> }
          </section>
        }
        <section class="karte"><h2>Teilnahme</h2><p>seit {{ sitzung.benutzer()?.bonusTeilnahmeSeit | datum }}</p>
          <button class="btn link klein" type="button" (click)="beenden()">Teilnahme beenden</button></section>
      </div>

      @if (praemieJahr(); as j) {
        <section class="karte hervor">
          <h2>Prämie {{ j.jahr }} anfordern</h2>
          <div class="auswahlgruppe">
            <label class="auswahl"><input type="radio" name="art" value="AUSZAHLUNG" [(ngModel)]="praemienart" /> Auszahlung: <strong>{{ euro(j.anrechenbar, false) | euro }}</strong> auf Ihr Konto</label>
            <label class="auswahl"><input type="radio" name="art" value="GESUNDHEITSBUDGET" [(ngModel)]="praemienart" /> Gesundheitsbudget: <strong>{{ euro(j.anrechenbar, true) | euro }}</strong> für Zusatzleistungen (+20 %)</label>
          </div>
          <div class="aktionen"><button class="btn" type="button" (click)="praemieJahr.set(null)">Abbrechen</button><button class="btn primaer" type="button" (click)="praemie(j)" [disabled]="!praemienart">Verbindlich anfordern</button></div>
        </section>
      }

      <section class="karte">
        <h2>Maßnahme einreichen</h2>
        <form (ngSubmit)="erfassen()">
          <div class="feldgruppe">
            <div class="feld"><label for="b-code" class="pflicht">Maßnahme</label>
              <select id="b-code" name="code" [(ngModel)]="neu.code"><option value="">Bitte wählen</option>
                @for (k of kategorien(); track k[0]) { <optgroup [label]="k[1]">@for (m of katalogFuer(k[0]); track m.code) { <option [value]="m.code">{{ m.bezeichnung }} ({{ m.punkte }} P.)</option> }</optgroup> }</select></div>
            <div class="feld"><label for="b-datum" class="pflicht">Datum der Maßnahme</label><input id="b-datum" name="datum" type="date" [max]="heute" [(ngModel)]="neu.datum" /></div>
            @if (gewaehlt(); as m) {
              <p class="breit klein leise">{{ m.punkte }} Punkte · höchstens {{ m.maxProJahr }}× pro Jahr{{ m.mindestalter ? ' · ab ' + m.mindestalter + ' Jahren' : '' }}{{ m.nachweisErforderlich ? ' · Nachweis erforderlich' : '' }}</p>
              @if (m.nachweisErforderlich) { <div class="breit"><vp-dateien label="Nachweis (z. B. Stempel im Bonusheft, Bescheinigung)" [pflicht]="true" [max]="1" [(dateien)]="nachweis" /></div> }
            }
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit">Einreichen</button></div>
        </form>
      </section>

      <section class="karte"><h2>Ihre Maßnahmen</h2>
        <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Datum</th><th>Maßnahme</th><th class="betrag">Punkte</th><th>Status</th><th></th></tr></thead><tbody>
          @for (e of d.eintraege; track e.id) {
            <tr><td>{{ e.datum | datum }}</td><td>{{ bezeichnung(e.code) }}</td><td class="betrag">{{ e.punkte }}</td>
              <td><vp-status [wert]="e.status" /> @if (e.eingeloest) { <span class="badge">eingelöst</span> }</td>
              <td>@if (e.status === 'ERFASST') { <button class="btn link klein" type="button" (click)="loeschen(e)">Zurückziehen</button> }</td></tr>
          } @empty { <tr><td colspan="5" class="leer">Noch keine Maßnahmen erfasst.</td></tr> }
        </tbody></table></div>
        <p class="klein leise">Nachweise prüfen wir innerhalb von 2 Werktagen. Maßnahmen eines Jahres können bis 31. März des Folgejahres eingereicht werden.</p>
      </section>
    }`,
})
export class BonusComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  private bonusApi = inject(BonusApi);
  private api = inject(Api);
  private ui = inject(UiService);
  readonly daten = signal<BonusDaten | null>(null);
  readonly nachweis = signal<Anhang[]>([]);
  readonly praemieJahr = signal<BonusJahr | null>(null);
  readonly jahr = String(new Date().getFullYear());
  readonly heute = heuteIso();
  readonly maxEuro = 250;
  readonly min = Math.min;
  einwilligung = false;
  praemienart = '';
  neu = { code: '', datum: '' };

  readonly kategorien = computed(() => Object.entries(KATEGORIEN));

  async ngOnInit() {
    if (this.sitzung.benutzer()?.bonusTeilnahmeSeit) await this.laden();
  }

  async laden() {
    this.daten.set(await this.bonusApi.laden());
  }

  katalogFuer(k: string) {
    return this.daten()?.katalog.filter(m => m.kategorie === k) || [];
  }

  gewaehlt() {
    return this.daten()?.katalog.find(m => m.code === this.neu.code);
  }

  bezeichnung(code: string) {
    return this.daten()?.katalog.find(m => m.code === code)?.bezeichnung || code;
  }

  euro(punkte: number, budget: boolean) {
    return bonusEuro(punkte, budget);
  }

  async teilnehmen() {
    try {
      await this.api.post('/api/bonus/teilnahme', { teilnehmen: true, einwilligung: this.einwilligung });
      await this.aktualisieren();
      this.ui.erfolg('Willkommen im Bonusprogramm!');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async beenden() {
    if (!(await this.ui.bestaetigen('Teilnahme beenden', 'Nicht eingelöste Punkte verfallen. Möchten Sie die Teilnahme wirklich beenden?', { bestaetigen: 'Beenden', gefaehrlich: true }))) return;
    await this.api.post('/api/bonus/teilnahme', { teilnehmen: false });
    await this.aktualisieren();
    this.ui.info('Ihre Teilnahme am Bonusprogramm wurde beendet.');
  }

  private async aktualisieren() {
    this.sitzung.setzen(await this.api.get('/api/profil'));
    if (this.sitzung.benutzer()?.bonusTeilnahmeSeit) await this.laden();
  }

  async erfassen() {
    const m = this.gewaehlt();
    if (!m || !this.neu.datum) {
      this.ui.fehler('Bitte wählen Sie Maßnahme und Datum.');
      return;
    }
    try {
      const e = await this.bonusApi.erfassen({ ...this.neu, nachweis: this.nachweis()[0] });
      this.ui.erfolg(e.status === 'BESTAETIGT' ? `${e.punkte} Punkte gutgeschrieben!` : 'Ihre Maßnahme wurde eingereicht und wird geprüft.');
      this.neu = { code: '', datum: '' };
      this.nachweis.set([]);
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async loeschen(e: BonusEintrag) {
    try {
      await this.bonusApi.loeschen(e.id);
      this.laden();
    } catch (err) {
      this.ui.fehler(fehlertext(err));
    }
  }

  praemieWaehlen(j: BonusJahr) {
    this.praemienart = '';
    this.praemieJahr.set(j);
  }

  async praemie(j: BonusJahr) {
    try {
      await this.bonusApi.praemie(j.jahr, this.praemienart);
      this.ui.erfolg('Ihre Prämie wurde angefordert. Herzlichen Glückwunsch!');
      this.praemieJahr.set(null);
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
