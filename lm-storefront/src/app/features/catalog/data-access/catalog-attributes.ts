export interface CatalogAttributeSelection { name:string; values:string[] }
export const MAX_ATTRIBUTE_FILTERS=16, MAX_ATTRIBUTE_VALUES=32;
export const MAX_ATTRIBUTE_URL_LENGTH=4000;
const validText=(value:unknown,max:number):value is string => typeof value==='string' && !!value.trim() && value===value.trim() && value.length<=max;

/** Canonical, bounded URL data; Maps keep arbitrary attribute names safe. */
export function normalizeAttributeSelections(input:unknown):CatalogAttributeSelection[] {
  if(!Array.isArray(input) || input.length>MAX_ATTRIBUTE_FILTERS)return [];
  const groups=new Map<string,Set<string>>();
  for(const entry of input){
    if(!entry || typeof entry!=='object' || !validText(entry.name,120) || !Array.isArray(entry.values)
      || !entry.values.length || entry.values.length>MAX_ATTRIBUTE_VALUES || entry.values.some((value:unknown)=>!validText(value,200)))return [];
    const values=groups.get(entry.name) ?? new Set<string>();
    for(const value of entry.values)values.add(value);
    if(values.size>MAX_ATTRIBUTE_VALUES)return [];
    groups.set(entry.name,values);
  }
  return [...groups].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,values])=>({name,values:[...values].sort()}));
}
export function decodeAttributeSelections(raw:string|null):CatalogAttributeSelection[] {
  if(!raw || raw.length>8192)return [];
  try{const filters=normalizeAttributeSelections(JSON.parse(raw));return attributeSelectionsFitUrl(filters)?filters:[];}catch{return [];}
}
export function attributeSelectionsFitUrl(filters:CatalogAttributeSelection[]):boolean {
  return encodeURIComponent(JSON.stringify(filters)).length<=MAX_ATTRIBUTE_URL_LENGTH;
}
export function encodeAttributeSelections(filters:CatalogAttributeSelection[]):string|null {
  const normalized=normalizeAttributeSelections(filters);
  return normalized.length?JSON.stringify(normalized):null;
}
export function toggleAttributeSelection(filters:CatalogAttributeSelection[],name:string,value:string,checked:boolean):CatalogAttributeSelection[] {
  const groups=normalizeAttributeSelections(filters),current=groups.find(group=>group.name===name);
  const values=new Set(current?.values ?? []);
  if(checked)values.add(value);else values.delete(value);
  const remaining=groups.filter(group=>group.name!==name);
  if(values.size)remaining.push({name,values:[...values]});
  const next=normalizeAttributeSelections(remaining);
  return checked && (!next.length || !attributeSelectionsFitUrl(next)) ? groups : next;
}
