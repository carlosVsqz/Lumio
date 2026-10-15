import type { CatalogItem } from './data-access/catalog.models';
import { comboStartingPrice } from './detail/combo-selection.ts';

export function isItemAvailable(item: CatalogItem): boolean {
  return item.available && item.variants.some(variant => variant.available);
}

export function minimumItemPrice(item: CatalogItem): number {
  const available = item.available ? item.variants.filter(variant => variant.available) : [];
  const variants = available.length ? available : item.variants;
  return comboStartingPrice(item,variants.reduce((minimum, variant) => Math.min(minimum, variant.priceMinor), variants[0].priceMinor));
}
