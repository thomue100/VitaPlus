import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { formular } from '../../core/formulare/formular-katalog';
import { FormularDef } from '../../core/formulare/formular-typen';
import { Anhang } from '../../core/models';
import { HatUngespeicherteAenderungen } from '../../core/services/guards';
import { VorgangApi } from '../../core/services/vorgang-api.service';
import { FormularRendererComponent } from '../../shared/formular-renderer.component';

@Component({
  selector: 'vp-antrag',
  imports: [RouterLink, FormularRendererComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/antraege">Anträge</a> › {{ def()?.kurz }}</p>
    @if (def(); as d) {
      <div class="seitenkopf"><div><h1>{{ d.titel }}</h1>
        <p class="leise">Zuständig: Team {{ d.zustaendig }} · Bearbeitungsdauer in der Regel bis zu {{ d.bearbeitungTage }} Tage</p></div></div>
      @if (bereit()) { <vp-formular [def]="d" [startdaten]="daten()" [startAnhaenge]="anhaenge()" [entwurfId]="id()" (fertig)="fertig($event)" /> }
    } @else if (fehler()) { <div class="hinweis fehler">{{ fehler() }}</div> }`,
})
export class AntragComponent implements OnInit, HatUngespeicherteAenderungen {
  private vorgangApi = inject(VorgangApi);
  private router = inject(Router);
  private title = inject(Title);
  readonly code = input<string>();
  readonly id = input<string>();
  readonly def = signal<FormularDef | undefined>(undefined);
  readonly daten = signal<Record<string, any>>({});
  readonly anhaenge = signal<Anhang[]>([]);
  readonly bereit = signal(false);
  readonly fehler = signal<string | null>(null);
  private renderer = viewChild(FormularRendererComponent);

  async ngOnInit() {
    let code = this.code();
    if (this.id()) {
      try {
        const v = await this.vorgangApi.detail(this.id()!);
        if (v.status !== 'ENTWURF') {
          this.router.navigate(['/vorgaenge', v.id]);
          return;
        }
        code = v.typ;
        this.daten.set(v.daten);
        this.anhaenge.set(v.anhaenge);
      } catch {
        this.fehler.set('Der Entwurf wurde nicht gefunden.');
        return;
      }
    }
    const d = formular(code || '');
    if (!d || d.oeffentlich && d.code !== 'TODESFALL') {
      this.fehler.set('Dieser Antrag ist nicht verfügbar.');
      return;
    }
    this.def.set(d);
    this.title.setTitle(`${d.kurz} – VitaPlus`);
    this.bereit.set(true);
  }

  fertig(r: any) {
    if (r?.entwurf) this.router.navigate(['/antraege']);
  }

  ungespeichert() {
    return this.renderer()?.ungespeichert() ?? false;
  }
}
