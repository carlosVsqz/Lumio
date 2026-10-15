import type { CatalogItem, CatalogVariant } from '../data-access/catalog.models';
import { validQuantity } from '../../../core/quantity.ts';

export type ComboChoices = Record<string,string>;
export interface OrderComponent {
  groupId:string; groupName:string; optionId:string; variantId:string; name:string;
  attributes:{name:string;value:string}[]; extraPriceMinor:number; available:boolean; maxQuantity:number|null;
}
export function comboSelections(components: readonly OrderComponent[] = []): ComboChoices {
  return Object.fromEntries(components.map(component => [component.groupId,component.optionId]));
}
export function componentStockAvailable(components: readonly OrderComponent[], quantity:number): boolean {
  if (!validQuantity(quantity)) return false;
  const quantities=new Map<string,bigint>();
  for(const component of components) quantities.set(component.variantId,(quantities.get(component.variantId)??0n)+BigInt(quantity));
  return components.every(component => component.available && (component.maxQuantity===null
    || (Number.isInteger(component.maxQuantity) && component.maxQuantity>=0 && quantities.get(component.variantId)!<=BigInt(component.maxQuantity))));
}
export function evaluateCombo(item:CatalogItem, variant:CatalogVariant|null, choices:ComboChoices, quantity:number|null) {
  const components:OrderComponent[]=[];
  const groups=item.comboGroups??[];
  let complete=item.type!=='COMBO' || groups.length>0 && Object.keys(choices).length===groups.length;
  if(item.type==='COMBO') for(const group of groups) {
    const option=Object.hasOwn(choices,group.id)?group.options.find(option => option.id===choices[group.id]):undefined;
    if(!option){complete=false;continue;}
    components.push({groupId:group.id,groupName:group.name,optionId:option.id,variantId:option.variantId,name:option.name,
      attributes:option.attributes.map(attribute=>({...attribute})),extraPriceMinor:option.extraPriceMinor,available:option.available,maxQuantity:option.maxQuantity});
  }
  let priceMinor:number|null=null;
  if(complete && variant && components.every(c=>Number.isInteger(c.extraPriceMinor))) {
    const price=components.reduce((sum,c)=>sum+BigInt(c.extraPriceMinor),BigInt(variant.priceMinor));
    if(price>=0n && price<=2147483647n)priceMinor=Number(price);
  }
  const available=complete && priceMinor!==null && !!variant?.available && item.available && quantity!==null && validQuantity(quantity)
    && componentStockAvailable(components,quantity);
  return {complete,available,priceMinor,components};
}
export function comboStartingPrice(item:CatalogItem, basePrice:number):number {
  if(item.type!=='COMBO')return basePrice;
  const minimum=(item.comboGroups??[]).reduce((sum,group)=>{
    const available=group.options.filter(option=>option.available),options=available.length?available:group.options;
    return sum+(options.length?BigInt(Math.min(...options.map(option=>option.extraPriceMinor))):0n);
  },BigInt(basePrice));
  if(minimum<0n || minimum>2147483647n)throw new Error('El precio del combo no puede representarse.');
  return Number(minimum);
}
