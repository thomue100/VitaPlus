import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { SitzungService } from './sitzung.service';

export const angemeldetGuard: CanActivateFn = (_r, state) => {
  const s = inject(SitzungService);
  if (s.angemeldet()) return true;
  return inject(Router).createUrlTree(['/anmelden'], { queryParams: { ziel: state.url } });
};

export const versicherterGuard: CanActivateFn = () => {
  const s = inject(SitzungService);
  if (s.benutzer()?.rolle === 'VERSICHERTER') return true;
  return inject(Router).createUrlTree([s.startseite()]);
};

export const adminGuard: CanActivateFn = () => {
  const s = inject(SitzungService);
  if (s.benutzer()?.rolle === 'ADMIN') return true;
  return inject(Router).createUrlTree([s.startseite()]);
};

export const sachbearbeitungGuard: CanActivateFn = () => {
  const s = inject(SitzungService);
  if (s.istSachbearbeitung()) return true;
  return inject(Router).createUrlTree([s.startseite()]);
};

export const gastGuard: CanActivateFn = () => {
  const s = inject(SitzungService);
  if (!s.angemeldet()) return true;
  return inject(Router).createUrlTree([s.startseite()]);
};

export const zweiFaktorGuard: CanActivateFn = () => {
  const s = inject(SitzungService);
  return s.wartetAufZweiFaktor ? true : inject(Router).createUrlTree(['/anmelden']);
};

export interface HatUngespeicherteAenderungen {
  ungespeichert(): boolean;
}

export const ungespeichertGuard: CanDeactivateFn<HatUngespeicherteAenderungen> = c =>
  !c.ungespeichert() || confirm('Sie haben ungespeicherte Änderungen. Möchten Sie die Seite wirklich verlassen?');
