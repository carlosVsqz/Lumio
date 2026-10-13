import { BrandingStore } from '../../../core/branding-store';
import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { ResolveFn } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { CatalogApi } from './catalog-api';
import { CatalogItem, CatalogMetadata } from './catalog.models';
import { Seo } from '../../../core/seo';
import { articleSeo } from '../../../core/seo-model';

export interface ResolvedDetail { catalog: CatalogMetadata; itemBySlug: CatalogItem | null }

export const wishlistSeoResolver: ResolveFn<boolean> = async () => {
  const api=inject(CatalogApi), brand=inject(BrandingStore), seo=inject(Seo);
  if (!brand.catalog()) {
    try { brand.set(await firstValueFrom(api.metadata().pipe(timeout(15000)))); } catch { /* The page offers a retry; saved IDs remain local. */ }
  }
  seo.set({title:'Favoritos | Lumio',description:'Tus artículos guardados en este navegador.',noindex:true});
  return true;
};

export const catalogDetailResolver: ResolveFn<ResolvedDetail | { error: true }> = async route => {
  const api = inject(CatalogApi), seo = inject(Seo), state = inject(TransferState), brand = inject(BrandingStore);
  const server = isPlatformServer(inject(PLATFORM_ID));
  const slug = route.paramMap.get('slug') ?? '';
  const key = makeStateKey<ResolvedDetail | null>('lumio.detail.' + slug);
  try {
    const cached = state.get(key, null);
    const data = cached ?? await firstValueFrom(api.detail(slug).pipe(timeout(15000)));
    if (server) {
      if (!data.itemBySlug) throw new Error('El artículo desapareció del catálogo durante el prerenderizado.');
      state.set(key, data);
    } else state.remove(key);
    brand.set(data.catalog);
    if (data.itemBySlug) seo.set(articleSeo(data.itemBySlug, data.catalog, seo.origin));
    else seo.set({ title:'Artículo no encontrado | Lumio', description:'El artículo solicitado no existe.', noindex:true });
    return data;
  } catch (cause) {
    if (server) throw new Error(`Falló el prerenderizado de /catalogo/${slug}: comprueba lm-core y CATALOG_BUILD_API_URL.`, {cause});
    seo.set({title:'No se pudo cargar el artículo | Lumio', description:'Inténtalo de nuevo.', noindex:true});
    return {error:true};
  }
};

export const catalogHomeResolver: ResolveFn<CatalogMetadata | null> = async () => {
  const api = inject(CatalogApi), seo = inject(Seo), state = inject(TransferState), brand = inject(BrandingStore);
  const server = isPlatformServer(inject(PLATFORM_ID));
  const key = makeStateKey<CatalogMetadata | null>('lumio.home');
  try {
    const data = state.get(key, null) ?? await firstValueFrom(api.metadata().pipe(timeout(15000)));
    if (server) state.set(key, data); else state.remove(key);
    brand.set(data);
    seo.set({ title:data.name, description:data.description || `Catálogo de ${data.name}`, canonical:seo.origin + '/' });
    return data;
  } catch (cause) {
    if (server) throw new Error('Falló el prerenderizado del inicio: comprueba lm-core y CATALOG_BUILD_API_URL.', {cause});
    seo.set({title:'Catálogo | Lumio',description:'Explora productos y servicios.',canonical:seo.origin + '/'});
    return null;
  }
};

export const orderSeoResolver: ResolveFn<boolean> = async () => {
  const api = inject(CatalogApi), brand = inject(BrandingStore), seo = inject(Seo);
  if (!brand.catalog()) {
    try { brand.set(await firstValueFrom(api.metadata().pipe(timeout(15000)))); } catch { /* Order remains local and usable when the API fails. */ }
  }
  seo.set({title:'Mi pedido | Lumio',description:'Revisa tu selección local.',noindex:true});
  return true;
};

