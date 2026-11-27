import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { fehlertext } from '../../core/services/auth.interceptor';
import { FormularApi, FormularDefinition } from '../../core/services/formular-api.service';
import { HatUngespeicherteAenderungen } from '../../core/services/guards';
import { FormularRendererComponent } from '../../shared/formular-renderer.component';
import { SymbolComponent } from '../../shared/symbol.component';

@Component({
  selector: 'vp-oeffentliches-formular',
  imports: [FormularRendererComponent, RouterLink, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (def(); as d) {
      @if (d.code === 'MITGLIEDSANTRAG') {
        <section class="seitenbuehne">
          <div><h1>{{ d.titel }}</h1>
            <p>In wenigen Minuten online Mitglied werden – den Wechsel und die Meldung an Ihren Arbeitgeber übernehmen wir. Sie sind schon bei uns versichert? <a routerLink="/anmelden">Zur Anmeldung</a></p>
            <ul class="vorteile-kurz">
              <li><vp-symbol name="circle-check" [groesse]="18" /> Zusatzbeitrag 2,49 %</li>
              <li><vp-symbol name="circle-check" [groesse]="18" /> Familie beitragsfrei mitversichert</li>
              <li><vp-symbol name="circle-check" [groesse]="18" /> Bonusprogramm bis 250 € im Jahr</li>
            </ul>
          </div>
        </section>
      } @else {
        <div class="seitenkopf"><div><h1>{{ d.titel }}</h1></div></div>
      }
      <vp-formular [definition]="d" [oeffentlich]="true" />
    } @else if (fehler()) { <div class="hinweis fehler">{{ fehler() }}</div> }`,
})
export class OeffentlichesFormularComponent implements OnInit, HatUngespeicherteAenderungen {
  private formularApi = inject(FormularApi);
  private title = inject(Title);
  readonly code = input.required<string>();
  readonly def = signal<FormularDefinition | undefined>(undefined);
  readonly fehler = signal<string | null>(null);
  private renderer = viewChild(FormularRendererComponent);

  async ngOnInit() {
    try {
      const d = await this.formularApi.definition(this.code(), true);
      this.def.set(d);
      this.title.setTitle(`${d.titel} – VitaPlus`);
    } catch (e) {
      this.fehler.set(fehlertext(e));
    }
  }

  ungespeichert() {
    return this.renderer()?.ungespeichert() ?? false;
  }
}
