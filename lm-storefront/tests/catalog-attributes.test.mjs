import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAttributeSelections,decodeAttributeSelections,encodeAttributeSelections,toggleAttributeSelection} from '../src/app/features/catalog/data-access/catalog-attributes.ts';
import {parseCatalogQuery,catalogQueryParameters,isCanonicalCatalogQuery} from '../src/app/features/catalog/data-access/catalog-query.ts';
import {sameCatalogFilters} from '../src/app/features/catalog/data-access/catalog-feed.ts';

test('multiple classification values preserve Unicode and special characters across a canonical URL',()=>{
  const filters=[{name:'Material',values:['Algodón & lino','Acero / 304']},{name:'Color',values:['Azul','Natural']}];
  const normalized=normalizeAttributeSelections(filters),parameters=new URLSearchParams({attributes:encodeAttributeSelections(filters),category:'ropa',page:'2'});
  const query=parseCatalogQuery(parameters);assert.deepEqual(query.attributes,normalized);assert.equal(isCanonicalCatalogQuery(parameters,query),true);
  assert.equal(catalogQueryParameters(query).attributes,encodeAttributeSelections(filters));
});
test('selection toggles do not duplicate values, merge groups or retain empty filters, including prototype names',()=>{
  let filters=toggleAttributeSelection([],'__proto__','constructor',true);
  filters=toggleAttributeSelection(filters,'__proto__','constructor',true);assert.deepEqual(filters,[{name:'__proto__',values:['constructor']}]);
  filters=toggleAttributeSelection(filters,'Talla','M',true);filters=toggleAttributeSelection(filters,'Talla','L',true);
  assert.deepEqual(filters.find(group=>group.name==='Talla').values,['L','M']);
  filters=toggleAttributeSelection(filters,'Talla','M',false);filters=toggleAttributeSelection(filters,'Talla','L',false);
  assert.equal(filters.some(group=>group.name==='Talla'),false);
  assert.deepEqual(normalizeAttributeSelections([{name:'Color',values:['Azul','Azul']},{name:'Color',values:['Natural']}]),[{name:'Color',values:['Azul','Natural']}]);
});
test('invalid or oversized attribute parameters cannot reach GraphQL and are canonicalized',()=>{
  for(const raw of ['{','null','[]','"color"','x'.repeat(8193),JSON.stringify([{name:'',values:['A']}]),JSON.stringify([{name:'Color',values:[]}]),JSON.stringify([{name:'Color',values:['a'.repeat(201)]}]),JSON.stringify(Array.from({length:17},(_,i)=>({name:'A'+i,values:['x']})))])assert.deepEqual(decodeAttributeSelections(raw),[]);
  const parameters=new URLSearchParams({attributes:'invalid'});assert.equal(isCanonicalCatalogQuery(parameters,parseCatalogQuery(parameters)),false);
});
test('load more restarts for different attribute selections and treats reordered values as the same filter context',()=>{
  const base={search:'',categoryId:'',sort:'catalog',availableOnly:false,attributes:[{name:'Color',values:['Azul','Natural']}]};
  assert.equal(sameCatalogFilters(base,{...base,attributes:[{name:'Color',values:['Natural','Azul']}]}),true);
  assert.equal(sameCatalogFilters(base,{...base,attributes:[{name:'Color',values:['Azul']}]}),false);
});
test('selection URL limits never erase the existing filters when another value would overflow',()=>{
  let filters=[];
  for(let i=0;i<32;i++){
    const next=toggleAttributeSelection(filters,'Material',String(i)+'á'.repeat(195),true);
    if(JSON.stringify(next)===JSON.stringify(filters)){assert.ok(filters.length);assert.deepEqual(decodeAttributeSelections(encodeAttributeSelections(filters)),filters);return;}
    filters=next;
  }
  assert.fail('Expected the URL length budget to reject an additional value.');
});
