import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isItemAvailable, minimumItemPrice } from '../src/app/features/catalog/catalog-presentation.ts';

const variants = [
  { id: 'small', name: 'Small', attributes: [], priceMinor: 100, available: false },
  { id: 'medium', name: 'Medium', attributes: [{ name: 'size', value: 'M' }], priceMinor: 200, available: true },
];
const item = { id: 'shirt', name: 'Shirt', available: true, variants };

test('advertises only available variant prices and respects item availability', () => {
  assert.equal(isItemAvailable(item), true);
  assert.equal(minimumItemPrice(item), 200);
  const unavailable = { ...item, available: false };
  assert.equal(isItemAvailable(unavailable), false);
  assert.equal(minimumItemPrice(unavailable), 100);
  assert.equal(isItemAvailable({ ...item, variants: variants.slice(0, 1) }), false);
});

test('falls back to configured prices when no variant can be sold', () => {
  const soldOut = { ...item, variants: variants.map(variant => ({...variant, available:false})) };
  assert.equal(isItemAvailable(soldOut),false);
  assert.equal(minimumItemPrice(soldOut),100);
  assert.equal(minimumItemPrice({...soldOut, variants:[{...variants[0],priceMinor:0}]}),0);
});
