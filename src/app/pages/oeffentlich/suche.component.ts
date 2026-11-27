import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';

interface Treffer { art: string; titel: string; text: string; ziel: string }

const ARTEN: Record<string, string> = { FUNKTION: 'Bereich', ANTRAG: 'Antrag', LEISTUNG: 'Leistung', FAQ: 'Häufige Frage', GLOSSAR: 'Begriff', VORGANG: 'Mein Vorgang', NACHRICHT: 'Nachricht' };

@Component({
  selector: 'vp-suche',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>Suchergebnisse für „{{ q() }}“</h1>
    @if (fehler()) { <div class="hinweis warnung">{{ fehler() }}</div> }
    @if (treffer(); as t) {
      <p class="leise" aria-live="polite">{{ t.length }} Treffer</p>
      <ul class="liste-ohne karte">
        @for (x of t; track x.ziel + x.titel) {
          <li><span class="badge">{{ arten[x.art] }}</span> <a [routerLink]="pfad(x.ziel)" [queryParams]="query(x.ziel)" [fragment]="fragment(x.ziel)"><strong>{{ x.titel }}</strong></a><br />
            <span class="klein leise">{{ x.text }}</span></li>
        } @empty { <li class="leer">Nichts gefunden. Versuchen Sie einen anderen Begriff oder <a routerLink="/kontakt">fragen Sie uns</a>.</li> }
      </ul>
    }`,
})
export class SucheComponent {
  private api = inject(Api);
  readonly q = input('');
  readonly treffer = signal<Treffer[] | null>(null);
  readonly fehler = signal<string | null>(null);
  readonly arten = ARTEN;

  constructor() {
    effect(() => {
      const q = this.q();
      this.fehler.set(null);
      this.api.get<{ treffer: Treffer[] }>('/api/suche', { q }).then(r => this.treffer.set(r.treffer)).catch(e => this.fehler.set(fehlertext(e)));
    });
  }

  pfad(z: string) { return z.split(/[?#]/)[0]; }
  query(z: string) { const q = z.split('?')[1]?.split('#')[0]; return q ? Object.fromEntries(new URLSearchParams(q)) : {}; }
  fragment(z: string) { return z.includes('#') ? decodeURIComponent(z.split('#')[1]) : undefined; }
}
