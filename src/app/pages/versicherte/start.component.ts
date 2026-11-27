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

@Component({
  selector: 'vp-start',
  imports: [RouterLink, StatusComponent, DatumPipe, EuroPipe, UebersetzungPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let b = sitzung.benutzer()!;
    <div class="seitenkopf">
      <div><h1>{{ gruss() | t }}, {{ b.anrede === 'FRAU' ? 'Frau' : b.anrede === 'HERR' ? 'Herr' : '' }} {{ b.titel ? b.titel + ' ' : '' }}{{ b.nachname }}</h1>
        @if (sitzung.letzterLogin()) { <p class="leise klein">Letzte Anmeldung: {{ sitzung.letzterLogin() | datum: true }}</p> }</div>
    </div>

    @for (h of hinweise(); track h.text) {
      <div class="hinweis {{ h.art }}" role="status">{{ h.text }} @if (h.link) { <a [routerLink]="h.link">{{ h.linkText }}</a> }</div>
    }

    <div class="raster-3">
      <section class="karte versichertenkarte" aria-label="Ihre Versichertenkarte">
        <p class="klein">VitaPlus · {{ tarifName() }}</p>
        <p class="fett">{{ b.titel }} {{ b.vorname }} {{ b.nachname }}</p>
        <p class="klein">Versichertennummer<br /><span class="nummer">{{ b.versichertennummer }}</span></p>
        @if (karte(); as k) { <p class="klein">Karte gültig bis {{ k.gueltigBis | datum }} <vp-status [wert]="k.status" /></p> }
      </section>
      <section class="karte">
        <h2>Postfach</h2>
        <p class="kennzahl">{{ postfach.ungelesen() }}</p><p class="leise">ungelesene Nachrichten</p>
        <a routerLink="/postfach">Zum Postfach</a>
      </section>
      <section class="karte">
        <h2>Vorgänge</h2>
        @if (uebersicht(); as u) {
          <p class="kennzahl">{{ u.offen }}</p><p class="leise">offen{{ u.rueckfragen ? ', davon ' + u.rueckfragen + ' mit Rückfrage' : '' }}</p>
          @if (u.entwuerfe) { <p class="klein">{{ u.entwuerfe }} Entwurf/Entwürfe gespeichert</p> }
        }
        <a routerLink="/vorgaenge">Alle Vorgänge</a>
      </section>
    </div>

    <h2>Schnellzugriff</h2>
    <div class="raster">
      <a class="kachel" routerLink="/erstattung"><span class="titel">Rechnung einreichen</span><br /><span class="klein leise">Zahnreinigung, Osteopathie, Impfungen …</span></a>
      <a class="kachel" routerLink="/krankmeldung"><span class="titel">Krankmeldung</span><br /><span class="klein leise">Arbeitsunfähigkeit mitteilen</span></a>
      <a class="kachel" routerLink="/dokumente"><span class="titel">Bescheinigung herunterladen</span><br /><span class="klein leise">Mitgliedsbescheinigung, EHIC-Ersatz …</span></a>
      <a class="kachel" routerLink="/profil"><span class="titel">Adresse ändern</span><br /><span class="klein leise">Umzug, Telefon, Bankverbindung</span></a>
      <a class="kachel" routerLink="/gesundheitskarte"><span class="titel">Karte verloren?</span><br /><span class="klein leise">Sperren und Ersatz bestellen</span></a>
      <a class="kachel" routerLink="/antraege"><span class="titel">Antrag stellen</span><br /><span class="klein leise">Über 40 Anträge online</span></a>
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
  styles: [`.versichertenkarte{background:linear-gradient(135deg,var(--vp-primaer),#13948c);color:#fff;border:none}.versichertenkarte .nummer{font-size:1.3rem;letter-spacing:.08em;font-weight:700}`],
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
