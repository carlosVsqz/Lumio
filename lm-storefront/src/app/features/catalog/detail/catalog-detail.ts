import { Component, afterNextRender, computed, inject, signal, DestroyRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { CatalogApi } from '../data-access/catalog-api';
import { CatalogItem, CatalogMetadata } from '../data-access/catalog.models';
import { attributeOptions, canAdd, positiveQuantity, resolveVariant } from './variant-selection';
import { OrderStore } from '../../order/order-store';
import { formatMinorPrice } from '../../../core/money';
import { ResolvedDetail } from '../data-access/catalog-resolvers';
import { Seo } from '../../../core/seo';
import { articleSeo } from '../../../core/seo-model';
import { BrandingStore } from '../../../core/branding-store';
import { ProductGallery } from './product-gallery';
import { VariantPicker } from './variant-picker';
import { QuantityInput } from '../../../shared/ui/quantity-input';
import { UiIcon } from '../../../shared/ui/ui-icon';
import { minimumItemPrice } from '../catalog-presentation';
import { FavoriteButton } from '../../wishlist/favorite-button';
import { ComboPicker } from './combo-picker';
import { evaluateCombo, ComboChoices } from './combo-selection';

@Component({
  selector: 'app-catalog-detail', standalone: true, imports: [RouterLink, ProductGallery, VariantPicker, QuantityInput, UiIcon, FavoriteButton, ComboPicker],
  templateUrl: './catalog-detail.html', host: { class: 'block' },
})
export class CatalogDetail {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly seo = inject(Seo);
  private readonly brand = inject(BrandingStore);
  readonly retry = new Subject<void>();
  readonly order = inject(OrderStore);
  readonly item = signal<CatalogItem | null>(null);
  readonly catalog = signal<CatalogMetadata | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly choices = signal<Record<string, string>>(Object.create(null));
  readonly comboChoices = signal<ComboChoices>(Object.create(null));
  readonly quantityText = signal('1');
  readonly message = signal('');
  readonly options = computed(() => this.item() ? attributeOptions(this.item()!) : []);
  readonly complete = computed(() => this.options().every(option => Object.hasOwn(this.choices(), option.name)));
  readonly variant = computed(() => this.item() ? resolveVariant(this.item()!, this.choices()) : null);
  readonly quantity = computed(() => positiveQuantity(this.quantityText()));
  readonly combo = computed(() => this.item()?evaluateCombo(this.item()!,this.variant(),this.comboChoices(),this.quantity()):null);
  readonly startingPrice = computed(() => !this.variant() || this.item()?.type==='COMBO' && !this.combo()?.complete);
  readonly addEnabled = computed(() => this.order.ready() && !!this.item() && canAdd(this.item()!, this.variant(), this.quantity())
    && (this.item()!.type!=='COMBO' || !!this.combo()?.available));
  readonly categories = computed(() => this.catalog()?.categories.filter(category =>
    this.item()?.categoryIds.includes(category.id)).map(category => category.name).join(' · ') || 'Catálogo');
  readonly price = computed(() => {
    const item = this.item(), catalog = this.catalog();
    if (!item || !catalog) return '';
    return formatMinorPrice(item.type==='COMBO'?(this.combo()?.priceMinor??minimumItemPrice(item)):(this.variant()?.priceMinor ?? minimumItemPrice(item)),
      catalog.currencyDecimals, catalog.currency);
  });

  constructor() {
    this.route.data.pipe(takeUntilDestroyed(this.destroy)).subscribe(routeData => {
      this.reset();
      const data = routeData['detail'] as ResolvedDetail | {error:true};
      this.accept('error' in data ? null : data, 'error' in data);
    });
    afterNextRender(() => this.retry.pipe(switchMap(() => {
      this.reset();
      return this.api.detail(this.route.snapshot.paramMap.get('slug') ?? '').pipe(
        map(data => ({ data, error: false })), catchError(() => of({ data: null, error: true })),
      );
    }), takeUntilDestroyed(this.destroy)).subscribe(result => {
      this.accept(result.data, result.error);
      if (result.data?.itemBySlug) this.seo.set(articleSeo(result.data.itemBySlug, result.data.catalog, this.seo.origin));
    }));
  }

  private accept(data: ResolvedDetail | null, error: boolean) {
    if (data) this.brand.set(data.catalog);
    this.item.set(data?.itemBySlug ?? null); this.catalog.set(data?.catalog ?? null);
    this.error.set(error); this.loading.set(false);
  }

  private reset() {
    this.loading.set(true); this.error.set(false); this.item.set(null); this.catalog.set(null);
    this.clearChoices(); this.quantityText.set('1'); this.message.set('');
  }

  clearChoices() { this.choices.set(Object.create(null)); this.comboChoices.set(Object.create(null)); this.message.set(''); }
  chooseComponent(groupId:string,optionId:string) { this.comboChoices.update(choices=>({...choices,[groupId]:optionId}));this.message.set(''); }
  choose(name: string, value: string) {
    const choices = Object.assign(Object.create(null), this.choices());
    if (choices[name] === value) delete choices[name];
    else choices[name] = value;
    this.choices.set(choices); this.message.set('');
  }

  add() {
    this.message.set(this.item() && this.catalog() && this.order.add(this.item()!, this.variant(), this.quantity(), this.catalog()!,this.comboChoices())
      ? 'Añadido a tu pedido.' : this.order.notice() || 'Revisa la variante, su disponibilidad y la cantidad.');
  }
}
