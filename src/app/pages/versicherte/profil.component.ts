import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Aenderung, Anhang } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { ProfilApi } from '../../core/services/versicherten-api.service';
import { heuteIso } from '../../core/util/datum';
import { formatiereIban, normalisiereIban } from '../../core/util/pruefungen';
import { DateienComponent, FeldfehlerComponent } from '../../shared/bausteine';
import { DatumPipe } from '../../shared/pipes';
import { serverfehlerSetzen, VpValidatoren } from '../../shared/validatoren';
import { DatumEingabeComponent } from '../../shared/datum-eingabe.component';

type Reiter = 'uebersicht' | 'adresse' | 'kontakt' | 'bank' | 'weitere' | 'name' | 'kommunikation' | 'historie';

const FAMILIENSTAND: Record<string, string> = { LEDIG: 'ledig', VERHEIRATET: 'verheiratet', LEBENSPARTNERSCHAFT: 'eingetragene Lebenspartnerschaft', GESCHIEDEN: 'geschieden', VERWITWET: 'verwitwet', GETRENNT: 'getrennt lebend' };

@Component({
  selector: 'vp-profil',
  imports: [DatumEingabeComponent, ReactiveFormsModule, RouterLink, FeldfehlerComponent, DateienComponent, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let b = sitzung.benutzer()!;
    <div class="seitenkopf"><div><h1>Persönliche Daten</h1><p class="leise">Halten Sie Ihre Daten aktuell – so erreichen Sie unsere Bescheide und Erstattungen sicher.</p></div></div>
    <nav class="reiter" aria-label="Bereiche">
      @for (r of reiterListe; track r[0]) { <button type="button" [class.aktiv]="reiter() === r[0]" (click)="wechseln(r[0])">{{ r[1] }}</button> }
    </nav>
    @switch (reiter()) {
      @case ('uebersicht') {
        <div class="raster-2">
          <section class="karte"><h2>Person</h2><dl class="daten">
            <dt>Name</dt><dd>{{ b.titel }} {{ b.vorname }} {{ b.nachname }}</dd>
            <dt>Geburtsdatum</dt><dd>{{ b.geburtsdatum | datum }}</dd>
            <dt>Geburtsort</dt><dd>{{ b.geburtsort || '–' }}</dd>
            <dt>Geburtsname</dt><dd>{{ b.geburtsname || '–' }}</dd>
            <dt>Familienstand</dt><dd>{{ familienstand(b.familienstand) }}</dd>
            <dt>Staatsangehörigkeit</dt><dd>{{ b.staatsangehoerigkeit || '–' }}</dd>
            <dt>Versichertennummer</dt><dd>{{ b.versichertennummer }}</dd>
          </dl></section>
          <section class="karte"><h2>Kontakt & Anschrift</h2><dl class="daten">
            <dt>Anschrift</dt><dd>{{ b.adresse.strasse }} {{ b.adresse.hausnummer }}<br />{{ b.adresse.plz }} {{ b.adresse.ort }}</dd>
            <dt>E-Mail</dt><dd>{{ b.email }}</dd>
            <dt>Telefon</dt><dd>{{ b.telefon || '–' }}</dd>
            <dt>Mobil</dt><dd>{{ b.mobil || '–' }}</dd>
            <dt>Bankverbindung</dt><dd>{{ b.bank ? b.bank.ibanMaskiert : 'nicht hinterlegt' }}</dd>
          </dl></section>
        </div>
      }
      @case ('adresse') {
        <form class="karte formular" [formGroup]="adresse" (ngSubmit)="adresseSpeichern()" novalidate>
          <h2>Neue Anschrift</h2>
          <div class="feldgruppe">
            <div class="feld"><label for="str" class="pflicht">Straße</label><input id="str" formControlName="strasse" autocomplete="address-line1" /><vp-feldfehler [control]="adresse.controls.strasse" /></div>
            <div class="feld"><label for="hnr" class="pflicht">Hausnummer</label><input id="hnr" formControlName="hausnummer" /><vp-feldfehler [control]="adresse.controls.hausnummer" /></div>
            <div class="feld"><label for="plz" class="pflicht">PLZ</label><input id="plz" formControlName="plz" inputmode="numeric" maxlength="5" autocomplete="postal-code" /><vp-feldfehler [control]="adresse.controls.plz" /></div>
            <div class="feld"><label for="ort" class="pflicht">Ort</label><input id="ort" formControlName="ort" autocomplete="address-level2" /><vp-feldfehler [control]="adresse.controls.ort" /></div>
            <div class="feld"><label for="land">Land</label><select id="land" formControlName="land">
              @for (l of ['Deutschland', 'Österreich', 'Schweiz', 'Niederlande', 'Polen', 'Sonstiges']; track l) { <option [value]="l">{{ l }}</option> }</select>
              <vp-feldfehler [control]="adresse.controls.land" /></div>
            <div class="feld"><label for="ab" class="pflicht">Gültig ab (Umzugsdatum)</label><vp-datum id="ab" formControlName="gueltigAb" /><vp-feldfehler [control]="adresse.controls.gueltigAb" /></div>
            <label class="auswahl breit"><input type="checkbox" formControlName="fuerFamilie" /> Anschrift auch für meine mitversicherten Familienangehörigen übernehmen</label>
          </div>
          @if (adresse.value.land !== 'Deutschland') { <div class="hinweis warnung">Bei einem Umzug ins Ausland kann sich Ihr Versicherungsschutz ändern. Bitte lassen Sie sich beraten.</div> }
          <div class="aktionen"><button class="btn primaer" type="submit">Adresse speichern</button></div>
        </form>
      }
      @case ('kontakt') {
        <div class="raster-2">
          <form class="karte" [formGroup]="kontakt" (ngSubmit)="kontaktSpeichern()" novalidate>
            <h2>Telefon</h2>
            <div class="feld mb"><label for="tel">Telefon</label><input id="tel" type="tel" formControlName="telefon" /><vp-feldfehler [control]="kontakt.controls.telefon" /></div>
            <div class="feld mb"><label for="mob">Mobil</label><input id="mob" type="tel" formControlName="mobil" /><vp-feldfehler [control]="kontakt.controls.mobil" />
              @if (b.zweiFaktorAktiv) { <span class="hilfe">Ihre Mobilnummer wird für die Zwei-Faktor-Anmeldung verwendet.</span> }</div>
            <button class="btn primaer" type="submit">Speichern</button>
          </form>
          <form class="karte" [formGroup]="email" (ngSubmit)="emailSpeichern()" novalidate>
            <h2>E-Mail-Adresse</h2>
            <p class="klein leise">Aktuell: {{ b.email }}</p>
            <div class="feld mb"><label for="em" class="pflicht">Neue E-Mail-Adresse</label><input id="em" type="email" formControlName="email" /><vp-feldfehler [control]="email.controls.email" /></div>
            <div class="feld mb"><label for="em-pw" class="pflicht">Ihr Passwort zur Bestätigung</label><input id="em-pw" type="password" formControlName="passwort" autocomplete="current-password" /><vp-feldfehler [control]="email.controls.passwort" /></div>
            <button class="btn primaer" type="submit">E-Mail ändern</button>
          </form>
        </div>
      }
      @case ('bank') {
        <form class="karte formular" [formGroup]="bank" (ngSubmit)="bankSpeichern()" novalidate>
          <h2>Bankverbindung</h2>
          @if (b.bank) { <p class="leise">Aktuell: {{ b.bank.ibanMaskiert }} ({{ b.bank.bankname || 'Bank unbekannt' }}), Kontoinhaber {{ b.bank.kontoinhaber }}</p> }
          <div class="feldgruppe">
            <div class="feld"><label for="inh" class="pflicht">Kontoinhaber/in</label><input id="inh" formControlName="kontoinhaber" /><vp-feldfehler [control]="bank.controls.kontoinhaber" /></div>
            <div class="feld"><label for="iban" class="pflicht">IBAN</label><input id="iban" formControlName="iban" (blur)="ibanFormatieren()" autocomplete="off" />
              <vp-feldfehler [control]="bank.controls.iban" />@if (bankname()) { <span class="hilfe">{{ bankname() }}</span> }</div>
            <div class="feld"><label for="bic">BIC (nur bei ausländischen Konten)</label><input id="bic" formControlName="bic" /><vp-feldfehler [control]="bank.controls.bic" /></div>
            @if (abweichenderInhaber()) {
              <label class="auswahl breit"><input type="checkbox" formControlName="zustimmungKontoinhaber" /> <span class="pflicht">Der Kontoinhaber ist mit der Verwendung des Kontos einverstanden.</span></label>
              <vp-feldfehler class="breit" [control]="bank.controls.zustimmungKontoinhaber" />
            }
            <label class="auswahl breit"><input type="checkbox" formControlName="sepaMandat" /> SEPA-Lastschriftmandat für meine Beiträge erteilen (Gläubiger-ID DE98ZZZ09999999999)</label>
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit">Bankverbindung speichern</button>
            @if (b.bank) { <button class="btn gefahr" type="button" (click)="bankLoeschen()">Bankverbindung löschen</button> }</div>
        </form>
      }
      @case ('weitere') {
        <div class="raster-2">
          <form class="karte" [formGroup]="weitere" (ngSubmit)="weitereSpeichern()" novalidate>
            <h2>Steuerliche Identifikationsnummer</h2>
            <p class="klein leise">Wir benötigen Ihre Steuer-ID, um Beiträge an das Finanzamt zu melden.</p>
            <div class="feld mb"><label for="stid">Steuer-ID</label><input id="stid" formControlName="steuerId" inputmode="numeric" maxlength="13" placeholder="11 Ziffern" /><vp-feldfehler [control]="weitere.controls.steuerId" /></div>
            <button class="btn primaer" type="submit">Speichern</button>
          </form>
          <section class="karte">
            <h2>Weitere Änderungen</h2>
            <ul class="liste-ohne">
              <li><a routerLink="/antraege/neu/FAMILIENSTAND">Familienstand ändern</a></li>
              <li><a routerLink="/antraege/neu/STAATSANGEHOERIGKEIT">Staatsangehörigkeit ändern</a></li>
              <li><a routerLink="/antraege/neu/STAMMDATEN_KORREKTUR">Fehlerhafte Geburtsdaten korrigieren</a></li>
              <li><button type="button" class="btn link" (click)="wechseln('name')">Namensänderung mitteilen</button></li>
            </ul>
          </section>
        </div>
      }
      @case ('name') {
        <form class="karte formular" [formGroup]="name" (ngSubmit)="namenAendern()" novalidate>
          <h2>Namensänderung</h2>
          <p class="leise">Nach der Prüfung erhalten Sie automatisch eine neue Gesundheitskarte.</p>
          <div class="feldgruppe">
            <div class="feld"><label for="nn" class="pflicht">Neuer Nachname</label><input id="nn" formControlName="nachname" /><vp-feldfehler [control]="name.controls.nachname" /></div>
            <div class="feld"><label for="ng" class="pflicht">Grund</label><select id="ng" formControlName="grund"><option value="">Bitte wählen</option>
              <option value="HEIRAT">Heirat / Lebenspartnerschaft</option><option value="SCHEIDUNG">Scheidung</option><option value="SONSTIGES">Sonstiges</option></select>
              <vp-feldfehler [control]="name.controls.grund" /></div>
            <div class="feld"><label for="nab" class="pflicht">Gültig ab</label><vp-datum id="nab" formControlName="gueltigAb" /><vp-feldfehler [control]="name.controls.gueltigAb" /></div>
            <div class="breit"><vp-dateien label="Nachweis (z. B. Heiratsurkunde)" [pflicht]="true" [max]="2" [(dateien)]="nachweis" /></div>
          </div>
          <div class="aktionen"><button class="btn primaer" type="submit">Namensänderung beantragen</button></div>
        </form>
      }
      @case ('kommunikation') {
        <form class="karte formular" [formGroup]="komm" (ngSubmit)="kommSpeichern()">
          <h2>Wie möchten Sie von uns informiert werden?</h2>
          <div class="auswahlgruppe">
            <label class="auswahl"><input type="checkbox" formControlName="email" /> per E-Mail</label>
            <label class="auswahl"><input type="checkbox" formControlName="post" /> per Post</label>
            <label class="auswahl"><input type="checkbox" formControlName="sms" /> per SMS (nur kurze Hinweise)</label>
            <label class="auswahl"><input type="checkbox" formControlName="newsletter" /> Newsletter „VitaPlus aktuell“</label>
            <label class="auswahl"><input type="checkbox" formControlName="erinnerungVorsorge" /> Erinnerungen an Vorsorgeuntersuchungen</label>
          </div>
          <p class="klein leise mt">Wichtige Mitteilungen wie Bescheide erhalten Sie immer – mindestens per E-Mail oder Post.</p>
          <div class="aktionen"><button class="btn primaer" type="submit">Einstellungen speichern</button><a routerLink="/einstellungen/benachrichtigungen">Benachrichtigungen verwalten</a></div>
        </form>
      }
      @case ('historie') {
        <section class="karte"><h2>Änderungshistorie</h2>
          <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Zeitpunkt</th><th>Bereich</th><th>Vorher</th><th>Nachher</th><th>Durch</th></tr></thead><tbody>
            @for (h of historie(); track h.id) { <tr><td class="nowrap">{{ h.zeitpunkt | datum: true }}</td><td>{{ h.bereich }}</td><td>{{ h.alt }}</td><td>{{ h.neu }}</td><td>{{ h.von }}</td></tr> }
            @empty { <tr><td colspan="5" class="leer">Keine Änderungen gespeichert.</td></tr> }
          </tbody></table></div>
        </section>
      }
    }`,
})
export class ProfilComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  private profilApi = inject(ProfilApi);
  private api = inject(Api);
  private ui = inject(UiService);
  private fb = inject(FormBuilder);

  readonly reiterListe: [Reiter, string][] = [['uebersicht', 'Übersicht'], ['adresse', 'Adresse'], ['kontakt', 'Telefon & E-Mail'], ['bank', 'Bankverbindung'],
    ['weitere', 'Weitere Angaben'], ['name', 'Namensänderung'], ['kommunikation', 'Kontaktwege'], ['historie', 'Änderungshistorie']];
  readonly reiter = signal<Reiter>('uebersicht');
  readonly historie = signal<Aenderung[]>([]);
  readonly bankname = signal<string | null>(null);
  readonly nachweis = signal<Anhang[]>([]);
  readonly abweichenderInhaber = signal(false);

  adresse = this.fb.nonNullable.group({
    strasse: ['', [Validators.required, Validators.maxLength(80)]], hausnummer: ['', [Validators.required, Validators.maxLength(10)]],
    plz: ['', [Validators.required, VpValidatoren.plz]], ort: ['', Validators.required], land: ['Deutschland'],
    gueltigAb: [heuteIso(), Validators.required], fuerFamilie: [true],
  });
  kontakt = this.fb.nonNullable.group({ telefon: ['', VpValidatoren.telefon], mobil: ['', VpValidatoren.telefon] });
  email = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], passwort: ['', Validators.required] });
  bank = this.fb.nonNullable.group({
    kontoinhaber: ['', Validators.required], iban: ['', [Validators.required, VpValidatoren.iban]], bic: [''],
    zustimmungKontoinhaber: [false], sepaMandat: [false],
  });
  weitere = this.fb.nonNullable.group({ steuerId: ['', VpValidatoren.steuerId] });
  name = this.fb.nonNullable.group({ nachname: ['', [Validators.required, Validators.maxLength(60)]], grund: ['', Validators.required], gueltigAb: [heuteIso(), Validators.required] });
  komm = this.fb.nonNullable.group({ email: [true], post: [false], sms: [false], newsletter: [false], erinnerungVorsorge: [true] });

  ngOnInit() {
    this.formulareFuellen();
    this.bank.controls.kontoinhaber.valueChanges.subscribe(v => {
      const b = this.sitzung.benutzer()!;
      const abw = !!v && !v.toLowerCase().includes(b.nachname.toLowerCase());
      this.abweichenderInhaber.set(abw);
      this.bank.controls.zustimmungKontoinhaber.setValidators(abw ? Validators.requiredTrue : null);
      this.bank.controls.zustimmungKontoinhaber.updateValueAndValidity({ emitEvent: false });
    });
  }

  private formulareFuellen() {
    const b = this.sitzung.benutzer()!;
    this.adresse.patchValue({ ...b.adresse, gueltigAb: heuteIso() });
    this.kontakt.patchValue({ telefon: b.telefon || '', mobil: b.mobil || '' });
    this.weitere.patchValue({ steuerId: b.steuerId || '' });
    this.komm.patchValue(b.kommunikation);
    this.bank.reset({ kontoinhaber: b.bank?.kontoinhaber || `${b.vorname} ${b.nachname}`, iban: '', bic: '', zustimmungKontoinhaber: false, sepaMandat: b.bank?.sepaMandat || false });
  }

  async wechseln(r: Reiter) {
    this.reiter.set(r);
    if (r === 'historie') this.historie.set(await this.api.get('/api/profil/historie'));
  }

  familienstand(f?: string) {
    return f ? FAMILIENSTAND[f] : '–';
  }

  private async ausfuehren(form: { markAllAsTouched(): void; invalid: boolean } & any, aktion: () => Promise<any>, meldung: string) {
    form.markAllAsTouched();
    if (form.invalid) return false;
    try {
      await aktion();
      this.ui.erfolg(meldung);
      return true;
    } catch (e) {
      if (!serverfehlerSetzen(form, e)) this.ui.fehler(fehlertext(e));
      return false;
    }
  }

  adresseSpeichern() {
    this.ausfuehren(this.adresse, () => this.profilApi.adresse(this.adresse.getRawValue()), 'Ihre neue Anschrift wurde gespeichert.');
  }

  kontaktSpeichern() {
    this.ausfuehren(this.kontakt, () => this.profilApi.kontakt(this.kontakt.getRawValue()), 'Ihre Telefonnummern wurden gespeichert.');
  }

  async emailSpeichern() {
    const v = this.email.getRawValue();
    if (await this.ausfuehren(this.email, () => this.profilApi.email(v.email, v.passwort), 'Ihre E-Mail-Adresse wurde geändert.')) this.email.reset();
  }

  async ibanFormatieren() {
    const c = this.bank.controls.iban;
    c.setValue(formatiereIban(c.value));
    this.bankname.set(null);
    if (c.valid && c.value) {
      try {
        const r = await this.profilApi.bankSuche(normalisiereIban(c.value));
        this.bankname.set(r.bankname ? `${r.bankname} (${r.bic})` : null);
      } catch { /* ignorieren */ }
    }
  }

  async bankSpeichern() {
    if (await this.ausfuehren(this.bank, () => this.profilApi.bank(this.bank.getRawValue()), 'Ihre Bankverbindung wurde gespeichert.')) this.formulareFuellen();
  }

  async bankLoeschen() {
    if (!(await this.ui.bestaetigen('Bankverbindung löschen', 'Ohne Bankverbindung können wir keine Erstattungen und Prämien auszahlen. Wirklich löschen?', { bestaetigen: 'Löschen', gefaehrlich: true }))) return;
    try {
      await this.profilApi.bankEntfernen();
      this.ui.erfolg('Die Bankverbindung wurde gelöscht.');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  weitereSpeichern() {
    this.ausfuehren(this.weitere, async () => this.sitzung.setzen(await this.api.put('/api/profil/weitere', { steuerId: this.weitere.getRawValue().steuerId })), 'Ihre Angaben wurden gespeichert.');
  }

  async namenAendern() {
    if (!this.nachweis().length) {
      this.ui.fehler('Bitte laden Sie einen Nachweis hoch.');
      return;
    }
    if (await this.ausfuehren(this.name, () => this.profilApi.namensaenderung({ ...this.name.getRawValue(), anhaenge: this.nachweis() }), 'Ihre Namensänderung wurde eingereicht.')) {
      this.name.reset({ nachname: '', grund: '', gueltigAb: heuteIso() });
      this.nachweis.set([]);
    }
  }

  kommSpeichern() {
    this.ausfuehren(this.komm, () => this.profilApi.kommunikation(this.komm.getRawValue()), 'Ihre Kontaktwege wurden gespeichert.');
  }
}

