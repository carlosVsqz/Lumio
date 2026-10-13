import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogQuery, catalogQueryParameters, isCanonicalCatalogQuery } from '../src/app/features/catalog/data-access/catalog-query.ts';

test('restores search, category and page from a shareable URL', () => {
  const parameters = new URLSearchParams('q=Caf%C3%A9&category=products&page=3');
  const query = parseCatalogQuery(parameters);
  assert.deepEqual(query, { search: 'Café', categoryId: 'products', page: 3, sort: 'catalog', availableOnly: false, attributes:[] });
  assert.deepEqual(catalogQueryParameters(query), { q: 'Café', category: 'products', page: '3', sort: null, available: null, attributes:null });
  assert.equal(isCanonicalCatalogQuery(parameters, query), true);
});

test('canonicalizes malformed pages, blanks and oversized searches', () => {
  for (const page of ['0', '-1', '2.5', 'abc', 'Infinity', '2147483648', '']) {
    assert.equal(parseCatalogQuery(new URLSearchParams({ page })).page, 1);
  }
  const parameters = new URLSearchParams('q=%20hola%20&category=%20&page=001');
  const query = parseCatalogQuery(parameters);
  assert.deepEqual(query, { search: 'hola', categoryId: '', page: 1, sort: 'catalog', availableOnly: false, attributes:[] });
  assert.equal(isCanonicalCatalogQuery(parameters, query), false);
  assert.deepEqual(catalogQueryParameters(query), { q: 'hola', category: null, page: null, sort: null, available: null, attributes:null });
  assert.equal(parseCatalogQuery(new URLSearchParams({ q: 'a'.repeat(201) })).search.length, 200);
});

test('omits default filters and preserves literal special characters', () => {
  assert.equal(isCanonicalCatalogQuery(new URLSearchParams(), parseCatalogQuery(new URLSearchParams())), true);
  const query = { search: 'talla M & color azul', categoryId: 'ropa', page: 2, sort: 'catalog', availableOnly: false, attributes:[] };
  assert.deepEqual(parseCatalogQuery(new URLSearchParams(catalogQueryParameters(query))), query);
});

test('restores supported sort and availability, canonicalizing unsupported options', () => {
  const query=parseCatalogQuery(new URLSearchParams('sort=price-desc&available=1&page=2'));
  assert.equal(query.sort,'price-desc'); assert.equal(query.availableOnly,true);
  const parameters=catalogQueryParameters(query);
  assert.equal(parameters.sort,'price-desc'); assert.equal(parameters.available,'1');
  assert.deepEqual(parseCatalogQuery(new URLSearchParams(Object.entries(parameters).filter(([,value]) => value !== null))),query);
  const invalid=new URLSearchParams('sort=popular&available=true');
  const normalized=parseCatalogQuery(invalid);
  assert.equal(normalized.sort,'catalog'); assert.equal(normalized.availableOnly,false);
  assert.equal(isCanonicalCatalogQuery(invalid,normalized),false);
});

