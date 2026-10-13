import { RenderMode, ServerRoute } from '@angular/ssr';
import { inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { CatalogApi } from './features/catalog/data-access/catalog-api';

export const serverRoutes: ServerRoute[] = [
  { path: 'catalogo/:slug', renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const api = inject(CatalogApi);
      try { return await firstValueFrom(api.slugs().pipe(timeout(15000))); }
      catch (cause) { throw new Error('No se pudieron consultar los slugs: inicia lm-core y revisa CATALOG_BUILD_API_URL.', {cause}); }
    },
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
