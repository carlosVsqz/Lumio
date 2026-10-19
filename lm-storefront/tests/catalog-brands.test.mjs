import {test} from 'node:test';import assert from 'node:assert/strict';
import {brandLinks,singleItemBrand} from '../src/app/features/catalog/data-access/catalog-brands.ts';
import {parseCatalogQuery} from '../src/app/features/catalog/data-access/catalog-query.ts';
import {toggleAttributeSelection} from '../src/app/features/catalog/data-access/catalog-attributes.ts';

test('a single real brand is independent of stock and variant creation',()=>{
  const brand={name:'Brand',value:'Apple'};
  const item={available:false,attributes:[brand],variants:[{available:false,attributes:[brand]}]};
  assert.deepEqual(singleItemBrand(item,'Brand'),brand);
  assert.deepEqual(singleItemBrand({...item,variants:[{attributes:[]}]},'Brand'),brand);
  assert.deepEqual(singleItemBrand({...item,attributes:[]},'Brand'),brand);
  assert.equal(singleItemBrand(item,undefined),null);
  assert.equal(singleItemBrand(item,'Marca'),null);
  assert.equal(singleItemBrand({...item,attributes:[brand,{name:'Brand',value:'Other'}]},'Brand'),null);
  assert.equal(singleItemBrand({...item,variants:[...item.variants,{attributes:[]}]},'Brand'),null);
});

test('brand navigation sorts real brands, counts products and encodes the same facet selection in a fresh URL',()=>{
  const facet={name:'Brand',values:[{value:'Zeta',count:2},{value:'Álamo',count:1},{value:'A & B / "Studio"',count:3}]};
  const links=brandLinks(facet);assert.deepEqual(links.map(link=>link.value),['A & B / "Studio"','Álamo','Zeta']);
  const params=new URLSearchParams(Object.entries(links[0].parameters).filter(([,value])=>value!==null));
  const query=parseCatalogQuery(params);assert.deepEqual(query.attributes,[{name:'Brand',values:['A & B / "Studio"']}]);
  assert.equal(query.page,1);assert.equal(query.categoryId,'');assert.equal(query.search,'');assert.equal(query.sort,'catalog');
  assert.deepEqual(toggleAttributeSelection(query.attributes,'Brand','Zeta',true),[{name:'Brand',values:['A & B / "Studio"','Zeta']}]);
});
test('brand lookup is local, accent insensitive and never includes duplicate, empty, invalid or zero-count brands',()=>{
  const facet={name:'Marca',values:[{value:'Álamo',count:2},{value:'Álamo',count:2},{value:'Otra',count:0},{value:'',count:1},{value:'Bad',count:-1}]};
  assert.equal(brandLinks(facet,'alamo').length,1);assert.equal(brandLinks(facet,'missing').length,0);
  assert.equal(brandLinks(facet).length,1);assert.deepEqual(brandLinks(null),[]);assert.deepEqual(brandLinks({name:'',values:facet.values}),[]);
});
test('brand images preserve real public URLs and reject unsafe sources without dropping the brand',()=>{
  for(const url of ['/catalog-media/attribute/33','https://example.test/logo.png']) {
    const links=brandLinks({name:'Marca',values:[{value:'Real',count:1,image:{url,alt:'Real'}}]});
    assert.deepEqual(links[0].image,{url,alt:'Real'});
  }
  for(const url of ['javascript:alert(1)','//example.test/logo.png','https://user:secret@example.test/logo.png','/\\example.test/logo.png',' /image.png','image.png','/image\n.png']) {
    const links=brandLinks({name:'Marca',values:[{value:'Real',count:1,image:{url,alt:'Real'}}]});
    assert.equal(links.length,1);assert.equal(links[0].image,null);
  }
  assert.equal(brandLinks({name:'Marca',values:[{value:'Real',count:1}]})[0].image,null);
});
