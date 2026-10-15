import { Component, DestroyRef, ElementRef, Injector, PLATFORM_ID, afterNextRender, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {Dialog,DialogModule,DialogRef} from '@angular/cdk/dialog';
import type {ProductImageZoom,ImageZoomData} from './product-image-zoom';
import {uniqueImages} from './gallery-model';
import { ProductImage } from '../../../shared/ui/product-image';
import { UiIcon } from '../../../shared/ui/ui-icon';

@Component({
  selector: 'app-product-gallery', standalone: true, imports: [ProductImage, UiIcon,DialogModule], host: { class: 'block min-w-0' },
  template: `
    <section aria-label="Galería de imágenes">
      <div #rail class="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain" (scroll)="onScroll()" tabindex="0" aria-label="Imágenes del artículo; desliza o usa las flechas para ver más" (keydown.arrowright)="step(1,$event)" (keydown.arrowleft)="step(-1,$event)">
        @for (photo of photos(); track $index) {
          <div class="aspect-[4/5] w-full shrink-0 snap-center overflow-hidden lg:aspect-square lg:max-h-[78dvh]" [attr.inert]="index() !== $index ? '' : null" [attr.aria-hidden]="index() !== $index">
            <button type="button" class="relative block h-full w-full p-0 font-normal enabled:cursor-zoom-in focus-visible:-outline-offset-4" [disabled]="!photo || openingZoom()" [attr.aria-label]="'Ampliar imagen ' + ($index + 1) + ' de ' + name()" (click)="openZoom($index)">
              <app-product-image [image]="photo" [label]="name()" [priority]="$first" />
              @if (photo) { <span class="absolute right-4 bottom-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink"><app-ui-icon name="plus" [size]="18" />Ampliar</span> }
            </button>
          </div>
        }
      </div>
      @if (photos().length > 1) {
        <div class="mt-4 flex items-center justify-between gap-2">
          <button type="button" class="flex items-center justify-center px-2" aria-label="Imagen anterior" [disabled]="index() <= 0" (click)="step(-1)"><app-ui-icon name="left" /></button>
          <div class="flex min-w-0 gap-2 overflow-x-auto py-1" aria-label="Elegir imagen">
            @for (photo of photos(); track $index) { <button type="button" class="h-20 w-16 shrink-0 border-2 p-0" [class.border-ink]="index() === $index" [attr.aria-label]="'Ver imagen ' + ($index + 1)" [attr.aria-pressed]="index() === $index" (click)="go($index)"><app-product-image [image]="photo" [label]="name()" /></button> }
          </div>
          <button type="button" class="flex items-center justify-center px-2" aria-label="Imagen siguiente" [disabled]="index() >= photos().length - 1" (click)="step(1)"><app-ui-icon name="right" /></button>
        </div>
        <p class="sr-only" role="status">Imagen {{ index() + 1 }} de {{ photos().length }}</p>
      }
      @if (zoomError()) { <p role="status" class="mt-3 text-sm text-muted">No se pudo abrir la imagen ampliada. Inténtalo de nuevo.</p> }
    </section>`,
})
export class ProductGallery {
  readonly images = input<{url:string;alt:string}[]>([]);
  readonly name = input.required<string>();
  readonly photos = computed(() => this.images().length ? uniqueImages(this.images()) : [null]);
  readonly index = signal(0);
  readonly openingZoom = signal(false);
  readonly zoomError = signal(false);
  private readonly dialog=inject(Dialog);
  private readonly injector=inject(Injector);
  private readonly destroy=inject(DestroyRef);
  private zoom?:DialogRef<void,ProductImageZoom>;
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  constructor() {
    effect(() => { this.images(); this.index.set(0);this.zoom?.close();this.zoomError.set(false);if (this.browser) this.rail()?.nativeElement.scrollTo({left:0}); });
    this.destroy.onDestroy(()=>this.zoom?.close());
  }
  async openZoom(index:number) {
    if(!this.browser || this.openingZoom() || this.zoom || !this.photos()[index])return;
    const photos=this.photos();this.openingZoom.set(true);this.zoomError.set(false);
    try {
      const {ProductImageZoom}=await import('./product-image-zoom');
      if(this.destroy.destroyed || photos!==this.photos())return;
      const ref=this.dialog.open<void,ImageZoomData,ProductImageZoom>(ProductImageZoom,{
        data:{images:photos.filter(photo=>photo!==null),name:this.name(),index,select:next=>this.go(next)},
        width:'1200px',height:'min(900px, calc(100dvh - 1rem))',maxWidth:'calc(100vw - 1rem)',maxHeight:'calc(100dvh - 1rem)',
        panelClass:'quick-view-overlay',backdropClass:['cdk-overlay-dark-backdrop','quick-view-backdrop'],
        ariaLabel:'Imágenes ampliadas de ' + this.name(),autoFocus:'.gallery-zoom-close',restoreFocus:true,
      });
      this.zoom=ref;ref.closed.subscribe(()=>{
        if(this.zoom===ref)this.zoom=undefined;
        if(!this.destroy.destroyed)afterNextRender(()=>{
          (this.rail()?.nativeElement.children[this.index()]?.querySelector('button') as HTMLButtonElement|undefined)?.focus({preventScroll:true});
        },{injector:this.injector});
      });
    } catch {this.zoomError.set(true);}
    finally {this.openingZoom.set(false);}
  }
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
