import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/services/api.service';
import { fehlertext } from '../../core/services/auth.interceptor';
import { SitzungService } from '../../core/services/sitzung.service';
import { UiService } from '../../core/services/ui.service';
import { SterneComponent } from '../../shared/bausteine';
import { SymbolComponent } from '../../shared/symbol.component';

@Component({
  selector: 'vp-kontakt',
  imports: [RouterLink, FormsModule, SterneComponent, SymbolComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="seitenkopf"><div><h1>Kontakt</h1><p class="leise">Wir sind für Sie da – auf dem Weg, der Ihnen am liebsten ist.</p></div></div>
    @if (k(); as k) {
      <div class="raster-3">
        <div class="karte"><h2 class="mit-symbol"><vp-symbol name="phone" [groesse]="22" /> Telefon</h2><p class="kennzahl">{{ k.telefon.nummer }}</p>
          <p>{{ k.telefon.zeiten }} – kostenfrei</p>
          <span class="badge" [class.gruen]="k.telefon.offen" [class.rot]="!k.telefon.offen">{{ k.telefon.offen ? 'Jetzt erreichbar' : 'Derzeit geschlossen' }}</span>
          <p class="mt klein">Aus dem Ausland: {{ k.ausland }}</p>
          <p class="klein"><strong>{{ k.notfall.text }}:</strong> {{ k.notfall.nummer }}</p></div>
        <div class="karte"><h2 class="mit-symbol"><vp-symbol name="mail" [groesse]="22" /> Nachricht</h2><p>Schreiben Sie uns sicher über Ihr Postfach – mit Anhängen und Eingangsbestätigung.</p>
          <a class="btn primaer" [routerLink]="sitzung.angemeldet() ? '/postfach/neu' : '/anmelden'">Nachricht schreiben</a>
          <p class="mt klein">Chat: {{ k.chat.zeiten }} <span class="badge" [class.gruen]="k.chat.offen">{{ k.chat.offen ? 'online' : 'offline' }}</span></p></div>
        <div class="karte"><h2 class="mit-symbol"><vp-symbol name="calendar-check" [groesse]="22" /> Persönlich</h2><p>Beratung in der Filiale, am Telefon oder per Video – zu Ihrem Wunschtermin.</p>
          <div class="aktionen"><a class="btn" [routerLink]="sitzung.angemeldet() ? '/termine' : '/anmelden'">Termin buchen</a>
            <a class="btn" [routerLink]="sitzung.angemeldet() ? '/antraege/neu/RUECKRUF' : '/anmelden'">Rückruf anfordern</a></div></div>
      </div>
      @if (k.ansprechpartner; as a) {
        <div class="karte hervor"><h2>Ihr persönlicher Ansprechpartner</h2>
          <p><strong>{{ a.name }}</strong>, Team {{ a.team }}<br />Telefon {{ a.telefon }}, {{ a.email }}</p></div>
      }
      <div class="raster-2">
        <div class="karte"><h2>Beschwerde</h2><p>Etwas ist nicht gut gelaufen? Sagen Sie es uns – wir kümmern uns innerhalb von 2 Werktagen.</p>
          <a class="btn" [routerLink]="sitzung.angemeldet() ? '/antraege/neu/BESCHWERDE' : '/anmelden'">Beschwerde einreichen</a></div>
        <div class="karte"><h2>Wie zufrieden sind Sie mit unserem Service?</h2>
          @if (feedbackGesendet()) { <div class="hinweis erfolg">Vielen Dank für Ihr Feedback!</div> }
          @else {
            <vp-sterne label="Zufriedenheit" [(wert)]="sterne" />
            <div class="feld mt"><label for="fb-text">Möchten Sie uns etwas mitteilen? (optional)</label><textarea id="fb-text" [(ngModel)]="feedbackText" maxlength="1000"></textarea></div>
            <button class="btn mt" type="button" (click)="feedback()" [disabled]="!sterne()">Feedback senden</button>
          }
        </div>
      </div>
      <div class="karte"><h2>Aufsicht und unabhängige Stellen</h2>
        <ul class="liste-ohne">@for (s of k.aufsicht; track s.name) { <li><strong>{{ s.name }}</strong><br /><span class="klein">{{ s.aufgabe }} – {{ s.adresse }}</span></li> }</ul></div>
    } @else { <p class="lade">Wird geladen …</p> }`,
})
export class KontaktComponent implements OnInit {
  private api = inject(Api);
  private ui = inject(UiService);
  readonly sitzung = inject(SitzungService);
  readonly k = signal<any>(null);
  readonly sterne = signal(0);
  readonly feedbackGesendet = signal(false);
  feedbackText = '';

  async ngOnInit() {
    this.k.set(await this.api.get('/api/kontakt'));
  }

  async feedback() {
    try {
      await this.api.post('/api/feedback', { bewertung: this.sterne(), text: this.feedbackText, seite: '/kontakt', art: 'SERVICE' });
      this.feedbackGesendet.set(true);
    } catch (e) {
      this.ui.fehler(fehlertext(e));
    }
  }
}
