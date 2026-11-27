/**
 * Ablage für hochgeladene Dateien (Dokumentenmanagement). Die Inhalte liegen – getrennt von den
 * Vorgangsdaten – in einer IndexedDB des Browsers; referenziert werden sie über die Anhang-ID.
 */
const DB_NAME = 'vp_dokumente';
const STORE = 'dateien';

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}

async function vorgang<T>(modus: IDBTransactionMode, aktion: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await oeffnen();
  return new Promise((ok, fehler) => {
    const t = db.transaction(STORE, modus);
    const r = aktion(t.objectStore(STORE));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}

export const dokumentenablage = {
  speichern: (id: string, inhalt: Blob) => vorgang('readwrite', s => s.put(inhalt, id)).catch(() => undefined),
  laden: (id: string) => vorgang<Blob | undefined>('readonly', s => s.get(id)).catch(() => undefined),
  allesLoeschen: () => vorgang('readwrite', s => s.clear()).catch(() => undefined),
};
