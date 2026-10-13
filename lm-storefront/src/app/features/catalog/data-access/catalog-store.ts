import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, concatWith, expand, of, switchMap, tap } from 'rxjs';
import { CatalogApi } from './catalog-api';
import { CatalogAttributeFacet, CatalogItemPage, CatalogMetadata } from './catalog.models';
import { CatalogQuery } from './catalog-query';
import { appendCatalogPage, sameCatalogFilters } from './catalog-feed';

/** Page-scoped state. switchMap cancels requests superseded by URL navigation. */
@Injectable()
export class CatalogStore {
  private readonly api = inject(CatalogApi);
  private readonly requests = new Subject<{query:CatalogQuery;append:boolean}>();
  private activeQuery: CatalogQuery | null = null;
  private restartOnRetry = false;
  readonly catalog = signal<CatalogMetadata | null>(null);
  readonly page = signal<CatalogItemPage | null>(null);
  readonly facets = signal<CatalogAttributeFacet[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly moreError = signal('');
  readonly hasMore = computed(() => !!this.page() && this.page()!.page < this.page()!.totalPages);

  constructor() {
    this.requests.pipe(
      switchMap(({query,append}) => {
        this.loading.set(!append);
        this.loadingMore.set(append);
        this.error.set('');
        this.moreError.set('');
        this.restartOnRetry = false;
        if (!append) this.page.set(null);
        const fetch = (page: number) => this.api.browse({...query,page});
        const pages = append ? fetch(query.page) : fetch(1).pipe(expand(data =>
          data.itemPage.page < Math.min(query.page, data.itemPage.totalPages) ? fetch(data.itemPage.page + 1) : EMPTY, 1));
        return pages.pipe(tap(data => {
          if (this.page() && this.catalog()?.id !== data.catalog.id) {
            this.restartOnRetry = true;
            throw new Error('Catalog changed while loading.');
          }
          const combined = appendCatalogPage(this.page(), data.itemPage, append ? query.page : (this.page()?.page ?? 0) + 1);
          this.catalog.set(data.catalog);
          this.page.set(combined);
          this.facets.set(combined.facets);
        }), catchError(() => {
          if (this.page()) this.moreError.set(this.restartOnRetry ? 'El catálogo cambió. Vuelve a cargar el listado.' : 'No pudimos cargar más artículos. Los que ya viste se conservan.');
          else this.error.set('No pudimos cargar el catálogo. Intenta de nuevo.');
          return EMPTY;
        }), concatWith(of(null)));
      }),
      takeUntilDestroyed(),
    ).subscribe(data => {
      if (data !== null) return;
      this.loading.set(false); this.loadingMore.set(false);
    });
  }

  load(query: CatalogQuery, force = false) {
    const unchanged = this.activeQuery && sameCatalogFilters(this.activeQuery,query) && this.page()?.page === query.page && !this.error() && !this.moreError();
    this.activeQuery = query;
    if (!force && unchanged) return;
    this.requests.next({query,append:false});
  }

  loadMore() {
    if (!this.activeQuery || !this.hasMore() || this.loading() || this.loadingMore()) return;
    if (this.restartOnRetry) { this.load(this.activeQuery,true); return; }
    this.requests.next({query:{...this.activeQuery,page:this.page()!.page + 1},append:true});
  }
}
