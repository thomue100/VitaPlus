import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AUTO_GENEHMIGUNG_BIS, ERSTATTUNGEN, RECHNUNG_MAX_ALTER_MONATE } from '../../core/konfiguration';
import { Anhang, Vorgang } from '../../core/models';
import { fehlertext } from '../../core/services/auth.interceptor';
import { HatUngespeicherteAenderungen } from '../../core/services/guards';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { Budget, Person, VorgangApi } from '../../core/services/vorgang-api.service';
import { berechneErstattung } from '../../core/util/berechnungen';
import { addMonate, alterAm, heute, toIso } from '../../core/util/datum';
import { DateienComponent, FeldfehlerComponent, StatusComponent } from '../../shared/bausteine';
import { EuroPipe } from '../../shared/pipes';
import { serverfehlerSetzen, VpValidatoren } from '../../shared/validatoren';

@Component({
  selector: 'vp-erstattung',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent, DateienComponent, StatusComponent, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Kostenerstattung</h1><p class="leise">Reichen Sie Rechnungen für Zusatzleistungen Ihres Tarifs ein.</p></div>
      <a class="btn" routerLink="/rechner/erstattung">Erstattungsrechner</a></div>

    @if (!sitzung.benutzer()?.bank) {
      <div class="hinweis warnung" role="alert">Für Erstattungen benötigen wir Ihre Bankverbindung. <a routerLink="/profil">Jetzt hinterlegen</a></div>
    }

    @if (ergebnis(); as v) {
      <div class="karte hervor" role="status">
        <h2>{{ v.status === 'GENEHMIGT' ? 'Ihre Erstattung ist genehmigt!' : 'Vielen Dank – Ihre Rechnung ist eingegangen' }}</h2>
        <p>Vorgangsnummer <strong>{{ v.vorgangsnummer }}</strong> · <vp-status [wert]="v.status" /></p>
        @if (v.status === 'GENEHMIGT') { <p>Wir überweisen Ihnen {{ v.betragErstattet | euro }} in den nächsten Tagen.</p> }
        @else { <p>Voraussichtliche Erstattung: {{ v.daten['voraussichtlich'] | euro }}. Die Bearbeitung dauert in der Regel 5 bis 10 Werktage.</p> }
        <div class="aktionen"><a class="btn primaer" [routerLink]="['/vorgaenge', v.id]">Zum Vorgang</a><button class="btn" type="button" (click)="neu()">Weitere Rechnung einreichen</button></div>
      </div>
    } @else {
      <div class="raster-2">
        <form class="karte" [formGroup]="form" (ngSubmit)="einreichen()" novalidate>
          <div class="feldgruppe">
            <div class="feld breit"><label for="er-leistung" class="pflicht">Leistung</label>
              <select id="er-leistung" formControlName="leistung"><option value="">Bitte wählen</option>
                @for (r of regeln; track r.code) { <option [value]="r.code" [disabled]="r.quote[tarif()] === 0">{{ r.bezeichnung }}{{ r.quote[tarif()] === 0 ? ' (nicht in Ihrem Tarif)' : '' }}</option> }</select>
              <vp-feldfehler [control]="form.controls.leistung" />
              @if (regel()?.hinweis) { <span class="hilfe">{{ regel()?.hinweis }}</span> }</div>
            <div class="feld"><label for="er-person" class="pflicht">Behandelte Person</label>
              <select id="er-person" formControlName="patientId">@for (p of personen(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select></div>
            <div class="feld"><label for="er-datum" class="pflicht">Rechnungsdatum</label><input id="er-datum" type="date" formControlName="rechnungsdatum" [min]="minDatum" [max]="maxDatum" />
              <vp-feldfehler [control]="form.controls.rechnungsdatum" /></div>
            <div class="feld"><label for="er-nr" class="pflicht">Rechnungsnummer</label><input id="er-nr" formControlName="rechnungsnummer" /><vp-feldfehler [control]="form.controls.rechnungsnummer" /></div>
            <div class="feld"><label for="er-betrag" class="pflicht">Rechnungsbetrag (€)</label><input id="er-betrag" type="number" min="0.01" step="0.01" formControlName="betrag" inputmode="decimal" />
              <vp-feldfehler [control]="form.controls.betrag" /></div>
            <div class="feld breit"><label for="er-le" class="pflicht">Praxis / Leistungserbringer</label><input id="er-le" formControlName="leistungserbringer" /><vp-feldfehler [control]="form.controls.leistungserbringer" /></div>
            @if (form.value.leistung === 'OSTEO') {
              <div class="feld"><label for="er-sitz">Anzahl Sitzungen auf der Rechnung</label><input id="er-sitz" type="number" min="1" max="6" formControlName="sitzungen" /></div>
              <label class="auswahl"><input type="checkbox" formControlName="verordnungVorhanden" /> <span class="pflicht">Eine ärztliche Verordnung liegt vor</span></label>
            }
            @if (form.value.leistung === 'REISEIMPF') {
              <div class="feld"><label for="er-ziel" class="pflicht">Reiseziel</label><input id="er-ziel" formControlName="reiseziel" /><vp-feldfehler [control]="form.controls.reiseziel" /></div>
            }
            <div class="feld breit"><label for="er-bem">Bemerkung (optional)</label><textarea id="er-bem" formControlName="bemerkung" maxlength="500" rows="2"></textarea></div>
            <div class="breit"><vp-dateien label="Rechnung und Belege" [pflicht]="true" [max]="5" [(dateien)]="belege" /></div>
          </div>
          @if (belegFehler()) { <div class="hinweis fehler">Bitte laden Sie mindestens einen Beleg hoch.</div> }
          @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }
          <div class="aktionen"><button class="btn primaer" type="submit" [disabled]="sendet() || !sitzung.benutzer()?.bank">Rechnung einreichen</button></div>
        </form>

        <aside class="karte hervor" aria-live="polite">
          <h2>Ihre voraussichtliche Erstattung</h2>
          @if (vorschau(); as v) {
            <p class="kennzahl">{{ v.betrag | euro }}</p>
            @for (g of v.gruende; track g) { <div class="hinweis warnung klein">{{ g }}</div> }
            @if (budget(); as b) {
              <dl class="daten klein">
                <dt>Erstattungssatz</dt><dd>{{ b.quote }} %</dd>
                <dt>Jahresbudget {{ b.jahr }}</dt><dd>{{ b.jahresMax | euro }}</dd>
                <dt>Bereits verbraucht</dt><dd>{{ b.bereitsErstattet | euro }}</dd>
                @if (b.maxAnzahl) { <dt>Inanspruchnahmen</dt><dd>{{ b.anzahl }} von {{ b.maxAnzahl }}</dd> }
              </dl>
            }
            @if (v.moeglich && v.betrag <= autoGrenze && form.value.patientId === 'SELBST') { <p class="klein">Beträge bis {{ autoGrenze | euro }} genehmigen wir in der Regel sofort.</p> }
          } @else { <p class="leise">Wählen Sie eine Leistung und geben Sie den Rechnungsbetrag ein.</p> }
          <p class="klein leise">Rechnungen können bis zu {{ maxMonate }} Monate nach Rechnungsdatum eingereicht werden.</p>
        </aside>
      </div>
    }`,
})
export class ErstattungComponent implements OnInit, HatUngespeicherteAenderungen {
  readonly sitzung = inject(SitzungService);
  private api = inject(VorgangApi);
  private ui = inject(UiService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly regeln = ERSTATTUNGEN;
  readonly autoGrenze = AUTO_GENEHMIGUNG_BIS;
  readonly maxMonate = RECHNUNG_MAX_ALTER_MONATE;
  readonly minDatum = toIso(addMonate(heute(), -RECHNUNG_MAX_ALTER_MONATE));
  readonly maxDatum = toIso(heute());
  readonly tarif = computed(() => this.sitzung.benutzer()!.tarif);
  readonly personen = signal<Person[]>([]);
  readonly budget = signal<Budget | null>(null);
  readonly belege = signal<Anhang[]>([]);
  readonly ergebnis = signal<Vorgang | null>(null);
  readonly fehler = signal<string | null>(null);
  readonly sendet = signal(false);
  readonly belegFehler = signal(false);
  readonly werte = signal<any>({});

  form = this.fb.nonNullable.group({
    leistung: ['', Validators.required], patientId: ['SELBST'], rechnungsdatum: ['', [Validators.required, VpValidatoren.nichtZukunft]],
    rechnungsnummer: ['', [Validators.required, Validators.maxLength(40)]], betrag: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(10000)]],
    leistungserbringer: ['', [Validators.required, Validators.maxLength(120)]], sitzungen: [1], verordnungVorhanden: [false], reiseziel: [''], bemerkung: [''],
  });

  readonly regel = computed(() => ERSTATTUNGEN.find(r => r.code === this.werte().leistung));
  readonly vorschau = computed(() => {
    const w = this.werte();
    const b = this.budget();
    if (!w.leistung || !w.betrag) return null;
    const person = this.personen().find(p => p.id === w.patientId);
    const alter = person ? alterAm(person.geburtsdatum) : 30;
    return berechneErstattung(w.leistung, this.tarif(), Number(w.betrag), b?.bereitsErstattet || 0, b?.anzahl || 0, alter);
  });

  async ngOnInit() {
    this.personen.set(await this.api.personen());
    this.form.valueChanges.subscribe(v => this.werte.set(v));
    let letzterSchluessel = '';
    this.form.valueChanges.subscribe(async v => {
      const jahr = (v.rechnungsdatum || toIso(heute())).substring(0, 4);
      const schluessel = `${v.leistung}|${v.patientId}|${jahr}`;
      if (!v.leistung || schluessel === letzterSchluessel) return;
      letzterSchluessel = schluessel;
      this.budget.set(await this.api.budget(v.leistung, v.patientId || 'SELBST', jahr));
    });
    this.form.controls.leistung.valueChanges.subscribe(l => {
      this.form.controls.reiseziel.setValidators(l === 'REISEIMPF' ? Validators.required : null);
      this.form.controls.reiseziel.updateValueAndValidity({ emitEvent: false });
    });
  }

  ungespeichert() {
    return this.form.dirty && !this.ergebnis();
  }

  async einreichen() {
    this.form.markAllAsTouched();
    this.belegFehler.set(!this.belege().length);
    if (this.form.invalid || !this.belege().length) return;
    this.sendet.set(true);
    this.fehler.set(null);
    try {
      const v = await this.api.erstattung({ ...this.form.getRawValue(), anhaenge: this.belege() });
      this.ergebnis.set(v);
      this.form.markAsPristine();
    } catch (e: any) {
      if (e?.error?.code === 'BANK_FEHLT') {
        this.ui.fehler(fehlertext(e));
        this.router.navigate(['/profil']);
        return;
      }
      if (!serverfehlerSetzen(this.form, e)) this.fehler.set(fehlertext(e));
    } finally {
      this.sendet.set(false);
    }
  }

  neu() {
    this.ergebnis.set(null);
    this.form.reset({ leistung: '', patientId: 'SELBST', sitzungen: 1, verordnungVorhanden: false });
    this.belege.set([]);
    this.budget.set(null);
  }
}
