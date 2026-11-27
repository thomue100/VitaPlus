import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Vorgang, VorgangTyp } from '../models';

export interface Person {
  id: string;
  name: string;
  geburtsdatum: string;
}

export interface Budget {
  leistung: string;
  jahr: string;
  bereitsErstattet: number;
  anzahl: number;
  jahresMax: number;
  quote: number;
  maxAnzahl: number | null;
}

export interface VorgangUebersicht {
  offen: number;
  rueckfragen: number;
  entwuerfe: number;
  erstattetImJahr: number;
  letzte: Vorgang[];
}

@Injectable({ providedIn: 'root' })
export class VorgangApi {
  private http = inject(HttpClient);

  liste(filter: { typ?: string; status?: string; jahr?: string } = {}) {
    const params: Record<string, string> = {};
    Object.entries(filter).forEach(([k, v]) => v && (params[k] = v));
    return firstValueFrom(this.http.get<Vorgang[]>('/api/vorgaenge', { params }));
  }
  uebersicht() {
    return firstValueFrom(this.http.get<VorgangUebersicht>('/api/vorgaenge/uebersicht'));
  }
  detail(id: string) {
    return firstValueFrom(this.http.get<Vorgang>(`/api/vorgaenge/${id}`));
  }
  entwurfLoeschen(id: string) {
    return firstValueFrom(this.http.delete(`/api/vorgaenge/${id}`));
  }
  stornieren(id: string, grund?: string) {
    return firstValueFrom(this.http.post<Vorgang>(`/api/vorgaenge/${id}/stornieren`, { grund }));
  }
  nachreichen(id: string, text: string, anhaenge: any[]) {
    return firstValueFrom(this.http.post<Vorgang>(`/api/vorgaenge/${id}/nachreichen`, { text, anhaenge }));
  }
  personen() {
    return firstValueFrom(this.http.get<Person[]>('/api/erstattung/personen'));
  }
  budget(leistung: string, patient: string, jahr: string) {
    return firstValueFrom(this.http.get<Budget>('/api/erstattung/budget', { params: { leistung, patient, jahr } }));
  }
  erstattung(daten: any) {
    return firstValueFrom(this.http.post<Vorgang>('/api/erstattung', daten));
  }
  krankmeldung(daten: any) {
    return firstValueFrom(this.http.post<Vorgang>('/api/arbeitsunfaehigkeit', daten));
  }
  antrag(typ: VorgangTyp, daten: any, anhaenge: any[], entwurf: boolean) {
    return firstValueFrom(this.http.post<Vorgang>('/api/antraege', { typ, daten, anhaenge, entwurf }));
  }
  entwurfSpeichern(id: string, daten: any, anhaenge: any[], einreichen: boolean) {
    return firstValueFrom(this.http.put<Vorgang>(`/api/antraege/${id}`, { daten, anhaenge, einreichen }));
  }
}
