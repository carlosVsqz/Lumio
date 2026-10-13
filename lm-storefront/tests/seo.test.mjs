import {test} from 'node:test';
import assert from 'node:assert/strict';
import {articleSeo,decimalPrice,publicSiteUrl,buildApiUrl,safeJsonLd,sitemap,xmlEscape} from '../src/app/core/seo-model.ts';
import {verifyArticleHtml} from '../scripts/verify-html.mjs';

const catalog = {name:'Negocio & café',currency:'KWD',currencyDecimals:3,categories:[{id:'a',name:'Ejemplos'}]};
const item = {id:'a',slug:'articulo',name:'Artículo "especial" & café',description:'Descripción <especial>',type:'PRODUCT',categoryIds:['a'],images:[{url:'/images/a.svg'}],available:true,variants:[{id:'a-m',name:'Mediana',priceMinor:123456,available:true,attributes:[]},{id:'a-l',name:'Grande',priceMinor:135000,available:false,attributes:[]}]};
const origin = 'https://lumio.example';
test('validates separate public origin and absolute build GraphQL endpoint', () => {
  assert.equal(publicSiteUrl(origin+'/'),origin);
  assert.equal(buildApiUrl('http://localhost:8080/graphql'),'http://localhost:8080/graphql');
  for (const invalid of ['ftp://example.com','https://user:pass@example.com','https://example.com/shop','https://example.com/?x=1','https://example.com/#x']) assert.throws(() => publicSiteUrl(invalid));
  assert.throws(() => buildApiUrl('/graphql'));
});
test('builds canonical, title, description and exact Product offers without inventing reviews', () => {
  const seo = articleSeo(item,catalog,origin);
  assert.equal(seo.title,item.name+' | '+catalog.name);
  assert.equal(seo.canonical,origin+'/catalogo/articulo/');
  assert.equal(seo.structured['@type'],'Product');
  assert.deepEqual(seo.structured.image,[origin+'/images/a.svg']);
  assert.equal(seo.structured.offers[0].price,'123.456');
  assert.equal(seo.structured.offers[1].availability,'https://schema.org/OutOfStock');
  assert.equal(articleSeo({...item,available:false},catalog,origin).structured.offers[0].availability,'https://schema.org/OutOfStock');
  assert.equal(seo.structured.aggregateRating,undefined);
  assert.equal(decimalPrice(2147483647,6),'2147.483647');
  assert.equal(decimalPrice(1,0),'1');
});
test('services use Service and provider, not Product or inferred categories', () => {
  const seo = articleSeo({...item,type:'SERVICE',images:[]},catalog,origin);
  assert.equal(seo.structured['@type'],'Service');
  assert.equal(seo.structured.provider.name,catalog.name);
  assert.equal(seo.structured.sku,undefined);
});
test('JSON-LD escapes script closing tags and sitemap excludes private order routes', () => {
  const malicious = {name:'</script><img src=x> & café'};
  const serialized = safeJsonLd(malicious);
  assert.equal(serialized.includes('</script>'),false);
  assert.deepEqual(JSON.parse(serialized),malicious);
  const xml = sitemap(origin,['articulo']);
  assert.ok(xml.includes(origin+'/catalogo/articulo/'));
  assert.equal(xml.includes('/pedido'),false);
});
test('HTML verification requires visible heading and actual SEO, rejecting loading shells or stale data', () => {
  const seo = articleSeo(item,catalog,origin);
  const html = `<title>${xmlEscape(seo.title)}</title><meta name="description" content="${xmlEscape(seo.description)}"><link rel="canonical" href="${seo.canonical}"><script id="lumio-structured-data" type="application/ld+json">${safeJsonLd(seo.structured)}</script><h1>${xmlEscape(item.name)}</h1><p>${xmlEscape(item.description)}</p><p>KWD 123.456</p>`;
  assert.doesNotThrow(() => verifyArticleHtml(html,item,catalog,origin));
  assert.throws(() => verifyArticleHtml(html.replace(/<h1>.*?<\/h1>/,'<p>Cargando…</p>'),item,catalog,origin));
  assert.throws(() => verifyArticleHtml(html,{...item,name:'Otra ficha'},catalog,origin));
  assert.throws(() => verifyArticleHtml(html.replace('123.456','999.999'),item,catalog,origin));
});

test('prerender verification uses the available starting price, keeping unavailable offers in structured data', () => {
  const priced = {...item, variants: [{...item.variants[0], available:false, priceMinor:1000}, {...item.variants[1], available:true, priceMinor:135000}]};
  const seo = articleSeo(priced,catalog,origin);
  const html = `<title>${xmlEscape(seo.title)}</title><meta name="description" content="${xmlEscape(seo.description)}"><link rel="canonical" href="${seo.canonical}"><script id="lumio-structured-data" type="application/ld+json">${safeJsonLd(seo.structured)}</script><h1>${xmlEscape(priced.name)}</h1><p>${xmlEscape(priced.description)}</p><p>KWD 135.000</p>`;
  assert.doesNotThrow(() => verifyArticleHtml(html,priced,catalog,origin));
  assert.throws(() => verifyArticleHtml(html.replace('<p>KWD 135.000</p>','<p>KWD 1.000</p>'),priced,catalog,origin));
  assert.equal(seo.structured.offers[0].availability,'https://schema.org/OutOfStock');
});
