import { signal } from '@angular/core';

export interface Vorschau {
  titel: string;
  dateiname: string;
  blob: Blob;
  url: string;
}

/** Aktuell geöffnetes Dokument im Dokumentbetrachter (global, eine Instanz in der Shell). */
export const aktuelleVorschau = signal<Vorschau | null>(null);

export function dokumentAnzeigen(titel: string, blob: Blob, dateiname: string) {
  const alt = aktuelleVorschau();
  if (alt) URL.revokeObjectURL(alt.url);
  aktuelleVorschau.set({ titel, dateiname, blob, url: URL.createObjectURL(blob) });
}

export function vorschauSchliessen() {
  const alt = aktuelleVorschau();
  if (alt) setTimeout(() => URL.revokeObjectURL(alt.url), 1000);
  aktuelleVorschau.set(null);
}
