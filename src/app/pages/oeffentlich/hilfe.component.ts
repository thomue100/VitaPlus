import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FaqEintrag, GlossarEintrag } from '../../core/models';
import { Api } from '../../core/services/api.service';

@Component({
  selector: 'vp-hilfe',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>{{ glossar() ? 'Glossar' : 'Hilfe & häufige Fragen' }}</h1>
      <p class="leise">{{ glossar() ? 'Fachbegriffe einfach erklärt' : 'Antworten auf die wichtigsten Fragen' }}</p></div></div>
    <nav class="reiter" aria-label="Hilfebereiche">
      <a routerLink="/hilfe" [class.aktiv]="!glossar()">Häufige Fragen</a>
      <a routerLink="/hilfe/glossar" [class.aktiv]="glossar()">Glossar</a>
      <a routerLink="/kontakt">Kontakt</a>
    </nav>
    @if (!glossar()) {
      <div class="filterleiste">
        <div class="feld"><label for="faq-suche">Frage suchen</label><input id="faq-suche" type="search" [(ngModel)]="suche" (ngModelChange)="laden()" /></div>
        <div class="feld"><label for="faq-kat">Thema</label>
          <select id="faq-kat" [(ngModel)]="kategorie" (ngModelChange)="laden()"><option value="">Alle Themen</option>
            @for (k of kategorien(); track k) { <option [value]="k">{{ k }}</option> }</select></div>
      </div>
      <div class="karte">
        @for (f of faq(); track f.id) {
          <details class="faq" [open]="f.id === offen()" [id]="f.id">
            <summary>{{ f.frage }}</summary>
            <p class="mt">{{ f.antwort }}</p>
            @if (bewertet().includes(f.id)) { <p class="klein leise">Danke für Ihre Rückmeldung!</p> }
            @else { <p class="klein">War diese Antwort hilfreich?
              <button type="button" class="btn link klein" (click)="bewerten(f.id, true)">Ja</button>
              <button type="button" class="btn link klein" (click)="bewerten(f.id, false)">Nein</button></p> }
          </details>
        } @empty { <p class="leer">Keine passenden Fragen gefunden. <a routerLink="/kontakt">Kontaktieren Sie uns.</a></p> }
      </div>
    } @else {
      <p>@for (b of buchstaben(); track b) { <a [href]="'hilfe/glossar#' + b" class="btn link">{{ b }}</a> }</p>
      <div class="karte"><dl class="daten">
        @for (g of begriffe(); track g.begriff) { <dt [id]="g.begriff.charAt(0)"><strong>{{ g.begriff }}</strong></dt><dd>{{ g.erklaerung }}</dd> }
      </dl></div>
    }`,
})
export class HilfeComponent implements OnInit {
  private api = inject(Api);
  readonly glossar = input(false);
  readonly faqId = input<string>(undefined, { alias: 'faq' });
  readonly faq = signal<FaqEintrag[]>([]);
  readonly alle = signal<FaqEintrag[]>([]);
  readonly begriffe = signal<GlossarEintrag[]>([]);
  readonly bewertet = signal<string[]>([]);
  readonly offen = computed(() => this.faqId());
  readonly kategorien = computed(() => Array.from(new Set(this.alle().map(f => f.kategorie))));
  readonly buchstaben = computed(() => Array.from(new Set(this.begriffe().map(g => g.begriff.charAt(0).toUpperCase()))));
  suche = '';
  kategorie = '';

  async ngOnInit() {
    if (this.glossar()) this.begriffe.set(await this.api.get('/api/inhalte/glossar'));
    else {
      this.alle.set(await this.api.get('/api/inhalte/faq'));
      this.faq.set(this.alle());
      if (this.faqId()) setTimeout(() => document.getElementById(this.faqId()!)?.scrollIntoView());
    }
  }

  async laden() {
    this.faq.set(await this.api.get('/api/inhalte/faq', { suche: this.suche, kategorie: this.kategorie }));
  }

  async bewerten(id: string, hilfreich: boolean) {
    await this.api.post(`/api/inhalte/faq/${id}/bewertung`, { hilfreich });
    this.bewertet.update(l => [...l, id]);
  }
}
