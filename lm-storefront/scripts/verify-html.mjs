import { articleSeo, catalogSeo } from '../src/app/core/seo-model.ts';
import { CATALOG_PAGE_SIZE, parseCatalogQuery } from '../src/app/features/catalog/data-access/catalog-query.ts';
import { formatMinorPrice } from '../src/app/core/money.ts';
import { minimumItemPrice } from '../src/app/features/catalog/catalog-presentation.ts';

export function decodeHtml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};
    return named[entity] ?? String.fromCodePoint(parseInt(entity.slice(entity[2] === 'x' ? 3 : 2, -1), entity[2] === 'x' ? 16 : 10));
  });
}
function structuredData(html) {
  const scripts=[...html.matchAll(/<script\b[^>]*id="lumio-structured-data"[^>]*>([\s\S]*?)<\/script>/g)];
  if(scripts.length!==1 || !scripts[0][0].includes('type="application/ld+json"'))throw new Error('Se esperaba un único script Schema.org JSON-LD.');
  return JSON.parse(scripts[0][1]);
}
export function verifyArticleHtml(html, item, catalog, origin) {
  const seo = articleSeo(item, catalog, origin);
  const structured = structuredData(html);
  const title = decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
  const heading = decodeHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]*>/g, '') ?? '').trim();
  const descriptionTag = html.match(/<meta[^>]*name="description"[^>]*>/)?.[0] ?? '';
  const description = decodeHtml(descriptionTag.match(/content="([^"]*)"/)?.[1] ?? '');
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? html;
  const visible = normalize(decodeHtml(body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')));
  const price = formatMinorPrice(minimumItemPrice(item), catalog.currencyDecimals, catalog.currency);
  if (heading !== item.name || title !== seo.title || description !== seo.description
    || !visible.includes(normalize(item.description)) || !visible.includes(price)
    || JSON.stringify(structured) !== JSON.stringify(seo.structured)
    || !html.includes('href="' + seo.canonical + '"')) throw new Error('El HTML prerenderizado no contiene los datos y SEO esperados para ' + item.slug);
}

/** The listing schema must describe the same first batch that visitors can read without JS. */
export function verifyCatalogHtml(html, catalog, origin) {
  const items=catalog.items.slice(0,CATALOG_PAGE_SIZE);
  const page={items,page:1,pageSize:CATALOG_PAGE_SIZE,totalCount:catalog.items.length,totalPages:Math.ceil(catalog.items.length/CATALOG_PAGE_SIZE),facets:[]};
  const seo=catalogSeo(catalog,page,parseCatalogQuery(new URLSearchParams()),origin);
  if(JSON.stringify(structuredData(html))!==JSON.stringify(seo.structured))throw new Error('El Schema.org del listado no corresponde al catálogo prerenderizado.');
  const cards=[...html.matchAll(/<app-catalog-card\b[^>]*>([\s\S]*?)<\/app-catalog-card>/g)];
  if(cards.length!==items.length)throw new Error('El HTML del listado no contiene la primera página de artículos.');
  for(let index=0;index<items.length;index++) {
    const visible=decodeHtml(cards[index][1].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
    if(!visible.includes(items[index].name) || !visible.includes(formatMinorPrice(minimumItemPrice(items[index]),catalog.currencyDecimals,catalog.currency)))
      throw new Error('El listado prerenderizado no contiene el artículo y precio esperado para '+items[index].slug);
  }
}
