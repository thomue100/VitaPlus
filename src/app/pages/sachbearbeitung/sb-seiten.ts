import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TEAMS, VORGANG_TYP_TEXT } from '../../core/konfiguration';
import { formular } from '../../core/formulare/formular-katalog';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SachbearbeitungApi, SbVorgang, SbVorgangDetail } from '../../core/services/sachbearbeitung-api.service';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { StatusComponent } from '../../shared/bausteine';
import { DateigroessePipe, DatumPipe, EuroPipe, StatusTextPipe, TypTextPipe } from '../../shared/pipes';
import { SymbolComponent } from '../../shared/symbol.component';

const BETRAGS_TYPEN = ['KOSTENERSTATTUNG', 'ZAHNERSATZ', 'FAHRKOSTEN', 'KIEFERORTHOPAEDIE', 'KUENSTLICHE_BEFRUCHTUNG', 'VERHINDERUNGSPFLEGE', 'KURZZEITPFLEGE', 'WOHNUMFELD', 'ENTLASTUNGSBETRAG', 'ZUZAHLUNGSBEFREIUNG'];
const ERWARTET: Record<string, string> = { KOSTENERSTATTUNG: 'voraussichtlich', ZAHNERSATZ: 'festzuschuss', FAHRKOSTEN: 'erstattung', KIEFERORTHOPAEDIE: 'kassenanteil', KUENSTLICHE_BEFRUCHTUNG: 'zuschuss',
  VERHINDERUNGSPFLEGE: 'erstattbar', KURZZEITPFLEGE: 'erstattbar', WOHNUMFELD: 'zuschuss', ENTLASTUNGSBETRAG: 'erstattbar', ZUZAHLUNGSBEFREIUNG: 'erstattung' };

@Component({
  selector: 'vp-sb-eingang',
  imports: [FormsModule, StatusComponent, DatumPipe, EuroPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Postkorb</h1><p class="leise">{{ sitzung.benutzer()?.vorname }} {{ sitzung.benutzer()?.nachname }} · Team {{ sitzung.benutzer()?.team || '–' }}{{ sitzung.benutzer()?.teamleitung ? ' (Teamleitung)' : '' }}
      · Freigabelimit {{ sitzung.benutzer()?.freigabeLimit | euro }}</p></div></div>
    @if (stat(); as s) {
      <div class="raster">
        <div class="karte"><span class="leise">Offen gesamt</span><p class="kennzahl">{{ s['offen'] }}</p></div>
        <div class="karte"><span class="leise">Mein Team</span><p class="kennzahl">{{ s['meinTeam'] }}</p></div>
        <div class="karte"><span class="leise">Mir zugewiesen</span><p class="kennzahl">{{ s['meine'] }}</p></div>
        <div class="karte"><span class="leise">Überfällig</span><p class="kennzahl" [class.feldfehler]="s['ueberfaellig'] > 0">{{ s['ueberfaellig'] }}</p></div>
        <div class="karte"><span class="leise">Warten auf Rückmeldung</span><p class="kennzahl">{{ s['rueckfragen'] }}</p></div>
      </div>
    }
    <div class="filterleiste mt">
      <div class="feld"><label for="sb-status">Status</label><select id="sb-status" [(ngModel)]="f.status" (ngModelChange)="laden()">
        <option value="OFFEN">Offen</option><option value="EINGEREICHT">Neu</option><option value="IN_BEARBEITUNG">In Bearbeitung</option><option value="RUECKFRAGE">Rückfrage</option>
        <option value="GENEHMIGT">Genehmigt</option><option value="ABGELEHNT">Abgelehnt</option><option value="ALLE">Alle</option></select></div>
      <div class="feld"><label for="sb-team">Team</label><select id="sb-team" [(ngModel)]="f.team" (ngModelChange)="laden()"><option value="ALLE">Alle Teams</option>
        @for (t of teams; track t) { <option [value]="t">{{ t }}</option> }</select></div>
      <div class="feld"><label for="sb-typ">Art</label><select id="sb-typ" [(ngModel)]="f.typ" (ngModelChange)="laden()"><option value="">Alle</option>
        @for (t of typen; track t[0]) { <option [value]="t[0]">{{ t[1] }}</option> }</select></div>
      <div class="feld"><label for="sb-suche">Suche</label><input id="sb-suche" type="search" [(ngModel)]="f.suche" (keyup.enter)="laden()" placeholder="Nummer, Name, VNR" /></div>
      <div class="feld"><label for="sb-sort">Sortierung</label><select id="sb-sort" [(ngModel)]="f.sortierung" (ngModelChange)="laden()"><option value="ALT">Älteste zuerst</option><option value="NEU">Neueste zuerst</option><option value="BETRAG">Höchster Betrag</option></select></div>
      <label class="auswahl"><input type="checkbox" [(ngModel)]="f.meine" (ngModelChange)="laden()" /> nur meine</label>
    </div>
    <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle">
      <thead><tr><th>Eingang</th><th>Vorgang</th><th>Versicherte/r</th><th>Team</th><th class="betrag">Betrag</th><th>Bearbeiter/in</th><th>Status</th></tr></thead>
      <tbody>
        @for (v of liste(); track v.id) {
          <tr class="klickbar" (click)="oeffnen(v)" (keydown.enter)="oeffnen(v)" tabindex="0">
            <td class="nowrap">{{ v.erstelltAm | datum }} @if (v.ueberfaellig) { <span class="badge rot">überfällig</span> }</td>
            <td><strong>{{ v.vorgangsnummer }}</strong><br /><span class="klein">{{ v.titel }}</span></td>
            <td>{{ v.versicherter?.name || v.externKontakt?.name + ' (extern)' }}<br /><span class="klein leise">{{ v.versicherter?.versichertennummer }}</span></td>
            <td class="klein">{{ v.zustaendig }}</td>
            <td class="betrag">{{ v.betragBeantragt ? (v.betragBeantragt | euro) : '' }}</td><td class="klein">{{ v.bearbeiter || '–' }}</td><td><vp-status [wert]="v.status" /></td></tr>
        } @empty { <tr><td colspan="7" class="leer">Keine Vorgänge im Postkorb.</td></tr> }
      </tbody></table></div>`,
})
export class SbEingangComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  private api = inject(SachbearbeitungApi);
  private router = inject(Router);
  readonly teams = TEAMS;
  readonly typen = Object.entries(VORGANG_TYP_TEXT);
  readonly liste = signal<SbVorgang[]>([]);
  readonly stat = signal<Record<string, number> | null>(null);
  f = { status: 'OFFEN', team: '', typ: '', suche: '', sortierung: 'ALT', meine: false };

  ngOnInit() {
    const b = this.sitzung.benutzer()!;
    this.f.team = b.teamleitung ? 'ALLE' : b.team || 'ALLE';
    this.laden();
  }

  async laden() {
    const [l, s] = await Promise.all([this.api.eingang(this.f), this.api.statistik()]);
    this.liste.set(l);
    this.stat.set(s);
  }

  oeffnen(v: SbVorgang) {
    this.router.navigate(['/sachbearbeitung/vorgang', v.id]);
  }
}

@Component({
  selector: 'vp-sb-vorgang',
  imports: [FormsModule, RouterLink, StatusComponent, DatumPipe, EuroPipe, TypTextPipe, StatusTextPipe, DateigroessePipe, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p class="brotkrumen"><a routerLink="/sachbearbeitung">Postkorb</a> › {{ v()?.vorgangsnummer }}</p>
    @if (v(); as v) {
      <div class="seitenkopf"><div><h1>{{ v.titel }}</h1><p class="leise">{{ v.typ | typText }} · {{ v.vorgangsnummer }} · Team {{ v.zustaendig }} · Eingang {{ v.erstelltAm | datum: true }}</p></div>
        <div><vp-status [wert]="v.status" /> @if (v.ueberfaellig) { <span class="badge rot">überfällig</span> }</div></div>
      <div class="aktionen mb">
        @if (offen()) {
          @if (!v.darfEntscheiden) { <button class="btn primaer" type="button" (click)="uebernehmen()">{{ v.bearbeiter ? 'Neu zuweisen an mich' : 'Vorgang übernehmen' }}</button> }
          @else { <button class="btn" type="button" (click)="freigeben()">In den Postkorb zurücklegen</button> }
        }
        <span class="klein leise">Bearbeiter/in: {{ v.bearbeiter || 'nicht zugewiesen' }}</span>
      </div>
      <div class="raster-2">
        <section class="karte">
          <h2>Antragsdaten</h2>
          <dl class="daten">
            @if (v.betragBeantragt) { <dt>Beantragt</dt><dd>{{ v.betragBeantragt | euro }}</dd> }
            @if (erwartet() !== null) { <dt>Berechneter Anspruch</dt><dd class="fett">{{ erwartet() | euro }}</dd> }
            @if (v.betragErstattet !== undefined) { <dt>Bewilligt</dt><dd>{{ v.betragErstattet | euro }}</dd> }
            @for (z of daten(); track z[0]) { <dt>{{ z[0] }}</dt><dd>{{ z[1] }}</dd> }
          </dl>
          @if (v.rueckfrage) { <div class="hinweis warnung"><strong>Offene Rückfrage:</strong> {{ v.rueckfrage }} (Frist {{ v.rueckfrageFrist | datum }})</div> }
          @if (v.daten['antwortRueckfrage']) { <div class="hinweis info"><strong>Antwort des Versicherten:</strong> {{ v.daten['antwortRueckfrage'] }}</div> }
          @if (v.ablehnungsgrund) { <div class="hinweis fehler"><strong>Ablehnungsgrund:</strong> {{ v.ablehnungsgrund }}</div> }
          <h3>Unterlagen</h3>
          <ul class="liste-ohne">@for (a of v.anhaenge; track a.id) { <li class="klein"><vp-symbol name="file-text" [groesse]="15" /> {{ a.name }} ({{ a.groesseBytes | groesse }}, {{ a.hochgeladenAm | datum }})</li> } @empty { <li class="leer">Keine Unterlagen</li> }</ul>
        </section>
        <section class="karte">
          <h2>Versicherte/r</h2>
          @if (v.versicherterDetails; as p) {
            <dl class="daten">
              <dt>Name</dt><dd>{{ p.titel }} {{ p.vorname }} {{ p.nachname }}</dd><dt>Versichertennummer</dt><dd>{{ p.versichertennummer }}</dd>
              <dt>Geburtsdatum</dt><dd>{{ p.geburtsdatum | datum }}</dd><dt>Tarif</dt><dd>{{ p.tarif }}</dd><dt>Status</dt><dd>{{ p.beschaeftigung }} · {{ p.versicherungsart }}</dd>
              <dt>Anschrift</dt><dd>{{ p.adresse.strasse }} {{ p.adresse.hausnummer }}, {{ p.adresse.plz }} {{ p.adresse.ort }}</dd>
              <dt>Bankverbindung</dt><dd>{{ p.bank ? p.bank.iban + ' (' + p.bank.kontoinhaber + ')' : 'keine' }}</dd>
            </dl>
            <h3>Weitere Vorgänge</h3>
            <ul class="liste-ohne klein">@for (w of v.weitereVorgaenge; track w.id) { <li class="zeile"><a [routerLink]="['/sachbearbeitung/vorgang', w.id]">{{ w.vorgangsnummer }} {{ w.titel }}</a><vp-status [wert]="w.status" /></li> }</ul>
          } @else if (v.externKontakt) { <p>Externe Einreichung: {{ v.externKontakt.name }} ({{ v.externKontakt.email }})</p> }
        </section>
      </div>

      @if (v.darfEntscheiden && v.status === 'IN_BEARBEITUNG') {
        <section class="karte hervor">
          <h2>Entscheidung</h2>
          <fieldset><legend>Ergebnis</legend><div class="auswahlgruppe zeile">
            <label class="auswahl"><input type="radio" name="ent" value="GENEHMIGT" [(ngModel)]="entscheidung" /> genehmigen</label>
            <label class="auswahl"><input type="radio" name="ent" value="ABGELEHNT" [(ngModel)]="entscheidung" /> ablehnen</label>
            <label class="auswahl"><input type="radio" name="ent" value="RUECKFRAGE" [(ngModel)]="entscheidung" /> Rückfrage stellen</label></div></fieldset>
          @if (entscheidung === 'GENEHMIGT' && betragsTyp()) {
            <div class="feld mt"><label for="sb-betrag" class="pflicht">Bewilligter Betrag (€)</label><input id="sb-betrag" type="number" step="0.01" min="0" [(ngModel)]="betrag" />
              @if (betrag > (sitzung.benutzer()?.freigabeLimit || 0)) { <span class="feldfehler">Übersteigt Ihr Freigabelimit – Teamleitung erforderlich.</span> }</div>
          }
          @if (entscheidung === 'GENEHMIGT' && v.typ === 'PFLEGEGRAD') {
            <div class="feld mt"><label for="sb-pg" class="pflicht">Festgestellter Pflegegrad laut Gutachten</label><select id="sb-pg" [(ngModel)]="pflegegrad"><option [ngValue]="1">1</option><option [ngValue]="2">2</option><option [ngValue]="3">3</option><option [ngValue]="4">4</option><option [ngValue]="5">5</option></select></div>
          }
          <div class="feld mt"><label for="sb-text">{{ entscheidung === 'RUECKFRAGE' ? 'Rückfrage an den Versicherten' : 'Begründung' }}{{ entscheidung === 'ABGELEHNT' || entscheidung === 'RUECKFRAGE' ? ' (mind. 20 Zeichen)' : ' (bei Teilgenehmigung Pflicht)' }}</label>
            <textarea id="sb-text" rows="4" [(ngModel)]="begruendung"></textarea></div>
          <div class="aktionen"><button class="btn primaer" type="button" (click)="entscheiden()" [disabled]="!entscheidung">Entscheidung speichern</button></div>
        </section>
      }

      <div class="raster-2">
        <section class="karte"><h2>Verlauf</h2>
          <ul class="zeitleiste">@for (h of verlauf(); track $index) { <li><strong>{{ h.status | statusText }}</strong> · <span class="klein leise">{{ h.zeitpunkt | datum: true }} · {{ h.von }}</span><br />{{ h.text }}</li> }</ul></section>
        <section class="karte"><h2>Interne Notizen</h2>
          <ul class="liste-ohne klein">@for (n of v.daten['notizen'] || []; track n.zeitpunkt) { <li><strong>{{ n.von }}</strong> · {{ n.zeitpunkt | datum: true }}<br />{{ n.text }}</li> } @empty { <li class="leer">Keine Notizen</li> }</ul>
          <div class="feld mt"><label for="sb-notiz">Neue Notiz (für Versicherte nicht sichtbar)</label><textarea id="sb-notiz" rows="2" [(ngModel)]="notiz"></textarea></div>
          <button class="btn klein mt" type="button" (click)="notizSpeichern()" [disabled]="!notiz.trim()">Notiz speichern</button></section>
      </div>
    } @else if (fehler()) { <div class="hinweis fehler">{{ fehler() }}</div> }`,
})
export class SbVorgangComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  private api = inject(SachbearbeitungApi);
  private ui = inject(UiService);
  readonly id = input.required<string>();
  readonly v = signal<SbVorgangDetail | null>(null);
  readonly fehler = signal<string | null>(null);
  entscheidung = '';
  betrag = 0;
  begruendung = '';
  pflegegrad = 2;
  notiz = '';

  readonly offen = computed(() => ['EINGEREICHT', 'IN_BEARBEITUNG', 'RUECKFRAGE'].includes(this.v()?.status || ''));
  readonly verlauf = computed(() => [...(this.v()?.historie || [])].reverse());
  readonly betragsTyp = computed(() => BETRAGS_TYPEN.includes(this.v()?.typ || ''));
  readonly erwartet = computed(() => {
    const v = this.v();
    const feld = v ? ERWARTET[v.typ] : undefined;
    return feld && v!.daten[feld] !== undefined ? Number(v!.daten[feld]) : null;
  });
  readonly daten = computed(() => {
    const v = this.v();
    if (!v) return [];
    const def = formular(v.typ);
    const label = (k: string) => def?.schritte.flatMap(s => s.felder).find(f => f.name === k)?.label || k;
    return Object.entries(v.daten).filter(([k, w]) => !['notizen', 'antwortRueckfrage', 'anhaenge'].includes(k) && w !== null && w !== undefined && w !== '' && typeof w !== 'object')
      .map(([k, w]) => [label(k), typeof w === 'boolean' ? (w ? 'Ja' : 'Nein') : String(w)] as [string, string]);
  });

  async ngOnInit() {
    try {
      this.setzen(await this.api.detail(this.id()));
    } catch (e) {
      this.fehler.set(fehlertext(e));
    }
  }

  private setzen(v: SbVorgangDetail) {
    this.v.set(v);
    this.betrag = this.erwartet() ?? v.betragBeantragt ?? 0;
  }

  private async aktion(f: () => Promise<SbVorgangDetail>, meldung: string) {
    try {
      this.setzen(await f());
      this.ui.erfolg(meldung);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }

  uebernehmen() {
    this.aktion(() => this.api.uebernehmen(this.id()), 'Vorgang übernommen.');
  }

  async freigeben() {
    await this.api.freigeben(this.id());
    this.setzen(await this.api.detail(this.id()));
  }

  entscheiden() {
    if (this.entscheidung === 'RUECKFRAGE') {
      this.aktion(() => this.api.rueckfrage(this.id(), this.begruendung), 'Rückfrage gesendet.');
    } else {
      const zusatz = this.v()!.typ === 'PFLEGEGRAD' ? { pflegegrad: this.pflegegrad } : undefined;
      this.aktion(() => this.api.entscheiden(this.id(), this.entscheidung as 'GENEHMIGT' | 'ABGELEHNT', this.betragsTyp() ? Number(this.betrag) : undefined, this.begruendung, zusatz),
        'Entscheidung gespeichert. Der Versicherte wurde informiert.');
    }
    this.begruendung = '';
  }

  notizSpeichern() {
    this.aktion(() => this.api.notiz(this.id(), this.notiz), 'Notiz gespeichert.');
    this.notiz = '';
  }
}

@Component({
  selector: 'vp-sb-versicherte',
  imports: [FormsModule, DatumPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>Versichertensuche</h1>
    <form class="filterleiste" (ngSubmit)="suchen()">
      <div class="feld" style="flex:1"><label for="vs-q">Name, Versichertennummer oder E-Mail</label><input id="vs-q" name="q" [(ngModel)]="q" /></div>
      <button class="btn primaer" type="submit">Suchen</button></form>
    @if (fehler()) { <div class="hinweis warnung">{{ fehler() }}</div> }
    <div class="tabelle-wrapper karte" style="padding:0"><table class="tabelle"><thead><tr><th>Name</th><th>VNR</th><th>Geburtsdatum</th><th>Ort</th><th>E-Mail</th><th>Zugang</th><th></th></tr></thead><tbody>
      @for (p of ergebnis(); track p.id) {
        <tr><td>{{ p.name }}</td><td>{{ p.versichertennummer }}</td><td>{{ p.geburtsdatum | datum }}</td><td>{{ p.ort }}</td><td class="klein">{{ p.email }}</td>
          <td><span class="badge" [class.rot]="p.gesperrt" [class.gruen]="!p.gesperrt">{{ p.gesperrt ? 'gesperrt' : 'aktiv' }}</span></td>
          <td>@if (p.gesperrt) { <button class="btn klein" type="button" (click)="entsperren(p)">Entsperren</button> } @else { <button class="btn klein gefahr" type="button" (click)="sperren(p)">Sperren</button> }</td></tr>
      } @empty { <tr><td colspan="7" class="leer">Bitte suchen Sie nach einer Person.</td></tr> }
    </tbody></table></div>
    @if (sperrPerson(); as p) {
      <div class="karte hervor mt"><h2>Zugang von {{ p.name }} sperren</h2>
        <div class="feld"><label for="vs-grund" class="pflicht">Grund (wird protokolliert)</label><textarea id="vs-grund" rows="2" [(ngModel)]="grund"></textarea></div>
        <div class="aktionen"><button class="btn" type="button" (click)="sperrPerson.set(null)">Abbrechen</button><button class="btn gefahr primaer" type="button" (click)="sperrenBestaetigen()">Sperren</button></div></div>
    }`,
})
export class SbVersicherteComponent {
  private api = inject(SachbearbeitungApi);
  private ui = inject(UiService);
  readonly ergebnis = signal<any[]>([]);
  readonly fehler = signal<string | null>(null);
  readonly sperrPerson = signal<any>(null);
  q = '';
  grund = '';

  async suchen() {
    this.fehler.set(null);
    try {
      this.ergebnis.set(await this.api.versicherte(this.q));
    } catch (e) {
      this.fehler.set(fehlertext(e));
    }
  }

  async entsperren(p: any) {
    if (!(await this.ui.bestaetigen('Zugang entsperren', `Haben Sie die Identität von ${p.name} geprüft (z. B. Geburtsdatum und Anschrift telefonisch abgefragt)?`, { bestaetigen: 'Identität geprüft – entsperren' }))) return;
    await this.api.entsperren(p.id);
    this.ui.erfolg('Der Zugang wurde entsperrt.');
    this.suchen();
  }

  sperren(p: any) {
    this.grund = '';
    this.sperrPerson.set(p);
  }

  async sperrenBestaetigen() {
    try {
      await this.api.sperren(this.sperrPerson().id, this.grund);
      this.ui.erfolg('Der Zugang wurde gesperrt.');
      this.sperrPerson.set(null);
      this.suchen();
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
