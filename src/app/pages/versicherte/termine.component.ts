import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BERATUNGSTHEMEN, FILIALEN, MAX_OFFENE_TERMINE } from '../../core/konfiguration';
import { Termin, TerminKanal } from '../../core/models';
import { fehlertext } from '../../core/services/auth.interceptor';
import { TerminApi } from '../../core/services/service-api.service';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { StatusComponent } from '../../shared/bausteine';
import { DatumPipe } from '../../shared/pipes';

@Component({
  selector: 'vp-termine',
  imports: [FormsModule, RouterLink, StatusComponent, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Termine & Rückruf</h1><p class="leise">Persönliche Beratung in der Filiale, am Telefon oder per Video</p></div>
      <a class="btn" routerLink="/antraege/neu/RUECKRUF">Stattdessen Rückruf anfordern</a></div>

    <section class="karte">
      <h2>Neuen Termin buchen</h2>
      @if (offene().length >= max) { <div class="hinweis warnung">Sie haben bereits {{ max }} offene Termine. Bitte stornieren Sie einen Termin, um einen neuen zu buchen.</div> }
      <ol class="schritte">
        <li [class.aktiv]="schritt() === 1" [class.erledigt]="schritt() > 1">Thema & Kanal</li>
        <li [class.aktiv]="schritt() === 2" [class.erledigt]="schritt() > 2">Datum & Uhrzeit</li>
        <li [class.aktiv]="schritt() === 3">Bestätigen</li>
      </ol>
      @switch (schritt()) {
        @case (1) {
          <div class="feldgruppe">
            <div class="feld"><label for="t-thema" class="pflicht">Thema</label><select id="t-thema" [(ngModel)]="t.thema"><option value="">Bitte wählen</option>
              @for (x of themen; track x) { <option [value]="x">{{ x }}</option> }</select></div>
            <fieldset><legend class="pflicht">Wie möchten Sie beraten werden?</legend><div class="auswahlgruppe">
              <label class="auswahl"><input type="radio" name="kanal" value="TELEFON" [(ngModel)]="t.kanal" /> Telefon</label>
              <label class="auswahl"><input type="radio" name="kanal" value="VIDEO" [(ngModel)]="t.kanal" /> Video (9–16 Uhr)</label>
              <label class="auswahl"><input type="radio" name="kanal" value="FILIALE" [(ngModel)]="t.kanal" /> Vor Ort in einer Filiale</label></div></fieldset>
            @if (t.kanal === 'FILIALE') { <div class="feld breit"><label for="t-fil" class="pflicht">Filiale</label><select id="t-fil" [(ngModel)]="t.filiale"><option value="">Bitte wählen</option>
              @for (f of filialen; track f) { <option [value]="f">{{ f }}</option> }</select></div> }
            @if (t.kanal === 'TELEFON') { <div class="feld"><label for="t-tel" class="pflicht">Wir rufen Sie an unter</label><input id="t-tel" type="tel" [(ngModel)]="t.telefon" /></div> }
          </div>
          <div class="aktionen"><button class="btn primaer" type="button" (click)="weiter1()" [disabled]="offene().length >= max">Weiter</button></div>
        }
        @case (2) {
          <div class="feld"><label for="t-tag" class="pflicht">Tag</label><select id="t-tag" [(ngModel)]="t.datum" (ngModelChange)="slotsLaden()">
            <option value="">Bitte wählen</option>@for (d of tage(); track d) { <option [value]="d">{{ wochentag(d) }}, {{ d | datum }}</option> }</select></div>
          @if (slots().length) {
            <fieldset class="mt"><legend class="pflicht">Uhrzeit</legend><div class="slots">
              @for (s of slots(); track s.uhrzeit) {
                <button type="button" class="btn klein" [class.primaer]="t.uhrzeit === s.uhrzeit" [disabled]="!s.frei" (click)="t.uhrzeit = s.uhrzeit" [attr.aria-pressed]="t.uhrzeit === s.uhrzeit">{{ s.uhrzeit }}</button>
              }</div></fieldset>
            @if (!freieSlots()) { <p class="hinweis info">An diesem Tag ist kein Termin mehr frei. Bitte wählen Sie einen anderen Tag.</p> }
          }
          <div class="aktionen"><button class="btn" type="button" (click)="schritt.set(1)">Zurück</button><button class="btn primaer" type="button" [disabled]="!t.uhrzeit" (click)="schritt.set(3)">Weiter</button></div>
        }
        @case (3) {
          <dl class="daten"><dt>Thema</dt><dd>{{ t.thema }}</dd><dt>Termin</dt><dd>{{ wochentag(t.datum) }}, {{ t.datum | datum }} um {{ t.uhrzeit }} Uhr</dd>
            <dt>Art</dt><dd>{{ kanalText[t.kanal] }}{{ t.kanal === 'FILIALE' ? ' – ' + t.filiale : t.kanal === 'TELEFON' ? ' – ' + t.telefon : '' }}</dd></dl>
          <div class="feld mt"><label for="t-anm">Möchten Sie uns vorab etwas mitteilen? (optional)</label><textarea id="t-anm" rows="3" maxlength="500" [(ngModel)]="t.anmerkung"></textarea></div>
          <div class="aktionen"><button class="btn" type="button" (click)="schritt.set(2)">Zurück</button><button class="btn primaer" type="button" (click)="buchen()">Termin verbindlich buchen</button></div>
        }
      }
    </section>

    <section class="karte"><h2>Ihre Termine</h2>
      <ul class="liste-ohne">@for (x of termine(); track x.id) {
        <li class="zeile"><span><strong>{{ wochentag(x.datum) }}, {{ x.datum | datum }}, {{ x.uhrzeit }} Uhr</strong> – {{ x.thema }}<br />
          <span class="klein leise">{{ kanalText[x.kanal] }}{{ x.filiale ? ', ' + x.filiale : '' }}</span></span>
          <span><vp-status [wert]="x.status" /> @if (x.status === 'GEBUCHT') { <button class="btn link klein" type="button" (click)="stornieren(x)">Stornieren</button> }</span></li>
      } @empty { <li class="leer">Keine Termine.</li> }</ul>
    </section>`,
  styles: [`.slots{display:flex;flex-wrap:wrap;gap:.4rem}`],
})
export class TermineComponent implements OnInit {
  private api = inject(TerminApi);
  private ui = inject(UiService);
  private sitzung = inject(SitzungService);
  readonly themen = BERATUNGSTHEMEN;
  readonly filialen = FILIALEN;
  readonly max = MAX_OFFENE_TERMINE;
  readonly kanalText: Record<TerminKanal, string> = { FILIALE: 'Filiale', TELEFON: 'Telefon', VIDEO: 'Video' };
  readonly termine = signal<Termin[]>([]);
  readonly tage = signal<string[]>([]);
  readonly slots = signal<{ uhrzeit: string; frei: boolean }[]>([]);
  readonly schritt = signal(1);
  readonly offene = computed(() => this.termine().filter(t => t.status === 'GEBUCHT'));
  readonly freieSlots = computed(() => this.slots().filter(s => s.frei).length);
  t = { thema: '', kanal: 'TELEFON' as TerminKanal, filiale: '', telefon: '', datum: '', uhrzeit: '', anmerkung: '' };

  async ngOnInit() {
    this.t.telefon = this.sitzung.benutzer()?.mobil || this.sitzung.benutzer()?.telefon || '';
    const [l, tage] = await Promise.all([this.api.liste(), this.api.tage()]);
    this.termine.set(l);
    this.tage.set(tage);
  }

  wochentag(d: string) {
    return d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long' }) : '';
  }

  weiter1() {
    if (!this.t.thema || (this.t.kanal === 'FILIALE' && !this.t.filiale) || (this.t.kanal === 'TELEFON' && !this.t.telefon)) {
      this.ui.fehler('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }
    this.slots.set([]);
    this.t.datum = '';
    this.t.uhrzeit = '';
    this.schritt.set(2);
  }

  async slotsLaden() {
    this.t.uhrzeit = '';
    if (!this.t.datum) return;
    try {
      this.slots.set(await this.api.slots(this.t.datum, this.t.kanal, this.t.kanal === 'FILIALE' ? this.t.filiale : undefined));
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async buchen() {
    try {
      await this.api.buchen(this.t);
      this.ui.erfolg('Ihr Termin ist gebucht. Die Bestätigung finden Sie in Ihrem Postfach.');
      this.t = { ...this.t, thema: '', datum: '', uhrzeit: '', anmerkung: '' };
      this.schritt.set(1);
      this.termine.set(await this.api.liste());
    } catch (e) {
      this.ui.fehler(fehlertext(e));
      if ((e as any)?.error?.feld === 'uhrzeit') {
        this.schritt.set(2);
        this.slotsLaden();
      }
    }
  }

  async stornieren(x: Termin) {
    if (!(await this.ui.bestaetigen('Termin stornieren', `Möchten Sie den Termin am ${new DatumPipe().transform(x.datum)} um ${x.uhrzeit} Uhr stornieren?`, { bestaetigen: 'Stornieren', gefaehrlich: true }))) return;
    try {
      await this.api.stornieren(x.id);
      this.ui.erfolg('Der Termin wurde storniert.');
      this.termine.set(await this.api.liste());
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
