import { inject, Pipe, PipeTransform } from '@angular/core';
import { STATUS_TEXT, VORGANG_TYP_TEXT } from '../core/konfiguration';
import { formular } from '../core/formulare/formular-katalog';
import { SitzungService } from '../core/services/sitzung.service';
import { uebersetze } from '../core/services/sprache';

@Pipe({ name: 'statusText' })
export class StatusTextPipe implements PipeTransform {
  transform(s?: string | null): string {
    return s ? STATUS_TEXT[s] || s : '';
  }
}

@Pipe({ name: 'typText' })
export class TypTextPipe implements PipeTransform {
  transform(t?: string | null): string {
    if (!t) return '';
    return VORGANG_TYP_TEXT[t] || formular(t)?.kurz || t;
  }
}

@Pipe({ name: 'datum' })
export class DatumPipe implements PipeTransform {
  transform(iso?: string | null, mitZeit = false): string {
    if (!iso) return '–';
    const [y, m, d] = iso.substring(0, 10).split('-');
    const datum = `${d}.${m}.${y}`;
    if (!mitZeit || iso.length < 16) return datum;
    return `${datum}, ${iso.substring(11, 16)} Uhr`;
  }
}

@Pipe({ name: 'euro' })
export class EuroPipe implements PipeTransform {
  transform(n?: number | null): string {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }
}

@Pipe({ name: 'groesse' })
export class DateigroessePipe implements PipeTransform {
  transform(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }
}

@Pipe({ name: 't', pure: false })
export class UebersetzungPipe implements PipeTransform {
  private sitzung = inject(SitzungService);
  transform(schluessel: string): string {
    return uebersetze(schluessel, this.sitzung.benutzer()?.sprache || 'de');
  }
}

export function statusFarbe(s?: string): string {
  if (!s) return '';
  if (['GENEHMIGT', 'AUSGEZAHLT', 'AKTIV', 'VERSENDET', 'BESTAETIGT', 'GEBUCHT', 'DURCHGEFUEHRT'].includes(s)) return 'gruen';
  if (['RUECKFRAGE', 'TEILWEISE_GENEHMIGT', 'BEANTRAGT', 'IN_PRODUKTION', 'ERFASST', 'ENTWURF', 'AUSSTEHEND'].includes(s)) return 'gelb';
  if (['ABGELEHNT', 'GESPERRT', 'STORNIERT', 'ABGELAUFEN', 'WIDERRUFEN', 'BEENDET'].includes(s)) return 'rot';
  return 'blau';
}

export const PIPES = [StatusTextPipe, TypTextPipe, DatumPipe, EuroPipe, DateigroessePipe, UebersetzungPipe];
