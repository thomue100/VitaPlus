import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { herunterladen } from '../pdf';
import { DateigroessePipe } from '../pipes';
import { SymbolComponent } from '../symbol.component';
import { aktuelleVorschau, vorschauSchliessen } from './vorschau';

/** Dokumentbetrachter: zeigt PDFs (auch mehrseitig) und Bilder direkt im Portal an. */
@Component({
  selector: 'vp-dokument-betrachter',
  imports: [SymbolComponent, DateigroessePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (vorschau(); as v) {
      <div class="hintergrund" (click)="schliessen()"></div>
      <section class="betrachter" role="dialog" aria-modal="true" [attr.aria-label]="'Dokument: ' + v.titel">
        <header>
          <span class="titel"><vp-symbol [name]="istBild() ? 'camera' : 'file-text'" [groesse]="18" /> <strong>{{ v.titel }}</strong>
            <span class="leise klein">{{ v.dateiname }} · {{ v.blob.size | groesse }}</span></span>
          <span class="aktionen-kopf">
            <button type="button" class="btn klein" (click)="laden()"><vp-symbol name="download" [groesse]="16" /> Herunterladen</button>
            <button type="button" class="btn klein" (click)="drucken()"><vp-symbol name="printer" [groesse]="16" /> Drucken</button>
            <button #schliessenKnopf type="button" class="schliessen" (click)="schliessen()" aria-label="Dokument schließen"><vp-symbol name="x" [groesse]="20" /></button>
          </span>
        </header>
        <div class="inhalt">
          @if (istBild()) { <img [src]="sicher()" [alt]="v.titel" /> }
          @else { <iframe [src]="sicher()" [title]="v.titel"></iframe> }
        </div>
      </section>
    }`,
  styles: [`
    .hintergrund { position: fixed; inset: 0; background: rgba(10, 30, 30, .55); z-index: 1200; }
    .betrachter { position: fixed; inset: 3vh 3vw; z-index: 1201; background: #fff; border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
    header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .6rem .9rem; border-bottom: 1px solid var(--vp-rand); flex-wrap: wrap; }
    .titel { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .aktionen-kopf { display: flex; gap: .4rem; align-items: center; }
    .schliessen { background: none; border: none; cursor: pointer; padding: .3rem; border-radius: 6px; line-height: 0; }
    .schliessen:hover { background: var(--vp-hintergrund); }
    .inhalt { flex: 1; background: #525659; display: flex; align-items: center; justify-content: center; overflow: auto; }
    iframe { width: 100%; height: 100%; border: 0; background: #fff; }
    img { max-width: 100%; max-height: 100%; object-fit: contain; background: #fff; }
  `],
})
export class DokumentBetrachterComponent {
  private sanitizer = inject(DomSanitizer);
  readonly vorschau = aktuelleVorschau;
  readonly istBild = computed(() => (this.vorschau()?.blob.type || '').startsWith('image/'));
  private schliessenKnopf = viewChild<ElementRef<HTMLButtonElement>>('schliessenKnopf');
  /** Fokus in den Dialog setzen, damit Tastatur und Escape sofort wirken */
  private fokus = afterRenderEffect(() => { if (this.vorschau()) this.schliessenKnopf()?.nativeElement.focus(); });
  readonly sicher = computed(() => this.vorschau() ? this.sanitizer.bypassSecurityTrustResourceUrl(this.vorschau()!.url) : null);

  @HostListener('document:keydown.escape')
  schliessen() {
    vorschauSchliessen();
  }

  laden() {
    const v = this.vorschau();
    if (v) herunterladen(v.blob, v.dateiname);
  }

  drucken() {
    const v = this.vorschau();
    if (!v) return;
    const w = window.open(v.url, '_blank');
    w?.addEventListener('load', () => w.print());
  }
}
