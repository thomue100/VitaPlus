import { inject } from '@angular/core';
import { Anhang } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { erzeugePdf } from '../pdf';
import { dokumentAnzeigen } from './vorschau';

/**
 * Liefert eine Funktion, die einen Anhang im Dokumentbetrachter öffnet (im Injektionskontext aufrufen).
 * Der Inhalt kommt von GET /api/dateien/:id/inhalt. Für Altbestände ohne digitale Fassung
 * zeigt der Betrachter ein Deckblatt mit den Metadaten aus dem Archiv.
 */
export function anhangOeffner() {
  const api = inject(Api);
  const ui = inject(UiService);
  return async (a: Anhang, bezug?: string) => {
    try {
      const blob = await api.datei(`/api/dateien/${encodeURIComponent(a.id)}/inhalt`);
      dokumentAnzeigen(a.name, blob, a.name);
    } catch (e: any) {
      if (e?.status === 404) dokumentAnzeigen(a.name, archivkopie(a, bezug), a.name.replace(/\.\w+$/, '') + '_Archivkopie.pdf');
      else ui.fehler(fehlertext(e, 'Das Dokument konnte nicht geladen werden.'));
    }
  };
}

function archivkopie(a: Anhang, bezug?: string): Blob {
  const datum = new Date(a.hochgeladenAm).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  return erzeugePdf(`Archivkopie – ${a.name}`, [
    'Dokumentenarchiv der VitaPlus',
    '',
    `Dateiname: ${a.name}`,
    `Dateityp: ${a.mimeType}`,
    `Eingegangen: ${datum}`,
    ...(bezug ? [`Zuordnung: ${bezug}`] : []),
    '',
    'Das Original wurde gescannt und revisionssicher archiviert. Die Bildansicht steht für Dokumente',
    'aus der Zeit vor Einführung der digitalen Akte nur in der Geschäftsstelle zur Verfügung.',
  ]);
}
