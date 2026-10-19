import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributeOptions, attributeChoiceState, resolveVariant, positiveQuantity, canAdd } from '../src/app/features/catalog/detail/variant-selection.ts';

const blue = { id: 'blue', attributes: [{ name: 'talla', value: 'M' }, { name: 'color', value: 'Azul' }], available: true };
const red = { id: 'red', attributes: [{ name: 'talla', value: 'L' }, { name: 'color', value: 'Rojo' }], available: false };
const item = { available: true, variants: [blue, red] };

test('a brand-only product resolves without a choice, preserving availability and order guards', () => {
  const brand = {name:'Brand',value:'Apple'};
  const variant = {id:'apple',attributes:[brand],available:true};
  const product = {available:true,attributes:[brand],variants:[variant]};
  assert.deepEqual(attributeOptions(product,'Brand'),[]);
  assert.equal(resolveVariant(product,{},'Brand'),variant);
  assert.equal(canAdd(product,resolveVariant(product,{},'Brand'),1),true);
  const soldOut = {...product,available:false,variants:[{...variant,available:false}]};
  assert.equal(resolveVariant(soldOut,{},'Brand'),soldOut.variants[0]);
  assert.equal(canAdd(soldOut,resolveVariant(soldOut,{},'Brand'),1),false);
  assert.equal(resolveVariant(product,{}),null);
});

test('a shared brand never replaces size or color choices, including sold-out combinations', () => {
  const brand = {name:'Brand',value:'Apple'};
  const product = {...item,attributes:[brand],variants:item.variants.map(variant=>({...variant,attributes:[brand,...variant.attributes]}))};
  assert.deepEqual(attributeOptions(product,'Brand').map(option=>option.name),['talla','color']);
  assert.equal(resolveVariant(product,{talla:'M'},'Brand'),null);
  assert.equal(resolveVariant(product,{talla:'M',color:'Azul'},'Brand'),product.variants[0]);
  assert.deepEqual(attributeChoiceState(product,{talla:'M'},'color','Rojo','Brand'),{exists:false,available:false});
  assert.equal(canAdd(product,resolveVariant(product,{talla:'L',color:'Rojo'},'Brand'),1),false);
});

test('multiple brands or an absent brand on some variants remain explicit choices', () => {
  const variant = {id:'apple',attributes:[{name:'Brand',value:'Apple'}],available:true};
  for (const attributes of [[{name:'Brand',value:'Other'}],[]]) {
    const product = {available:true,attributes:[],variants:[variant,{id:'other',attributes,available:true}]};
    assert.equal(attributeOptions(product,'Brand').length,1);
    assert.equal(resolveVariant(product,{},'Brand'),null);
    assert.equal(resolveVariant(product,{Brand:'Apple'},'Brand'),variant);
    assert.equal(resolveVariant(product,{Brand:attributes[0]?.value??''},'Brand'),product.variants[1]);
  }
});

test('requires every attribute even when a partial choice has only one match', () => {
  assert.equal(resolveVariant(item, {}), null);
  assert.equal(resolveVariant(item, { talla: 'M' }), null);
  assert.equal(resolveVariant(item, { talla: 'M', color: 'Azul' }), blue);
  assert.equal(resolveVariant(item, { talla: 'M', color: 'Rojo' }), null);
});
test('distinguishes unavailable variants and guards the add action', () => {
  assert.equal(resolveVariant(item, { talla: 'L', color: 'Rojo' }), red);
  assert.equal(canAdd(item, blue, 2), true);
  for (const variant of [red, null, { ...blue }]) assert.equal(canAdd(item, variant, 1), false);
  assert.equal(canAdd({ ...item, available: false }, blue, 1), false);
  for (const quantity of [null, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(canAdd(item, blue, quantity), false);
});
test('only accepts positive safe integer quantities without exponent or fraction syntax', () => {
  assert.equal(positiveQuantity('12'), 12);
  for (const value of ['', '0', '-1', '1.5', '1e2', ' 1', 'Infinity', '9007199254740992']) assert.equal(positiveQuantity(value), null);
});
test('handles services without attributes and variants with absent attributes explicitly', () => {
  const service = { available: true, variants: [{ id: 'session', attributes: [], available: true }] };
  assert.equal(resolveVariant(service, {}), service.variants[0]);
  const mixed = { variants: [blue, ...service.variants] };
  assert.deepEqual(attributeOptions(mixed).map(option => option.values), [['M', ''], ['Azul', '']]);
  assert.equal(resolveVariant(mixed, {}), null);
  assert.equal(resolveVariant(mixed, { talla: '', color: '' }), service.variants[0]);
});

test('generic attribute names do not inherit selections from Object.prototype', () => {
  const generic = { variants: [{ attributes: [{name:'toString', value:'A'}, {name:'__proto__', value:'B'}] }] };
  assert.equal(resolveVariant(generic, {}), null);
  assert.equal(resolveVariant(generic, {toString:'A', ['__proto__']:'B'}), generic.variants[0]);
});

test('disables sold-out values and impossible combinations without choosing attributes', () => {
  assert.deepEqual(attributeChoiceState(item,{},'talla','M'),{exists:true,available:true});
  assert.deepEqual(attributeChoiceState(item,{},'talla','L'),{exists:true,available:false});
  assert.deepEqual(attributeChoiceState(item,{talla:'M'},'color','Rojo'),{exists:false,available:false});
  assert.deepEqual(attributeChoiceState(item,{talla:'M'},'color','Azul'),{exists:true,available:true});
  assert.equal(resolveVariant(item,{talla:'M'}),null);
  assert.equal(attributeChoiceState({...item,available:false},{},'talla','M').available,false);
});

test('adapts arbitrary attributes, missing values and generic names without swatches', () => {
  const generic={available:true,variants:[{attributes:[{name:'capacidad',value:'256 GB'}],available:true},{attributes:[],available:true}]};
  assert.deepEqual(attributeChoiceState(generic,{},'capacidad',''),{exists:true,available:true});
  assert.equal(resolveVariant(generic,{}),null);
  assert.equal(resolveVariant(generic,{capacidad:'256 GB'}),generic.variants[0]);
});
