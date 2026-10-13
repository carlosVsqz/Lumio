import { articleSeo } from '../src/app/core/seo-model.ts';
import { formatMinorPrice } from '../src/app/core/money.ts';
import { minimumItemPrice } from '../src/app/features/catalog/catalog-presentation.ts';

export function decodeHtml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};
    return named[entity] ?? String.fromCodePoint(parseInt(entity.slice(entity[2] === 'x' ? 3 : 2, -1), entity[2] === 'x' ? 16 : 10));
  });
}
export function verifyArticleHtml(html, item, catalog, origin) {
  const seo = articleSeo(item, catalog, origin);
  const script = html.match(/<script[^>]*id="lumio-structured-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const structured = script ? JSON.parse(script) : null;
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
