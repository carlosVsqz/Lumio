import { Injectable, PLATFORM_ID, TransferState, inject } from '@angular/core';
import { DOCUMENT, isPlatformServer } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { PUBLIC_SITE_URL, PUBLIC_URL_STATE } from './site-config';
import { safeJsonLd } from './seo-model';

@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  readonly origin = inject(PUBLIC_SITE_URL);
  constructor() {
    if (isPlatformServer(inject(PLATFORM_ID))) inject(TransferState).set(PUBLIC_URL_STATE, this.origin);
  }
  set(data: {title: string; description: string; canonical?: string; structured?: unknown; noindex?: boolean}) {
    this.title.setTitle(data.title);
    this.meta.updateTag({name:'description', content:data.description});
    this.meta.updateTag({name:'robots', content:data.noindex ? 'noindex, follow' : 'index, follow'});
    this.document.querySelector('link[rel="canonical"]')?.remove();
    this.document.getElementById('lumio-structured-data')?.remove();
    if (data.canonical) {
      const canonical = this.document.createElement('link');
      canonical.rel = 'canonical'; canonical.href = data.canonical;
      this.document.head.appendChild(canonical);
    }
    if (data.structured) {
      const script = this.document.createElement('script');
      script.id = 'lumio-structured-data'; script.type = 'application/ld+json'; script.textContent = safeJsonLd(data.structured);
      this.document.head.appendChild(script);
    }
  }
}
