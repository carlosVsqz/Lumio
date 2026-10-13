import { Component, computed, inject, input, output } from '@angular/core';
import { WishlistStore } from './wishlist-store';
import { UiIcon } from '../../shared/ui/ui-icon';

@Component({
  selector: 'app-favorite-button', standalone: true, imports: [UiIcon],
  host: {class:'inline-flex shrink-0'},
  template: `<button type="button" class="favorite-button flex h-11 w-11 items-center justify-center rounded-full bg-surface p-0" [attr.aria-pressed]="selected()" [attr.aria-label]="selected() ? 'Quitar de favoritos' : 'Añadir a favoritos'" [attr.aria-describedby]="descriptionId() || null" [title]="selected() ? 'Quitar de favoritos' : 'Añadir a favoritos'" [disabled]="!store.ready() || store.catalogId() !== catalogId()" (click)="toggle($event)"><app-ui-icon name="heart" class="favorite-icon" [filled]="selected()" /></button>`,
})
export class FavoriteButton {
  readonly store = inject(WishlistStore);
  readonly itemId = input.required<string>();
  readonly catalogId = input.required<string>();
  readonly descriptionId = input('');
  readonly removed = output<void>();
  readonly selected = computed(() => this.store.catalogId() === this.catalogId() && this.store.has(this.itemId()));
  toggle(event: Event) {
    event.preventDefault(); event.stopPropagation();
    const wasSelected=this.selected(); this.store.toggle(this.itemId(),this.catalogId());
    if (wasSelected && !this.selected()) this.removed.emit();
  }
}
