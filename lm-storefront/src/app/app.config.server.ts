import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { CATALOG_API_URL, PUBLIC_SITE_URL } from './core/site-config';
import { buildApiUrl, publicSiteUrl } from './core/seo-model';

const serverConfig: ApplicationConfig = {
  providers: [
    {provide: CATALOG_API_URL, useFactory: () => buildApiUrl(process.env['CATALOG_BUILD_API_URL'] ?? 'http://localhost:8080/graphql')},
    {provide: PUBLIC_SITE_URL, useFactory: () => publicSiteUrl(process.env['PUBLIC_SITE_URL'] ?? 'http://localhost:4200')},
    provideServerRendering(withRoutes(serverRoutes))
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
