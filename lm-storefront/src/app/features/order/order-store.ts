import { Injectable, afterNextRender, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogApi } from '../catalog/data-access/catalog-api';
import { CatalogItem, CatalogMetadata, CatalogVariant } from '../catalog/data-access/catalog.models';
import { canAdd } from '../catalog/detail/variant-selection';
import { LocalOrder, addLine, editQuantity, lineFromItem, readOrder, quantityFromText,
  reconcileOrder, writeOrder, total, whatsappDraft } from './order-model';

@Injectable({ providedIn: 'root' })
export class OrderStore {
  private readonly api = inject(CatalogApi);
  private readonly state = signal<LocalOrder>({ catalog: null, lines: [] });
  private revision = 0;
  readonly order = this.state.asReadonly();
  readonly lines = computed(() => this.order().lines);
  readonly catalog = computed(() => this.order().catalog);
  readonly total = computed(() => total(this.lines()));
  readonly ready = signal(false);
  readonly storageWarning = signal('');
  readonly notice = signal('');
  readonly checking = signal(false);
  readonly changes = signal<string[]>([]);
  readonly blocked = signal<string[]>([]);
  readonly draft = signal<ReturnType<typeof whatsappDraft> | null>(null);
  readonly opened = signal(false);

  constructor() {
    afterNextRender(() => {
      try { this.state.set(readOrder(localStorage)); }
      catch { this.storageWarning.set('No se pudo recuperar el pedido local: los datos son inválidos o el almacenamiento está bloqueado.'); }
      this.ready.set(true);
    });
  }

  private persist() {
    if (!this.ready()) return;
    try { writeOrder(localStorage, this.order()); this.storageWarning.set(''); }
    catch { this.storageWarning.set('No se pudo guardar el pedido. Tu selección sigue en memoria, pero podría perderse al recargar.'); }
  }

  private invalidate() {
    this.revision++; this.draft.set(null); this.opened.set(false); this.notice.set('');
    this.changes.set([]); this.blocked.set([]); this.checking.set(false);
  }

  add(item: CatalogItem, variant: CatalogVariant | null, quantity: number | null, catalog: CatalogMetadata): boolean {
    if (!this.ready() || !canAdd(item, variant, quantity) || !variant || quantity === null) return false;
    try {
      const next = addLine(this.order(), catalog, lineFromItem(item, variant, quantity));
      this.invalidate(); this.state.set(next); this.persist();
      return true;
    } catch (error) { this.notice.set(error instanceof Error ? error.message : 'No se pudo añadir la línea.'); return false; }
  }

  updateQuantity(variantId: string, text: string): boolean {
    const quantity = quantityFromText(text);
    if (!this.ready() || !this.lines().some(line => line.variantId === variantId)) return false;
    this.invalidate();
    if (quantity === null) return false;
    this.state.update(order => editQuantity(order, variantId, quantity));
    this.persist(); return true;
  }

  remove(variantId: string) {
    if (!this.ready()) return;
    this.invalidate(); this.state.update(order => ({ ...order, lines: order.lines.filter(line => line.variantId !== variantId) })); this.persist();
  }

  async prepare() {
    if (!this.ready() || !this.lines().length || this.checking()) return;
    const revision = ++this.revision;
    const previous = this.order();
    this.checking.set(true); this.draft.set(null); this.notice.set(''); this.opened.set(false);
    this.changes.set([]); this.blocked.set([]);
    try {
      const snapshot = await firstValueFrom(this.api.orderSnapshot());
      if (revision !== this.revision) return;
      const result = reconcileOrder(previous, snapshot);
      this.state.set(result.order); this.persist();
      this.changes.set(result.changes); this.blocked.set(result.blocked);
      if (result.changes.length || result.blocked.length) {
        this.notice.set('Revisa los cambios del catálogo antes de preparar el mensaje.'); return;
      }
      const draft = whatsappDraft(result.order, snapshot.catalog.whatsappNumber);
      this.draft.set(draft);
      if (!draft.chatUrl) this.notice.set('El negocio no tiene un número de WhatsApp válido configurado.');
    } catch {
      if (revision === this.revision) this.notice.set('No se pudo verificar el catálogo. Inténtalo de nuevo; no se preparó ningún enlace.');
    } finally { if (revision === this.revision) this.checking.set(false); }
  }
}
