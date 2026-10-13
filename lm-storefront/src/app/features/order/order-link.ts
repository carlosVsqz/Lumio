import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { OrderStore } from './order-store';
import { UiIcon } from '../../shared/ui/ui-icon';

@Component({
  selector: 'app-order-link', standalone: true, imports: [RouterLink, RouterLinkActive, UiIcon],
  template: `<a routerLink="/pedido" routerLinkActive="is-active" ariaCurrentWhenActive="page" class="header-action order-header-link relative flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full" [attr.aria-label]="'Mi pedido, ' + store.lines().length + ' líneas'" title="Mi pedido"><app-ui-icon name="bag" class="header-action-icon" />@if (store.lines().length) { <span class="order-count absolute -top-1 -right-1 min-w-5 rounded-full px-1 text-center text-[10px] leading-5 text-white tabular-nums" aria-hidden="true">{{ store.lines().length }}</span> }</a>`,
})
export class OrderLink { readonly store = inject(OrderStore); }

