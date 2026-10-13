import { Component, inject } from '@angular/core';
import { WishlistStore } from './wishlist-store';
@Component({selector:'app-wishlist-feedback',standalone:true,
  template:`<div role="status" aria-live="polite" aria-atomic="true" class="pointer-events-none fixed right-5 bottom-5 left-5 z-50 flex justify-center">@if (store.notice()) { <p class="max-w-lg rounded-lg bg-ink px-5 py-3 text-center text-sm leading-6 text-on-ink">{{ store.notice() }}</p> }</div>`})
export class WishlistFeedback { readonly store=inject(WishlistStore); }
