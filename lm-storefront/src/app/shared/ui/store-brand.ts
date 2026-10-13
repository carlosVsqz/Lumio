import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandingStore } from '../../core/branding-store';

@Component({
  selector:'app-store-brand', standalone:true, imports:[RouterLink], host:{class:'block min-w-0'},
  template:`<a routerLink="/" class="inline-flex min-h-14 min-w-0 max-w-full items-center py-3" [attr.aria-label]="brand.name() + ', inicio'">
    @if (brand.logo() && failedLogo() !== brand.logo()) {
      <!-- impeccable-disable-next-line broken-image: Angular binds the real GraphQL logo; missing/error states render the business name. -->
      <img class="h-auto max-h-11 max-w-40 object-contain" [src]="brand.logo()" [alt]="brand.name()" (error)="imageFailed($event)">
    } @else {
      <span class="truncate text-2xl font-extrabold tracking-[-.03em] lg:text-3xl" [title]="brand.name()">{{brand.name()}}<span class="text-accent" aria-hidden="true">.</span></span>
    }
  </a>`,
})
export class StoreBrand {
  readonly brand=inject(BrandingStore);
  readonly failedLogo=signal('');
  imageFailed(event:Event) { this.failedLogo.set((event.target as HTMLImageElement).getAttribute('src') ?? ''); }
}
