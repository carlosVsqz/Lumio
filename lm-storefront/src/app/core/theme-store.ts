import { Injectable, DestroyRef, afterNextRender, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ThemeMode, THEME_STORAGE_KEY, storedTheme } from './theme-model';

@Injectable({providedIn:'root'})
export class ThemeStore {
  // SSR/hydration agree on light; only an explicit browser preference can change it.
  readonly mode = signal<ThemeMode>('light');
  readonly ready = signal(false);
  readonly storageWarning=signal('');
  private readonly document=inject(DOCUMENT);
  private storage:Storage|undefined;

  constructor() {
    const destroy=inject(DestroyRef);
    afterNextRender(() => {
      try { this.storage=window.localStorage;this.mode.set(storedTheme(this.storage.getItem(THEME_STORAGE_KEY))); }
      catch { this.mode.set('light'); }
      this.ready.set(true);
      const sync=(event:StorageEvent)=>{
        if(event.storageArea===this.storage && (event.key===THEME_STORAGE_KEY || event.key===null)) {
          this.mode.set(storedTheme(event.newValue));this.storageWarning.set('');
        }
      };
      window.addEventListener('storage',sync);destroy.onDestroy(()=>window.removeEventListener('storage',sync));
    });
    effect(() => {
      if (!this.ready()) return;
      this.document.documentElement.dataset['theme'] = this.mode();
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content',this.mode()==='dark'?'#141a17':'#ffffff');
    });
  }

  toggle(): void {
    if (!this.ready()) return;
    this.mode.update(mode => mode === 'dark' ? 'light' : 'dark');
    try { (this.storage??window.localStorage).setItem(THEME_STORAGE_KEY,this.mode());this.storageWarning.set(''); }
    catch { this.storageWarning.set('No se pudo guardar el tema. La selección se mantendrá durante esta visita.'); }
  }
}
