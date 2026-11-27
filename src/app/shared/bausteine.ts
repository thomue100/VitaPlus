import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { ERLAUBTE_DATEITYPEN, MAX_ANHANG_BYTES } from '../core/konfiguration';
import { Anhang } from '../core/models';
import { DateigroessePipe, StatusTextPipe, statusFarbe } from './pipes';
import { SymbolComponent } from './symbol.component';

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

import { Api } from '../core/services/api.service';
import { fehlertext } from '../core/services/auth.interceptor';
import { anhangOeffner } from './dokumente/anhang-oeffnen';
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
  imports: [DateigroessePipe, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="feld">
      <span class="label" [class.pflicht]="pflicht()">{{ label() }}</span>
      @if (hilfe()) { <span class="hilfe">{{ hilfe() }}</span> }
      <div class="upload" (dragover)="$event.preventDefault()" (drop)="fallenLassen($event)">
        <input #wahl type="file" [id]="id" [accept]="akzeptiert()" [multiple]="max() > 1" (change)="gewaehlt(wahl)" hidden />
        <input #kamera type="file" accept="image/*" capture="environment" (change)="gewaehlt(kamera)" hidden />
        <button type="button" class="btn klein" (click)="wahl.click()" [disabled]="dateien().length + laedt().length >= max()">Datei auswählen</button>
        <button type="button" class="btn klein kamera" (click)="kamera.click()" [disabled]="dateien().length + laedt().length >= max()">Foto aufnehmen</button>
        <span class="leise klein">PDF, JPG oder PNG, max. 5 MB{{ max() > 1 ? ', bis zu ' + max() + ' Dateien' : '' }} – oder Dateien hierher ziehen</span>
      </div>
      @if (fehler()) { <span class="feldfehler" role="alert">{{ fehler() }}</span> }
      @if (dateien().length || laedt().length) {
        <ul class="liste-ohne">
          @for (n of laedt(); track $index) { <li class="zeile leise" role="status"><span><span class="lade-punkt"></span> {{ n }} wird hochgeladen …</span></li> }
          @for (d of dateien(); track d.id) {
            <li class="zeile"><span><vp-symbol [name]="d.mimeType.startsWith('image/') ? 'camera' : 'file-text'" [groesse]="16" />
              <button type="button" class="btn link" (click)="ansehen(d)" [attr.aria-label]="'Datei ' + d.name + ' ansehen'">{{ d.name }}</button>
              <span class="leise klein">({{ typText(d.mimeType) }}, {{ d.groesseBytes | groesse }})</span></span>
              <button type="button" class="btn link" (click)="entfernen(d.id)" [attr.aria-label]="'Datei ' + d.name + ' entfernen'">Entfernen</button></li>
          }
        </ul>
      }
    </div>`,
  styles: [`.upload{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;border:1px dashed #9fb0b4;border-radius:6px;padding:.75rem;background:#fbfcfc}
    @media (min-width: 900px){.kamera{display:none}}
    .lade-punkt{display:inline-block;width:.7rem;height:.7rem;border-radius:50%;border:2px solid var(--vp-primaer);border-right-color:transparent;animation:dreh 1s linear infinite;vertical-align:middle}
    @keyframes dreh{to{transform:rotate(360deg)}}`],
})
export class DateienComponent {
  readonly label = input('Unterlagen');
  readonly hilfe = input<string>();
  readonly pflicht = input(false);
  readonly max = input(5);
  readonly nurBilder = input(false);
  readonly dateien = model<Anhang[]>([]);
  readonly fehler = signal<string | null>(null);
  /** Dateien, deren Übertragung noch läuft */
  readonly laedt = signal<string[]>([]);
  readonly id = 'upload-' + ++uploadZaehler;
  private api = inject(Api);
  private oeffnen = anhangOeffner();

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

  private async hinzufuegen(files: File[]) {
    this.fehler.set(null);
    const geprueft: File[] = [];
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
      geprueft.push(f);
    }
    const frei = this.max() - this.dateien().length - this.laedt().length;
    if (geprueft.length > frei) this.fehler.set(`Es sind höchstens ${this.max()} Dateien erlaubt.`);
    // Jede Datei einzeln übertragen; die Antwort des Servers ist der Anhang mit der vergebenen ID
    await Promise.all(geprueft.slice(0, Math.max(0, frei)).map(async f => {
      this.laedt.update(l => [...l, f.name]);
      try {
        const anhang = await this.api.hochladen<Anhang>('/api/dateien', f);
        this.dateien.update(l => [...l, anhang]);
      } catch (e) {
        this.fehler.set(fehlertext(e, `„${f.name}“ konnte nicht hochgeladen werden.`));
      } finally {
        this.laedt.update(l => { const i = l.indexOf(f.name); return i < 0 ? l : [...l.slice(0, i), ...l.slice(i + 1)]; });
      }
    }));
  }

  entfernen(id: string) {
    this.dateien.set(this.dateien().filter(d => d.id !== id));
  }

  ansehen(a: Anhang) {
    this.oeffnen(a);
  }

  typText(mime: string) {
    return mime === 'application/pdf' ? 'PDF' : mime === 'image/png' ? 'PNG' : 'JPG';
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
