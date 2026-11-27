import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { heute, parseIso } from '../core/util/datum';
import { istIbanGueltig, istPasswortRegelkonform, istPlzGueltig, istSteuerIdGueltig, istTelefonGueltig, istVersichertennummerFormal } from '../core/util/pruefungen';

const leer = (c: AbstractControl) => c.value === null || c.value === undefined || c.value === '';

export const VpValidatoren = {
  iban: (c: AbstractControl): ValidationErrors | null => (leer(c) || istIbanGueltig(c.value) ? null : { iban: true }),
  plz: (c: AbstractControl): ValidationErrors | null => (leer(c) || istPlzGueltig(c.value) ? null : { plz: true }),
  telefon: (c: AbstractControl): ValidationErrors | null => (leer(c) || istTelefonGueltig(c.value) ? null : { telefon: true }),
  versichertennummer: (c: AbstractControl): ValidationErrors | null => (leer(c) || istVersichertennummerFormal(c.value) ? null : { versichertennummer: true }),
  passwort: (c: AbstractControl): ValidationErrors | null => (leer(c) || istPasswortRegelkonform(c.value) ? null : { passwort: true }),
  steuerId: (c: AbstractControl): ValidationErrors | null => (leer(c) || istSteuerIdGueltig(c.value) ? null : { steuerId: true }),
  nichtZukunft: (c: AbstractControl): ValidationErrors | null => (leer(c) || parseIso(c.value) <= heute() ? null : { datumZukunft: true }),
  nichtVergangenheit: (c: AbstractControl): ValidationErrors | null => (leer(c) || parseIso(c.value) >= heute() ? null : { datumVergangenheit: true }),
  gleich(feldA: string, feldB: string): ValidatorFn {
    return (g: AbstractControl) => {
      const b = g.get(feldB);
      if (!b) return null;
      const fehler = g.get(feldA)?.value !== b.value;
      if (fehler) b.setErrors({ ...(b.errors || {}), passwortGleich: true });
      else if (b.errors?.['passwortGleich']) {
        const { passwortGleich, ...rest } = b.errors;
        b.setErrors(Object.keys(rest).length ? rest : null);
      }
      return null;
    };
  },
};

/** Überträgt einen feldbezogenen Backend-Fehler auf das passende Formularfeld. */
export function serverfehlerSetzen(form: AbstractControl, e: any): boolean {
  const feld = e?.error?.feld;
  const meldung = e?.error?.meldung;
  const c = feld ? form.get(feld) : null;
  if (c && meldung) {
    c.setErrors({ server: meldung });
    c.markAsTouched();
    return true;
  }
  return false;
}
