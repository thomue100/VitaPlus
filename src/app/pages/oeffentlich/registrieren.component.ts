import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, isDevMode, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { fehlertext } from '../../core/services/auth.interceptor';
import { FeldfehlerComponent } from '../../shared/bausteine';
import { PasswortStaerkeComponent } from '../../shared/passwort-staerke.component';
import { serverfehlerSetzen, VpValidatoren } from '../../shared/validatoren';

@Component({
  selector: 'vp-registrieren',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent, PasswortStaerkeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>Registrierung für die Online-Geschäftsstelle</h1>
    <ol class="schritte">
      <li [class.aktiv]="schritt() === 1" [class.erledigt]="schritt() > 1">Mitgliedschaft prüfen</li>
      <li [class.aktiv]="schritt() === 2" [class.erledigt]="schritt() > 2">Identifizierung</li>
      <li [class.aktiv]="schritt() === 3" [class.erledigt]="schritt() > 3">Zugangsdaten</li>
      <li [class.aktiv]="schritt() === 4">Fertig</li>
    </ol>
    @if (fehler()) { <div class="hinweis fehler" role="alert">{{ fehler() }}</div> }

    @switch (schritt()) {
      @case (1) {
        <form class="karte formular" [formGroup]="pruefung" (ngSubmit)="pruefen()" novalidate>
          <p>Ihre Versichertennummer finden Sie auf der Vorderseite Ihrer Gesundheitskarte.</p>
          <div class="feldgruppe">
            <div class="feld"><label for="vnr" class="pflicht">Versichertennummer</label>
              <input id="vnr" formControlName="versichertennummer" placeholder="A123456789" (input)="grossschreiben()" />
              <vp-feldfehler [control]="pruefung.controls.versichertennummer" /></div>
            <div class="feld"><label for="geb" class="pflicht">Geburtsdatum</label>
              <input id="geb" type="date" formControlName="geburtsdatum" /><vp-feldfehler [control]="pruefung.controls.geburtsdatum" /></div>
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit" [disabled]="laedt()">Weiter</button><a routerLink="/anmelden">Abbrechen</a></div>
        </form>
      }
      @case (2) {
        <div class="karte formular">
          <p>Hallo {{ person()?.vorname }} {{ person()?.nachname }}! Zum Schutz Ihrer Sozialdaten müssen wir Ihre Identität bestätigen.</p>
          <fieldset><legend class="pflicht">Wie möchten Sie sich identifizieren?</legend>
            <div class="auswahlgruppe">
              <label class="auswahl"><input type="radio" name="ident" value="EID" [checked]="identifizierung() === 'EID'" (change)="identifizierung.set('EID')" />
                <span><strong>Online-Ausweis</strong> – sofort, mit Personalausweis und PIN</span></label>
              <label class="auswahl"><input type="radio" name="ident" value="GESUNDHEITSID" [checked]="identifizierung() === 'GESUNDHEITSID'" (change)="identifizierung.set('GESUNDHEITSID')" />
                <span><strong>GesundheitsID</strong> – sofort, wenn bereits eingerichtet</span></label>
              <label class="auswahl"><input type="radio" name="ident" value="POST" [checked]="identifizierung() === 'POST'" (change)="identifizierung.set('POST')" />
                <span><strong>Aktivierungscode per Post</strong> – Brief an {{ person()?.ort }} in 3–5 Werktagen</span></label>
            </div></fieldset>
          <div class="aktionen"><button class="btn" type="button" (click)="schritt.set(1)">Zurück</button>
            <button class="btn primaer" type="button" (click)="identifiziert()" [disabled]="!identifizierung()">Weiter</button></div>
        </div>
      }
      @case (3) {
        <form class="karte formular" [formGroup]="zugang" (ngSubmit)="registrieren()" novalidate>
          <div class="feldgruppe">
            <div class="feld breit"><label for="email" class="pflicht">E-Mail-Adresse</label>
              <input id="email" type="email" formControlName="email" autocomplete="email" /><vp-feldfehler [control]="zugang.controls.email" /></div>
            <div class="feld"><label for="pw" class="pflicht">Passwort</label>
              <input id="pw" type="password" formControlName="passwort" autocomplete="new-password" /><vp-feldfehler [control]="zugang.controls.passwort" /></div>
            <div class="feld"><label for="pw2" class="pflicht">Passwort wiederholen</label>
              <input id="pw2" type="password" formControlName="passwort2" autocomplete="new-password" /><vp-feldfehler [control]="zugang.controls.passwort2" /></div>
            <div class="breit"><vp-passwort-staerke [passwort]="zugang.controls.passwort.value" /></div>
            <div class="feld"><label for="mobil">Mobilnummer (für die Zwei-Faktor-Anmeldung)</label>
              <input id="mobil" type="tel" formControlName="mobil" autocomplete="tel" /><vp-feldfehler [control]="zugang.controls.mobil" /></div>
            <label class="auswahl breit"><input type="checkbox" formControlName="nutzungsbedingungen" /> <span class="pflicht">Ich akzeptiere die <a routerLink="/info/nutzungsbedingungen" target="_blank">Nutzungsbedingungen</a>.</span></label>
            <vp-feldfehler class="breit" [control]="zugang.controls.nutzungsbedingungen" />
            <label class="auswahl breit"><input type="checkbox" formControlName="datenschutz" /> <span class="pflicht">Ich habe die <a routerLink="/info/datenschutz" target="_blank">Datenschutzhinweise</a> zur Kenntnis genommen.</span></label>
            <vp-feldfehler class="breit" [control]="zugang.controls.datenschutz" />
          </div>
          <div class="aktionen"><button class="btn" type="button" (click)="schritt.set(2)">Zurück</button>
            <button class="btn primaer" type="submit" [disabled]="laedt()">Registrieren</button></div>
        </form>
      }
      @case (4) {
        <div class="karte hervor">
          @if (aktivierungPerPost()) {
            <h2>Fast geschafft!</h2>
            <p>Ihren Aktivierungscode senden wir Ihnen per Post. Sobald der Brief da ist, schalten Sie Ihren Zugang unter „Aktivierungscode eingeben“ frei.</p>
            @if (entwicklerCode()) { <p class="hinweis info klein">Entwicklungsumgebung – simulierter Brief: Aktivierungscode <strong>{{ entwicklerCode() }}</strong></p> }
            <a class="btn primaer" routerLink="/aktivieren">Aktivierungscode eingeben</a>
          } @else {
            <h2>Willkommen bei der VitaPlus Online-Geschäftsstelle!</h2>
            <p>Ihr Zugang ist eingerichtet. Sie können sich jetzt anmelden.</p>
            <a class="btn primaer" routerLink="/anmelden">Zur Anmeldung</a>
          }
        </div>
      }
    }`,
})
export class RegistrierenComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  readonly schritt = signal(1);
  readonly fehler = signal<string | null>(null);
  readonly laedt = signal(false);
  readonly person = signal<{ vorname: string; nachname: string; ort: string } | null>(null);
  readonly identifizierung = signal<'EID' | 'GESUNDHEITSID' | 'POST' | null>(null);
  readonly aktivierungPerPost = signal(false);
  readonly entwicklerCode = signal<string | null>(null);

  pruefung = this.fb.nonNullable.group({
    versichertennummer: ['', [Validators.required, VpValidatoren.versichertennummer]],
    geburtsdatum: ['', [Validators.required, VpValidatoren.nichtZukunft]],
  });
  zugang = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    passwort: ['', [Validators.required, VpValidatoren.passwort]],
    passwort2: ['', [Validators.required]],
    mobil: ['', [VpValidatoren.telefon]],
    nutzungsbedingungen: [false, Validators.requiredTrue],
    datenschutz: [false, Validators.requiredTrue],
  }, { validators: VpValidatoren.gleich('passwort', 'passwort2') });

  /** Vorbelegung aus dem Link in der Willkommens-E-Mail */
  readonly versichertennummer = input<string>();
  readonly geburtsdatum = input<string>();

  ngOnInit() {
    if (this.versichertennummer()) this.pruefung.patchValue({ versichertennummer: this.versichertennummer()!.toUpperCase(), geburtsdatum: this.geburtsdatum() || '' });
  }

  grossschreiben() {
    const c = this.pruefung.controls.versichertennummer;
    c.setValue(c.value.toUpperCase(), { emitEvent: false });
  }

  async pruefen() {
    this.pruefung.markAllAsTouched();
    if (this.pruefung.invalid) return;
    this.laedt.set(true);
    this.fehler.set(null);
    try {
      const person = await firstValueFrom(this.http.post<any>('/api/registrierung/pruefen', this.pruefung.getRawValue()));
      this.person.set(person);
      if (person.email && !this.zugang.controls.email.value) this.zugang.patchValue({ email: person.email });
      this.schritt.set(2);
    } catch (e) {
      if (!serverfehlerSetzen(this.pruefung, e)) this.fehler.set(fehlertext(e));
    } finally {
      this.laedt.set(false);
    }
  }

  identifiziert() {
    this.fehler.set(null);
    this.schritt.set(3);
  }

  async registrieren() {
    this.zugang.markAllAsTouched();
    if (this.zugang.invalid) return;
    this.laedt.set(true);
    this.fehler.set(null);
    try {
      const { passwort2, ...rest } = this.zugang.getRawValue();
      const r = await firstValueFrom(this.http.post<any>('/api/registrierung', { ...this.pruefung.getRawValue(), ...rest, identifizierung: this.identifizierung() }));
      this.aktivierungPerPost.set(r.aktivierungPerPost);
      if (isDevMode()) this.entwicklerCode.set(r.entwicklerCode || null);
      this.schritt.set(4);
    } catch (e) {
      if (!serverfehlerSetzen(this.zugang, e)) this.fehler.set(fehlertext(e));
    } finally {
      this.laedt.set(false);
    }
  }
}
