import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../core/services/api.service';
import { fehlertext } from '../core/services/auth.interceptor';
import { SitzungService } from '../core/services/sitzung.service';

interface ChatNachricht { von: 'ICH' | 'BOT' | 'MITARBEITER' | 'SYSTEM'; text: string; link?: string; name?: string }

import { SymbolComponent } from '../shared/symbol.component';

@Component({
  selector: 'vp-chat',
  imports: [FormsModule, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (!offen()) {
      <button class="chat-knopf" type="button" (click)="oeffnen()" aria-haspopup="dialog"><vp-symbol name="message-circle" [groesse]="20" /> <span class="chat-text">Fragen? Chatten Sie mit uns</span></button>
    } @else {
      <section class="chat" role="dialog" aria-label="Service-Chat">
        <header><strong>{{ live() ? 'Live-Chat Kundenservice' : 'Digitaler Assistent' }}</strong>
          <button type="button" (click)="offen.set(false)" aria-label="Chat schließen"><vp-symbol name="x" [groesse]="18" /></button></header>
        <div class="verlauf" #verlauf aria-live="polite">
          @for (n of nachrichten(); track $index) {
            <div class="nachricht" [class.ich]="n.von === 'ICH'" [class.system]="n.von === 'SYSTEM'">
              @if (n.name) { <span class="klein leise">{{ n.name }}</span> }
              <span>{{ n.text }}</span>
              @if (n.link && n.link !== 'LIVE') { <button type="button" class="btn link klein" (click)="gehe(n.link)">Hier entlang →</button> }
              @if (n.link === 'LIVE') { <button type="button" class="btn klein" (click)="liveStarten()">Mit Mitarbeiter/in chatten</button> }
            </div>
          }
          @if (einwilligungNoetig()) {
            <div class="nachricht system">
              <span>Für die Beantwortung werten wir Ihre Eingaben automatisiert aus. Sind Sie einverstanden?</span>
              <button type="button" class="btn klein primaer" (click)="einwilligen()">Einverstanden</button>
            </div>
          }
        </div>
        <form (ngSubmit)="senden()">
          <label class="sr-only" for="chat-eingabe">Ihre Frage</label>
          <input id="chat-eingabe" name="text" type="text" [(ngModel)]="text" maxlength="500" placeholder="Ihre Frage …" autocomplete="off" />
          <button class="btn primaer klein" type="submit" [disabled]="!text.trim()">Senden</button>
        </form>
      </section>
    }`,
  styles: [`@media (max-width:640px){.chat-knopf{padding:.85rem}.chat-text{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}}
    :host{position:fixed;right:1rem;bottom:1rem;z-index:800}
    .chat-knopf{display:inline-flex;align-items:center;gap:.45rem;background:var(--vp-primaer);color:#fff;border:none;border-radius:999px;padding:.7rem 1.1rem;font:inherit;font-weight:600;cursor:pointer;box-shadow:var(--vp-schatten)}
    .chat{width:min(360px,calc(100vw - 2rem));height:460px;background:#fff;border:1px solid var(--vp-rand);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.18)}
    header{display:flex;justify-content:space-between;align-items:center;padding:.7rem 1rem;background:var(--vp-primaer);color:#fff;border-radius:12px 12px 0 0}
    header button{background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer}
    .verlauf{flex:1;overflow:auto;padding:.75rem;display:flex;flex-direction:column;gap:.5rem}
    .nachricht{background:var(--vp-hintergrund);padding:.5rem .7rem;border-radius:10px;max-width:85%;display:flex;flex-direction:column;gap:.3rem;align-items:flex-start}
    .nachricht.ich{align-self:flex-end;background:var(--vp-primaer-hell)}
    .nachricht.system{background:var(--vp-warnung-hell)}
    form{display:flex;gap:.4rem;padding:.6rem;border-top:1px solid var(--vp-rand)}
  `],
})
export class ChatComponent {
  private api = inject(Api);
  private router = inject(Router);
  private sitzung = inject(SitzungService);
  private verlauf = viewChild<ElementRef<HTMLElement>>('verlauf');

  readonly offen = signal(false);
  readonly live = signal(false);
  readonly einwilligungNoetig = signal(false);
  readonly nachrichten = signal<ChatNachricht[]>([]);
  text = '';
  private wartend = '';

  oeffnen() {
    this.offen.set(true);
    if (!this.nachrichten().length) {
      const name = this.sitzung.benutzer()?.vorname;
      this.nachrichten.set([{ von: 'BOT', text: `Hallo${name ? ' ' + name : ''}! Ich bin der digitale Assistent der VitaPlus. Wie kann ich helfen?` }]);
    }
  }

  async senden(einwilligung = false) {
    const t = (this.wartend || this.text).trim();
    if (!t) return;
    if (!this.wartend) this.nachrichten.update(l => [...l, { von: 'ICH', text: t }]);
    this.text = '';
    try {
      const r = await this.api.post<ChatNachricht>('/api/chat', { text: t, live: this.live(), einwilligung });
      this.wartend = '';
      this.nachrichten.update(l => [...l, r]);
    } catch (e: any) {
      if (e?.error?.code === 'EINWILLIGUNG_FEHLT') {
        this.wartend = t;
        this.einwilligungNoetig.set(true);
      } else {
        this.nachrichten.update(l => [...l, { von: 'SYSTEM', text: fehlertext(e) }]);
      }
    }
    setTimeout(() => this.verlauf()?.nativeElement.scrollTo({ top: 99999 }));
  }

  einwilligen() {
    this.einwilligungNoetig.set(false);
    this.senden(true);
  }

  async liveStarten() {
    this.live.set(true);
    const r = await this.api.post<ChatNachricht>('/api/chat', { text: 'Live-Chat starten', live: true, einwilligung: true });
    this.nachrichten.update(l => [...l, r]);
  }

  gehe(link: string) {
    this.router.navigateByUrl(link);
  }
}
