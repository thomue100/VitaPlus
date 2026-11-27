import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Generischer Zugriff auf die REST-Schnittstelle der Online-Geschäftsstelle. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  get<T = any>(url: string, params?: Record<string, string | number | boolean | undefined | null>) {
    let p = new HttpParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return firstValueFrom(this.http.get<T>(url, { params: p }));
  }
  post<T = any>(url: string, body: any = {}) {
    return firstValueFrom(this.http.post<T>(url, body));
  }
  put<T = any>(url: string, body: any = {}) {
    return firstValueFrom(this.http.put<T>(url, body));
  }
  delete<T = any>(url: string) {
    return firstValueFrom(this.http.delete<T>(url));
  }
  /** Datei als multipart/form-data hochladen (Feld „datei“) */
  hochladen<T = any>(url: string, datei: File) {
    const form = new FormData();
    form.append('datei', datei, datei.name);
    return firstValueFrom(this.http.post<T>(url, form));
  }
  /** Binärinhalt laden; Fehlerantworten (Problem Details) werden aus dem Blob gelesen */
  async datei(url: string): Promise<Blob> {
    try {
      return await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
    } catch (e: any) {
      if (e?.error instanceof Blob) {
        try { e = Object.assign(Object.create(Object.getPrototypeOf(e)), e, { error: JSON.parse(await e.error.text()) }); } catch { /* kein JSON */ }
      }
      throw e;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class BenachrichtigungService {
  private api = inject(Api);
  readonly ungelesen = signal(0);

  async aktualisieren() {
    try {
      const r = await this.api.get<{ ungelesen: number }>('/api/benachrichtigungen');
      this.ungelesen.set(r.ungelesen);
      return r;
    } catch {
      return null;
    }
  }
}
