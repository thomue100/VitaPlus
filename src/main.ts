import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { inject as besucherstatistik } from '@vercel/analytics';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { laufzeitLaden } from './app/core/laufzeit';

// Besucherstatistik (Vercel Web Analytics) nur im Produktions-Build
if (!isDevMode()) {
  besucherstatistik({ mode: 'production' });
}

// Erst die Laufzeitkonfiguration (Simulation oder echtes Backend) laden, dann starten
laufzeitLaden()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
