import type { Category } from '../features/catalog/data-access/catalog.models';

/** Keep provider ordering and stable IDs; search changes only the menu, never catalog filters. */
export function filterCategories(categories:readonly Category[], search:string):Category[] {
  const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}+/gu,'').toLocaleLowerCase('es');
  const words=normalize(search.trim()).split(/\s+/u).filter(Boolean);
  return categories.filter(category=>words.every(word=>normalize(category.name).includes(word)));
}
