import { Injectable, PLATFORM_ID, TransferState, computed, effect, inject, makeStateKey, signal } from '@angular/core';
import { DOCUMENT, isPlatformServer } from '@angular/common';
import { CatalogMetadata } from '../features/catalog/data-access/catalog.models';
import { brandContrast, brandSurfaceColor, brandTextColor } from './branding-model';
import { ThemeStore } from './theme-store';

const KEY = makeStateKey<CatalogMetadata | null>('lumio.business');
@Injectable({ providedIn: 'root' })
export class BrandingStore {
  private readonly theme = inject(ThemeStore);
  private readonly document = inject(DOCUMENT);
  private readonly transfer = inject(TransferState);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));
  readonly catalog = signal<CatalogMetadata | null>(this.transfer.get(KEY, null));
  readonly name = computed(() => this.catalog()?.name || 'Lumio');
  readonly logo = computed(() => this.catalog()?.branding?.logoUrl || '');
  private readonly originalColor = computed(() => this.catalog()?.branding?.primaryColor || '#234d46');
  readonly color = computed(() => brandSurfaceColor(this.originalColor(), this.theme.mode()));
  readonly contrast = computed(() => brandContrast(this.color()));
  readonly textColor = computed(() => brandTextColor(this.originalColor(), this.theme.mode()));
  constructor() {
    effect(() => {
      if (this.server || !this.theme.ready()) return;
      // Portals and native browser controls outside app-root share the same theme and business colors.
      const root = this.document.documentElement;
      root.style.setProperty('--color-primary', this.color());
      root.style.setProperty('--color-accent', this.textColor());
      root.style.setProperty('--brand-contrast', this.contrast());
    });
  }
  set(catalog: CatalogMetadata) { this.catalog.set(catalog); if (this.server) this.transfer.set(KEY, catalog); }
}
