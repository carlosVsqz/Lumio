import {Component} from '@angular/core';
import {UiIcon} from '../../shared/ui/ui-icon';
import {LucideDynamicIcon,LucideShare} from '@lucide/angular';

@Component({selector:'app-install-instructions',standalone:true,imports:[UiIcon,LucideDynamicIcon],host:{class:'block'},template:`
  <p class="max-w-xl text-sm leading-6 text-muted">Elige tu dispositivo. No necesitas descargar nada desde una tienda de aplicaciones.</p>
  <div class="mt-2 grid max-w-3xl gap-x-8 sm:grid-cols-2">
    <details class="border-b border-line">
      <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold">iPhone o iPad <app-ui-icon name="chevronDown" [size]="18" /></summary>
      <ol class="list-decimal space-y-2 pb-4 pl-5 text-sm leading-6 text-muted">
        <li>Abre este catálogo en <strong class="font-semibold text-ink">Safari</strong>.</li>
        <li>Pulsa <strong class="font-semibold text-ink">Compartir</strong> <svg [lucideIcon]="shareIcon" [size]="16" [strokeWidth]="1.5" class="inline-block align-middle text-ink" aria-hidden="true" focusable="false"></svg> y elige <strong class="font-semibold text-ink">Añadir a pantalla de inicio</strong>. Según tu versión, Compartir puede estar dentro del menú de Safari.</li>
        <li>Si aparece <strong class="font-semibold text-ink">Abrir como app web</strong>, actívalo. Confirma con <strong class="font-semibold text-ink">Añadir</strong>.</li>
      </ol>
    </details>
    <details class="border-b border-line">
      <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold">Android <app-ui-icon name="chevronDown" [size]="18" /></summary>
      <ol class="list-decimal space-y-2 pb-4 pl-5 text-sm leading-6 text-muted">
        <li>Abre este catálogo en <strong class="font-semibold text-ink">Chrome</strong>.</li>
        <li>Abre el menú de <strong class="font-semibold text-ink">tres puntos</strong> y elige <strong class="font-semibold text-ink">Instalar aplicación</strong> o <strong class="font-semibold text-ink">Añadir a pantalla de inicio</strong>.</li>
        <li>Confirma con <strong class="font-semibold text-ink">Instalar</strong>. El nombre de la opción puede variar según el navegador.</li>
      </ol>
    </details>
  </div>
  <p class="mt-3 max-w-xl text-xs leading-6 text-muted">Necesitarás conexión para consultar productos y preparar tu pedido. Tus favoritos y tu selección siguen guardados en este navegador.</p>
`})
export class InstallInstructions {readonly shareIcon=LucideShare;}
