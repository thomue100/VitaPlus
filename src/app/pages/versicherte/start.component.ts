import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TARIFE } from '../../core/konfiguration';
import { Gesundheitskarte, Termin } from '../../core/models';
import { Api } from '../../core/services/api.service';
import { BonusApi, BonusDaten, PostfachApi, TerminApi } from '../../core/services/service-api.service';
import { SitzungService } from '../../core/services/sitzung.service';
import { KartenApi } from '../../core/services/versicherten-api.service';
import { VorgangApi, VorgangUebersicht } from '../../core/services/vorgang-api.service';
import { heuteIso } from '../../core/util/datum';
import { DatumPipe, UebersetzungPipe } from '../../shared/pipes';
import { SymbolComponent } from '../../shared/symbol.component';
import { EgkComponent } from '../../shared/egk.component';
import { BearbeitungsstandComponent } from '../../shared/bearbeitungsstand.component';

@Component({
  selector: 'vp-start',
  imports: [RouterLink, DatumPipe, UebersetzungPipe, SymbolComponent, EgkComponent, BearbeitungsstandComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let b = sitzung.benutzer()!;
    <div class="startkopf">
        <h1>{{ gruss() | t }}, {{ b.anrede === 'FRAU' ? 'Frau' : b.anrede === 'HERR' ? 'Herr' : '' }} {{ b.titel ? b.titel + ' ' : '' }}{{ b.nachname }}</h1>
        @if (sitzung.letzterLogin()) { <p class="leise klein">Ihre letzte Anmeldung war am {{ sitzung.letzterLogin() | datum: true }}. Waren Sie das nicht? <a routerLink="/einstellungen/sicherheit">Sitzungen prüfen</a></p> }
    </div>

    <div class="startraster">
      <section class="karte aufgaben" aria-labelledby="aufgaben-titel">
        <h2 id="aufgaben-titel">Für Sie zu erledigen</h2>
        <ul class="aufgabenliste">
          @for (a of aufgaben(); track a.text) {
            <li [class]="a.art">
              <vp-symbol [name]="a.symbol" [groesse]="20" />
              <span class="aufgabe-text">{{ a.text }}@if (a.frist) { <span class="klein leise">Frist: {{ a.frist | datum }}</span> }</span>
              <a class="btn klein" [class.primaer]="a.art === 'dringend'" [routerLink]="a.link">{{ a.linkText }}</a>
            </li>
          } @empty {
            <li class="erledigt"><vp-symbol name="circle-check" [groesse]="20" /><span class="aufgabe-text">Zurzeit ist nichts zu erledigen.</span></li>
          }
        </ul>
      </section>

      <section class="karte versicherung" aria-labelledby="vers-titel">
        <h2 id="vers-titel">Ihre Versicherung</h2>
        <div class="kartenbereich">
          <vp-egk [name]="(b.titel ? b.titel + ' ' : '') + b.vorname + ' ' + b.nachname" [versichertennummer]="b.versichertennummer || ''" [kartennummer]="tarifName()"
                  [gueltigBis]="karte()?.gueltigBis" [status]="karte()?.status || 'AKTIV'" [foto]="karte()?.fotoVorhanden ?? true" />
        </div>
        <dl class="daten kompakt">
          <dt>Tarif</dt><dd>{{ tarifName() }}</dd>
          <dt>Versichertennummer</dt><dd>{{ b.versichertennummer }}</dd>
          @if (bonusJahr(); as j) { <dt>Bonuspunkte {{ jahr }}</dt><dd>{{ j.bestaetigt }}@if (j.offen) { <span class="leise">, {{ j.offen }} in Prüfung</span> }</dd> }
          @if (termin(); as t) { <dt>Nächster Termin</dt><dd>{{ t.datum | datum }}, {{ t.uhrzeit }} Uhr<br /><span class="leise">{{ t.thema }} ({{ t.kanal === 'FILIALE' ? 'Filiale' : t.kanal === 'TELEFON' ? 'Telefon' : 'Video' }})</span></dd> }
        </dl>
        <p class="klein verweise"><a routerLink="/versicherung">Versicherungsdetails</a> <a routerLink="/gesundheitskarte">Gesundheitskarte verwalten</a></p>
      </section>
    </div>

    <section class="karte" aria-labelledby="vorgaenge-titel">
      <div class="zeile abschnittskopf"><h2 id="vorgaenge-titel">Ihre Vorgänge</h2><a routerLink="/vorgaenge">Alle Vorgänge anzeigen</a></div>
      <ul class="vorgangsliste">
        @for (v of uebersicht()?.letzte || []; track v.id) {
          <li>
            <a [routerLink]="['/vorgaenge', v.id]" class="vorgang-titel">{{ v.titel }}</a>
            <span class="klein leise">{{ v.vorgangsnummer }}, zuletzt geändert am {{ v.geaendertAm | datum }}</span>
            <vp-bearbeitungsstand [vorgang]="v" [kompakt]="true" />
          </li>
        } @empty { <li class="leer">Sie haben noch keine Anträge gestellt.</li> }
      </ul>
    </section>

    <section aria-labelledby="anliegen-titel">
      <h2 id="anliegen-titel">Häufige Anliegen</h2>
      <ul class="anliegen">
        @for (k of schnellzugriff; track k.titel) {
          <li><a [routerLink]="k.route"><vp-symbol [name]="k.symbol" [groesse]="20" /><span><span class="anliegen-titel">{{ k.titel }}</span><span class="klein leise">{{ k.text }}</span></span></a></li>
        }
      </ul>
    </section>`,
  styles: [`
    .startkopf { margin-bottom: 1.5rem; }
    .startkopf h1 { margin-bottom: .4rem; }
    .kartenbereich { width: min(320px, 100%); margin-bottom: 1rem; }
    .verweise { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-bottom: 0; }
    .startraster { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; }
    .aufgabenliste { list-style: none; margin: 0; padding: 0; }
    .aufgabenliste li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .75rem; align-items: center; padding: .75rem 0; border-top: 1px solid var(--vp-rand); }
    .aufgabenliste li:first-child { border-top: none; padding-top: 0; }
    .aufgabe-text { display: flex; flex-direction: column; }
    .aufgabenliste .dringend vp-symbol { color: var(--vp-warnung); }
    .aufgabenliste .fehler vp-symbol { color: var(--vp-fehler); }
    .aufgabenliste .normal vp-symbol, .aufgabenliste .erledigt vp-symbol { color: var(--vp-primaer); }
    .aufgabenliste .erledigt { grid-template-columns: auto 1fr; }
    dl.kompakt { grid-template-columns: minmax(0, 11rem) 1fr; }
    .abschnittskopf h2 { margin: 0; }
    .abschnittskopf { margin-bottom: .75rem; }
    .vorgangsliste { list-style: none; margin: 0; padding: 0; }
    .vorgangsliste li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); grid-template-rows: auto auto; column-gap: 1.5rem; padding: .85rem 0; border-top: 1px solid var(--vp-rand); }
    .vorgangsliste li:first-child { border-top: none; }
    .vorgangsliste vp-bearbeitungsstand { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
    .vorgang-titel { font-weight: 700; }
    .anliegen { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 2rem; }
    .anliegen a { display: flex; gap: .75rem; align-items: flex-start; padding: .75rem 0; border-bottom: 1px solid var(--vp-rand); text-decoration: none; color: var(--vp-text); }
    .anliegen a vp-symbol { color: var(--vp-primaer); margin-top: .1rem; }
    .anliegen a > span { display: flex; flex-direction: column; }
    .anliegen-titel { font-weight: 700; color: var(--vp-primaer); }
    .anliegen a:hover .anliegen-titel { text-decoration: underline; }
    @media (max-width: 1100px) { .startraster { grid-template-columns: 1fr; } .anliegen { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 700px) {
      .anliegen { grid-template-columns: 1fr; }
      .vorgangsliste li { grid-template-columns: 1fr; }
      .vorgangsliste vp-bearbeitungsstand { grid-column: 1; grid-row: auto; margin-top: .5rem; }
      .aufgabenliste li { grid-template-columns: auto 1fr; }
      .aufgabenliste li .btn { grid-column: 2; justify-self: start; }
    }
  `],
})
export class StartComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  readonly postfach = inject(PostfachApi);
  private vorgangApi = inject(VorgangApi);
  private kartenApi = inject(KartenApi);
  private bonusApi = inject(BonusApi);
  private terminApi = inject(TerminApi);
  private api = inject(Api);

  readonly jahr = String(new Date().getFullYear());
  readonly schnellzugriff = [
    { route: '/erstattung', symbol: 'receipt-euro', titel: 'Rechnung einreichen', text: 'Zum Beispiel Zahnreinigung, Osteopathie, Reiseimpfung' },
    { route: '/krankmeldung', symbol: 'thermometer', titel: 'Krankmeldung übermitteln', text: 'Arbeitsunfähigkeit mitteilen und Krankengeld verfolgen' },
    { route: '/dokumente', symbol: 'file-check', titel: 'Bescheinigung anfordern', text: 'Mitgliedsbescheinigung, Versicherungsnachweis, EHIC-Ersatz' },
    { route: '/profil', symbol: 'map-pin', titel: 'Persönliche Daten ändern', text: 'Anschrift, Telefon, Bankverbindung' },
    { route: '/gesundheitskarte', symbol: 'id-card', titel: 'Gesundheitskarte sperren', text: 'Bei Verlust sperren und Ersatz bestellen' },
    { route: '/antraege', symbol: 'file-text', titel: 'Antrag stellen', text: 'Alle Anträge und Meldungen im Überblick' },
  ];
  readonly uebersicht = signal<VorgangUebersicht | null>(null);
  readonly karte = signal<Gesundheitskarte | null>(null);
  readonly bonus = signal<BonusDaten | null>(null);
  readonly termin = signal<Termin | null>(null);
  readonly beitrag = signal<any>(null);
  readonly tarifName = computed(() => TARIFE[this.sitzung.benutzer()!.tarif].name);
  readonly bonusJahr = computed(() => this.bonus()?.jahre.find(j => j.jahr === this.jahr));

  readonly gruss = computed(() => {
    const h = new Date().getHours();
    return h < 11 ? 'start.hallo.morgen' : h < 18 ? 'start.hallo.tag' : 'start.hallo.abend';
  });

  /** Was die versicherte Person tun sollte, dringendes zuerst */
  readonly aufgaben = computed(() => {
    const b = this.sitzung.benutzer()!;
    const l: { art: 'dringend' | 'fehler' | 'normal'; symbol: string; text: string; link: string; linkText: string; frist?: string }[] = [];
    for (const r of this.uebersicht()?.offeneRueckfragen || []) {
      l.push({ art: 'dringend', symbol: 'triangle-alert', text: `Für „${r.titel}“ (${r.vorgangsnummer}) fehlen noch Unterlagen.`, link: '/vorgaenge/' + r.id, linkText: 'Unterlagen nachreichen', frist: r.frist });
    }
    if (this.karte()?.status === 'ABGELAUFEN') l.push({ art: 'fehler', symbol: 'circle-alert', text: 'Ihre Gesundheitskarte ist abgelaufen.', link: '/gesundheitskarte', linkText: 'Neue Karte anfordern' });
    if (this.beitrag()?.kontostand?.mahnstufe > 0) l.push({ art: 'fehler', symbol: 'circle-alert', text: `Auf Ihrem Beitragskonto ist ein Betrag überfällig (Mahnstufe ${this.beitrag().kontostand.mahnstufe}).`, link: '/beitraege', linkText: 'Beitragskonto öffnen' });
    if (!b.bank) l.push({ art: 'dringend', symbol: 'triangle-alert', text: 'Hinterlegen Sie eine Bankverbindung, damit wir Erstattungen auszahlen können.', link: '/profil', linkText: 'Bankverbindung hinterlegen' });
    const ungelesen = this.postfach.ungelesen();
    if (ungelesen) l.push({ art: 'normal', symbol: 'mail', text: ungelesen === 1 ? 'Sie haben 1 ungelesene Nachricht.' : `Sie haben ${ungelesen} ungelesene Nachrichten.`, link: '/postfach', linkText: 'Postfach öffnen' });
    if (this.uebersicht()?.entwuerfe) l.push({ art: 'normal', symbol: 'file-text', text: 'Sie haben einen angefangenen Antrag gespeichert.', link: '/vorgaenge', linkText: 'Antrag fortsetzen' });
    if (this.karte() && !this.karte()!.fotoVorhanden) l.push({ art: 'normal', symbol: 'camera', text: 'Für Ihre nächste Gesundheitskarte benötigen wir ein Lichtbild.', link: '/gesundheitskarte', linkText: 'Foto hochladen' });
    if (!b.zweiFaktorAktiv) l.push({ art: 'normal', symbol: 'shield-check', text: 'Schützen Sie Ihr Konto zusätzlich mit einem SMS-Code bei der Anmeldung.', link: '/einstellungen/sicherheit', linkText: 'Zwei-Faktor-Anmeldung einrichten' });
    return l;
  });

  async ngOnInit() {
    const [u, karten, bonus, termine, beitrag] = await Promise.all([
      this.vorgangApi.uebersicht(), this.kartenApi.liste(), this.bonusApi.laden(), this.terminApi.liste(), this.api.get('/api/beitraege'),
      this.postfach.zaehlerAktualisieren(),
    ]);
    this.uebersicht.set(u);
    this.karte.set(karten.find(k => !k.familienmitgliedId && k.status !== 'GESPERRT') || karten.find(k => !k.familienmitgliedId) || null);
    this.bonus.set(bonus);
    this.beitrag.set(beitrag);
    this.termin.set(termine.filter(t => t.status === 'GEBUCHT' && t.datum >= heuteIso()).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null);
  }
}
