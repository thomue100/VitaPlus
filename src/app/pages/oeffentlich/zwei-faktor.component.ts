import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { FeldfehlerComponent } from '../../shared/bausteine';

@Component({
  selector: 'vp-zwei-faktor',
  imports: [ReactiveFormsModule, FeldfehlerComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="karte" style="max-width:520px">
      <h1>Sicherheitscode eingeben</h1>
      <p>Wir haben Ihnen einen 6-stelligen Code per SMS an <strong>{{ ziel }}</strong> gesendet.</p>
      @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }
      <form [formGroup]="form" (ngSubmit)="bestaetigen()" novalidate>
        <div class="feld">
          <label for="code" class="pflicht">Sicherheitscode</label>
          <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" formControlName="code" />
          <vp-feldfehler [control]="form.controls.code" />
        </div>
        <div class="aktionen">
          <button type="submit" class="btn primaer" [disabled]="laedt()">Bestätigen</button>
          <button type="button" class="btn link" (click)="erneut()" [disabled]="wartezeit() > 0">Code erneut senden{{ wartezeit() > 0 ? ' (' + wartezeit() + ' s)' : '' }}</button>
          <button type="button" class="btn link" (click)="abbrechen()">Abbrechen</button>
        </div>
      </form>
    </section>`,
})
export class ZweiFaktorComponent {
  private fb = inject(FormBuilder);
  private sitzung = inject(SitzungService);
  private router = inject(Router);
  private ui = inject(UiService);
  readonly zielUrl = input<string>(undefined, { alias: 'ziel' });
  readonly fehler = signal<string | null>(null);
  readonly laedt = signal(false);
  readonly wartezeit = signal(30);
  readonly ziel: string = history.state?.ziel || 'Ihre Mobilnummer';
  form = this.fb.nonNullable.group({ code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });

  constructor() {
    const t = setInterval(() => {
      this.wartezeit.update(w => Math.max(0, w - 1));
      if (this.wartezeit() === 0) clearInterval(t);
    }, 1000);
  }

  async bestaetigen() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.laedt.set(true);
    try {
      await this.sitzung.codeBestaetigen(this.form.getRawValue().code);
      this.router.navigateByUrl(this.zielUrl() || this.sitzung.startseite());
    } catch (e: any) {
      if (e?.error?.code === 'SITZUNG_ABGELAUFEN') {
        this.ui.fehler(fehlertext(e));
        this.router.navigate(['/anmelden']);
        return;
      }
      this.fehler.set(fehlertext(e));
      this.form.reset();
    } finally {
      this.laedt.set(false);
    }
  }

  async erneut() {
    try {
      await this.sitzung.codeErneutSenden();
      this.ui.info('Wir haben Ihnen einen neuen Code gesendet.');
      this.wartezeit.set(30);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
      this.router.navigate(['/anmelden']);
    }
  }

  abbrechen() {
    this.sitzung.zweiFaktorAbbrechen();
    this.router.navigate(['/anmelden']);
  }
}
