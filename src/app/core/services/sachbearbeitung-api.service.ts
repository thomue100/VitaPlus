import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Vorgang } from '../models';

export type SbVorgang = Vorgang & {
  versicherter: { id: string; name: string; versichertennummer?: string; tarif: string } | null;
  bearbeiter: string | null;
  ueberfaellig: boolean;
  typText: string;
};

export type SbVorgangDetail = SbVorgang & {
  versicherterDetails: any;
  weitereVorgaenge: { id: string; vorgangsnummer: string; titel: string; status: string; erstelltAm: string }[];
  darfEntscheiden: boolean;
  freigabeLimit: number;
};

@Injectable({ providedIn: 'root' })
export class SachbearbeitungApi {
  private http = inject(HttpClient);

  eingang(filter: Record<string, string | boolean>) {
    const params: Record<string, string> = {};
    Object.entries(filter).forEach(([k, v]) => v !== '' && v !== false && (params[k] = String(v)));
    return firstValueFrom(this.http.get<SbVorgang[]>('/api/sb/vorgaenge', { params }));
  }
  statistik() {
    return firstValueFrom(this.http.get<Record<string, number>>('/api/sb/statistik'));
  }
  detail(id: string) {
    return firstValueFrom(this.http.get<SbVorgangDetail>(`/api/sb/vorgaenge/${id}`));
  }
  uebernehmen(id: string) {
    return firstValueFrom(this.http.post<SbVorgangDetail>(`/api/sb/vorgaenge/${id}/uebernehmen`, {}));
  }
  freigeben(id: string) {
    return firstValueFrom(this.http.post(`/api/sb/vorgaenge/${id}/freigeben`, {}));
  }
  entscheiden(id: string, entscheidung: 'GENEHMIGT' | 'ABGELEHNT', betrag?: number, begruendung?: string, zusatz?: Record<string, any>) {
    return firstValueFrom(this.http.post<SbVorgangDetail>(`/api/sb/vorgaenge/${id}/entscheidung`, { entscheidung, betrag, begruendung, zusatz }));
  }
  rueckfrage(id: string, text: string) {
    return firstValueFrom(this.http.post<SbVorgangDetail>(`/api/sb/vorgaenge/${id}/rueckfrage`, { text }));
  }
  notiz(id: string, text: string) {
    return firstValueFrom(this.http.post<SbVorgangDetail>(`/api/sb/vorgaenge/${id}/notiz`, { text }));
  }
  versicherte(suche: string) {
    return firstValueFrom(this.http.get<any[]>('/api/sb/versicherte', { params: { suche } }));
  }
  sperren(id: string, grund: string) {
    return firstValueFrom(this.http.post(`/api/sb/versicherte/${id}/sperren`, { grund }));
  }
  entsperren(id: string) {
    return firstValueFrom(this.http.post(`/api/sb/versicherte/${id}/entsperren`, { identitaetGeprueft: true }));
  }
}
