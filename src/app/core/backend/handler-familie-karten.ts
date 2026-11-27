import { BEITRAG } from '../konfiguration';
import { Familienmitglied, Gesundheitskarte } from '../models';
import { addMonate, alterAm, heute, heuteIso, jetztIso, parseIso } from '../util/datum';
import { Anfrage, ApiFehler, anrede, pflicht, postfachNachricht, Route, statusSetzen, voller, eingangErfassen } from './api-kontext';
import { neueId, neueVorgangsnummer } from './db';
import { anhaengePruefen } from './handler-vorgaenge';

const KIND_BEZIEHUNGEN = ['KIND', 'STIEFKIND', 'ENKELKIND'];

function familieListe(a: Anfrage) {
  return a.store.familie
    .filter(f => f.hauptversicherterId === a.benutzer!.id)
    .map(f => ({ ...f, alter: alterAm(f.geburtsdatum), endetAm: voraussichtlichesEnde(f) }));
}

function voraussichtlichesEnde(f: Familienmitglied): string | null {
  if (!KIND_BEZIEHUNGEN.includes(f.beziehung) || f.status !== 'AKTIV') return null;
  const g = parseIso(f.geburtsdatum);
  const grenze = f.inAusbildung ? 25 : 18;
  return new Date(g.getFullYear() + grenze, g.getMonth(), g.getDate() - 1).toLocaleDateString('sv-SE');
}

function familieAnmelden(a: Anfrage) {
  const b = a.benutzer!;
  const d = a.body || {};
  pflicht(d.vorname, 'vorname');
  pflicht(d.nachname, 'nachname');
  pflicht(d.geburtsdatum, 'geburtsdatum');
  pflicht(d.beziehung, 'beziehung');
  pflicht(d.geschlecht, 'geschlecht');
  const gd = parseIso(d.geburtsdatum);
  if (gd > heute()) throw new ApiFehler(400, 'Das Geburtsdatum darf nicht in der Zukunft liegen.', 'geburtsdatum');
  const alter = alterAm(d.geburtsdatum);
  const eigene = a.store.familie.filter(f => f.hauptversicherterId === b.id && f.status !== 'ABGELEHNT' && f.status !== 'BEENDET');

  if (eigene.some(f => f.vorname.trim().toLowerCase() === String(d.vorname).trim().toLowerCase() && f.geburtsdatum === d.geburtsdatum)) {
    throw new ApiFehler(409, 'Diese Person ist bereits bei Ihnen familienversichert oder angemeldet.');
  }
  if (['EHEPARTNER', 'LEBENSPARTNER'].includes(d.beziehung)) {
    if (eigene.some(f => ['EHEPARTNER', 'LEBENSPARTNER'].includes(f.beziehung))) {
      throw new ApiFehler(409, 'Es ist bereits ein Ehe- bzw. Lebenspartner familienversichert.', 'beziehung');
    }
    if (alter < 18) throw new ApiFehler(400, 'Bitte prüfen Sie das Geburtsdatum.', 'geburtsdatum');
  }
  if (KIND_BEZIEHUNGEN.includes(d.beziehung)) {
    if (alter >= 25 && !d.behinderung) {
      throw new ApiFehler(422, 'Kinder können nur bis zur Vollendung des 25. Lebensjahres familienversichert werden.', 'geburtsdatum', 'ALTERSGRENZE');
    }
    if (alter >= 18 && !d.inAusbildung && !d.behinderung) {
      throw new ApiFehler(422, 'Kinder ab 18 Jahren können nur während einer Schul- oder Berufsausbildung oder eines Studiums familienversichert werden.', 'inAusbildung', 'ALTERSGRENZE');
    }
    if (d.beziehung === 'ENKELKIND' && !d.ueberwiegendUnterhalten) {
      throw new ApiFehler(422, 'Enkelkinder können nur familienversichert werden, wenn Sie sie überwiegend unterhalten.', 'ueberwiegendUnterhalten');
    }
    if (d.beziehung === 'STIEFKIND' && !d.imHaushalt) {
      throw new ApiFehler(422, 'Stiefkinder müssen in Ihrem Haushalt leben.', 'imHaushalt');
    }
  }
  if (d.anderweitigVersichert) throw new ApiFehler(422, 'Wer selbst gesetzlich oder privat versichert ist, kann nicht familienversichert werden.', 'anderweitigVersichert');
  if (d.hauptberuflichSelbststaendig) throw new ApiFehler(422, 'Eine hauptberufliche Selbstständigkeit schließt die Familienversicherung aus.', 'hauptberuflichSelbststaendig');
  const einkommen = Number(d.einkommenMonat) || 0;
  const grenze = d.minijob ? BEITRAG.familienEinkommensgrenzeMinijob : BEITRAG.familienEinkommensgrenze;
  if (einkommen > grenze) {
    throw new ApiFehler(422, `Das regelmäßige monatliche Gesamteinkommen darf ${grenze} € nicht überschreiten.`, 'einkommenMonat', 'EINKOMMEN');
  }
  if (alter >= 15) anhaengePruefen(d.anhaenge, false, 2);

  const f: Familienmitglied = {
    id: neueId('f'), hauptversicherterId: b.id, vorname: String(d.vorname).trim(), nachname: String(d.nachname).trim(),
    geburtsdatum: d.geburtsdatum, geschlecht: d.geschlecht, beziehung: d.beziehung, status: 'BEANTRAGT', einkommenMonat: einkommen,
    inAusbildung: !!d.inAusbildung, anderweitigVersichert: false, beantragtAm: heuteIso(),
  };
  const v = {
    id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), zustaendig: 'Mitgliedschaft & Beiträge', benutzerId: b.id, typ: 'FAMILIENVERSICHERUNG' as const,
    titel: `Familienversicherung für ${f.vorname} ${f.nachname}`, status: 'EINGEREICHT' as const, erstelltAm: jetztIso(), geaendertAm: jetztIso(),
    daten: { familienmitgliedId: f.id, beziehung: f.beziehung, geburtsdatum: f.geburtsdatum, einkommenMonat: einkommen, minijob: !!d.minijob,
      inAusbildung: !!d.inAusbildung, ausbildungsende: d.ausbildungsende || null, vorversicherung: d.vorversicherung || null, beginn: d.beginn || heuteIso() },
    anhaenge: d.anhaenge || [], historie: [],
  };
  statusSetzen(v as any, 'EINGEREICHT', 'Anmeldung zur Familienversicherung eingereicht', voller(b));
  f.vorgangId = v.id;
  a.store.familie.push(f);
  eingangErfassen(a.store, v as any);
  return { familienmitglied: f, vorgang: v };
}

function familieAbmelden(a: Anfrage) {
  const b = a.benutzer!;
  const f = a.store.familie.find(x => x.id === a.params['id'] && x.hauptversicherterId === b.id);
  if (!f) throw new ApiFehler(404, 'Familienangehörige/r nicht gefunden.');
  if (f.status !== 'AKTIV') throw new ApiFehler(409, 'Nur aktive Familienversicherungen können beendet werden.');
  const { zum, grund } = a.body || {};
  pflicht(zum, 'zum');
  pflicht(grund, 'grund');
  const datum = parseIso(zum);
  if (datum < heute()) throw new ApiFehler(400, 'Eine rückwirkende Abmeldung ist online nicht möglich.', 'zum');
  if (datum.getDate() !== new Date(datum.getFullYear(), datum.getMonth() + 1, 0).getDate()) {
    throw new ApiFehler(400, 'Die Familienversicherung kann nur zum Monatsende beendet werden.', 'zum');
  }
  f.status = 'BEENDET';
  f.abgemeldetAm = zum;
  a.store.karten.filter(k => k.familienmitgliedId === f.id && k.status === 'AKTIV').forEach(k => {
    k.status = 'GESPERRT';
    k.gesperrtAm = zum;
  });
  postfachNachricht(b.id, `Ende der Familienversicherung für ${f.vorname}`,
    `${anrede(b)},\n\ndie Familienversicherung für ${f.vorname} ${f.nachname} endet am ${datum.toLocaleDateString('de-DE')}. ` +
    (grund === 'EIGENE_VERSICHERUNG' ? 'Bitte senden Sie uns die Mitgliedsbescheinigung der neuen Krankenkasse.' : '') +
    `\n\nDie Gesundheitskarte ist ab diesem Tag nicht mehr gültig.\n\nIhre VitaPlus`, { kategorie: 'MITGLIEDSCHAFT' });
  return f;
}

function kartenListe(a: Anfrage) {
  return a.store.karten.filter(k => k.benutzerId === a.benutzer!.id);
}

function karteSperren(a: Anfrage) {
  const k = eigeneKarte(a);
  const { grund, polizeilichGemeldet } = a.body || {};
  if (!['VERLUST', 'DIEBSTAHL', 'DEFEKT'].includes(grund)) throw new ApiFehler(400, 'Bitte wählen Sie einen Grund.', 'grund');
  if (k.status !== 'AKTIV') throw new ApiFehler(409, 'Diese Karte ist nicht aktiv und kann nicht gesperrt werden.');
  k.status = 'GESPERRT';
  k.sperrgrund = grund;
  k.gesperrtAm = heuteIso();
  if (grund === 'DIEBSTAHL' && !polizeilichGemeldet) {
    postfachNachricht(a.benutzer!.id, 'Ihre Gesundheitskarte wurde gesperrt',
      `${anrede(a.benutzer!)},\n\nwir haben die Karte ${k.kartennummer} gesperrt. Bitte erstatten Sie bei einem Diebstahl zusätzlich Anzeige bei der Polizei, um Missbrauch vorzubeugen.\n\nIhre VitaPlus`,
      { kategorie: 'MITGLIEDSCHAFT', wichtig: true });
  }
  return k;
}

function eigeneKarte(a: Anfrage): Gesundheitskarte {
  const k = a.store.karten.find(x => x.id === a.params['id'] && x.benutzerId === a.benutzer!.id);
  if (!k) throw new ApiFehler(404, 'Karte nicht gefunden.');
  return k;
}

function ersatzBestellen(a: Anfrage) {
  const b = a.benutzer!;
  const k = eigeneKarte(a);
  const { lieferadresse, foto, abweichendeAdresse } = a.body || {};
  if (k.status === 'AKTIV') throw new ApiFehler(409, 'Bitte sperren Sie die aktuelle Karte, bevor Sie eine Ersatzkarte bestellen.');
  if (k.status !== 'GESPERRT' && k.status !== 'ABGELAUFEN') throw new ApiFehler(409, 'Für diese Karte kann keine Ersatzkarte bestellt werden.');
  if (k.familienmitgliedId && a.store.familie.find(f => f.id === k.familienmitgliedId)?.status !== 'AKTIV') {
    throw new ApiFehler(409, 'Die Familienversicherung dieser Person ist beendet.');
  }
  const offen = a.store.vorgaenge.find(v => v.typ === 'ERSATZKARTE' && v.daten['karteId'] === k.id && !['ABGELEHNT', 'STORNIERT'].includes(v.status));
  if (offen) throw new ApiFehler(409, 'Für diese Karte wurde bereits eine Ersatzkarte bestellt.');
  const geburt = k.familienmitgliedId ? a.store.familie.find(f => f.id === k.familienmitgliedId)?.geburtsdatum : b.geburtsdatum;
  const fotoNoetig = !k.fotoVorhanden && geburt && alterAm(geburt) >= 15;
  if (fotoNoetig && !foto) throw new ApiFehler(400, 'Für Versicherte ab 15 Jahren benötigen wir ein aktuelles Lichtbild.', 'foto', 'FOTO_FEHLT');
  if (foto) {
    anhaengePruefen([foto], true, 1);
    if (foto.mimeType === 'application/pdf') throw new ApiFehler(415, 'Das Lichtbild muss als JPG oder PNG hochgeladen werden.', 'foto');
  }
  if (abweichendeAdresse) {
    pflicht(lieferadresse?.strasse, 'strasse');
    pflicht(lieferadresse?.plz, 'plz');
    pflicht(lieferadresse?.ort, 'ort');
  }
  const jahr = String(heute().getFullYear());
  const bisher = a.store.vorgaenge.filter(v => v.benutzerId === b.id && v.typ === 'ERSATZKARTE' && v.erstelltAm.startsWith(jahr) &&
    v.daten['karteInhaber'] === k.inhaber && v.daten['grund'] === 'VERLUST' && v.status !== 'STORNIERT').length;
  const gebuehr = k.sperrgrund === 'VERLUST' && bisher >= 1 ? 5 : 0;
  const v = {
    id: neueId('v'), vorgangsnummer: neueVorgangsnummer(), zustaendig: 'Mitgliedschaft & Beiträge', benutzerId: b.id, typ: 'ERSATZKARTE' as const,
    titel: `Ersatzkarte für ${k.inhaber}`, status: 'EINGEREICHT' as const, erstelltAm: jetztIso(), geaendertAm: jetztIso(),
    daten: { karteId: k.id, karteInhaber: k.inhaber, grund: k.sperrgrund || 'ABGELAUFEN', gebuehr,
      lieferadresse: abweichendeAdresse ? lieferadresse : b.adresse, fotoNeu: !!foto },
    anhaenge: foto ? [foto] : [], historie: [], betragBeantragt: gebuehr || undefined,
  };
  statusSetzen(v as any, 'EINGEREICHT', 'Ersatzkarte bestellt', voller(b));
  const neu: Gesundheitskarte = {
    id: neueId('k'), benutzerId: b.id, familienmitgliedId: k.familienmitgliedId, inhaber: k.inhaber,
    kartennummer: neueKartennummer(), gueltigBis: addMonate(heute(), 60).toLocaleDateString('sv-SE'),
    status: 'IN_PRODUKTION', fotoVorhanden: k.fotoVorhanden || !!foto,
  };
  (v.daten as any).neueKarteId = neu.id;
  a.store.karten.push(neu);
  eingangErfassen(a.store, v as any);
  if (gebuehr) {
    postfachNachricht(b.id, 'Gebühr für Ersatzkarte',
      `${anrede(b)},\n\nda dies bereits die zweite Ersatzkarte wegen Verlust in diesem Jahr ist, berechnen wir eine Gebühr von ${gebuehr},00 €.\n\nIhre VitaPlus`,
      { kategorie: 'MITGLIEDSCHAFT', vorgangId: v.id });
  }
  return v;
}

function karteAktivieren(a: Anfrage) {
  const k = eigeneKarte(a);
  if (k.status !== 'VERSENDET') throw new ApiFehler(409, 'Diese Karte kann nicht aktiviert werden.');
  const ziffern = String(a.body?.letzteZiffern || '');
  if (ziffern !== k.kartennummer.replace(/\D/g, '').slice(-4)) {
    throw new ApiFehler(400, 'Die Ziffern stimmen nicht mit der Kartennummer überein.', 'letzteZiffern');
  }
  k.status = 'AKTIV';
  return k;
}

function neueKartennummer(): string {
  const z = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
  return `80276 ${z(5)} ${z(5)} ${z(1)}`;
}

export const FAMILIE_KARTEN_ROUTEN: Route[] = [
  { methode: 'GET', muster: '/api/familie', handler: familieListe, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/familie', handler: familieAnmelden, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/familie/:id/abmelden', handler: familieAbmelden, rolle: 'VERSICHERTER' },
  { methode: 'GET', muster: '/api/karten', handler: kartenListe, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/karten/:id/sperren', handler: karteSperren, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/karten/:id/ersatz', handler: ersatzBestellen, rolle: 'VERSICHERTER' },
  { methode: 'POST', muster: '/api/karten/:id/aktivieren', handler: karteAktivieren, rolle: 'VERSICHERTER' },
];
