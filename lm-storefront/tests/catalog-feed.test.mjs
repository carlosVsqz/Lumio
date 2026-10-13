import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendCatalogPage,sameCatalogFilters} from '../src/app/features/catalog/data-access/catalog-feed.ts';
const page=(number,ids,total=5)=>({page:number,pageSize:2,totalCount:total,totalPages:Math.ceil(total/2),items:ids.map(id=>({id,name:id}))});
test('load more retains previous articles, appends in order and reaches the final batch',()=>{
  const first=appendCatalogPage(null,page(1,['a','b']),1),second=appendCatalogPage(first,page(2,['c','d']),2),last=appendCatalogPage(second,page(3,['e']),3);
  assert.deepEqual(last.items.map(item=>item.id),['a','b','c','d','e']);assert.equal(last.page,last.totalPages);assert.deepEqual(first.items.map(item=>item.id),['a','b']);
});
test('overlapping backend pages refresh repeated IDs without duplicating or moving cards',()=>{
  const first=appendCatalogPage(null,page(1,['a','b']),1),next=page(2,['b','c']);next.items[0].name='Actualizado';
  const combined=appendCatalogPage(first,next,2);assert.deepEqual(combined.items.map(item=>item.id),['a','b','c']);assert.equal(combined.items[1].name,'Actualizado');assert.equal(first.items[1].name,'b');
});
test('filter resets and empty results start a new list; filters are independent contexts',()=>{
  const original={search:'',categoryId:'',sort:'catalog',availableOnly:false};assert.equal(sameCatalogFilters(original,{...original,page:2}),true);
  for(const changed of [{search:'camiseta'},{categoryId:'ropa'},{sort:'price-asc'},{availableOnly:true}])assert.equal(sameCatalogFilters(original,{...original,...changed}),false);
  assert.deepEqual(appendCatalogPage(null,page(1,[],0),1).items,[]);assert.deepEqual(appendCatalogPage(null,page(1,['new']),1).items.map(item=>item.id),['new']);
});
test('malformed, skipped or incompatible pages cannot corrupt previously loaded articles',()=>{
  const first=appendCatalogPage(null,page(1,['a','b']),1);
  for(const invalid of [page(3,['e']),{...page(2,['c']),pageSize:3},{...page(2,['c']),totalPages:99},page(2,['c','c']),{...page(2,['c']),totalCount:-1}])assert.throws(()=>appendCatalogPage(first,invalid,invalid.page));
  assert.throws(()=>appendCatalogPage(first,page(2,['c']),3));assert.deepEqual(first.items.map(item=>item.id),['a','b']);
});
