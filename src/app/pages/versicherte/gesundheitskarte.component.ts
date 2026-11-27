import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Anhang, Gesundheitskarte } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { FamilieApi, FamilienEintrag, KartenApi } from '../../core/services/versicherten-api.service';
import { heuteIso } from '../../core/util/datum';
import { DateienComponent, StatusComponent } from '../../shared/bausteine';
import { DatumPipe } from '../../shared/pipes';
import { EgkComponent } from '../../shared/egk.component';
import { SymbolComponent } from '../../shared/symbol.component';

type Aktion = 'sperren' | 'ersatz' | 'foto' | 'pin' | 'aktivieren' | 'versand' | null;

@Component({
  selector: 'vp-gesundheitskarte',
  imports: [FormsModule, RouterLink, DateienComponent, StatusComponent, DatumPipe, EgkComponent, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Elektronische Gesundheitskarte</h1><p class="leise">Ihre Karten und die Ihrer Familie</p></div>
      <div class="aktionen"><button class="btn" type="button" (click)="eebOffen.set(!eebOffen())">Ersatzbescheinigung für die Praxis</button></div></div>

    @if (eebOffen()) {
      <form class="karte formular hervor" (ngSubmit)="ersatzbescheinigung()">
        <h2>Elektronische Ersatzbescheinigung</h2>
        <p class="klein leise">Ihre Karte liegt nicht vor? Wir übermitteln der Praxis direkt einen Versicherungsnachweis für das laufende Quartal.</p>
        <div class="feldgruppe">
          <div class="feld"><label for="eeb-person" class="pflicht">Für wen?</label><select id="eeb-person" name="karte" [(ngModel)]="eeb.karteId">
            @for (k of aktiveKarten(); track k.id) { <option [value]="k.id">{{ k.inhaber }}</option> }</select></div>
          <div class="feld"><label for="eeb-datum" class="pflicht">Behandlungsdatum</label><input id="eeb-datum" name="datum" type="date" [(ngModel)]="eeb.behandlungsdatum" /></div>
          <div class="feld breit"><label for="eeb-praxis" class="pflicht">Praxis (Name und Ort)</label><input id="eeb-praxis" name="praxis" [(ngModel)]="eeb.praxis" /></div>
        </div>
        <div class="aktionen"><button class="btn primaer" type="submit">An Praxis übermitteln</button></div>
      </form>
    }

    <div class="raster kartenraster">
      @for (k of karten(); track k.id) {
        <article class="karte kartenansicht">
          <vp-egk [name]="k.inhaber" [versichertennummer]="k.kartennummer" [gueltigBis]="k.gueltigBis" [status]="k.status" [foto]="k.fotoVorhanden" />
          <div class="zeile mt"><h2>{{ k.inhaber }}</h2><vp-status [wert]="k.status" /></div>
          <dl class="daten">
            <dt>Gültig bis</dt><dd>{{ k.gueltigBis | datum }}</dd>
            <dt>Lichtbild</dt><dd>{{ k.fotoVorhanden ? 'vorhanden' : 'fehlt' }}</dd>
            @if (k.sperrgrund) { <dt>Gesperrt</dt><dd>{{ k.gesperrtAm | datum }} ({{ gruende[k.sperrgrund] }})</dd> }
          </dl>
          <div class="aktionen">
            @switch (k.status) {
              @case ('AKTIV') {
                <button class="btn klein gefahr" type="button" (click)="starten(k, 'sperren')">Sperren</button>
                <button class="btn klein" type="button" (click)="starten(k, 'foto')">{{ k.fotoVorhanden ? 'Foto aktualisieren' : 'Foto hochladen' }}</button>
                <button class="btn klein" type="button" (click)="starten(k, 'pin')">PIN anfordern</button>
              }
              @case ('GESPERRT') { @if (!ersatzBestellt(k)) { <button class="btn klein primaer" type="button" (click)="starten(k, 'ersatz')">Ersatzkarte bestellen</button> } }
              @case ('ABGELAUFEN') { <button class="btn klein primaer" type="button" (click)="starten(k, 'ersatz')">Neue Karte bestellen</button> }
              @case ('IN_PRODUKTION') { <button class="btn klein" type="button" (click)="starten(k, 'versand')">Versandstatus</button> }
              @case ('VERSENDET') {
                <button class="btn klein primaer" type="button" (click)="starten(k, 'aktivieren')">Karte erhalten – aktivieren</button>
                <button class="btn klein" type="button" (click)="starten(k, 'versand')">Sendungsverfolgung</button>
              }
            }
          </div>
          @if (gewaehlt()?.id === k.id) {
            <div class="aktionsbereich">
              @switch (aktion()) {
                @case ('sperren') {
                  <fieldset><legend class="pflicht">Warum soll die Karte gesperrt werden?</legend><div class="auswahlgruppe">
                    <label class="auswahl"><input type="radio" name="grund" value="VERLUST" [(ngModel)]="sperrgrund" /> verloren</label>
                    <label class="auswahl"><input type="radio" name="grund" value="DIEBSTAHL" [(ngModel)]="sperrgrund" /> gestohlen</label>
                    <label class="auswahl"><input type="radio" name="grund" value="DEFEKT" [(ngModel)]="sperrgrund" /> defekt</label></div></fieldset>
                  @if (sperrgrund === 'DIEBSTAHL') { <label class="auswahl mt"><input type="checkbox" name="polizei" [(ngModel)]="polizei" /> Ich habe den Diebstahl bei der Polizei angezeigt.</label> }
                  <div class="aktionen"><button class="btn klein" type="button" (click)="abbrechen()">Abbrechen</button><button class="btn klein gefahr primaer" type="button" (click)="sperren(k)">Karte endgültig sperren</button></div>
                }
                @case ('ersatz') {
                  @if (!k.fotoVorhanden && fotoNoetig(k)) { <vp-dateien label="Aktuelles Lichtbild (JPG oder PNG)" [nurBilder]="true" [max]="1" [pflicht]="true" [(dateien)]="foto" /> }
                  <label class="auswahl mt"><input type="checkbox" name="abw" [(ngModel)]="abweichend" /> An eine andere Adresse senden</label>
                  @if (abweichend) {
                    <div class="feldgruppe mt">
                      <div class="feld breit"><label for="lf-str">Straße und Hausnummer</label><input id="lf-str" name="str" [(ngModel)]="lieferadresse.strasse" /></div>
                      <div class="feld"><label for="lf-plz">PLZ</label><input id="lf-plz" name="plz" [(ngModel)]="lieferadresse.plz" /></div>
                      <div class="feld"><label for="lf-ort">Ort</label><input id="lf-ort" name="ort" [(ngModel)]="lieferadresse.ort" /></div>
                    </div>
                  }
                  <div class="aktionen"><button class="btn klein" type="button" (click)="abbrechen()">Abbrechen</button><button class="btn klein primaer" type="button" (click)="ersatz(k)">Ersatzkarte bestellen</button></div>
                  <p class="klein leise">Die erste Ersatzkarte im Jahr ist kostenfrei. Ab der zweiten Karte wegen Verlust berechnen wir 5 €.</p>
                }
                @case ('foto') {
                  <vp-dateien label="Neues Lichtbild (JPG oder PNG, biometrietauglich)" [nurBilder]="true" [max]="1" [pflicht]="true" [(dateien)]="foto" />
                  <label class="auswahl mt"><input type="checkbox" name="neu" [(ngModel)]="neueKarte" /> Sofort eine neue Karte mit dem Foto ausstellen</label>
                  <div class="aktionen"><button class="btn klein" type="button" (click)="abbrechen()">Abbrechen</button><button class="btn klein primaer" type="button" (click)="fotoHochladen(k)">Foto übermitteln</button></div>
                }
                @case ('pin') {
                  <p class="klein">Mit der PIN nutzen Sie die Karte für die ePA-App und als digitalen Ausweis. Wie möchten Sie sich identifizieren?</p>
                  <div class="auswahlgruppe">
                    <label class="auswahl"><input type="radio" name="pinv" value="EID" [(ngModel)]="pinVerfahren" /> Online-Ausweis (PIN-Brief sofort)</label>
                    <label class="auswahl"><input type="radio" name="pinv" value="POSTIDENT" [(ngModel)]="pinVerfahren" /> POSTIDENT in einer Filiale der Deutschen Post</label>
                    <label class="auswahl"><input type="radio" name="pinv" value="FILIALE" [(ngModel)]="pinVerfahren" /> In einer VitaPlus-Geschäftsstelle</label></div>
                  <div class="aktionen"><button class="btn klein" type="button" (click)="abbrechen()">Abbrechen</button><button class="btn klein primaer" type="button" (click)="pin(k)" [disabled]="!pinVerfahren">PIN anfordern</button></div>
                }
                @case ('aktivieren') {
                  <div class="feld"><label for="akt-z">Letzte 4 Ziffern der Kartennummer (Rückseite)</label><input id="akt-z" name="z" maxlength="4" inputmode="numeric" [(ngModel)]="ziffern" /></div>
                  <div class="aktionen"><button class="btn klein" type="button" (click)="abbrechen()">Abbrechen</button><button class="btn klein primaer" type="button" (click)="aktivieren(k)">Aktivieren</button></div>
                }
                @case ('versand') {
                  @if (versand(); as v) {
                    @if (v.sendungsnummer) { <p class="klein">Sendungsnummer: <strong>{{ v.sendungsnummer }}</strong></p> }
                    <ul class="liste-ohne">@for (s of v.schritte; track s.text) { <li class="versandschritt" [class.erledigt]="s.erledigt"><vp-symbol [name]="s.erledigt ? 'circle-check' : 'clock'" [groesse]="18" /> {{ s.text }}</li> }</ul>
                  }
                  <button class="btn klein" type="button" (click)="abbrechen()">Schließen</button>
                }
              }
            </div>
          }
        </article>
      }
    </div>

    @if (ohneKarte().length) {
      <section class="karte"><h2>Karte erstmals bestellen</h2>
        <p>Für folgende familienversicherte Personen existiert noch keine Karte:</p>
        <ul class="liste-ohne">@for (f of ohneKarte(); track f.id) { <li class="zeile">{{ f.vorname }} {{ f.nachname }}
          <button class="btn klein" type="button" (click)="erstbestellen(f)">Karte bestellen</button></li> }</ul>
      </section>
    }
    <p class="klein leise">Auf der Rückseite Ihrer Gesundheitskarte finden Sie die Europäische Krankenversicherungskarte (EHIC). Eine provisorische Ersatzbescheinigung erhalten Sie unter <a routerLink="/dokumente">Dokumente</a>.</p>`,
  styles: [`.aktionsbereich{border-top:1px solid var(--vp-rand);margin-top:1rem;padding-top:1rem}`],
})
export class GesundheitskarteComponent implements OnInit {
  private kartenApi = inject(KartenApi);
  private familieApi = inject(FamilieApi);
  private api = inject(Api);
  private ui = inject(UiService);

  readonly karten = signal<Gesundheitskarte[]>([]);
  readonly familie = signal<FamilienEintrag[]>([]);
  readonly gewaehlt = signal<Gesundheitskarte | null>(null);
  readonly aktion = signal<Aktion>(null);
  readonly versand = signal<any>(null);
  readonly foto = signal<Anhang[]>([]);
  readonly eebOffen = signal(false);
  readonly gruende: Record<string, string> = { VERLUST: 'Verlust', DIEBSTAHL: 'Diebstahl', DEFEKT: 'Defekt', NAMENSAENDERUNG: 'Namensänderung' };
  readonly aktiveKarten = computed(() => this.karten().filter(k => ['AKTIV', 'GESPERRT', 'IN_PRODUKTION', 'VERSENDET'].includes(k.status)));
  readonly ohneKarte = computed(() => this.familie().filter(f => f.status === 'AKTIV' && !this.karten().some(k => k.familienmitgliedId === f.id && k.status !== 'GESPERRT')));

  sperrgrund = '';
  polizei = false;
  abweichend = false;
  lieferadresse = { strasse: '', plz: '', ort: '' };
  neueKarte = false;
  pinVerfahren = '';
  ziffern = '';
  eeb = { karteId: '', behandlungsdatum: heuteIso(), praxis: '' };

  ngOnInit() {
    this.laden();
  }

  async laden() {
    const [k, f] = await Promise.all([this.kartenApi.liste(), this.familieApi.liste()]);
    this.karten.set(k);
    this.familie.set(f);
    this.eeb.karteId = this.eeb.karteId || k.find(x => !x.familienmitgliedId)?.id || '';
  }

  ersatzBestellt(k: Gesundheitskarte) {
    return this.karten().some(x => x.id !== k.id && x.inhaber === k.inhaber && ['IN_PRODUKTION', 'VERSENDET'].includes(x.status));
  }

  fotoNoetig(k: Gesundheitskarte) {
    if (!k.familienmitgliedId) return true;
    const f = this.familie().find(x => x.id === k.familienmitgliedId);
    return !f || f.alter >= 15;
  }

  async starten(k: Gesundheitskarte, a: Aktion) {
    this.gewaehlt.set(k);
    this.aktion.set(a);
    this.foto.set([]);
    this.sperrgrund = '';
    if (a === 'versand') this.versand.set(await this.api.get(`/api/karten/${k.id}/versand`));
  }

  abbrechen() {
    this.gewaehlt.set(null);
    this.aktion.set(null);
  }

  private async ausfuehren(f: () => Promise<any>, meldung: string) {
    try {
      await f();
      this.ui.erfolg(meldung);
      this.abbrechen();
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async sperren(k: Gesundheitskarte) {
    if (!this.sperrgrund) {
      this.ui.fehler('Bitte wählen Sie einen Grund.');
      return;
    }
    if (!(await this.ui.bestaetigen('Karte sperren', 'Die Sperrung kann nicht rückgängig gemacht werden. Sie benötigen danach eine neue Karte.', { bestaetigen: 'Sperren', gefaehrlich: true }))) return;
    await this.ausfuehren(() => this.kartenApi.sperren(k.id, this.sperrgrund, this.polizei), 'Die Karte wurde gesperrt. Bestellen Sie jetzt eine Ersatzkarte.');
  }

  ersatz(k: Gesundheitskarte) {
    this.ausfuehren(() => this.kartenApi.ersatz(k.id, { foto: this.foto()[0], abweichendeAdresse: this.abweichend, lieferadresse: this.abweichend ? this.lieferadresse : undefined }),
      'Ihre Ersatzkarte wurde bestellt.');
  }

  fotoHochladen(k: Gesundheitskarte) {
    if (!this.foto().length) {
      this.ui.fehler('Bitte wählen Sie ein Foto aus.');
      return;
    }
    this.ausfuehren(() => this.api.post(`/api/karten/${k.id}/foto`, { foto: this.foto()[0], neueKarte: this.neueKarte }), 'Ihr Foto wurde übermittelt.');
  }

  pin(k: Gesundheitskarte) {
    this.ausfuehren(() => this.api.post(`/api/karten/${k.id}/pin`, { verfahren: this.pinVerfahren }), 'Ihre PIN wurde angefordert.');
  }

  aktivieren(k: Gesundheitskarte) {
    this.ausfuehren(() => this.kartenApi.aktivieren(k.id, this.ziffern), 'Ihre neue Karte ist aktiviert.');
  }

  erstbestellen(f: FamilienEintrag) {
    this.ausfuehren(() => this.api.post('/api/karten/erstbestellung', { familienmitgliedId: f.id }), `Die Karte für ${f.vorname} wurde bestellt.`);
  }

  ersatzbescheinigung() {
    this.ausfuehren(async () => {
      const r = await this.api.post('/api/karten/ersatzbescheinigung', this.eeb);
      this.ui.info(r.hinweis);
      this.eebOffen.set(false);
    }, 'Die Ersatzbescheinigung wurde übermittelt.');
  }
}
