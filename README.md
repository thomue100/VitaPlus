# VitaPlus – Online-Geschäftsstelle

Web-Frontend der Online-Geschäftsstelle der (fiktiven) VitaPlus Krankenkasse für Versicherte, Sachbearbeitung und Administration.

## Voraussetzungen

- Node.js 22 (LTS) oder neuer
- npm 10

## Start

```bash
npm install
npm start
```

Danach unter http://localhost:4200 öffnen.

Produktions-Build: `npm run build` (Ausgabe unter `dist/`).

## Backend

Die Anwendung bringt ein simuliertes Backend mit (`src/app/core/backend`). Alle Aufrufe an `/api/**` werden von
einem HTTP-Interceptor lokal beantwortet. Die Daten liegen im `localStorage` des Browsers (Schlüssel `vp_db`,
Sitzungen in `vp_sessions`). Zum Zurücksetzen auf den Auslieferungszustand diese Einträge in den Entwicklertools
löschen und die Seite neu laden.

- **Formular-Service:** Online-Anträge werden als JSON Schema und UI Schema ausgeliefert
  (`GET /api/formulare/{code}/definition`) und im Frontend mit [JSON Forms](https://jsonforms.io) und einem eigenen
  Renderer-Set (`src/app/shared/json-forms`) dargestellt. Jeder Schritt wird zusätzlich serverseitig vorgeprüft
  (`POST /api/formulare/{code}/pruefung`).
- **Weiterverarbeitung:** Eingegangene Anliegen durchlaufen eine Hintergrundverarbeitung (`core/backend/verarbeitung.ts`,
  Steuerung über `VERARBEITUNG` in `core/konfiguration.ts`).
- **Versand:** E-Mails, SMS und Briefe der Kasse landen in der Demo im Postausgang, erreichbar über den Knopf „Demo: E-Mail, SMS & Testdaten“ unten rechts
  rechts unten in der Anwendung.

## Demo-Zugänge

| Rolle | Kennung | Passwort | SMS-Code (2FA) |
|---|---|---|---|
| Versicherte | anna.schmidt@example.de | VitaPlus2026! | – |
| Versicherter | max.mustermann@example.de | Sicher#2026 | 246810 |
| Versicherte | erika.weber@example.de | Erika!Weber1 | – |
| Versicherter | jonas.klein@example.de | Jonas#Klein9 | – |
| Versicherter | paul.weber@example.de | Paul#Weber90 | – |
| Sachbearbeitung | sabine.mueller@vitaplus.de | Sachbearbeitung1! | 135790 |
| Sachbearbeitung | nicole.hartmann@vitaplus.de | Mitgliedschaft1! | 246802 |
| Sachbearbeitung | oemer.arslan@vitaplus.de | Pflegekasse1! | 135791 |
| Teamleitung | kai.brandt@vitaplus.de | Teamleitung1! | 864200 |
| Administration | admin@vitaplus.de | Administration1! | 102938 |

Die Zugänge können auf der Anmeldeseite unter „Testzugänge für die Demo“ per Klick übernommen werden.
SMS-Codes stehen zusätzlich im Demo-Postausgang.

Anmeldung mit GesundheitsID/Online-Ausweis (simuliert): Versichertennummer und eine beliebige 6-stellige PIN.

Eigenes Konto: Über „Mitglied werden“ einen Antrag stellen. Nach der Annahme kommt die Mitgliedsbestätigung mit
Versichertennummer per E-Mail (Demo-Postausgang); der Link darin führt zur Registrierung.

Für die Registrierung vorgesehene Mitgliedschaften (noch ohne Online-Zugang):

| Versichertennummer | Geburtsdatum |
|---|---|
| E111222333 | 12.04.1995 |
| F444555666 | 30.09.2001 |
| G777888999 | 01.12.1988 |

## Demo-Umgebung

Der Knopf „Demo: E-Mail, SMS & Testdaten“ öffnet zwei Reiter:

- **E-Mail & SMS:** alles, was die Kasse verschickt (Sicherheitscodes, Bestätigungen, Briefe, Benachrichtigungen)
- **Testdaten:** eine Stunde vorspulen (Hintergrundverarbeitung, Zahlläufe und Antworten des Service-Teams laufen sofort weiter),
  Beispielfälle für das angemeldete Konto anlegen (offene Rückfrage, Ablehnung, Teilerstattung), eine Störung simulieren
  (Antragsannahme antwortet mit HTTP 503) und alle Daten auf den Ausgangszustand zurücksetzen

Hochgeladene Dateien werden im Browser (IndexedDB) gespeichert und lassen sich im Dokumentbetrachter öffnen.
Angefangene Formulare werden sieben Tage lang lokal zwischengespeichert.

## Backend-Anbindung

Das Frontend spricht ausschließlich über HTTP mit `/api/**`. Welches Backend antwortet, steht in
`public/konfiguration.json` und wird beim Start geladen – ein neuer Build ist dafür nicht nötig:

```json
{
  "backend": { "modus": "simulation", "basisUrl": "", "echteRouten": [] },
  "demo": true
}
```

| Modus | Verhalten |
| --- | --- |
| `simulation` | Alle Aufrufe beantwortet das eingebaute Simulations-Backend im Browser (Standard). |
| `mischbetrieb` | Aufrufe, die auf ein Muster in `echteRouten` passen, gehen an `basisUrl`, alle anderen an die Simulation. Muster: `"/api/auth/**"`, `"GET /api/vorgaenge/*"` (`*` = ein Pfadabschnitt, `**` = beliebig viele). |
| `echt` | Alle Aufrufe gehen an `basisUrl`. |

- `basisUrl` leer lassen, wenn das Backend unter demselben Ursprung erreichbar ist (z. B. per Rewrite in `vercel.json`); sonst muss das Backend CORS für den `Authorization`-Header erlauben.
- `demo` blendet Postausgang, Testzugänge und Testdaten-Werkzeuge ein oder aus (Standard: an in der Simulation, sonst aus).
- Im Mischbetrieb übernimmt die Simulation die Sitzungen, die das echte Backend bei der Anmeldung ausstellt. Voraussetzung sind dieselben Benutzer-IDs wie in den Testdaten. Daten eines Bereichs sollten vollständig in einem der beiden Backends liegen – am besten Bereich für Bereich umstellen.

**Vertrag:** `npm run api:vertrag` erzeugt aus den Routen und Typen des Simulations-Backends

- `docs/api/openapi.json` – OpenAPI 3.1 mit allen Endpunkten, Anmeldung, Rollen, Antwortschemas und Fehlercodes
- `docs/api/formularkatalog.json` – alle Formulare mit Feldern, Regeln und Optionen, damit ein anderes Backend dieselben Formulare ausliefert und prüft

**Konventionen:**

- Anmeldung per `Authorization: Bearer <token>`; Sitzungen laufen nach 15 Minuten ohne Aktivität ab.
- Fehler kommen als `application/problem+json` nach RFC 9457 (`type`, `title`, `status`, `detail`) mit den Erweiterungen `code`, `feld` und `details`. Angezeigt wird `detail`.
- Dateien werden einzeln per `POST /api/dateien` (multipart, Feld `datei`) hochgeladen; Anträge und Nachrichten verweisen nur auf die zurückgegebenen Anhänge. Inhalte liefert `GET /api/dateien/{id}/inhalt`.

## Projektstruktur

```
src/app
├── core
│   ├── backend      simuliertes Backend (Routen, Handler, Startdaten)
│   ├── formulare    Formularkatalog und Prüfungen der Online-Anträge
│   ├── inhalte      Leistungskatalog
│   ├── services     API-Zugriff, Sitzung, Guards, Interceptor
│   └── util         Datum, Berechnungen, Prüfroutinen
├── layout           Rahmen, Navigation, Chat
├── shared           wiederverwendbare Bausteine, Pipes, PDF-Erzeugung
└── pages            Seiten (öffentlich, Versicherte, Sachbearbeitung, Administration)
```

Alle Personen, Daten, Beträge und Rechengrößen sind frei erfunden bzw. vereinfacht und haben keine Rechtsverbindlichkeit.

## Bereitstellung auf Vercel

Die Datei `vercel.json` enthält Build-Befehl, Ausgabeverzeichnis (`dist/vitaplus-geschaeftsstelle/browser`) und die Weiterleitung aller App-Routen auf `index.html`.

1. In Vercel „Add New → Project“ wählen und dieses Repository importieren.
2. Im Projekt unter „Analytics“ die Web Analytics aktivieren.
3. Neu deployen – die Besucherstatistik wird im Produktions-Build über `@vercel/analytics` eingebunden (`src/main.ts`), lokal mit `npm start` wird nichts gezählt.

## Bildnachweis

- Illustrationen (`public/bilder/`), Logo und Kartendarstellung: eigene Gestaltung für dieses Projekt.
- Symbole: [Lucide](https://lucide.dev), ISC-Lizenz (Pfade eingebettet in `src/app/shared/symbole.ts`).
- Schrift: Source Sans 3 (SIL Open Font License) über `@fontsource-variable/source-sans-3`.
