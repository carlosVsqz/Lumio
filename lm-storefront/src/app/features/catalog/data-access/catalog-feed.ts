import type { CatalogItemPage } from './catalog.models';
import { type CatalogAttributeSelection, encodeAttributeSelections } from './catalog-attributes.ts';

/** Stable ordering with current data for IDs repeated across shifting backend pages. */
export function appendCatalogPage(previous: CatalogItemPage | null, incoming: CatalogItemPage, requestedPage: number): CatalogItemPage {
  if (!incoming || !Array.isArray(incoming.items) || incoming.page !== requestedPage
      || !Number.isInteger(incoming.pageSize) || incoming.pageSize < 1 || incoming.pageSize > 50
      || !Number.isInteger(incoming.totalCount) || incoming.totalCount < 0
      || incoming.totalPages !== Math.ceil(incoming.totalCount / incoming.pageSize)
      || incoming.items.length > incoming.pageSize || incoming.items.some(item => !item || typeof item.id !== 'string' || !item.id)
      || new Set(incoming.items.map(item => item.id)).size !== incoming.items.length) throw new Error('Invalid catalog page.');
  if (incoming.page !== (previous ? previous.page + 1 : 1) || (previous && previous.pageSize !== incoming.pageSize)) throw new Error('Non-sequential catalog page.');
  const items = new Map((previous?.items ?? []).map(item => [item.id, item]));
  for (const item of incoming.items) items.set(item.id, item);
  return {...incoming, items:[...items.values()]};
}

export function sameCatalogFilters(first: {search:string;categoryId:string;sort:string;availableOnly:boolean;attributes?:CatalogAttributeSelection[]}, second: typeof first): boolean {
  return first.search === second.search && first.categoryId === second.categoryId && first.sort === second.sort && first.availableOnly === second.availableOnly
    && encodeAttributeSelections(first.attributes ?? [])===encodeAttributeSelections(second.attributes ?? []);
}
