import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { VORGANG_TYP_TEXT } from '../../core/konfiguration';
import { formular } from '../../core/formulare/formular-katalog';
import { Anhang, Vorgang } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { VorgangApi } from '../../core/services/vorgang-api.service';
import { addMonate, addTage, heute, parseIso, toIso } from '../../core/util/datum';
import { DateienComponent, StatusComponent } from '../../shared/bausteine';
import { DateigroessePipe, DatumPipe, EuroPipe, StatusTextPipe, TypTextPipe } from '../../shared/pipes';
import { pdfHerunterladen } from '../../shared/pdf';
import { SymbolComponent } from '../../shared/symbol.component';

@Component({
  selector: 'vp-vorgaenge',
  imports: [FormsModule, RouterLink, StatusComponent, DatumPipe, EuroPipe, TypTextPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Meine Vorgänge</h1><p class="leise">Alle Anträge und Meldungen mit aktuellem Bearbeitungsstand</p></div><a class="btn primaer" routerLink="/antraege">Neuer Antrag</a></div>
    <div class="filterleiste">
      <div class="feld"><label for="vg-status">Status</label><select id="vg-status" [(ngModel)]="filter.status" (ngModelChange)="laden()">
        <option value="OFFEN">Offen</option><option value="ABGESCHLOSSEN">Abgeschlossen</option><option value="RUECKFRAGE">Mit Rückfrage</option><option value="">Alle</option></select></div>
      <div class="feld"><label for="vg-typ">Art</label><select id="vg-typ" [(ngModel)]="filter.typ" (ngModelChange)="laden()"><option value="">Alle</option>
        @for (t of typen(); track t) { <option [value]="t">{{ t | typText }}</option> }</select></div>
      <div class="feld"><label for="vg-jahr">Jahr</label><select id="vg-jahr" [(ngModel)]="filter.jahr" (ngModelChange)="laden()"><option value="">Alle</option>
        @for (j of jahre; track j) { <option [value]="j">{{ j }}</option> }</select></div>
      <label class="auswahl"><input type="checkbox" [(ngModel)]="archivZeigen" /> archivierte anzeigen</label>
    </div>
    <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle">
      <thead><tr><th>Vorgang</th><th>Art</th><th>Eingereicht</th><th>Zuletzt geändert</th><th class="betrag">Betrag</th><th>Status</th></tr></thead>
      <tbody>
        @for (v of sichtbar(); track v.id) {
          <tr class="klickbar" (click)="oeffnen(v)" (keydown.enter)="oeffnen(v)" tabindex="0">
            <td><strong>{{ v.titel }}</strong><br /><span class="klein leise">{{ v.vorgangsnummer }}</span></td><td>{{ v.typ | typText }}</td>
            <td>{{ v.erstelltAm | datum }}</td><td>{{ v.geaendertAm | datum }}</td>
            <td class="betrag">{{ v.betragErstattet !== undefined ? (v.betragErstattet | euro) : v.betragBeantragt ? (v.betragBeantragt | euro) : '' }}</td>
            <td><vp-status [wert]="v.status" />@if (v.archiviert) { <span class="badge">archiviert</span> }</td></tr>
        } @empty { <tr><td colspan="6" class="leer">Keine Vorgänge gefunden.</td></tr> }
      </tbody></table></div>`,
})
export class VorgaengeComponent implements OnInit {
  private api = inject(VorgangApi);
  private router = inject(Router);
  readonly liste = signal<Vorgang[]>([]);
  readonly typen = signal<string[]>([]);
  readonly jahre = [2026, 2025, 2024].map(String);
  filter = { status: 'OFFEN', typ: '', jahr: '' };
  archivZeigen = false;

  async ngOnInit() {
    const alle = await this.api.liste();
    this.typen.set(Array.from(new Set(alle.map(v => v.typ))).sort((a, b) => (VORGANG_TYP_TEXT[a] || a).localeCompare(VORGANG_TYP_TEXT[b] || b)));
    if (!alle.some(v => ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE', 'ENTWURF'].includes(v.status))) this.filter.status = '';
    this.laden();
  }

  async laden() {
    this.liste.set(await this.api.liste(this.filter));
  }

  sichtbar() {
    return this.liste().filter(v => this.archivZeigen || !v.archiviert);
  }

  oeffnen(v: Vorgang) {
    this.router.navigate(v.status === 'ENTWURF' ? ['/antraege/entwurf', v.id] : ['/vorgaenge', v.id]);
  }
}

@Component({
  selector: 'vp-vorgang',
  imports: [FormsModule, RouterLink, StatusComponent, DateienComponent, DatumPipe, EuroPipe, TypTextPipe, StatusTextPipe, DateigroessePipe, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/vorgaenge">Meine Vorgänge</a> › {{ v()?.vorgangsnummer }}</p>
    @if (v(); as v) {
      <div class="seitenkopf"><div><h1>{{ v.titel }}</h1><p class="leise">{{ v.typ | typText }} · Vorgangsnummer {{ v.vorgangsnummer }}</p></div><vp-status [wert]="v.status" /></div>

      @if (v.status === 'RUECKFRAGE') {
        <section class="karte hervor" style="border-left-color: var(--vp-akzent)">
          <h2>Wir benötigen noch Unterlagen von Ihnen</h2>
          <p>{{ v.rueckfrage }}</p>
          @if (v.rueckfrageFrist) { <p class="klein">Bitte antworten Sie bis <strong>{{ v.rueckfrageFrist | datum }}</strong>.</p> }
          <div class="feld mb"><label for="nr-text">Ihre Antwort</label><textarea id="nr-text" [(ngModel)]="antwort" rows="3" maxlength="1000"></textarea></div>
          <vp-dateien label="Unterlagen nachreichen" [max]="5" [(dateien)]="nachreichung" />
          <div class="aktionen"><button class="btn primaer" type="button" (click)="nachreichen()">Absenden</button></div>
        </section>
      }
      @if (v.status === 'ABGELEHNT' && v.ablehnungsgrund) { <div class="hinweis fehler"><strong>Begründung der Ablehnung:</strong> {{ v.ablehnungsgrund }}</div> }

      <div class="raster-2">
        <section class="karte">
          <h2>Angaben</h2>
          <dl class="daten">
            <dt>Eingereicht am</dt><dd>{{ v.erstelltAm | datum: true }}</dd>
            <dt>Zuständig</dt><dd>Team {{ v.zustaendig || 'Leistungen' }}</dd>
            @if (offen() && v.fristBis) { <dt>Voraussichtlich erledigt bis</dt><dd>{{ v.fristBis | datum }}</dd> }
            @if (v.betragBeantragt) { <dt>Beantragt</dt><dd>{{ v.betragBeantragt | euro }}</dd> }
            @if (v.betragErstattet !== undefined) { <dt>{{ v.status === 'AUSGEZAHLT' ? 'Ausgezahlt' : 'Bewilligt' }}</dt><dd class="fett">{{ v.betragErstattet | euro }}</dd> }
            @if (v.bescheidAm) { <dt>Bescheid vom</dt><dd>{{ v.bescheidAm | datum }}</dd> }
            @for (z of angaben(); track z[0]) { <dt>{{ z[0] }}</dt><dd>{{ z[1] }}</dd> }
          </dl>
          @if (v.anhaenge.length) {
            <h3>Eingereichte Unterlagen</h3>
            <ul class="liste-ohne">@for (a of v.anhaenge; track a.id) { <li class="klein"><vp-symbol name="file-text" [groesse]="15" /> {{ a.name }} <span class="leise">({{ a.groesseBytes | groesse }}, {{ a.hochgeladenAm | datum }})</span></li> }</ul>
          }
        </section>
        <section class="karte">
          <h2>Bearbeitungsverlauf</h2>
          <ul class="zeitleiste">@for (h of verlauf(); track $index) { <li><strong>{{ h.status | statusText }}</strong> · <span class="klein leise">{{ h.zeitpunkt | datum: true }}</span><br />{{ h.text }}<br /><span class="klein leise">{{ h.von }}</span></li> }</ul>
        </section>
      </div>
      <div class="aktionen">
        @if (v.status === 'EINGEREICHT' || v.status === 'RUECKFRAGE') { @if (v.typ !== 'ARBEITSUNFAEHIGKEIT') { <button class="btn gefahr" type="button" (click)="zurueckziehen()">Antrag zurückziehen</button> } }
        @if (widerspruchMoeglich()) { <a class="btn" routerLink="/antraege/neu/WIDERSPRUCH">Widerspruch einlegen (bis {{ widerspruchsfrist() | datum }})</a> }
        @if (v.bescheidAm) { <button class="btn" type="button" (click)="bescheid()">Bescheid herunterladen</button> }
        @if (!offen()) { <button class="btn" type="button" (click)="archivieren()">{{ v.archiviert ? 'Aus Archiv holen' : 'Archivieren' }}</button> }
        <a class="btn link" routerLink="/postfach/neu">Frage zum Vorgang stellen</a>
        <button class="btn link" type="button" (click)="drucken()">Drucken</button>
      </div>
    } @else if (fehler()) { <div class="hinweis fehler">{{ fehler() }}</div> } @else { <p class="lade">Wird geladen …</p> }`,
})
export class VorgangComponent implements OnInit {
  private api = inject(VorgangApi);
  private gApi = inject(Api);
  private ui = inject(UiService);
  private sitzung = inject(SitzungService);
  readonly id = input.required<string>();
  readonly v = signal<Vorgang | null>(null);
  readonly fehler = signal<string | null>(null);
  readonly nachreichung = signal<Anhang[]>([]);
  antwort = '';

  readonly offen = computed(() => ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE'].includes(this.v()?.status || ''));
  readonly verlauf = computed(() => [...(this.v()?.historie || [])].reverse());
  readonly widerspruchsfrist = computed(() => {
    const v = this.v();
    if (!v) return null;
    return toIso(addTage(addMonate(parseIso(v.bescheidAm || v.geaendertAm), 1), 3));
  });
  readonly widerspruchMoeglich = computed(() => {
    const v = this.v();
    return !!v && v.typ !== 'WIDERSPRUCH' && ['ABGELEHNT', 'TEILWEISE_GENEHMIGT'].includes(v.status) && parseIso(this.widerspruchsfrist()!) >= heute();
  });
  readonly angaben = computed(() => {
    const v = this.v();
    if (!v) return [];
    const def = formular(v.typ);
    const zeilen: [string, string][] = [];
    const label = (k: string) => def?.schritte.flatMap(s => s.felder).find(f => f.name === k)?.label;
    const versteckt = ['anhaenge', 'einwilligung', 'patientId', 'familienmitgliedId', 'vorgaengerId', 'notizen', 'bezugVorgangId', 'erinnert', 'neueKarteId', 'karteId', 'verstorbenerBenutzerId'];
    for (const [k, w] of Object.entries(v.daten)) {
      if (versteckt.includes(k) || w === null || w === undefined || w === '' || typeof w === 'object') continue;
      const l = label(k) || ANZEIGE[k];
      if (!l) continue;
      zeilen.push([l, typeof w === 'boolean' ? (w ? 'Ja' : 'Nein') : /^\d{4}-\d{2}-\d{2}$/.test(String(w)) ? new DatumPipe().transform(String(w)) : String(w)]);
    }
    return zeilen.slice(0, 14);
  });

  async ngOnInit() {
    try {
      this.v.set(await this.api.detail(this.id()));
    } catch (e) {
      this.fehler.set(fehlertext(e));
    }
  }

  async nachreichen() {
    try {
      this.v.set(await this.api.nachreichen(this.id(), this.antwort, this.nachreichung()));
      this.ui.erfolg('Vielen Dank! Wir setzen die Bearbeitung fort.');
      this.nachreichung.set([]);
      this.antwort = '';
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async zurueckziehen() {
    if (!(await this.ui.bestaetigen('Antrag zurückziehen', 'Möchten Sie den Antrag wirklich zurückziehen? Er wird dann nicht weiter bearbeitet.', { bestaetigen: 'Zurückziehen', gefaehrlich: true }))) return;
    try {
      this.v.set(await this.api.stornieren(this.id()));
      this.ui.erfolg('Der Antrag wurde zurückgezogen.');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async archivieren() {
    try {
      this.v.set(await this.gApi.post(`/api/vorgaenge/${this.id()}/archivieren`));
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  bescheid() {
    const v = this.v()!;
    const b = this.sitzung.benutzer()!;
    const d = new DatumPipe();
    const e = new EuroPipe();
    const zeilen = [`${[b.titel, b.vorname, b.nachname].filter(Boolean).join(' ')}`, `${b.adresse.strasse} ${b.adresse.hausnummer}`, `${b.adresse.plz} ${b.adresse.ort}`, '',
      `Vorgang ${v.vorgangsnummer} vom ${d.transform(v.erstelltAm)} – ${v.titel}`, `Bescheid vom ${d.transform(v.bescheidAm)}`, '',
      v.status === 'ABGELEHNT' ? 'Wir müssen Ihren Antrag leider ablehnen.' : 'Wir haben Ihrem Antrag entsprochen.',
      ...(v.ablehnungsgrund ? ['', `Begründung: ${v.ablehnungsgrund}`] : []),
      ...(v.betragErstattet !== undefined ? ['', `Bewilligter Betrag: ${e.transform(v.betragErstattet)}`] : []),
      '', 'Rechtsbehelfsbelehrung', 'Gegen diesen Bescheid kann innerhalb eines Monats nach Bekanntgabe Widerspruch erhoben werden. Der Widerspruch ist schriftlich, zur Niederschrift oder elektronisch über die Online-Geschäftsstelle bei der VitaPlus Krankenkasse einzulegen.'];
    pdfHerunterladen('Bescheid', zeilen, `Bescheid_${v.vorgangsnummer}.pdf`);
  }

  drucken() {
    window.print();
  }
}

const ANZEIGE: Record<string, string> = {
  leistung: 'Leistung', rechnungsdatum: 'Rechnungsdatum', rechnungsnummer: 'Rechnungsnummer', leistungserbringer: 'Leistungserbringer', patient: 'Patient/in',
  von: 'Von', bis: 'Bis', arzt: 'Arzt/Ärztin', tage: 'Tage', kettenTage: 'Tage gesamt', personName: 'Person', voraussichtlich: 'Voraussichtliche Erstattung (€)',
  festzuschussProzent: 'Festzuschuss (%)', festzuschuss: 'Festzuschuss (€)', weitergeleitetAn: 'Weitergeleitet an', erstattung: 'Erstattung (€)', erstattbar: 'Erstattungsfähig (€)',
  zuschuss: 'Zuschuss (€)', endeZum: 'Mitgliedschaft endet zum', rate: 'Monatliche Rate (€)', schutzfristBeginn: 'Schutzfrist ab', schutzfristEnde: 'Schutzfrist bis',
  freischaltcode: 'Freischaltcode', digaName: 'Anwendung', grenze: 'Belastungsgrenze (€)', bezugVorgangsnummer: 'Bezug', fristEnde: 'Widerspruchsfrist bis',
  kindName: 'Kind', verspaetet: 'Verspätet gemeldet', krankengeld: 'Krankengeldfall', reiseziel: 'Reiseziel', sitzungen: 'Sitzungen', gebuehr: 'Gebühr (€)',
};
