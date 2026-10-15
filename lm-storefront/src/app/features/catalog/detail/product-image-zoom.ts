import {Component,DestroyRef,ElementRef,Injector,afterNextRender,computed,effect,inject,signal,viewChild} from '@angular/core';
import {DIALOG_DATA,DialogRef} from '@angular/cdk/dialog';
import type {CatalogImage} from '../data-access/catalog.models';
import {UiIcon} from '../../../shared/ui/ui-icon';
import {imageSize} from './gallery-model';

export interface ImageZoomData {images:CatalogImage[];name:string;index:number;select:(index:number)=>void}

@Component({selector:'app-product-image-zoom',standalone:true,imports:[UiIcon],host:{class:'grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-surface text-ink'},template:`
  <header class="flex items-center justify-between gap-4 border-b border-line px-4 py-2 sm:px-6">
    <h2 class="min-w-0 text-sm font-semibold">{{ data.name }}</h2>
    <button type="button" class="gallery-zoom-close flex shrink-0 items-center justify-center rounded-full p-2" aria-label="Cerrar imagen ampliada" (click)="close()"><app-ui-icon name="close" /></button>
  </header>
  <div #viewport class="relative min-h-0 overflow-auto overscroll-contain bg-image" tabindex="0" role="region" aria-label="Imagen ampliada; usa los controles de zoom y desplázate para explorar" (keydown)="key($event)">
    @if (!failed()) {
      <div class="grid min-h-full min-w-full place-items-center" [style.width.px]="size().width" [style.height.px]="size().height">
        <img [src]="photo().url" [alt]="photo().alt" class="block max-w-none object-contain" [style.width.px]="size().width" [style.height.px]="size().height" (load)="loaded($event)" (error)="failed.set(true);loading.set(false)" draggable="false">
      </div>
      @if (loading()) { <p role="status" class="absolute inset-0 grid place-items-center text-sm text-muted">Cargando imagen…</p> }
    } @else { <p role="status" class="grid h-full place-items-center px-6 text-center text-sm text-muted">No se pudo cargar esta imagen. Puedes elegir otra o cerrar el visor.</p> }
  </div>
  <footer class="border-t border-line px-3 py-2 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div class="flex items-center gap-1" aria-label="Navegación de imágenes">
        <button type="button" class="flex items-center justify-center p-2" aria-label="Imagen anterior ampliada" [disabled]="index()===0" (click)="step(-1)"><app-ui-icon name="left" /></button>
        <p role="status" class="min-w-12 text-center text-xs tabular-nums">{{ index()+1 }} / {{ data.images.length }}</p>
        <button type="button" class="flex items-center justify-center p-2" aria-label="Imagen siguiente ampliada" [disabled]="index()===data.images.length-1" (click)="step(1)"><app-ui-icon name="right" /></button>
      </div>
      <div class="flex items-center gap-1" aria-label="Controles de zoom">
        <button type="button" class="flex items-center justify-center p-2" aria-label="Reducir zoom" [disabled]="zoom()===1 || loading() || failed()" (click)="changeZoom(-.5)"><app-ui-icon name="minus" /></button>
        <p role="status" class="min-w-12 text-center text-xs tabular-nums">{{ zoom()*100 }} %</p>
        <button type="button" class="flex items-center justify-center p-2" aria-label="Aumentar zoom" [disabled]="zoom()===3 || loading() || failed()" (click)="changeZoom(.5)"><app-ui-icon name="plus" /></button>
        <button type="button" class="px-2 py-2 text-xs underline underline-offset-4" [disabled]="zoom()===1" (click)="resetZoom()">Restablecer</button>
      </div>
    </div>
    <p class="mt-1 text-xs leading-6 text-muted">Amplía con los controles y desplázate para ver los detalles. Escape cierra el visor.</p>
  </footer>
`})
export class ProductImageZoom {
  readonly data=inject<ImageZoomData>(DIALOG_DATA);
  private readonly dialog=inject<DialogRef<void>>(DialogRef);
  private readonly injector=inject(Injector);
  private readonly destroy=inject(DestroyRef);
  private readonly viewport=viewChild<ElementRef<HTMLElement>>('viewport');
  readonly index=signal(this.data.index);
  readonly zoom=signal(1);
  readonly loading=signal(true);
  readonly failed=signal(false);
  private readonly dimensions=signal({width:0,height:0});
  private readonly bounds=signal({width:0,height:0});
  readonly photo=computed(()=>this.data.images[this.index()]);
  readonly size=computed(()=>imageSize(this.dimensions().width,this.dimensions().height,this.bounds().width,this.bounds().height,this.zoom()));
  constructor() {
    effect(()=>{this.photo();this.zoom.set(1);this.loading.set(true);this.failed.set(false);this.dimensions.set({width:0,height:0});});
    afterNextRender(()=>{
      const observer=new ResizeObserver(()=>{
        const view=this.viewport()?.nativeElement;if(view)this.bounds.set({width:view.clientWidth,height:view.clientHeight});
      });
      const view=this.viewport()?.nativeElement;if(view)observer.observe(view);
      this.destroy.onDestroy(()=>observer.disconnect());
    });
  }
  loaded(event:Event) {
    const image=event.target as HTMLImageElement;
    this.dimensions.set({width:image.naturalWidth,height:image.naturalHeight});this.loading.set(false);this.center();
  }
  changeZoom(delta:number) {if(this.loading()||this.failed())return;this.zoom.update(value=>Math.max(1,Math.min(3,value+delta)));this.center();}
  resetZoom() {this.zoom.set(1);this.center();}
  step(delta:number) {
    const next=Math.max(0,Math.min(this.data.images.length-1,this.index()+delta));
    this.index.set(next);this.data.select(next);
  }
  key(event:KeyboardEvent) {
    if(event.ctrlKey || event.metaKey || event.altKey)return;
    if(event.key==='+' || event.key==='='){event.preventDefault();this.changeZoom(.5);}
    else if(event.key==='-'){event.preventDefault();this.changeZoom(-.5);}
    else if(event.key==='0'){event.preventDefault();this.resetZoom();}
    else if(this.zoom()===1 && ['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();this.step(event.key==='ArrowRight'?1:-1);}
  }
  private center() {
    afterNextRender(()=>{
      const view=this.viewport()?.nativeElement;
      view?.scrollTo({left:(view.scrollWidth-view.clientWidth)/2,top:(view.scrollHeight-view.clientHeight)/2});
    },{injector:this.injector});
  }
  close() {this.dialog.close();}
}
