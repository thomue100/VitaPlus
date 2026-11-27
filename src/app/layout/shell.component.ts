import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Meldung } from '../core/models';
import { Api, BenachrichtigungService } from '../core/services/api.service';
import { PostfachApi } from '../core/services/service-api.service';
import { SitzungService } from '../core/services/sitzung.service';
import { UiService } from '../core/services/ui.service';
import { UebersetzungPipe } from '../shared/pipes';
import { ChatComponent } from './chat.component';
import { PostausgangComponent } from './postausgang.component';
import { CookieHinweisComponent, statistikErlaubt } from './cookie-hinweis.component';
import { DokumentBetrachterComponent } from '../shared/dokumente/dokument-betrachter.component';
import { SymbolComponent } from '../shared/symbol.component';
import { LogoComponent } from '../shared/logo.component';

interface NavEintrag { route: string; symbol: string; schluessel: string; zaehler?: () => number }
interface NavGruppe { schluessel: string; eintraege: NavEintrag[] }

@Component({
  selector: 'vp-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, UebersetzungPipe, ChatComponent, SymbolComponent, LogoComponent, PostausgangComponent, DokumentBetrachterComponent, CookieHinweisComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  readonly sitzung = inject(SitzungService);
  readonly ui = inject(UiService);
  private api = inject(Api);
  private router = inject(Router);
  private postfach = inject(PostfachApi);
  private benachrichtigung = inject(BenachrichtigungService);

  readonly meldungen = signal<Meldung[]>([]);
  readonly wartung = signal<string | null>(null);
  readonly ausgeblendet = signal<string[]>(JSON.parse(sessionStorage.getItem('vp_meldungen_aus') || '[]'));
  readonly menueOffen = signal(false);
  readonly navOffen = signal(false);
  suchbegriff = '';

  readonly ungelesen = this.postfach.ungelesen;
  readonly benachrichtigungen = this.benachrichtigung.ungelesen;
  readonly restzeit = computed(() => {
    const s = this.sitzung.restSekunden();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  readonly initialen = computed(() => { const b = this.sitzung.benutzer(); return b ? `${b.vorname?.[0] ?? ''}${b.nachname?.[0] ?? ''}`.toUpperCase() : ''; });
  readonly warnen = computed(() => this.sitzung.angemeldet() && this.sitzung.restSekunden() <= 120);
  readonly sichtbareMeldungen = computed(() => this.meldungen().filter(m => !this.ausgeblendet().includes(m.id)));

  readonly versichertenNavigation: NavGruppe[] = [
    { schluessel: 'nav.gruppe.service', eintraege: [
      { route: '/start', symbol: 'house', schluessel: 'nav.start' },
      { route: '/postfach', symbol: 'inbox', schluessel: 'nav.postfach', zaehler: () => this.ungelesen() },
      { route: '/vorgaenge', symbol: 'list-checks', schluessel: 'nav.vorgaenge' },
      { route: '/antraege', symbol: 'file-text', schluessel: 'nav.antraege' },
      { route: '/dokumente', symbol: 'folder-open', schluessel: 'nav.dokumente' },
      { route: '/termine', symbol: 'calendar-clock', schluessel: 'nav.termine' },
    ] },
    { schluessel: 'nav.gruppe.leistungen', eintraege: [
      { route: '/erstattung', symbol: 'receipt-euro', schluessel: 'nav.erstattung' },
      { route: '/krankmeldung', symbol: 'thermometer', schluessel: 'nav.krankmeldung' },
      { route: '/krankengeld', symbol: 'hand-coins', schluessel: 'nav.krankengeld' },
      { route: '/zuzahlungen', symbol: 'wallet', schluessel: 'nav.zuzahlungen' },
      { route: '/pflege', symbol: 'heart-handshake', schluessel: 'nav.pflege' },
      { route: '/leistungen', symbol: 'book-open-text', schluessel: 'nav.leistungen' },
    ] },
    { schluessel: 'nav.gruppe.versicherung', eintraege: [
      { route: '/versicherung', symbol: 'shield-check', schluessel: 'nav.versicherung' },
      { route: '/profil', symbol: 'user-round', schluessel: 'nav.profil' },
      { route: '/familie', symbol: 'users', schluessel: 'nav.familie' },
      { route: '/gesundheitskarte', symbol: 'id-card', schluessel: 'nav.karte' },
      { route: '/beitraege', symbol: 'piggy-bank', schluessel: 'nav.beitraege' },
    ] },
    { schluessel: 'nav.gruppe.gesundheit', eintraege: [
      { route: '/bonus', symbol: 'trophy', schluessel: 'nav.bonus' },
      { route: '/vorsorge', symbol: 'stethoscope', schluessel: 'nav.vorsorge' },
      { route: '/kurse', symbol: 'dumbbell', schluessel: 'nav.kurse' },
      { route: '/epa', symbol: 'folder-heart', schluessel: 'nav.epa' },
      { route: '/digital', symbol: 'smartphone', schluessel: 'nav.digital' },
      { route: '/patientenquittung', symbol: 'scroll-text', schluessel: 'nav.quittung' },
      { route: '/arztsuche', symbol: 'map-pin', schluessel: 'nav.arztsuche' },
    ] },
    { schluessel: 'nav.gruppe.konto', eintraege: [
      { route: '/vollmachten', symbol: 'key-round', schluessel: 'nav.vollmachten' },
      { route: '/datenschutz-center', symbol: 'lock', schluessel: 'nav.datenschutz' },
      { route: '/einstellungen', symbol: 'settings', schluessel: 'nav.einstellungen' },
      { route: '/hilfe', symbol: 'life-buoy', schluessel: 'nav.hilfe' },
      { route: '/kontakt', symbol: 'phone', schluessel: 'nav.kontakt' },
    ] },
  ];

  readonly sbNavigation = [
    { route: '/sachbearbeitung', symbol: 'inbox', text: 'Postkorb' },
    { route: '/sachbearbeitung/versicherte', symbol: 'search', text: 'Versichertensuche' },
  ];

  readonly adminNavigation = [
    { route: '/admin', symbol: 'activity', text: 'Betrieb & Monitoring' },
    { route: '/admin/kennzahlen', symbol: 'gauge', text: 'Service-Kennzahlen' },
    { route: '/admin/mitarbeitende', symbol: 'user-cog', text: 'Mitarbeitende & Rollen' },
    { route: '/admin/inhalte', symbol: 'message-square-text', text: 'Inhalte (FAQ & Meldungen)' },
    { route: '/admin/protokolle', symbol: 'clipboard-list', text: 'Protokolle' },
    { route: '/admin/feedback', symbol: 'star', text: 'Feedback' },
    { route: '/admin/system', symbol: 'server', text: 'System' },
  ];

  constructor() {
    effect(() => {
      const b = this.sitzung.benutzer();
      document.documentElement.dataset['kontrast'] = b?.hoherKontrast ? 'hoch' : 'normal';
      document.documentElement.lang = b?.sprache || 'de';
    });
  }

  private taktStand = '';
  private taktTimer?: ReturnType<typeof setInterval>;

  /** Regelmäßiger Abgleich bei geöffneter Anwendung: neue Bescheide, Rückfragen und Zahlungen sofort sichtbar machen. */
  private async takt() {
    if (this.sitzung.benutzer()?.rolle !== 'VERSICHERTER' || document.hidden) return;
    try {
      const r = await this.api.get<{ ungelesen: number; postfachUngelesen: number; neu: { titel: string; text: string }[]; stand: string }>('/api/takt', { seit: this.taktStand || undefined });
      if (this.taktStand) for (const n of r.neu) this.ui.info(`${n.titel}: ${n.text}`);
      this.taktStand = r.stand || this.taktStand || new Date().toISOString().substring(0, 19);
      this.benachrichtigung.ungelesen.set(r.ungelesen);
      this.postfach.ungelesen.set(r.postfachUngelesen);
    } catch {
      /* Hintergrundabfrage – Fehler ignorieren */
    }
  }

  ngOnInit() {
    this.meldungenLaden();
    this.takt();
    this.taktTimer = setInterval(() => this.takt(), 15000);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.navOffen.set(false);
      this.menueOffen.set(false);
      if (this.sitzung.benutzer()?.rolle === 'VERSICHERTER') {
        this.postfach.zaehlerAktualisieren().catch(() => undefined);
        this.benachrichtigung.aktualisieren();
        if (statistikErlaubt()) this.api.post('/api/analyse', { seite: (e as NavigationEnd).urlAfterRedirects.split('?')[0] }).catch(() => undefined);
      }
      document.getElementById('inhalt')?.focus({ preventScroll: true });
    });
  }

  async meldungenLaden() {
    try {
      const r = await this.api.get<{ meldungen: Meldung[]; wartungsmodus: boolean; wartungstext: string }>('/api/inhalte/meldungen');
      this.meldungen.set(r.meldungen);
      this.wartung.set(r.wartungsmodus ? r.wartungstext : null);
    } catch {
      /* nicht kritisch */
    }
  }

  meldungAusblenden(id: string) {
    this.ausgeblendet.update(l => [...l, id]);
    sessionStorage.setItem('vp_meldungen_aus', JSON.stringify(this.ausgeblendet()));
  }

  suchen() {
    if (this.suchbegriff.trim().length < 2) return;
    this.router.navigate(['/suche'], { queryParams: { q: this.suchbegriff.trim() } });
  }

  async angemeldetBleiben() {
    await this.api.get('/api/auth/ich').catch(() => undefined);
    this.sitzung.aktivitaet();
  }

  abmelden() {
    this.sitzung.abmelden('manuell');
  }

  @HostListener('document:keydown', ['$event'])
  tastatur(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.menueOffen.set(false);
      this.navOffen.set(false);
    }
  }

  @HostListener('document:click')
  @HostListener('document:keydown')
  aktivitaet() {
    if (this.sitzung.angemeldet()) this.sitzung.aktivitaet();
  }
}
