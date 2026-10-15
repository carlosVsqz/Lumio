import { Component, computed, input, output } from '@angular/core';
import { CatalogAttributeFacet } from '../data-access/catalog.models';
import { CatalogQuery } from '../data-access/catalog-query';
import { CatalogSearch } from './catalog-search';
import { MAX_ATTRIBUTE_FILTERS, MAX_ATTRIBUTE_VALUES, toggleAttributeSelection } from '../data-access/catalog-attributes';
const brandOrder=new Intl.Collator('es',{sensitivity:'base',numeric:true});
@Component({ selector: 'app-catalog-filters', standalone: true, imports: [CatalogSearch], templateUrl: './catalog-filters.html', host: { class: 'block' } })
export class CatalogFilters {
  readonly query = input.required<CatalogQuery>();
  readonly facets=input<CatalogAttributeFacet[]>([]);
  readonly brandAttribute=input('');
  readonly facetGroups=computed(()=>{
    const brands=this.facets().filter(facet=>facet.name===this.brandAttribute()).map(facet=>({...facet,values:[...facet.values].sort((a,b)=>brandOrder.compare(a.value,b.value))})),others=this.facets().filter(facet=>facet.name!==this.brandAttribute());
    return [...(brands.length?[{title:'Marcas',brands:true,facets:brands}]:[]),...(others.length?[{title:'Características',brands:false,facets:others}]:[])];
  });
  readonly loading=input(false);
  readonly apply = output<Partial<CatalogQuery>>();
  selected(name:string,value:string) {return this.query().attributes.some(group=>group.name===name && group.values.includes(value));}
  disabled(name:string,value:string,count:number) {
    if(this.loading())return true;
    if(this.selected(name,value))return false;
    const group=this.query().attributes.find(group=>group.name===name);
    return count===0 || (group ? group.values.length>=MAX_ATTRIBUTE_VALUES : this.query().attributes.length>=MAX_ATTRIBUTE_FILTERS)
      || !toggleAttributeSelection(this.query().attributes,name,value,true).some(selection=>selection.name===name && selection.values.includes(value));
  }
  toggle(name:string,value:string,checked:boolean) {this.apply.emit({attributes:toggleAttributeSelection(this.query().attributes,name,value,checked)});}
}
