import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { CatalogApi } from '../catalog/data-access/catalog-api';
import { CatalogMetadata } from '../catalog/data-access/catalog.models';
import { CatalogCard } from '../catalog/ui/catalog-card';
import { ProductImage } from '../../shared/ui/product-image';
import { BrandingStore } from '../../core/branding-store';
import { WishlistStore } from './wishlist-store';
import { FavoriteButton } from './favorite-button';
import { FavoriteLookup } from './wishlist-response';

@Component({selector:'app-wishlist-page',standalone:true,imports:[RouterLink,CatalogCard,ProductImage,FavoriteButton],templateUrl:'./wishlist-page.html',host:{class:'block'}})
export class WishlistPage {
  readonly store=inject(WishlistStore);
  private readonly api=inject(CatalogApi);
  private readonly brand=inject(BrandingStore);
  private readonly destroy=inject(DestroyRef);
  private readonly element: ElementRef<HTMLElement>=inject(ElementRef);
  private readonly injector=inject(Injector);
  private readonly currentId=computed(()=>this.brand.catalog()?.id ?? null);
  readonly metadataLoading=signal(true);
  readonly metadataError=signal(false);
  readonly loading=signal(false);
  readonly error=signal(false);
  readonly rows=signal<FavoriteLookup[]>([]);
  readonly visibleRows=computed(()=>this.rows().filter(row=>this.store.has(row.id)));
  readonly catalog=signal<CatalogMetadata | null>(null);

  constructor() {
    afterNextRender(()=>this.refresh());
    effect(onCleanup=>{
      const id=this.currentId(), savedId=this.store.catalogId(), ids=this.store.ids();
      const ready=this.store.ready(), pending=this.metadataLoading(), failed=this.metadataError();
      if (!ready || pending || failed || !id || id!==savedId) return;
      untracked(()=>{
        this.error.set(false);
        if (!ids.length) { this.rows.set([]); this.loading.set(false); return; }
        this.loading.set(true);
        const request=this.api.favorites(id,ids).pipe(timeout(15000)).subscribe({
          next:data=>{this.catalog.set(data.catalog);this.brand.set(data.catalog);this.rows.set(data.itemsByIds);this.loading.set(false);},
          error:()=>{this.error.set(true);this.loading.set(false);},
        });
        onCleanup(()=>request.unsubscribe());
      });
    });
  }
  refresh() {
    if (this.metadataLoading() && this.catalog()) return;
    this.metadataLoading.set(true);this.metadataError.set(false);
    this.api.metadata(true).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({
      next:catalog=>{this.catalog.set(catalog);this.brand.set(catalog);this.metadataLoading.set(false);},
      error:()=>{this.metadataError.set(true);this.metadataLoading.set(false);},
    });
  }
  focusAfterRemoval(id: string) {
    const index=this.rows().findIndex(row=>row.id===id);
    afterNextRender(()=>{
      const buttons=this.element.nativeElement.querySelectorAll<HTMLButtonElement>('app-favorite-button button');
      const target=buttons[Math.max(0,Math.min(index,buttons.length-1))] ?? this.element.nativeElement.querySelector<HTMLElement>('#favorites-title');
      target?.focus({preventScroll:true});
    },{injector:this.injector});
  }
}
