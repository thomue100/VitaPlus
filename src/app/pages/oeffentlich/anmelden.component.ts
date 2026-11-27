import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { FeldfehlerComponent } from '../../shared/bausteine';
import { SymbolComponent } from '../../shared/symbol.component';
import { laufzeit } from '../../core/laufzeit';

@Component({
  selector: 'vp-anmelden',
  imports: [ReactiveFormsModule, RouterLink, FeldfehlerComponent, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="anmelde-buehne">
      <section class="buehne-text" aria-labelledby="willkommen">
        <h1 id="willkommen">Online-Geschäftsstelle der VitaPlus</h1>
        <p class="einleitung">Reichen Sie Rechnungen ein, laden Sie Bescheinigungen herunter und verfolgen Sie Ihre Anträge, wann es Ihnen passt.</p>
        <h2 class="vorteile-titel">Nach der Anmeldung können Sie</h2>
        <ul class="vorteile">
          <li><vp-symbol name="camera" [groesse]="20" />Rechnungen und Belege als Foto oder PDF einreichen</li>
          <li><vp-symbol name="file-check" [groesse]="20" />Mitglieds- und Versicherungsbescheinigungen sofort herunterladen</li>
          <li><vp-symbol name="clock" [groesse]="20" />den Bearbeitungsstand Ihrer Anträge verfolgen</li>
          <li><vp-symbol name="mail" [groesse]="20" />Bescheide und Nachrichten sicher im Postfach empfangen</li>
          <li><vp-symbol name="map-pin" [groesse]="20" />Anschrift und Bankverbindung selbst ändern</li>
        </ul>
        <img class="buehne-bild" src="bilder/hero-familie.svg" alt="" width="600" height="420" />
      </section>

      <section class="karte anmelde-karte" aria-labelledby="anmelden-titel">
        <h2 id="anmelden-titel">Anmelden</h2>
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
            <div class="eingabe-mit-symbol"><vp-symbol name="user-round" [groesse]="18" /><input id="kennung" type="text" formControlName="kennung" autocomplete="username" /></div>
            <vp-feldfehler [control]="form.controls.kennung" />
          </div>
          <div class="feld mb">
            <label for="passwort" class="pflicht">Passwort</label>
            <div class="passwort">
              <div class="eingabe-mit-symbol"><vp-symbol name="lock" [groesse]="18" /><input id="passwort" [type]="zeigen() ? 'text' : 'password'" formControlName="passwort" autocomplete="current-password" /></div>
              <button type="button" class="btn link klein" (click)="zeigen.set(!zeigen())" [attr.aria-pressed]="zeigen()">{{ zeigen() ? 'Verbergen' : 'Anzeigen' }}</button>
            </div>
            <vp-feldfehler [control]="form.controls.passwort" />
          </div>
          <button type="submit" class="btn primaer breit" [disabled]="laedt()">{{ laedt() ? 'Anmeldung läuft …' : 'Anmelden' }}</button>
          <p class="zentriert mt"><a routerLink="/passwort-vergessen">Passwort vergessen?</a></p>
        </form>
        <div class="trenner"><span>oder sicher anmelden mit</span></div>
        <div class="alternativen">
          <a class="btn" routerLink="/anmelden/identitaet" [queryParams]="{ verfahren: 'GESUNDHEITSID' }"><vp-symbol name="fingerprint" [groesse]="18" /> GesundheitsID</a>
          <a class="btn" routerLink="/anmelden/identitaet" [queryParams]="{ verfahren: 'EID' }"><vp-symbol name="id-card" [groesse]="18" /> Online-Ausweis</a>
        </div>
        @if (demo) {
        <details class="testzugaenge">
          <summary><vp-symbol name="users" [groesse]="18" /> Testzugänge für die Demo</summary>
          <p class="leise klein">Ein Klick trägt die Zugangsdaten ein. Sicherheitscodes per SMS finden Sie unten rechts unter „Demo: E-Mail, SMS &amp; Testdaten“.</p>
          <ul>
            @for (t of testzugaenge; track t.kennung) {
              <li><button type="button" class="testzugang" (click)="eintragen(t.kennung, t.passwort)">
                <span class="initialen klein-initialen" [style.background]="t.farbe">{{ t.kuerzel }}</span>
                <span><strong>{{ t.name }}</strong><span class="leise klein">{{ t.rolle }}</span></span>
              </button></li>
            }
          </ul>
        </details>
        }
        <div class="neu-hier">
          <p class="fett">Neu in der Online-Geschäftsstelle?</p>
          <div class="aktionen"><a class="btn primaer-umriss" routerLink="/registrieren">Jetzt registrieren</a><a class="btn link" routerLink="/aktivieren">Aktivierungscode eingeben</a></div>
        </div>
      </section>
    </div>

    <section class="ohne-anmeldung" aria-labelledby="ohne-titel">
      <h2 id="ohne-titel">Auch ohne Anmeldung für Sie da</h2>
      <div class="kachelraster">
        @for (k of kacheln; track k.route) {
          <a class="symbolkachel" [routerLink]="k.route">
            <span class="kachel-symbol" [style.--ton]="k.ton"><vp-symbol [name]="k.symbol" [groesse]="24" /></span>
            <span class="kachel-titel">{{ k.titel }}</span>
            <span class="kachel-text">{{ k.text }}</span>
          </a>
        }
      </div>
    </section>

    <section class="wechsel-band" aria-labelledby="wechsel-titel">
      <div>
        <h2 id="wechsel-titel">Noch nicht bei der VitaPlus?</h2>
        <p>Werden Sie in wenigen Minuten online Mitglied – wir kümmern uns um den Wechsel und informieren Ihren Arbeitgeber.</p>
      </div>
      <a class="btn akzent" routerLink="/mitglied-werden">Mitglied werden</a>
    </section>`,
  styles: [`
    .anmelde-buehne { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(340px, 440px); gap: 2.5rem; align-items: start; }
    .buehne-text h1 { font-size: clamp(1.777rem, 3vw, 2.369rem); max-width: 20ch; margin-top: .5rem; }
    .vorteile-titel { font-size: 1.125rem; margin: 1.5rem 0 .5rem; }
    .einleitung { font-size: 1.1rem; color: var(--vp-text-leise); max-width: 52ch; }
    .vorteile { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .5rem; }
    .vorteile li { display: flex; align-items: flex-start; gap: .65rem; max-width: 52ch; }
    .vorteile vp-symbol { color: var(--vp-primaer); flex-shrink: 0; margin-top: .15rem; }
    .buehne-bild { width: 100%; max-width: 560px; height: auto; display: block; margin-top: 1.5rem; }
    .anmelde-karte { padding: 1.75rem; border-top: 4px solid var(--vp-primaer); position: sticky; top: 5.5rem; }
    .anmelde-karte h2 { margin-top: 0; font-size: 1.5rem; }
    .eingabe-mit-symbol { position: relative; flex: 1; display: flex; }
    .eingabe-mit-symbol vp-symbol { position: absolute; left: .75rem; top: 50%; transform: translateY(-50%); color: var(--vp-text-leise); }
    .eingabe-mit-symbol input { flex: 1; padding-left: 2.4rem; }
    .passwort { display: flex; gap: .5rem; align-items: center; }
    .breit { width: 100%; justify-content: center; }
    .trenner { display: flex; align-items: center; gap: .75rem; color: var(--vp-text-leise); font-size: .85rem; margin: 1.25rem 0 1rem; }
    .trenner::before, .trenner::after { content: ''; flex: 1; border-top: 1px solid var(--vp-rand); }
    .alternativen { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
    .alternativen .btn { justify-content: center; }
    .testzugaenge { margin-top: 1.25rem; border: 1px dashed #9fb7b3; border-radius: var(--vp-radius); padding: .6rem .9rem; background: #fbfdfc; }
    .testzugaenge summary { cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: .4rem; color: var(--vp-primaer); }
    .testzugaenge ul { list-style: none; padding: 0; margin: .5rem 0 0; display: grid; gap: .35rem; }
    .testzugang { display: flex; align-items: center; gap: .6rem; width: 100%; text-align: left; background: #fff; border: 1px solid var(--vp-rand); border-radius: var(--vp-radius-klein); padding: .45rem .6rem; font: inherit; cursor: pointer; }
    .testzugang:hover { border-color: var(--vp-primaer); }
    .testzugang > span:last-child { display: flex; flex-direction: column; line-height: 1.25; }
    .klein-initialen { width: 2rem; height: 2rem; border-radius: 50%; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 700; flex-shrink: 0; }
    .neu-hier { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--vp-rand); }
    .ohne-anmeldung { margin-top: 2.5rem; }
    .wechsel-band { margin-top: 2.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap; padding: 1.5rem 1.75rem; border-radius: var(--vp-radius); color: #fff; background: var(--vp-primaer-dunkel); }
    .wechsel-band h2 { margin: 0 0 .25rem; color: #fff; }
    .wechsel-band p { margin: 0; color: #d6efeb; max-width: 60ch; }
    @media (max-width: 960px) { .anmelde-buehne { grid-template-columns: 1fr; } .anmelde-karte { position: static; order: -1; } .buehne-bild { max-width: 420px; margin: 0 auto; } }
  `],
})
export class AnmeldenComponent {
  readonly demo = laufzeit.demo;
  readonly testzugaenge = [
    { name: 'Anna Schmidt', rolle: 'Angestellte, Tarif Komfort, Familie mitversichert', kennung: 'anna.schmidt@example.de', passwort: 'VitaPlus2026!', kuerzel: 'AS', farbe: '#0b6e69' },
    { name: 'Max Mustermann', rolle: 'Selbstständig, Zwei-Faktor-Anmeldung per SMS', kennung: 'max.mustermann@example.de', passwort: 'Sicher#2026', kuerzel: 'MM', farbe: '#1d6fb8' },
    { name: 'Dr. Erika Weber', rolle: 'Rentnerin, Pflegegrad 2', kennung: 'erika.weber@example.de', passwort: 'Erika!Weber1', kuerzel: 'EW', farbe: '#7c5cc4' },
    { name: 'Paul Weber', rolle: 'Bevollmächtigter für Erika Weber', kennung: 'paul.weber@example.de', passwort: 'Paul#Weber90', kuerzel: 'PW', farbe: '#c2507a' },
    { name: 'Jonas Klein', rolle: 'Student, Zugang gesperrt', kennung: 'jonas.klein@example.de', passwort: 'Jonas#Klein9', kuerzel: 'JK', farbe: '#d9822b' },
    { name: 'Sabine Müller', rolle: 'Sachbearbeitung Leistungen (mit SMS-Code)', kennung: 'sabine.mueller@vitaplus.de', passwort: 'Sachbearbeitung1!', kuerzel: 'SM', farbe: '#5b6b73' },
    { name: 'Administration', rolle: 'Betrieb und Monitoring (mit SMS-Code)', kennung: 'admin@vitaplus.de', passwort: 'Administration1!', kuerzel: 'AD', farbe: '#1d3b4a' },
  ];

  eintragen(kennung: string, passwort: string) {
    this.form.setValue({ kennung, passwort });
    this.fehler.set(null);
    document.getElementById('passwort')?.focus();
  }

  readonly kacheln = [
    { route: '/leistungen', symbol: 'book-open-text', titel: 'Leistungen A–Z', text: 'Was wir für Sie übernehmen', ton: '#0b6e69' },
    { route: '/leistungen/finder', symbol: 'sparkles', titel: 'Leistungsfinder', text: 'In drei Fragen zur passenden Leistung', ton: '#7c5cc4' },
    { route: '/rechner/beitrag', symbol: 'calculator', titel: 'Beitragsrechner', text: 'Ihren Beitrag 2026 berechnen', ton: '#d9822b' },
    { route: '/arztsuche', symbol: 'stethoscope', titel: 'Arztsuche', text: 'Praxen in Ihrer Nähe finden', ton: '#1d6fb8' },
    { route: '/kurse', symbol: 'dumbbell', titel: 'Gesundheitskurse', text: 'Zertifizierte Kurse mit Zuschuss', ton: '#2a9d8f' },
    { route: '/kontakt', symbol: 'headset', titel: 'Kontakt', text: 'Telefon, Chat und Filialen', ton: '#c2507a' },
  ];

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

