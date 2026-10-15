import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { activeCatalogCategory } from '../../core/catalog-navigation';
import { BrandingStore } from '../../core/branding-store';
import { OrderLink } from '../../features/order/order-link';
import { WishlistLink } from '../../features/wishlist/wishlist-link';
import { HeaderSearch } from './header-search';
import { StoreBrand } from './store-brand';
import { CategoryNavigation } from './category-navigation';

@Component({
  selector: 'app-store-header', standalone: true, imports: [RouterLink, OrderLink, WishlistLink, HeaderSearch, StoreBrand, CategoryNavigation],
  host: { class: 'sticky top-0 z-40 block shrink-0' },
  template: `
    <header class="store-header-surface border-b border-line bg-surface" [class.is-scrolled]="scrolled()">
      <div class="mx-auto grid min-h-20 max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 pt-2 lg:grid-cols-[auto_minmax(0,1fr)_180px_auto] lg:gap-x-6 lg:px-12 lg:py-2 xl:grid-cols-[auto_minmax(0,1fr)_200px_auto]">
        <app-store-brand class="order-1 lg:max-w-56" />
        <nav class="order-4 col-span-2 flex min-w-0 items-center gap-5 text-sm font-semibold lg:order-2 lg:col-span-1 lg:gap-6 lg:text-base" aria-label="Navegación del catálogo">
          <a routerLink="/" [queryParams]="{category: null, page: null}" queryParamsHandling="merge" class="shrink-0 py-4 hover:underline underline-offset-8" [class.font-semibold]="activeCategory() === ''" [class.underline]="activeCategory() === ''" [attr.aria-current]="activeCategory() === '' ? 'page' : null">Todo el catálogo</a>
          @if (brand.catalog()?.categories?.length) {
            <app-category-navigation id="header-categories" [categories]="brand.catalog()!.categories" [activeId]="activeCategory()" />
          }
        </nav>
        <app-header-search class="order-3 col-span-2 lg:col-span-1" />
        <div class="order-2 flex shrink-0 items-center gap-1 lg:order-4"><app-wishlist-link /><app-order-link /></div>
      </div>
    </header>`,
})
export class StoreHeader {
  private readonly destroy = inject(DestroyRef);
  readonly scrolled = signal(false);
  private readonly router = inject(Router);
  private readonly url = toSignal(this.router.events.pipe(
    filter(event => event instanceof NavigationEnd), map(event => event.urlAfterRedirects), startWith(this.router.url),
  ), { requireSync: true });
  readonly activeCategory = computed(() => activeCatalogCategory(this.url()));
  readonly brand = inject(BrandingStore);
  constructor() {
    afterNextRender(() => {
      const update = () => this.scrolled.set(window.scrollY > 8);
      update(); window.addEventListener('scroll', update, {passive:true});
      this.destroy.onDestroy(() => window.removeEventListener('scroll', update));
    });
  }
}
