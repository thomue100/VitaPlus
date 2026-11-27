import { Routes } from '@angular/router';
import { adminGuard, angemeldetGuard, gastGuard, sachbearbeitungGuard, ungespeichertGuard, versicherterGuard, zweiFaktorGuard } from './core/services/guards';


export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'anmelden' },

  // Öffentlicher Bereich
  { path: 'anmelden', canActivate: [gastGuard], title: 'Anmelden – VitaPlus', loadComponent: () => import('./pages/oeffentlich/anmelden.component').then(m => m.AnmeldenComponent) },
  { path: 'anmelden/code', canActivate: [zweiFaktorGuard], title: 'Sicherheitscode – VitaPlus', loadComponent: () => import('./pages/oeffentlich/zwei-faktor.component').then(m => m.ZweiFaktorComponent) },
  { path: 'anmelden/identitaet', canActivate: [gastGuard], title: 'Identifizierung – VitaPlus', loadComponent: () => import('./pages/oeffentlich/identitaet.component').then(m => m.IdentitaetComponent) },
  { path: 'registrieren', canActivate: [gastGuard], title: 'Registrieren – VitaPlus', loadComponent: () => import('./pages/oeffentlich/registrieren.component').then(m => m.RegistrierenComponent) },
  { path: 'aktivieren', title: 'Zugang aktivieren – VitaPlus', loadComponent: () => import('./pages/oeffentlich/passwort-seiten').then(m => m.AktivierenComponent) },
  { path: 'passwort-vergessen', title: 'Passwort vergessen – VitaPlus', loadComponent: () => import('./pages/oeffentlich/passwort-seiten').then(m => m.PasswortVergessenComponent) },
  { path: 'passwort-neu', title: 'Neues Passwort – VitaPlus', loadComponent: () => import('./pages/oeffentlich/passwort-seiten').then(m => m.PasswortNeuComponent) },
  { path: 'mitglied-werden', title: 'Mitglied werden – VitaPlus', data: { code: 'MITGLIEDSANTRAG' }, loadComponent: () => import('./pages/oeffentlich/oeffentliches-formular.component').then(m => m.OeffentlichesFormularComponent) },
  { path: 'todesfall-melden', title: 'Todesfall melden – VitaPlus', data: { code: 'TODESFALL' }, loadComponent: () => import('./pages/oeffentlich/oeffentliches-formular.component').then(m => m.OeffentlichesFormularComponent) },
  { path: 'info/:seite', loadComponent: () => import('./pages/oeffentlich/info.component').then(m => m.InfoComponent) },
  { path: 'hilfe', title: 'Hilfe & FAQ – VitaPlus', loadComponent: () => import('./pages/oeffentlich/hilfe.component').then(m => m.HilfeComponent) },
  { path: 'hilfe/glossar', title: 'Glossar – VitaPlus', data: { glossar: true }, loadComponent: () => import('./pages/oeffentlich/hilfe.component').then(m => m.HilfeComponent) },
  { path: 'leistungen', title: 'Leistungen A–Z – VitaPlus', loadComponent: () => import('./pages/oeffentlich/leistungen.component').then(m => m.LeistungenComponent) },
  { path: 'leistungen/finder', title: 'Leistungsfinder – VitaPlus', loadComponent: () => import('./pages/oeffentlich/leistungen.component').then(m => m.LeistungsfinderComponent) },
  { path: 'leistungen/:code', loadComponent: () => import('./pages/oeffentlich/leistungen.component').then(m => m.LeistungDetailComponent) },
  { path: 'rechner/:art', title: 'Rechner – VitaPlus', loadComponent: () => import('./pages/oeffentlich/rechner.component').then(m => m.RechnerComponent) },
  { path: 'kontakt', title: 'Kontakt – VitaPlus', loadComponent: () => import('./pages/oeffentlich/kontakt.component').then(m => m.KontaktComponent) },
  { path: 'kurse', title: 'Gesundheitskurse – VitaPlus', loadComponent: () => import('./pages/oeffentlich/kurse.component').then(m => m.KurseComponent) },
  { path: 'arztsuche', title: 'Arztsuche – VitaPlus', loadComponent: () => import('./pages/oeffentlich/arztsuche.component').then(m => m.ArztsucheComponent) },
  { path: 'suche', title: 'Suche – VitaPlus', loadComponent: () => import('./pages/oeffentlich/suche.component').then(m => m.SucheComponent) },

  // Versicherte
  {
    path: '', canActivate: [angemeldetGuard, versicherterGuard], children: [
      { path: 'start', title: 'Übersicht – VitaPlus', loadComponent: () => import('./pages/versicherte/start.component').then(m => m.StartComponent) },
      { path: 'profil', title: 'Persönliche Daten – VitaPlus', loadComponent: () => import('./pages/versicherte/profil.component').then(m => m.ProfilComponent) },
      { path: 'versicherung', title: 'Meine Versicherung – VitaPlus', loadComponent: () => import('./pages/versicherte/versicherung.component').then(m => m.VersicherungComponent) },
      { path: 'familie', title: 'Familie – VitaPlus', loadComponent: () => import('./pages/versicherte/familie.component').then(m => m.FamilieComponent) },
      { path: 'gesundheitskarte', title: 'Gesundheitskarte – VitaPlus', loadComponent: () => import('./pages/versicherte/gesundheitskarte.component').then(m => m.GesundheitskarteComponent) },
      { path: 'antraege', title: 'Anträge – VitaPlus', loadComponent: () => import('./pages/versicherte/antraege.component').then(m => m.AntraegeComponent) },
      { path: 'antraege/neu/:code', canDeactivate: [ungespeichertGuard], loadComponent: () => import('./pages/versicherte/antrag.component').then(m => m.AntragComponent) },
      { path: 'antraege/entwurf/:id', canDeactivate: [ungespeichertGuard], loadComponent: () => import('./pages/versicherte/antrag.component').then(m => m.AntragComponent) },
      { path: 'erstattung', title: 'Kostenerstattung – VitaPlus', canDeactivate: [ungespeichertGuard], loadComponent: () => import('./pages/versicherte/erstattung.component').then(m => m.ErstattungComponent) },
      { path: 'krankmeldung', title: 'Krankmeldung – VitaPlus', loadComponent: () => import('./pages/versicherte/krankmeldung.component').then(m => m.KrankmeldungComponent) },
      { path: 'krankengeld', title: 'Krankengeld – VitaPlus', loadComponent: () => import('./pages/versicherte/geld-seiten').then(m => m.KrankengeldComponent) },
      { path: 'zuzahlungen', title: 'Zuzahlungen – VitaPlus', loadComponent: () => import('./pages/versicherte/geld-seiten').then(m => m.ZuzahlungenComponent) },
      { path: 'beitraege', title: 'Beiträge – VitaPlus', loadComponent: () => import('./pages/versicherte/geld-seiten').then(m => m.BeitraegeComponent) },
      { path: 'bonus', title: 'Bonusprogramm – VitaPlus', loadComponent: () => import('./pages/versicherte/bonus.component').then(m => m.BonusComponent) },
      { path: 'vorsorge', title: 'Vorsorge & Ziele – VitaPlus', loadComponent: () => import('./pages/versicherte/gesundheit-seiten').then(m => m.VorsorgeComponent) },
      { path: 'epa', title: 'Elektronische Patientenakte – VitaPlus', loadComponent: () => import('./pages/versicherte/gesundheit-seiten').then(m => m.EpaComponent) },
      { path: 'digital', title: 'Digitale Gesundheit – VitaPlus', loadComponent: () => import('./pages/versicherte/gesundheit-seiten').then(m => m.DigitalComponent) },
      { path: 'patientenquittung', title: 'Patientenquittung – VitaPlus', loadComponent: () => import('./pages/versicherte/gesundheit-seiten').then(m => m.PatientenquittungComponent) },
      { path: 'pflege', title: 'Pflege – VitaPlus', loadComponent: () => import('./pages/versicherte/pflege.component').then(m => m.PflegeComponent) },
      { path: 'postfach', title: 'Postfach – VitaPlus', loadComponent: () => import('./pages/versicherte/postfach-seiten').then(m => m.PostfachComponent) },
      { path: 'postfach/neu', title: 'Neue Nachricht – VitaPlus', canDeactivate: [ungespeichertGuard], loadComponent: () => import('./pages/versicherte/postfach-seiten').then(m => m.NachrichtSchreibenComponent) },
      { path: 'postfach/:id', title: 'Nachricht – VitaPlus', loadComponent: () => import('./pages/versicherte/postfach-seiten').then(m => m.NachrichtComponent) },
      { path: 'dokumente', title: 'Dokumente – VitaPlus', loadComponent: () => import('./pages/versicherte/dokumente.component').then(m => m.DokumenteComponent) },
      { path: 'vorgaenge', title: 'Meine Vorgänge – VitaPlus', loadComponent: () => import('./pages/versicherte/vorgang-seiten').then(m => m.VorgaengeComponent) },
      { path: 'vorgaenge/:id', title: 'Vorgang – VitaPlus', loadComponent: () => import('./pages/versicherte/vorgang-seiten').then(m => m.VorgangComponent) },
      { path: 'termine', title: 'Termine & Rückruf – VitaPlus', loadComponent: () => import('./pages/versicherte/termine.component').then(m => m.TermineComponent) },
      { path: 'vollmachten', title: 'Vollmachten – VitaPlus', loadComponent: () => import('./pages/versicherte/konto-seiten').then(m => m.VollmachtenComponent) },
      { path: 'vertretung', title: 'Vertretung – VitaPlus', loadComponent: () => import('./pages/versicherte/konto-seiten').then(m => m.VertretungComponent) },
      { path: 'datenschutz-center', title: 'Datenschutz-Center – VitaPlus', loadComponent: () => import('./pages/versicherte/konto-seiten').then(m => m.DatenschutzCenterComponent) },
      { path: 'benachrichtigungen', title: 'Benachrichtigungen – VitaPlus', loadComponent: () => import('./pages/versicherte/konto-seiten').then(m => m.BenachrichtigungenComponent) },
    ],
  },
  { path: 'einstellungen', canActivate: [angemeldetGuard], title: 'Einstellungen – VitaPlus', loadComponent: () => import('./pages/versicherte/einstellungen.component').then(m => m.EinstellungenComponent) },
  { path: 'einstellungen/:bereich', canActivate: [angemeldetGuard], title: 'Einstellungen – VitaPlus', loadComponent: () => import('./pages/versicherte/einstellungen.component').then(m => m.EinstellungenComponent) },

  // Sachbearbeitung
  {
    path: 'sachbearbeitung', canActivate: [angemeldetGuard, sachbearbeitungGuard], children: [
      { path: '', title: 'Postkorb – VitaPlus', loadComponent: () => import('./pages/sachbearbeitung/sb-seiten').then(m => m.SbEingangComponent) },
      { path: 'vorgang/:id', title: 'Vorgang bearbeiten – VitaPlus', loadComponent: () => import('./pages/sachbearbeitung/sb-seiten').then(m => m.SbVorgangComponent) },
      { path: 'versicherte', title: 'Versichertensuche – VitaPlus', loadComponent: () => import('./pages/sachbearbeitung/sb-seiten').then(m => m.SbVersicherteComponent) },
    ],
  },

  // Administration
  {
    path: 'admin', canActivate: [angemeldetGuard, adminGuard], children: [
      { path: '', title: 'Betrieb – VitaPlus', loadComponent: () => import('./pages/admin/admin-seiten').then(m => m.AdminMonitoringComponent) },
      { path: 'kennzahlen', title: 'Kennzahlen – VitaPlus', loadComponent: () => import('./pages/admin/admin-seiten').then(m => m.AdminKennzahlenComponent) },
      { path: 'mitarbeitende', title: 'Mitarbeitende – VitaPlus', loadComponent: () => import('./pages/admin/admin-seiten').then(m => m.AdminMitarbeitendeComponent) },
      { path: 'inhalte', title: 'Inhalte – VitaPlus', loadComponent: () => import('./pages/admin/admin-seiten').then(m => m.AdminInhalteComponent) },
      { path: 'protokolle', title: 'Protokolle – VitaPlus', loadComponent: () => import('./pages/admin/admin-seiten').then(m => m.AdminProtokolleComponent) },
      { path: 'feedback', title: 'Feedback – VitaPlus', loadComponent: () => import('./pages/admin/admin-seiten').then(m => m.AdminFeedbackComponent) },
      { path: 'system', title: 'System – VitaPlus', loadComponent: () => import('./pages/admin/admin-seiten').then(m => m.AdminSystemComponent) },
    ],
  },

  { path: '**', title: 'Seite nicht gefunden – VitaPlus', loadComponent: () => import('./pages/oeffentlich/nicht-gefunden.component').then(m => m.NichtGefundenComponent) },
];

