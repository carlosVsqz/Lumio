import { Component, DestroyRef, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { StoreHeader } from './shared/ui/store-header';
import { BrandingStore } from './core/branding-store';
import { WishlistFeedback } from './features/wishlist/wishlist-feedback';
import { StoreFooter } from './shared/ui/store-footer';
import { CampaignCarousel } from './features/campaigns/campaign-carousel';
import { PwaStatus } from './features/pwa/pwa-status';

@Component({
  selector: 'app-root', standalone: true, imports: [RouterOutlet, StoreHeader, StoreFooter, WishlistFeedback, CampaignCarousel, PwaStatus],
  templateUrl: './app.html',
  host: { '[style.--color-primary]': 'brand.color()', '[style.--color-accent]': 'brand.textColor()', '[style.--brand-contrast]': 'brand.contrast()', class: 'flex min-h-dvh flex-col' },
})
export class App {
  readonly brand = inject(BrandingStore);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly main = viewChild<ElementRef<HTMLElement>>('mainContent');

  constructor() {
    afterNextRender(() => {
      document.dispatchEvent(new Event('lumio:ready'));
      let path = this.router.url.split(/[?#]/)[0];
      this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(this.destroy)).subscribe(event => {
        const next = event.urlAfterRedirects.split(/[?#]/)[0];
        if (next !== path) this.main()?.nativeElement.focus({ preventScroll: true });
        path = next;
      });
    });
  }
}
