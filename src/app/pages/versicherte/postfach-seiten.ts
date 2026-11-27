import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Anhang, Nachricht, Ordner } from '../../core/models';
import { fehlertext } from '../../core/services/auth.interceptor';
import { HatUngespeicherteAenderungen } from '../../core/services/guards';
import { NachrichtDetail, PostfachApi } from '../../core/services/service-api.service';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { DateienComponent, FeldfehlerComponent } from '../../shared/bausteine';
import { DateigroessePipe, DatumPipe } from '../../shared/pipes';
import { pdfHerunterladen } from '../../shared/pdf';
import { serverfehlerSetzen } from '../../shared/validatoren';
import { SymbolComponent } from '../../shared/symbol.component';

const ORDNER: [Ordner, string][] = [['EINGANG', 'Posteingang'], ['GESENDET', 'Gesendet'], ['ARCHIV', 'Archiv'], ['PAPIERKORB', 'Papierkorb']];
export const KATEGORIEN: Record<string, string> = { ALLGEMEIN: 'Allgemeine Anfrage', LEISTUNG: 'Leistungen', BEITRAG: 'Beiträge', MITGLIEDSCHAFT: 'Mitgliedschaft', BONUS: 'Bonusprogramm', BESCHWERDE: 'Beschwerde', SYSTEM: 'Systemnachricht' };

@Component({
  selector: 'vp-postfach',
  imports: [FormsModule, RouterLink, DatumPipe, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Postfach</h1><p class="leise">Sichere Kommunikation mit der VitaPlus</p></div><a class="btn primaer" routerLink="/postfach/neu">Neue Nachricht</a></div>
    <nav class="reiter" aria-label="Ordner">
      @for (o of ordnerListe; track o[0]) { <button type="button" [class.aktiv]="ordner() === o[0]" (click)="wechseln(o[0])">{{ o[1] }} @if (zaehler()[o[0]]) { <span class="klein leise">({{ zaehler()[o[0]] }})</span> }</button> }
    </nav>
    <div class="filterleiste">
      <div class="feld" style="flex:1"><label for="pf-suche">Nachrichten durchsuchen</label><input id="pf-suche" type="search" [(ngModel)]="suche" (ngModelChange)="laden()" /></div>
      <label class="auswahl"><input type="checkbox" [(ngModel)]="nurUngelesen" (ngModelChange)="laden()" /> nur ungelesene</label>
      @if (ordner() === 'PAPIERKORB' && liste().length) { <button class="btn gefahr klein" type="button" (click)="leeren()">Papierkorb leeren</button> }
    </div>
    @if (ordner() === 'PAPIERKORB') { <p class="klein leise">Nachrichten im Papierkorb werden nach 30 Tagen automatisch endgültig gelöscht.</p> }
    <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle">
      <thead><tr><th scope="col"><span class="sr-only">Markierung</span></th><th>{{ ordner() === 'GESENDET' ? 'An' : 'Von' }}</th><th>Betreff</th><th>Datum</th></tr></thead>
      <tbody>
        @for (n of liste(); track n.id) {
          <tr class="klickbar" [class.ungelesen]="!n.gelesen" (click)="oeffnen(n)" (keydown.enter)="oeffnen(n)" tabindex="0">
            <td class="symbolspalte">@if (n.wichtig) { <span title="Wichtig" class="wichtig"><vp-symbol name="circle-alert" [groesse]="16" /></span> }@if (n.anhaenge.length) { <span title="Mit Anhang"><vp-symbol name="paperclip" [groesse]="16" /></span> }</td>
            <td>{{ ordner() === 'GESENDET' ? n.empfaenger : n.absender }}</td>
            <td>{{ n.betreff }}<br /><span class="klein leise">{{ n.text }}…</span></td>
            <td class="nowrap">{{ n.datum | datum }}</td></tr>
        } @empty { <tr><td colspan="4" class="leer"><img class="leer-bild" src="bilder/leer-postfach.svg" alt="" width="280" height="190" />Keine Nachrichten in diesem Ordner.</td></tr> }
      </tbody></table></div>`,
})
export class PostfachComponent implements OnInit {
  private api = inject(PostfachApi);
  private router = inject(Router);
  private ui = inject(UiService);
  readonly ordnerListe = ORDNER;
  readonly ordner = signal<Ordner>('EINGANG');
  readonly liste = signal<Nachricht[]>([]);
  readonly zaehler = signal<Record<string, number>>({});
  suche = '';
  nurUngelesen = false;

  ngOnInit() {
    const gespeichert = sessionStorage.getItem('vp_postfach_ordner') as Ordner | null;
    if (gespeichert) this.ordner.set(gespeichert);
    this.laden();
  }

  wechseln(o: Ordner) {
    this.ordner.set(o);
    sessionStorage.setItem('vp_postfach_ordner', o);
    this.laden();
  }

  async laden() {
    const [l, z] = await Promise.all([this.api.liste(this.ordner(), this.suche, this.nurUngelesen), this.api.zaehlerAktualisieren()]);
    this.liste.set(l);
    this.zaehler.set(z);
  }

  oeffnen(n: Nachricht) {
    this.router.navigate(['/postfach', n.id]);
  }

  async leeren() {
    if (!(await this.ui.bestaetigen('Papierkorb leeren', 'Alle Nachrichten im Papierkorb werden endgültig gelöscht.', { bestaetigen: 'Endgültig löschen', gefaehrlich: true }))) return;
    const r = await this.api.papierkorbLeeren();
    this.ui.erfolg(`${r.geloescht} Nachricht(en) gelöscht.`);
    this.laden();
  }
}

@Component({
  selector: 'vp-nachricht',
  imports: [RouterLink, DatumPipe, DateigroessePipe, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/postfach">Postfach</a> › Nachricht</p>
    @if (n(); as n) {
      <article class="karte">
        <div class="zeile"><h1 style="font-size:1.4rem">{{ n.betreff }}</h1>@if (n.wichtig) { <span class="badge rot">wichtig</span> }</div>
        <p class="leise klein">Von {{ n.absender }} an {{ n.empfaenger }} · {{ n.datum | datum: true }} · {{ kategorien[n.kategorie] }}</p>
        <div class="text">{{ n.text }}</div>
        @if (n.anhaenge.length) {
          <h2>Anhänge</h2>
          <ul class="liste-ohne">@for (a of n.anhaenge; track a.id) { <li><vp-symbol name="file-text" [groesse]="16" /> <button class="btn link" type="button" (click)="anhang(a)">{{ a.name }}</button> <span class="klein leise">({{ a.groesseBytes | groesse }})</span></li> }</ul>
        }
        @if (n.vorgangId) { <p><a [routerLink]="['/vorgaenge', n.vorgangId]">Zum zugehörigen Vorgang</a></p> }
        <div class="aktionen">
          @if (n.kategorie !== 'SYSTEM' && n.ordner !== 'GESENDET') { <a class="btn primaer" routerLink="/postfach/neu" [queryParams]="{ antwort: n.id }">Antworten</a> }
          <button class="btn" type="button" (click)="ungelesen()">Als ungelesen markieren</button>
          <button class="btn" type="button" (click)="wichtig()">{{ n.wichtig ? 'Markierung entfernen' : 'Als wichtig markieren' }}</button>
          @if (n.ordner !== 'ARCHIV') { <button class="btn" type="button" (click)="verschieben('ARCHIV')">Archivieren</button> }
          @if (n.ordner === 'PAPIERKORB' || n.ordner === 'ARCHIV') { <button class="btn" type="button" (click)="verschieben(n.absender === name ? 'GESENDET' : 'EINGANG')">Wiederherstellen</button> }
          <button class="btn" type="button" (click)="drucken()">Drucken</button>
          <button class="btn gefahr" type="button" (click)="loeschen()">{{ n.ordner === 'PAPIERKORB' ? 'Endgültig löschen' : 'Löschen' }}</button>
        </div>
      </article>
      @if (n.verlauf.length) {
        <h2>Verlauf</h2>
        @for (v of n.verlauf; track v.id) { <article class="karte"><p class="leise klein">{{ v.absender }} · {{ v.datum | datum: true }}</p><p class="fett">{{ v.betreff }}</p><div class="text">{{ v.text }}</div></article> }
      }
    } @else if (fehler()) { <div class="hinweis fehler">{{ fehler() }}</div> }`,
  styles: [`.text{white-space:pre-line;margin:1rem 0}`],
})
export class NachrichtComponent implements OnInit {
  private api = inject(PostfachApi);
  private router = inject(Router);
  private ui = inject(UiService);
  private sitzung = inject(SitzungService);
  readonly id = input.required<string>();
  readonly n = signal<NachrichtDetail | null>(null);
  readonly fehler = signal<string | null>(null);
  readonly kategorien = KATEGORIEN;
  name = '';

  async ngOnInit() {
    const b = this.sitzung.benutzer()!;
    this.name = [b.titel, b.vorname, b.nachname].filter(Boolean).join(' ');
    try {
      this.n.set(await this.api.detail(this.id()));
    } catch (e) {
      this.fehler.set(fehlertext(e));
    }
  }

  anhang(a: Anhang) {
    const n = this.n()!;
    pdfHerunterladen(a.name.replace(/\.\w+$/, '').replace(/_/g, ' '), [n.betreff, '', ...n.text.split('\n')], a.name.endsWith('.pdf') ? a.name : a.name + '.pdf');
  }

  async ungelesen() {
    await this.api.aendern(this.id(), { gelesen: false });
    await this.api.zaehlerAktualisieren();
    this.router.navigate(['/postfach']);
  }

  async wichtig() {
    const r = await this.api.aendern(this.id(), { wichtig: !this.n()!.wichtig });
    this.n.update(n => (n ? { ...n, wichtig: r.wichtig } : n));
  }

  async verschieben(ordner: Ordner) {
    try {
      await this.api.aendern(this.id(), { ordner });
      this.ui.erfolg('Die Nachricht wurde verschoben.');
      this.router.navigate(['/postfach']);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  drucken() {
    window.print();
  }

  async loeschen() {
    const endgueltig = this.n()!.ordner === 'PAPIERKORB';
    if (endgueltig && !(await this.ui.bestaetigen('Endgültig löschen', 'Die Nachricht kann danach nicht wiederhergestellt werden.', { bestaetigen: 'Löschen', gefaehrlich: true }))) return;
    try {
      const r = await this.api.loeschen(this.id());
      this.ui.erfolg(r.verschoben ? 'Die Nachricht wurde in den Papierkorb verschoben.' : 'Die Nachricht wurde gelöscht.');
      this.router.navigate(['/postfach']);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}

@Component({
  selector: 'vp-nachricht-schreiben',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent, DateienComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/postfach">Postfach</a> › Neue Nachricht</p>
    <h1>{{ antwortAuf() ? 'Antworten' : 'Neue Nachricht' }}</h1>
    <form class="karte formular" [formGroup]="form" (ngSubmit)="senden()" novalidate>
      <div class="feldgruppe">
        <div class="feld breit"><label for="nm-kat" class="pflicht">Thema</label>
          <select id="nm-kat" formControlName="kategorie"><option value="">Bitte wählen</option>
            @for (k of themen; track k[0]) { <option [value]="k[0]">{{ k[1] }}</option> }</select>
          <vp-feldfehler [control]="form.controls.kategorie" />
          @if (form.value.kategorie === 'BESCHWERDE') { <span class="hilfe">Ihre Nachricht wird direkt an unser Beschwerdemanagement weitergeleitet. Für die Nachverfolgung nutzen Sie auch das <a routerLink="/antraege/neu/BESCHWERDE">Beschwerdeformular</a>.</span> }</div>
        <div class="feld breit"><label for="nm-betreff" class="pflicht">Betreff</label><input id="nm-betreff" formControlName="betreff" maxlength="100" /><vp-feldfehler [control]="form.controls.betreff" /></div>
        <div class="feld breit"><label for="nm-text" class="pflicht">Ihre Nachricht</label><textarea id="nm-text" formControlName="text" maxlength="2000" rows="8"></textarea>
          <span class="zaehler">{{ form.value.text?.length || 0 }} / 2000</span><vp-feldfehler [control]="form.controls.text" /></div>
        <div class="breit"><vp-dateien label="Anhänge" [max]="3" [(dateien)]="anhaenge" /></div>
      </div>
      @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }
      <div class="aktionen"><button class="btn primaer" type="submit" [disabled]="sendet()">Senden</button><a routerLink="/postfach">Abbrechen</a></div>
    </form>`,
})
export class NachrichtSchreibenComponent implements OnInit, HatUngespeicherteAenderungen {
  private api = inject(PostfachApi);
  private router = inject(Router);
  private ui = inject(UiService);
  private fb = inject(FormBuilder);
  readonly antwortAuf = input<string>(undefined, { alias: 'antwort' });
  readonly anhaenge = signal<Anhang[]>([]);
  readonly fehler = signal<string | null>(null);
  readonly sendet = signal(false);
  readonly themen = Object.entries(KATEGORIEN).filter(([k]) => k !== 'SYSTEM');
  private gesendet = false;
  form = this.fb.nonNullable.group({
    kategorie: ['', Validators.required], betreff: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
    text: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
  });

  async ngOnInit() {
    if (this.antwortAuf()) {
      const n = await this.api.detail(this.antwortAuf()!);
      this.form.patchValue({ kategorie: n.kategorie === 'SYSTEM' ? 'ALLGEMEIN' : n.kategorie, betreff: n.betreff.startsWith('AW:') ? n.betreff : `AW: ${n.betreff}`.substring(0, 100) });
    }
  }

  ungespeichert() {
    return !this.gesendet && this.form.dirty;
  }

  async senden() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.sendet.set(true);
    try {
      await this.api.senden({ ...this.form.getRawValue(), anhaenge: this.anhaenge(), antwortAufId: this.antwortAuf() });
      this.gesendet = true;
      this.ui.erfolg('Ihre Nachricht wurde gesendet. Eine Eingangsbestätigung finden Sie im Posteingang.');
      this.router.navigate(['/postfach']);
    } catch (e) {
      if (!serverfehlerSetzen(this.form, e)) this.fehler.set(fehlertext(e));
    } finally {
      this.sendet.set(false);
    }
  }
}
