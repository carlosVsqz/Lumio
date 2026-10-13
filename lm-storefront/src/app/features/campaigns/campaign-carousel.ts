import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UiIcon } from '../../shared/ui/ui-icon';
import { CampaignStore } from './campaign-store';
import { campaignIndex, nextCampaignIndex } from './campaign-model';

@Component({
  selector:'app-campaign-carousel', standalone:true, imports:[RouterLink,UiIcon],
  changeDetection:ChangeDetectionStrategy.OnPush, templateUrl:'./campaign-carousel.html',
})
export class CampaignCarousel {
  readonly store = inject(CampaignStore);
  private readonly router = inject(Router);
  readonly selectedId = signal<string|null>(null);
  readonly instant = signal(true);
  readonly index = computed(() => campaignIndex(this.store.slides(), this.selectedId()));
  readonly announcement = signal('');
  readonly paused = signal(false);
  readonly reducedMotion = signal(false);
  readonly hovered = signal(false);
  readonly focused = signal(false);
  readonly rotationEnabled = computed(() => !this.paused() && !this.reducedMotion());
  private readonly ready = signal(false);
  private readonly visible = signal(false);
  private readonly restart = signal(0);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const updateMotion = () => this.reducedMotion.set(motion.matches);
      const updateVisibility = () => this.visible.set(document.visibilityState === 'visible');
      updateMotion(); updateVisibility(); this.ready.set(true);
      motion.addEventListener('change', updateMotion);
      document.addEventListener('visibilitychange', updateVisibility);
      destroy.onDestroy(() => {
        motion.removeEventListener('change', updateMotion);
        document.removeEventListener('visibilitychange', updateVisibility);
      });
    });
    effect(onCleanup => {
      this.restart();
      if (!this.ready() || !this.visible() || !this.rotationEnabled() || this.hovered() || this.focused() || this.store.slides().length < 2) return;
      const timer = setInterval(() => this.advance(1, false), 3500);
      onCleanup(() => clearInterval(timer));
    });
  }

  internalLink(url: string) { return this.router.parseUrl(url); }

  pointerEnter(event: PointerEvent): void {
    if (event.pointerType !== 'touch') this.hovered.set(true);
  }

  focusOut(event: FocusEvent): void {
    const section = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !section.contains(event.relatedTarget)) this.focused.set(false);
  }

  toggleRotation(): void {
    this.paused.update(value => !value);
    this.restart.update(value => value + 1);
  }

  move(direction: -1 | 1, event: MouseEvent): void {
    this.advance(direction, true, event.detail === 0);
    this.restart.update(value => value + 1);
  }

  private advance(direction: -1 | 1, manual: boolean, instant = false): void {
    const slides = this.store.slides();
    if (slides.length < 2) return;
    const next = nextCampaignIndex(this.index(), direction, slides.length);
    this.instant.set(instant);
    this.selectedId.set(slides[next].id);
    if (manual) this.announcement.set(`${next + 1} de ${slides.length}: ${slides[next].title}`);
  }
}
