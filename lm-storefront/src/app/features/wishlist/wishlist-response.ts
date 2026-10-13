import type { CatalogItem, CatalogMetadata } from '../catalog/data-access/catalog.models';

export interface FavoriteLookup { id: string; item: CatalogItem | null }
export interface FavoriteResponse { catalog: CatalogMetadata; itemsByIds: FavoriteLookup[] }

export function validateFavoriteResponse(data: FavoriteResponse | undefined, catalogId: string, ids: readonly string[]): FavoriteResponse {
  if (!data || data.catalog?.id !== catalogId || !Array.isArray(data.itemsByIds)
    || data.itemsByIds.length !== ids.length) throw new Error('Invalid favorites response');
  const entries = new Map<string, FavoriteLookup>();
  for (const entry of data.itemsByIds) {
    if (!entry || !ids.includes(entry.id) || entries.has(entry.id)
      || (entry.item !== null && (!entry.item || entry.item.id !== entry.id))) throw new Error('Invalid favorites response');
    entries.set(entry.id, entry);
  }
  return {...data, itemsByIds: ids.map(id => entries.get(id)!)};
}
