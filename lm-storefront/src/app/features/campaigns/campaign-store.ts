import { DestroyRef, Injectable, PLATFORM_ID, TransferState, afterNextRender, inject, makeStateKey, signal } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ResolveFn } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, timeout } from 'rxjs';
import { CATALOG_API_URL } from '../../core/site-config';
import { CampaignSlide, validateCampaigns } from './campaign-model';

const KEY = makeStateKey<readonly CampaignSlide[] | null>('lumio.campaigns.v1');

@Injectable({providedIn:'root'})
export class CampaignStore {
  private readonly http = inject(HttpClient);
  private readonly endpoint = inject(CATALOG_API_URL);
  private readonly transfer = inject(TransferState);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));
  private readonly destroy = inject(DestroyRef);
  readonly slides = signal<readonly CampaignSlide[]>([]);
  readonly error = signal(false);
  readonly loading = signal(false);
  private loaded = false;
  private pending: Promise<void> | null = null;

  constructor() {
    const cached = this.transfer.get(KEY, null);
    if (cached !== null) {
      this.slides.set(validateCampaigns(cached)); this.loaded = true;
      if (!this.server) this.transfer.remove(KEY);
    }
    afterNextRender(() => {
      void this.refresh();
      const interval = setInterval(() => { if (document.visibilityState === 'visible') void this.refresh(); }, 60000);
      const visible = () => { if (document.visibilityState === 'visible') void this.refresh(); };
      document.addEventListener('visibilitychange', visible);
      this.destroy.onDestroy(() => { clearInterval(interval); document.removeEventListener('visibilitychange', visible); });
    });
  }

  async loadForRoute(): Promise<boolean> {
    if (!this.loaded) await this.refresh();
    if (this.server && this.error()) throw new Error('Falló el prerenderizado de las campañas: comprueba lm-core, CATALOG_BUILD_API_URL y el módulo/permisos de Odoo.');
    return !this.error();
  }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.loading.set(true);
    this.pending = this.fetch().finally(() => { this.loading.set(false); this.pending = null; });
    return this.pending;
  }

  private async fetch(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.post<{data?:{campaigns?:unknown}; errors?:unknown[]}>(this.endpoint,
        {query:'query StoreCampaigns { campaigns { id title message actionLabel actionUrl } }'}, {transferCache:false})
        .pipe(timeout(15000), takeUntilDestroyed(this.destroy)));
      if (response.errors?.length) throw new Error('No se pudieron consultar las campañas.');
      const slides = validateCampaigns(response.data?.campaigns);
      this.slides.set(slides); this.loaded = true; this.error.set(false);
      if (this.server) this.transfer.set(KEY, slides);
    } catch {
      // Never keep expired promotional promises or substitute demo content after an upstream failure.
      this.slides.set([]); this.error.set(true);
    }
  }
}

export const campaignsResolver: ResolveFn<boolean> = () => inject(CampaignStore).loadForRoute();
