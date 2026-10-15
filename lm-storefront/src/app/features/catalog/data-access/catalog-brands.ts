import type {CatalogAttributeFacet} from './catalog.models';
import {catalogQueryParameters} from './catalog-query.ts';
import {normalizeAttributeSelections} from './catalog-attributes.ts';

const collator=new Intl.Collator('es',{sensitivity:'base',numeric:true});
const normalized=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');

export function brandLinks(facet:CatalogAttributeFacet|null|undefined,search='') {
  const seen=new Set<string>(),query=normalized(search.trim());
  return (facet?.values??[]).filter(option=>{
    if(!Number.isSafeInteger(option.count) || option.count<=0 || seen.has(option.value)
      || !normalizeAttributeSelections([{name:facet!.name,values:[option.value]}]).length)return false;
    seen.add(option.value);return normalized(option.value).includes(query);
  }).sort((a,b)=>collator.compare(a.value,b.value)).map(option=>({...option,parameters:catalogQueryParameters({
    search:'',categoryId:'',page:1,sort:'catalog',availableOnly:false,attributes:[{name:facet!.name,values:[option.value]}],
  })}));
}
