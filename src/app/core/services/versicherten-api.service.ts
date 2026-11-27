import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Anhang, Familienmitglied, Gesundheitskarte, Vorgang } from '../models';
import { AngemeldeterBenutzer, SitzungService } from './sitzung.service';

export type FamilienEintrag = Familienmitglied & { alter: number; endetAm: string | null };

@Injectable({ providedIn: 'root' })
export class ProfilApi {
  private http = inject(HttpClient);
  private sitzung = inject(SitzungService);

  private async aktualisiert(p: Promise<AngemeldeterBenutzer>) {
    const b = await p;
    this.sitzung.setzen(b);
    return b;
  }

  laden() {
    return this.aktualisiert(firstValueFrom(this.http.get<AngemeldeterBenutzer>('/api/profil')));
  }
  adresse(daten: any) {
    return this.aktualisiert(firstValueFrom(this.http.put<AngemeldeterBenutzer>('/api/profil/adresse', daten)));
  }
  kontakt(daten: { telefon?: string; mobil?: string }) {
    return this.aktualisiert(firstValueFrom(this.http.put<AngemeldeterBenutzer>('/api/profil/kontakt', daten)));
  }
  email(email: string, passwort: string) {
    return this.aktualisiert(firstValueFrom(this.http.put<AngemeldeterBenutzer>('/api/profil/email', { email, passwort })));
  }
  bank(daten: any) {
    return this.aktualisiert(firstValueFrom(this.http.put<AngemeldeterBenutzer>('/api/profil/bank', daten)));
  }
  bankEntfernen() {
    return this.aktualisiert(firstValueFrom(this.http.delete<AngemeldeterBenutzer>('/api/profil/bank')));
  }
  bankSuche(iban: string) {
    return firstValueFrom(this.http.get<{ bankname: string | null; bic: string | null }>('/api/bank/suche', { params: { iban } }));
  }
  kommunikation(daten: any) {
    return this.aktualisiert(firstValueFrom(this.http.put<AngemeldeterBenutzer>('/api/profil/kommunikation', daten)));
  }
  passwort(altesPasswort: string, neuesPasswort: string) {
    return firstValueFrom(this.http.put<{ neuAnmelden: boolean }>('/api/profil/passwort', { altesPasswort, neuesPasswort }));
  }
  zweiFaktor(aktiv: boolean, passwort: string, code?: string) {
    return firstValueFrom(this.http.put<any>('/api/profil/zwei-faktor', { aktiv, passwort, code }));
  }
  schriftgroesse(schriftgroesse: string) {
    return this.aktualisiert(firstValueFrom(this.http.put<AngemeldeterBenutzer>('/api/profil/schriftgroesse', { schriftgroesse })));
  }
  namensaenderung(daten: { nachname: string; grund: string; gueltigAb: string; anhaenge: Anhang[] }) {
    return firstValueFrom(this.http.post<Vorgang>('/api/profil/namensaenderung', daten));
  }
}

@Injectable({ providedIn: 'root' })
export class FamilieApi {
  private http = inject(HttpClient);
  liste() {
    return firstValueFrom(this.http.get<FamilienEintrag[]>('/api/familie'));
  }
  anmelden(daten: any) {
    return firstValueFrom(this.http.post<{ familienmitglied: Familienmitglied; vorgang: Vorgang }>('/api/familie', daten));
  }
  abmelden(id: string, zum: string, grund: string) {
    return firstValueFrom(this.http.post<Familienmitglied>(`/api/familie/${id}/abmelden`, { zum, grund }));
  }
}

@Injectable({ providedIn: 'root' })
export class KartenApi {
  private http = inject(HttpClient);
  liste() {
    return firstValueFrom(this.http.get<Gesundheitskarte[]>('/api/karten'));
  }
  sperren(id: string, grund: string, polizeilichGemeldet: boolean) {
    return firstValueFrom(this.http.post<Gesundheitskarte>(`/api/karten/${id}/sperren`, { grund, polizeilichGemeldet }));
  }
  ersatz(id: string, daten: any) {
    return firstValueFrom(this.http.post<Vorgang>(`/api/karten/${id}/ersatz`, daten));
  }
  aktivieren(id: string, letzteZiffern: string) {
    return firstValueFrom(this.http.post<Gesundheitskarte>(`/api/karten/${id}/aktivieren`, { letzteZiffern }));
  }
}
