import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Anhang, Benachrichtigung, Vollmacht } from '../../core/models';
import { Api, BenachrichtigungService } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { DateienComponent, FeldfehlerComponent, StatusComponent } from '../../shared/bausteine';
import { DatumPipe } from '../../shared/pipes';
import { herunterladen } from '../../shared/pdf';
import { serverfehlerSetzen, VpValidatoren } from '../../shared/validatoren';
import { DatumEingabeComponent } from '../../shared/datum-eingabe.component';

const UMFANG: Record<string, string> = { POSTFACH: 'Postfach lesen', ANTRAEGE: 'Anträge stellen', AUSKUNFT: 'Auskünfte erhalten', PFLEGE: 'Pflegeangelegenheiten', BEITRAEGE: 'Beitragsangelegenheiten', ALLES: 'Alle Angelegenheiten' };

@Component({
  selector: 'vp-vollmachten',
  imports: [DatumEingabeComponent, ReactiveFormsModule, RouterLink, FeldfehlerComponent, DateienComponent, StatusComponent, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Vollmachten & Vertretung</h1><p class="leise">Legen Sie fest, wer Ihre Angelegenheiten bei der VitaPlus erledigen darf.</p></div>
      <button class="btn primaer" type="button" (click)="formOffen.set(true)">Vollmacht erteilen</button></div>
    @if (d(); as d) {
      @if (formOffen()) {
        <form class="karte formular hervor" [formGroup]="form" (ngSubmit)="erteilen()" novalidate>
          <h2>Neue Vollmacht</h2>
          <div class="feldgruppe">
            <div class="feld"><label for="vm-art" class="pflicht">Art</label><select id="vm-art" formControlName="art">
              <option value="VOLLMACHT">Vollmacht für die VitaPlus</option><option value="VORSORGEVOLLMACHT">Vorsorgevollmacht</option><option value="BETREUUNG">Gerichtliche Betreuung</option></select></div>
            <div class="feld"><label for="vm-bez" class="pflicht">Beziehung</label><input id="vm-bez" formControlName="beziehung" placeholder="z. B. Tochter, Ehemann" /><vp-feldfehler [control]="form.controls.beziehung" /></div>
            <div class="feld"><label for="vm-vn" class="pflicht">Vorname</label><input id="vm-vn" formControlName="vorname" /><vp-feldfehler [control]="form.controls.vorname" /></div>
            <div class="feld"><label for="vm-nn" class="pflicht">Nachname</label><input id="vm-nn" formControlName="nachname" /><vp-feldfehler [control]="form.controls.nachname" /></div>
            <div class="feld"><label for="vm-geb" class="pflicht">Geburtsdatum</label><vp-datum id="vm-geb" formControlName="geburtsdatum" /><vp-feldfehler [control]="form.controls.geburtsdatum" /></div>
            <div class="feld"><label for="vm-bis">Gültig bis (optional)</label><vp-datum id="vm-bis" formControlName="gueltigBis" /><vp-feldfehler [control]="form.controls.gueltigBis" /></div>
            <fieldset class="breit"><legend class="pflicht">Umfang</legend><div class="auswahlgruppe zeile">
              @for (u of umfaenge; track u[0]) { <label class="auswahl"><input type="checkbox" [checked]="umfang().includes(u[0])" (change)="umschalten(u[0])" /> {{ u[1] }}</label> }</div></fieldset>
            <label class="auswahl breit"><input type="checkbox" formControlName="onlineZugriff" /> Die Person soll über ihren eigenen Online-Zugang für mich handeln können</label>
            @if (form.value.onlineZugriff) { <div class="feld"><label for="vm-mail" class="pflicht">E-Mail-Adresse der Person</label><input id="vm-mail" type="email" formControlName="email" /><vp-feldfehler [control]="form.controls.email" /></div> }
            @if (form.value.art !== 'VOLLMACHT') { <div class="breit"><vp-dateien label="Vorsorgevollmacht bzw. Betreuerausweis" [pflicht]="true" [max]="1" [(dateien)]="nachweis" /></div> }
          </div>
          <div class="aktionen"><button class="btn" type="button" (click)="formOffen.set(false)">Abbrechen</button><button class="btn primaer" type="submit">Vollmacht erteilen</button></div>
        </form>
      }
      <section class="karte"><h2>Von Ihnen erteilte Vollmachten</h2>
        <ul class="liste-ohne">@for (v of d.erteilt; track v.id) {
          <li class="zeile"><span><strong>{{ v.vorname }} {{ v.nachname }}</strong> ({{ v.beziehung }}) <vp-status [wert]="v.status" /><br />
            <span class="klein leise">{{ umfangText(v.umfang) }}, seit {{ v.gueltigAb | datum }}{{ v.gueltigBis ? ' bis ' + (v.gueltigBis | datum) : '' }}{{ v.onlineZugriff ? ', Online-Zugriff' : '' }}</span></span>
            @if (v.status === 'AKTIV' || v.status === 'AUSSTEHEND') { <button class="btn gefahr klein" type="button" (click)="widerrufen(v)">Widerrufen</button> }</li>
        } @empty { <li class="leer">Sie haben keine Vollmachten erteilt.</li> }</ul></section>
      <section class="karte"><h2>Sie sind bevollmächtigt für</h2>
        @for (e of einladungen(); track e.id) {
          <div class="hinweis info">{{ e.vollmachtgeber }} hat Sie bevollmächtigt. <button class="btn klein" type="button" (click)="annehmen(e)">Vollmacht annehmen</button></div>
        }
        <ul class="liste-ohne">@for (v of d.erhalten; track v.id) {
          <li class="zeile"><span><strong>{{ v.vollmachtgeber }}</strong><br /><span class="klein leise">{{ umfangText(v.umfang) }}</span></span>
            @if (v.onlineZugriff) { <a class="btn klein" routerLink="/vertretung" [queryParams]="{ id: v.id }">Für diese Person handeln</a> }</li>
        } @empty { <li class="leer">Keine</li> }</ul></section>
      <section class="karte"><h2>Gesetzliche Vertretung</h2>
        <p class="klein leise">Für Ihre minderjährigen Kinder handeln Sie als gesetzliche Vertreterin bzw. gesetzlicher Vertreter. Ab 15 Jahren können Jugendliche eigene Anträge stellen (§ 36 SGB I).</p>
        <ul class="liste-ohne">@for (g of d.gesetzlich; track g.id) { <li class="zeile">{{ g.name }} ({{ g.alter }} Jahre) <span class="klein">eigener Zugang ab {{ g.eigenerZugangAb | datum }}, Vertretung bis {{ g.endetAm | datum }}</span></li> }
          @empty { <li class="leer">Keine minderjährigen Kinder mitversichert.</li> }</ul></section>
    }`,
})
export class VollmachtenComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  private fb = inject(FormBuilder);
  readonly d = signal<any>(null);
  readonly einladungen = signal<any[]>([]);
  readonly formOffen = signal(false);
  readonly umfang = signal<string[]>([]);
  readonly nachweis = signal<Anhang[]>([]);
  readonly umfaenge = Object.entries(UMFANG);
  form = this.fb.nonNullable.group({
    art: ['VOLLMACHT'], beziehung: ['', Validators.required], vorname: ['', Validators.required], nachname: ['', Validators.required],
    geburtsdatum: ['', [Validators.required, VpValidatoren.nichtZukunft]], gueltigBis: [''], onlineZugriff: [false], email: [''],
  });

  ngOnInit() {
    this.laden();
  }

  async laden() {
    const [d, e] = await Promise.all([this.api.get('/api/vollmachten'), this.api.get<any[]>('/api/vollmachten/einladungen')]);
    this.d.set(d);
    this.einladungen.set(e);
  }

  umfangText(l: string[]) {
    return l.map(u => UMFANG[u]).join(', ');
  }

  umschalten(u: string) {
    this.umfang.update(l => (l.includes(u) ? l.filter(x => x !== u) : [...l, u]));
  }

  async erteilen() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    try {
      await this.api.post('/api/vollmachten', { ...this.form.getRawValue(), umfang: this.umfang(), nachweis: this.nachweis()[0] });
      this.ui.erfolg('Die Vollmacht wurde erteilt.');
      this.form.reset({ art: 'VOLLMACHT', onlineZugriff: false });
      this.umfang.set([]);
      this.formOffen.set(false);
      this.laden();
    } catch (e) {
      if (!serverfehlerSetzen(this.form, e)) this.ui.fehler(fehlertext(e));
    }
  }

  async widerrufen(v: Vollmacht) {
    if (!(await this.ui.bestaetigen('Vollmacht widerrufen', `${v.vorname} ${v.nachname} kann danach nicht mehr für Sie handeln.`, { bestaetigen: 'Widerrufen', gefaehrlich: true }))) return;
    try {
      await this.api.post(`/api/vollmachten/${v.id}/widerrufen`);
      this.ui.erfolg('Die Vollmacht wurde widerrufen.');
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async annehmen(e: any) {
    await this.api.post(`/api/vollmachten/${e.id}/annehmen`);
    this.laden();
  }
}

@Component({
  selector: 'vp-vertretung',
  imports: [RouterLink, StatusComponent, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/vollmachten">Vollmachten</a> › Vertretung</p>
    @if (!id()) {
      <div class="karte"><h1>Als Bevollmächtigte/r handeln</h1><p>Wählen Sie unter <a routerLink="/vollmachten">Vollmachten</a> die Person, für die Sie handeln möchten.</p></div>
    } @else if (d(); as d) {
      <h1>Vertretung für {{ d.vollmachtgeber }}</h1>
      <div class="hinweis warnung">Sie handeln als bevollmächtigte Person. Alle Zugriffe werden protokolliert.</div>
      @if (d.vorgaenge) {
        <section class="karte"><h2>Vorgänge</h2><ul class="liste-ohne">@for (v of d.vorgaenge; track v.vorgangsnummer) {
          <li class="zeile">{{ v.titel }} <span class="klein">{{ v.vorgangsnummer }}, {{ v.geaendertAm | datum }} <vp-status [wert]="v.status" /></span></li> }</ul></section>
      }
      @if (d.nachrichten) {
        <section class="karte"><h2>Postfach</h2><ul class="liste-ohne">@for (n of d.nachrichten; track n.id) {
          <li><strong>{{ n.betreff }}</strong> <span class="klein leise">{{ n.datum | datum }}</span><p class="klein" style="white-space:pre-line">{{ n.text }}</p></li> }</ul></section>
      }
      @if (d.pflege; as p) { <section class="karte"><h2>Pflege</h2><p>Pflegegrad {{ p.pflegegrad }} seit {{ p.seit | datum }}</p></section> }
    } @else if (fehler()) { <div class="hinweis fehler">{{ fehler() }}</div> }`,
})
export class VertretungComponent implements OnInit {
  private api = inject(Api);
  readonly id = signal<string | null>(new URLSearchParams(location.search).get('id'));
  readonly d = signal<any>(null);
  readonly fehler = signal<string | null>(null);
  async ngOnInit() {
    if (!this.id()) return;
    try {
      this.d.set(await this.api.get(`/api/vollmachten/${this.id()}/ansicht`));
    } catch (e) {
      this.fehler.set(fehlertext(e));
    }
  }
}

@Component({
  selector: 'vp-datenschutz-center',
  imports: [RouterLink, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Datenschutz-Center</h1><p class="leise">Ihre Einwilligungen und Datenschutzrechte</p></div><a class="btn" routerLink="/info/datenschutz">Datenschutzhinweise</a></div>
    <section class="karte"><h2>Einwilligungen</h2>
      <ul class="liste-ohne">@for (e of einwilligungen(); track e.code) {
        <li><div class="zeile"><span><strong>{{ e.titel }}</strong><br /><span class="klein">{{ e.text }}</span></span>
          <label class="auswahl"><input type="checkbox" [checked]="e.erteilt" (change)="setzen(e, $any($event.target).checked)" /> {{ e.erteilt ? 'erteilt' : 'nicht erteilt' }}</label></div>
          @if (e.historie.length) { <details class="klein"><summary>Verlauf</summary><ul>@for (h of e.historie; track h.zeitpunkt) { <li>{{ h.zeitpunkt | datum: true }}: {{ h.erteilt ? 'erteilt' : 'widerrufen' }} ({{ h.kanal }})</li> }</ul></details> }</li>
      }</ul></section>
    <div class="raster-2">
      <section class="karte"><h2>Ihre Rechte</h2><ul class="liste-ohne">
        <li><a routerLink="/antraege/neu/DATENSCHUTZANFRAGE">Auskunft, Berichtigung, Löschung oder Datenübertragung beantragen</a></li>
        <li><button class="btn link" type="button" (click)="export()">Kopie meiner Daten herunterladen (JSON)</button></li>
        <li><a routerLink="/antraege/neu/AKTENEINSICHT">Akteneinsicht beantragen</a></li>
        <li><a routerLink="/einstellungen/sicherheit">Wer hat auf meine Daten zugegriffen? (Zugriffsprotokoll)</a></li>
        <li><a routerLink="/antraege/neu/DATENSCHUTZBESCHWERDE">Datenschutzbeauftragte kontaktieren</a></li>
      </ul></section>
      <section class="karte"><h2>Weitere Einstellungen</h2><ul class="liste-ohne">
        <li><a routerLink="/einstellungen/datenschutz">Nutzungsanalyse und Cookies</a></li>
        <li><a routerLink="/epa">Widersprüche zur ePA</a></li>
        <li><a routerLink="/info/aufsicht">Aufsicht und Beschwerdestellen</a></li>
      </ul></section>
    </div>`,
})
export class DatenschutzCenterComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  private router = inject(Router);
  readonly einwilligungen = signal<any[]>([]);
  async ngOnInit() {
    this.einwilligungen.set(await this.api.get('/api/einwilligungen'));
  }
  async setzen(e: any, erteilt: boolean, bonusBeenden = false): Promise<void> {
    try {
      this.einwilligungen.set(await this.api.put(`/api/einwilligungen/${e.code}`, { erteilt, bonusBeenden }));
      this.ui.erfolg(erteilt ? 'Einwilligung erteilt.' : 'Einwilligung widerrufen.');
    } catch (err: any) {
      if (err?.error?.code === 'BONUS_TEILNAHME' && (await this.ui.bestaetigen('Bonusprogramm beenden?', fehlertext(err), { bestaetigen: 'Teilnahme beenden', gefaehrlich: true }))) {
        return this.setzen(e, erteilt, true);
      }
      this.ui.fehler(fehlertext(err));
      this.einwilligungen.set(await this.api.get('/api/einwilligungen'));
    }
  }
  async export() {
    try {
      const d = await this.api.get('/api/datenschutz/export');
      herunterladen(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `VitaPlus_Datenkopie_${new Date().toLocaleDateString('sv-SE')}.json`);
    } catch (e: any) {
      if (e?.error?.code === 'KEINE_AUSKUNFT') {
        this.ui.info('Bitte beantragen Sie zuerst eine Datenauskunft.');
        this.router.navigate(['/antraege/neu/DATENSCHUTZANFRAGE']);
      } else this.ui.fehler(fehlertext(e));
    }
  }
}

const KATEGORIE: Record<string, string> = { NACHRICHT: 'Nachricht', STATUS: 'Statusänderung', DOKUMENT: 'Dokument', FRIST: 'Frist', BONUS: 'Bonus', SICHERHEIT: 'Sicherheit' };

@Component({
  selector: 'vp-benachrichtigungen',
  imports: [FormsModule, RouterLink, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Benachrichtigungen</h1><p class="leise">Alle Hinweise an einem Ort</p></div>
      <div class="aktionen"><button class="btn" type="button" (click)="alleGelesen()">Alle als gelesen markieren</button><a class="btn link" routerLink="/einstellungen/benachrichtigungen">Einstellungen</a></div></div>
    <div class="filterleiste"><div class="feld"><label for="bn-kat">Kategorie</label><select id="bn-kat" [(ngModel)]="kategorie" (ngModelChange)="laden()"><option value="">Alle</option>
      @for (k of kategorien; track k[0]) { <option [value]="k[0]">{{ k[1] }}</option> }</select></div></div>
    <ul class="liste-ohne karte">
      @for (b of liste(); track b.id) {
        <li class="zeile" [class.fett]="!b.gelesen"><span><span class="badge" [class.rot]="b.kategorie === 'SICHERHEIT' || b.kategorie === 'FRIST'">{{ kat[b.kategorie] }}</span> {{ b.titel }}<br />
          <span class="klein" [class.leise]="b.gelesen">{{ b.text }}, {{ b.zeitpunkt | datum: true }}</span></span>
          <span>@if (b.link) { <button class="btn link klein" type="button" (click)="oeffnen(b)">Anzeigen</button> }
            <button class="btn link klein" type="button" (click)="loeschen(b)" aria-label="Benachrichtigung entfernen">Entfernen</button></span></li>
      } @empty { <li class="leer">Keine Benachrichtigungen.</li> }
    </ul>`,
})
export class BenachrichtigungenComponent implements OnInit {
  private api = inject(Api);
  private service = inject(BenachrichtigungService);
  private router = inject(Router);
  readonly liste = signal<Benachrichtigung[]>([]);
  readonly kategorien = Object.entries(KATEGORIE);
  readonly kat = KATEGORIE;
  kategorie = '';
  ngOnInit() {
    this.laden();
  }
  async laden() {
    const r = await this.api.get('/api/benachrichtigungen', { kategorie: this.kategorie });
    this.liste.set(r.eintraege);
    this.service.ungelesen.set(r.ungelesen);
  }
  async oeffnen(b: Benachrichtigung) {
    await this.api.put(`/api/benachrichtigungen/${b.id}/gelesen`);
    this.service.aktualisieren();
    this.router.navigateByUrl(b.link!);
  }
  async alleGelesen() {
    await this.api.put('/api/benachrichtigungen/alle/gelesen');
    this.laden();
  }
  async loeschen(b: Benachrichtigung) {
    await this.api.delete(`/api/benachrichtigungen/${b.id}`);
    this.laden();
  }
}

