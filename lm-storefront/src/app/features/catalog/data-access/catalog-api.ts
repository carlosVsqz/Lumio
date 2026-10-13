import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { CatalogBrowseData, CatalogItem, CatalogMetadata } from './catalog.models';
import { CATALOG_PAGE_SIZE, CatalogQuery, SORT_OPTIONS } from './catalog-query';
import type { OrderSnapshot } from '../../order/order-model';
import { CATALOG_API_URL } from '../../../core/site-config';
import { FavoriteResponse, validateFavoriteResponse } from '../../wishlist/wishlist-response';

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);
  private readonly endpoint = inject(CATALOG_API_URL);

  favorites(catalogId: string, ids: string[]) {
    return this.http.post<{data?:FavoriteResponse;errors?:unknown[]}>(this.endpoint, {
      query: `query FavoriteItems($catalogId: ID!, $ids: [ID!]!) {
        catalog { id name description currency currencyDecimals whatsappNumber branding { logoUrl primaryColor } categories { id slug name description } }
        itemsByIds(catalogId:$catalogId, ids:$ids) { id item {
          id slug type name description categoryIds available attributes { name value } images { url alt }
          variants { id slug name priceMinor available attributes { name value } }
        } }
      }`, variables:{catalogId,ids},
    }, {transferCache:false}).pipe(map(response=>{
      if (response.errors?.length) throw new Error('No se pudieron consultar tus favoritos.');
      return validateFavoriteResponse(response.data,catalogId,ids);
    }));
  }

  slugs() {
    return this.http.post<{ data?: { items: { slug: string }[] }; errors?: unknown[] }>(this.endpoint, {
      query: 'query PrerenderSlugs { items { slug } }',
    }, { transferCache: false }).pipe(map(response => {
      if (response.errors?.length || !response.data?.items) throw new Error('No se pudieron consultar los slugs para el prerenderizado.');
      return response.data.items.map(item => ({ slug: item.slug }));
    }));
  }

  metadata(fresh = false) {
    return this.http.post<{ data?: { catalog: CatalogMetadata }; errors?: unknown[] }>(this.endpoint, {
      query: 'query CatalogMetadata { catalog { id name description currency currencyDecimals whatsappNumber branding { logoUrl primaryColor } categories { id slug name description } } }',
    }, {transferCache: !fresh}).pipe(map(response => {
      if (response.errors?.length || !response.data?.catalog) throw new Error('No se pudo consultar la configuración del catálogo.');
      return response.data.catalog;
    }));
  }

  orderSnapshot() {
    return this.http.post<{ data?: OrderSnapshot; errors?: unknown[] }>(this.endpoint, {
      query: `query ReviewOrder { catalog {
        id name description currency currencyDecimals whatsappNumber branding { logoUrl primaryColor } categories { id slug name description }
        items { id slug type name description categoryIds available attributes { name value } images { url alt }
          variants { id slug name priceMinor available attributes { name value } }
        }
      } }`,
    }, { transferCache: false }).pipe(map(response => {
      if (response.errors?.length || !response.data?.catalog) throw new Error('Invalid order response.');
      return response.data;
    }));
  }

  detail(slug: string) {
    return this.http.post<{ data?: { catalog: CatalogMetadata; itemBySlug: CatalogItem | null }; errors?: unknown[] }>(this.endpoint, {
      query: `query ItemDetail($slug: String!) {
        catalog { id name description currency currencyDecimals whatsappNumber branding { logoUrl primaryColor } categories { id slug name description } }
        itemBySlug(slug: $slug) {
          id slug type name description categoryIds available attributes { name value } images { url alt }
          variants { id slug name priceMinor available attributes { name value } }
        }
      }`, variables: { slug },
    }).pipe(map(response => {
      if (response.errors?.length || !response.data?.catalog || response.data.itemBySlug === undefined) {
        throw new Error('Invalid item response.');
      }
      return response.data;
    }));
  }

  browse(query: CatalogQuery) {
    return this.http.post<{ data?: CatalogBrowseData; errors?: { message: string }[] }>(this.endpoint, {
      query: `query BrowseCatalog($search: String, $categoryId: ID, $page: Int!, $pageSize: Int!, $sort: CatalogSort!, $availableOnly: Boolean!, $attributes:[CatalogAttributeFilterInput!]) {
        catalog {
          id name description currency currencyDecimals whatsappNumber branding { logoUrl primaryColor }
          categories { id slug name description }
        }
        itemPage(search: $search, categoryId: $categoryId, page: $page, pageSize: $pageSize, sort: $sort, availableOnly: $availableOnly, attributes:$attributes) {
          totalCount page pageSize totalPages
          facets { name values { value count } }
          items {
            id slug type name description categoryIds available attributes { name value } images { url alt }
            variants { id slug name priceMinor available attributes { name value } }
          }
        }
      }`,
      variables: {
        search: query.search || null, categoryId: query.categoryId || null,
        page: query.page, pageSize: CATALOG_PAGE_SIZE, sort: SORT_OPTIONS.find(option => option.value === query.sort)!.api, availableOnly: query.availableOnly,
        attributes:query.attributes,
      },
    }).pipe(map(response => {
      if (response.errors?.length || !response.data?.catalog || !response.data?.itemPage) {
        throw new Error('Invalid catalog response.');
      }
      return response.data;
    }));
  }
}

