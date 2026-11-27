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

interface NavEintrag { route: string; schluessel: string; zaehler?: () => number }
interface NavGruppe { schluessel: string; eintraege: NavEintrag[] }

@Component({
  selector: 'vp-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, UebersetzungPipe, ChatComponent],
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
  readonly warnen = computed(() => this.sitzung.angemeldet() && this.sitzung.restSekunden() <= 120);
  readonly sichtbareMeldungen = computed(() => this.meldungen().filter(m => !this.ausgeblendet().includes(m.id)));

  readonly versichertenNavigation: NavGruppe[] = [
    { schluessel: 'nav.gruppe.service', eintraege: [
      { route: '/start', schluessel: 'nav.start' },
      { route: '/postfach', schluessel: 'nav.postfach', zaehler: () => this.ungelesen() },
      { route: '/vorgaenge', schluessel: 'nav.vorgaenge' },
      { route: '/antraege', schluessel: 'nav.antraege' },
      { route: '/dokumente', schluessel: 'nav.dokumente' },
      { route: '/termine', schluessel: 'nav.termine' },
    ] },
    { schluessel: 'nav.gruppe.leistungen', eintraege: [
      { route: '/erstattung', schluessel: 'nav.erstattung' },
      { route: '/krankmeldung', schluessel: 'nav.krankmeldung' },
      { route: '/krankengeld', schluessel: 'nav.krankengeld' },
      { route: '/zuzahlungen', schluessel: 'nav.zuzahlungen' },
      { route: '/pflege', schluessel: 'nav.pflege' },
      { route: '/leistungen', schluessel: 'nav.leistungen' },
    ] },
    { schluessel: 'nav.gruppe.versicherung', eintraege: [
      { route: '/versicherung', schluessel: 'nav.versicherung' },
      { route: '/profil', schluessel: 'nav.profil' },
      { route: '/familie', schluessel: 'nav.familie' },
      { route: '/gesundheitskarte', schluessel: 'nav.karte' },
      { route: '/beitraege', schluessel: 'nav.beitraege' },
    ] },
    { schluessel: 'nav.gruppe.gesundheit', eintraege: [
      { route: '/bonus', schluessel: 'nav.bonus' },
      { route: '/vorsorge', schluessel: 'nav.vorsorge' },
      { route: '/kurse', schluessel: 'nav.kurse' },
      { route: '/epa', schluessel: 'nav.epa' },
      { route: '/digital', schluessel: 'nav.digital' },
      { route: '/patientenquittung', schluessel: 'nav.quittung' },
      { route: '/arztsuche', schluessel: 'nav.arztsuche' },
    ] },
    { schluessel: 'nav.gruppe.konto', eintraege: [
      { route: '/vollmachten', schluessel: 'nav.vollmachten' },
      { route: '/datenschutz-center', schluessel: 'nav.datenschutz' },
      { route: '/einstellungen', schluessel: 'nav.einstellungen' },
      { route: '/hilfe', schluessel: 'nav.hilfe' },
      { route: '/kontakt', schluessel: 'nav.kontakt' },
    ] },
  ];

  readonly sbNavigation = [
    { route: '/sachbearbeitung', text: 'Postkorb' },
    { route: '/sachbearbeitung/versicherte', text: 'Versichertensuche' },
  ];

  readonly adminNavigation = [
    { route: '/admin', text: 'Betrieb & Monitoring' },
    { route: '/admin/kennzahlen', text: 'Service-Kennzahlen' },
    { route: '/admin/mitarbeitende', text: 'Mitarbeitende & Rollen' },
    { route: '/admin/inhalte', text: 'Inhalte (FAQ & Meldungen)' },
    { route: '/admin/protokolle', text: 'Protokolle' },
    { route: '/admin/feedback', text: 'Feedback' },
    { route: '/admin/system', text: 'System' },
  ];

  constructor() {
    effect(() => {
      const b = this.sitzung.benutzer();
      document.documentElement.dataset['kontrast'] = b?.hoherKontrast ? 'hoch' : 'normal';
      document.documentElement.lang = b?.sprache || 'de';
    });
  }

  ngOnInit() {
    this.meldungenLaden();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.navOffen.set(false);
      this.menueOffen.set(false);
      if (this.sitzung.benutzer()?.rolle === 'VERSICHERTER') {
        this.postfach.zaehlerAktualisieren().catch(() => undefined);
        this.benachrichtigung.aktualisieren();
        this.api.post('/api/analyse', { seite: (e as NavigationEnd).urlAfterRedirects.split('?')[0] }).catch(() => undefined);
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
