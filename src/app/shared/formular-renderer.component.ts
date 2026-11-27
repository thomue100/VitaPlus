import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JsonForms } from '@jsonforms/angular';
import { ControlElement, createAjv, isVisible, JsonSchema, UISchemaElement } from '@jsonforms/core';
import type { ErrorObject } from 'ajv';
import { Anhang } from '../core/models';
import { fehlertext as serverFehlertext } from '../core/services/auth.interceptor';
import { Eingangsbestaetigung, FormularApi, FormularDefinition } from '../core/services/formular-api.service';
import { UiService } from '../core/services/ui.service';
import { SitzungService } from '../core/services/sitzung.service';
import { DEUTSCH } from './json-forms/fehlertexte';
import { VP_RENDERER } from './json-forms/vp-renderer';
import { pdfHerunterladen } from './pdf';
import { SymbolComponent } from './symbol.component';

interface Zeile { label: string; wert: string }

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Feldname, auf den sich ein Prüffehler bezieht (oberste Ebene). */
function feldVon(e: ErrorObject): string {
  const teile = e.instancePath.split('/').filter(Boolean);
  if (teile.length) return teile[0];
  return e.keyword === 'required' ? String((e.params as any).missingProperty) : '';
}

/**
 * Schritt-Assistent für Online-Anträge. Die Felder beschreibt der Formular-Service als JSON Schema / UI Schema,
 * die Darstellung übernimmt JSON Forms mit dem VitaPlus-Renderer-Set. Jeder Schritt wird vor dem Weitergehen
 * formal (Schema) und fachlich (Vorabprüfung im Backend) geprüft. Der aktuelle Schritt steht in der URL,
 * damit Vor und Zurück im Browser funktionieren.
 */
@Component({
  selector: 'vp-formular',
  imports: [FormsModule, RouterLink, JsonForms, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './formular-renderer.component.html',
})
export class FormularRendererComponent implements OnInit {
  private formularApi = inject(FormularApi);
  private ui = inject(UiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private sitzung = inject(SitzungService);

  readonly definition = input.required<FormularDefinition>();
  readonly startdaten = input<Record<string, any>>({});
  readonly startAnhaenge = input<Anhang[]>([]);
  readonly entwurfId = input<string | undefined>();
  readonly oeffentlich = input(false);
  readonly fertig = output<Eingangsbestaetigung>();

  readonly Math = Math;
  readonly renderer = VP_RENDERER;
  readonly i18n = DEUTSCH;
  readonly ajv = createAjv({ useDefaults: false });

  /** aktueller Schritt; Index = Anzahl der Schritte bedeutet „Prüfen & Absenden“ */
  readonly schritt = signal(0);
  readonly freigegeben = signal(0);
  readonly schrittDaten = signal<Record<string, any>>({});
  readonly fehlerZeigen = signal(false);
  readonly zusatzFehler = signal<ErrorObject[]>([]);
  readonly prueft = signal(false);
  readonly sendet = signal(false);
  readonly serverFehler = signal<string | null>(null);
  readonly hinweise = signal<string[]>([]);
  readonly voraussichtlich = signal<number | undefined>(undefined);
  readonly ergebnis = signal<Eingangsbestaetigung | null>(null);
  readonly versucht = signal(false);
  einwilligung = false;
  richtigkeit = false;

  private werte: Record<string, any> = {};
  private schemaFehler: ErrorObject[] = [];
  private geaendert = false;
  private fehlerNachWechsel = false;
  private speicherTimer?: ReturnType<typeof setTimeout>;
  readonly lokalerEntwurf = signal<{ werte: Record<string, any>; schritt: number; freigegeben: number; zeit: string } | null>(null);

  /** Schlüssel für die automatische Zwischenspeicherung im Browser */
  private get entwurfSchluessel() {
    return `vp_entwurf_${this.definition().code}_${this.sitzung.benutzer()?.id || 'gast'}`;
  }

  private entwurfPruefen() {
    if (this.entwurfId()) return;
    try {
      const e = JSON.parse(localStorage.getItem(this.entwurfSchluessel) || 'null');
      if (e && Date.now() - new Date(e.zeit).getTime() < 7 * 86400000 && Object.keys(e.werte || {}).length) this.lokalerEntwurf.set(e);
      else if (e) localStorage.removeItem(this.entwurfSchluessel);
    } catch { /* beschädigter Eintrag */ }
  }

  fortsetzen() {
    const e = this.lokalerEntwurf();
    if (!e) return;
    this.werte = { ...this.werte, ...e.werte };
    this.schrittDaten.set(this.werte);
    this.lokalerEntwurf.set(null);
    this.freigegeben.set(e.freigegeben);
    this.geaendert = true;
    this.navigieren(Math.min(e.schritt, this.anzahl() - 1));
    this.ui.info('Ihre Angaben wurden wiederhergestellt.');
  }

  neuBeginnen() {
    localStorage.removeItem(this.entwurfSchluessel);
    this.lokalerEntwurf.set(null);
  }

  private zwischenspeichern() {
    if (this.entwurfId() || this.ergebnis()) return;
    clearTimeout(this.speicherTimer);
    this.speicherTimer = setTimeout(() => {
      try {
        localStorage.setItem(this.entwurfSchluessel, JSON.stringify({ werte: this.werte, schritt: Math.min(this.schritt(), this.anzahl() - 1), freigegeben: this.freigegeben(), zeit: new Date().toISOString() }));
      } catch { /* Speicher voll */ }
    }, 400);
  }

  readonly anzahl = computed(() => this.definition().schritte.length);
  readonly zusammenfassung = computed(() => this.schritt() >= this.anzahl());
  readonly kategorie = computed(() => this.definition().uischema.elements[Math.min(this.schritt(), this.anzahl() - 1)]);
  readonly schrittUi = computed<UISchemaElement>(() => ({ type: 'VerticalLayout', elements: this.kategorie().elements } as UISchemaElement));
  readonly konfig = computed(() => ({ hideRequiredAsterisk: true, alleFehlerZeigen: this.fehlerZeigen() }));
  readonly fortschritt = computed(() => Math.round((Math.min(this.schritt(), this.anzahl()) / this.anzahl()) * 100));

  ngOnInit() {
    this.werte = { ...(this.definition().vorbelegung || {}), ...structuredClone(this.startdaten() || {}) };
    this.entwurfPruefen();
    const dateiFeld = this.dateiFelder()[0];
    if (dateiFeld && this.startAnhaenge().length && !this.werte[dateiFeld]) this.werte[dateiFeld] = [...this.startAnhaenge()];
    this.schrittDaten.set(this.werte);
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      const roh = q.get('schritt');
      const ziel = roh === 'pruefen' ? this.anzahl() : Math.max(1, Number(roh) || 1) - 1;
      this.wechseln(Math.min(ziel, this.freigegeben()));
    });
  }

  ungespeichert(): boolean {
    return this.geaendert && !this.ergebnis();
  }

  datenGeaendert(d: Record<string, any>) {
    if (d === this.werte) return;
    this.geaendert = true;
    this.werte = d;
    if (this.lokalerEntwurf()) this.lokalerEntwurf.set(null);
    this.zwischenspeichern();
    if (this.zusatzFehler().length) this.zusatzFehler.set([]);
  }

  schemaFehlerGemeldet(fehler: ErrorObject[] | undefined) {
    this.schemaFehler = fehler || [];
  }

  private wechseln(i: number) {
    if (i === this.schritt() && this.schrittDaten() === this.werte) return;
    this.schritt.set(i);
    this.schrittDaten.set(this.werte);
    this.fehlerZeigen.set(this.fehlerNachWechsel);
    if (this.fehlerNachWechsel) this.fokusAufFehler();
    else this.zusatzFehler.set([]);
    this.fehlerNachWechsel = false;
    this.versucht.set(false);
    this.serverFehler.set(null);
    window.scrollTo({ top: 0 });
  }

  private navigieren(i: number) {
    this.freigegeben.update(f => Math.max(f, i));
    if (this.geaendert) this.zwischenspeichern();
    const schritt = i >= this.anzahl() ? 'pruefen' : String(i + 1);
    this.router.navigate([], { relativeTo: this.route, queryParams: { schritt }, queryParamsHandling: 'merge' });
  }

  gehe(i: number) {
    if (i <= this.freigegeben()) this.navigieren(i);
  }

  zurueck() {
    if (this.schritt() > 0) this.navigieren(this.schritt() - 1);
  }

  /** Felder eines Schritts, die bei den aktuellen Angaben eingeblendet sind */
  private sichtbareFelder(i: number): string[] {
    const kat = this.definition().uischema.elements[i];
    return kat.elements
      .filter(e => e.type === 'Control' && isVisible(e, this.werte, '', this.ajv, undefined))
      .map(e => (e as ControlElement).scope.split('/').at(-1)!);
  }

  async weiter() {
    if (this.zusammenfassung()) return this.absenden();
    this.serverFehler.set(null);
    this.fehlerZeigen.set(true);
    const felder = this.sichtbareFelder(this.schritt());
    if (this.schemaFehler.some(e => felder.includes(feldVon(e)))) {
      this.fokusAufFehler();
      return;
    }
    this.prueft.set(true);
    try {
      const r = await this.formularApi.pruefen(this.definition().code, this.werte, this.schritt(), this.oeffentlich());
      if (!r.gueltig) {
        this.serverfehlerZeigen(r.fehler);
        return;
      }
      if (this.schritt() === this.anzahl() - 1) {
        this.hinweise.set(r.hinweise || []);
        this.voraussichtlich.set(r.betrag);
      }
      this.navigieren(this.schritt() + 1);
    } catch (e) {
      this.serverFehler.set(serverFehlertext(e));
    } finally {
      this.prueft.set(false);
    }
  }

  /** Fachliche Fehler aus dem Backend am Feld anzeigen und ggf. zum betroffenen Schritt springen */
  private serverfehlerZeigen(liste: { feld: string; meldung: string }[]) {
    const ohneFeld = liste.filter(f => !f.feld || !this.definition().schema.properties[f.feld]);
    this.zusatzFehler.set(liste.filter(f => f.feld && this.definition().schema.properties[f.feld]).map(f => ({
      instancePath: `/${f.feld}`, schemaPath: '#/fachlich', keyword: 'fachlich', params: {}, message: f.meldung,
    })));
    if (ohneFeld.length) this.serverFehler.set(ohneFeld.map(f => f.meldung).join(' '));
    const schritte = this.definition().schritte;
    const ziel = liste.map(f => schritte.findIndex(s => s.felder.includes(f.feld))).filter(i => i >= 0).sort((a, b) => a - b)[0];
    if (ziel !== undefined && ziel !== this.schritt()) {
      this.fehlerNachWechsel = true;
      this.navigieren(ziel);
    } else {
      this.fehlerZeigen.set(true);
      this.fokusAufFehler();
    }
  }

  private fokusAufFehler() {
    setTimeout(() => {
      const feld = document.querySelector('.feldfehler')?.closest('.feld');
      (feld?.querySelector('input,select,textarea,button') as HTMLElement | null)?.focus();
    }, 50);
  }

  private dateiFelder(): string[] {
    const props = this.definition().schema.properties;
    return Object.keys(props).filter(n => props[n].type === 'array' && props[n].items?.type === 'object' && !props[n].items?.properties);
  }

  private aufteilen() {
    const dateien = this.dateiFelder();
    const daten: Record<string, any> = {};
    const anhaenge: Anhang[] = [];
    for (const [k, v] of Object.entries(this.werte)) {
      if (dateien.includes(k)) anhaenge.push(...(v || []));
      else if (v !== undefined) daten[k] = v;
    }
    if (this.definition().einwilligung) daten['einwilligung'] = this.einwilligung;
    return { daten, anhaenge };
  }

  /** Zusammenfassung je Schritt aus Schema-Titeln und Anzeigewerten */
  zusammenfassungsBloecke(): { titel: string; index: number; zeilen: Zeile[] }[] {
    const props = this.definition().schema.properties;
    return this.definition().schritte.map((s, index) => ({
      titel: s.titel, index,
      zeilen: this.sichtbareFelder(index)
        .filter(n => !this.leer(this.werte[n]) && props[n])
        .map(n => ({ label: props[n].title, wert: this.anzeige(props[n], this.werte[n]) })),
    }));
  }

  private leer(w: any) {
    return w === undefined || w === null || w === '' || (Array.isArray(w) && !w.length);
  }

  private anzeige(s: JsonSchema & Record<string, any>, w: any): string {
    if (s.type === 'boolean') return w ? 'Ja' : 'Nein';
    if (s.oneOf) return (s.oneOf as any[]).find(o => o.const === w)?.title ?? String(w);
    if (s.type === 'number') return Number(w).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    if (s.type === 'array') {
      const items = s.items as any;
      if (items?.oneOf) return (w as string[]).map(x => items.oneOf.find((o: any) => o.const === x)?.title ?? x).join(', ');
      if (items?.properties) {
        return (w as any[]).map(e => Object.entries(items.properties).map(([k, sub]: [string, any]) => e?.[k] === undefined ? '' : this.anzeige(sub, e[k])).filter(Boolean).join(', ')).join(' · ');
      }
      return (w as Anhang[]).map(a => a.name).join(', ');
    }
    if (typeof w === 'string' && DATUM.test(w)) return w.split('-').reverse().join('.');
    return String(w);
  }

  async absenden() {
    this.versucht.set(true);
    if ((this.definition().einwilligung && !this.einwilligung) || !this.richtigkeit) return;
    this.sendet.set(true);
    this.serverFehler.set(null);
    try {
      const { daten, anhaenge } = this.aufteilen();
      const r = this.entwurfId()
        ? await this.formularApi.entwurfEinreichen(this.entwurfId()!, daten, anhaenge)
        : await this.formularApi.einreichen(this.definition().code, daten, anhaenge, this.oeffentlich());
      this.ergebnis.set(r);
      this.geaendert = false;
      clearTimeout(this.speicherTimer);
      localStorage.removeItem(this.entwurfSchluessel);
      this.fertig.emit(r);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      const details: { feld: string; meldung: string }[] = e?.error?.details || (e?.error?.feld ? [{ feld: e.error.feld, meldung: e.error.detail || e.error.meldung }] : []);
      if (details.length) this.serverfehlerZeigen(details);
      else this.serverFehler.set(serverFehlertext(e));
    } finally {
      this.sendet.set(false);
    }
  }

  async entwurfSpeichern() {
    this.sendet.set(true);
    try {
      const { daten, anhaenge } = this.aufteilen();
      const r = await this.formularApi.entwurfSpeichern(this.definition().code, this.entwurfId(), daten, anhaenge);
      this.geaendert = false;
      this.ui.erfolg('Ihr Entwurf wurde gespeichert. Sie finden ihn unter „Anträge“.');
      if (!this.entwurfId()) this.fertig.emit({ ...r, entwurf: true });
    } catch (e) {
      this.ui.fehler(serverFehlertext(e));
    } finally {
      this.sendet.set(false);
    }
  }

  zeitText(iso: string) {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr';
  }

  eingangsbestaetigungHerunterladen() {
    const e = this.ergebnis();
    const d = this.definition();
    if (!e) return;
    const a = d.antragsteller;
    const zeilen = [
      ...(a ? [`Antragsteller/in: ${a.name}`, `Versichertennummer: ${a.versichertennummer}`, `Anschrift: ${a.anschrift}`, ''] : []),
      `Vorgangsnummer: ${e.vorgangsnummer}`,
      `Eingegangen am: ${new Date().toLocaleString('de-DE')}`,
      `Zuständig: Team ${d.zustaendig}`,
      '',
      ...this.zusammenfassungsBloecke().flatMap(b => [b.titel.toUpperCase(), ...b.zeilen.map(z => `${z.label}: ${z.wert}`), '']),
      'Diese Bestätigung wurde maschinell erstellt und ist ohne Unterschrift gültig.',
    ];
    pdfHerunterladen(`Eingangsbestätigung – ${d.titel}`, zeilen, `Eingangsbestaetigung_${e.vorgangsnummer}.pdf`);
  }
}
