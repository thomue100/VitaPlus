import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BEITRAG } from '../../core/konfiguration';
import { Anhang } from '../../core/models';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { FamilieApi, FamilienEintrag } from '../../core/services/versicherten-api.service';
import { alterAm, heuteIso } from '../../core/util/datum';
import { DateienComponent, FeldfehlerComponent, StatusComponent } from '../../shared/bausteine';
import { DatumPipe } from '../../shared/pipes';
import { serverfehlerSetzen, VpValidatoren } from '../../shared/validatoren';
import { DatumEingabeComponent } from '../../shared/datum-eingabe.component';

const BEZIEHUNG: Record<string, string> = { EHEPARTNER: 'Ehepartner/in', LEBENSPARTNER: 'Lebenspartner/in', KIND: 'Kind', STIEFKIND: 'Stiefkind', ENKELKIND: 'Enkelkind' };

@Component({
  selector: 'vp-familie',
  imports: [DatumEingabeComponent, ReactiveFormsModule, RouterLink, FeldfehlerComponent, DateienComponent, StatusComponent, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Familienversicherung</h1><p class="leise">Ehe- und Lebenspartner sowie Kinder ohne eigenes Einkommen sind bei Ihnen beitragsfrei mitversichert.</p></div>
      <div class="aktionen">
        <button class="btn primaer" type="button" (click)="formOffen.set(true)">Angehörige anmelden</button>
        <a class="btn" routerLink="/antraege/neu/GEBURT">Geburt melden</a>
      </div></div>

    <section class="karte">
      <div class="tabelle-wrapper"><table class="tabelle">
        <thead><tr><th>Name</th><th>Beziehung</th><th>Geburtsdatum</th><th>Versichertennummer</th><th>Status</th><th>Familienversichert bis</th><th></th></tr></thead>
        <tbody>
          @for (f of familie(); track f.id) {
            <tr><td>{{ f.vorname }} {{ f.nachname }}</td><td>{{ beziehung[f.beziehung] }}</td><td>{{ f.geburtsdatum | datum }} ({{ f.alter }})</td>
              <td>{{ f.versichertennummer || '–' }}</td><td><vp-status [wert]="f.status" /></td>
              <td>{{ f.status === 'BEENDET' ? (f.abgemeldetAm | datum) : f.endetAm ? (f.endetAm | datum) + '*' : '–' }}</td>
              <td>@if (f.status === 'AKTIV') { <button class="btn link klein" type="button" (click)="abmeldenStarten(f)">Abmelden</button> }</td></tr>
          } @empty { <tr><td colspan="7" class="leer">Es sind keine Angehörigen familienversichert.</td></tr> }
        </tbody></table></div>
      @if (mitEnde()) { <p class="klein leise">* voraussichtlich – bei Schul-/Berufsausbildung oder Studium verlängert sich die Familienversicherung bis zum 25. Lebensjahr.</p> }
      <p class="klein"><a routerLink="/antraege/neu/FAMILIE_FRAGEBOGEN">Änderungen zu Angehörigen melden (Einkommen, Ausbildung, eigene Versicherung)</a></p>
    </section>

    @if (abmelden(); as a) {
      <form class="karte formular hervor" [formGroup]="abmeldeForm" (ngSubmit)="abmeldenBestaetigen()" novalidate>
        <h2>Familienversicherung für {{ a.vorname }} beenden</h2>
        <div class="feldgruppe">
          <div class="feld"><label for="ab-zum" class="pflicht">Zum (Monatsende)</label><vp-datum id="ab-zum" formControlName="zum" /><vp-feldfehler [control]="abmeldeForm.controls.zum" /></div>
          <div class="feld"><label for="ab-grund" class="pflicht">Grund</label><select id="ab-grund" formControlName="grund"><option value="">Bitte wählen</option>
            <option value="EIGENE_VERSICHERUNG">Eigene Versicherung (z. B. Ausbildung, Job)</option><option value="SCHEIDUNG">Scheidung / Trennung</option>
            <option value="AUSZUG">Auszug / kein Unterhalt mehr</option><option value="TOD">Todesfall</option><option value="SONSTIGES">Sonstiges</option></select>
            <vp-feldfehler [control]="abmeldeForm.controls.grund" /></div>
        </div>
        <div class="aktionen"><button class="btn" type="button" (click)="abmelden.set(null)">Abbrechen</button><button class="btn gefahr primaer" type="submit">Abmelden</button></div>
      </form>
    }

    @if (formOffen()) {
      <form class="karte formular" [formGroup]="form" (ngSubmit)="anmelden()" novalidate>
        <h2>Angehörige/n zur Familienversicherung anmelden</h2>
        <div class="feldgruppe">
          <div class="feld"><label for="fv-bez" class="pflicht">Beziehung zu Ihnen</label>
            <select id="fv-bez" formControlName="beziehung"><option value="">Bitte wählen</option>@for (b of beziehungen; track b[0]) { <option [value]="b[0]">{{ b[1] }}</option> }</select>
            <vp-feldfehler [control]="form.controls.beziehung" /></div>
          <div class="feld"><label for="fv-geschlecht" class="pflicht">Geschlecht</label>
            <select id="fv-geschlecht" formControlName="geschlecht"><option value="">Bitte wählen</option><option value="W">weiblich</option><option value="M">männlich</option><option value="D">divers</option></select>
            <vp-feldfehler [control]="form.controls.geschlecht" /></div>
          <div class="feld"><label for="fv-vn" class="pflicht">Vorname</label><input id="fv-vn" formControlName="vorname" /><vp-feldfehler [control]="form.controls.vorname" /></div>
          <div class="feld"><label for="fv-nn" class="pflicht">Nachname</label><input id="fv-nn" formControlName="nachname" /><vp-feldfehler [control]="form.controls.nachname" /></div>
          <div class="feld"><label for="fv-geb" class="pflicht">Geburtsdatum</label><vp-datum id="fv-geb" formControlName="geburtsdatum" /><vp-feldfehler [control]="form.controls.geburtsdatum" /></div>
          <div class="feld"><label for="fv-beginn">Beginn der Familienversicherung</label><vp-datum id="fv-beginn" formControlName="beginn" /></div>
          <div class="feld"><label for="fv-ek">Regelmäßiges monatliches Gesamteinkommen (€)</label><input id="fv-ek" type="number" min="0" step="0.01" formControlName="einkommenMonat" />
            <span class="hilfe">Grenze: {{ grenze }} € (bei Minijob {{ grenzeMinijob }} €)</span><vp-feldfehler [control]="form.controls.einkommenMonat" /></div>
          <div class="feld"><span class="label">Weitere Angaben</span>
            <label class="auswahl"><input type="checkbox" formControlName="minijob" /> Einkommen aus Minijob</label>
            @if (istKind() && alter() >= 18) { <label class="auswahl"><input type="checkbox" formControlName="inAusbildung" /> in Schul-/Berufsausbildung oder Studium</label> }
            @if (istKind()) { <label class="auswahl"><input type="checkbox" formControlName="behinderung" /> Behinderung, außerstande sich selbst zu unterhalten</label> }
            @if (form.value.beziehung === 'ENKELKIND') { <label class="auswahl"><input type="checkbox" formControlName="ueberwiegendUnterhalten" /> wird überwiegend von mir unterhalten</label> }
            @if (form.value.beziehung === 'STIEFKIND') { <label class="auswahl"><input type="checkbox" formControlName="imHaushalt" /> lebt in meinem Haushalt</label> }
            <label class="auswahl"><input type="checkbox" formControlName="anderweitigVersichert" /> ist selbst gesetzlich oder privat versichert</label>
            <label class="auswahl"><input type="checkbox" formControlName="hauptberuflichSelbststaendig" /> ist hauptberuflich selbstständig</label>
          </div>
          @if (form.value.inAusbildung) { <div class="feld"><label for="fv-ende">Voraussichtliches Ausbildungsende</label><vp-datum id="fv-ende" formControlName="ausbildungsende" /></div> }
          <div class="feld"><label for="fv-vv">Bisherige Krankenkasse</label><input id="fv-vv" formControlName="vorversicherung" /></div>
          @if (alter() >= 15) { <div class="breit"><vp-dateien label="Nachweise (z. B. Schul- oder Studienbescheinigung)" [max]="2" [(dateien)]="anhaenge" /></div> }
        </div>
        @if (hinweis()) { <div class="hinweis warnung">{{ hinweis() }}</div> }
        <div class="aktionen"><button class="btn" type="button" (click)="formOffen.set(false)">Abbrechen</button><button class="btn primaer" type="submit">Anmeldung absenden</button></div>
      </form>
    }`,
})
export class FamilieComponent implements OnInit {
  private api = inject(FamilieApi);
  private ui = inject(UiService);
  private fb = inject(FormBuilder);
  readonly familie = signal<FamilienEintrag[]>([]);
  readonly formOffen = signal(false);
  readonly abmelden = signal<FamilienEintrag | null>(null);
  readonly anhaenge = signal<Anhang[]>([]);
  readonly beziehung = BEZIEHUNG;
  readonly beziehungen = Object.entries(BEZIEHUNG);
  readonly grenze = BEITRAG.familienEinkommensgrenze;
  readonly grenzeMinijob = BEITRAG.familienEinkommensgrenzeMinijob;
  readonly mitEnde = computed(() => this.familie().some(f => f.endetAm));

  form = this.fb.nonNullable.group({
    beziehung: ['', Validators.required], geschlecht: ['', Validators.required], vorname: ['', [Validators.required, Validators.maxLength(60)]],
    nachname: ['', [Validators.required, Validators.maxLength(60)]], geburtsdatum: ['', [Validators.required, VpValidatoren.nichtZukunft]],
    beginn: [heuteIso()], einkommenMonat: [0, [Validators.min(0)]], minijob: [false], inAusbildung: [false], behinderung: [false],
    ueberwiegendUnterhalten: [false], imHaushalt: [false], anderweitigVersichert: [false], hauptberuflichSelbststaendig: [false],
    ausbildungsende: [''], vorversicherung: [''],
  });
  abmeldeForm = this.fb.nonNullable.group({ zum: ['', Validators.required], grund: ['', Validators.required] });

  ngOnInit() {
    this.laden();
  }

  async laden() {
    this.familie.set(await this.api.liste());
  }

  istKind() {
    return ['KIND', 'STIEFKIND', 'ENKELKIND'].includes(this.form.value.beziehung || '');
  }

  alter() {
    return this.form.value.geburtsdatum ? alterAm(this.form.value.geburtsdatum) : 0;
  }

  hinweis(): string | null {
    const v = this.form.getRawValue();
    if (v.anderweitigVersichert) return 'Wer selbst versichert ist, kann nicht familienversichert werden.';
    const grenze = v.minijob ? this.grenzeMinijob : this.grenze;
    if (Number(v.einkommenMonat) > grenze) return `Mit einem Einkommen über ${grenze} € ist keine Familienversicherung möglich.`;
    if (this.istKind() && this.alter() >= 25 && !v.behinderung) return 'Kinder ab 25 Jahren können in der Regel nicht mehr familienversichert werden.';
    return null;
  }

  async anmelden() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    try {
      const r = await this.api.anmelden({ ...this.form.getRawValue(), anhaenge: this.anhaenge() });
      this.ui.erfolg(`Die Anmeldung wurde eingereicht (Vorgang ${r.vorgang.vorgangsnummer}).`);
      this.form.reset();
      this.anhaenge.set([]);
      this.formOffen.set(false);
      this.laden();
    } catch (e) {
      if (!serverfehlerSetzen(this.form, e)) this.ui.fehler(fehlertext(e));
      else this.ui.fehler(fehlertext(e));
    }
  }

  abmeldenStarten(f: FamilienEintrag) {
    const d = new Date();
    const monatsende = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    this.abmeldeForm.reset({ zum: monatsende.toLocaleDateString('sv-SE'), grund: '' });
    this.abmelden.set(f);
  }

  async abmeldenBestaetigen() {
    this.abmeldeForm.markAllAsTouched();
    if (this.abmeldeForm.invalid) return;
    const f = this.abmelden()!;
    if (!(await this.ui.bestaetigen('Familienversicherung beenden', `Die Familienversicherung für ${f.vorname} endet. Die Gesundheitskarte wird gesperrt. Fortfahren?`, { bestaetigen: 'Beenden', gefaehrlich: true }))) return;
    try {
      const v = this.abmeldeForm.getRawValue();
      await this.api.abmelden(f.id, v.zum, v.grund);
      this.ui.erfolg('Die Abmeldung wurde gespeichert.');
      this.abmelden.set(null);
      this.laden();
    } catch (e) {
      if (!serverfehlerSetzen(this.abmeldeForm, e)) this.ui.fehler(fehlertext(e));
    }
  }
}
