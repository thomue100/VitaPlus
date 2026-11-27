import { Component } from '@angular/core';
import { ShellComponent } from './layout/shell.component';

@Component({
  selector: 'app-root',
  imports: [ShellComponent],
  template: '<vp-shell />',
})
export class App {}
