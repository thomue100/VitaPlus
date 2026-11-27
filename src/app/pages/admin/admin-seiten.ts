import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TEAMS } from '../../core/konfiguration';
import { FaqEintrag, Meldung } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { DatumPipe, EuroPipe } from '../../shared/pipes';
import { SymbolComponent } from '../../shared/symbol.component';

@Component({
  selector: 'vp-admin-monitoring',
  imports: [DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Betrieb & Monitoring</h1><p class="leise">Verfügbarkeit, Antwortzeiten und Fehler der Online-Geschäftsstelle · aktualisiert {{ stand() | datum: true }}</p></div>
      <button class="btn" type="button" (click)="laden()">Aktualisieren</button></div>
    @if (m(); as m) {
      <div class="raster">
        <div class="karte"><span class="leise">Verfügbarkeit</span><p class="kennzahl">{{ m.verfuegbarkeit }} %</p></div>
        <div class="karte"><span class="leise">Anfragen (letzte Stunde)</span><p class="kennzahl">{{ m.anfragenLetzteStunde }}</p></div>
        <div class="karte"><span class="leise">Antwortzeit p50 / p95</span><p class="kennzahl">{{ m.p50 }} / {{ m.p95 }} ms</p></div>
        <div class="karte"><span class="leise">Fehlerquote (5xx)</span><p class="kennzahl" [class.feldfehler]="m.fehlerquote > 1">{{ m.fehlerquote }} %</p></div>
      </div>
      <div class="raster-2">
        <section class="karte"><h2>Systemstatus</h2><ul class="liste-ohne">@for (d of m.dienste; track d.name) {
          <li class="zeile">{{ d.name }} <span class="badge" [class.gruen]="d.status === 'OK'" [class.gelb]="d.status === 'WARTUNG'" [class.rot]="d.status === 'GESTOERT'">{{ d.status }}</span></li> }</ul></section>
        <section class="karte"><h2>Anfragen pro 5 Minuten</h2>
          <div class="diagramm">@for (p of m.verlauf; track p.bis) { <div class="saeule" [title]="p.anzahl + ' Anfragen, Ø ' + p.mittelMs + ' ms'"><span class="bar" [style.height.%]="hoehe(p.anzahl)"></span></div> }</div>
          <p class="klein leise">letzte 60 Minuten</p></section>
      </div>
      <section class="karte"><h2>Endpunkte</h2>
        <div class="tabelle-wrapper"><table class="tabelle klein"><thead><tr><th>Endpunkt</th><th class="betrag">Anfragen</th><th class="betrag">Fehler</th><th class="betrag">Ø ms</th></tr></thead><tbody>
          @for (e of m.endpunkte; track e.endpunkt) { <tr><td><code>{{ e.endpunkt }}</code></td><td class="betrag">{{ e.anzahl }}</td><td class="betrag">{{ e.fehler }}</td><td class="betrag">{{ e.mittelMs }}</td></tr> }
        </tbody></table></div></section>
    }`,
  styles: [`.diagramm{display:flex;align-items:flex-end;gap:4px;height:120px}.saeule{flex:1;height:100%;display:flex;align-items:flex-end}.bar{width:100%;background:var(--vp-primaer);min-height:2px;border-radius:3px 3px 0 0}`],
})
export class AdminMonitoringComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  readonly m = signal<any>(null);
  readonly stand = signal(new Date().toISOString());
  private timer?: ReturnType<typeof setInterval>;
  ngOnInit() {
    this.laden();
    this.timer = setInterval(() => this.laden(), 30000);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  async laden() {
    this.m.set(await this.api.get('/api/admin/monitoring'));
    const d = new Date();
    this.stand.set(`${d.toLocaleDateString('sv-SE')}T${d.toTimeString().substring(0, 8)}`);
  }
  hoehe(n: number) {
    const max = Math.max(1, ...this.m().verlauf.map((p: any) => p.anzahl));
    return (n / max) * 100;
  }
}

@Component({
  selector: 'vp-admin-kennzahlen',
  imports: [],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>Service-Kennzahlen</h1>
    @if (k(); as k) {
      <div class="raster">
        <div class="karte"><span class="leise">Offene Vorgänge</span><p class="kennzahl">{{ k.offenGesamt }}</p></div>
        <div class="karte"><span class="leise">Registrierte Nutzer</span><p class="kennzahl">{{ k.registrierteNutzer }}</p></div>
        <div class="karte"><span class="leise">Aktive Sitzungen</span><p class="kennzahl">{{ k.aktiveSitzungen }}</p></div>
      </div>
      <div class="raster-2">
        <section class="karte"><h2>Offene Vorgänge nach Team</h2><table class="tabelle"><tbody>
          @for (t of k.offenNachTeam; track t.team) { <tr><td>{{ t.team }}</td><td class="betrag">{{ t.anzahl }}</td></tr> }</tbody></table></section>
        <section class="karte"><h2>Meistbesuchte Seiten</h2><p class="klein leise">nur Nutzer mit Einwilligung zur Nutzungsanalyse</p><table class="tabelle klein"><tbody>
          @for (s of k.nutzungsanalyse; track s.seite) { <tr><td>{{ s.seite }}</td><td class="betrag">{{ s.anzahl }}</td></tr> } @empty { <tr><td class="leer">Keine Daten</td></tr> }</tbody></table></section>
      </div>
      <section class="karte"><h2>Bearbeitung abgeschlossener Vorgänge</h2>
        <div class="tabelle-wrapper"><table class="tabelle"><thead><tr><th>Vorgangsart</th><th class="betrag">Anzahl</th><th class="betrag">Ø Bearbeitungstage</th><th class="betrag">Genehmigungsquote</th><th class="betrag">in Frist</th></tr></thead><tbody>
          @for (t of k.nachTyp; track t.typ) { <tr><td>{{ t.bezeichnung }}</td><td class="betrag">{{ t.anzahl }}</td><td class="betrag">{{ t.mittlereTage }}</td><td class="betrag">{{ t.genehmigungsquote }} %</td><td class="betrag">{{ t.fristquote }} %</td></tr> }
        </tbody></table></div></section>
    }`,
})
export class AdminKennzahlenComponent implements OnInit {
  private api = inject(Api);
  readonly k = signal<any>(null);
  async ngOnInit() {
    this.k.set(await this.api.get('/api/admin/kennzahlen'));
  }
}

@Component({
  selector: 'vp-admin-mitarbeitende',
  imports: [FormsModule, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Mitarbeitende & Rollen</h1></div><button class="btn primaer" type="button" (click)="neuOffen.set(true)">Mitarbeiter/in anlegen</button></div>
    @if (neuOffen()) {
      <form class="karte formular hervor" (ngSubmit)="anlegen()">
        <h2>Neue/r Mitarbeiter/in</h2>
        <div class="feldgruppe">
          <div class="feld"><label for="ma-vn">Vorname</label><input id="ma-vn" name="vn" [(ngModel)]="neu.vorname" /></div>
          <div class="feld"><label for="ma-nn">Nachname</label><input id="ma-nn" name="nn" [(ngModel)]="neu.nachname" /></div>
          <div class="feld"><label for="ma-mail">Dienstliche E-Mail</label><input id="ma-mail" name="mail" type="email" [(ngModel)]="neu.email" /></div>
          <div class="feld"><label for="ma-rolle">Rolle</label><select id="ma-rolle" name="rolle" [(ngModel)]="neu.rolle"><option value="SACHBEARBEITER">Sachbearbeitung</option><option value="ADMIN">Administration</option></select></div>
          @if (neu.rolle === 'SACHBEARBEITER') {
            <div class="feld"><label for="ma-team">Team</label><select id="ma-team" name="team" [(ngModel)]="neu.team"><option value="">Bitte wählen</option>@for (t of teams; track t) { <option [value]="t">{{ t }}</option> }</select></div>
            <div class="feld"><label for="ma-limit">Freigabelimit (€)</label><input id="ma-limit" name="limit" type="number" min="0" [(ngModel)]="neu.freigabeLimit" /></div>
            <label class="auswahl"><input type="checkbox" name="tl" [(ngModel)]="neu.teamleitung" /> Teamleitung</label>
          }
        </div>
        @if (zugang(); as z) { <div class="hinweis info">Startpasswort: <code>{{ z.startpasswort }}</code> · 2FA-Code: <code>{{ z.zweiFaktorCode }}</code> – bitte sicher übergeben.</div> }
        <div class="aktionen"><button class="btn" type="button" (click)="neuOffen.set(false)">Schließen</button><button class="btn primaer" type="submit">Anlegen</button></div>
      </form>
    }
    <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle"><thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Team</th><th>Teamleitung</th><th class="betrag">Freigabelimit</th><th>Sitzungen</th><th>Status</th><th></th></tr></thead><tbody>
      @for (m of liste(); track m.id) {
        <tr><td>{{ m.vorname }} {{ m.nachname }}</td><td class="klein">{{ m.email }}</td>
          <td><select [(ngModel)]="m.rolle" (ngModelChange)="aendern(m, { rolle: $event })" [attr.aria-label]="'Rolle von ' + m.vorname"><option value="SACHBEARBEITER">Sachbearbeitung</option><option value="ADMIN">Administration</option></select></td>
          <td><select [(ngModel)]="m.team" (ngModelChange)="aendern(m, { team: $event })" [attr.aria-label]="'Team von ' + m.vorname"><option [ngValue]="undefined">–</option>@for (t of teams; track t) { <option [value]="t">{{ t }}</option> }</select></td>
          <td><input type="checkbox" [(ngModel)]="m.teamleitung" (ngModelChange)="aendern(m, { teamleitung: $event })" [attr.aria-label]="'Teamleitung ' + m.vorname" /></td>
          <td class="betrag">{{ m.freigabeLimit | euro }} <button class="btn link klein" type="button" (click)="limit(m)">ändern</button></td>
          <td>{{ m.aktiveSitzungen }}</td>
          <td><span class="badge" [class.rot]="m.gesperrt" [class.gruen]="!m.gesperrt">{{ m.gesperrt ? 'gesperrt' : 'aktiv' }}</span></td>
          <td><button class="btn klein" type="button" (click)="aendern(m, { gesperrt: !m.gesperrt })">{{ m.gesperrt ? 'Entsperren' : 'Sperren' }}</button></td></tr>
      }
    </tbody></table></div>`,
})
export class AdminMitarbeitendeComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly teams = TEAMS;
  readonly liste = signal<any[]>([]);
  readonly neuOffen = signal(false);
  readonly zugang = signal<any>(null);
  neu: any = { vorname: '', nachname: '', email: '', rolle: 'SACHBEARBEITER', team: '', freigabeLimit: 1000, teamleitung: false };

  ngOnInit() {
    this.laden();
  }
  async laden() {
    this.liste.set(await this.api.get('/api/admin/mitarbeitende'));
  }
  async anlegen() {
    try {
      this.zugang.set(await this.api.post('/api/admin/mitarbeitende', this.neu));
      this.ui.erfolg('Mitarbeiter/in angelegt.');
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
  async aendern(m: any, aenderung: any) {
    try {
      await this.api.put(`/api/admin/mitarbeitende/${m.id}`, aenderung);
      this.ui.erfolg('Gespeichert und protokolliert.');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
    this.laden();
  }
  limit(m: any) {
    const w = prompt(`Neues Freigabelimit für ${m.vorname} ${m.nachname} in Euro:`, String(m.freigabeLimit ?? 0));
    if (w !== null) this.aendern(m, { freigabeLimit: Number(w) });
  }
}

@Component({
  selector: 'vp-admin-inhalte',
  imports: [FormsModule, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>Inhalte verwalten</h1>
    <nav class="reiter"><button type="button" [class.aktiv]="reiter() === 'faq'" (click)="reiter.set('faq')">Häufige Fragen</button>
      <button type="button" [class.aktiv]="reiter() === 'meldungen'" (click)="reiter.set('meldungen')">Meldungen & Banner</button></nav>
    @if (reiter() === 'faq') {
      <form class="karte formular" (ngSubmit)="faqSpeichern()">
        <h2>{{ faq.id ? 'Frage bearbeiten' : 'Neue Frage' }}</h2>
        <div class="feldgruppe">
          <div class="feld breit"><label for="fq-frage">Frage</label><input id="fq-frage" name="frage" [(ngModel)]="faq.frage" maxlength="200" /></div>
          <div class="feld breit"><label for="fq-antwort">Antwort</label><textarea id="fq-antwort" name="antwort" rows="4" [(ngModel)]="faq.antwort"></textarea></div>
          <div class="feld"><label for="fq-kat">Kategorie</label><input id="fq-kat" name="kat" [(ngModel)]="faq.kategorie" list="faq-kategorien" />
            <datalist id="faq-kategorien">@for (k of kategorien(); track k) { <option [value]="k"></option> }</datalist></div>
          <div class="feld"><label for="fq-rf">Reihenfolge</label><input id="fq-rf" name="rf" type="number" [(ngModel)]="faq.reihenfolge" /></div>
          <label class="auswahl"><input type="checkbox" name="sichtbar" [(ngModel)]="faq.sichtbar" /> veröffentlicht</label>
        </div>
        <div class="aktionen"><button class="btn primaer" type="submit">Speichern</button>@if (faq.id) { <button class="btn" type="button" (click)="faqNeu()">Abbrechen</button> }</div>
      </form>
      <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle"><thead><tr><th>#</th><th>Frage</th><th>Kategorie</th><th>Hilfreich / nicht</th><th>Status</th><th></th></tr></thead><tbody>
        @for (f of faqs(); track f.id) { <tr><td>{{ f.reihenfolge }}</td><td>{{ f.frage }}</td><td>{{ f.kategorie }}</td><td>{{ f.hilfreich }} / {{ f.nichtHilfreich }}</td>
          <td><span class="badge" [class.gruen]="f.sichtbar">{{ f.sichtbar ? 'online' : 'entwurf' }}</span></td>
          <td><button class="btn link klein" type="button" (click)="faq = { ...f }">Bearbeiten</button><button class="btn link klein" type="button" (click)="faqLoeschen(f)">Löschen</button></td></tr> }
      </tbody></table></div>
    } @else {
      <form class="karte formular" (ngSubmit)="meldungSpeichern()">
        <h2>{{ meldung.id ? 'Meldung bearbeiten' : 'Neue Meldung' }}</h2>
        <div class="feldgruppe">
          <div class="feld"><label for="ml-titel">Titel</label><input id="ml-titel" name="titel" [(ngModel)]="meldung.titel" /></div>
          <div class="feld"><label for="ml-typ">Typ</label><select id="ml-typ" name="typ" [(ngModel)]="meldung.typ"><option value="INFO">Information</option><option value="WARNUNG">Warnung</option><option value="STOERUNG">Störung</option></select></div>
          <div class="feld breit"><label for="ml-text">Text</label><textarea id="ml-text" name="text" rows="2" [(ngModel)]="meldung.text"></textarea></div>
          <div class="feld"><label for="ml-von">Aktiv von</label><input id="ml-von" name="von" type="date" [(ngModel)]="meldung.aktivVon" /></div>
          <div class="feld"><label for="ml-bis">Aktiv bis</label><input id="ml-bis" name="bis" type="date" [(ngModel)]="meldung.aktivBis" /></div>
          <div class="feld"><label for="ml-ziel">Zielgruppe</label><select id="ml-ziel" name="ziel" [(ngModel)]="meldung.zielgruppe"><option value="ALLE">Alle</option><option value="VERSICHERTE">Versicherte</option><option value="MITARBEITENDE">Mitarbeitende</option></select></div>
        </div>
        <div class="aktionen"><button class="btn primaer" type="submit">Speichern</button></div>
      </form>
      <ul class="liste-ohne karte">@for (m of meldungen(); track m.id) {
        <li class="zeile"><span><span class="badge">{{ m.typ }}</span> <strong>{{ m.titel }}</strong> <span class="klein leise">{{ m.aktivVon | datum }} – {{ m.aktivBis | datum }} · {{ m.zielgruppe }}</span><br /><span class="klein">{{ m.text }}</span></span>
          <span><button class="btn link klein" type="button" (click)="meldung = { ...m }">Bearbeiten</button><button class="btn link klein" type="button" (click)="meldungLoeschen(m)">Löschen</button></span></li>
      }</ul>
    }`,
})
export class AdminInhalteComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly reiter = signal<'faq' | 'meldungen'>('faq');
  readonly faqs = signal<FaqEintrag[]>([]);
  readonly meldungen = signal<Meldung[]>([]);
  readonly kategorien = signal<string[]>([]);
  faq: any = {};
  meldung: any = {};

  ngOnInit() {
    this.faqNeu();
    this.meldung = { typ: 'INFO', zielgruppe: 'ALLE', aktivVon: new Date().toLocaleDateString('sv-SE') };
    this.laden();
  }
  async laden() {
    const [f, m] = await Promise.all([this.api.get<FaqEintrag[]>('/api/inhalte/faq'), this.api.get('/api/inhalte/meldungen')]);
    this.faqs.set(f);
    this.kategorien.set(Array.from(new Set(f.map(x => x.kategorie))));
    this.meldungen.set(m.meldungen);
  }
  faqNeu() {
    this.faq = { sichtbar: true, kategorie: 'Online-Geschäftsstelle' };
  }
  async faqSpeichern() {
    try {
      if (this.faq.id) await this.api.put(`/api/admin/faq/${this.faq.id}`, this.faq);
      else await this.api.post('/api/admin/faq', this.faq);
      this.ui.erfolg('Gespeichert.');
      this.faqNeu();
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
  async faqLoeschen(f: FaqEintrag) {
    if (!(await this.ui.bestaetigen('FAQ löschen', `„${f.frage}“ löschen?`, { gefaehrlich: true, bestaetigen: 'Löschen' }))) return;
    await this.api.delete(`/api/admin/faq/${f.id}`);
    this.laden();
  }
  async meldungSpeichern() {
    try {
      if (this.meldung.id) await this.api.put(`/api/admin/meldungen/${this.meldung.id}`, this.meldung);
      else await this.api.post('/api/admin/meldungen', this.meldung);
      this.ui.erfolg('Meldung gespeichert.');
      this.meldung = { typ: 'INFO', zielgruppe: 'ALLE', aktivVon: new Date().toLocaleDateString('sv-SE') };
      this.laden();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
  async meldungLoeschen(m: Meldung) {
    await this.api.delete(`/api/admin/meldungen/${m.id}`);
    this.laden();
  }
}

@Component({
  selector: 'vp-admin-protokolle',
  imports: [FormsModule, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>Protokolle</h1>
    <nav class="reiter"><button type="button" [class.aktiv]="reiter() === 'audit'" (click)="reiter.set('audit')">Sicherheits- & Zugriffsprotokoll</button>
      <button type="button" [class.aktiv]="reiter() === 'fehler'" (click)="reiter.set('fehler'); fehlerLaden()">Fehlerprotokoll</button></nav>
    @if (reiter() === 'audit') {
      <div class="filterleiste">
        <div class="feld"><label for="pr-stufe">Stufe</label><select id="pr-stufe" [(ngModel)]="f.stufe" (ngModelChange)="laden()"><option value="">Alle</option><option value="INFO">Info</option><option value="WARNUNG">Warnung</option><option value="KRITISCH">Kritisch</option></select></div>
        <div class="feld"><label for="pr-suche">Suche</label><input id="pr-suche" [(ngModel)]="f.suche" (keyup.enter)="laden()" /></div>
      </div>
      <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle klein"><thead><tr><th>Zeitpunkt</th><th>Stufe</th><th>Ereignis</th><th>Betroffen</th><th>Akteur</th><th>Details</th><th>Gerät</th></tr></thead><tbody>
        @for (p of audit(); track p.id) { <tr><td class="nowrap">{{ p.zeitpunkt | datum: true }}</td><td><span class="badge" [class.rot]="p.stufe === 'KRITISCH'" [class.gelb]="p.stufe === 'WARNUNG'">{{ p.stufe }}</span></td>
          <td>{{ p.ereignis }}</td><td>{{ p.benutzer || '–' }}</td><td>{{ p.akteur || '–' }}</td><td>{{ p.details }}</td><td>{{ p.geraet }}</td></tr> }
      </tbody></table></div>
    } @else {
      <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle klein"><thead><tr><th>Zeitpunkt</th><th>Quelle</th><th>Ort</th><th>Meldung</th></tr></thead><tbody>
        @for (e of fehler(); track $index) { <tr><td class="nowrap">{{ e.zeitpunkt | datum: true }}</td><td>{{ e.quelle }}</td><td>{{ e.pfad }}</td><td>{{ e.meldung }}<details><summary>Details</summary><pre class="klein">{{ e.details }}</pre></details></td></tr> }
        @empty { <tr><td colspan="4" class="leer">Keine Fehler protokolliert.</td></tr> }
      </tbody></table></div>
    }`,
})
export class AdminProtokolleComponent implements OnInit {
  private api = inject(Api);
  readonly reiter = signal<'audit' | 'fehler'>('audit');
  readonly audit = signal<any[]>([]);
  readonly fehler = signal<any[]>([]);
  f = { stufe: '', suche: '' };
  ngOnInit() {
    this.laden();
  }
  async laden() {
    this.audit.set(await this.api.get('/api/admin/protokoll', this.f));
  }
  async fehlerLaden() {
    this.fehler.set(await this.api.get('/api/admin/fehler'));
  }
}

@Component({
  selector: 'vp-admin-feedback',
  imports: [DatumPipe, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>Feedback-Auswertung</h1>
    @if (f(); as f) {
      <div class="raster">
        <div class="karte"><span class="leise">Bewertungen</span><p class="kennzahl">{{ f.anzahl }}</p></div>
        <div class="karte"><span class="leise">Durchschnitt</span><p class="kennzahl">{{ f.durchschnitt }} ★</p></div>
        @for (a of f.nachArt; track a.art) { <div class="karte"><span class="leise">{{ a.art }}</span><p class="kennzahl">{{ a.anzahl }}</p></div> }
      </div>
      <div class="raster-2">
        <section class="karte"><h2>Verteilung</h2>@for (v of f.verteilung; track v.sterne) {
          <div class="zeile klein"><span>{{ v.sterne }} ★</span><div class="balken" style="flex:1"><span [style.width.%]="f.anzahl ? v.anzahl / f.anzahl * 100 : 0"></span></div><span>{{ v.anzahl }}</span></div> }</section>
        <section class="karte"><h2>FAQ mit Verbesserungsbedarf</h2><ul class="liste-ohne klein">@for (q of f.faq; track q.id) { <li class="zeile">{{ q.frage }} <span><vp-symbol name="thumbs-up" [groesse]="15" /> {{ q.hilfreich }} · <vp-symbol name="thumbs-down" [groesse]="15" /> {{ q.nichtHilfreich }}</span></li> }</ul></section>
      </div>
      <section class="karte"><h2>Kommentare</h2><ul class="liste-ohne">@for (e of f.eintraege; track e.id) {
        <li><span class="badge">{{ e.art }}</span> {{ '★'.repeat(e.bewertung) }} <span class="klein leise">{{ e.zeitpunkt | datum: true }} · {{ e.seite }}</span><br />{{ e.text || '(ohne Kommentar)' }}</li> }</ul></section>
    }`,
})
export class AdminFeedbackComponent implements OnInit {
  private api = inject(Api);
  readonly f = signal<any>(null);
  async ngOnInit() {
    this.f.set(await this.api.get('/api/admin/feedback'));
  }
}

@Component({
  selector: 'vp-admin-system',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>System</h1>
    @if (s(); as s) {
      <div class="raster-2">
        <section class="karte" [class.hervor]="s.wartungsmodus"><h2>Wartungsmodus</h2>
          <p>Status: <span class="badge" [class.rot]="s.wartungsmodus" [class.gruen]="!s.wartungsmodus">{{ s.wartungsmodus ? 'aktiv – Versicherte können sich nicht anmelden' : 'inaktiv' }}</span></p>
          <div class="feld"><label for="sys-text">Hinweistext</label><textarea id="sys-text" rows="3" [(ngModel)]="text"></textarea></div>
          <div class="aktionen"><button class="btn" [class.gefahr]="!s.wartungsmodus" type="button" (click)="umschalten(!s.wartungsmodus)">{{ s.wartungsmodus ? 'Wartungsmodus beenden' : 'Wartungsmodus aktivieren' }}</button></div></section>
        <section class="karte"><h2>Systeminformationen</h2><dl class="daten">
          <dt>Version</dt><dd>{{ s.version }}</dd><dt>Speicherbedarf</dt><dd>{{ s.speicherKb }} KB</dd>
          <dt>Benutzer</dt><dd>{{ s.datensaetze.benutzer }}</dd><dt>Vorgänge</dt><dd>{{ s.datensaetze.vorgaenge }}</dd><dt>Nachrichten</dt><dd>{{ s.datensaetze.nachrichten }}</dd><dt>Protokolleinträge</dt><dd>{{ s.datensaetze.protokoll }}</dd></dl>
          <h3>Löschkonzept</h3><p class="klein">Entfernt Papierkorb-Nachrichten älter als 30 Tage und abgelaufene Tokens. Läuft zusätzlich automatisch bei jeder Anfrage.</p>
          <button class="btn" type="button" (click)="loeschlauf()">Löschlauf jetzt ausführen</button></section>
        <section class="karte" [class.hervor]="s.stoerung"><h2>Störung simulieren</h2>
          <p class="klein">Für Ausfalltests: Antragsannahme, Nachrichtenversand und Uploads antworten mit „Dienst nicht erreichbar“ (HTTP 503). Eingaben bleiben im Browser erhalten.</p>
          <p>Status: <span class="badge" [class.rot]="s.stoerung" [class.gruen]="!s.stoerung">{{ s.stoerung ? 'Störung aktiv' : 'Normalbetrieb' }}</span></p>
          <button class="btn" type="button" (click)="stoerung(!s.stoerung)">{{ s.stoerung ? 'Störung beenden' : 'Störung starten' }}</button></section>
        <section class="karte"><h2>Testumgebung zurücksetzen</h2>
          <p class="klein">Stellt alle Testkonten, Vorgänge, Nachrichten und Einstellungen auf den Auslieferungszustand zurück. Alle Sitzungen werden beendet.</p>
          <button class="btn gefahr" type="button" (click)="zuruecksetzen()">Testdaten zurücksetzen</button></section>
      </div>
    }`,
})
export class AdminSystemComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly s = signal<any>(null);
  text = '';
  async ngOnInit() {
    const s = await this.api.get('/api/admin/system');
    this.s.set(s);
    this.text = s.wartungstext;
  }
  async umschalten(an: boolean) {
    if (an && !(await this.ui.bestaetigen('Wartungsmodus aktivieren', 'Alle Versicherten werden sofort abgemeldet und können sich nicht mehr anmelden.', { gefaehrlich: true, bestaetigen: 'Aktivieren' }))) return;
    try {
      this.s.set(await this.api.put('/api/admin/system', { wartungsmodus: an, wartungstext: this.text }));
      this.ui.erfolg(an ? 'Wartungsmodus aktiv.' : 'Wartungsmodus beendet.');
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
  async stoerung(an: boolean) {
    this.s.set(await this.api.put('/api/admin/system', { stoerung: an }));
    this.ui.info(an ? 'Störungssimulation aktiv.' : 'Störungssimulation beendet.');
  }
  async zuruecksetzen() {
    if (!(await this.ui.bestaetigen('Testdaten zurücksetzen', 'Alle Daten werden auf den Auslieferungszustand zurückgesetzt und alle Sitzungen beendet – auch Ihre.', { gefaehrlich: true, bestaetigen: 'Zurücksetzen' }))) return;
    await this.api.post('/api/demo/zuruecksetzen');
    sessionStorage.clear();
    window.location.href = '/anmelden';
  }
  async loeschlauf() {
    const r = await this.api.post('/api/admin/loeschlauf');
    this.ui.info(`Löschlauf abgeschlossen: ${r.nachrichten} Nachrichten, ${r.tokens} Tokens entfernt.`);
  }
}
