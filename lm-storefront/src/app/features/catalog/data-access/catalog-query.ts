import { type CatalogAttributeSelection, decodeAttributeSelections, encodeAttributeSelections } from './catalog-attributes.ts';

export const SORT_OPTIONS = [
  { value: 'catalog', label: 'Orden del catálogo', api: 'CATALOG_ORDER' },
  { value: 'name-asc', label: 'Nombre: A–Z', api: 'NAME_ASC' },
  { value: 'price-asc', label: 'Precio: menor a mayor', api: 'PRICE_ASC' },
  { value: 'price-desc', label: 'Precio: mayor a menor', api: 'PRICE_DESC' },
] as const;
export type CatalogSort = typeof SORT_OPTIONS[number]['value'];
export interface CatalogQuery { search: string; categoryId: string; page: number; sort: CatalogSort; availableOnly: boolean; attributes:CatalogAttributeSelection[] }
interface QueryParameters { get(name: string): string | null; }
export const CATALOG_PAGE_SIZE = 12;
export const MAX_SEARCH_LENGTH = 200;
export function parseCatalogQuery(parameters: QueryParameters): CatalogQuery {
  const rawPage = parameters.get('page') ?? '';
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const sort = parameters.get('sort');
  return {
    search: (parameters.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH),
    categoryId: (parameters.get('category') ?? '').trim(),
    page: Number.isInteger(page) && page >= 1 && page <= 2147483647 ? page : 1,
    sort: SORT_OPTIONS.find(option => option.value === sort)?.value ?? 'catalog',
    availableOnly: parameters.get('available') === '1',
    attributes:decodeAttributeSelections(parameters.get('attributes')),
  };
}
export function catalogQueryParameters(query: CatalogQuery): Record<string, string | null> {
  return { q: query.search || null, category: query.categoryId || null, page: query.page > 1 ? String(query.page) : null,
    sort: query.sort === 'catalog' ? null : query.sort, available: query.availableOnly ? '1' : null, attributes:encodeAttributeSelections(query.attributes ?? []) };
}
export function isCanonicalCatalogQuery(parameters: QueryParameters, query: CatalogQuery): boolean {
  return Object.entries(catalogQueryParameters(query)).every(([key, value]) => parameters.get(key) === value);
}
