import {Component,DestroyRef,ElementRef,Injector,afterNextRender,computed,inject,input,signal,viewChild} from '@angular/core';
import {NavigationEnd,Router,RouterLink} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {toSignal} from '@angular/core/rxjs-interop';
import {filter,map,startWith} from 'rxjs';
import type {CatalogAttributeFacet} from '../data-access/catalog.models';
import {brandLinks} from '../data-access/catalog-brands';
import {parseCatalogQuery} from '../data-access/catalog-query';
import {UiIcon} from '../../../shared/ui/ui-icon';
import {BrandImage} from './brand-image';

@Component({selector:'app-brand-navigation',standalone:true,imports:[RouterLink,UiIcon,BrandImage],host:{class:'block shrink-0',
  '(pointerenter)':'cancelClose()','(pointerleave)':'leave($event)','(focusout)':'focusOut($event)','(keydown.escape)':'escape($event)'},templateUrl:'./brand-navigation.html'})
export class BrandNavigation {
  readonly facet=input<CatalogAttributeFacet|null>(null);
  readonly ready=input(false);
  readonly open=signal(false);
  readonly search=signal('');
  readonly links=computed(()=>brandLinks(this.facet(),this.search()));
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router=inject(Router);
  private readonly url=toSignal(this.router.events.pipe(filter(event=>event instanceof NavigationEnd),map(event=>event.urlAfterRedirects),startWith(this.router.url)),{requireSync:true});
  readonly selected=computed(()=>new Set(parseCatalogQuery(new URL(this.url(),'http://lumio.local').searchParams).attributes.find(group=>group.name===this.facet()?.name)?.values??[]));
  private readonly injector=inject(Injector);
  private readonly panel=viewChild<ElementRef<HTMLElement>>('panel');
  private readonly trigger=viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private hoverOpened=false;
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor() {
    const destroy=inject(DestroyRef),router=this.router;
    afterNextRender(()=>{
      router.events.pipe(filter(event=>event instanceof NavigationEnd),takeUntilDestroyed(destroy)).subscribe(()=>this.close(false));
      const reposition=()=>{if(this.open())this.position();};
      window.addEventListener('resize',reposition,{passive:true});window.addEventListener('scroll',reposition,{passive:true});
      window.visualViewport?.addEventListener('resize',reposition,{passive:true});
      destroy.onDestroy(()=>{
        this.cancelClose();window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition);
        window.visualViewport?.removeEventListener('resize',reposition);
      });
    });
  }
  toggle() {if(this.panel()?.nativeElement.matches(':popover-open')&&!this.hoverOpened)this.close();else this.show(true);}
  hover(event:PointerEvent) {
    if(event.pointerType==='mouse' && window.matchMedia('(min-width: 64rem) and (hover: hover) and (pointer: fine)').matches)this.show(false);
  }
  show(focus:boolean) {
    this.cancelClose();
    // Native light-dismiss can run on pointerdown before Angular receives click/toggle.
    const panel=this.panel()?.nativeElement;
    if(!panel?.matches(':popover-open')){this.hoverOpened=!focus;this.search.set('');panel?.showPopover({source:this.trigger()?.nativeElement});}
    else if(focus)this.hoverOpened=false;
    this.open.set(true);this.position();
    afterNextRender(()=>{
      if(!this.open())return;this.position();
      if(focus){const panel=this.panel()?.nativeElement;(panel?.querySelector<HTMLElement>('nav a')??panel?.querySelector<HTMLElement>('button'))?.focus({preventScroll:true});}
    },{injector:this.injector});
  }
  close(restoreFocus=true) {
    this.cancelClose();this.open.set(false);this.hoverOpened=false;
    const panel=this.panel()?.nativeElement;if(panel?.matches(':popover-open'))panel.hidePopover();
    if(restoreFocus)this.trigger()?.nativeElement.focus({preventScroll:true});
  }
  sync(event:Event) {this.open.set(this.panel()?.nativeElement.matches(':popover-open')??(event as ToggleEvent).newState==='open');}
  escape(event:Event) {event.preventDefault();this.close();}
  cancelClose() {if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;}
  leave(event:PointerEvent) {
    if(event.pointerType!=='mouse' || !this.open())return;
    this.cancelClose();this.timer=setTimeout(()=>{
      if(!this.panel()?.nativeElement.contains(document.activeElement))this.close(false);
    },180);
  }
  focusOut(event:FocusEvent) {
    const next=event.relatedTarget as Node|null;
    if(next && !this.host.nativeElement.contains(next))this.close(false);
  }
  private position() {
    const panel=this.panel()?.nativeElement,header=this.host.nativeElement.closest('header');if(!panel||!header)return;
    const viewport=window.visualViewport,top=viewport?.offsetTop??0,bottom=top+(viewport?.height??window.innerHeight),rect=header.getBoundingClientRect();
    if(rect.bottom<top || rect.top>bottom){this.close(false);return;}
    panel.style.width=window.innerWidth+'px';panel.style.left='0px';panel.style.top=rect.bottom+'px';
    panel.style.maxHeight=Math.max(100,Math.min(720,bottom-rect.bottom-16))+'px';
  }
}
