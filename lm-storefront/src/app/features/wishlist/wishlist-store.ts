import { DestroyRef, Injectable, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { BrandingStore } from '../../core/branding-store';
import { FavoriteStorage, WishlistSession } from './wishlist-model';

@Injectable({ providedIn: 'root' })
export class WishlistStore {
  private readonly brand = inject(BrandingStore);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly sessions = new Map<string, WishlistSession>();
  private session: WishlistSession | null = null;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  readonly catalogId = signal<string | null>(null);
  readonly ids = signal<string[]>([]);
  readonly ready = signal(false);
  readonly count = computed(() => this.ids().length);
  readonly notice = signal('');
  readonly storageWarning = signal('');

  constructor() {
    afterNextRender(() => {
      effect(() => {
        const id = this.brand.catalog()?.id ?? null;
        untracked(() => this.activate(id));
      }, { injector: this.injector });
      const sync = (event: StorageEvent) => {
        if (!this.session || (event.key !== null && event.key !== this.session.key)) return;
        const storage = this.storage();
        if (!storage || event.storageArea !== storage) return;
        if (this.session.accept(event.newValue)) this.announce('Favoritos actualizados desde otra pestaña.');
        this.publish();
      };
      window.addEventListener('storage', sync);
      this.destroy.onDestroy(() => { window.removeEventListener('storage', sync); clearTimeout(this.noticeTimer); });
    });
  }
  private storage(): FavoriteStorage | null {
    try { return window.localStorage; } catch { return null; }
  }
  private activate(id: string | null) {
    if (id === this.catalogId() && this.session && this.ready()) return;
    this.ready.set(false); this.catalogId.set(id); this.notice.set('');
    if (!id) { this.session = null; this.ids.set([]); this.storageWarning.set(''); return; }
    try {
      const session = this.sessions.get(id) ?? new WishlistSession(id);
      this.sessions.set(id, session); this.session = session;
      session.load(this.storage()); this.publish(); this.ready.set(true);
    } catch { this.session = null; this.ids.set([]); this.storageWarning.set('No se pudo identificar el catálogo para tus favoritos.'); }
  }
  private publish() {
    this.ids.set([...(this.session?.ids ?? [])]); this.storageWarning.set(this.session?.warning ?? '');
  }
  has(id: string) { return this.ids().includes(id); }
  toggle(id: string, catalogId: string) { this.set(id, !this.has(id), catalogId); }
  remove(id: string, catalogId: string) { this.set(id, false, catalogId); }
  private set(id: string, selected: boolean, catalogId: string) {
    if (!this.ready() || !this.session || this.catalogId() !== catalogId) return;
    if (!this.session.set(id, selected, this.storage())) { this.announce('Puedes guardar hasta 100 favoritos por catálogo.'); return; }
    this.publish();
    this.announce((selected ? 'Artículo añadido a favoritos.' : 'Artículo quitado de favoritos.')
      + (this.storageWarning() ? ' Solo se conservará durante esta sesión mientras el almacenamiento no esté disponible.' : ''));
  }
  private announce(message: string) {
    this.notice.set(message); clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 5000);
  }
}
