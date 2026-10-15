import { Component, ElementRef, Injector, DestroyRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import type { Category } from '../../features/catalog/data-access/catalog.models';
import { categoryLinks, categoryTrail, categoryTree } from '../../core/category-navigation';
import { UiIcon } from './ui-icon';

@Component({
  selector:'app-category-navigation', standalone:true, imports:[RouterLink, UiIcon],
  host:{class:'flex min-w-0 items-center gap-5', '(pointerenter)':'cancelClose()', '(pointerleave)':'leave($event)', '(focusout)':'focusOut($event)', '(keydown)':'keyDown($event)'},
  templateUrl:'./category-navigation.html',
})
export class CategoryNavigation {
  readonly categories=input.required<Category[]>();
  readonly activeId=input<string|null>(null);
  readonly id=input.required<string>();
  readonly header=input(false);
  readonly open=signal(false);
  readonly highlighted=signal<string|null>(null);
  readonly roots=computed(()=>categoryTree(this.categories()));
  readonly groups=computed(()=>this.roots().map(branch=>({category:branch.category,links:categoryLinks(branch)})));
  readonly activeRootId=computed(()=>categoryTrail(this.categories(),this.activeId())[0]?.id??null);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger=viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel=viewChild<ElementRef<HTMLElement>>('panel');
  private readonly injector=inject(Injector);
  private invoker:HTMLElement|null=null;
  private hoverOpened=false;
  private closeTimer:ReturnType<typeof setTimeout>|undefined;

  constructor() {
    const router=inject(Router),destroy=inject(DestroyRef);
    afterNextRender(()=>{
      router.events.pipe(filter(event=>event instanceof NavigationEnd),takeUntilDestroyed(destroy)).subscribe(()=>this.close(false));
      const reposition=()=>{if(this.open())this.position();};
      window.addEventListener('resize',reposition,{passive:true});
      window.addEventListener('scroll',reposition,{passive:true});
      window.visualViewport?.addEventListener('resize',reposition,{passive:true});
      destroy.onDestroy(()=>{
        this.cancelClose();window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition);
        window.visualViewport?.removeEventListener('resize',reposition);
      });
    });
  }
  toggle(event:Event,rootId:string|null=null) {
    if(this.panel()?.nativeElement.matches(':popover-open') && this.invoker===event.currentTarget && !this.hoverOpened)this.close();
    else this.show(event.currentTarget as HTMLElement,rootId,true);
  }
  hover(event:PointerEvent,rootId:string|null=null) {
    if(this.header() && event.pointerType==='mouse' && window.matchMedia('(min-width: 64rem) and (hover: hover)').matches)
      this.show(event.currentTarget as HTMLElement,rootId,false);
  }
  show(invoker:HTMLElement,rootId:string|null,focus:boolean) {
    this.cancelClose();this.invoker=invoker;this.hoverOpened=!focus;this.highlighted.set(rootId);
    if(!this.panel()?.nativeElement.matches(':popover-open'))this.panel()?.nativeElement.showPopover({source:invoker});
    this.open.set(true);this.position();
    afterNextRender(()=>{
      if(!this.open())return;
      this.position();
      if(focus)this.panel()?.nativeElement.querySelector<HTMLElement>('a')?.focus({preventScroll:true});
    },{injector:this.injector});
  }
  arrow(event:Event,rootId:string|null=null) { event.preventDefault();this.show(event.currentTarget as HTMLElement,rootId,true); }
  close(restoreFocus=true) {
    this.cancelClose();this.open.set(false);
    const panel=this.panel()?.nativeElement;if(panel?.matches(':popover-open'))panel.hidePopover();this.highlighted.set(null);
    if(restoreFocus)(this.invoker??this.trigger()?.nativeElement)?.focus({preventScroll:true});
  }
  syncOpen(event:Event) { this.open.set(this.panel()?.nativeElement.matches(':popover-open')??(event as ToggleEvent).newState==='open'); }
  cancelClose() { if(this.closeTimer!==undefined)clearTimeout(this.closeTimer);this.closeTimer=undefined; }
  leave(event:PointerEvent) {
    if(event.pointerType!=='mouse' || !this.open())return;
    this.cancelClose();this.closeTimer=setTimeout(()=>{
      // Keyboard focus takes precedence over hover dismissal.
      if(!this.panel()?.nativeElement.contains(document.activeElement))this.close(false);
    },180);
  }
  keyDown(event:KeyboardEvent) { if(event.key==='Escape'){event.preventDefault();this.close();} }
  focusOut(event:FocusEvent) {
    const target=event.relatedTarget as Node|null;
    if(target && !this.host.nativeElement.contains(target))this.close(false);
  }
  private position() {
    const panel=this.panel()?.nativeElement,trigger=this.invoker??this.trigger()?.nativeElement;
    if(!panel || !trigger)return;
    const viewport=window.visualViewport,top=viewport?.offsetTop??0,bottom=top+(viewport?.height??window.innerHeight);
    const rect=(this.header()?this.host.nativeElement.closest('header'):trigger)?.getBoundingClientRect();
    if(!rect)return;
    if(rect.bottom<top || rect.top>bottom){this.close(false);return;}
    const width=this.header()?window.innerWidth:Math.min(1152,window.innerWidth-40);
    panel.style.width=width+'px';panel.style.left=this.header()?'0px':Math.max(20,Math.min(rect.left,window.innerWidth-width-20))+'px';
    const below=bottom-rect.bottom-16,above=rect.top-top-24,downward=this.header() || below>=320 || below>=above;
    panel.style.maxHeight=Math.max(100,Math.min(720,downward?below:above))+'px';
    panel.style.top=(downward?rect.bottom:Math.max(top+16,rect.top-panel.getBoundingClientRect().height-8))+'px';
  }
}
