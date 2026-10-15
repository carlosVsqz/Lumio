import {test} from 'node:test';
import assert from 'node:assert/strict';
import {articleSeo,catalogSeo,decimalPrice,publicSiteUrl,buildApiUrl,publicImageUrl,safeJsonLd,sitemap,xmlEscape} from '../src/app/core/seo-model.ts';
import {verifyArticleHtml,verifyCatalogHtml} from '../scripts/verify-html.mjs';
import {parseCatalogQuery} from '../src/app/features/catalog/data-access/catalog-query.ts';

const catalog = {name:'Negocio & café',currency:'KWD',currencyDecimals:3,categories:[{id:'a',name:'Ejemplos'}]};
const item = {id:'a',slug:'articulo',name:'Artículo "especial" & café',description:'Descripción <especial>',type:'PRODUCT',categoryIds:['a'],images:[{url:'/images/a.svg'}],available:true,variants:[{id:'a-m',name:'Mediana',priceMinor:123456,available:true,attributes:[]},{id:'a-l',name:'Grande',priceMinor:135000,available:false,attributes:[]}]};
const origin = 'https://lumio.example';
const node=(seo,type)=>seo.structured['@graph'].find(node=>node['@type']===type);
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
  assert.deepEqual(node(seo,'Product').image,[origin+'/images/a.svg']);
  assert.equal(node(seo,'Product').offers[0].price,'123.456');
  assert.equal(node(seo,'Product').offers[1].availability,'https://schema.org/OutOfStock');
  assert.equal(node(articleSeo({...item,available:false},catalog,origin),'Product').offers[0].availability,'https://schema.org/OutOfStock');
  assert.equal(node(seo,'Product').aggregateRating,undefined);
  assert.equal(decimalPrice(2147483647,6),'2147.483647');
  assert.equal(decimalPrice(1,0),'1');
});
test('services use Service and provider, not Product or inferred categories', () => {
  const seo = articleSeo({...item,type:'SERVICE',images:[]},catalog,origin);
  assert.equal(node(seo,'Service').provider['@id'],node(seo,'Organization')['@id']);
  assert.equal(node(seo,'Organization').name,catalog.name);
  assert.equal(node(seo,'Service').sku,undefined);
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
  assert.equal(node(seo,'Product').offers[0].availability,'https://schema.org/OutOfStock');
});

test('links business, website, page and visible breadcrumbs with stable public identities',()=>{
  const branded={...catalog,description:'Negocio real',branding:{logoUrl:'/catalog-media/logo/1'},whatsappNumber:'12345678901'};
  const seo=articleSeo(item,branded,origin),business=node(seo,'Organization'),website=node(seo,'WebSite'),page=node(seo,'WebPage');
  assert.equal(business.logo,origin+'/catalog-media/logo/1');assert.equal(business.contactPoint.url,'https://wa.me/12345678901');
  assert.equal(business.telephone,undefined);assert.equal(business.address,undefined);assert.equal(business.legalName,undefined);
  assert.equal(website.publisher['@id'],business['@id']);assert.equal(page.isPartOf['@id'],website['@id']);
  assert.equal(page.mainEntity['@id'],node(seo,'Product')['@id']);
  assert.deepEqual(node(seo,'BreadcrumbList').itemListElement.map(crumb=>[crumb.position,crumb.name,crumb.item]),[[1,'Catálogo',origin+'/'],[2,item.name,seo.canonical]]);
  assert.equal(node(articleSeo(item,catalog,origin),'Organization').contactPoint,undefined);
  assert.equal(node(articleSeo(item,catalog,origin),'Product').brand,undefined);
});

test('product brand comes from the configured real attribute, keeping seller and brand independent',()=>{
  const metadata={...catalog,brandFacet:{name:'Manufacturer',values:[{value:'Real',count:1,image:{url:'/logos/real.png'}}]}};
  const product=node(articleSeo({...item,attributes:[{name:'Manufacturer',value:'Real'},{name:'Material',value:'Cotton'}]},metadata,origin),'Product');
  assert.deepEqual(product.brand,[{'@type':'Brand',name:'Real',logo:origin+'/logos/real.png'}]);
  assert.equal(product.offers[0].seller['@id'],origin+'/#organization');
  assert.equal(product.additionalProperty[1].value,'Cotton');
  for(const url of ['javascript:alert(1)','//example.com/image.png','https://user:secret@example.com/logo.png','/\\example.com/image.png'])assert.equal(publicImageUrl(url,origin),null);
});

test('collection describes only the visible accumulated products and updates its query identity',()=>{
  const query=parseCatalogQuery(new URLSearchParams('q=café&category=a&page=2&sort=price-asc'));
  const page={items:[item,{...item,id:'b',slug:'segundo',name:'Segundo'}],totalCount:100,page:2};
  const seo=catalogSeo(catalog,page,query,origin),collection=node(seo,'CollectionPage'),list=node(seo,'ItemList');
  assert.equal(seo.canonical,origin+'/');assert.equal(seo.title,'Buscar: café | '+catalog.name);
  assert.equal(new URL(collection.url).searchParams.get('q'),'café');assert.equal(collection.mainEntity['@id'],list['@id']);
  assert.equal(list.numberOfItems,2);assert.deepEqual(list.itemListElement.map(item=>item.position),[1,2]);
  assert.equal(list.itemListElement[1].url,origin+'/catalogo/segundo/');
  assert.equal(node(seo,'Product'),undefined);assert.equal(node(seo,'Service'),undefined);
  assert.equal(node(catalogSeo(catalog,null,query,origin),'ItemList'),undefined);
  assert.deepEqual(node(catalogSeo(catalog,{...page,items:[]},query,origin),'ItemList').itemListElement,[]);
});

test('listing build verification rejects non-visible products, corrupt JSON and duplicate schema scripts',()=>{
  const metadata={...catalog,items:[item]},query=parseCatalogQuery(new URLSearchParams());
  const seo=catalogSeo(metadata,{items:[item]},query,origin);
  const script=`<script id="lumio-structured-data" type="application/ld+json">${safeJsonLd(seo.structured)}</script>`;
  const html=script+`<app-catalog-card><h2>${xmlEscape(item.name)}</h2><p>KWD 123.456</p></app-catalog-card>`;
  assert.doesNotThrow(()=>verifyCatalogHtml(html,metadata,origin));
  assert.throws(()=>verifyCatalogHtml(script,metadata,origin));
  assert.throws(()=>verifyCatalogHtml(html+script,metadata,origin));
  assert.throws(()=>verifyCatalogHtml(html.replace('"@graph"','"invalid"'),metadata,origin));
});
