import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeDe from '@angular/common/locales/de';
import { ApplicationConfig, ErrorHandler, inject, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { mockBackendInterceptor } from './core/backend/mock-backend.interceptor';
import { authInterceptor } from './core/services/auth.interceptor';
import { FehlerProtokollierung } from './core/services/fehler-protokollierung';
import { SitzungService } from './core/services/sitzung.service';

registerLocaleData(localeDe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor, mockBackendInterceptor])),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    { provide: ErrorHandler, useClass: FehlerProtokollierung },
    provideAppInitializer(() => inject(SitzungService).wiederherstellen()),
  ],
};
