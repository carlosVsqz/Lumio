import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinorPrice } from '../src/app/core/money.ts';

test('formats explicit currency decimals without fractional arithmetic', () => {
  assert.equal(formatMinorPrice(12500, 2, 'GTQ'), 'GTQ 125.00');
  assert.equal(formatMinorPrice(12500, 0, 'JPY'), 'JPY 12,500');
  assert.equal(formatMinorPrice(123456, 3, 'KWD'), 'KWD 123.456');
  assert.equal(formatMinorPrice(1, 3, 'KWD'), 'KWD 0.001');
  assert.equal(formatMinorPrice(0, 2, 'GTQ'), 'GTQ 0.00');
});

test('preserves all digits at the GraphQL Int limit and with six decimals', () => {
  assert.equal(formatMinorPrice(2147483647, 2, 'GTQ'), 'GTQ 21,474,836.47');
  assert.equal(formatMinorPrice(2147483647, 6, 'GTQ'), 'GTQ 2,147.483647');
});

test('rejects fractional, negative and unsafe prices or invalid decimal counts', () => {
  for (const price of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatMinorPrice(price, 2, 'GTQ'));
  }
  for (const decimals of [-1, 1.5, 7]) {
    assert.throws(() => formatMinorPrice(12500, decimals, 'GTQ'));
  }
});
