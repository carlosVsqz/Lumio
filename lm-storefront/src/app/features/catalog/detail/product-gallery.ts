import { Component, ElementRef, PLATFORM_ID, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProductImage } from '../../../shared/ui/product-image';
import { UiIcon } from '../../../shared/ui/ui-icon';

@Component({
  selector: 'app-product-gallery', standalone: true, imports: [ProductImage, UiIcon], host: { class: 'block min-w-0' },
  template: `
    <section aria-label="Galería de imágenes">
      <div #rail class="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain lg:grid lg:snap-none lg:grid-cols-2 lg:gap-3" (scroll)="onScroll()" tabindex="0" aria-label="Imágenes del artículo; desliza para ver más" (keydown.arrowright)="step(1,$event)" (keydown.arrowleft)="step(-1,$event)">
        @for (photo of photos(); track $index) {
          <div class="w-full shrink-0 snap-center overflow-hidden lg:w-auto" [class.aspect-[4/5]]="!!photo" [class.aspect-square]="!photo" [class.lg:aspect-[4/3]]="!photo" [class.lg:col-span-2]="photos().length === 1">
            <app-product-image [image]="photo" [label]="name()" [priority]="$first" />
          </div>
        }
      </div>
      @if (photos().length > 1) {
        <div class="mt-4 flex items-center justify-between gap-4 lg:hidden">
          <button type="button" class="flex items-center justify-center px-2" aria-label="Imagen anterior" [disabled]="index() <= 0" (click)="step(-1)"><app-ui-icon name="left" /></button>
          <div class="flex flex-wrap items-center justify-center gap-1" aria-label="Elegir imagen">
            @for (photo of photos(); track $index) { <button type="button" class="flex h-11 w-11 items-center justify-center p-0" [attr.aria-label]="'Ver imagen ' + ($index + 1)" [attr.aria-pressed]="index() === $index" (click)="go($index)"><span class="h-1.5 w-1.5 rounded-full" [class.bg-input-border]="index() !== $index" [class.bg-ink]="index() === $index"></span></button> }
          </div>
          <button type="button" class="flex items-center justify-center px-2" aria-label="Imagen siguiente" [disabled]="index() >= photos().length - 1" (click)="step(1)"><app-ui-icon name="right" /></button>
        </div>
        <p class="sr-only" role="status">Imagen {{ index() + 1 }} de {{ photos().length }}</p>
      }
    </section>`,
})
export class ProductGallery {
  readonly images = input<{url:string;alt:string}[]>([]);
  readonly name = input.required<string>();
  readonly photos = computed(() => this.images().length ? this.images() : [null]);
  readonly index = signal(0);
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  constructor() { effect(() => { this.images(); this.index.set(0); if (this.browser) this.rail()?.nativeElement.scrollTo({left:0}); }); }
  onScroll() {
    const rail=this.rail()?.nativeElement;
    if (!rail || !rail.scrollWidth || rail.scrollWidth <= rail.clientWidth) return;
    const first = (rail.children[0] as HTMLElement).offsetLeft;
    const distances = Array.from(rail.children, child => Math.abs((child as HTMLElement).offsetLeft - first - rail.scrollLeft));
    this.index.set(distances.indexOf(Math.min(...distances)));
  }
  go(index:number) {
    const rail = this.rail()?.nativeElement, photo = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !photo || !this.browser) return;
    this.index.set(index);
    rail.scrollTo({ left: photo.offsetLeft - (rail.children[0] as HTMLElement).offsetLeft, behavior: 'auto' });
  }
  step(delta:number,event?:Event) { event?.preventDefault(); this.go(Math.max(0,Math.min(this.photos().length-1,this.index()+delta))); }
}
