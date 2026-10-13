import { Injectable, afterNextRender, effect, signal } from '@angular/core';
import { ThemeMode } from './theme-model';

@Injectable({providedIn:'root'})
export class ThemeStore {
  // Every visit starts in light mode; manual changes last until the next reload.
  readonly mode = signal<ThemeMode>('light');
  readonly ready = signal(false);

  constructor() {
    afterNextRender(() => this.ready.set(true));
    effect(() => {
      if (this.ready()) document.documentElement.dataset['theme'] = this.mode();
    });
  }

  toggle(): void {
    if (!this.ready()) return;
    this.mode.update(mode => mode === 'dark' ? 'light' : 'dark');
  }
}
