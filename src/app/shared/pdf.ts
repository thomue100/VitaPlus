import { dokumentAnzeigen } from './dokumente/vorschau';
/**
 * Minimaler PDF-Erzeuger (PDF 1.4, Helvetica, WinAnsi-Kodierung) für Bescheinigungen und Bescheide.
 */

const WIN_ANSI: Record<string, number> = { '€': 128, '–': 150, '—': 151, '„': 132, '“': 147, '”': 148, '‚': 130, '‘': 145, '’': 146, '•': 149, '…': 133 };

function kodiere(text: string): string {
  let r = '';
  for (const ch of text) {
    let c = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    if (c > 255) c = 63;
    const z = String.fromCharCode(c);
    r += z === '(' || z === ')' || z === '\\' ? '\\' + z : z;
  }
  return r;
}

function umbrechen(zeile: string, max = 92): string[] {
  if (zeile.length <= max) return [zeile];
  const teile: string[] = [];
  let rest = zeile;
  while (rest.length > max) {
    let pos = rest.lastIndexOf(' ', max);
    if (pos < 20) pos = max;
    teile.push(rest.substring(0, pos));
    rest = rest.substring(pos).trimStart();
  }
  teile.push(rest);
  return teile;
}

export function erzeugePdf(titel: string, zeilen: string[]): Blob {
  const alle = zeilen.flatMap(z => umbrechen(z));
  const proSeite = 46;
  const seiten: string[][] = [];
  for (let i = 0; i < Math.max(alle.length, 1); i += proSeite) seiten.push(alle.slice(i, i + proSeite));

  const objekte: string[] = [];
  const add = (o: string) => { objekte.push(o); return objekte.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fettId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const seitenIds: number[] = [];
  seiten.forEach((inhalt, idx) => {
    let s = 'BT /F2 20 Tf 0.04 0.43 0.41 rg 56 790 Td (VitaPlus) Tj ET\n';
    s += 'BT /F1 9 Tf 0.35 0.4 0.42 rg 56 776 Td (Krankenkasse | Hauptverwaltung Friedrichstraße 112, 10117 Berlin) Tj ET\n';
    s += '0.8 0.85 0.86 RG 56 768 m 539 768 l S\n';
    s += `BT /F2 14 Tf 0.1 0.16 0.18 rg 56 740 Td (${kodiere(titel)}) Tj ET\n`;
    s += 'BT /F1 11 Tf 0.1 0.16 0.18 rg 56 712 Td 15 TL\n';
    inhalt.forEach(z => (s += `(${kodiere(z)}) Tj T*\n`));
    s += 'ET\n';
    s += `BT /F1 8 Tf 0.45 0.5 0.52 rg 56 40 Td (Seite ${idx + 1} von ${seiten.length} - erstellt am ${new Date().toLocaleDateString('de-DE')} über die VitaPlus Online-Geschäftsstelle) Tj ET`;
    const streamId = add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
    seitenIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fettId} 0 R >> >> /Contents ${streamId} 0 R >>`));
  });
  objekte[1] = `<< /Type /Pages /Kids [${seitenIds.map(i => `${i} 0 R`).join(' ')}] /Count ${seitenIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objekte.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => (pdf += String(o).padStart(10, '0') + ' 00000 n \n'));
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}

export function herunterladen(blob: Blob, dateiname: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Erzeugt das PDF und öffnet es im Dokumentbetrachter (dort auch Herunterladen und Drucken). */
export function pdfHerunterladen(titel: string, zeilen: string[], dateiname: string) {
  dokumentAnzeigen(titel, erzeugePdf(titel, zeilen), dateiname);
}
