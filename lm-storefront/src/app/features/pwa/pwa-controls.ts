import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { PwaStore } from './pwa-store';
import { UiIcon } from '../../shared/ui/ui-icon';
import { BrandingStore } from '../../core/branding-store';
import { InstallInstructions } from './install-instructions';
import {INSTALL_SUGGESTION_KEY,suggestionDismissed,dismissInstallSuggestion} from './install-suggestion';

@Component({selector:'app-pwa-controls',standalone:true,imports:[UiIcon,InstallInstructions],host:{class:'block'},template:`
  @if (pwa.supported() && !pwa.installed()) {
    @if (showSuggestion()) {
      <aside aria-labelledby="pwa-suggestion-title" class="flex flex-wrap items-start justify-between gap-x-8 gap-y-2 py-2">
        <div class="min-w-0 max-w-xl">
          <h2 id="pwa-suggestion-title" class="text-base font-semibold">{{ brand.name() }}, a un toque</h2>
          <p class="mt-1 text-sm leading-6 text-muted">Si te resulta útil, guarda el catálogo en tu pantalla de inicio para volver más fácil.</p>
          <div class="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1">
            @if (pwa.canInstall()) {
              <button type="button" class="inline-flex min-h-11 items-center gap-2 px-0 py-2 text-sm font-semibold text-accent hover:underline underline-offset-4" [disabled]="pwa.installing()" (click)="install()"><app-ui-icon name="download" [size]="18" />Instalar aplicación</button>
            }
            <button type="button" class="inline-flex min-h-11 items-center gap-2 px-0 py-2 text-sm font-semibold hover:underline underline-offset-4" [attr.aria-expanded]="pwa.installHelp()" [attr.aria-controls]="pwa.installHelp() ? 'pwa-install-help' : null" (click)="pwa.installHelp.update(toggle)">
              @if (!pwa.canInstall()) { <app-ui-icon name="download" [size]="18" /> }{{ pwa.installHelp() ? 'Ocultar instrucciones' : 'Cómo instalar' }}
            </button>
            <button type="button" class="min-h-11 px-0 py-2 text-sm font-medium text-muted hover:underline underline-offset-4" (click)="dismiss()">Ahora no</button>
          </div>
        </div>
      </aside>
    } @else {
    <div class="flex flex-wrap items-center gap-x-6 gap-y-1">
    @if (pwa.canInstall()) {
      <button type="button" class="inline-flex min-h-11 items-center gap-2 px-0 py-2 text-sm font-semibold hover:underline underline-offset-4" [disabled]="pwa.installing()" (click)="install()"><app-ui-icon name="download" [size]="18" />Instalar aplicación</button>
    }
    <button #installControl type="button" class="inline-flex min-h-11 items-center gap-2 px-0 py-2 text-sm font-semibold hover:underline underline-offset-4"
      [attr.aria-expanded]="pwa.installHelp()" [attr.aria-controls]="pwa.installHelp() ? 'pwa-install-help' : null"
      (click)="pwa.installHelp.update(toggle)">
      @if (!pwa.canInstall()) { <app-ui-icon name="download" [size]="18" /> }{{ pwa.installHelp() ? 'Ocultar instrucciones' : 'Cómo instalar la aplicación' }}
    </button>
    </div>
    }
    @if (pwa.installHelp()) {
      <div id="pwa-install-help" class="py-3">
        @defer (when pwa.installHelp()) { <app-install-instructions /> } @placeholder { <p class="text-sm text-muted">Cargando instrucciones…</p> }
      </div>
    }
  }
  @if (pwa.updateReady()) {
    <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <p role="status">Hay una versión nueva disponible.</p>
      <button type="button" class="inline-flex min-h-11 items-center gap-2 px-0 py-2 font-semibold underline underline-offset-4" (click)="pwa.reload()"><app-ui-icon name="refresh" [size]="18" />Actualizar aplicación</button>
    </div>
  }
  @if (pwa.notice()) { <p role="status" class="mt-2 text-sm leading-6 text-muted">{{ pwa.notice() }}</p> }
`})
export class PwaControls {
  readonly pwa=inject(PwaStore);readonly brand=inject(BrandingStore);readonly toggle=(value:boolean)=>!value;
  private readonly injector=inject(Injector);
  private readonly installControl=viewChild<ElementRef<HTMLButtonElement>>('installControl');
  private readonly suggestionHidden=signal(true);
  readonly showSuggestion=computed(()=>this.pwa.supported() && !this.pwa.installed() && !this.pwa.offline() && !this.suggestionHidden());
  constructor() {
    const destroy=inject(DestroyRef);
    afterNextRender(()=>{
      let storage:Storage|undefined;
      try {storage=localStorage;this.suggestionHidden.set(suggestionDismissed(storage.getItem(INSTALL_SUGGESTION_KEY),Date.now()));}
      catch {this.suggestionHidden.set(false);}
      const sync=(event:StorageEvent)=>{
        if(event.storageArea===storage && (event.key===INSTALL_SUGGESTION_KEY || event.key===null))this.suggestionHidden.set(suggestionDismissed(event.newValue,Date.now()));
      };
      window.addEventListener('storage',sync);destroy.onDestroy(()=>window.removeEventListener('storage',sync));
    });
  }
  private hideSuggestion() {
    this.suggestionHidden.set(true);
    try {dismissInstallSuggestion(localStorage,Date.now());}catch { /* Keep the dismissal in memory. */ }
  }
  async install() {
    await this.pwa.install();
    this.hideSuggestion();
    afterNextRender(()=>this.installControl()?.nativeElement.focus({preventScroll:true}),{injector:this.injector});
  }
  dismiss() {
    this.pwa.installHelp.set(false);
    this.hideSuggestion();
    afterNextRender(()=>this.installControl()?.nativeElement.focus({preventScroll:true}),{injector:this.injector});
  }
}
