import { ChangeDetectionStrategy, Component, computed, inject, input, isDevMode, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Protokolleintrag } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { ProfilApi } from '../../core/services/versicherten-api.service';
import { FeldfehlerComponent } from '../../shared/bausteine';
import { PasswortStaerkeComponent } from '../../shared/passwort-staerke.component';
import { DatumPipe } from '../../shared/pipes';
import { serverfehlerSetzen, VpValidatoren } from '../../shared/validatoren';

type Bereich = 'sicherheit' | 'benachrichtigungen' | 'darstellung' | 'datenschutz' | 'konto';

const EREIGNIS: Record<string, string> = {
  ANMELDUNG: 'Anmeldung', ABMELDUNG: 'Abmeldung', ANMELDUNG_FEHLGESCHLAGEN: 'Fehlgeschlagene Anmeldung', KONTO_GESPERRT: 'Zugang gesperrt', KONTO_ENTSPERRT: 'Zugang entsperrt',
  NEUES_GERAET: 'Neues Gerät', SITZUNG_BEENDET: 'Sitzung beendet', GERAET_ENTFERNT: 'Gerät entfernt', DATENZUGRIFF: 'Datenzugriff', PASSWORT_ZURUECKGESETZT: 'Passwort zurückgesetzt',
  VOLLMACHT_ERTEILT: 'Vollmacht erteilt', VOLLMACHT_WIDERRUFEN: 'Vollmacht widerrufen', EINWILLIGUNG_ERTEILT: 'Einwilligung erteilt', EINWILLIGUNG_WIDERRUFEN: 'Einwilligung widerrufen',
  DATENEXPORT: 'Datenexport', DATENAUSKUNFT: 'Datenauskunft', REGISTRIERUNG: 'Registrierung', AKTIVIERUNG: 'Aktivierung', ZWEI_FAKTOR_FEHLGESCHLAGEN: 'Sicherheitscode falsch',
};

@Component({
  selector: 'vp-einstellungen',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, FeldfehlerComponent, PasswortStaerkeComponent, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let b = sitzung.benutzer()!;
    <div class="seitenkopf"><div><h1>Einstellungen</h1></div></div>
    <nav class="reiter">
      @for (r of reiter(); track r[0]) { <a [routerLink]="['/einstellungen', r[0]]" [class.aktiv]="aktiv() === r[0]">{{ r[1] }}</a> }
    </nav>
    @switch (aktiv()) {
      @case ('sicherheit') {
        <div class="raster-2">
          <form class="karte" [formGroup]="pw" (ngSubmit)="passwortAendern()" novalidate>
            <h2>Passwort ändern</h2>
            @if (b.passwortGeaendertAm) { <p class="klein leise">Zuletzt geändert am {{ b.passwortGeaendertAm | datum }}</p> }
            <div class="feld mb"><label for="pw-alt" class="pflicht">Aktuelles Passwort</label><input id="pw-alt" type="password" formControlName="altesPasswort" autocomplete="current-password" /><vp-feldfehler [control]="pw.controls.altesPasswort" /></div>
            <div class="feld mb"><label for="pw-neu" class="pflicht">Neues Passwort</label><input id="pw-neu" type="password" formControlName="neuesPasswort" autocomplete="new-password" /><vp-feldfehler [control]="pw.controls.neuesPasswort" /></div>
            <div class="feld mb"><label for="pw-neu2" class="pflicht">Neues Passwort wiederholen</label><input id="pw-neu2" type="password" formControlName="wiederholung" autocomplete="new-password" /><vp-feldfehler [control]="pw.controls.wiederholung" /></div>
            <vp-passwort-staerke [passwort]="pw.controls.neuesPasswort.value" />
            <p class="klein leise">Das Passwort darf weder Ihren Namen noch Ihr Geburtsjahr enthalten. Nach der Änderung melden wir Sie auf allen Geräten ab.</p>
            <button class="btn primaer" type="submit">Passwort ändern</button>
          </form>
          <section class="karte">
            <h2>Zwei-Faktor-Anmeldung</h2>
            <p>Status: <span class="badge" [class.gruen]="b.zweiFaktorAktiv">{{ b.zweiFaktorAktiv ? 'aktiv' : 'nicht aktiv' }}</span></p>
            <p class="klein">Bei jeder Anmeldung senden wir Ihnen zusätzlich einen Code per SMS an {{ b.mobil || 'Ihre Mobilnummer' }}.</p>
            <div class="feld mb"><label for="zf-pw">Passwort zur Bestätigung</label><input id="zf-pw" type="password" [(ngModel)]="zfPasswort" [ngModelOptions]="{ standalone: true }" /></div>
            @if (zfCodeGesendet()) {
              <div class="feld mb"><label for="zf-code">Bestätigungscode aus der SMS</label><input id="zf-code" inputmode="numeric" maxlength="6" [(ngModel)]="zfCode" [ngModelOptions]="{ standalone: true }" /></div>
              @if (entwicklerCode()) { <p class="hinweis info klein">Entwicklungsumgebung – simulierte SMS: {{ entwicklerCode() }}</p> }
            }
            @if (b.zweiFaktorAktiv) { <button class="btn gefahr" type="button" (click)="zweiFaktor(false)">Deaktivieren</button> }
            @else { <button class="btn primaer" type="button" (click)="zweiFaktor(true)">{{ zfCodeGesendet() ? 'Code bestätigen' : 'Aktivieren' }}</button> }
          </section>
        </div>
        <section class="karte"><h2>Aktive Sitzungen</h2>
          <ul class="liste-ohne">@for (s of sitzungen(); track s.id) {
            <li class="zeile"><span><strong>{{ s.geraet }}</strong> @if (s.aktuell) { <span class="badge gruen">diese Sitzung</span> }<br />
              <span class="klein leise">angemeldet {{ s.angemeldetSeit | datum: true }}, zuletzt aktiv {{ s.letzteAktivitaet | datum: true }}</span></span>
              @if (!s.aktuell) { <button class="btn klein" type="button" (click)="sitzungBeenden(s.id)">Abmelden</button> }</li>
          }</ul>
          @if (sitzungen().length > 1) { <button class="btn" type="button" (click)="alleAbmelden()">Alle anderen Sitzungen beenden</button> }
        </section>
        @if (b.rolle === 'VERSICHERTER') {
          <section class="karte"><h2>Bekannte Geräte</h2>
            <ul class="liste-ohne">@for (g of geraete(); track g.name) { <li class="zeile">{{ g.name }} @if (g.aktiv) { <span class="badge gruen">angemeldet</span> }
              <button class="btn link klein" type="button" (click)="geraetEntfernen(g.name)">Entfernen</button></li> } @empty { <li class="leer">Keine</li> }</ul>
            <p class="klein leise">Bei einer Anmeldung von einem unbekannten Gerät informieren wir Sie.</p></section>
          <section class="karte"><h2>Sicherheitsprotokoll</h2>
            <div class="filterleiste"><label class="auswahl"><input type="checkbox" [(ngModel)]="nurZugriffe" [ngModelOptions]="{ standalone: true }" (ngModelChange)="protokollLaden()" /> nur Zugriffe auf meine Daten</label></div>
            <div class="tabelle-wrapper"><table class="tabelle klein"><thead><tr><th>Zeitpunkt</th><th>Ereignis</th><th>Details</th><th>Durch</th><th>Gerät</th></tr></thead><tbody>
              @for (p of protokoll(); track p.id) { <tr [class.fett]="p.stufe === 'KRITISCH'"><td class="nowrap">{{ p.zeitpunkt | datum: true }}</td><td>{{ ereignis[p.ereignis] || p.ereignis }}</td><td>{{ p.details }}</td><td>{{ $any(p).akteur }}</td><td>{{ p.geraet || '' }}</td></tr> } @empty { <tr><td colspan="5" class="leer">Noch keine Einträge im Zeitraum.</td></tr> }
            </tbody></table></div></section>
          <section class="karte"><h2>Verdacht auf Missbrauch?</h2>
            <p>Sperren Sie Ihren Zugang sofort. Sie können ihn anschließend über „Passwort vergessen“ oder den Online-Ausweis wieder entsperren.</p>
            <div class="filterleiste"><div class="feld"><label for="sperr">Geben Sie zur Bestätigung SPERREN ein</label><input id="sperr" [(ngModel)]="sperrText" [ngModelOptions]="{ standalone: true }" /></div>
              <button class="btn gefahr primaer" type="button" (click)="sperren()" [disabled]="sperrText !== 'SPERREN'">Zugang jetzt sperren</button></div></section>
        }
      }
      @case ('benachrichtigungen') {
        <form class="karte formular" (ngSubmit)="benachrichtigungenSpeichern()">
          <h2>Wie möchten Sie benachrichtigt werden?</h2>
          <div class="auswahlgruppe">
            <label class="auswahl"><input type="checkbox" name="e" [(ngModel)]="bn.email" /> E-Mail an {{ b.email }}</label>
            <label class="auswahl"><input type="checkbox" name="p" [(ngModel)]="bn.push" /> Push-Nachricht in der VitaPlus-App</label>
            <label class="auswahl"><input type="checkbox" name="s" [(ngModel)]="bn.sms" /> SMS an {{ b.mobil || '(keine Mobilnummer hinterlegt)' }}</label></div>
          <h3>Worüber?</h3>
          <div class="auswahlgruppe">
            @for (k of kategorien; track k[0]) { <label class="auswahl"><input type="checkbox" [name]="k[0]" [(ngModel)]="bn.kategorien[k[0]]" [disabled]="k[0] === 'SICHERHEIT'" /> {{ k[1] }}</label> }</div>
          <h3>Ruhezeiten</h3>
          <label class="auswahl"><input type="checkbox" name="rz" [(ngModel)]="bn.ruhezeitAktiv" /> Keine Push-Nachrichten und SMS in diesem Zeitraum</label>
          @if (bn.ruhezeitAktiv) { <div class="filterleiste mt"><div class="feld"><label for="rz-von">von</label><input id="rz-von" name="rzv" type="time" [(ngModel)]="bn.ruhezeitVon" /></div>
            <div class="feld"><label for="rz-bis">bis</label><input id="rz-bis" name="rzb" type="time" [(ngModel)]="bn.ruhezeitBis" /></div></div> }
          <div class="aktionen"><button class="btn primaer" type="submit">Speichern</button></div>
        </form>
      }
      @case ('darstellung') {
        <form class="karte formular" (ngSubmit)="darstellungSpeichern()">
          <h2>Darstellung und Sprache</h2>
          <div class="feldgruppe">
            <div class="feld"><label for="ds-sprache">Sprache der Oberfläche</label><select id="ds-sprache" name="sprache" [(ngModel)]="ds.sprache"><option value="de">Deutsch</option><option value="en">English (Beta)</option></select></div>
            <div class="feld"><label for="ds-schrift">Schriftgröße</label><select id="ds-schrift" name="schrift" [(ngModel)]="ds.schriftgroesse"><option value="NORMAL">Normal</option><option value="GROSS">Groß</option><option value="SEHR_GROSS">Sehr groß</option></select></div>
            <label class="auswahl breit"><input type="checkbox" name="kontrast" [(ngModel)]="ds.hoherKontrast" /> Hoher Kontrast</label>
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit">Übernehmen</button></div>
        </form>
      }
      @case ('datenschutz') {
        <form class="karte formular" (ngSubmit)="datenschutzSpeichern()">
          <h2>Datenschutzpräferenzen</h2>
          <label class="auswahl"><input type="checkbox" checked disabled /> Technisch notwendige Speicherung (Anmeldung, Sicherheit)</label>
          <label class="auswahl"><input type="checkbox" name="komfort" [(ngModel)]="dsp.komfortCookies" /> Komfortfunktionen (z. B. zuletzt gewählter Postfach-Ordner)</label>
          <label class="auswahl"><input type="checkbox" name="analyse" [(ngModel)]="dsp.nutzungsanalyse" /> Pseudonyme Nutzungsanalyse zur Verbesserung der Online-Geschäftsstelle</label>
          <div class="aktionen"><button class="btn primaer" type="submit">Speichern</button><a routerLink="/datenschutz-center">Zum Datenschutz-Center</a></div>
        </form>
      }
      @case ('konto') {
        <section class="karte"><h2>Online-Konto löschen</h2>
          <p>Ihre Mitgliedschaft bei der VitaPlus bleibt bestehen. Sie erhalten Bescheide und Informationen anschließend wieder per Post. Nachrichten im Postfach werden gelöscht – Beitragsbescheide ausgenommen.</p>
          @if (offeneVorgaenge()) { <div class="hinweis warnung">Sie haben noch {{ offeneVorgaenge() }} offene Vorgänge. Antworten erhalten Sie nach der Löschung per Post.</div> }
          <div class="feld mb"><label for="del-pw" class="pflicht">Passwort zur Bestätigung</label><input id="del-pw" type="password" [(ngModel)]="loeschPasswort" [ngModelOptions]="{ standalone: true }" /></div>
          <button class="btn gefahr primaer" type="button" (click)="kontoLoeschen()" [disabled]="!loeschPasswort">Online-Konto endgültig löschen</button>
          <p class="klein leise mt">Sie möchten Ihre Mitgliedschaft beenden? <a routerLink="/antraege/neu/KUENDIGUNG">Zur Kündigung</a></p>
        </section>
      }
    }`,
})
export class EinstellungenComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  private api = inject(Api);
  private profilApi = inject(ProfilApi);
  private ui = inject(UiService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  readonly bereich = input<Bereich>('sicherheit');
  readonly aktiv = computed(() => (this.istVersichert() ? this.bereich() || 'sicherheit' : 'sicherheit'));
  readonly istVersichert = computed(() => this.sitzung.benutzer()?.rolle === 'VERSICHERTER');
  readonly reiter = computed<[Bereich, string][]>(() => this.istVersichert()
    ? [['sicherheit', 'Sicherheit'], ['benachrichtigungen', 'Benachrichtigungen'], ['darstellung', 'Darstellung & Sprache'], ['datenschutz', 'Datenschutz'], ['konto', 'Online-Konto']]
    : [['sicherheit', 'Sicherheit']]);
  readonly kategorien: [string, string][] = [['NACHRICHT', 'Neue Nachrichten'], ['STATUS', 'Statusänderungen meiner Vorgänge'], ['DOKUMENT', 'Neue Bescheide und Dokumente'],
    ['FRIST', 'Fristen und fehlende Unterlagen'], ['BONUS', 'Bonusprogramm'], ['SICHERHEIT', 'Sicherheitshinweise (immer aktiv)']];
  readonly ereignis = EREIGNIS;
  readonly sitzungen = signal<any[]>([]);
  readonly geraete = signal<{ name: string; aktiv: boolean }[]>([]);
  readonly protokoll = signal<Protokolleintrag[]>([]);
  readonly zfCodeGesendet = signal(false);
  readonly entwicklerCode = signal<string | null>(null);
  readonly offeneVorgaenge = signal(0);
  zfPasswort = '';
  zfCode = '';
  sperrText = '';
  loeschPasswort = '';
  nurZugriffe = false;
  bn: any = {};
  ds: any = {};
  dsp: any = {};

  pw = this.fb.nonNullable.group({
    altesPasswort: ['', Validators.required], neuesPasswort: ['', [Validators.required, VpValidatoren.passwort]], wiederholung: ['', Validators.required],
  }, { validators: VpValidatoren.gleich('neuesPasswort', 'wiederholung') });

  async ngOnInit() {
    const b = this.sitzung.benutzer()!;
    this.bn = structuredClone(b.benachrichtigungen || {});
    this.ds = { sprache: b.sprache, schriftgroesse: b.schriftgroesse, hoherKontrast: b.hoherKontrast };
    this.dsp = { ...b.datenschutzPraeferenzen };
    this.sitzungen.set(await this.api.get('/api/konto/sitzungen'));
    if (b.rolle === 'VERSICHERTER') {
      const [g, ue] = await Promise.all([this.api.get('/api/konto/geraete'), this.api.get('/api/vorgaenge/uebersicht')]);
      this.geraete.set(g);
      this.offeneVorgaenge.set(ue.offen);
      this.protokollLaden();
    }
  }

  async protokollLaden() {
    this.protokoll.set(await this.api.get('/api/konto/protokoll', { art: this.nurZugriffe ? 'ZUGRIFFE' : '' }));
  }

  async passwortAendern() {
    this.pw.markAllAsTouched();
    if (this.pw.invalid) return;
    try {
      const v = this.pw.getRawValue();
      await this.profilApi.passwort(v.altesPasswort, v.neuesPasswort);
      this.sitzung.lokalBeenden();
      this.router.navigate(['/anmelden'], { queryParams: { grund: 'passwort' } });
    } catch (e) {
      if (!serverfehlerSetzen(this.pw, e)) this.ui.fehler(fehlertext(e));
    }
  }

  async zweiFaktor(aktiv: boolean) {
    try {
      const r = await this.profilApi.zweiFaktor(aktiv, this.zfPasswort, this.zfCodeGesendet() ? this.zfCode : undefined);
      if (r.codeGesendet) {
        this.zfCodeGesendet.set(true);
        if (isDevMode()) this.entwicklerCode.set(r.entwicklerCode);
        this.ui.info('Wir haben Ihnen einen Bestätigungscode per SMS gesendet.');
        return;
      }
      this.sitzung.setzen(r);
      this.zfCodeGesendet.set(false);
      this.zfPasswort = this.zfCode = '';
      this.ui.erfolg(aktiv ? 'Die Zwei-Faktor-Anmeldung ist aktiv.' : 'Die Zwei-Faktor-Anmeldung wurde deaktiviert.');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async sitzungBeenden(id: string) {
    await this.api.delete(`/api/konto/sitzungen/${id}`);
    this.sitzungen.set(await this.api.get('/api/konto/sitzungen'));
  }

  async alleAbmelden() {
    await this.api.delete('/api/konto/sitzungen/andere');
    this.sitzungen.set(await this.api.get('/api/konto/sitzungen'));
    this.ui.erfolg('Alle anderen Sitzungen wurden beendet.');
  }

  async geraetEntfernen(name: string) {
    this.geraete.set(await this.api.delete(`/api/konto/geraete/${encodeURIComponent(name)}`));
  }

  async sperren() {
    if (!(await this.ui.bestaetigen('Zugang sperren', 'Sie werden sofort auf allen Geräten abgemeldet.', { bestaetigen: 'Sperren', gefaehrlich: true }))) return;
    await this.api.post('/api/konto/sperren', { bestaetigung: this.sperrText });
    this.sitzung.lokalBeenden();
    this.ui.info('Ihr Zugang wurde gesperrt.');
    this.router.navigate(['/anmelden']);
  }

  private async speichern(url: string, daten: any, meldung: string) {
    try {
      this.sitzung.setzen(await this.api.put(url, daten));
      this.ui.erfolg(meldung);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  benachrichtigungenSpeichern() {
    this.speichern('/api/konto/benachrichtigungen', this.bn, 'Ihre Benachrichtigungseinstellungen wurden gespeichert.');
  }

  darstellungSpeichern() {
    this.speichern('/api/konto/darstellung', this.ds, 'Die Darstellung wurde angepasst.');
  }

  datenschutzSpeichern() {
    this.speichern('/api/konto/datenschutz', this.dsp, 'Ihre Datenschutzpräferenzen wurden gespeichert.');
  }

  async kontoLoeschen(trotzdem = false): Promise<void> {
    if (!trotzdem && !(await this.ui.bestaetigen('Online-Konto löschen', 'Diese Aktion kann nicht rückgängig gemacht werden.', { bestaetigen: 'Endgültig löschen', gefaehrlich: true }))) return;
    try {
      await this.api.post('/api/konto/loeschen', { passwort: this.loeschPasswort, trotzdem });
      this.sitzung.lokalBeenden();
      this.ui.info('Ihr Online-Konto wurde gelöscht.');
      this.router.navigate(['/anmelden']);
    } catch (e: any) {
      if (e?.error?.code === 'OFFENE_VORGAENGE' && (await this.ui.bestaetigen('Offene Vorgänge', fehlertext(e) + ' Trotzdem löschen?', { bestaetigen: 'Trotzdem löschen', gefaehrlich: true }))) {
        return this.kontoLoeschen(true);
      }
      this.ui.fehler(fehlertext(e));
    }
  }
}
