import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandingStore } from '../../core/branding-store';
import { UiIcon } from './ui-icon';
import { ThemeStore } from '../../core/theme-store';
import { StoreBrand } from './store-brand';
import { CategoryNavigation } from './category-navigation';
import { PwaControls } from '../../features/pwa/pwa-controls';

@Component({
  selector: 'app-store-footer', standalone: true, imports: [RouterLink, UiIcon, StoreBrand, CategoryNavigation, PwaControls],
  templateUrl: './store-footer.html', host: { class: 'mt-20 block' },
})
export class StoreFooter {
  readonly brand = inject(BrandingStore);
  readonly theme = inject(ThemeStore);
}
