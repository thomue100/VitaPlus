import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AusgehendeNachricht } from '../core/models';
import { Api } from '../core/services/api.service';
import { fehlertext } from '../core/services/auth.interceptor';
import { UiService } from '../core/services/ui.service';
import { SymbolComponent } from '../shared/symbol.component';

/**
 * Demo-Umgebung: zeigt, was die Kasse per E-Mail, SMS oder Brief „versendet“ hat
 * (Sicherheitscodes, Links zum Zurücksetzen des Passworts, Aktivierungscodes, Mitgliedsbestätigungen).
 */
@Component({
  selector: 'vp-postausgang',
  imports: [SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <button type="button" class="postausgang-knopf" (click)="umschalten()" [attr.aria-expanded]="offen()" aria-controls="postausgang-liste"
      title="Demo-Umgebung: Hier landen E-Mails, SMS und Briefe, die an Sie verschickt werden.">
      <vp-symbol name="mail" [groesse]="18" /> <span class="text">Demo: E-Mail, SMS &amp; Testdaten</span>
      @if (ungelesen()) { <span class="zaehlpunkt">{{ ungelesen() }}</span> }
    </button>
    @if (offen()) {
      <section id="postausgang-liste" class="postausgang-panel" role="dialog" aria-label="Demo-Postfach für E-Mail, SMS und Briefe">
        <header><strong>Demo-Umgebung</strong><button type="button" class="btn link klein" (click)="offen.set(false)" aria-label="Schließen"><vp-symbol name="x" [groesse]="18" /></button></header>
        <nav class="demo-reiter" role="tablist">
          <button type="button" role="tab" [attr.aria-selected]="reiter() === 'post'" [class.aktiv]="reiter() === 'post'" (click)="reiter.set('post')">E-Mail &amp; SMS @if (ungelesen()) { ({{ ungelesen() }}) }</button>
          <button type="button" role="tab" [attr.aria-selected]="reiter() === 'test'" [class.aktiv]="reiter() === 'test'" (click)="reiter.set('test'); statusLaden()">Testdaten</button>
        </nav>
        @if (reiter() === 'test') {
          <section class="werkzeuge">
            <h3>Hintergrundverarbeitung</h3>
            <p class="klein leise">Anträge werden nach kurzer Zeit automatisch bearbeitet. Mit dem Zeitraffer vergeht für alle offenen Vorgänge sofort eine Stunde.</p>
            @if (status(); as st) { <p class="klein">{{ st.inVerarbeitung }} Vorgang/Vorgänge in Bearbeitung · {{ st.auszahlungOffen }} Auszahlung(en) ausstehend</p> }
            <button type="button" class="btn klein" (click)="zeitraffer()" [disabled]="beschaeftigt()"><vp-symbol name="clock" [groesse]="16" /> Eine Stunde vorspulen</button>

            <h3>Testfälle vorbereiten</h3>
            @if (status()?.rolle === 'VERSICHERTER') {
              <p class="klein leise">Legt für den angemeldeten Versicherten einen passenden Vorgang an.</p>
              <div class="werkzeug-liste">
                <button type="button" class="btn klein" (click)="szenario('RUECKFRAGE')" [disabled]="beschaeftigt()">Offene Rückfrage (Unterlagen nachreichen)</button>
                <button type="button" class="btn klein" (click)="szenario('ABLEHNUNG')" [disabled]="beschaeftigt()">Ablehnung (Widerspruch möglich)</button>
                <button type="button" class="btn klein" (click)="szenario('AUSZAHLUNG')" [disabled]="beschaeftigt()">Teilerstattung vor Auszahlung</button>
              </div>
            } @else { <p class="klein leise">Melden Sie sich als Versicherte/r an, um Testfälle vorzubereiten.</p> }

            <h3>Störung simulieren</h3>
            <label class="auswahl klein"><input type="checkbox" [checked]="status()?.stoerung" (change)="stoerung($any($event.target).checked)" /> Antragsannahme und Uploads sind „nicht erreichbar“ (HTTP 503)</label>

            <h3>Zurücksetzen</h3>
            <p class="klein leise">Stellt alle Testdaten, Testkonten und Vorgänge auf den Ausgangszustand zurück. Sie werden dabei abgemeldet.</p>
            <button type="button" class="btn klein gefahr" (click)="zuruecksetzen()" [disabled]="beschaeftigt()"><vp-symbol name="refresh-cw" [groesse]="16" /> Testdaten zurücksetzen</button>
          </section>
        } @else {
        <p class="leise klein">Nachrichten, die die VitaPlus per E-Mail, SMS oder Post verschickt, erscheinen hier.</p>
        @for (n of liste(); track n.id) {
          <article class="ausgang" [class.neu]="!n.gelesen">
            <div class="ausgang-kopf">
              <span class="kanal" [attr.data-kanal]="n.kanal"><vp-symbol [name]="n.kanal === 'SMS' ? 'smartphone' : n.kanal === 'BRIEF' ? 'scroll-text' : 'mail'" [groesse]="16" />
                {{ n.kanal === 'EMAIL' ? 'E-Mail' : n.kanal === 'SMS' ? 'SMS' : 'Brief' }}</span>
              <span class="leise klein">{{ zeit(n.zeitpunkt) }}</span>
            </div>
            <p class="klein leise an">an {{ n.an }}</p>
            <h3>{{ n.betreff }}</h3>
            <p class="ausgang-text">{{ n.text }}</p>
            @if (n.link) { <button type="button" class="btn primaer klein" (click)="oeffnen(n)">{{ n.link.text }}</button> }
          </article>
        } @empty { <p class="leise">Noch keine Nachrichten.</p> }
        }
      </section>
    }`,
  styles: [`
    :host { position: fixed; right: 1rem; bottom: 4.6rem; z-index: 650; display: flex; flex-direction: column; align-items: flex-end; }
    .postausgang-knopf { display: inline-flex; align-items: center; gap: .4rem; border: 1px dashed #8aa3a0; background: #fffdf4; color: #4c5a58; border-radius: 999px; padding: .5rem .9rem;
      font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(16,40,44,.12); position: relative; }
    .postausgang-knopf .zaehlpunkt { position: absolute; top: -.4rem; left: -.4rem; }
    .postausgang-panel { position: absolute; right: 0; bottom: 3rem; width: min(420px, calc(100vw - 2rem)); max-height: min(70vh, 640px); overflow: auto; background: #fff;
      border: 1px solid var(--vp-rand); border-radius: 14px; box-shadow: 0 12px 36px rgba(16,40,44,.22); padding: 1rem; }
    header { display: flex; justify-content: space-between; align-items: center; }
    .ausgang { border: 1px solid var(--vp-rand); border-radius: 10px; padding: .75rem .9rem; margin-top: .6rem; }
    .ausgang.neu { border-color: var(--vp-primaer); background: #f4fbf9; }
    .ausgang-kopf { display: flex; justify-content: space-between; align-items: center; }
    .kanal { display: inline-flex; gap: .3rem; align-items: center; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--vp-primaer); }
    .kanal[data-kanal='SMS'] { color: #7c5cc4; } .kanal[data-kanal='BRIEF'] { color: #b26a00; }
    .an { margin: .15rem 0 0; }
    h3 { font-size: 1rem; margin: .3rem 0; }
    .ausgang-text { white-space: pre-line; font-size: .9rem; margin: 0 0 .6rem; }
    .demo-reiter { display: flex; gap: .25rem; border-bottom: 1px solid var(--vp-rand); margin: .5rem 0 .25rem; }
    .demo-reiter button { background: none; border: none; border-bottom: 3px solid transparent; padding: .4rem .6rem; font: inherit; font-weight: 600; color: var(--vp-text-leise); cursor: pointer; }
    .demo-reiter button.aktiv { color: var(--vp-primaer); border-bottom-color: var(--vp-primaer); }
    .werkzeuge h3 { font-size: .95rem; margin: 1rem 0 .25rem; }
    .werkzeuge p { margin: .2rem 0 .5rem; }
    .werkzeug-liste { display: flex; flex-direction: column; gap: .35rem; align-items: flex-start; }
    .btn.gefahr { border-color: var(--vp-fehler); color: var(--vp-fehler); }
    @media (max-width: 640px) { .postausgang-knopf .text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); } }
  `],
})
export class PostausgangComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private ui = inject(UiService);
  readonly offen = signal(false);
  readonly reiter = signal<'post' | 'test'>('post');
  readonly status = signal<{ stoerung: boolean; inVerarbeitung: number; auszahlungOffen: number; rolle?: string } | null>(null);
  readonly beschaeftigt = signal(false);
  readonly liste = signal<AusgehendeNachricht[]>([]);
  readonly ungelesen = computed(() => this.liste().filter(n => !n.gelesen).length);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.laden();
    this.timer = setInterval(() => this.laden(), 5000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  async laden() {
    try {
      this.liste.set(await this.api.get<AusgehendeNachricht[]>('/api/demo/postausgang'));
    } catch {
      /* nicht kritisch */
    }
  }

  async umschalten() {
    this.offen.update(o => !o);
    // Beim Öffnen sofort aktualisieren, damit gerade verschickte Codes schon sichtbar sind
    if (this.offen()) await this.laden();
    if (this.offen() && this.ungelesen()) {
      await this.api.post('/api/demo/postausgang/gelesen').catch(() => undefined);
      setTimeout(() => this.laden(), 4000);
    }
  }

  async statusLaden() {
    try { this.status.set(await this.api.get('/api/demo/status')); } catch { /* ignorieren */ }
  }

  async zeitraffer() {
    this.beschaeftigt.set(true);
    try {
      const r = await this.api.post<{ schritte: number }>('/api/demo/zeitraffer');
      this.ui.erfolg(r.schritte ? 'Eine Stunde ist vergangen – offene Vorgänge wurden weiterbearbeitet.' : 'Eine Stunde ist vergangen. Es gab nichts weiterzubearbeiten.');
      await this.statusLaden();
      this.neuLadenNachAktion();
    } finally { this.beschaeftigt.set(false); }
  }

  async szenario(code: string) {
    this.beschaeftigt.set(true);
    try {
      const r = await this.api.post<{ vorgangId: string; vorgangsnummer: string }>('/api/demo/szenario', { code });
      this.ui.erfolg(`Testfall ${r.vorgangsnummer} angelegt.`);
      this.offen.set(false);
      this.router.navigate(['/vorgaenge', r.vorgangId]);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    } finally { this.beschaeftigt.set(false); }
  }

  async stoerung(aktiv: boolean) {
    this.status.set(await this.api.post('/api/demo/stoerung', { aktiv }));
    this.ui.info(aktiv ? 'Störung aktiv: Anträge und Uploads werden mit „Dienst nicht erreichbar“ abgewiesen.' : 'Störung beendet.');
  }

  async zuruecksetzen() {
    if (!(await this.ui.bestaetigen('Testdaten zurücksetzen?', 'Alle Testkonten, Vorgänge, Nachrichten und Einstellungen werden auf den Ausgangszustand zurückgesetzt. Sie werden abgemeldet.', { bestaetigen: 'Zurücksetzen', gefaehrlich: true }))) return;
    await this.api.post('/api/demo/zuruecksetzen');
    sessionStorage.clear();
    Object.keys(localStorage).filter(k => k.startsWith('vp_entwurf_') || k === 'vp_einwilligung_cookies').forEach(k => localStorage.removeItem(k));
    window.location.href = '/anmelden';
  }

  /** Nach dem Zeitraffer die aktuelle Seite neu laden, damit Statusänderungen sichtbar werden */
  private neuLadenNachAktion() {
    const url = this.router.url;
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.router.navigateByUrl(url));
  }

  oeffnen(n: AusgehendeNachricht) {
    this.offen.set(false);
    this.router.navigateByUrl(n.link!.ziel);
  }

  zeit(iso: string) {
    const d = new Date(iso);
    const heute = new Date().toDateString() === d.toDateString();
    return heute ? `heute, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }
}
