import { InjectionToken, TransferState, inject, makeStateKey } from '@angular/core';

export const CATALOG_API_URL = new InjectionToken<string>('Catalog API URL', { providedIn: 'root', factory: () => '/graphql' });
export const PUBLIC_URL_STATE = makeStateKey<string>('lumio.public-url');
export const PUBLIC_SITE_URL = new InjectionToken<string>('Public site URL', {
  providedIn: 'root', factory: () => inject(TransferState).get(PUBLIC_URL_STATE, globalThis.location?.origin ?? 'http://localhost:4200'),
});
