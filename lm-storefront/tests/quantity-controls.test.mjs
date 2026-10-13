import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustQuantity } from '../src/app/core/quantity.ts';
import { activeCatalogCategory } from '../src/app/core/catalog-navigation.ts';

test('quantity buttons respect the minimum, safe integer boundary and incomplete inputs', () => {
  assert.equal(adjustQuantity('1', -1), null);
  assert.equal(adjustQuantity('1', 1), '2');
  assert.equal(adjustQuantity('2', -1), '1');
  assert.equal(adjustQuantity(String(Number.MAX_SAFE_INTEGER), 1), null);
  assert.equal(adjustQuantity(String(Number.MAX_SAFE_INTEGER - 1), 1), String(Number.MAX_SAFE_INTEGER));
  for (const value of ['', '1.5', '-1', '0', '1e2', '9007199254740992']) assert.equal(adjustQuantity(value, 1), null);
});

test('active category follows the catalog URL, without marking detail or order as catalog pages', () => {
  assert.equal(activeCatalogCategory('/?category=ropa&sort=price-asc'), 'ropa');
  assert.equal(activeCatalogCategory('/?category=capacidad%20especial&page=2'), 'capacidad especial');
  assert.equal(activeCatalogCategory('/?q=camiseta'), '');
  assert.equal(activeCatalogCategory('/catalogo/articulo?category=ropa'), null);
  assert.equal(activeCatalogCategory('/pedido'), null);
});
