import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FeldDef, FormularDef } from '../core/formulare/formular-typen';
import { istSichtbar, pruefeFeld } from '../core/formulare/formular-pruefung';
import { Anhang } from '../core/models';
import { Api } from '../core/services/api.service';
import { fehlertext } from '../core/services/auth.interceptor';
import { UiService } from '../core/services/ui.service';
import { DateienComponent } from './bausteine';
import { DatumPipe, EuroPipe } from './pipes';

interface Auswahl { wert: string; text: string }

@Component({
  selector: 'vp-formular',
  imports: [FormsModule, RouterLink, DateienComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (ergebnis(); as e) {
      <div class="karte hervor" role="status">
        <h2>{{ e.status === 'GENEHMIGT' ? 'Erledigt!' : 'Vielen Dank – Ihr Antrag ist eingegangen' }}</h2>
        <p>Ihre Vorgangsnummer: <strong>{{ e.vorgangsnummer }}</strong></p>
        @if (e.status === 'GENEHMIGT') { <p>Ihr Anliegen wurde direkt bearbeitet.</p> }
        @else if (e.status === 'IN_BEARBEITUNG') { <p>Ihr Antrag wird bereits bearbeitet.</p> }
        @else { <p>Wir prüfen Ihren Antrag und informieren Sie über Ihr Postfach.</p> }
        @for (h of e.hinweise || []; track h) { <div class="hinweis info">{{ h }}</div> }
        <div class="aktionen">
          @if (e.id && !oeffentlich()) { <a class="btn primaer" [routerLink]="['/vorgaenge', e.id]">Zum Vorgang</a> }
          @if (!oeffentlich()) { <a class="btn" routerLink="/antraege">Weitere Anträge</a> }
          @else { <a class="btn" routerLink="/anmelden">Zur Anmeldung</a> }
        </div>
      </div>
    } @else {
      <ol class="schritte" aria-label="Fortschritt">
        @for (s of def().schritte; track s.titel; let i = $index) {
          <li [class.aktiv]="i === schritt()" [class.erledigt]="i < schritt()" [attr.aria-current]="i === schritt() ? 'step' : null">{{ s.titel }}</li>
        }
        <li [class.aktiv]="zusammenfassung()">Prüfen & Absenden</li>
      </ol>

      @if (def().hinweis && schritt() === 0 && !zusammenfassung()) { <div class="hinweis info">{{ def().hinweis }}</div> }

      <form class="karte formular" (ngSubmit)="weiter()" novalidate>
        @if (!zusammenfassung()) {
          @let s = def().schritte[schritt()];
          <h2>{{ s.titel }}</h2>
          @if (s.beschreibung) { <p class="leise">{{ s.beschreibung }}</p> }
          <div class="feldgruppe">
            @for (f of s.felder; track f.name) {
              @if (sichtbar(f)) {
                <div class="feld" [class.breit]="f.breit || f.typ === 'textarea' || f.typ === 'mehrfach' || f.typ === 'radio' || f.typ === 'checkbox' || f.typ === 'info'">
                  @switch (f.typ) {
                    @case ('info') { <div class="hinweis info">{{ f.label }}</div> }
                    @case ('checkbox') {
                      <label class="auswahl"><input type="checkbox" [name]="f.name" [(ngModel)]="werte[f.name]" (ngModelChange)="geaendert(f)" />
                        <span [class.pflicht]="f.pflicht">{{ f.label }}</span></label>
                    }
                    @case ('radio') {
                      <fieldset><legend [class.pflicht]="f.pflicht">{{ f.label }}</legend>
                        <div class="auswahlgruppe">
                          @for (o of f.optionen; track o.wert) {
                            <label class="auswahl"><input type="radio" [name]="f.name" [value]="o.wert" [(ngModel)]="werte[f.name]" (ngModelChange)="geaendert(f)" /> {{ o.text }}</label>
                          }
                        </div></fieldset>
                    }
                    @case ('mehrfach') {
                      <fieldset><legend [class.pflicht]="f.pflicht">{{ f.label }}</legend>
                        <div class="auswahlgruppe">
                          @for (o of f.optionen; track o.wert) {
                            <label class="auswahl"><input type="checkbox" [checked]="(werte[f.name] || []).includes(o.wert)" (change)="umschalten(f, o.wert)" /> {{ o.text }}</label>
                          }
                        </div></fieldset>
                    }
                    @case ('datei') {
                      <vp-dateien [label]="f.label" [pflicht]="!!f.pflicht" [max]="f.maxDateien || 5" [hilfe]="f.hilfe" [(dateien)]="anhaenge" />
                    }
                    @default {
                      <label [for]="'f-' + f.name" [class.pflicht]="f.pflicht">{{ f.label }}</label>
                      @switch (f.typ) {
                        @case ('textarea') {
                          <textarea [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" [attr.maxlength]="f.maxLaenge" (blur)="beruehrt(f)"></textarea>
                          @if (f.maxLaenge) { <span class="zaehler">{{ (werte[f.name] || '').length }} / {{ f.maxLaenge }}</span> }
                        }
                        @case ('auswahl') {
                          <select [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" (ngModelChange)="geaendert(f)" (blur)="beruehrt(f)">
                            <option [ngValue]="undefined">Bitte wählen</option>
                            @for (o of f.optionen; track o.wert) { <option [ngValue]="o.wert">{{ o.text }}</option> }
                          </select>
                        }
                        @case ('person') {
                          <select [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" (blur)="beruehrt(f)">
                            <option [ngValue]="undefined">Bitte wählen</option>
                            @for (o of personen(); track o.wert) { <option [ngValue]="o.wert">{{ o.text }}</option> }
                          </select>
                        }
                        @case ('kind') {
                          <select [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" (blur)="beruehrt(f)">
                            <option [ngValue]="undefined">Bitte wählen</option>
                            @for (o of angehoerige(); track o.wert) { <option [ngValue]="o.wert">{{ o.text }}</option> }
                          </select>
                          @if (!angehoerige().length) { <span class="hilfe">Es sind keine Familienangehörigen mitversichert.</span> }
                        }
                        @case ('vorgang') {
                          <select [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" (blur)="beruehrt(f)">
                            <option [ngValue]="undefined">{{ f.pflicht ? 'Bitte wählen' : 'Kein Bezug' }}</option>
                            @for (o of vorgangsOptionen(f); track o.wert) { <option [ngValue]="o.wert">{{ o.text }}</option> }
                          </select>
                        }
                        @case ('datum') { <input type="date" [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" (blur)="beruehrt(f)" /> }
                        @case ('zahl') { <input type="number" [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" [min]="f.min ?? null" [max]="f.max ?? null" step="1" (blur)="beruehrt(f)" /> }
                        @case ('betrag') { <input type="number" [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" step="0.01" min="0" inputmode="decimal" (blur)="beruehrt(f)" /> }
                        @case ('email') { <input type="email" [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" autocomplete="email" (blur)="beruehrt(f)" /> }
                        @case ('telefon') { <input type="tel" [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" autocomplete="tel" (blur)="beruehrt(f)" /> }
                        @default { <input type="text" [id]="'f-' + f.name" [name]="f.name" [(ngModel)]="werte[f.name]" [placeholder]="f.platzhalter || ''" [attr.maxlength]="f.maxLaenge" (blur)="beruehrt(f)" /> }
                      }
                      @if (f.hilfe) { <span class="hilfe">{{ f.hilfe }}</span> }
                    }
                  }
                  @if (fehler()[f.name] && (angefasst[f.name] || versucht())) { <span class="feldfehler" role="alert">{{ fehler()[f.name] }}</span> }
                </div>
              }
            }
          </div>
        } @else {
          <h2>Bitte prüfen Sie Ihre Angaben</h2>
          <dl class="daten">
            @for (z of zusammenfassungsZeilen(); track z.label) { <dt>{{ z.label }}</dt><dd>{{ z.wert }}</dd> }
            @if (anhaenge().length) { <dt>Unterlagen</dt><dd>{{ dateinamen() }}</dd> }
          </dl>
          @if (def().einwilligung) {
            <label class="auswahl mt"><input type="checkbox" name="einwilligung" [(ngModel)]="werte['einwilligung']" /> <span class="pflicht">{{ def().einwilligung }}</span></label>
            @if (versucht() && !werte['einwilligung']) { <span class="feldfehler" role="alert">Bitte bestätigen Sie die Erklärung.</span> }
          }
          <label class="auswahl mt"><input type="checkbox" name="richtigkeit" [(ngModel)]="richtigkeit" /> <span class="pflicht">Ich versichere, dass meine Angaben vollständig und richtig sind.</span></label>
          @if (versucht() && !richtigkeit) { <span class="feldfehler" role="alert">Bitte bestätigen Sie die Richtigkeit Ihrer Angaben.</span> }
        }
        @if (serverFehler()) { <div class="hinweis fehler" role="alert">{{ serverFehler() }}</div> }
        <div class="aktionen">
          @if (schritt() > 0 || zusammenfassung()) { <button type="button" class="btn" (click)="zurueck()">Zurück</button> }
          <button type="submit" class="btn primaer" [disabled]="sendet()">{{ zusammenfassung() ? (sendet() ? 'Wird gesendet …' : 'Verbindlich absenden') : 'Weiter' }}</button>
          @if (def().entwurfErlaubt && !oeffentlich()) { <button type="button" class="btn link" (click)="entwurfSpeichern()" [disabled]="sendet()">Entwurf speichern und später fortsetzen</button> }
        </div>
      </form>
    }`,
})
export class FormularRendererComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);

  readonly def = input.required<FormularDef>();
  readonly startdaten = input<Record<string, any>>({});
  readonly startAnhaenge = input<Anhang[]>([]);
  readonly entwurfId = input<string | undefined>();
  readonly oeffentlich = input(false);
  readonly fertig = output<any>();

  werte: Record<string, any> = {};
  angefasst: Record<string, boolean> = {};
  richtigkeit = false;
  readonly anhaenge = signal<Anhang[]>([]);
  readonly schritt = signal(0);
  readonly zusammenfassung = signal(false);
  readonly versucht = signal(false);
  readonly sendet = signal(false);
  readonly serverFehler = signal<string | null>(null);
  readonly ergebnis = signal<any>(null);
  readonly personen = signal<Auswahl[]>([]);
  readonly angehoerige = signal<Auswahl[]>([]);
  private vorgaenge = signal<{ id: string; vorgangsnummer: string; titel: string; status: string }[]>([]);
  private serverfeldfehler = signal<Record<string, string>>({});
  private geaendertSeitStart = false;
  readonly dateinamen = computed(() => this.anhaenge().map(a => a.name).join(', '));

  async ngOnInit() {
    this.werte = { ...this.startdaten() };
    this.anhaenge.set([...this.startAnhaenge()]);
    if (this.oeffentlich()) return;
    const felder = this.def().schritte.flatMap(s => s.felder);
    if (felder.some(f => f.typ === 'person' || f.typ === 'kind')) {
      const p = await this.api.get<{ id: string; name: string }[]>('/api/erstattung/personen');
      this.personen.set(p.map(x => ({ wert: x.id, text: x.id === 'SELBST' ? `${x.name} (ich)` : x.name })));
      this.angehoerige.set(p.filter(x => x.id !== 'SELBST').map(x => ({ wert: x.id, text: x.name })));
    }
    if (felder.some(f => f.typ === 'vorgang')) this.vorgaenge.set(await this.api.get('/api/vorgaenge'));
  }

  ungespeichert(): boolean {
    return this.geaendertSeitStart && !this.ergebnis();
  }

  sichtbar(f: FeldDef) {
    return istSichtbar(f, this.werte);
  }

  vorgangsOptionen(f: FeldDef): Auswahl[] {
    return this.vorgaenge().filter(v => !f.vorgangFilter?.status || f.vorgangFilter.status.includes(v.status))
      .map(v => ({ wert: v.id, text: `${v.vorgangsnummer} – ${v.titel}` }));
  }

  fehler(): Record<string, string> {
    const r: Record<string, string> = { ...this.serverfeldfehler() };
    if (this.zusammenfassung()) return r;
    for (const f of this.def().schritte[this.schritt()].felder) {
      const wert = f.typ === 'datei' ? this.anhaenge() : this.werte[f.name];
      const m = pruefeFeld(f, wert, this.werte);
      if (m) r[f.name] = m;
    }
    return r;
  }

  beruehrt(f: FeldDef) {
    this.angefasst[f.name] = true;
    this.geaendertSeitStart = true;
  }

  geaendert(f: FeldDef) {
    this.beruehrt(f);
    const { [f.name]: _, ...rest } = this.serverfeldfehler();
    this.serverfeldfehler.set(rest);
  }

  umschalten(f: FeldDef, wert: string) {
    const l: string[] = this.werte[f.name] || [];
    this.werte[f.name] = l.includes(wert) ? l.filter(x => x !== wert) : [...l, wert];
    this.geaendert(f);
  }

  zusammenfassungsZeilen() {
    const zeilen: { label: string; wert: string }[] = [];
    for (const s of this.def().schritte) {
      for (const f of s.felder) {
        if (f.typ === 'info' || f.typ === 'datei' || !this.sichtbar(f)) continue;
        const w = this.werte[f.name];
        if (w === undefined || w === null || w === '' || (Array.isArray(w) && !w.length)) continue;
        zeilen.push({ label: f.label, wert: this.anzeige(f, w) });
      }
    }
    return zeilen;
  }

  private anzeige(f: FeldDef, w: any): string {
    switch (f.typ) {
      case 'checkbox': return w ? 'Ja' : 'Nein';
      case 'datum': return new DatumPipe().transform(w);
      case 'betrag': return new EuroPipe().transform(Number(w));
      case 'auswahl':
      case 'radio': return f.optionen?.find(o => o.wert === String(w))?.text || String(w);
      case 'mehrfach': return (w as string[]).map(x => f.optionen?.find(o => o.wert === x)?.text || x).join(', ');
      case 'person': return this.personen().find(p => p.wert === w)?.text || w;
      case 'kind': return this.angehoerige().find(p => p.wert === w)?.text || w;
      case 'vorgang': return this.vorgangsOptionen(f).find(p => p.wert === w)?.text || w;
      default: return String(w);
    }
  }

  zurueck() {
    this.versucht.set(false);
    this.serverFehler.set(null);
    if (this.zusammenfassung()) this.zusammenfassung.set(false);
    else this.schritt.update(s => Math.max(0, s - 1));
    window.scrollTo({ top: 0 });
  }

  weiter() {
    this.serverFehler.set(null);
    if (this.zusammenfassung()) {
      this.absenden();
      return;
    }
    if (Object.keys(this.fehler()).length) {
      this.versucht.set(true);
      setTimeout(() => (document.querySelector('.feldfehler')?.closest('.feld')?.querySelector('input,select,textarea') as HTMLElement | null)?.focus());
      return;
    }
    this.versucht.set(false);
    if (this.schritt() < this.def().schritte.length - 1) this.schritt.update(s => s + 1);
    else this.zusammenfassung.set(true);
    window.scrollTo({ top: 0 });
  }

  private datenOhneDateien() {
    const d = { ...this.werte };
    for (const f of this.def().schritte.flatMap(s => s.felder)) if (f.typ === 'datei') delete d[f.name];
    return d;
  }

  async absenden() {
    if ((this.def().einwilligung && !this.werte['einwilligung']) || !this.richtigkeit) {
      this.versucht.set(true);
      return;
    }
    this.sendet.set(true);
    try {
      let r: any;
      const daten = this.datenOhneDateien();
      if (this.oeffentlich()) r = await this.api.post(`/api/oeffentlich/formulare/${this.def().code}`, { daten, anhaenge: this.anhaenge() });
      else if (this.entwurfId()) r = await this.api.put(`/api/antraege/${this.entwurfId()}`, { daten, anhaenge: this.anhaenge(), einreichen: true });
      else r = await this.api.post('/api/antraege', { typ: this.def().code, daten, anhaenge: this.anhaenge(), entwurf: false });
      this.ergebnis.set(r);
      this.fertig.emit(r);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      const details: { feld: string; meldung: string }[] = e?.error?.details || (e?.error?.feld ? [{ feld: e.error.feld, meldung: e.error.meldung }] : []);
      const felder = this.def().schritte.map(s => s.felder.map(f => f.name));
      const ersterSchritt = details.map(d => felder.findIndex(l => l.includes(d.feld))).filter(i => i >= 0).sort()[0];
      if (ersterSchritt !== undefined) {
        this.serverfeldfehler.set(Object.fromEntries(details.map(d => [d.feld, d.meldung])));
        this.zusammenfassung.set(false);
        this.schritt.set(ersterSchritt);
        this.versucht.set(true);
      }
      this.serverFehler.set(fehlertext(e));
    } finally {
      this.sendet.set(false);
    }
  }

  async entwurfSpeichern() {
    this.sendet.set(true);
    try {
      if (this.entwurfId()) await this.api.put(`/api/antraege/${this.entwurfId()}`, { daten: this.datenOhneDateien(), anhaenge: this.anhaenge(), einreichen: false });
      else {
        const r = await this.api.post('/api/antraege', { typ: this.def().code, daten: this.datenOhneDateien(), anhaenge: this.anhaenge(), entwurf: true });
        this.ergebnis.set(null);
        this.fertig.emit({ ...r, entwurf: true });
      }
      this.geaendertSeitStart = false;
      this.ui.erfolg('Ihr Entwurf wurde gespeichert. Sie finden ihn unter „Anträge“.');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    } finally {
      this.sendet.set(false);
    }
  }
}
