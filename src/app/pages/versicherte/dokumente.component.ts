import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DokumentAnforderung, Nachricht, Vorgang } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { DokumentApi, DokumentTyp } from '../../core/services/service-api.service';
import { UiService } from '../../core/services/ui.service';
import { FamilieApi, FamilienEintrag } from '../../core/services/versicherten-api.service';
import { heuteIso } from '../../core/util/datum';
import { DatumPipe } from '../../shared/pipes';
import { pdfHerunterladen } from '../../shared/pdf';
import { SymbolComponent } from '../../shared/symbol.component';

interface ArchivEintrag { datum: string; titel: string; kategorie: 'BESCHEINIGUNG' | 'BESCHEID' | 'UPLOAD' | 'INFORMATION'; quelle: string; link?: any[]; aktion?: () => void }

import { anhangOeffner } from '../../shared/dokumente/anhang-oeffnen';
import { DatumEingabeComponent } from '../../shared/datum-eingabe.component';
@Component({
  selector: 'vp-dokumente',
  imports: [DatumEingabeComponent, FormsModule, RouterLink, DatumPipe, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Dokumente & Bescheinigungen</h1><p class="leise">Bescheinigungen sofort als PDF – und alle Ihre Dokumente an einem Ort</p></div></div>
    <nav class="reiter"><button type="button" [class.aktiv]="reiter() === 'neu'" (click)="reiter.set('neu')">Bescheinigung anfordern</button>
      <button type="button" [class.aktiv]="reiter() === 'archiv'" (click)="reiter.set('archiv')">Dokumentenarchiv</button>
      <button type="button" [class.aktiv]="reiter() === 'uploads'" (click)="reiter.set('uploads')">Von mir hochgeladen</button></nav>

    @switch (reiter()) {
      @case ('neu') {
        <div class="raster">
          @for (t of typen(); track t.typ) {
            <button type="button" class="kachel" [class.deaktiviert]="!t.verfuegbar" [class.gewaehlt]="gewaehlt()?.typ === t.typ" (click)="waehlen(t)" [disabled]="!t.verfuegbar">
              <span class="titel">{{ t.bezeichnung }}</span><br /><span class="klein leise">{{ t.verfuegbar ? t.beschreibung : 'Für Sie nicht verfügbar' }}</span></button>
          }
        </div>
        @if (gewaehlt(); as t) {
          <form class="karte formular mt" (ngSubmit)="erstellen()">
            <h2>{{ t.bezeichnung }}</h2>
            <div class="feldgruppe">
              @switch (t.typ) {
                @case ('FAMILIENVERSICHERUNG') { <div class="feld"><label for="d-fam" class="pflicht">Für</label><select id="d-fam" name="fam" [(ngModel)]="p['familienmitgliedId']">
                  @for (f of familie(); track f.id) { <option [value]="f.id">{{ f.vorname }} {{ f.nachname }}</option> }</select></div> }
                @case ('ARBEITGEBER') {
                  <div class="feld"><label for="d-ag" class="pflicht">Arbeitgeber</label><input id="d-ag" name="ag" [(ngModel)]="p['arbeitgeber']" /></div>
                  <div class="feld"><label for="d-beginn" class="pflicht">Beschäftigungsbeginn</label><vp-datum id="d-beginn" name="beginn" [(ngModel)]="p['beschaeftigungsbeginn']" /></div> }
                @case ('STUDIUM') {
                  <div class="feld"><label for="d-hs" class="pflicht">Hochschule</label><input id="d-hs" name="hs" [(ngModel)]="p['hochschule']" /></div>
                  <div class="feld"><label for="d-sem" class="pflicht">Semester</label><input id="d-sem" name="sem" [(ngModel)]="p['semester']" placeholder="WiSe 2026/27" /></div> }
                @case ('BEITRAGSBESCHEINIGUNG') { <div class="feld"><label for="d-jahr" class="pflicht">Jahr</label><select id="d-jahr" name="jahr" [(ngModel)]="p['jahr']">
                  @for (j of beitragsjahre; track j) { <option [value]="j">{{ j }}</option> }</select></div> }
                @case ('EHIC') {
                  <div class="feld"><label for="d-land" class="pflicht">Reiseland</label><select id="d-land" name="land" [(ngModel)]="p['land']"><option value="">Bitte wählen</option>
                    @for (l of euLaender(); track l) { <option [value]="l">{{ l }}</option> }</select></div>
                  <div class="feld"><label for="d-von" class="pflicht">Reisebeginn</label><vp-datum id="d-von" name="von" [(ngModel)]="p['von']" /></div>
                  <div class="feld"><label for="d-bis" class="pflicht">Reiseende</label><vp-datum id="d-bis" name="bis" [(ngModel)]="p['bis']" /></div> }
                @default { <p class="breit">Die Bescheinigung wird mit Ihren aktuellen Daten erstellt.</p> }
              }
            </div>
            <div class="aktionen"><button class="btn primaer" type="submit">PDF erstellen und herunterladen</button></div>
          </form>
        }
      }
      @case ('archiv') {
        <div class="filterleiste">
          <div class="feld"><label for="ar-suche">Suche</label><input id="ar-suche" type="search" [(ngModel)]="suche" /></div>
          <div class="feld"><label for="ar-kat">Kategorie</label><select id="ar-kat" [(ngModel)]="kategorie"><option value="">Alle</option>
            <option value="BESCHEINIGUNG">Bescheinigungen</option><option value="BESCHEID">Bescheide</option><option value="INFORMATION">Informationen</option></select></div>
          <div class="feld"><label for="ar-von">Von</label><vp-datum id="ar-von" [(ngModel)]="von" /></div>
          <div class="feld"><label for="ar-bis">Bis</label><vp-datum id="ar-bis" [(ngModel)]="bis" /></div>
          <button class="btn" type="button" (click)="exportieren()">Auswahl exportieren</button>
          <button class="btn link" type="button" (click)="drucken()">Liste drucken</button>
        </div>
        <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle"><thead><tr><th>Datum</th><th>Dokument</th><th>Kategorie</th><th>Herkunft</th><th></th></tr></thead><tbody>
          @for (d of gefiltert(); track $index) {
            <tr><td>{{ d.datum | datum }}</td><td>{{ d.titel }}</td><td>{{ kategorien[d.kategorie] }}</td><td class="klein">{{ d.quelle }}</td>
              <td>@if (d.link) { <a [routerLink]="d.link">Öffnen</a> } @if (d.aktion) { <button class="btn link klein" type="button" (click)="d.aktion!()">PDF</button> }</td></tr>
          } @empty { <tr><td colspan="5" class="leer">Keine Dokumente gefunden.</td></tr> }
        </tbody></table></div>
        <details class="faq mt"><summary>Wie lange werden meine Dokumente aufbewahrt?</summary>
          <p>Bescheide und Bescheinigungen stehen Ihnen mindestens 4 Jahre zur Verfügung, Beitragsbescheide 10 Jahre. Gelöschte Nachrichten entfernen wir nach 30 Tagen aus dem Papierkorb. Danach gelten die gesetzlichen Aufbewahrungsfristen (§ 304 SGB V).</p></details>
      }
      @case ('uploads') {
        <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle"><thead><tr><th>Hochgeladen</th><th>Datei</th><th>Vorgang</th><th>Status</th></tr></thead><tbody>
          @for (u of uploads(); track u.datei + u.vorgang.id) { <tr><td>{{ u.datum | datum: true }}</td><td><vp-symbol name="file-text" [groesse]="16" /> <button type="button" class="btn link" (click)="anhangOeffnen(u.anhang, u.vorgang.vorgangsnummer)">{{ u.datei }}</button></td><td><a [routerLink]="['/vorgaenge', u.vorgang.id]">{{ u.vorgang.vorgangsnummer }}</a></td><td class="klein">Eingang bestätigt</td></tr> }
          @empty { <tr><td colspan="4" class="leer">Sie haben noch keine Dokumente hochgeladen.</td></tr> }
        </tbody></table></div>
      }
    }`,
  styles: [`button.kachel{text-align:left;font:inherit;cursor:pointer}.gewaehlt{border-color:var(--vp-primaer);background:var(--vp-primaer-hell)}`],
})
export class DokumenteComponent implements OnInit {
  readonly anhangOeffnen = anhangOeffner();
  private dokApi = inject(DokumentApi);
  private famApi = inject(FamilieApi);
  private api = inject(Api);
  private ui = inject(UiService);
  readonly reiter = signal<'neu' | 'archiv' | 'uploads'>('neu');
  readonly typen = signal<DokumentTyp[]>([]);
  readonly euLaender = signal<string[]>([]);
  readonly historie = signal<DokumentAnforderung[]>([]);
  readonly familie = signal<FamilienEintrag[]>([]);
  readonly vorgaenge = signal<Vorgang[]>([]);
  readonly nachrichten = signal<Nachricht[]>([]);
  readonly gewaehlt = signal<DokumentTyp | null>(null);
  readonly kategorien: Record<string, string> = { BESCHEINIGUNG: 'Bescheinigung', BESCHEID: 'Bescheid', UPLOAD: 'Upload', INFORMATION: 'Information' };
  readonly beitragsjahre = [1, 2, 3, 4].map(i => String(new Date().getFullYear() - i));
  p: Record<string, string> = {};
  suche = '';
  kategorie = '';
  von = '';
  bis = '';

  readonly archiv = computed<ArchivEintrag[]>(() => [
    ...this.historie().map(h => ({ datum: h.angefordertAm, titel: h.bezeichnung, kategorie: 'BESCHEINIGUNG' as const, quelle: 'Online angefordert', aktion: () => this.erneut(h) })),
    ...this.nachrichten().filter(n => n.anhaenge.length).flatMap(n => n.anhaenge.map(a => ({
      datum: n.datum, titel: a.name, kategorie: (/bescheid/i.test(a.name + n.betreff) ? 'BESCHEID' : 'INFORMATION') as ArchivEintrag['kategorie'], quelle: `Postfach: ${n.betreff}`, link: ['/postfach', n.id],
    }))),
  ].sort((a, b) => b.datum.localeCompare(a.datum)));

  readonly uploads = computed(() => this.vorgaenge().flatMap(v => v.anhaenge.map(a => ({ datum: a.hochgeladenAm, datei: a.name, vorgang: v, anhang: a }))).sort((a, b) => b.datum.localeCompare(a.datum)));

  async ngOnInit() {
    const [d, f, v, n] = await Promise.all([this.dokApi.laden(), this.famApi.liste(), this.api.get<Vorgang[]>('/api/vorgaenge'), this.api.get<Nachricht[]>('/api/nachrichten', { ordner: 'EINGANG' })]);
    this.typen.set(d.typen);
    this.euLaender.set(d.euLaender);
    this.historie.set(d.historie);
    this.familie.set(f.filter(x => x.status === 'AKTIV'));
    this.vorgaenge.set(v);
    this.nachrichten.set(n);
  }

  gefiltert() {
    const q = this.suche.toLowerCase();
    return this.archiv().filter(d => (!this.kategorie || d.kategorie === this.kategorie) && (!q || (d.titel + d.quelle).toLowerCase().includes(q)) &&
      (!this.von || d.datum >= this.von) && (!this.bis || d.datum.substring(0, 10) <= this.bis));
  }

  waehlen(t: DokumentTyp) {
    this.gewaehlt.set(t);
    this.p = t.typ === 'BEITRAGSBESCHEINIGUNG' ? { jahr: this.beitragsjahre[0] } : t.typ === 'FAMILIENVERSICHERUNG' ? { familienmitgliedId: this.familie()[0]?.id || '' } : t.typ === 'EHIC' ? { von: heuteIso() } : {};
  }

  async erstellen() {
    try {
      const r = await this.dokApi.erstellen(this.gewaehlt()!.typ, this.p);
      pdfHerunterladen(r.titel, r.zeilen, r.dateiname);
      this.ui.erfolg('Ihr Dokument wurde erstellt.');
      this.historie.set((await this.dokApi.laden()).historie);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  async erneut(h: DokumentAnforderung) {
    if (h.typ === 'EEB' || h.typ === 'PATIENTENQUITTUNG') {
      pdfHerunterladen(h.bezeichnung, Object.entries(h.parameter).map(([k, v]) => `${k}: ${v}`), h.dateiname);
      return;
    }
    try {
      const r = await this.dokApi.erstellen(h.typ, h.parameter);
      pdfHerunterladen(r.titel, r.zeilen, h.dateiname);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  exportieren() {
    const l = this.gefiltert();
    if (!l.length) return;
    pdfHerunterladen('Dokumentenübersicht', l.map(d => `${new DatumPipe().transform(d.datum)}  ${this.kategorien[d.kategorie]}  ${d.titel}  (${d.quelle})`), `Dokumente_${heuteIso()}.pdf`);
  }

  drucken() {
    window.print();
  }
}
