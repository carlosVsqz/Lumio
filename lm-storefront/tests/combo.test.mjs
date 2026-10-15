import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCombo,comboStartingPrice} from '../src/app/features/catalog/detail/combo-selection.ts';
import {addLine,lineFromItem,lineKey,parseOrder,serializeOrder,reconcileOrder,composeMessage,whatsappDraft} from '../src/app/features/order/order-model.ts';
import {articleSeo} from '../src/app/core/seo-model.ts';
const option=(id,extra=0,stock=null)=>({id,variantId:'ref-'+id,name:id,attributes:[{name:'Talla',value:'M'}],extraPriceMinor:extra,available:stock!==0,maxQuantity:stock});
const variant={id:'combo-v',slug:'base',name:'Pack',priceMinor:10000,available:true,attributes:[]};
const item={id:'combo',slug:'combo',name:'Combo',description:'Configuración de prueba',categoryIds:[],images:[],type:'COMBO',available:true,variants:[variant],comboGroups:[{id:'prenda',name:'Prenda',options:[option('azul',500,3),option('rojo',-250,5),option('agotado',0,0)]},{id:'servicio',name:'Servicio',options:[option('asesoria')]}]};
const catalog={name:'Prueba',currency:'GTQ',currencyDecimals:2,categories:[],whatsappNumber:''};
const choices={prenda:'azul',servicio:'asesoria'};
const line=()=>lineFromItem(item,variant,1,choices);
const snapshot=(changed=item)=>({catalog:{...catalog,items:[changed]}});

test('combos require explicit choices in every group and reject unknown or unavailable components',()=>{
  for(const selection of [{},{prenda:'azul'},{...choices,extra:'unknown'},{...choices,prenda:'unknown'}]){
    assert.equal(evaluateCombo(item,variant,selection,1).complete,false);
    assert.throws(()=>lineFromItem(item,variant,1,selection));
  }
  assert.equal(evaluateCombo(item,variant,{...choices,prenda:'agotado'},1).available,false);
  assert.throws(()=>addLine({catalog:null,lines:[]},catalog,lineFromItem(item,variant,1,{...choices,prenda:'agotado'})));
  assert.equal(evaluateCombo(item,variant,choices,1).available,true);
  assert.equal(evaluateCombo(item,variant,choices,1.2).available,false);
  assert.equal(evaluateCombo(item,variant,choices,4).available,false);
});
test('exact base plus signed extras, starting price and SEO describe a configurable product',()=>{
  assert.equal(evaluateCombo(item,variant,choices,1).priceMinor,10500);
  assert.equal(evaluateCombo(item,variant,{...choices,prenda:'rojo'},1).priceMinor,9750);
  assert.equal(comboStartingPrice(item,10000),9750);
  const seo=articleSeo(item,catalog,'https://lumio.example');
  assert.equal(seo.structured['@type'],'Product');assert.equal(seo.structured.offers.lowPrice,'97.50');
  const overflow={...item,variants:[{...variant,priceMinor:2147483647}]};
  assert.equal(evaluateCombo(overflow,overflow.variants[0],choices,1).priceMinor,null);
});
test('stock is shared when the same concrete variant appears in several groups',()=>{
  const same={...item,comboGroups:[{id:'one',name:'Uno',options:[option('same',0,1)]},{id:'two',name:'Dos',options:[option('same',0,1)]}]};
  assert.equal(evaluateCombo(same,variant,{one:'same',two:'same'},1).available,false);
});
test('distinct configurations are distinct order lines and equal selections merge independent of group order',()=>{
  let order=addLine({catalog:null,lines:[]},catalog,line());
  const other=lineFromItem(item,variant,1,{...choices,prenda:'rojo'});
  order=addLine(order,catalog,other);assert.equal(order.lines.length,2);
  assert.notEqual(lineKey(order.lines[0]),lineKey(order.lines[1]));
  order=addLine(order,catalog,{...line(),components:line().components.toReversed()});
  assert.equal(order.lines[0].quantity,2);
  assert.throws(()=>addLine(order,catalog,{...line(),quantity:2}));
});
test('version two preserves validated components and version one ordinary orders still migrate',()=>{
  const order={catalog,lines:[line()]};
  assert.deepEqual(parseOrder(serializeOrder(order)).lines,order.lines);
  const ordinary={...line(),components:undefined};
  assert.equal(parseOrder(JSON.stringify({version:1,catalog,lines:[ordinary]})).lines.length,1);
  assert.equal(JSON.parse(serializeOrder({catalog,lines:[ordinary]})).version,2);
  const raw=JSON.parse(serializeOrder(order));
  for(const mutate of [x=>x.version=1,x=>x.lines[0].components[0].extraPriceMinor=1.1,x=>x.lines[0].components[0].maxQuantity=-1,x=>x.lines[0].components.push(x.lines[0].components[0])]){
    const copy=structuredClone(raw);mutate(copy);assert.throws(()=>parseOrder(JSON.stringify(copy)));
  }
});
test('revalidation updates prices and stock without replacing removed options or groups',()=>{
  const order={catalog,lines:[line()]};
  assert.deepEqual(reconcileOrder(order,snapshot()).changes,[]);
  const changed=structuredClone(item);changed.comboGroups[0].options[0].extraPriceMinor=700;
  const result=reconcileOrder(order,snapshot(changed));assert.equal(result.order.lines[0].priceMinor,10700);assert.ok(result.changes.length);
  changed.comboGroups[0].options[0].maxQuantity=0;changed.comboGroups[0].options[0].available=false;
  assert.ok(reconcileOrder(order,snapshot(changed)).blocked.length);
  changed.comboGroups[0].options.shift();
  const missing=reconcileOrder(order,snapshot(changed));assert.ok(missing.blocked.length);assert.equal(missing.order.lines[0].components[0].optionId,'azul');
});
test('revalidation accounts for component demand across configurations and ordinary products',()=>{
  const order={catalog,lines:[line(),{...line(),quantity:3,components:line().components.map(c=>({...c,optionId:c.optionId+'-old'}))}]};
  // Use a second actual configuration sharing the same stock reference.
  const changed=structuredClone(item);const second={...changed.comboGroups[0].options[0],id:'azul-2'};changed.comboGroups[0].options.push(second);
  order.lines[1]=lineFromItem(changed,variant,3,{...choices,prenda:'azul-2'});
  assert.throws(()=>addLine({catalog,lines:[line()]},catalog,order.lines[1]));
  const result=reconcileOrder(order,snapshot(changed));assert.equal(result.order.lines.every(l=>!l.available),true);assert.equal(result.blocked.length,2);
  const directVariant={...variant,id:'ref-azul',priceMinor:1500};
  const directItem={...item,type:'PRODUCT',id:'direct',slug:'direct',comboGroups:[],variants:[directVariant]};
  const direct=lineFromItem(directItem,directVariant,3);
  assert.throws(()=>addLine({catalog,lines:[line()]},catalog,direct));
  const shared=reconcileOrder({catalog,lines:[line(),direct]},{catalog:{...catalog,items:[item,directItem]}});
  assert.equal(shared.order.lines[0].available,false);assert.ok(shared.blocked.length);
});
test('WhatsApp preserves full configuration, signed extras and quantities with long-message fallback',()=>{
  const discounted=lineFromItem(item,variant,2,{...choices,prenda:'rojo'});
  const order={catalog,lines:[discounted]};const message=composeMessage(order);
  for(const expected of ['Prenda: rojo','opción rojo','referencia ref-rojo','cantidad: 2','Talla: M','-GTQ 2.50','GTQ 195.00'])assert.ok(message.includes(expected),expected);
  const draft=whatsappDraft(order,'1'.repeat(8));
  if(draft.url)assert.equal(new URL(draft.url).searchParams.get('text'),message);
  const long={...order,lines:[{...discounted,components:discounted.components.map(c=>({...c,name:c.name.repeat(2000)}))}]};
  const full=whatsappDraft(long,'1'.repeat(8));assert.equal(full.tooLong,true);assert.equal(full.url,null);assert.equal(full.message,composeMessage(long));
});
