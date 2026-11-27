import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { ERLAUBTE_DATEITYPEN, MAX_ANHANG_BYTES } from '../core/konfiguration';
import { Anhang } from '../core/models';
import { DateigroessePipe, StatusTextPipe, statusFarbe } from './pipes';

const MELDUNGEN: Record<string, (e: any) => string> = {
  required: () => 'Bitte füllen Sie dieses Feld aus.',
  requiredTrue: () => 'Bitte bestätigen Sie diese Angabe.',
  email: () => 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
  minlength: e => `Bitte geben Sie mindestens ${e.requiredLength} Zeichen ein.`,
  maxlength: e => `Höchstens ${e.requiredLength} Zeichen erlaubt.`,
  min: e => `Der Wert muss mindestens ${e.min} betragen.`,
  max: e => `Der Wert darf höchstens ${e.max} betragen.`,
  pattern: () => 'Bitte prüfen Sie das Format.',
  iban: () => 'Die IBAN ist ungültig.',
  plz: () => 'Bitte geben Sie eine gültige Postleitzahl ein.',
  telefon: () => 'Bitte prüfen Sie die Telefonnummer.',
  versichertennummer: () => 'Ein Großbuchstabe gefolgt von 9 Ziffern, z. B. A123456789.',
  datumZukunft: () => 'Das Datum darf nicht in der Zukunft liegen.',
  datumVergangenheit: () => 'Das Datum darf nicht in der Vergangenheit liegen.',
  passwort: () => 'Das Passwort erfüllt nicht alle Anforderungen.',
  passwortGleich: () => 'Die Passwörter stimmen nicht überein.',
  steuerId: () => 'Die Steuer-ID ist ungültig.',
  server: e => e,
};

@Component({
  selector: 'vp-feldfehler',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `@if (meldung(); as m) { <span class="feldfehler" role="alert">{{ m }}</span> }`,
})
export class FeldfehlerComponent {
  readonly control = input.required<AbstractControl | null>();
  readonly erzwingen = input(false);

  meldung(): string | null {
    const c = this.control();
    if (!c || !c.errors || (!c.touched && !this.erzwingen())) return null;
    const [schluessel, wert] = Object.entries(c.errors)[0];
    return (MELDUNGEN[schluessel] || (() => 'Ungültige Eingabe.'))(wert);
  }
}

@Component({
  selector: 'vp-status',
  imports: [StatusTextPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<span class="badge {{ farbe() }}">{{ wert() | statusText }}</span>`,
})
export class StatusComponent {
  readonly wert = input<string | undefined | null>();
  readonly farbe = computed(() => statusFarbe(this.wert() || undefined));
}

let uploadZaehler = 0;

@Component({
  selector: 'vp-dateien',
  imports: [DateigroessePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="feld">
      <span class="label" [class.pflicht]="pflicht()">{{ label() }}</span>
      @if (hilfe()) { <span class="hilfe">{{ hilfe() }}</span> }
      <div class="upload" (dragover)="$event.preventDefault()" (drop)="fallenLassen($event)">
        <input #wahl type="file" [id]="id" [accept]="akzeptiert()" [multiple]="max() > 1" (change)="gewaehlt(wahl)" hidden />
        <input #kamera type="file" accept="image/*" capture="environment" (change)="gewaehlt(kamera)" hidden />
        <button type="button" class="btn klein" (click)="wahl.click()" [disabled]="dateien().length >= max()">Datei auswählen</button>
        <button type="button" class="btn klein kamera" (click)="kamera.click()" [disabled]="dateien().length >= max()">Foto aufnehmen</button>
        <span class="leise klein">PDF, JPG oder PNG, max. 5 MB{{ max() > 1 ? ', bis zu ' + max() + ' Dateien' : '' }} – oder Dateien hierher ziehen</span>
      </div>
      @if (fehler()) { <span class="feldfehler" role="alert">{{ fehler() }}</span> }
      @if (dateien().length) {
        <ul class="liste-ohne">
          @for (d of dateien(); track d.id) {
            <li class="zeile"><span>📄 {{ d.name }} <span class="leise klein">({{ d.groesseBytes | groesse }})</span></span>
              <button type="button" class="btn link" (click)="entfernen(d.id)" [attr.aria-label]="'Datei ' + d.name + ' entfernen'">Entfernen</button></li>
          }
        </ul>
      }
    </div>`,
  styles: [`.upload{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;border:1px dashed #9fb0b4;border-radius:6px;padding:.75rem;background:#fbfcfc}
    @media (min-width: 900px){.kamera{display:none}}`],
})
export class DateienComponent {
  readonly label = input('Unterlagen');
  readonly hilfe = input<string>();
  readonly pflicht = input(false);
  readonly max = input(5);
  readonly nurBilder = input(false);
  readonly dateien = model<Anhang[]>([]);
  readonly fehler = signal<string | null>(null);
  readonly id = 'upload-' + ++uploadZaehler;

  akzeptiert() {
    return this.nurBilder() ? 'image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png';
  }

  gewaehlt(el: HTMLInputElement) {
    this.hinzufuegen(Array.from(el.files || []));
    el.value = '';
  }

  fallenLassen(e: DragEvent) {
    e.preventDefault();
    this.hinzufuegen(Array.from(e.dataTransfer?.files || []));
  }

  private hinzufuegen(files: File[]) {
    this.fehler.set(null);
    const neu: Anhang[] = [];
    for (const f of files) {
      const typ = f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
      if (!ERLAUBTE_DATEITYPEN.includes(typ) || (this.nurBilder() && typ === 'application/pdf')) {
        this.fehler.set(`„${f.name}“ hat ein nicht unterstütztes Format.`);
        continue;
      }
      if (f.size > MAX_ANHANG_BYTES) {
        this.fehler.set(`„${f.name}“ ist größer als 5 MB.`);
        continue;
      }
      if (f.size === 0) {
        this.fehler.set(`„${f.name}“ ist leer.`);
        continue;
      }
      neu.push({ id: Math.random().toString(36).substring(2, 10), name: f.name, groesseBytes: f.size, mimeType: typ, hochgeladenAm: new Date().toISOString() });
    }
    const gesamt = [...this.dateien(), ...neu];
    if (gesamt.length > this.max()) this.fehler.set(`Es sind höchstens ${this.max()} Dateien erlaubt.`);
    this.dateien.set(gesamt.slice(0, this.max()));
  }

  entfernen(id: string) {
    this.dateien.set(this.dateien().filter(d => d.id !== id));
  }
}

@Component({
  selector: 'vp-sterne',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<div class="sterne" role="radiogroup" [attr.aria-label]="label()">
    @for (s of [1,2,3,4,5]; track s) {
      <button type="button" role="radio" [attr.aria-checked]="wert() === s" [attr.aria-label]="s + ' von 5 Sternen'" [class.an]="s <= wert()" (click)="wert.set(s)">★</button>
    }</div>`,
  styles: [`.sterne button{background:none;border:none;font-size:1.8rem;color:#c8d2d4;cursor:pointer;padding:0 .1rem}.sterne button.an{color:var(--vp-akzent)}`],
})
export class SterneComponent {
  readonly label = input('Bewertung');
  readonly wert = model(0);
}

export const BAUSTEINE = [FeldfehlerComponent, StatusComponent, DateienComponent, SterneComponent];
