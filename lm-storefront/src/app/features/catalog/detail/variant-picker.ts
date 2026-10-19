import { Component, computed, input, output } from '@angular/core';
import { CatalogItem } from '../data-access/catalog.models';
import { attributeOptions, attributeChoiceState } from './variant-selection';

@Component({
  selector: 'app-variant-picker', standalone: true, host: { class: 'block' },
  template: `
    @for (option of options(); track option.name) {
      <fieldset class="mb-7">
        <legend class="mb-3 text-sm font-semibold">{{ option.name === brandAttributeName() ? 'Marca' : option.name }} <span class="ml-2 font-normal text-muted">{{ option.selected === undefined ? 'Elige una opción' : option.selected || 'No aplica' }}</span></legend>
        <div class="flex flex-wrap gap-2">
          @for (value of option.values; track value.text) {
            <button type="button" class="min-w-16 rounded-md border border-input-border px-5 py-3 text-sm font-normal hover:border-ink disabled:line-through disabled:opacity-50"
              [class.bg-ink]="option.selected === value.text" [class.text-on-ink]="option.selected === value.text"
              [attr.aria-pressed]="option.selected === value.text" [attr.aria-label]="option.name + ': ' + (value.text || 'No aplica') + (value.available ? '' : value.exists ? ', no disponible' : ', combinación inexistente')"
              [title]="value.available ? value.text || 'No aplica' : value.exists ? 'No disponible' : 'No existe con la selección actual'"
              [disabled]="!value.available" (click)="choose.emit({name: option.name, value: value.text})">{{ value.text || 'No aplica' }}</button>
          }
        </div>
      </fieldset>
    }
    @if (options().length) {
      @if (hasUnavailable()) { <p class="text-xs leading-5 text-muted">Las opciones tachadas no están disponibles con tu selección.</p> }
      @if (hasChoices()) { <button type="button" class="px-0 text-xs font-normal underline underline-offset-4" (click)="reset.emit()">Restablecer selección</button> }
    }`,
})
export class VariantPicker {
  readonly item = input.required<CatalogItem>();
  readonly choices = input.required<Record<string,string>>();
  readonly brandAttributeName = input<string>();
  readonly options = computed(() => {
    const item = this.item(), choices = this.choices();
    return attributeOptions(item, this.brandAttributeName()).map(option => ({
      name: option.name,
      selected: Object.hasOwn(choices, option.name) ? choices[option.name] : undefined,
      values: option.values.map(text => ({ text, ...attributeChoiceState(item, choices, option.name, text, this.brandAttributeName()) })),
    }));
  });
  readonly hasChoices = computed(() => Object.keys(this.choices()).length > 0);
  readonly hasUnavailable = computed(() => this.options().some(option => option.values.some(value => !value.available)));
  readonly choose = output<{name:string;value:string}>();
  readonly reset = output<void>();
}
