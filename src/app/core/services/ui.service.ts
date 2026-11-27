import { Injectable, signal } from '@angular/core';

export interface Hinweis {
  id: number;
  art: 'erfolg' | 'fehler' | 'info';
  text: string;
}

export interface Bestaetigung {
  titel: string;
  text: string;
  bestaetigen: string;
  abbrechen: string;
  gefaehrlich: boolean;
  aufloesen: (ok: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class UiService {
  readonly hinweise = signal<Hinweis[]>([]);
  readonly dialog = signal<Bestaetigung | null>(null);
  private zaehler = 0;

  erfolg(text: string) {
    this.zeigen('erfolg', text);
  }

  fehler(text: string) {
    this.zeigen('fehler', text, 8000);
  }

  info(text: string) {
    this.zeigen('info', text);
  }

  private zeigen(art: Hinweis['art'], text: string, dauer = 5000) {
    const h = { id: ++this.zaehler, art, text };
    this.hinweise.update(l => [...l, h]);
    setTimeout(() => this.schliessen(h.id), dauer);
  }

  schliessen(id: number) {
    this.hinweise.update(l => l.filter(h => h.id !== id));
  }

  bestaetigen(titel: string, text: string, optionen: Partial<Pick<Bestaetigung, 'bestaetigen' | 'abbrechen' | 'gefaehrlich'>> = {}): Promise<boolean> {
    return new Promise(resolve => {
      this.dialog.set({
        titel, text,
        bestaetigen: optionen.bestaetigen ?? 'Ja',
        abbrechen: optionen.abbrechen ?? 'Abbrechen',
        gefaehrlich: optionen.gefaehrlich ?? false,
        aufloesen: ok => {
          this.dialog.set(null);
          resolve(ok);
        },
      });
    });
  }
}
