import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../core/services/api.service';
import { fehlertext } from '../core/services/auth.interceptor';
import { SitzungService } from '../core/services/sitzung.service';
import { SymbolComponent } from '../shared/symbol.component';

interface ChatLink { text: string; ziel: string }
interface ChatNachricht {
  von: 'ICH' | 'BOT' | 'MITARBEITER' | 'SYSTEM';
  text: string;
  name?: string;
  links?: ChatLink[];
  vorschlaege?: string[];
  uebergabe?: boolean;
  zeit?: string;
}
interface Gespeichert { nachrichten: ChatNachricht[]; kontext: Record<string, any>; live: boolean; benutzer: string | null }

const SPEICHER = 'vp_chat';

@Component({
  selector: 'vp-chat',
  imports: [FormsModule, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (!offen()) {
      <button class="chat-knopf" type="button" (click)="oeffnen()" aria-haspopup="dialog" aria-label="Chat öffnen: Fragen an den VitaPlus-Assistenten"><vp-symbol name="message-circle" [groesse]="20" /> <span class="chat-text">Chat</span>
        @if (nachrichten().length > 1) { <span class="punkt" aria-label="laufendes Gespräch"></span> }</button>
    } @else {
      <section class="chat" role="dialog" aria-label="Service-Chat" (keydown.escape)="schliessen()">
        <header>
          <span class="kopf"><span class="avatar" aria-hidden="true"><vp-symbol [name]="live() ? 'headset' : 'sparkles'" [groesse]="18" /></span>
            <span><strong>{{ live() ? 'Live-Chat Kundenservice' : 'Digitaler Assistent' }}</strong><span class="status">{{ live() ? 'Jana ist online' : 'antwortet sofort' }}</span></span></span>
          <span>
            <button type="button" (click)="neuBeginnen()" title="Neues Gespräch beginnen" aria-label="Neues Gespräch beginnen"><vp-symbol name="refresh-cw" [groesse]="17" /></button>
            <button type="button" (click)="schliessen()" aria-label="Chat schließen"><vp-symbol name="x" [groesse]="18" /></button>
          </span>
        </header>
        <div class="verlauf" #verlauf aria-live="polite">
          @for (n of nachrichten(); track $index; let letzte = $last) {
            <div class="nachricht" [class.ich]="n.von === 'ICH'" [class.system]="n.von === 'SYSTEM'" [class.mitarbeiter]="n.von === 'MITARBEITER'">
              @if (n.name) { <span class="klein leise">{{ n.name }}</span> }
              <span class="text">{{ n.text }}</span>
              @if (n.links?.length) {
                <span class="links">@for (l of n.links; track l.ziel) { <button type="button" class="btn klein" (click)="gehe(l.ziel)">{{ l.text }}</button> }</span>
              }
              @if (n.uebergabe && !live()) { <button type="button" class="btn klein primaer" (click)="liveStarten()">Mit Mitarbeiter/in chatten</button> }
              @if (letzte && n.vorschlaege?.length) {
                <span class="chips">@for (v of n.vorschlaege; track v) { <button type="button" class="chip" (click)="waehlen(v)">{{ v }}</button> }</span>
              }
            </div>
          }
          @if (tippt()) { <div class="nachricht tippt" aria-label="Der Assistent schreibt"><span></span><span></span><span></span></div> }
          @if (einwilligungNoetig()) {
            <div class="nachricht system">
              <span>Für die Beantwortung werten wir Ihre Eingaben automatisiert aus. Sind Sie einverstanden?</span>
              <button type="button" class="btn klein primaer" (click)="einwilligen()">Einverstanden</button>
            </div>
          }
        </div>
        <form (ngSubmit)="senden()">
          <label class="sr-only" for="chat-eingabe">Ihre Frage</label>
          <input id="chat-eingabe" name="text" type="text" [(ngModel)]="text" maxlength="500" placeholder="Ihre Frage in eigenen Worten …" autocomplete="off" />
          <button class="btn primaer klein" type="submit" [disabled]="!text.trim() || tippt()" aria-label="Senden"><vp-symbol name="send" [groesse]="16" /></button>
        </form>
      </section>
    }`,
  styles: [`@media (max-width:640px){.chat-knopf{padding:.85rem}.chat-text{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}}
    :host{position:fixed;right:1rem;bottom:1rem;z-index:800}
    .chat-knopf{position:relative;display:inline-flex;align-items:center;gap:.45rem;background:var(--vp-primaer);color:#fff;border:none;border-radius:var(--vp-radius);padding:.6rem 1rem;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(16,40,44,.25)}
    .chat-knopf .punkt{position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:var(--vp-akzent);border:2px solid #fff}
    .chat{width:min(380px,calc(100vw - 2rem));height:min(540px,calc(100vh - 6rem));background:#fff;border:1px solid var(--vp-rand);border-radius:var(--vp-radius);display:flex;flex-direction:column;box-shadow:0 12px 36px rgba(0,0,0,.2);overflow:hidden}
    header{display:flex;justify-content:space-between;align-items:center;padding:.65rem .8rem;background:var(--vp-primaer-dunkel);color:#fff}
    header .kopf{display:flex;gap:.6rem;align-items:center}
    header .kopf > span:last-child{display:flex;flex-direction:column;line-height:1.2}
    header .status{font-size:.75rem;opacity:.85}
    header .avatar{width:2rem;height:2rem;border-radius:50%;background:rgba(255,255,255,.18);display:inline-flex;align-items:center;justify-content:center}
    header button{background:none;border:none;color:#fff;cursor:pointer;padding:.3rem;border-radius:6px;line-height:0}
    header button:hover{background:rgba(255,255,255,.15)}
    .verlauf{flex:1;overflow:auto;padding:.8rem;display:flex;flex-direction:column;gap:.55rem;background:#f7faf9}
    .nachricht{background:#fff;border:1px solid var(--vp-rand);padding:.55rem .75rem;border-radius:14px 14px 14px 4px;max-width:88%;display:flex;flex-direction:column;gap:.4rem;align-items:flex-start}
    .nachricht .text{white-space:pre-line}
    .nachricht.ich{align-self:flex-end;background:var(--vp-primaer);color:#fff;border-color:var(--vp-primaer);border-radius:14px 14px 4px 14px}
    .nachricht.mitarbeiter{background:#eef4ff;border-color:#cddcf5}
    .nachricht.system{background:var(--vp-warnung-hell)}
    .links{display:flex;flex-wrap:wrap;gap:.35rem}
    .chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.15rem}
    .chip{border:1px solid var(--vp-primaer);color:var(--vp-primaer);background:#fff;border-radius:999px;padding:.25rem .7rem;font:inherit;font-size:.85rem;cursor:pointer}
    .chip:hover{background:var(--vp-primaer-hell)}
    .tippt{flex-direction:row;gap:.25rem}
    .tippt span{width:7px;height:7px;border-radius:50%;background:#9fb7b3;animation:tippen 1s infinite}
    .tippt span:nth-child(2){animation-delay:.15s}.tippt span:nth-child(3){animation-delay:.3s}
    @keyframes tippen{0%,100%{opacity:.3}50%{opacity:1}}
    form{display:flex;gap:.4rem;padding:.6rem;border-top:1px solid var(--vp-rand);background:#fff}
    form input{flex:1}
  `],
})
export class ChatComponent {
  private api = inject(Api);
  private router = inject(Router);
  private sitzung = inject(SitzungService);
  private verlauf = viewChild<ElementRef<HTMLElement>>('verlauf');

  readonly offen = signal(false);
  readonly live = signal(false);
  readonly tippt = signal(false);
  readonly einwilligungNoetig = signal(false);
  readonly nachrichten = signal<ChatNachricht[]>([]);
  private kontext: Record<string, any> = {};
  text = '';
  private wartend = '';

  constructor() {
    this.laden();
    // Bei Benutzerwechsel (An-/Abmeldung) beginnt ein neues Gespräch
    effect(() => {
      const id = this.sitzung.benutzer()?.id ?? null;
      const g = this.gespeichert();
      if (g && g.benutzer !== id) this.zuruecksetzen();
    });
  }

  private gespeichert(): Gespeichert | null {
    try { return JSON.parse(sessionStorage.getItem(SPEICHER) || 'null'); } catch { return null; }
  }

  private laden() {
    const g = this.gespeichert();
    if (!g) return;
    this.nachrichten.set(g.nachrichten);
    this.kontext = g.kontext || {};
    this.live.set(!!g.live);
  }

  private speichern() {
    const g: Gespeichert = { nachrichten: this.nachrichten().slice(-60), kontext: this.kontext, live: this.live(), benutzer: this.sitzung.benutzer()?.id ?? null };
    sessionStorage.setItem(SPEICHER, JSON.stringify(g));
  }

  private zuruecksetzen() {
    sessionStorage.removeItem(SPEICHER);
    this.nachrichten.set([]);
    this.kontext = {};
    this.live.set(false);
  }

  /** Chat schließen (Knopf oder Escape); der Fokus geht zurück auf den Chat-Knopf */
  schliessen() {
    this.offen.set(false);
    setTimeout(() => document.querySelector<HTMLElement>('.chat-knopf')?.focus());
  }

  async oeffnen() {
    this.offen.set(true);
    if (!this.nachrichten().length) {
      try {
        const g = await this.api.get<ChatNachricht>('/api/chat/begruessung');
        this.nachrichten.set([{ ...g, zeit: new Date().toISOString() }]);
        this.speichern();
      } catch {
        this.nachrichten.set([{ von: 'BOT', text: 'Hallo! Wie kann ich Ihnen helfen?' }]);
      }
    }
    this.scrollen();
    setTimeout(() => document.getElementById('chat-eingabe')?.focus());
  }

  neuBeginnen() {
    this.zuruecksetzen();
    this.oeffnen();
  }

  waehlen(v: string) {
    this.text = v;
    this.senden();
  }

  async senden(einwilligung = false) {
    const t = (this.wartend || this.text).trim();
    if (!t) return;
    if (!this.wartend) this.nachrichten.update(l => [...l, { von: 'ICH', text: t, zeit: new Date().toISOString() }]);
    this.text = '';
    this.tippt.set(true);
    this.scrollen();
    try {
      const [r] = await Promise.all([
        this.api.post<ChatNachricht & { kontext: Record<string, any> }>('/api/chat', { text: t, kontext: this.kontext, live: this.live(), einwilligung }),
        new Promise(res => setTimeout(res, 350 + Math.min(900, t.length * 12))),
      ]);
      this.wartend = '';
      this.kontext = r.kontext || {};
      const { kontext: _k, ...nachricht } = r;
      this.nachrichten.update(l => [...l, { ...nachricht, zeit: new Date().toISOString() }]);
    } catch (e: any) {
      if (e?.error?.code === 'EINWILLIGUNG_FEHLT') {
        this.wartend = t;
        this.einwilligungNoetig.set(true);
      } else {
        this.nachrichten.update(l => [...l, { von: 'SYSTEM', text: fehlertext(e) }]);
      }
    } finally {
      this.tippt.set(false);
      this.speichern();
      this.scrollen();
    }
  }

  einwilligen() {
    this.einwilligungNoetig.set(false);
    this.senden(true);
  }

  async liveStarten() {
    this.live.set(true);
    this.tippt.set(true);
    try {
      const r = await this.api.post<ChatNachricht>('/api/chat', { text: 'Live-Chat starten', live: true, einwilligung: true });
      await new Promise(res => setTimeout(res, 1200));
      this.nachrichten.update(l => [...l, { von: 'SYSTEM', text: 'Sie werden mit dem Kundenservice verbunden …' }, r]);
      if (r.von === 'SYSTEM') this.live.set(false);
    } finally {
      this.tippt.set(false);
      this.speichern();
      this.scrollen();
    }
  }

  gehe(ziel: string) {
    this.router.navigateByUrl(ziel);
    if (window.innerWidth < 640) this.offen.set(false);
  }

  private scrollen() {
    setTimeout(() => this.verlauf()?.nativeElement.scrollTo({ top: 99999, behavior: 'smooth' }));
  }
}
