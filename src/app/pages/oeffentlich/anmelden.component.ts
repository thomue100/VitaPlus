import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { FeldfehlerComponent } from '../../shared/bausteine';

@Component({
  selector: 'vp-anmelden',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="raster-2">
      <section class="karte">
        <h1>Anmelden</h1>
        <p class="leise">Mit Ihrer E-Mail-Adresse oder Versichertennummer</p>
        @if (grund() === 'timeout') { <div class="hinweis warnung" role="status">Sie wurden aus Sicherheitsgründen nach 15 Minuten Inaktivität abgemeldet.</div> }
        @if (grund() === 'passwort') { <div class="hinweis erfolg" role="status">Ihr Passwort wurde geändert. Bitte melden Sie sich mit dem neuen Passwort an.</div> }
        @if (fehler()) {
          <div class="hinweis fehler" role="alert">
            {{ fehler() }}
            @if (gesperrt()) { <p class="mt"><a routerLink="/passwort-vergessen">Passwort zurücksetzen und Zugang entsperren</a></p> }
            @if (nichtAktiviert()) { <p class="mt"><a routerLink="/aktivieren">Jetzt mit Aktivierungscode freischalten</a></p> }
          </div>
        }
        <form [formGroup]="form" (ngSubmit)="anmelden()" novalidate>
          <div class="feld mb">
            <label for="kennung" class="pflicht">E-Mail-Adresse oder Versichertennummer</label>
            <input id="kennung" type="text" formControlName="kennung" autocomplete="username" />
            <vp-feldfehler [control]="form.controls.kennung" />
          </div>
          <div class="feld mb">
            <label for="passwort" class="pflicht">Passwort</label>
            <div class="passwort">
              <input id="passwort" [type]="zeigen() ? 'text' : 'password'" formControlName="passwort" autocomplete="current-password" />
              <button type="button" class="btn link klein" (click)="zeigen.set(!zeigen())" [attr.aria-pressed]="zeigen()">{{ zeigen() ? 'Verbergen' : 'Anzeigen' }}</button>
            </div>
            <vp-feldfehler [control]="form.controls.passwort" />
          </div>
          <div class="aktionen">
            <button type="submit" class="btn primaer" [disabled]="laedt()">{{ laedt() ? 'Anmeldung läuft …' : 'Anmelden' }}</button>
            <a routerLink="/passwort-vergessen">Passwort vergessen?</a>
          </div>
        </form>
        <hr class="mt-2" />
        <p class="fett">Oder sicher anmelden mit</p>
        <div class="aktionen">
          <a class="btn" routerLink="/anmelden/identitaet" [queryParams]="{ verfahren: 'GESUNDHEITSID' }">GesundheitsID</a>
          <a class="btn" routerLink="/anmelden/identitaet" [queryParams]="{ verfahren: 'EID' }">Online-Ausweis (eID)</a>
        </div>
      </section>
      <section>
        <div class="karte hervor">
          <h2>Neu hier?</h2>
          <p>Mit der Online-Geschäftsstelle erledigen Sie Ihre Anliegen rund um die Uhr – Rechnungen einreichen, Bescheinigungen herunterladen, Adressen ändern und vieles mehr.</p>
          <div class="aktionen"><a class="btn primaer" routerLink="/registrieren">Jetzt registrieren</a><a class="btn" routerLink="/aktivieren">Aktivierungscode eingeben</a></div>
        </div>
        <div class="karte">
          <h2>Noch nicht bei der VitaPlus?</h2>
          <p>Werden Sie in wenigen Minuten online Mitglied – wir kümmern uns um den Wechsel.</p>
          <a class="btn" routerLink="/mitglied-werden">Mitglied werden</a>
        </div>
        <div class="karte">
          <h2>Ohne Anmeldung</h2>
          <ul>
            <li><a routerLink="/leistungen">Leistungen A–Z</a> und <a routerLink="/leistungen/finder">Leistungsfinder</a></li>
            <li><a routerLink="/rechner/beitrag">Beitragsrechner</a></li>
            <li><a routerLink="/arztsuche">Arztsuche</a> und <a routerLink="/kurse">Gesundheitskurse</a></li>
            <li><a routerLink="/todesfall-melden">Todesfall melden</a></li>
          </ul>
        </div>
      </section>
    </div>`,
  styles: [`.passwort{display:flex;gap:.5rem;align-items:center}.passwort input{flex:1}hr{border:none;border-top:1px solid var(--vp-rand)}`],
})
export class AnmeldenComponent {
  private fb = inject(FormBuilder);
  private sitzung = inject(SitzungService);
  private router = inject(Router);

  readonly grund = input<string>();
  readonly ziel = input<string>();
  readonly fehler = signal<string | null>(null);
  readonly gesperrt = signal(false);
  readonly nichtAktiviert = signal(false);
  readonly laedt = signal(false);
  readonly zeigen = signal(false);

  form = this.fb.nonNullable.group({
    kennung: ['', [Validators.required]],
    passwort: ['', [Validators.required]],
  });

  async anmelden() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.laedt.set(true);
    this.fehler.set(null);
    try {
      const { kennung, passwort } = this.form.getRawValue();
      const a = await this.sitzung.anmelden(kennung.trim(), passwort);
      if (a.zweiFaktorErforderlich) {
        this.router.navigate(['/anmelden/code'], { state: { ziel: a.ziel }, queryParams: { ziel: this.ziel() } });
        return;
      }
      this.router.navigateByUrl(this.ziel() || this.sitzung.startseite());
    } catch (e: any) {
      this.fehler.set(fehlertext(e, 'Die Anmeldung ist fehlgeschlagen.'));
      this.gesperrt.set(e?.error?.code === 'GESPERRT');
      this.nichtAktiviert.set(e?.error?.code === 'NICHT_AKTIVIERT');
      this.form.controls.passwort.reset();
    } finally {
      this.laedt.set(false);
    }
  }
}

