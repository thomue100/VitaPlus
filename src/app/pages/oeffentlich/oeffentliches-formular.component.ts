import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formular } from '../../core/formulare/formular-katalog';
import { HatUngespeicherteAenderungen } from '../../core/services/guards';
import { FormularRendererComponent } from '../../shared/formular-renderer.component';

@Component({
  selector: 'vp-oeffentliches-formular',
  imports: [FormularRendererComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (def(); as d) {
      <div class="seitenkopf"><div><h1>{{ d.titel }}</h1>
        @if (d.code === 'MITGLIEDSANTRAG') { <p class="leise">In wenigen Minuten online Mitglied werden. Bereits versichert? <a routerLink="/anmelden">Hier anmelden</a>.</p> }
      </div></div>
      <vp-formular [def]="d" [oeffentlich]="true" />
    }`,
})
export class OeffentlichesFormularComponent implements HatUngespeicherteAenderungen {
  readonly code = input.required<string>();
  readonly def = computed(() => formular(this.code()));
  private renderer = viewChild(FormularRendererComponent);
  ungespeichert() {
    return this.renderer()?.ungespeichert() ?? false;
  }
}
