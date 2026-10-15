import {Component,inject} from '@angular/core';
import {PwaStore} from './pwa-store';
import {UiIcon} from '../../shared/ui/ui-icon';

@Component({selector:'app-pwa-status',standalone:true,imports:[UiIcon],host:{class:'block'},template:`
  @if (pwa.offline()) {
    <div role="status" class="border-b border-line bg-image text-ink">
      <p class="mx-auto flex max-w-[1600px] items-start gap-3 px-5 py-3 text-sm leading-6 lg:px-12"><app-ui-icon name="wifiOff" class="mt-1" [size]="18" /><span>Sin conexión. Para consultar el catálogo y verificar tu pedido necesitas conexión a internet. Tu selección local no se elimina.</span></p>
    </div>
  }
`})
export class PwaStatus {readonly pwa=inject(PwaStore);}
