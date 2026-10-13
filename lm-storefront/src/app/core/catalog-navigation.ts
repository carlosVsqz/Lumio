/** null means that a detail or order route is active, not a catalog category. */
export function activeCatalogCategory(url: string): string | null {
  const location = new URL(url, 'https://lumio.invalid');
  return location.pathname === '/' ? (location.searchParams.get('category') ?? '').trim() : null;
}
