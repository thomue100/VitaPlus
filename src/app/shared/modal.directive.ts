import { AfterViewInit, Directive, ElementRef, inject, OnDestroy, output } from '@angular/core';

/**
 * Öffnet ein natives <dialog> modal: Der Browser hält den Fokus im Dialog und macht den Rest der Seite inaktiv.
 * Beim Schließen kehrt der Fokus dorthin zurück, wo er vorher war. Escape löst `vpAbbrechen` aus;
 * ob der Dialog dann schließt, entscheidet die Seite.
 */
@Directive({
  selector: 'dialog[vpModal]',
  host: { '(cancel)': 'abbrechen($event)' },
})
export class ModalDirective implements AfterViewInit, OnDestroy {
  readonly vpAbbrechen = output<void>();
  private readonly element = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private readonly vorherFokussiert = document.activeElement as HTMLElement | null;

  ngAfterViewInit() {
    if (!this.element.open) this.element.showModal();
    // Erstes Element mit autofocus oder der erste Knopf bekommt den Fokus
    (this.element.querySelector<HTMLElement>('[autofocus]') ?? this.element.querySelector<HTMLElement>('button, a[href], input'))?.focus();
  }

  abbrechen(ev: Event) {
    ev.preventDefault();
    this.vpAbbrechen.emit();
  }

  ngOnDestroy() {
    if (this.element.open) this.element.close();
    if (this.vorherFokussiert?.isConnected) this.vorherFokussiert.focus({ preventScroll: true });
  }
}
