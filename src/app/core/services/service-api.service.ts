import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Arzt, BonusEintrag, BonusMassnahmeDef, DokumentAnforderung, Nachricht, Ordner, Termin, Vorgang } from '../models';

export interface BonusJahr {
  jahr: string;
  bestaetigt: number;
  offen: number;
  eingeloest: boolean;
  anrechenbar: number;
  auszahlbar: boolean;
}

export interface BonusDaten {
  katalog: BonusMassnahmeDef[];
  eintraege: BonusEintrag[];
  jahre: BonusJahr[];
  regeln: { euroProPunkt: number; mindestpunkteAuszahlung: number; maxPunkteProJahr: number; gesundheitsbudgetAufschlagProzent: number };
}

@Injectable({ providedIn: 'root' })
export class BonusApi {
  private http = inject(HttpClient);
  laden() {
    return firstValueFrom(this.http.get<BonusDaten>('/api/bonus'));
  }
  erfassen(daten: any) {
    return firstValueFrom(this.http.post<BonusEintrag>('/api/bonus', daten));
  }
  loeschen(id: string) {
    return firstValueFrom(this.http.delete(`/api/bonus/${id}`));
  }
  praemie(jahr: string, art: string) {
    return firstValueFrom(this.http.post<Vorgang>('/api/bonus/praemie', { jahr, art }));
  }
}

@Injectable({ providedIn: 'root' })
export class TerminApi {
  private http = inject(HttpClient);
  liste() {
    return firstValueFrom(this.http.get<Termin[]>('/api/termine'));
  }
  tage() {
    return firstValueFrom(this.http.get<string[]>('/api/termine/tage'));
  }
  slots(datum: string, kanal: string, filiale?: string) {
    const params: Record<string, string> = { datum, kanal };
    if (filiale) params['filiale'] = filiale;
    return firstValueFrom(this.http.get<{ uhrzeit: string; frei: boolean }[]>('/api/termine/slots', { params }));
  }
  buchen(daten: any) {
    return firstValueFrom(this.http.post<Termin>('/api/termine', daten));
  }
  stornieren(id: string) {
    return firstValueFrom(this.http.post<Termin>(`/api/termine/${id}/stornieren`, {}));
  }
}

export type NachrichtDetail = Nachricht & { verlauf: Nachricht[] };

@Injectable({ providedIn: 'root' })
export class PostfachApi {
  private http = inject(HttpClient);
  readonly ungelesen = signal(0);

  async zaehlerAktualisieren() {
    const z = await firstValueFrom(this.http.get<Record<string, number>>('/api/nachrichten/zaehler'));
    this.ungelesen.set(z['ungelesen']);
    return z;
  }
  liste(ordner: Ordner, suche = '', nurUngelesen = false) {
    return firstValueFrom(this.http.get<Nachricht[]>('/api/nachrichten', { params: { ordner, suche, ungelesen: String(nurUngelesen) } }));
  }
  async detail(id: string) {
    const n = await firstValueFrom(this.http.get<NachrichtDetail>(`/api/nachrichten/${id}`));
    this.zaehlerAktualisieren();
    return n;
  }
  aendern(id: string, daten: Partial<Pick<Nachricht, 'gelesen' | 'ordner' | 'wichtig'>>) {
    return firstValueFrom(this.http.put<Nachricht>(`/api/nachrichten/${id}`, daten));
  }
  loeschen(id: string) {
    return firstValueFrom(this.http.delete<{ verschoben?: boolean; geloescht?: boolean }>(`/api/nachrichten/${id}`));
  }
  papierkorbLeeren() {
    return firstValueFrom(this.http.delete<{ geloescht: number }>('/api/nachrichten/papierkorb'));
  }
  senden(daten: any) {
    return firstValueFrom(this.http.post<Nachricht>('/api/nachrichten', daten));
  }
}

export interface ArztSuche {
  treffer: number;
  seite: number;
  seiten: number;
  ergebnisse: (Arzt & { favorit: boolean })[];
}

@Injectable({ providedIn: 'root' })
export class ArztApi {
  private http = inject(HttpClient);
  suchen(filter: Record<string, any>) {
    const params: Record<string, string> = {};
    Object.entries(filter).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '' && v !== false) params[k] = String(v);
    });
    return firstValueFrom(this.http.get<ArztSuche>('/api/aerzte', { params }));
  }
  favoriten() {
    return firstValueFrom(this.http.get<(Arzt & { favorit: boolean })[]>('/api/aerzte/favoriten'));
  }
  favorit(id: string, setzen: boolean) {
    return firstValueFrom(setzen ? this.http.post(`/api/aerzte/${id}/favorit`, {}) : this.http.delete(`/api/aerzte/${id}/favorit`));
  }
}

export interface DokumentTyp {
  typ: string;
  bezeichnung: string;
  beschreibung: string;
  verfuegbar: boolean;
}

@Injectable({ providedIn: 'root' })
export class DokumentApi {
  private http = inject(HttpClient);
  laden() {
    return firstValueFrom(this.http.get<{ typen: DokumentTyp[]; euLaender: string[]; historie: DokumentAnforderung[] }>('/api/dokumente'));
  }
  erstellen(typ: string, parameter: Record<string, string>) {
    return firstValueFrom(this.http.post<{ titel: string; dateiname: string; zeilen: string[] }>('/api/dokumente', { typ, parameter }));
  }
}
