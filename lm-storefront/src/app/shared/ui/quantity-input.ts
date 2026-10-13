import { Component, computed, input, output } from '@angular/core';
import { adjustQuantity, positiveQuantity } from '../../core/quantity';
import { UiIcon } from './ui-icon';

@Component({
  selector: 'app-quantity-input', standalone: true, imports: [UiIcon], host: { class: 'block' },
  template: `
    <label class="mb-2 block text-sm font-semibold" [for]="id()">{{ label() }}</label>
    <div class="inline-flex max-w-full items-center rounded-md border border-input-border bg-surface focus-within:border-ink">
      <button type="button" class="flex h-12 w-11 items-center justify-center rounded-l-md p-0 hover:bg-image" [attr.aria-label]="'Reducir: ' + label()" [disabled]="quantity() === null || quantity()! <= 1" (click)="step(-1)"><app-ui-icon name="minus" /></button>
      <input [id]="id()" type="number" min="1" step="1" inputmode="numeric" class="quantity-field h-12 w-16 min-w-0 bg-transparent px-1 text-center text-base tabular-nums" [value]="value()" [attr.aria-invalid]="quantity() === null" [attr.aria-describedby]="id() + '-help'" (input)="change.emit($any($event.target).value)">
      <button type="button" class="flex h-12 w-11 items-center justify-center rounded-r-md p-0 hover:bg-image" [attr.aria-label]="'Aumentar: ' + label()" [disabled]="quantity() === null || quantity()! >= maxQuantity" (click)="step(1)"><app-ui-icon name="plus" /></button>
    </div>
    <p [id]="id() + '-help'" class="mt-2 text-xs leading-5" [class.text-muted]="quantity() !== null" [class.text-unavailable-ink]="quantity() === null">{{ quantity() === null ? 'Introduce un entero positivo, sin decimales.' : 'Entero positivo, sin decimales.' }}</p>`,
})
export class QuantityInput {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly change = output<string>();
  readonly quantity = computed(() => positiveQuantity(this.value()));
  readonly maxQuantity = Number.MAX_SAFE_INTEGER;

  step(delta: -1 | 1) {
    const next = adjustQuantity(this.value(), delta);
    if (next !== null) this.change.emit(next);
  }
}
