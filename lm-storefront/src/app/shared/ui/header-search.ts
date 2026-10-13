import { Component } from '@angular/core';
import { CatalogSearch } from '../../features/catalog/ui/catalog-search';

@Component({selector:'app-header-search',standalone:true,imports:[CatalogSearch],host:{class:'block min-w-0'},
  template:`<app-catalog-search inputId="header-search" label="Buscar artículos" />`})
export class HeaderSearch {}
