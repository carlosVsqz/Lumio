export const MAX_FAVORITES = 100;
export interface FavoriteStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export class FavoriteDataError extends Error {}

export function validItemId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}
export function favoriteKey(catalogId: string): string {
  if (!/^catalog-[a-f0-9]{64}$/.test(catalogId)) throw new FavoriteDataError('Invalid catalog identity');
  return 'lumio.favorites.v1.' + catalogId;
}
export function decodeFavorites(raw: string | null, catalogId: string): string[] {
  favoriteKey(catalogId);
  if (raw === null) return [];
  try {
    if (raw.length > 25000) throw new Error('Oversized favorites');
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid favorites');
    const data = value as Record<string, unknown>;
    if (data['version'] !== 1 || data['catalogId'] !== catalogId || !Array.isArray(data['ids'])
      || data['ids'].length > MAX_FAVORITES || !data['ids'].every(validItemId)
      || new Set(data['ids']).size !== data['ids'].length) throw new Error('Invalid favorites');
    return [...data['ids']];
  } catch { throw new FavoriteDataError('Los favoritos guardados contienen datos inválidos o una versión no compatible.'); }
}
export function encodeFavorites(catalogId: string, ids: readonly string[]): string {
  const result = JSON.stringify({version: 1, catalogId, ids});
  decodeFavorites(result, catalogId);
  return result;
}
function applySelections(ids: readonly string[], changes: ReadonlyMap<string, boolean>): string[] {
  const result = new Set(ids);
  for (const [id, selected] of changes) { if (selected) result.add(id); else result.delete(id); }
  if (result.size > MAX_FAVORITES) throw new FavoriteDataError('Puedes guardar hasta 100 favoritos por catálogo.');
  return [...result];
}
const STORAGE_WARNING = 'No se pudieron guardar o recuperar tus favoritos. La selección sigue en memoria y podría perderse al recargar.';

/** Browser-independent persistence rules, including edits made while storage is blocked. */
export class WishlistSession {
  readonly catalogId: string;
  readonly key: string;
  ids: string[] = [];
  warning = '';
  private readonly pending = new Map<string, boolean>();
  constructor(catalogId: string) { this.catalogId = catalogId; this.key = favoriteKey(catalogId); }

  load(storage: FavoriteStorage | null) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      this.accept(storage.getItem(this.key));
    } catch { this.warning = STORAGE_WARNING; }
  }
  accept(raw: string | null): boolean {
    try {
      this.ids = applySelections(decodeFavorites(raw, this.catalogId), this.pending);
      this.warning = this.pending.size ? STORAGE_WARNING : '';
      return true;
    } catch (error) {
      this.warning = error instanceof FavoriteDataError ? error.message + ' Tu selección actual se conserva.' : STORAGE_WARNING;
      return false;
    }
  }
  set(id: string, selected: boolean, storage: FavoriteStorage | null): boolean {
    if (!validItemId(id)) return false;
    let latest = this.ids;
    try { if (storage) latest = decodeFavorites(storage.getItem(this.key), this.catalogId); } catch { /* Keep the known selection. */ }
    const changes = new Map(this.pending); changes.set(id, selected);
    let next: string[];
    try { next = applySelections(latest, changes); } catch { return false; }
    this.ids = next; this.pending.set(id, selected);
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(this.key, encodeFavorites(this.catalogId, this.ids));
      this.pending.clear(); this.warning = '';
    } catch { this.warning = STORAGE_WARNING; }
    return true;
  }
}
