import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { UiIcon } from '../../shared/ui/ui-icon';
import { WishlistStore } from './wishlist-store';

@Component({selector:'app-wishlist-link',standalone:true,imports:[RouterLink,RouterLinkActive,UiIcon],
  template:`<a routerLink="/favoritos" routerLinkActive="is-active" ariaCurrentWhenActive="page" class="header-action wishlist-header-link relative flex h-11 min-w-11 items-center justify-center rounded-full" [class.has-favorites]="store.count() > 0" [attr.aria-label]="'Favoritos, ' + store.count() + ' artículos'" title="Favoritos"><app-ui-icon name="heart" class="header-action-icon" [filled]="store.count() > 0" />@if (store.count()) { <span class="favorite-count absolute -top-1 -right-1 min-w-5 rounded-full px-1 text-center text-[10px] leading-5 text-white tabular-nums" aria-hidden="true">{{ store.count() }}</span> }</a>`})
export class WishlistLink { readonly store=inject(WishlistStore); }
