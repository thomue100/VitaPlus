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
