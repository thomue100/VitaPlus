import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Vorgang, VorgangStatus } from '../core/models';
import { DatumPipe } from './pipes';

interface Station {
  titel: string;
  zustand: 'erledigt' | 'aktuell' | 'offen' | 'warten' | 'negativ';
  datum?: string;
  zusatz?: string;
}

const STUFE: Record<VorgangStatus, number> = {
  ENTWURF: -1, EINGEREICHT: 0, IN_BEARBEITUNG: 1, RUECKFRAGE: 1, GENEHMIGT: 2, TEILWEISE_GENEHMIGT: 2, ABGELEHNT: 2,
  VERSENDET: 2, AUSGEZAHLT: 3, STORNIERT: 2,
};

const ENTSCHEIDUNG: Partial<Record<VorgangStatus, string>> = {
  GENEHMIGT: 'Genehmigt', TEILWEISE_GENEHMIGT: 'Teilweise genehmigt', ABGELEHNT: 'Abgelehnt', VERSENDET: 'Erledigt', STORNIERT: 'Zurückgezogen', AUSGEZAHLT: 'Genehmigt',
};

/**
 * Bearbeitungsstand eines Vorgangs wie bei einer Sendungsverfolgung:
 * Eingegangen → In Prüfung → Entscheidung → Auszahlung (nur bei Geldleistungen).
 */
@Component({
  selector: 'vp-bearbeitungsstand',
  imports: [DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (stationen().length) {
      <ol class="stand" [class.kompakt]="kompakt()" [attr.aria-label]="'Bearbeitungsstand: ' + aktuellerText()">
        @for (s of stationen(); track s.titel; let i = $index) {
          <li [class]="s.zustand" [attr.aria-current]="s.zustand === 'aktuell' || s.zustand === 'warten' ? 'step' : null">
            <span class="marke" aria-hidden="true"></span>
            <span class="titel">{{ s.titel }}</span>
            @if (!kompakt()) {
              @if (s.datum) { <span class="datum">{{ s.datum | datum }}</span> }
              @if (s.zusatz) { <span class="zusatz">{{ s.zusatz }}</span> }
            }
          </li>
        }
      </ol>
    }`,
  styles: [`
    .stand { list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); counter-reset: station; }
    li { position: relative; padding: 1.4rem .5rem 0 0; display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
    li::before { content: ''; position: absolute; top: .5rem; left: 0; right: 0; height: 4px; background: var(--vp-rand); }
    li:last-child::before { display: none; }
    li.erledigt::before { background: var(--vp-primaer); }
    .marke { position: absolute; top: 0; left: 0; width: 1.25rem; height: 1.25rem; border-radius: 50%; background: #fff; border: 3px solid var(--vp-rand); box-sizing: border-box; }
    .erledigt .marke { background: var(--vp-primaer); border-color: var(--vp-primaer); }
    .aktuell .marke { border-color: var(--vp-primaer); background: #fff; box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 10px var(--vp-primaer); }
    .warten .marke { border-color: var(--vp-akzent); background: var(--vp-akzent); }
    .negativ .marke { border-color: var(--vp-fehler); background: var(--vp-fehler); }
    .titel { font-weight: 700; font-size: .95rem; overflow-wrap: anywhere; }
    .offen .titel { font-weight: 400; color: var(--vp-text-leise); }
    .warten .titel { color: var(--vp-warnung); }
    .negativ .titel { color: var(--vp-fehler); }
    .datum, .zusatz { font-size: .85rem; color: var(--vp-text-leise); }
    .kompakt li { padding-top: 1.1rem; }
    .kompakt .marke { width: .95rem; height: .95rem; border-width: 2px; }
    .kompakt li::before { top: .38rem; height: 3px; }
    .kompakt .titel { font-size: .8rem; font-weight: 400; color: var(--vp-text-leise); }
    .kompakt .aktuell .titel, .kompakt .warten .titel, .kompakt .negativ .titel { font-weight: 700; color: var(--vp-text); }
    @media (max-width: 560px) {
      .stand:not(.kompakt) { grid-auto-flow: row; gap: .9rem; }
      .stand:not(.kompakt) li { padding: 0 0 0 1.9rem; }
      .stand:not(.kompakt) li::before { display: none; }
      .kompakt .titel { display: none; }
      .kompakt .aktuell .titel, .kompakt .warten .titel, .kompakt .negativ .titel { display: block; white-space: nowrap; }
    }
  `],
})
export class BearbeitungsstandComponent {
  readonly vorgang = input.required<Pick<Vorgang, 'status' | 'historie' | 'betragBeantragt' | 'betragErstattet' | 'erstelltAm'>>();
  readonly kompakt = input(false);

  private zeitpunkt(stufe: number): string | undefined {
    const h = this.vorgang().historie || [];
    return [...h].reverse().find(e => STUFE[e.status] === stufe)?.zeitpunkt || h.find(e => STUFE[e.status] === stufe)?.zeitpunkt;
  }

  readonly stationen = computed<Station[]>(() => {
    const v = this.vorgang();
    const stufe = STUFE[v.status];
    if (stufe < 0) return [];
    const geld = v.betragBeantragt != null && v.status !== 'ABGELEHNT' && v.status !== 'STORNIERT' && v.status !== 'VERSENDET';
    const zustand = (i: number): Station['zustand'] => (i < stufe ? 'erledigt' : i === stufe ? 'aktuell' : 'offen');
    const liste: Station[] = [
      { titel: 'Eingegangen', zustand: zustand(0), datum: this.zeitpunkt(0) || v.erstelltAm },
      { titel: v.status === 'RUECKFRAGE' ? 'Unterlagen fehlen' : 'In Prüfung', zustand: v.status === 'RUECKFRAGE' ? 'warten' : zustand(1), datum: this.zeitpunkt(1),
        zusatz: v.status === 'RUECKFRAGE' ? 'Wir warten auf Ihre Unterlagen' : undefined },
      { titel: stufe >= 2 ? ENTSCHEIDUNG[v.status] || 'Entschieden' : 'Entscheidung', zustand: v.status === 'ABGELEHNT' || v.status === 'STORNIERT' ? 'negativ' : zustand(2), datum: this.zeitpunkt(2) },
    ];
    if (geld) liste.push({ titel: v.status === 'AUSGEZAHLT' ? 'Ausgezahlt' : 'Auszahlung', zustand: v.status === 'AUSGEZAHLT' ? 'erledigt' : 'offen', datum: this.zeitpunkt(3) });
    // Die letzte erreichte Station gilt als aktuell, auch wenn sie abgeschlossen ist
    if (v.status === 'AUSGEZAHLT') liste[3].zustand = 'aktuell';
    return liste;
  });

  readonly aktuellerText = computed(() => this.stationen().find(s => s.zustand === 'aktuell' || s.zustand === 'warten' || s.zustand === 'negativ')?.titel || '');
}
