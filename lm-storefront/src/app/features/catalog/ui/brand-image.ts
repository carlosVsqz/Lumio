import {Component,computed,input,signal} from '@angular/core';
import type {CatalogImage} from '../data-access/catalog.models';
import {UiIcon} from '../../../shared/ui/ui-icon';

@Component({selector:'app-brand-image',standalone:true,imports:[UiIcon],host:{class:'block'},template:`
  <span class="brand-menu-visual flex aspect-[2/1] items-center justify-center overflow-hidden rounded-xl px-5 py-3"
    [class.bg-white]="visibleImage() !== null" [class.bg-image]="visibleImage() === null">
    @if(visibleImage(); as photo) {
      <img [src]="photo.url" alt="" width="112" height="56" loading="lazy" decoding="async"
        class="brand-menu-image h-14 w-full max-w-28 object-contain" (error)="failedUrl.set(photo.url)">
    } @else {
      <span class="flex flex-col items-center gap-2 text-muted"><app-ui-icon name="image" [size]="24" /><span class="text-xs">Sin imagen</span></span>
    }
  </span>`})
export class BrandImage {
  readonly image=input<CatalogImage|null>(null);
  readonly failedUrl=signal('');
  readonly visibleImage=computed(()=>{const image=this.image();return image && image.url!==this.failedUrl()?image:null;});
}
