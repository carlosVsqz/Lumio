import type { CatalogItem, CatalogMetadata, CatalogVariant } from '../catalog/data-access/catalog.models';
import { formatMinorPrice } from '../../core/money.ts';
import { positiveQuantity, validQuantity } from '../../core/quantity.ts';
export { validQuantity } from '../../core/quantity.ts';

export const ORDER_STORAGE_KEY = 'lumio.order.v1';
export const MAX_ORDER_LINES = 100;
export const MAX_STORAGE_LENGTH = 1_000_000;
// Conservative application policy for links shared between browsers and WhatsApp clients.
export const MAX_WHATSAPP_URL_LENGTH = 2000;

export interface OrderCatalog { name: string; currency: string; currencyDecimals: number }
export interface OrderLine {
  itemId: string; itemSlug: string; itemName: string; variantId: string; variantName: string;
  attributes: { name: string; value: string }[]; priceMinor: number; available: boolean; quantity: number;
}
export interface LocalOrder { catalog: OrderCatalog | null; lines: OrderLine[] }
export interface OrderSnapshot { catalog: CatalogMetadata & { items: CatalogItem[] } }

export const quantityFromText = positiveQuantity;
export function subtotal(line: OrderLine): bigint {
  if (!validQuantity(line.quantity) || !Number.isInteger(line.priceMinor) || line.priceMinor < 0 || line.priceMinor > 2147483647) throw new Error('Invalid order amount.');
  return BigInt(line.priceMinor) * BigInt(line.quantity);
}
export function total(lines: OrderLine[]): bigint { return lines.reduce((sum, line) => sum + subtotal(line), 0n); }
export function sameCurrency(a: OrderCatalog, b: OrderCatalog): boolean {
  return a.currency === b.currency && a.currencyDecimals === b.currencyDecimals;
}
export function lineFromItem(item: CatalogItem, variant: CatalogVariant, quantity: number): OrderLine {
  return { itemId: item.id, itemSlug: item.slug, itemName: item.name, variantId: variant.id,
    variantName: variant.name, attributes: variant.attributes.map(attribute => ({ ...attribute })),
    priceMinor: variant.priceMinor, available: item.available && variant.available, quantity };
}
export function addLine(order: LocalOrder, catalog: OrderCatalog, line: OrderLine): LocalOrder {
  if (!validQuantity(line.quantity) || !line.available) throw new Error('La variante o la cantidad no está disponible.');
  if (order.catalog && order.lines.length && !sameCurrency(order.catalog, catalog)) throw new Error('La moneda cambió. Revisa el pedido antes de añadir artículos.');
  const previous = order.lines.find(entry => entry.variantId === line.variantId);
  if (previous && previous.itemId !== line.itemId) throw new Error('La referencia de la variante cambió. Revisa el pedido.');
  const quantity = line.quantity + (previous?.quantity ?? 0);
  if (!validQuantity(quantity)) throw new Error('La cantidad acumulada es demasiado grande.');
  if (!previous && order.lines.length >= MAX_ORDER_LINES) throw new Error(`El pedido admite hasta ${MAX_ORDER_LINES} líneas. Divide tu selección.`);
  const lines = previous ? order.lines.map(entry => entry === previous ? { ...line, quantity } : entry) : [...order.lines, line];
  return { catalog: { name: catalog.name, currency: catalog.currency, currencyDecimals: catalog.currencyDecimals }, lines };
}

export function editQuantity(order: LocalOrder, variantId: string, quantity: number): LocalOrder {
  if (!validQuantity(quantity) || !order.lines.some(line => line.variantId === variantId)) throw new Error('Invalid quantity or reference.');
  return { ...order, lines: order.lines.map(line => line.variantId === variantId ? { ...line, quantity } : line) };
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 10000; }
function id(value: unknown): value is string { return text(value) && /^[A-Za-z0-9_-]+$/.test(value); }
function attributes(value: unknown): value is OrderLine['attributes'] {
  return Array.isArray(value) && value.length <= 100 && value.every(attribute => record(attribute) && text(attribute['name']) && text(attribute['value']))
    && new Set(value.map(attribute => attribute.name)).size === value.length;
}
function validCatalog(value: unknown): value is OrderCatalog {
  return record(value) && text(value['name']) && typeof value['currency'] === 'string' && /^[A-Z]{3}$/.test(value['currency'])
    && typeof value['currencyDecimals'] === 'number' && Number.isInteger(value['currencyDecimals']) && value['currencyDecimals'] >= 0 && value['currencyDecimals'] <= 6;
}
function validLine(value: unknown): value is OrderLine {
  return record(value) && id(value['itemId']) && id(value['variantId']) && typeof value['itemSlug'] === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value['itemSlug'])
    && text(value['itemName']) && text(value['variantName']) && attributes(value['attributes'])
    && typeof value['quantity'] === 'number' && validQuantity(value['quantity']) && typeof value['available'] === 'boolean'
    && typeof value['priceMinor'] === 'number' && Number.isInteger(value['priceMinor']) && value['priceMinor'] >= 0 && value['priceMinor'] <= 2147483647;
}
export function parseOrder(raw: string | null): LocalOrder {
  if (raw === null) return { catalog: null, lines: [] };
  if (raw.length > MAX_STORAGE_LENGTH) throw new Error('Stored order too large.');
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value['version'] !== 1 || !Array.isArray(value['lines']) || value['lines'].length > MAX_ORDER_LINES
    || !value['lines'].every(validLine) || new Set(value['lines'].map(line => line.variantId)).size !== value['lines'].length
    || !(validCatalog(value['catalog']) || (value['catalog'] === null && value['lines'].length === 0))) throw new Error('Invalid stored order.');
  return {
    catalog: value['catalog'] === null ? null : { name: value['catalog'].name, currency: value['catalog'].currency, currencyDecimals: value['catalog'].currencyDecimals },
    lines: value['lines'].map(line => ({ itemId: line.itemId, itemSlug: line.itemSlug, itemName: line.itemName,
      variantId: line.variantId, variantName: line.variantName, attributes: line.attributes.map(attribute => ({ name: attribute.name, value: attribute.value })),
      priceMinor: line.priceMinor, available: line.available, quantity: line.quantity })),
  };
}
export function serializeOrder(order: LocalOrder): string {
  const raw = JSON.stringify({ version: 1, ...order });
  const validated = parseOrder(raw);
  return JSON.stringify({ version: 1, ...validated });
}
export function readOrder(storage: Pick<Storage, 'getItem'>): LocalOrder {
  return parseOrder(storage.getItem(ORDER_STORAGE_KEY));
}
export function writeOrder(storage: Pick<Storage, 'setItem'>, order: LocalOrder): void {
  storage.setItem(ORDER_STORAGE_KEY, serializeOrder(order));
}

function attributeSignature(attributes: OrderLine['attributes']) {
  return JSON.stringify(attributes.map(attribute => [attribute.name, attribute.value]).sort((a, b) => a[0].localeCompare(b[0])));
}
export function reconcileOrder(order: LocalOrder, snapshot: OrderSnapshot) {
  const catalog = snapshot.catalog;
  const changes: string[] = [];
  const blocked: string[] = [];
  const money = (price: number, metadata: OrderCatalog) => formatMinorPrice(price, metadata.currencyDecimals, metadata.currency);
  if (order.catalog && !sameCurrency(order.catalog, catalog)) changes.push(`La moneda cambió de ${order.catalog.currency} (${order.catalog.currencyDecimals} decimales) a ${catalog.currency} (${catalog.currencyDecimals} decimales).`);
  if (order.catalog && order.catalog.name !== catalog.name) changes.push(`El negocio ahora se llama ${catalog.name}.`);
  const lines = order.lines.map(previous => {
    const item = catalog.items.find(item => item.id === previous.itemId);
    const variant = item?.variants.find(variant => variant.id === previous.variantId);
    if (!item || !variant) {
      blocked.push(`${previous.itemName} · ${previous.variantName}: la referencia ya no existe. Elimina esta línea o elige otra variante.`);
      if (previous.available) changes.push(`${previous.itemName} · ${previous.variantName}: dejó de estar disponible.`);
      return { ...previous, available: false };
    }
    const current = lineFromItem(item, variant, previous.quantity);
    if (previous.priceMinor !== current.priceMinor) changes.push(`${item.name} · ${variant.name}: precio de ${money(previous.priceMinor, order.catalog ?? catalog)} a ${money(current.priceMinor, catalog)}.`);
    if (previous.available !== current.available) changes.push(`${item.name} · ${variant.name}: ${current.available ? 'ahora disponible' : 'ya no disponible'}.`);
    if (previous.itemName !== current.itemName || previous.variantName !== current.variantName || attributeSignature(previous.attributes) !== attributeSignature(current.attributes)) changes.push(`${item.name} · ${variant.name}: cambiaron el nombre o los atributos; revisa esta línea.`);
    if (!current.available) blocked.push(`${item.name} · ${variant.name}: no disponible. Elimina esta línea o elige otra variante.`);
    return current;
  });
  return { order: { catalog: { name: catalog.name, currency: catalog.currency, currencyDecimals: catalog.currencyDecimals }, lines }, changes, blocked };
}

export function composeMessage(order: LocalOrder): string {
  if (!order.catalog || !order.lines.length || order.lines.some(line => !line.available)) throw new Error('Order not ready.');
  const catalog = order.catalog;
  const money = (minor: bigint) => formatMinorPrice(minor, catalog.currencyDecimals, catalog.currency);
  return [`Hola, ${catalog.name}. Quisiera consultar este pedido:`, '', ...order.lines.map((line, index) => [
    `${index + 1}. ${line.itemName} — ${line.variantName}`,
    `Referencia del artículo: ${line.itemId}; variante: ${line.variantId}`,
    ...line.attributes.map(attribute => `${attribute.name}: ${attribute.value}`),
    `Cantidad: ${line.quantity}; precio unitario: ${money(BigInt(line.priceMinor))}; subtotal: ${money(subtotal(line))}`,
  ].join('\n')), '', `Total estimado: ${money(total(order.lines))}`, 'Sujeto a confirmación de precio y disponibilidad por el negocio.'].join('\n');
}
export function whatsappDraft(order: LocalOrder, number: string) {
  const message = composeMessage(order);
  const chatUrl = /^[1-9]\d{7,14}$/.test(number) ? `https://wa.me/${number}` : null;
  const encoded = encodeURIComponent(message);
  const url = chatUrl ? `${chatUrl}?text=${encoded}` : null;
  const tooLong = !!url && url.length > MAX_WHATSAPP_URL_LENGTH;
  return { message, chatUrl, url: tooLong ? null : url, tooLong };
}
