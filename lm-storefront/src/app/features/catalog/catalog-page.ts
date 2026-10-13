import { Component, DestroyRef, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CatalogStore } from './data-access/catalog-store';
import { CatalogQuery, SORT_OPTIONS, catalogQueryParameters, isCanonicalCatalogQuery, parseCatalogQuery } from './data-access/catalog-query';
import { CatalogFilters } from './ui/catalog-filters';
import { CatalogCard } from './ui/catalog-card';
import { CatalogLoadMore } from './ui/catalog-load-more';
import { BrandingStore } from '../../core/branding-store';
import { UiIcon } from '../../shared/ui/ui-icon';
import { CatalogSearchState } from './data-access/catalog-search-state';
import { toggleAttributeSelection } from './data-access/catalog-attributes';
@Component({ selector: 'app-catalog-page', standalone: true, imports: [CatalogFilters, CatalogCard, CatalogLoadMore, UiIcon], providers: [CatalogStore], templateUrl: './catalog-page.html', host: { class: 'block' } })
export class CatalogPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly brand = inject(BrandingStore);
  private readonly search = inject(CatalogSearchState);
  private readonly viewport = inject(ViewportScroller);
  private pendingScroll: [number,number] | null = null;
  private keyboardStart: number | null = null;
  readonly store = inject(CatalogStore);
  readonly query = signal(parseCatalogQuery(this.route.snapshot.queryParamMap));
  readonly filtersOpen = signal(false);
  readonly sorts = SORT_OPTIONS;
  readonly category = computed(() => this.store.catalog()?.categories.find(c => c.id === this.query().categoryId));
  readonly title = computed(() => this.category()?.name || (this.query().categoryId ? 'Categoría no disponible' : 'Todos los artículos'));
  constructor() {
    this.store.catalog.set(this.route.snapshot.data['catalog'] ?? this.brand.catalog());
    afterNextRender(() => {
      this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
        if (event instanceof Scroll && event.scrollBehavior === 'manual' && this.pendingScroll) {
          this.viewport.scrollToPosition(this.pendingScroll, {behavior: 'instant'}); this.pendingScroll = null;
          if (this.keyboardStart !== null) {
            const id = this.store.page()?.items[this.keyboardStart]?.id;
            this.keyboardStart = null;
            if (id) document.getElementById('item-' + id)?.querySelector('a')?.focus();
          }
        }
      });
      this.search.repeatedSearch.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.retry());
      this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(parameters => {
      const query = parseCatalogQuery(parameters); this.query.set(query);
      if (!isCanonicalCatalogQuery(parameters, query)) { this.navigate(query, true); return; }
      this.store.load(query);
      });
    });
    effect(() => {
      const catalog = this.store.catalog(); if (catalog) this.brand.set(catalog);
      const result = this.store.page();
      if (!this.store.loading() && !this.store.loadingMore() && !this.store.error() && !this.store.moreError() && result && result.page !== this.query().page)
        this.navigate({...this.query(),page:result.page},true,true);
    });
  }
  filter(filters: Partial<CatalogQuery>) {
    this.keyboardStart = null;
    const query = { ...this.query(), ...filters, page: 1 };
    if (JSON.stringify(query) === JSON.stringify(this.query())) this.store.load(query,true); else this.navigate(query);
  }
  loadMore(event: MouseEvent) {
    this.keyboardStart = event.detail === 0 ? this.store.page()?.items.length ?? null : null;
    this.store.loadMore();
  }
  removeAttribute(name:string,value:string) {this.filter({attributes:toggleAttributeSelection(this.query().attributes,name,value,false)});}
  retry() { this.keyboardStart = null; this.store.load(this.query(),true); }
  private navigate(query: CatalogQuery, replaceUrl = false, preserveScroll = false) {
    if (preserveScroll) this.pendingScroll = this.viewport.getScrollPosition();
    // Updating the loaded depth must not trigger the router's default scroll to top.
    void this.router.navigate([], { relativeTo: this.route, queryParams: catalogQueryParameters(query), queryParamsHandling: 'merge', replaceUrl, scroll: preserveScroll ? 'manual' : 'after-transition' });
  }
}
