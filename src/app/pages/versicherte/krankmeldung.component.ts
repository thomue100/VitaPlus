import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Anhang, Vorgang } from '../../core/models';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { VorgangApi } from '../../core/services/vorgang-api.service';
import { heuteIso, tageZwischen } from '../../core/util/datum';
import { DateienComponent, FeldfehlerComponent, StatusComponent } from '../../shared/bausteine';
import { serverfehlerSetzen } from '../../shared/validatoren';
import { DatumEingabeComponent } from '../../shared/datum-eingabe.component';

@Component({
  selector: 'vp-krankmeldung',
  imports: [DatumEingabeComponent, ReactiveFormsModule, RouterLink, FeldfehlerComponent, DateienComponent, StatusComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Krankmeldung</h1><p class="leise">Arbeitsunfähigkeit mitteilen</p></div><a class="btn" routerLink="/krankengeld">Krankengeld</a></div>
    <div class="hinweis info">In der Regel übermittelt Ihre Arztpraxis die Arbeitsunfähigkeitsbescheinigung elektronisch (eAU) an uns – Sie müssen dann nichts weiter tun.
      Nutzen Sie dieses Formular, wenn die Praxis keine eAU senden konnte, z. B. bei Behandlung im Ausland oder bei einer Privatärztin.</div>
    @if (sitzung.benutzer()?.beschaeftigung === 'RENTNER') {
      <div class="hinweis warnung">Als Rentnerin oder Rentner müssen Sie uns keine Arbeitsunfähigkeit melden.</div>
    } @else {
      <form class="karte formular" [formGroup]="form" (ngSubmit)="melden()" novalidate>
        <h2>Neue Krankmeldung</h2>
        <div class="feldgruppe">
          <fieldset class="breit"><legend>Art der Bescheinigung</legend><div class="auswahlgruppe zeile">
            <label class="auswahl"><input type="radio" formControlName="erstbescheinigung" [value]="true" /> Erstbescheinigung</label>
            <label class="auswahl"><input type="radio" formControlName="erstbescheinigung" [value]="false" /> Folgebescheinigung</label></div></fieldset>
          @if (form.value.erstbescheinigung === false) {
            <div class="feld breit"><label for="au-vg" class="pflicht">Vorangegangene Krankmeldung</label>
              <select id="au-vg" formControlName="vorgaengerId"><option value="">Bitte wählen</option>
                @for (v of bisherige(); track v.id) { <option [value]="v.id">{{ v.titel }}</option> }</select>
              <vp-feldfehler [control]="form.controls.vorgaengerId" /></div>
          }
          <div class="feld"><label for="au-von" class="pflicht">Arbeitsunfähig seit</label><vp-datum id="au-von" formControlName="von" /><vp-feldfehler [control]="form.controls.von" /></div>
          <div class="feld"><label for="au-bis" class="pflicht">Voraussichtlich bis</label><vp-datum id="au-bis" formControlName="bis" /><vp-feldfehler [control]="form.controls.bis" /></div>
          <div class="feld breit"><label for="au-arzt" class="pflicht">Behandelnde Ärztin / behandelnder Arzt</label><input id="au-arzt" formControlName="arzt" /><vp-feldfehler [control]="form.controls.arzt" /></div>
          <div class="feld breit"><div class="auswahlgruppe">
            <label class="auswahl"><input type="checkbox" formControlName="unfall" /> Die Arbeitsunfähigkeit beruht auf einem Unfall</label>
            @if (form.value.unfall) { <label class="auswahl"><input type="checkbox" formControlName="arbeitsunfall" /> Es handelt sich um einen Arbeits- oder Wegeunfall</label> }
            <label class="auswahl"><input type="checkbox" formControlName="stationaer" /> stationärer Krankenhausaufenthalt</label></div></div>
          <div class="breit"><vp-dateien label="AU-Bescheinigung (optional)" [max]="2" [(dateien)]="anhaenge" /></div>
        </div>
        @if (dauer() > 0) { <p class="klein leise">Dauer: {{ dauer() }} Kalendertage</p> }
        @if (verspaetet()) { <div class="hinweis warnung">Bitte melden Sie Arbeitsunfähigkeiten innerhalb einer Woche. Eine verspätete Meldung kann zum Ruhen des Krankengeldanspruchs führen.</div> }
        @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }
        <div class="aktionen"><button class="btn primaer" type="submit">Krankmeldung absenden</button></div>
      </form>
    }
    <section class="karte"><h2>Ihre Krankmeldungen</h2>
      <ul class="liste-ohne">@for (v of bisherige(); track v.id) {
        <li class="zeile"><a [routerLink]="['/vorgaenge', v.id]">{{ v.titel }}</a><span>{{ v.daten['tage'] }} Tage <vp-status [wert]="v.status" /></span></li>
      } @empty { <li class="leer">Keine Krankmeldungen vorhanden.</li> }</ul>
    </section>`,
})
export class KrankmeldungComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  private api = inject(VorgangApi);
  private ui = inject(UiService);
  private fb = inject(FormBuilder);
  readonly bisherige = signal<Vorgang[]>([]);
  readonly anhaenge = signal<Anhang[]>([]);
  readonly fehler = signal<string | null>(null);
  readonly werte = signal<any>({});
  form = this.fb.nonNullable.group({
    erstbescheinigung: [true], vorgaengerId: [''], von: [heuteIso(), Validators.required], bis: ['', Validators.required], arzt: ['', Validators.required],
    unfall: [false], arbeitsunfall: [false], stationaer: [false],
  });
  readonly dauer = computed(() => (this.werte().von && this.werte().bis ? tageZwischen(this.werte().von, this.werte().bis) + 1 : 0));
  readonly verspaetet = computed(() => !!this.werte().von && tageZwischen(this.werte().von, heuteIso()) > 7);

  ngOnInit() {
    this.laden();
    this.werte.set(this.form.value);
    this.form.valueChanges.subscribe(v => this.werte.set(v));
    this.form.controls.erstbescheinigung.valueChanges.subscribe(e => {
      this.form.controls.vorgaengerId.setValidators(e ? null : Validators.required);
      this.form.controls.vorgaengerId.updateValueAndValidity({ emitEvent: false });
    });
  }

  async laden() {
    this.bisherige.set(await this.api.liste({ typ: 'ARBEITSUNFAEHIGKEIT' }));
  }

  async melden() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.fehler.set(null);
    try {
      const v = await this.api.krankmeldung({ ...this.form.getRawValue(), anhaenge: this.anhaenge() });
      this.ui.erfolg(`Ihre Krankmeldung wurde übermittelt (${v.vorgangsnummer}). Gute Besserung!`);
      if (v.daten['krankengeld']) this.ui.info('Ihre Arbeitsunfähigkeit dauert länger als 6 Wochen. Informationen zum Krankengeld finden Sie in Ihrem Postfach.');
      this.form.reset({ erstbescheinigung: true, von: heuteIso() });
      this.anhaenge.set([]);
      this.laden();
    } catch (e) {
      if (!serverfehlerSetzen(this.form, e)) this.fehler.set(fehlertext(e));
    }
  }
}
