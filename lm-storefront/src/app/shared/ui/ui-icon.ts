import { Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideArrowLeft, LucideArrowRight, LucidePlus, LucideMinus, LucideX, LucideCheck, LucideExternalLink, LucideHeart, LucideSearch, LucideShoppingBag, LucideImage, LucideEye, LucidePause, LucidePlay, LucideSun, LucideMoon, LucideChevronDown } from '@lucide/angular';

const ICONS = {left:LucideArrowLeft,right:LucideArrowRight,plus:LucidePlus,minus:LucideMinus,close:LucideX,check:LucideCheck,external:LucideExternalLink,heart:LucideHeart,search:LucideSearch,bag:LucideShoppingBag,image:LucideImage,eye:LucideEye,pause:LucidePause,play:LucidePlay,sun:LucideSun,moon:LucideMoon,chevronDown:LucideChevronDown};

@Component({
  selector: 'app-ui-icon', standalone: true, imports:[LucideDynamicIcon], host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true', '[style.width.px]':'size()', '[style.height.px]':'size()' },
  template: `<svg [lucideIcon]="icon()" [size]="size()" [strokeWidth]="1.5" class="h-full w-full" [attr.fill]="filled() ? 'currentColor' : 'none'" aria-hidden="true" focusable="false"></svg>`,
})
export class UiIcon {
  readonly name = input.required<keyof typeof ICONS>();
  readonly filled = input(false);
  readonly size = input(20);
  readonly icon = computed(() => ICONS[this.name()]);
}
