import { Component, DestroyRef, computed, inject, input, output } from '@angular/core';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { CatalogItem, CatalogMetadata } from '../data-access/catalog.models';
import { isItemAvailable, minimumItemPrice } from '../catalog-presentation';
import { formatMinorPrice } from '../../../core/money';
import { ProductImage } from '../../../shared/ui/product-image';
import { FavoriteButton } from '../../wishlist/favorite-button';
import { UiIcon } from '../../../shared/ui/ui-icon';
import { CatalogQuickView, QuickViewData } from './catalog-quick-view';
@Component({ selector: 'app-catalog-card', standalone: true, imports: [RouterLink, ProductImage, FavoriteButton, UiIcon, DialogModule], templateUrl: './catalog-card.html', host: { class: 'block min-w-0' } })
export class CatalogCard {
  private readonly dialog = inject(Dialog);
  private quickView?: DialogRef<void, CatalogQuickView>;
  constructor() { inject(DestroyRef).onDestroy(() => this.quickView?.close()); }
  readonly favoriteRemoved = output<void>();
  readonly item = input.required<CatalogItem>();
  readonly catalog = input.required<CatalogMetadata>();
  readonly priority = input(false);
  readonly available = computed(() => isItemAvailable(this.item()));
  readonly price = computed(() => formatMinorPrice(minimumItemPrice(this.item()), this.catalog().currencyDecimals, this.catalog().currency));
  readonly categories = computed(() => this.catalog().categories.filter(c => this.item().categoryIds.includes(c.id)).map(c => c.name).join(' · '));
  readonly variedPrice = computed(() => new Set(this.item().variants.map(v => v.priceMinor)).size > 1);
  openQuickView(event: MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    if (this.quickView) return;
    const ref = this.dialog.open<void, QuickViewData, CatalogQuickView>(CatalogQuickView, {
      data: {item:this.item(),catalog:this.catalog()}, width:'920px', maxWidth:'calc(100vw - 2rem)',
      maxHeight:'calc(100dvh - 2rem)', panelClass:'quick-view-overlay',
      backdropClass:event.detail ? 'quick-view-backdrop' : ['quick-view-backdrop','quick-view-instant'],
      ariaLabelledBy:'quick-view-title-' + this.item().id, autoFocus:'dialog', restoreFocus:true,
    });
    this.quickView = ref;
    ref.closed.subscribe(() => { if (this.quickView === ref) this.quickView = undefined; });
  }
}
