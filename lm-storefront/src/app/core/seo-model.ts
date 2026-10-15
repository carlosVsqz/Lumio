import type { CatalogItem, CatalogItemPage, CatalogMetadata } from '../features/catalog/data-access/catalog.models';
import { minimumItemPrice } from '../features/catalog/catalog-presentation.ts';
import { catalogQueryParameters, type CatalogQuery } from '../features/catalog/data-access/catalog-query.ts';

export function publicSiteUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PUBLIC_SITE_URL debe ser un origen HTTP(S), sin credenciales, ruta, consulta ni fragmento.');
  }
  return url.origin;
}
export function buildApiUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('CATALOG_BUILD_API_URL debe ser una URL HTTP(S) del endpoint GraphQL, sin credenciales ni fragmento.');
  }
  return url.href;
}
export function articleUrl(origin: string, slug: string): string { return `${publicSiteUrl(origin)}/catalogo/${encodeURIComponent(slug)}/`; }
export function decimalPrice(minor: number, decimals: number): string {
  if (!Number.isInteger(minor) || minor < 0 || minor > 2147483647 || !Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new Error('Invalid SEO money.');
  const scale = 10n ** BigInt(decimals), amount = BigInt(minor);
  return `${amount / scale}${decimals ? '.' + (amount % scale).toString().padStart(decimals, '0') : ''}`;
}
type SchemaNode = Record<string, unknown>;
const reference = (id: string) => ({'@id': id});
const graph = (...nodes: SchemaNode[]) => ({'@context': 'https://schema.org', '@graph': nodes});

export function publicImageUrl(value: string | null | undefined, origin: string): string | null {
  if (!value || value !== value.trim() || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const url = new URL(value, publicSiteUrl(origin) + '/');
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && (value.startsWith('https://') || value.startsWith('http://') || /^\/(?!\/)/.test(value)) ? url.href : null;
  } catch { return null; }
}

/** Business facts only: a public catalog does not establish a physical shop or legal identity. */
function siteNodes(catalog: CatalogMetadata, origin: string): SchemaNode[] {
  const url = publicSiteUrl(origin) + '/', logo = publicImageUrl(catalog.branding?.logoUrl, origin);
  const description = catalog.description || `Catálogo de ${catalog.name}`;
  return [
    {'@type': 'Organization', '@id': url + '#organization', name: catalog.name, url,
      ...(catalog.description ? {description: catalog.description} : {}), ...(logo ? {logo} : {}),
      ...(/^[1-9][0-9]{7,14}$/.test(catalog.whatsappNumber ?? '') ? {contactPoint: {
        '@type': 'ContactPoint', contactType: 'Consultas por WhatsApp', url: 'https://wa.me/' + catalog.whatsappNumber,
      }} : {}),
    },
    {'@type': 'WebSite', '@id': url + '#website', url, name: catalog.name, description, publisher: reference(url + '#organization')},
  ];
}

export function catalogSeo(catalog: CatalogMetadata, page: CatalogItemPage | null, query: CatalogQuery, origin: string) {
  const canonical = publicSiteUrl(origin) + '/', url = new URL(canonical);
  for (const [name, value] of Object.entries(catalogQueryParameters(query))) if (value !== null) url.searchParams.set(name, value);
  const category = catalog.categories.find(category => category.id === query.categoryId);
  const name = category?.name || (query.categoryId ? 'Categoría no disponible' : 'Todos los artículos');
  const title = query.search ? `Buscar: ${query.search} | ${catalog.name}` : category ? `${category.name} | ${catalog.name}` : catalog.name;
  const description = category?.description || catalog.description || `Catálogo de ${catalog.name}`;
  const pageId = url.href + '#webpage', listId = url.href + '#items';
  return {title, description, canonical, structured: graph(...siteNodes(catalog, origin),
    {'@type': 'CollectionPage', '@id': pageId, url: url.href, name, description,
      isPartOf: reference(canonical + '#website'), publisher: reference(canonical + '#organization'),
      ...(page ? {mainEntity: reference(listId)} : {}),
    },
    ...(page ? [{'@type': 'ItemList', '@id': listId, numberOfItems: page.items.length,
      itemListElement: page.items.map((item, index) => ({'@type': 'ListItem', position: index + 1,
        name: item.name, url: articleUrl(origin, item.slug),
      })),
    }] : []),
  )};
}

export function articleSeo(item: CatalogItem, catalog: CatalogMetadata, origin: string) {
  const url = articleUrl(origin, item.slug);
  const home = publicSiteUrl(origin) + '/', organization = reference(home + '#organization');
  const description = item.description || `${item.name} — ${catalog.name}`;
  const categories = catalog.categories.filter(category => item.categoryIds.includes(category.id)).map(category => category.name).join(', ');
  const images = [...new Set(item.images.map(image => publicImageUrl(image.url, origin)).filter((url): url is string => !!url))];
  const brandNames = new Set((item.attributes ?? []).filter(attribute => attribute.name === catalog.brandFacet?.name).map(attribute => attribute.value));
  const brands = [...brandNames].map(name => {
    const logo = publicImageUrl(catalog.brandFacet?.values.find(value => value.value === name)?.image?.url, origin);
    return {'@type': 'Brand', name, ...(logo ? {logo} : {})};
  });
  const attributes = [...(item.attributes ?? []), ...(item.variants.length === 1 ? item.variants[0].attributes : [])];
  const properties = attributes.filter((attribute, index) => attributes.findIndex(other => other.name === attribute.name && other.value === attribute.value) === index);
  const article = {
    '@type': item.type === 'SERVICE' ? 'Service' : 'Product',
    '@id': url + '#article', url, name: item.name, description,
    mainEntityOfPage: reference(url + '#webpage'),
    ...(categories ? { category: categories } : {}),
    ...(item.type !== 'SERVICE' ? { sku: item.id } : { provider: organization }),
    ...(images.length ? {image: images} : {}),
    ...(brands.length ? {brand: brands} : {}),
    offers: item.type==='COMBO' ? { '@type':'AggregateOffer', lowPrice:decimalPrice(minimumItemPrice(item),catalog.currencyDecimals),priceCurrency:catalog.currency,url,
      seller: organization, availability: `https://schema.org/${item.available && item.variants.some(variant => variant.available) ? 'InStock' : 'OutOfStock'}`,
    } : item.variants.map(variant => ({
      '@type': 'Offer', '@id': url + '#variant-' + encodeURIComponent(variant.id), url,
      name: variant.name, sku: variant.id, price: decimalPrice(variant.priceMinor, catalog.currencyDecimals),
      priceCurrency: catalog.currency, availability: `https://schema.org/${item.available && variant.available ? 'InStock' : 'OutOfStock'}`,
      seller: organization,
    })),
    ...(item.type !== 'SERVICE' && properties.length ? {
      additionalProperty: properties.map(attribute => ({ '@type': 'PropertyValue', name: attribute.name, value: attribute.value })),
    } : {}),
  };
  const structured = graph(...siteNodes(catalog, origin), article,
    {'@type': 'WebPage', '@id': url + '#webpage', url, name: item.name, description,
      isPartOf: reference(home + '#website'), publisher: organization,
      mainEntity: reference(url + '#article'), breadcrumb: reference(url + '#breadcrumbs'),
    },
    {'@type': 'BreadcrumbList', '@id': url + '#breadcrumbs', itemListElement: [
      {'@type': 'ListItem', position: 1, name: 'Catálogo', item: home},
      {'@type': 'ListItem', position: 2, name: item.name, item: url},
    ]},
  );
  return { title: `${item.name} | ${catalog.name}`, description, canonical: url, structured };
}
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function sitemap(origin: string, slugs: string[]): string {
  const urls = [publicSiteUrl(origin) + '/', ...slugs.map(slug => articleUrl(origin, slug))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
