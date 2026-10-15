import type { CatalogItem, CatalogMetadata } from '../features/catalog/data-access/catalog.models';
import { minimumItemPrice } from '../features/catalog/catalog-presentation.ts';

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
export function articleSeo(item: CatalogItem, catalog: CatalogMetadata, origin: string) {
  const url = articleUrl(origin, item.slug);
  const description = item.description || `${item.name} — ${catalog.name}`;
  const categories = catalog.categories.filter(category => item.categoryIds.includes(category.id)).map(category => category.name).join(', ');
  const structured = {
    '@context': 'https://schema.org', '@type': item.type === 'SERVICE' ? 'Service' : 'Product',
    '@id': url + '#article', url, name: item.name, description,
    ...(categories ? { category: categories } : {}),
    ...(item.type !== 'SERVICE' ? { sku: item.id } : { provider: { '@type': 'Organization', name: catalog.name } }),
    ...(item.images.length ? { image: item.images.map(image => new URL(image.url, origin + '/').href) } : {}),
    offers: item.type==='COMBO' ? { '@type':'AggregateOffer', lowPrice:decimalPrice(minimumItemPrice(item),catalog.currencyDecimals),priceCurrency:catalog.currency,url } : item.variants.map(variant => ({
      '@type': 'Offer', '@id': url + '#variant-' + encodeURIComponent(variant.id), url,
      name: variant.name, sku: variant.id, price: decimalPrice(variant.priceMinor, catalog.currencyDecimals),
      priceCurrency: catalog.currency, availability: `https://schema.org/${item.available && variant.available ? 'InStock' : 'OutOfStock'}`,
      seller: { '@type': 'Organization', name: catalog.name },
    })),
    ...(item.type === 'PRODUCT' && item.variants.length === 1 ? {
      additionalProperty: item.variants[0].attributes.map(attribute => ({ '@type': 'PropertyValue', name: attribute.name, value: attribute.value })),
    } : {}),
  };
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
