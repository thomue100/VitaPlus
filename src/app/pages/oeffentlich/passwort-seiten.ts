import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, isDevMode, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { FeldfehlerComponent } from '../../shared/bausteine';
import { PasswortStaerkeComponent } from '../../shared/passwort-staerke.component';
import { serverfehlerSetzen, VpValidatoren } from '../../shared/validatoren';

@Component({
  selector: 'vp-passwort-vergessen',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="karte formular">
      <h1>Passwort vergessen</h1>
      @if (meldung()) {
        <div class="hinweis erfolg" role="status">{{ meldung() }}</div>
        @if (link()) { <p class="hinweis info klein">Entwicklungsumgebung – simulierte E-Mail: <a [href]="link()">Link zum Zurücksetzen öffnen</a></p> }
        <a routerLink="/anmelden">Zurück zur Anmeldung</a>
      } @else {
        <p>Geben Sie Ihre E-Mail-Adresse und Ihr Geburtsdatum ein. Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort vergeben. Ein gesperrter Zugang wird dabei entsperrt.</p>
        <form [formGroup]="form" (ngSubmit)="senden()" novalidate>
          <div class="feldgruppe">
            <div class="feld"><label for="email" class="pflicht">E-Mail-Adresse</label><input id="email" type="email" formControlName="email" /><vp-feldfehler [control]="form.controls.email" /></div>
            <div class="feld"><label for="geb" class="pflicht">Geburtsdatum</label><input id="geb" type="date" formControlName="geburtsdatum" /><vp-feldfehler [control]="form.controls.geburtsdatum" /></div>
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit">Link anfordern</button><a routerLink="/anmelden">Abbrechen</a></div>
        </form>
        <p class="klein leise mt">Keine E-Mail-Adresse mehr? Melden Sie sich mit dem <a routerLink="/anmelden/identitaet" [queryParams]="{ verfahren: 'EID' }">Online-Ausweis</a> an oder rufen Sie uns an.</p>
      }
    </section>`,
})
export class PasswortVergessenComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  readonly meldung = signal<string | null>(null);
  readonly link = signal<string | null>(null);
  form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], geburtsdatum: ['', Validators.required] });

  async senden() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const r = await firstValueFrom(this.http.post<any>('/api/passwort/vergessen', this.form.getRawValue()));
    this.meldung.set(r.meldung);
    if (isDevMode()) this.link.set(r.entwicklerLink || null);
  }
}

@Component({
  selector: 'vp-passwort-neu',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent, PasswortStaerkeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="karte formular">
      <h1>Neues Passwort vergeben</h1>
      @if (ungueltig()) {
        <div class="hinweis fehler" role="alert">{{ ungueltig() }}</div><a routerLink="/passwort-vergessen">Neuen Link anfordern</a>
      } @else {
        <form [formGroup]="form" (ngSubmit)="speichern()" novalidate>
          <div class="feldgruppe">
            <div class="feld"><label for="pw" class="pflicht">Neues Passwort</label><input id="pw" type="password" formControlName="passwort" autocomplete="new-password" /><vp-feldfehler [control]="form.controls.passwort" /></div>
            <div class="feld"><label for="pw2" class="pflicht">Wiederholen</label><input id="pw2" type="password" formControlName="passwort2" autocomplete="new-password" /><vp-feldfehler [control]="form.controls.passwort2" /></div>
            <div class="breit"><vp-passwort-staerke [passwort]="form.controls.passwort.value" /></div>
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit">Passwort speichern</button></div>
        </form>
      }
    </section>`,
})
export class PasswortNeuComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);
  private ui = inject(UiService);
  readonly token = input<string>('');
  readonly ungueltig = signal<string | null>(null);
  form = this.fb.nonNullable.group({ passwort: ['', [Validators.required, VpValidatoren.passwort]], passwort2: ['', Validators.required] },
    { validators: VpValidatoren.gleich('passwort', 'passwort2') });

  async ngOnInit() {
    try {
      await firstValueFrom(this.http.get('/api/passwort/token', { params: { token: this.token() } }));
    } catch (e) {
      this.ungueltig.set(fehlertext(e));
    }
  }

  async speichern() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    try {
      await firstValueFrom(this.http.post('/api/passwort/neu', { token: this.token(), passwort: this.form.getRawValue().passwort }));
      this.ui.erfolg('Ihr Passwort wurde geändert. Ihr Zugang ist entsperrt.');
      this.router.navigate(['/anmelden']);
    } catch (e) {
      if (!serverfehlerSetzen(this.form, e)) this.ungueltig.set(fehlertext(e));
    }
  }
}

@Component({
  selector: 'vp-aktivieren',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="karte formular">
      <h1>Zugang aktivieren</h1>
      <p>Geben Sie den Aktivierungscode aus unserem Brief ein.</p>
      @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }
      <form [formGroup]="form" (ngSubmit)="aktivieren()" novalidate>
        <div class="feldgruppe">
          <div class="feld"><label for="vnr" class="pflicht">Versichertennummer</label><input id="vnr" formControlName="versichertennummer" /><vp-feldfehler [control]="form.controls.versichertennummer" /></div>
          <div class="feld"><label for="code" class="pflicht">Aktivierungscode</label><input id="code" formControlName="aktivierungscode" placeholder="XXXX-XXXX" /><vp-feldfehler [control]="form.controls.aktivierungscode" /></div>
        </div>
        <div class="aktionen"><button class="btn primaer" type="submit">Aktivieren</button><a routerLink="/anmelden">Abbrechen</a></div>
      </form>
    </section>`,
})
export class AktivierenComponent implements OnInit {
  readonly nr = input<string>();
  ngOnInit() {
    if (this.nr()) this.form.patchValue({ versichertennummer: this.nr()!.toUpperCase() });
  }
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);
  private ui = inject(UiService);
  readonly fehler = signal<string | null>(null);
  form = this.fb.nonNullable.group({
    versichertennummer: ['', [Validators.required, VpValidatoren.versichertennummer]],
    aktivierungscode: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/)]],
  });

  async aktivieren() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    try {
      await firstValueFrom(this.http.post('/api/registrierung/aktivieren', this.form.getRawValue()));
      this.ui.erfolg('Ihr Zugang ist aktiviert. Sie können sich jetzt anmelden.');
      this.router.navigate(['/anmelden']);
    } catch (e) {
      if (!serverfehlerSetzen(this.form, e)) this.fehler.set(fehlertext(e));
    }
  }
}
