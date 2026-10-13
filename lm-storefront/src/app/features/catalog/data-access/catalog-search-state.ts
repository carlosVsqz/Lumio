import { Injectable, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, filter, map, startWith } from 'rxjs';
import { MAX_SEARCH_LENGTH } from './catalog-query';

@Injectable({ providedIn: 'root' })
export class CatalogSearchState {
  private readonly router = inject(Router);
  private readonly url = toSignal(this.router.events.pipe(
    filter(event => event instanceof NavigationEnd), map(event => event.urlAfterRedirects), startWith(this.router.url),
  ), { requireSync: true });
  private readonly repeat = new Subject<void>();
  readonly repeatedSearch = this.repeat.asObservable();
  readonly text = signal('');

  constructor() {
    effect(() => this.text.set((new URL(this.url(), 'https://lumio.invalid').searchParams.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH)));
  }

  async submit() {
    const search = this.text().trim().slice(0, MAX_SEARCH_LENGTH);
    this.text.set(search);
    const navigated = await this.router.navigate(['/'], {
      queryParams: { q: search || null, page: null }, queryParamsHandling: 'merge',
    });
    const current = new URL(this.router.url, 'https://lumio.invalid');
    if (!navigated && current.pathname === '/' && (current.searchParams.get('q') ?? '') === search) this.repeat.next();
  }
}
