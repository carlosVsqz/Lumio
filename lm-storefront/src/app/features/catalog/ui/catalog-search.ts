import { Component, inject, input } from '@angular/core';
import { UiIcon } from '../../../shared/ui/ui-icon';
import { CatalogSearchState } from '../data-access/catalog-search-state';
import { MAX_SEARCH_LENGTH } from '../data-access/catalog-query';

@Component({
  selector: 'app-catalog-search', standalone: true, imports: [UiIcon], host: { class: 'block min-w-0' },
  template: `
    <form role="search" [attr.aria-label]="label()" (submit)="submit($event)">
      <label [for]="inputId()" [class.sr-only]="!showLabel()" [class.mb-3]="showLabel()" class="block text-sm font-semibold">{{ label() }}</label>
      <div class="catalog-search-field">
        <button type="submit" class="catalog-search-submit" aria-label="Buscar">
          <app-ui-icon name="search" class="catalog-search-icon" />
        </button>
        <input [id]="inputId()" name="q" type="search" [maxLength]="maxSearchLength" placeholder="Buscar" autocomplete="off"
          class="catalog-search-input" [value]="state.text()" (input)="state.text.set($any($event.target).value)">
      </div>
    </form>`,
})
export class CatalogSearch {
  readonly inputId = input.required<string>();
  readonly label = input.required<string>();
  readonly showLabel = input(false);
  readonly maxSearchLength = MAX_SEARCH_LENGTH;
  readonly state = inject(CatalogSearchState);
  submit(event: Event) { event.preventDefault(); void this.state.submit(); }
}
