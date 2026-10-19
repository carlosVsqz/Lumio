import type {CatalogAttributeFacet,CatalogImage,CatalogItem} from './catalog.models';
import {catalogQueryParameters} from './catalog-query.ts';
import {normalizeAttributeSelections} from './catalog-attributes.ts';

const collator=new Intl.Collator('es',{sensitivity:'base',numeric:true});
const normalized=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');

/** A single brand identifies the article even when it is sold out. */
export function singleItemBrand(item:CatalogItem,attributeName:string|undefined) {
  if(!attributeName)return null;
  const attributes=[...(item.attributes??[]),...item.variants.flatMap(variant=>variant.attributes)];
  const values=[...new Set(attributes.filter(attribute=>attribute.name===attributeName).map(attribute=>attribute.value))];
  if(values.length!==1 || !values[0])return null;
  // An absent brand on only some variants is still a choice ("No aplica").
  const brandedVariants=item.variants.filter(variant=>variant.attributes.some(attribute=>attribute.name===attributeName));
  if(brandedVariants.length && brandedVariants.length!==item.variants.length)return null;
  return {name:attributeName,value:values[0]};
}

function brandImage(image:CatalogImage|null|undefined):CatalogImage|null {
  if(!image || typeof image.url!=='string' || image.url!==image.url.trim() || /[\\\u0000-\u0020]/.test(image.url))return null;
  try {
    const url=new URL(image.url,'https://lumio.local');
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password
      || (!image.url.startsWith('http://') && !image.url.startsWith('https://') && !/^\/(?!\/)/.test(image.url)))return null;
    return {url:image.url,alt:typeof image.alt==='string'?image.alt:''};
  }catch{return null;}
}

export function brandLinks(facet:CatalogAttributeFacet|null|undefined,search='') {
  const seen=new Set<string>(),query=normalized(search.trim());
  return (facet?.values??[]).filter(option=>{
    if(!Number.isSafeInteger(option.count) || option.count<=0 || seen.has(option.value)
      || !normalizeAttributeSelections([{name:facet!.name,values:[option.value]}]).length)return false;
    seen.add(option.value);return normalized(option.value).includes(query);
  }).sort((a,b)=>collator.compare(a.value,b.value)).map(option=>({...option,image:brandImage(option.image),parameters:catalogQueryParameters({
    search:'',categoryId:'',page:1,sort:'catalog',availableOnly:false,attributes:[{name:facet!.name,values:[option.value]}],
  })}));
}
