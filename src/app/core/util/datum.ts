export function heute(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function heuteIso(): string {
  return toIso(heute());
}

export function jetztIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toIso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.substring(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addTage(d: Date, tage: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + tage);
  return r;
}

export function addMonate(d: Date, monate: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + monate);
  return r;
}

export function tageZwischen(von: string | Date, bis: string | Date): number {
  const a = typeof von === 'string' ? parseIso(von) : von;
  const b = typeof bis === 'string' ? parseIso(bis) : bis;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function alterAm(geburtsdatum: string, stichtag: Date = heute()): number {
  const g = parseIso(geburtsdatum);
  let alter = stichtag.getFullYear() - g.getFullYear();
  const m = stichtag.getMonth() - g.getMonth();
  if (m < 0 || (m === 0 && stichtag.getDate() < g.getDate())) alter--;
  return alter;
}

export function istWochenende(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

/** Bundeseinheitliche Feiertage (ohne bewegliche regionale) */
export function istFeiertag(d: Date): boolean {
  const md = `${d.getMonth() + 1}-${d.getDate()}`;
  if (['1-1', '5-1', '10-3', '12-25', '12-26'].includes(md)) return true;
  const ostern = osterSonntag(d.getFullYear());
  const diff = tageZwischen(ostern, d);
  return [-2, 1, 39, 50].includes(diff);
}

function osterSonntag(jahr: number): Date {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tag);
}

export function formatDatum(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.substring(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
