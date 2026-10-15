import { Component, input, output } from '@angular/core';
import type { ComboGroup, ComboOption } from '../data-access/catalog.models';
import type { ComboChoices } from './combo-selection';
import { formatMinorPrice } from '../../../core/money';

@Component({selector:'app-combo-picker',standalone:true,template:`
  <section class="mt-7" aria-labelledby="combo-components-title">
    <h2 id="combo-components-title" class="text-base font-semibold">Configura tu combo</h2>
    <p class="mt-2 text-sm leading-6 text-muted">Elige una opción de cada grupo. Los recargos se suman al precio base.</p>
    @for (group of groups(); track group.id) {
      <fieldset class="mt-6 min-w-0">
        <legend class="mb-3 text-sm font-semibold">{{ group.name }} <span class="font-normal text-muted">· Elige una opción</span></legend>
        <div class="space-y-2">
          @for (option of group.options; track option.id) {
            <label class="flex min-h-14 cursor-pointer items-start gap-3 rounded-md border border-line px-4 py-3 has-[:checked]:border-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <input type="radio" class="mt-1 h-4 w-4 shrink-0 accent-current" [name]="'combo-' + group.id"
                [checked]="choices()[group.id] === option.id" [disabled]="!option.available || exceeds(option)"
                (change)="choose.emit({groupId:group.id,optionId:option.id})" />
              <span class="min-w-0 flex-1 text-sm leading-6"><span class="block font-medium">{{ option.name }}</span>
                @if (option.attributes.length) { <span class="block text-xs text-muted">@for (attribute of option.attributes; track attribute.name) { {{ attribute.name }}: {{ attribute.value }} · }</span> }
                <span class="block text-xs text-muted">{{ surcharge(option) }}</span>
                @if (!option.available) { <span class="block text-xs text-unavailable-ink">No disponible</span> }
                @else if (exceeds(option)) { <span class="block text-xs text-unavailable-ink">Stock insuficiente para esta cantidad</span> }
              </span>
            </label>
          } @empty { <p class="text-sm text-unavailable-ink">No hay opciones disponibles para este grupo.</p> }
        </div>
      </fieldset>
    }
  </section>
`})
export class ComboPicker {
  readonly groups=input.required<ComboGroup[]>(); readonly choices=input.required<ComboChoices>();
  readonly quantity=input<number|null>(1); readonly currency=input.required<string>(); readonly decimals=input.required<number>();
  readonly choose=output<{groupId:string;optionId:string}>();
  exceeds(option:ComboOption) { return option.maxQuantity!==null && this.quantity()!==null && this.quantity()!>option.maxQuantity; }
  surcharge(option:ComboOption) { return option.extraPriceMinor===0?'Sin recargo':(option.extraPriceMinor>0?'+':'−')+formatMinorPrice(Math.abs(option.extraPriceMinor),this.decimals(),this.currency()); }
}
