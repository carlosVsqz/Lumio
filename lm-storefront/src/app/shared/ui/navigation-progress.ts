import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-navigation-progress', standalone: true,
  host: {
    role: 'progressbar', 'aria-label': 'Cargando página',
    '[attr.aria-hidden]': '!loading()', '[class.is-loading]': 'loading()',
  },
  template: '<span class="navigation-progress-bar"></span>',
  styles: `
    :host {
      position: fixed; inset: 0 0 auto; z-index: 1100; height: 3px;
      pointer-events: none; overflow: hidden; opacity: 0;
      transition: opacity 160ms var(--ease-out);
    }
    :host(.is-loading) { opacity: 1; transition: none; }
    .navigation-progress-bar {
      display: block; width: 30%; height: 100%; background: var(--color-navigation-progress);
      animation: navigation-progress-travel 1s linear infinite;
      animation-play-state: paused;
    }
    :host(.is-loading) .navigation-progress-bar { animation-play-state: running; }
    @keyframes navigation-progress-travel {
      from { transform: translateX(-100%); }
      to { transform: translateX(334%); }
    }
    @media (prefers-reduced-motion: reduce) {
      :host { transition-duration: 80ms; }
      .navigation-progress-bar { width: 100%; animation: none; }
    }
  `,
})
export class NavigationProgress {
  readonly loading = signal(false);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private activeId: number | null = null;
  private startedAt = 0;
  private finishTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => {
      this.router.events.pipe(takeUntilDestroyed(this.destroy)).subscribe(event => {
        if (event instanceof NavigationStart) {
          clearTimeout(this.finishTimer);
          this.activeId = event.id;
          this.startedAt = performance.now();
          this.loading.set(true);
        } else if (event instanceof NavigationEnd || event instanceof NavigationCancel
          || event instanceof NavigationError || event instanceof NavigationSkipped) {
          if (event.id !== this.activeId) return;
          // Keep fast navigation feedback legible without delaying the route or blocking input.
          this.finishTimer = setTimeout(() => {
            this.loading.set(false);
            this.activeId = null;
            this.finishTimer = undefined;
          }, Math.max(0, 120 - (performance.now() - this.startedAt)));
        }
      });
    });
    this.destroy.onDestroy(() => clearTimeout(this.finishTimer));
  }
}
