/** Fachliche Prüfroutinen, die von Frontend und Backend gemeinsam genutzt werden. */

export function normalisiereIban(iban: string): string {
  return (iban || '').replace(/\s+/g, '').toUpperCase();
}

export function formatiereIban(iban: string): string {
  return normalisiereIban(iban).replace(/(.{4})/g, '$1 ').trim();
}

export function maskiereIban(iban: string): string {
  const n = normalisiereIban(iban);
  if (n.length < 8) return n;
  return formatiereIban(n.substring(0, 4) + '*'.repeat(n.length - 8) + n.substring(n.length - 4));
}

const IBAN_LAENGEN: Record<string, number> = { DE: 22, AT: 20, CH: 21, NL: 18, BE: 16, FR: 27, IT: 27, ES: 24, PL: 28, LU: 20, DK: 18 };

export function istIbanGueltig(iban: string): boolean {
  const n = normalisiereIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(n)) return false;
  const laenge = IBAN_LAENGEN[n.substring(0, 2)];
  if (!laenge || n.length !== laenge) return false;
  const umgestellt = n.substring(4) + n.substring(0, 4);
  let rest = 0;
  for (const ch of umgestellt) {
    const wert = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

export function ibanLand(iban: string): string {
  return normalisiereIban(iban).substring(0, 2);
}

/** Versichertennummer: ein Großbuchstabe + 9 Ziffern, letzte Ziffer ist Prüfziffer (vereinfachtes Verfahren). */
export function istVersichertennummerFormal(nr: string): boolean {
  return /^[A-Z]\d{9}$/.test((nr || '').trim().toUpperCase());
}

export function istPlzGueltig(plz: string, land = 'Deutschland'): boolean {
  if (land === 'Deutschland') return /^(0[1-9]|[1-9]\d)\d{3}$/.test(plz || '');
  if (land === 'Österreich' || land === 'Schweiz') return /^\d{4}$/.test(plz || '');
  return (plz || '').trim().length >= 3;
}

export function istTelefonGueltig(tel: string): boolean {
  if (!tel) return true;
  return /^(\+\d{2}|0)[\d\s\/-]{6,18}$/.test(tel.trim());
}

export interface PasswortBewertung {
  laenge: boolean;
  gross: boolean;
  klein: boolean;
  ziffer: boolean;
  sonderzeichen: boolean;
  staerke: 0 | 1 | 2 | 3 | 4;
}

export function bewertePasswort(pw: string): PasswortBewertung {
  const p = pw || '';
  const b = {
    laenge: p.length >= 10,
    gross: /[A-ZÄÖÜ]/.test(p),
    klein: /[a-zäöüß]/.test(p),
    ziffer: /\d/.test(p),
    sonderzeichen: /[^A-Za-z0-9ÄÖÜäöüß]/.test(p),
  };
  const erfuellt = Object.values(b).filter(Boolean).length;
  let staerke: PasswortBewertung['staerke'] = 0;
  if (erfuellt >= 5 && p.length >= 14) staerke = 4;
  else if (erfuellt === 5) staerke = 3;
  else if (erfuellt >= 3) staerke = 2;
  else if (erfuellt >= 1) staerke = 1;
  return { ...b, staerke };
}

export function istPasswortRegelkonform(pw: string): boolean {
  const b = bewertePasswort(pw);
  return b.laenge && b.gross && b.klein && b.ziffer && b.sonderzeichen;
}

export function enthaeltPersoenlicheDaten(pw: string, ...werte: (string | undefined)[]): boolean {
  const p = (pw || '').toLowerCase();
  return werte.filter(w => !!w && w.length >= 3).some(w => p.includes(w!.toLowerCase()));
}

/** Steuerliche Identifikationsnummer (11 Ziffern, Prüfziffer nach ISO 7064 MOD 11,10). */
export function istSteuerIdGueltig(id: string): boolean {
  const n = (id || '').replace(/\s/g, '');
  if (!/^[1-9]\d{10}$/.test(n)) return false;
  const haeufigkeit: Record<string, number> = {};
  for (const z of n.substring(0, 10)) haeufigkeit[z] = (haeufigkeit[z] || 0) + 1;
  const mehrfach = Object.values(haeufigkeit).filter(x => x > 1);
  if (mehrfach.length !== 1 || mehrfach[0] > 3) return false;
  let produkt = 10;
  for (let i = 0; i < 10; i++) {
    let summe = (Number(n[i]) + produkt) % 10;
    if (summe === 0) summe = 10;
    produkt = (summe * 2) % 11;
  }
  let pruefziffer = 11 - produkt;
  if (pruefziffer === 10) pruefziffer = 0;
  return pruefziffer === Number(n[10]);
}

export function istEmailGueltig(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test((email || '').trim());
}
