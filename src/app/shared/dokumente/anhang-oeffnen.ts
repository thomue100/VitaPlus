import { dokumentenablage } from '../../core/backend/dokumentenablage';
import { Anhang } from '../../core/models';
import { erzeugePdf } from '../pdf';
import { dokumentAnzeigen } from './vorschau';

/**
 * Öffnet einen Anhang im Dokumentbetrachter. Liegt der Inhalt in der Dokumentenablage, wird das Original
 * angezeigt; für Altbestände ohne Inhalt liefert das Archiv ein Deckblatt mit den Metadaten.
 */
export async function anhangOeffnen(a: Anhang, bezug?: string) {
  const blob = await dokumentenablage.laden(a.id);
  if (blob) {
    dokumentAnzeigen(a.name, blob, a.name);
    return;
  }
  const datum = new Date(a.hochgeladenAm).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  const deckblatt = erzeugePdf(`Archivkopie – ${a.name}`, [
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
  dokumentAnzeigen(a.name, deckblatt, a.name.replace(/\.\w+$/, '') + '_Archivkopie.pdf');
}
