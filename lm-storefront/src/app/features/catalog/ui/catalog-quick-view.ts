import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { CatalogItem, CatalogMetadata } from '../data-access/catalog.models';
import { isItemAvailable, minimumItemPrice } from '../catalog-presentation';
import { formatMinorPrice } from '../../../core/money';
import { brandContrast, brandSurfaceColor, brandTextColor } from '../../../core/branding-model';
import { ThemeStore } from '../../../core/theme-store';
import { ProductImage } from '../../../shared/ui/product-image';
import { UiIcon } from '../../../shared/ui/ui-icon';

export interface QuickViewData { item: CatalogItem; catalog: CatalogMetadata }

@Component({
  selector: 'app-catalog-quick-view', standalone: true, imports: [RouterLink, ProductImage, UiIcon],
  templateUrl: './catalog-quick-view.html',
  host: {class:'block min-w-0', '[style.--color-primary]':'primary()', '[style.--color-accent]':'accent()', '[style.--brand-contrast]':'contrast()'},
})
export class CatalogQuickView {
  private readonly theme = inject(ThemeStore);
  readonly data = inject<QuickViewData>(DIALOG_DATA);
  private readonly dialog = inject<DialogRef<void>>(DialogRef);
  readonly item = this.data.item;
  readonly titleId = 'quick-view-title-' + this.item.id;
  readonly primary = computed(() => brandSurfaceColor(this.data.catalog.branding.primaryColor, this.theme.mode()));
  readonly accent = computed(() => brandTextColor(this.data.catalog.branding.primaryColor, this.theme.mode()));
  readonly contrast = computed(() => brandContrast(this.primary()));
  readonly index = signal(0);
  readonly image = computed(() => this.item.images[this.index()] ?? null);
  readonly available = isItemAvailable(this.item);
  readonly price = formatMinorPrice(minimumItemPrice(this.item), this.data.catalog.currencyDecimals, this.data.catalog.currency);
  readonly variedPrice = new Set(this.item.variants.map(variant => variant.priceMinor)).size > 1;
  readonly categories = this.data.catalog.categories.filter(category => this.item.categoryIds.includes(category.id)).map(category => category.name).join(' · ')
    || (this.item.type === 'SERVICE' ? 'Servicio' : 'Producto');
  close() { this.dialog.close(); }
}
