import { Component, input, output } from '@angular/core';
import { UiIcon } from '../../../shared/ui/ui-icon';

@Component({
  selector:'app-catalog-load-more', standalone:true, imports:[UiIcon], host:{class:'block'},
  template:`<div class="flex flex-col items-center gap-4 pt-8 pb-2 text-center">
    <p class="text-sm text-muted tabular-nums" role="status" aria-live="polite" aria-atomic="true">{{count()}} artículos mostrados@if (loading()) { · Cargando más… }</p>
    @if (error()) { <p role="alert" class="max-w-prose text-sm text-unavailable-ink">{{error()}}</p> }
    @if (hasMore() || error()) {
      <button type="button" class="secondary-button min-w-48" [disabled]="loading()" aria-controls="catalog-items" (click)="load.emit($event)">
        <app-ui-icon name="plus" [size]="18" /> {{loading() ? 'Cargando…' : error() ? 'Reintentar' : 'Cargar más'}}
      </button>
    } @else { <p class="text-xs text-muted">Has visto todos los artículos de este listado.</p> }
  </div>`,
})
export class CatalogLoadMore {
  readonly count = input.required<number>();
  readonly hasMore = input.required<boolean>();
  readonly loading = input(false);
  readonly error = input('');
  readonly load = output<MouseEvent>();
}
