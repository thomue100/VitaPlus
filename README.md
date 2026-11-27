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

Anmeldung mit GesundheitsID/Online-Ausweis (simuliert): Versichertennummer und eine beliebige 6-stellige PIN.

Für die Registrierung vorgesehene Mitgliedschaften (noch ohne Online-Zugang):

| Versichertennummer | Geburtsdatum |
|---|---|
| E111222333 | 12.04.1995 |
| F444555666 | 30.09.2001 |
| G777888999 | 01.12.1988 |

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
