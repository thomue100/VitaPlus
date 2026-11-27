import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { UiService } from '../../core/services/ui.service';
import { SterneComponent } from '../../shared/bausteine';

interface InfoSeite { titel: string; abschnitte: { ueberschrift?: string; text: string[] }[] }

const SEITEN: Record<string, InfoSeite> = {
  datenschutz: { titel: 'Datenschutzhinweise', abschnitte: [
    { text: ['Der Schutz Ihrer Sozialdaten hat für uns höchste Priorität. Wir verarbeiten Ihre Daten ausschließlich auf Grundlage des Sozialgesetzbuchs (insbesondere SGB I, V, X und XI) und der Datenschutz-Grundverordnung.'] },
    { ueberschrift: 'Welche Daten verarbeiten wir?', text: ['Stammdaten (Name, Anschrift, Geburtsdatum, Versichertennummer), Daten zur Mitgliedschaft und zu Beiträgen, Leistungsdaten sowie die Inhalte Ihrer Nachrichten und Anträge.'] },
    { ueberschrift: 'Speicherdauer', text: ['Sozialdaten speichern wir so lange, wie es für die Aufgabenerfüllung erforderlich ist, längstens bis zum Ablauf der gesetzlichen Aufbewahrungsfristen (in der Regel 4 bis 10 Jahre). Nachrichten im Papierkorb werden nach 30 Tagen endgültig gelöscht.'] },
    { ueberschrift: 'Ihre Rechte', text: ['Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Nutzen Sie dafür das Datenschutz-Center in der Online-Geschäftsstelle.'] },
    { ueberschrift: 'Datenschutzbeauftragte', text: ['VitaPlus Krankenkasse, Datenschutzbeauftragte, Friedrichstraße 112, 10117 Berlin, datenschutz@vitaplus.de'] },
    { ueberschrift: 'Cookies und Nutzungsanalyse', text: ['Wir setzen ausschließlich technisch notwendige Speichermechanismen ein. Eine pseudonyme Nutzungsanalyse erfolgt nur mit Ihrer Einwilligung, die Sie in den Einstellungen jederzeit widerrufen können.'] },
  ] },
  impressum: { titel: 'Impressum', abschnitte: [
    { text: ['VitaPlus Krankenkasse', 'Körperschaft des öffentlichen Rechts', 'Friedrichstraße 112, 10117 Berlin', 'Telefon 0800 123 456 0 (kostenfrei)', 'E-Mail service@vitaplus.de'] },
    { ueberschrift: 'Vertreten durch', text: ['Den Vorstand: Dr. Miriam Lange (Vorsitzende), Tobias Hartmann'] },
    { ueberschrift: 'Aufsichtsbehörde', text: ['Bundesamt für Soziale Sicherung, Friedrich-Ebert-Allee 38, 53113 Bonn'] },
    { ueberschrift: 'Hinweis', text: ['Die VitaPlus ist eine fiktive Krankenkasse. Alle Personen, Daten und Beträge in dieser Anwendung sind frei erfunden.'] },
  ] },
  barrierefreiheit: { titel: 'Erklärung zur Barrierefreiheit', abschnitte: [
    { text: ['Die VitaPlus ist bemüht, ihre Online-Geschäftsstelle im Einklang mit der Barrierefreie-Informationstechnik-Verordnung (BITV 2.0) barrierefrei zugänglich zu machen.'] },
    { ueberschrift: 'Stand der Vereinbarkeit', text: ['Die Anwendung ist weitgehend mit der BITV 2.0 vereinbar. Bekannte Einschränkungen: Einige PDF-Dokumente sind noch nicht vollständig barrierefrei. Grafiken in der Beitragsentwicklung verfügen über eine Tabellenalternative.'] },
    { ueberschrift: 'Bedienhilfen', text: ['Schriftgröße und Kontrast können Sie in den Einstellungen anpassen. Alle Funktionen sind per Tastatur erreichbar. Mit „Zum Inhalt springen“ überspringen Sie die Navigation.'] },
    { ueberschrift: 'Feedback und Kontakt', text: ['Sind Ihnen Mängel aufgefallen? Nutzen Sie das folgende Formular. Wir melden uns innerhalb von 6 Wochen.'] },
    { ueberschrift: 'Schlichtungsverfahren', text: ['Bei nicht zufriedenstellenden Antworten können Sie sich an die Schlichtungsstelle nach § 16 BGG beim Beauftragten der Bundesregierung für die Belange von Menschen mit Behinderungen wenden.'] },
  ] },
  sicherheit: { titel: 'Sicher online', abschnitte: [
    { text: ['Wir fragen Sie niemals per E-Mail oder Telefon nach Ihrem Passwort oder einem Sicherheitscode.'] },
    { ueberschrift: 'So schützen Sie Ihren Zugang', text: ['Verwenden Sie ein Passwort, das Sie nirgendwo sonst nutzen. Aktivieren Sie die Zwei-Faktor-Anmeldung. Melden Sie sich nach der Nutzung ab – besonders an fremden Geräten.'] },
    { ueberschrift: 'Verdacht auf Missbrauch?', text: ['Unter „Einstellungen → Sicherheit“ sehen Sie alle aktiven Sitzungen und Geräte. Dort können Sie fremde Sitzungen beenden oder Ihren Zugang sofort sperren.'] },
    { ueberschrift: 'Automatische Abmeldung', text: ['Nach 15 Minuten ohne Aktivität melden wir Sie automatisch ab.'] },
  ] },
  aufsicht: { titel: 'Aufsicht, Schlichtung und Beschwerdemöglichkeiten', abschnitte: [
    { text: ['Sind Sie mit einer Entscheidung oder unserem Service nicht zufrieden, sprechen Sie uns bitte zuerst direkt an – über das Postfach, eine Beschwerde oder telefonisch.'] },
    { ueberschrift: 'Widerspruch', text: ['Gegen Bescheide können Sie innerhalb eines Monats Widerspruch einlegen – direkt online in Ihrem Vorgang.'] },
    { ueberschrift: 'Aufsichtsbehörde', text: ['Bundesamt für Soziale Sicherung, Friedrich-Ebert-Allee 38, 53113 Bonn'] },
    { ueberschrift: 'Datenschutzaufsicht', text: ['Die Bundesbeauftragte für den Datenschutz und die Informationsfreiheit, Graurheindorfer Straße 153, 53117 Bonn'] },
    { ueberschrift: 'Unabhängige Beratung', text: ['Unabhängige Patientenberatung Deutschland, kostenfrei unter 0800 011 77 22'] },
  ] },
  nutzungsbedingungen: { titel: 'Nutzungsbedingungen der Online-Geschäftsstelle', abschnitte: [
    { text: ['Die Nutzung ist für Versicherte der VitaPlus kostenfrei. Sie sind verpflichtet, Ihre Zugangsdaten geheim zu halten und uns einen Missbrauch unverzüglich zu melden.', 'Erklärungen, die Sie über die Online-Geschäftsstelle abgeben, haben dieselbe Wirkung wie schriftliche Erklärungen, soweit gesetzlich nicht die Schriftform vorgeschrieben ist.'] },
  ] },
  neuigkeiten: { titel: 'Was ist neu in der Online-Geschäftsstelle?', abschnitte: [
    { ueberschrift: 'Version 4.12 – November 2026', text: ['Widerspruch direkt aus dem Vorgang einlegen', 'Neuer Leistungsfinder nach Lebenslagen', 'Geräteverwaltung und Sicherheitsprotokoll'] },
    { ueberschrift: 'Version 4.11 – September 2026', text: ['Pflegebereich mit Budgetübersicht', 'Patientenquittung nach § 305 SGB V online abrufbar'] },
    { ueberschrift: 'Version 4.10 – Juni 2026', text: ['Vollmachten online erteilen und widerrufen', 'Englische Oberfläche (Beta)'] },
  ] },
};

@Component({
  selector: 'vp-info',
  imports: [RouterLink, FormsModule, SterneComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (inhalt(); as i) {
      <article class="karte" style="max-width:860px">
        <h1>{{ i.titel }}</h1>
        @for (a of i.abschnitte; track $index) {
          @if (a.ueberschrift) { <h2>{{ a.ueberschrift }}</h2> }
          @if (a.text.length > 1 && seite() === 'neuigkeiten') { <ul>@for (t of a.text; track t) { <li>{{ t }}</li> }</ul> }
          @else { @for (t of a.text; track t) { <p>{{ t }}</p> } }
        }
        @if (seite() === 'barrierefreiheit') {
          <h2>Barriere melden</h2>
          @if (gesendet()) { <div class="hinweis erfolg" role="status">Ihre Meldung ist eingegangen. Wir prüfen die Barriere und melden uns, falls wir Rückfragen haben.</div> }
          @else {
            <form (ngSubmit)="barriereMelden()">
              <div class="feld mb"><label for="barriere" class="pflicht">Beschreibung der Barriere</label>
                <textarea id="barriere" name="text" [(ngModel)]="text" maxlength="1000"></textarea></div>
              <div class="feld mb"><span class="label">Wie zufrieden sind Sie insgesamt mit der Zugänglichkeit?</span><vp-sterne [(wert)]="bewertung" /></div>
              <button class="btn primaer" type="submit">Barriere melden</button>
            </form>
          }
        }
      </article>
    } @else {
      <div class="karte"><h1>Seite nicht gefunden</h1><a routerLink="/">Zur Startseite</a></div>
    }`,
})
export class InfoComponent {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly seite = input.required<string>();
  readonly inhalt = computed(() => SEITEN[this.seite()]);
  readonly gesendet = signal(false);
  text = '';
  bewertung = signal(3);

  async barriereMelden() {
    try {
      await this.api.post('/api/feedback', { art: 'BARRIERE', text: this.text, bewertung: this.bewertung(), seite: document.referrer || '/info/barrierefreiheit' });
      this.gesendet.set(true);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
