import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild, DestroyRef } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import type { Category } from '../../features/catalog/data-access/catalog.models';
import { filterCategories } from '../../core/category-navigation';
import { UiIcon } from './ui-icon';

@Component({
  selector: 'app-category-navigation', standalone: true,
  imports: [RouterLink, UiIcon],
  host: { class: 'block min-w-0' },
  template: `
    <button #trigger type="button"
      class="flex min-h-12 max-w-full items-center gap-2 px-0 py-3 text-sm font-semibold hover:text-accent lg:text-base"
      [id]="id() + '-trigger'" [attr.aria-expanded]="open()" [attr.aria-controls]="open() ? id() + '-panel' : null"
      [attr.aria-label]="selected() ? 'Categorías: ' + selected()!.name : 'Categorías'" (click)="toggle()" (keydown.arrowdown)="show($event)">
      <span class="truncate">{{ selected()?.name || 'Categorías' }}</span>
      <app-ui-icon name="chevronDown" [size]="16" [class.rotate-180]="open()" />
    </button>
    <section #panel popover="auto" [id]="id() + '-panel'" [attr.aria-labelledby]="id() + '-trigger'"
      class="category-navigation-panel fixed w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink"
      (toggle)="syncOpen($event)" (keydown)="keyDown($event)" (focusout)="focusOut($event)">
        <div class="shrink-0 border-b border-line p-4">
          <label [for]="id() + '-search'" class="mb-2 block text-sm font-semibold">Buscar categorías</label>
          <div class="flex items-center gap-2 rounded-md border border-input-border px-3 text-muted focus-within:border-ink">
            <app-ui-icon name="search" [size]="18" />
            <input #searchInput [id]="id() + '-search'" type="search" autocomplete="off" maxlength="200"
              class="h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted"
              placeholder="Nombre de la categoría" [value]="search()" (input)="searchCategories($any($event.target).value)" />
          </div>
          <p role="status" class="mt-2 text-xs font-normal text-muted">{{ filtered().length }} de {{ categories().length }} categorías</p>
        </div>
        <nav aria-label="Seleccionar categoría" class="min-h-0 overflow-y-auto overscroll-contain p-2 text-sm font-normal">
          <a routerLink="/" [queryParams]="{category: null, page: null}" queryParamsHandling="merge"
            class="flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-3 hover:bg-image"
            [attr.aria-current]="activeId() === '' ? 'page' : null" (click)="close()">
            Todas las categorías @if (activeId() === '') { <app-ui-icon name="check" [size]="18" /> }
          </a>
          @for (category of filtered(); track category.id) {
            <a routerLink="/" [queryParams]="{category: category.id, page: null}" queryParamsHandling="merge"
              class="flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-3 hover:bg-image"
              [class.bg-image]="activeId() === category.id" [attr.aria-current]="activeId() === category.id ? 'page' : null"
              (click)="close()">
              <span class="min-w-0 break-words">{{ category.name }}</span>
              @if (activeId() === category.id) { <app-ui-icon name="check" [size]="18" /> }
            </a>
          } @empty { <p class="px-3 py-6 leading-6 text-muted">No hay categorías con ese nombre. Prueba otra búsqueda.</p> }
        </nav>
    </section>
  `,
})
export class CategoryNavigation {
  readonly categories = input.required<Category[]>();
  readonly activeId = input<string|null>(null);
  readonly id = input.required<string>();
  readonly open = signal(false);
  readonly search = signal('');
  readonly selected = computed(() => this.categories().find(category => category.id === this.activeId()));
  readonly filtered = computed(() => filterCategories(this.categories(), this.search()));
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly injector = inject(Injector);

  constructor() {
    const router=inject(Router), destroy=inject(DestroyRef);
    afterNextRender(() => {
      router.events.pipe(filter(event=>event instanceof NavigationEnd),takeUntilDestroyed(destroy)).subscribe(()=>this.close(false));
      const reposition=()=>{
        if(!this.open())return;
        const rect=this.trigger()?.nativeElement.getBoundingClientRect();
        if(rect && (rect.bottom<0 || rect.top>window.innerHeight))this.close(false);
        else this.position();
      };
      window.addEventListener('resize',reposition,{passive:true});
      window.addEventListener('scroll',reposition,{passive:true});
      window.visualViewport?.addEventListener('resize',reposition,{passive:true});
      destroy.onDestroy(()=>{
        window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition);
        window.visualViewport?.removeEventListener('resize',reposition);
      });
    });
  }
  toggle() { if (this.open()) this.close(); else this.show(); }
  show(event?:Event) {
    event?.preventDefault();this.search.set('');
    this.panel()?.nativeElement.showPopover({source:this.trigger()?.nativeElement});
    this.open.set(true);this.position();this.searchInput()?.nativeElement.focus({preventScroll:true});
    this.repositionAfterRender();
  }
  close(restoreFocus=true) {
    if(!this.open())return;
    this.open.set(false);this.panel()?.nativeElement.hidePopover();
    if(restoreFocus)this.trigger()?.nativeElement.focus({preventScroll:true});
  }
  syncOpen(event:Event) { this.open.set((event as ToggleEvent).newState==='open'); }
  searchCategories(value:string) { this.search.set(value);this.repositionAfterRender(); }
  private repositionAfterRender() {
    afterNextRender(()=>{if(this.open())this.position();},{injector:this.injector});
  }
  keyDown(event:KeyboardEvent) { if(event.key==='Escape'){event.preventDefault();this.close();} }
  private position() {
    const panel=this.panel()?.nativeElement, trigger=this.trigger()?.nativeElement;
    if(!panel || !trigger)return;
    const rect=trigger.getBoundingClientRect(), viewport=window.visualViewport;
    const top=viewport?.offsetTop??0, bottom=top+(viewport?.height??window.innerHeight);
    const below=bottom-rect.bottom-24, above=rect.top-top-24;
    const downward=below>=260 || below>=above;
    panel.style.maxHeight=Math.max(100,Math.min(512,downward?below:above))+'px';
    panel.style.left=Math.max(20,Math.min(rect.left,window.innerWidth-panel.getBoundingClientRect().width-20))+'px';
    panel.style.top=(downward?rect.bottom+8:Math.max(top+16,rect.top-panel.getBoundingClientRect().height-8))+'px';
  }
  focusOut(event:FocusEvent) {
    const target=event.relatedTarget as Node|null;
    if(target && !this.panel()?.nativeElement.contains(target) && !this.trigger()?.nativeElement.contains(target))this.close(false);
  }
}
