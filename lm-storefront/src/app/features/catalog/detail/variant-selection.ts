import type { CatalogItem, CatalogVariant } from '../data-access/catalog.models';
import { singleItemBrand } from '../data-access/catalog-brands.ts';
export { positiveQuantity } from '../../../core/quantity.ts';

export function attributeOptions(item: CatalogItem, brandAttributeName?: string) {
  const brand = singleItemBrand(item, brandAttributeName);
  const names = [...new Set(item.variants.flatMap(variant => variant.attributes.map(attribute => attribute.name)))];
  return names.filter(name => name !== brand?.name).map(name => ({ name, values: [...new Set(item.variants.map(variant =>
    variant.attributes.find(attribute => attribute.name === name)?.value ?? ''))] }));
}

export function attributeChoiceState(item: CatalogItem, choices: Record<string, string>, name: string, value: string, brandAttributeName?: string) {
  const options = attributeOptions(item, brandAttributeName);
  const matches = item.variants.filter(variant => (variant.attributes.find(attribute => attribute.name === name)?.value ?? '') === value
    && options.every(option => option.name === name || !Object.hasOwn(choices, option.name)
      || (variant.attributes.find(attribute => attribute.name === option.name)?.value ?? '') === choices[option.name]));
  return { exists: matches.length > 0, available: item.available && matches.some(variant => variant.available) };
}

// Empty value represents an attribute absent on a variant; undefined means not chosen.
export function resolveVariant(item: CatalogItem, choices: Record<string, string>, brandAttributeName?: string): CatalogVariant | null {
  const options = attributeOptions(item, brandAttributeName);
  if (options.some(option => !Object.hasOwn(choices, option.name))) return null;
  return item.variants.find(variant => options.every(option =>
    (variant.attributes.find(attribute => attribute.name === option.name)?.value ?? '') === choices[option.name])) ?? null;
}

export function canAdd(item: CatalogItem, variant: CatalogVariant | null, quantity: number | null): boolean {
  return item.available && !!variant?.available && item.variants.includes(variant)
    && quantity !== null && Number.isSafeInteger(quantity) && quantity > 0;
}
