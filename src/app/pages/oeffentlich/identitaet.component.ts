import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { FeldfehlerComponent } from '../../shared/bausteine';
import { VpValidatoren } from '../../shared/validatoren';

/** Simulation der Weiterleitung zum Identitätsdienst (GesundheitsID-App bzw. AusweisApp). */
@Component({
  selector: 'vp-identitaet',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="karte identitaet" style="max-width:560px">
      <p class="klein leise">Externer Identitätsdienst · {{ dienst() }}</p>
      <h1>{{ verfahren() === 'EID' ? 'Mit dem Online-Ausweis anmelden' : 'Mit der GesundheitsID anmelden' }}</h1>
      @if (schritt() === 1) {
        <p>{{ verfahren() === 'EID' ? 'Halten Sie Ihren Personalausweis an Ihr Smartphone bzw. Kartenlesegerät.' : 'Bestätigen Sie die Anmeldung in der App Ihrer Krankenkasse.' }}</p>
        <div class="aktionen"><button class="btn primaer" type="button" (click)="schritt.set(2)">{{ verfahren() === 'EID' ? 'Ausweis wurde erkannt' : 'App geöffnet' }}</button>
          <a class="btn" routerLink="/anmelden">Abbrechen</a></div>
      } @else {
        @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }
        <form [formGroup]="form" (ngSubmit)="bestaetigen()" novalidate>
          <div class="feld mb">
            <label for="vnr" class="pflicht">Versichertennummer</label>
            <input id="vnr" formControlName="versichertennummer" autocomplete="off" placeholder="A123456789" />
            <vp-feldfehler [control]="form.controls.versichertennummer" />
          </div>
          <div class="feld mb">
            <label for="pin" class="pflicht">{{ verfahren() === 'EID' ? 'Ausweis-PIN' : 'PIN der GesundheitsID' }}</label>
            <input id="pin" type="password" inputmode="numeric" maxlength="6" formControlName="pin" />
            <vp-feldfehler [control]="form.controls.pin" />
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit" [disabled]="laedt()">Identität bestätigen</button>
            <a class="btn" routerLink="/anmelden">Abbrechen</a></div>
        </form>
      }
    </section>`,
  styles: [`.identitaet{border-top:6px solid #1d5d99}`],
})
export class IdentitaetComponent {
  private fb = inject(FormBuilder);
  private sitzung = inject(SitzungService);
  private router = inject(Router);
  readonly verfahren = input<'GESUNDHEITSID' | 'EID'>('GESUNDHEITSID');
  readonly dienst = computed(() => (this.verfahren() === 'EID' ? 'AusweisApp' : 'VitaPlus GesundheitsID'));
  readonly schritt = signal(1);
  readonly fehler = signal<string | null>(null);
  readonly laedt = signal(false);
  form = this.fb.nonNullable.group({
    versichertennummer: ['', [Validators.required, VpValidatoren.versichertennummer]],
    pin: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  async bestaetigen() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.laedt.set(true);
    try {
      const v = this.form.getRawValue();
      await this.sitzung.anmeldenExtern(this.verfahren(), v.versichertennummer.toUpperCase(), v.pin);
      this.router.navigateByUrl(this.sitzung.startseite());
    } catch (e) {
      this.fehler.set(fehlertext(e));
    } finally {
      this.laedt.set(false);
    }
  }
}
