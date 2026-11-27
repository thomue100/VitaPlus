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
import { StatusComponent } from '../../shared/bausteine';
import { DatumPipe, EuroPipe, UebersetzungPipe } from '../../shared/pipes';
import { SymbolComponent } from '../../shared/symbol.component';
import { EgkComponent } from '../../shared/egk.component';

@Component({
  selector: 'vp-start',
  imports: [RouterLink, StatusComponent, DatumPipe, EuroPipe, UebersetzungPipe, SymbolComponent, EgkComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let b = sitzung.benutzer()!;
    <div class="startbuehne">
      <section class="begruessung">
        <div>
          <p class="datum-zeile">{{ heute }}</p>
          <h1>{{ gruss() | t }}, {{ b.anrede === 'FRAU' ? 'Frau' : b.anrede === 'HERR' ? 'Herr' : '' }} {{ b.titel ? b.titel + ' ' : '' }}{{ b.nachname }}</h1>
          <p class="leise">Schön, dass Sie da sind. Hier sehen Sie auf einen Blick, was gerade wichtig ist.</p>
          @if (sitzung.letzterLogin()) { <p class="leise klein letzte"><vp-symbol name="shield-check" [groesse]="15" /> Letzte Anmeldung: {{ sitzung.letzterLogin() | datum: true }}</p> }
        </div>
        <img src="bilder/dashboard-morgen.svg" alt="" width="520" height="230" />
      </section>
      <section class="kartenbereich" aria-label="Ihre Gesundheitskarte">
        <vp-egk [name]="(b.titel ? b.titel + ' ' : '') + b.vorname + ' ' + b.nachname" [versichertennummer]="b.versichertennummer || ''" [kartennummer]="tarifName()"
                [gueltigBis]="karte()?.gueltigBis" [status]="karte()?.status || 'AKTIV'" [foto]="karte()?.fotoVorhanden ?? true" />
        <a class="klein" routerLink="/gesundheitskarte">Karte verwalten <vp-symbol name="chevron-right" [groesse]="15" /></a>
      </section>
    </div>

    @for (h of hinweise(); track h.text) {
      <div class="hinweis {{ h.art }} mit-symbol" role="status"><vp-symbol [name]="h.art === 'info' ? 'info' : h.art === 'fehler' ? 'circle-alert' : 'triangle-alert'" [groesse]="20" />
        <span>{{ h.text }} @if (h.link) { <a [routerLink]="h.link">{{ h.linkText }}</a> }</span></div>
    }

    <div class="kennzahlen">
      <a class="kennzahl-kachel" routerLink="/postfach">
        <span class="kachel-symbol" style="--ton:#1d6fb8"><vp-symbol name="inbox" [groesse]="22" /></span>
        <span><span class="kennzahl">{{ postfach.ungelesen() }}</span><span class="leise">ungelesene Nachrichten</span></span>
      </a>
      <a class="kennzahl-kachel" routerLink="/vorgaenge">
        <span class="kachel-symbol" style="--ton:#d9822b"><vp-symbol name="list-checks" [groesse]="22" /></span>
        @if (uebersicht(); as u) {
          <span><span class="kennzahl">{{ u.offen }}</span><span class="leise">offene Vorgänge{{ u.rueckfragen ? ', ' + u.rueckfragen + ' mit Rückfrage' : '' }}</span>
            @if (u.entwuerfe) { <span class="klein leise">{{ u.entwuerfe }} Entwurf/Entwürfe gespeichert</span> }</span>
        }
      </a>
      <a class="kennzahl-kachel" routerLink="/bonus">
        <span class="kachel-symbol" style="--ton:#2a9d8f"><vp-symbol name="trophy" [groesse]="22" /></span>
        <span><span class="kennzahl">{{ bonusJahr()?.bestaetigt ?? 0 }}</span><span class="leise">Bonuspunkte {{ jahr }}</span></span>
      </a>
    </div>

    <h2>Was möchten Sie erledigen?</h2>
    <div class="kachelraster">
      @for (k of schnellzugriff; track k.titel) {
        <a class="symbolkachel" [routerLink]="k.route">
          <span class="kachel-symbol" [style.--ton]="k.ton"><vp-symbol [name]="k.symbol" [groesse]="24" /></span>
          <span class="kachel-titel">{{ k.titel }}</span><span class="kachel-text">{{ k.text }}</span>
        </a>
      }
    </div>

    <div class="raster-2 mt-2">
      <section class="karte">
        <h2>Zuletzt geändert</h2>
        <ul class="liste-ohne">
          @for (v of uebersicht()?.letzte || []; track v.id) {
            <li class="zeile"><a [routerLink]="['/vorgaenge', v.id]">{{ v.titel }}</a> <span><span class="klein leise">{{ v.geaendertAm | datum }}</span> <vp-status [wert]="v.status" /></span></li>
          } @empty { <li class="leer">Keine Vorgänge vorhanden.</li> }
        </ul>
      </section>
      <section class="karte">
        <h2>Bonusprogramm {{ jahr }}</h2>
        @if (bonusJahr(); as j) {
          <p class="kennzahl">{{ j.bestaetigt }} Punkte</p>
          <div class="balken" role="progressbar" [attr.aria-valuenow]="j.bestaetigt" aria-valuemin="0" [attr.aria-valuemax]="bonus()?.regeln?.mindestpunkteAuszahlung"><span [style.width.%]="bonusProzent()"></span></div>
          <p class="klein leise">{{ j.bestaetigt >= 500 ? 'Prämie verfügbar' : 'Noch ' + (500 - j.bestaetigt) + ' Punkte bis zur Prämie' }}{{ j.offen ? ' · ' + j.offen + ' Punkte in Prüfung' : '' }}</p>
        } @else if (!b.bonusTeilnahmeSeit) { <p>Sie nehmen noch nicht teil. Sammeln Sie Punkte für bis zu {{ 250 | euro }} Prämie im Jahr.</p> }
        <a routerLink="/bonus">Zum Bonusprogramm</a>
        @if (termin(); as t) {
          <h3>Nächster Termin</h3>
          <p>{{ t.datum | datum }} um {{ t.uhrzeit }} Uhr – {{ t.thema }} ({{ t.kanal === 'FILIALE' ? 'Filiale' : t.kanal === 'TELEFON' ? 'Telefon' : 'Video' }})</p>
        }
      </section>
    </div>`,
  styles: [`
    .startbuehne { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); gap: 1.25rem; margin-bottom: 1.25rem; }
    .begruessung { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 260px); align-items: center; gap: 1rem; padding: 1.5rem 1.75rem; border-radius: 16px;
      background: linear-gradient(115deg, #e3f3f0 0%, #f3faf8 65%, #fff 100%); border: 1px solid #d3ebe6; }
    .begruessung img { width: 100%; height: auto; }
    .datum-zeile { text-transform: uppercase; letter-spacing: .08em; font-size: .78rem; font-weight: 700; color: var(--vp-primaer); margin: 0 0 .3rem; }
    .letzte { display: inline-flex; align-items: center; gap: .35rem; margin: 0; }
    .kartenbereich { display: flex; flex-direction: column; gap: .6rem; justify-content: center; align-items: flex-start; }
    .kartenbereich a { display: inline-flex; align-items: center; gap: .2rem; }
    .kennzahlen { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin: .5rem 0 1rem; }
    .kennzahl-kachel { display: flex; align-items: center; gap: 1rem; padding: 1.1rem 1.25rem; background: #fff; border: 1px solid var(--vp-rand); border-radius: var(--vp-radius);
      text-decoration: none; color: var(--vp-text); box-shadow: var(--vp-schatten); transition: box-shadow .15s, transform .15s; }
    .kennzahl-kachel:hover { box-shadow: var(--vp-schatten-hoch); transform: translateY(-1px); color: var(--vp-text); }
    .kennzahl-kachel .kachel-symbol { margin: 0; }
    .kennzahl-kachel > span:last-child { display: flex; flex-direction: column; }
    @media (max-width: 1100px) { .startbuehne { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .begruessung { grid-template-columns: 1fr; } .begruessung img { display: none; } .kennzahlen { grid-template-columns: 1fr; } }
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
  readonly heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  readonly schnellzugriff = [
    { route: '/erstattung', symbol: 'receipt-euro', titel: 'Rechnung einreichen', text: 'Zahnreinigung, Osteopathie, Impfungen …', ton: '#0b6e69' },
    { route: '/krankmeldung', symbol: 'thermometer', titel: 'Krankmeldung', text: 'Arbeitsunfähigkeit mitteilen', ton: '#c2507a' },
    { route: '/dokumente', symbol: 'file-check', titel: 'Bescheinigung herunterladen', text: 'Mitgliedsbescheinigung, EHIC-Ersatz …', ton: '#1d6fb8' },
    { route: '/profil', symbol: 'map-pin', titel: 'Adresse ändern', text: 'Umzug, Telefon, Bankverbindung', ton: '#7c5cc4' },
    { route: '/gesundheitskarte', symbol: 'id-card', titel: 'Karte verloren?', text: 'Sperren und Ersatz bestellen', ton: '#d9822b' },
    { route: '/antraege', symbol: 'file-text', titel: 'Antrag stellen', text: 'Über 40 Anträge online', ton: '#2a9d8f' },
  ];
  readonly uebersicht = signal<VorgangUebersicht | null>(null);
  readonly karte = signal<Gesundheitskarte | null>(null);
  readonly bonus = signal<BonusDaten | null>(null);
  readonly termin = signal<Termin | null>(null);
  readonly beitrag = signal<any>(null);
  readonly tarifName = computed(() => TARIFE[this.sitzung.benutzer()!.tarif].name);
  readonly bonusJahr = computed(() => this.bonus()?.jahre.find(j => j.jahr === this.jahr));
  readonly bonusProzent = computed(() => Math.min(100, ((this.bonusJahr()?.bestaetigt || 0) / 500) * 100));

  readonly gruss = computed(() => {
    const h = new Date().getHours();
    return h < 11 ? 'start.hallo.morgen' : h < 18 ? 'start.hallo.tag' : 'start.hallo.abend';
  });

  readonly hinweise = computed(() => {
    const b = this.sitzung.benutzer()!;
    const l: { art: string; text: string; link?: string; linkText?: string }[] = [];
    if (!b.bank) l.push({ art: 'warnung', text: 'Sie haben noch keine Bankverbindung hinterlegt. Ohne Bankverbindung können wir keine Erstattungen auszahlen.', link: '/profil', linkText: 'Jetzt hinterlegen' });
    if (this.uebersicht()?.rueckfragen) l.push({ art: 'warnung', text: 'Zu einem Ihrer Vorgänge gibt es eine Rückfrage.', link: '/vorgaenge', linkText: 'Unterlagen nachreichen' });
    if (this.karte() && !this.karte()!.fotoVorhanden) l.push({ art: 'info', text: 'Für Ihre nächste Gesundheitskarte benötigen wir ein Lichtbild.', link: '/gesundheitskarte', linkText: 'Foto hochladen' });
    if (this.karte()?.status === 'ABGELAUFEN') l.push({ art: 'fehler', text: 'Ihre Gesundheitskarte ist abgelaufen.', link: '/gesundheitskarte', linkText: 'Neue Karte anfordern' });
    if (!b.zweiFaktorAktiv) l.push({ art: 'info', text: 'Schützen Sie Ihr Konto zusätzlich mit der Zwei-Faktor-Anmeldung.', link: '/einstellungen/sicherheit', linkText: 'Einrichten' });
    if (this.beitrag()?.kontostand?.mahnstufe > 0) l.push({ art: 'fehler', text: `Auf Ihrem Beitragskonto ist ein Betrag überfällig (Mahnstufe ${this.beitrag().kontostand.mahnstufe}).`, link: '/beitraege', linkText: 'Zum Beitragskonto' });
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
