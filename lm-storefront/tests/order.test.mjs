import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_STORAGE_KEY, MAX_ORDER_LINES, addLine, editQuantity, quantityFromText, subtotal, total,
  serializeOrder, parseOrder, readOrder, writeOrder, reconcileOrder, composeMessage, whatsappDraft, lineFromItem } from '../src/app/features/order/order-model.ts';
import { formatMinorPrice } from '../src/app/core/money.ts';

const catalog = { name: 'Negocio de pruebas & café', currency: 'GTQ', currencyDecimals: 2, whatsappNumber: '', categories: [] };
const variant = { id: 'shirt-m', slug: 'm', name: 'Mediana', priceMinor: 12500, available: true, attributes: [{ name: 'talla', value: 'M' }, { name: 'color', value: 'Azul & blanco' }] };
const item = { id: 'shirt', slug: 'camiseta', name: 'Camiseta café', available: true, variants: [variant] };
const line = lineFromItem(item, variant, 2);
const order = { catalog, lines: [line] };
const snapshot = { catalog: { ...catalog, items: [item] } };
// Synthetic fixture only: application destinations always come from the API configuration.
const testNumber = '1'.repeat(8);

test('quantity input rejects fractions, exponents, zero, negatives and unsafe integers', () => {
  assert.equal(quantityFromText('123'), 123);
  for (const text of ['', '0', '-1', '2.2', '1e3', ' 3 ', '9007199254740992']) assert.equal(quantityFromText(text), null);
  for (const quantity of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => editQuantity(order, line.variantId, quantity));
  assert.equal(editQuantity(order, line.variantId, 3).lines[0].quantity, 3);
  assert.throws(() => editQuantity(order, 'missing', 3));
  assert.equal(line.quantity, 2);
});
test('merges the same variant, rejects unavailable lines, mixed currencies, limits and accumulated overflow', () => {
  const merged = addLine(order, catalog, line);
  assert.equal(merged.lines.length, 1); assert.equal(merged.lines[0].quantity, 4);
  assert.throws(() => addLine(order, catalog, { ...line, available: false }));
  assert.throws(() => addLine(order, { ...catalog, currency: 'USD' }, line));
  assert.throws(() => addLine(order, { ...catalog, currencyDecimals: 3 }, line));
  assert.throws(() => addLine({ ...order, lines: [{ ...line, quantity: Number.MAX_SAFE_INTEGER }] }, catalog, line));
  const full = { catalog, lines: Array.from({length: MAX_ORDER_LINES}, (_, i) => ({ ...line, variantId: 'variant-' + i })) };
  assert.throws(() => addLine(full, catalog, line));
  assert.equal(addLine(full, catalog, { ...line, variantId:'variant-0' }).lines.length, MAX_ORDER_LINES);
});
test('subtotals and totals preserve integer minor units, zero prices and large amounts', () => {
  assert.equal(subtotal(line), 25000n);
  assert.equal(total([line, { ...line, priceMinor: 7500, quantity: 3 }, { ...line, priceMinor: 0 }]), 47500n);
  const huge = { ...line, priceMinor:2147483647, quantity:Number.MAX_SAFE_INTEGER };
  assert.equal(subtotal(huge), 2147483647n * BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(total([huge, huge]), 2n * subtotal(huge));
  assert.equal(formatMinorPrice(12345678901234567890n, 3, 'KWD'), 'KWD 12,345,678,901,234,567.890');
  assert.equal(total([]), 0n);
  assert.throws(() => subtotal({ ...line, quantity: 1.5 }));
});
test('persists and recovers only validated snapshots without phone numbers or prepared links', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(readOrder(storage), {catalog:null, lines:[]});
  writeOrder(storage, order);
  const recovered = readOrder(storage);
  assert.deepEqual(recovered.lines, order.lines);
  assert.deepEqual(recovered.catalog, {name:catalog.name,currency:'GTQ',currencyDecimals:2});
  assert.equal(values.has(ORDER_STORAGE_KEY), true);
  const raw = values.get(ORDER_STORAGE_KEY);
  // Serializer persists only the order catalog metadata, never a destination.
  assert.equal(JSON.parse(raw).catalog.whatsappNumber, undefined);
  assert.throws(() => readOrder({getItem: () => { throw new Error('blocked'); }}));
  assert.throws(() => writeOrder({setItem: () => { throw new Error('quota'); }}, order));
});
test('rejects malformed, unsupported, oversized and tampered recovered orders as a whole', () => {
  const stored = JSON.parse(serializeOrder(order));
  for (const change of [
    value => value.version = 3,
    value => value.catalog.currencyDecimals = 1.5,
    value => value.catalog.currency = 'invalid',
    value => value.catalog = null,
    value => value.lines[0].quantity = 0,
    value => value.lines[0].quantity = '2',
    value => value.lines[0].priceMinor = 1.5,
    value => value.lines[0].priceMinor = -1,
    value => value.lines[0].priceMinor = 2147483648,
    value => value.lines[0].available = 'true',
    value => value.lines[0].itemSlug = '../invalid',
    value => value.lines[0].attributes.push({...value.lines[0].attributes[0]}),
    value => value.lines.push({...value.lines[0]}),
  ]) {
    const copy = structuredClone(stored); change(copy); assert.throws(() => parseOrder(JSON.stringify(copy)));
  }
  for (const raw of ['{', 'null', '[]', 'x'.repeat(1_000_001)]) assert.throws(() => parseOrder(raw));
});
test('rechecks price and availability by stable item/variant references and requests review', () => {
  assert.deepEqual(reconcileOrder(order, snapshot).changes, []);
  const changedVariant = { ...variant, priceMinor: 13500, available: false };
  const result = reconcileOrder(order, {catalog:{...catalog,items:[{...item,variants:[changedVariant]}]}});
  assert.equal(result.order.lines[0].priceMinor, 13500);
  assert.equal(result.order.lines[0].available, false);
  assert.equal(result.changes.length, 2);
  assert.equal(result.blocked.length, 1);
  assert.match(result.changes[0], /GTQ 125.00.*GTQ 135.00/);
  assert.throws(() => composeMessage(result.order));
  const unavailableItem = reconcileOrder(order, {catalog:{...catalog,items:[{...item,available:false}]}});
  assert.equal(unavailableItem.blocked.length, 1);
  const missing = reconcileOrder(order, {catalog:{...catalog,items:[]}});
  assert.equal(missing.order.lines.length, 1); assert.equal(missing.blocked.length, 1);
});
test('reviews changed currency, attributes, names and missing variants without choosing replacements', () => {
  const result = reconcileOrder(order, {catalog:{...catalog,currency:'USD',currencyDecimals:3,name:'Otro negocio',items:[{...item, variants:[{...variant, attributes:[]}]}]}});
  assert.equal(result.changes.length, 3);
  assert.equal(result.order.catalog.currency, 'USD');
  const missing = reconcileOrder(order, {catalog:{...catalog,items:[{...item,variants:[{...variant,id:'new-variant'}]}]}});
  assert.equal(missing.order.lines[0].variantId, variant.id);
  assert.equal(missing.blocked.length, 1);
  const priceChanged = {catalog:{...catalog,items:[{...item,variants:[{...variant,priceMinor:13500}]}]}};
  const first = reconcileOrder(order, priceChanged);
  assert.equal(first.changes.length, 1);
  assert.equal(reconcileOrder(first.order, priceChanged).changes.length, 0);
});
test('composes complete business, references, attributes, quantities, prices and estimated totals', () => {
  const message = composeMessage(order);
  for (const content of [catalog.name,item.name,variant.name,'Referencia del artículo: shirt; variante: shirt-m', 'talla: M','color: Azul & blanco', 'Cantidad: 2','GTQ 125.00','subtotal: GTQ 250.00','Total estimado: GTQ 250.00','Sujeto a confirmación']) assert.ok(message.includes(content));
  const draft = whatsappDraft(order, testNumber);
  assert.equal(new URL(draft.url).searchParams.get('text'), message);
  assert.equal(new URL(draft.url).searchParams.size, 1);
  assert.equal(draft.chatUrl, 'https://wa.me/' + testNumber);
  assert.equal(whatsappDraft(order, '').url, null);
  assert.equal(whatsappDraft(order, '+invalid').chatUrl, null);
  assert.throws(() => composeMessage({catalog,lines:[]}));
});
test('long WhatsApp messages keep every line and provide only a plain chat fallback', () => {
  const long = {catalog,lines:Array.from({length:20}, (_, i) => ({...line,variantId:'variant-' + i,itemName:'Artículo con detalle '.repeat(20)}))};
  const draft = whatsappDraft(long, testNumber);
  assert.equal(draft.tooLong, true); assert.equal(draft.url, null);
  assert.equal(draft.chatUrl, 'https://wa.me/' + testNumber);
  assert.equal(draft.message, composeMessage(long));
  assert.ok(draft.message.includes('variante: variant-19'));
  assert.ok(draft.message.includes('Total estimado: GTQ 5,000.00'));
});
