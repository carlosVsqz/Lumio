import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderStore } from './order-store';
import { OrderLine, subtotal, quantityFromText, lineKey } from './order-model';
import { formatMinorPrice } from '../../core/money';
import { QuantityInput } from '../../shared/ui/quantity-input';
import { UiIcon } from '../../shared/ui/ui-icon';

@Component({ selector: 'app-order-page', standalone: true, imports: [RouterLink, QuantityInput, UiIcon],
  templateUrl: './order-page.html', host: { class: 'block' },
})
export class OrderPage {
  readonly lineKey=lineKey;
  readonly store = inject(OrderStore);
  readonly edits = signal<Record<string, string>>({});
  readonly invalid = computed(() => this.store.lines().some(line => quantityFromText(this.quantityText(line)) === null));
  readonly copyMessage = signal('');
  quantityText(line: OrderLine): string { return Object.hasOwn(this.edits(), lineKey(line)) ? this.edits()[lineKey(line)] : String(line.quantity); }
  edit(line: OrderLine, text: string) {
    this.edits.update(edits => ({ ...edits, [lineKey(line)]: text }));
    // Invalidate any prepared link even when the input is temporarily invalid.
    this.store.draft.set(null); this.store.opened.set(false); this.copyMessage.set('');
    this.store.updateQuantity(lineKey(line), text);
  }
  price(minor: number | bigint) {
    const catalog = this.store.catalog();
    return catalog ? formatMinorPrice(minor, catalog.currencyDecimals, catalog.currency) : '';
  }
  subtotal(line: OrderLine) { return this.price(subtotal(line)); }
  async copy() {
    const draft = this.store.draft();
    if (!draft) return;
    try { await navigator.clipboard.writeText(draft.message); this.copyMessage.set('Mensaje completo copiado. Pégalo en WhatsApp y revisa antes de enviar.'); }
    catch { this.copyMessage.set('No se pudo copiar automáticamente. Selecciona y copia el mensaje completo del campo.'); }
  }
}
