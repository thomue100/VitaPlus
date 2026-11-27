/**
 * Laufzeitkonfiguration der Online-Geschäftsstelle. Sie wird beim Start aus /konfiguration.json geladen,
 * damit dieselbe Auslieferung ohne neuen Build gegen die Simulation oder ein echtes Backend laufen kann.
 *
 * - simulation:    alle /api-Aufrufe beantwortet das eingebaute Simulations-Backend im Browser
 * - mischbetrieb:  Aufrufe, die auf ein Muster aus `echteRouten` passen, gehen an `basisUrl`, der Rest an die Simulation
 * - echt:          alle /api-Aufrufe gehen an `basisUrl`
 */
export type Backendmodus = 'simulation' | 'mischbetrieb' | 'echt';

export interface Laufzeitkonfiguration {
  backend: {
    modus: Backendmodus;
    /** Basisadresse des Backends ohne abschließenden Schrägstrich, leer = gleicher Ursprung (z. B. per Rewrite) */
    basisUrl: string;
    /** Muster wie "/api/auth/**", "GET /api/vorgaenge/*" – nur im Mischbetrieb */
    echteRouten: string[];
  };
  /** Demo-Werkzeuge (Postausgang, Testzugänge, Testdaten) anzeigen */
  demo: boolean;
}

const STANDARD: Laufzeitkonfiguration = {
  backend: { modus: 'simulation', basisUrl: '', echteRouten: [] },
  demo: true,
};

export let laufzeit: Laufzeitkonfiguration = STANDARD;

function pruefen(roh: any): Laufzeitkonfiguration {
  const modus: Backendmodus = ['simulation', 'mischbetrieb', 'echt'].includes(roh?.backend?.modus) ? roh.backend.modus : 'simulation';
  const basisUrl = typeof roh?.backend?.basisUrl === 'string' ? roh.backend.basisUrl.replace(/\/+$/, '') : '';
  const echteRouten = Array.isArray(roh?.backend?.echteRouten) ? roh.backend.echteRouten.filter((m: unknown) => typeof m === 'string') : [];
  return { backend: { modus, basisUrl, echteRouten }, demo: typeof roh?.demo === 'boolean' ? roh.demo : modus === 'simulation' };
}

/** Lädt die Konfiguration; fehlt die Datei oder ist sie fehlerhaft, läuft die Anwendung mit der Simulation. */
export async function laufzeitLaden(): Promise<Laufzeitkonfiguration> {
  try {
    const r = await fetch('/konfiguration.json', { cache: 'no-store' });
    if (r.ok) laufzeit = pruefen(await r.json());
  } catch {
    laufzeit = STANDARD;
  }
  return laufzeit;
}

function musterPasst(muster: string, methode: string, pfad: string): boolean {
  const [m, p] = muster.includes(' ') ? muster.split(/\s+/, 2) : ['*', muster];
  if (m !== '*' && m.toUpperCase() !== methode) return false;
  const regex = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]+').replace(/§/g, '.*') + '$');
  return regex.test(pfad);
}

/** Soll dieser Aufruf an das echte Backend gehen? */
export function anEchtesBackend(methode: string, pfad: string): boolean {
  const b = laufzeit.backend;
  if (b.modus === 'echt') return true;
  if (b.modus === 'simulation') return false;
  return b.echteRouten.some(m => musterPasst(m, methode, pfad));
}
