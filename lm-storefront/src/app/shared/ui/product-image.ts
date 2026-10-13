import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, input, signal } from '@angular/core';
import { UiIcon } from './ui-icon';

@Component({
  selector: 'app-product-image', standalone: true, host: { class: 'block h-full w-full' },
  template: `
    <div class="flex h-full w-full items-center justify-center bg-image">
      @if (image(); as photo) {
        @if (!failed()) {
          <img class="h-full w-full object-contain" [src]="photo.url" [alt]="photo.alt" width="900" height="1100"
            [attr.loading]="priority() ? 'eager' : 'lazy'" [attr.fetchpriority]="priority() ? 'high' : 'auto'" (error)="failed.set(true)">
        } @else { <ng-container [ngTemplateOutlet]="placeholder" /> }
      } @else { <ng-container [ngTemplateOutlet]="placeholder" /> }
      <ng-template #placeholder>
        <div class="flex flex-col items-center gap-3 px-4 py-10 text-center text-muted" role="img" [attr.aria-label]="'Sin imagen de ' + label()">
          <app-ui-icon name="image" [size]="40" class="opacity-40" />
          <span class="text-xs">Imagen no disponible</span>
        </div>
      </ng-template>
    </div>`,
  imports: [NgTemplateOutlet, UiIcon],
})
export class ProductImage {
  readonly image = input<{ url: string; alt: string } | null>(null);
  readonly label = input('este artículo');
  readonly priority = input(false);
  readonly failed = signal(false);
  constructor() { effect(() => { this.image(); this.failed.set(false); }); }
}

