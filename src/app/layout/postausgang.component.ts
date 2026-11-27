import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AusgehendeNachricht } from '../core/models';
import { Api } from '../core/services/api.service';
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
      <vp-symbol name="mail" [groesse]="18" /> <span class="text">E-Mail &amp; SMS (Demo)</span>
      @if (ungelesen()) { <span class="zaehlpunkt">{{ ungelesen() }}</span> }
    </button>
    @if (offen()) {
      <section id="postausgang-liste" class="postausgang-panel" role="dialog" aria-label="Demo-Postfach für E-Mail, SMS und Briefe">
        <header><strong>Ihr Posteingang außerhalb der Kasse</strong><button type="button" class="btn link klein" (click)="offen.set(false)" aria-label="Schließen"><vp-symbol name="x" [groesse]="18" /></button></header>
        <p class="leise klein">Demo-Umgebung: Nachrichten, die die VitaPlus per E-Mail, SMS oder Post verschickt, erscheinen hier.</p>
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
    @media (max-width: 640px) { .postausgang-knopf .text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); } }
  `],
})
export class PostausgangComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  readonly offen = signal(false);
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
    if (this.offen() && this.ungelesen()) {
      await this.api.post('/api/demo/postausgang/gelesen').catch(() => undefined);
      setTimeout(() => this.laden(), 4000);
    }
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
