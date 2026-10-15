# Lumio

Base de monorepo para una plataforma de catálogos con consultas por WhatsApp, independiente del negocio y del proveedor de datos.

- `lm-core/`: Spring Boot 4.2.0-SNAPSHOT, Java 21, WebFlux, Spring GraphQL y Gradle Wrapper.
- `lm-storefront/`: Angular 22, TypeScript, Signals y Angular CLI (esbuild para build y Vite para desarrollo).
- `compose.yaml`: API Java y escaparate estático servido con Nginx.

## Desarrollo

Requisitos: JDK 21 y Node 24. Node se usa para herramientas de desarrollo y compilación.

Terminal 1:

```sh
./gradlew :lm-core:bootRun
```

En Windows: `gradlew.bat :lm-core:bootRun`.

Terminal 2, desde la raíz:

```sh
npm run install:storefront
npm run dev:storefront
```

Escaparate: http://localhost:4200. API: http://localhost:8080/graphql. Salud: http://localhost:8080/actuator/health.
El proxy de Angular conecta `/graphql` y `/catalog-media/**` con Spring; no se necesita CORS en este flujo.

## Contenedores

### Producción con Dokploy

La preparación de producción está separada de la demo: [`compose.production.yaml`](compose.production.yaml), [`.env.production.example`](.env.production.example) y la [guía completa de Dokploy](infrastructure/dokploy/README.md). **Dokploy compila directamente desde el repositorio**, usando `build` de Docker Compose; no requiere GHCR ni publicación previa de imágenes. Incluye Odoo con los addons, PostgreSQL con usuario de aplicación sin privilegios de superusuario, volúmenes persistentes, comprobaciones de salud y dominios/HTTPS administrados por Dokploy. No publica puertos de Java ni de PostgreSQL ni monta directorios del checkout.

Un único comando construye las imágenes, prepara PostgreSQL/Odoo, genera la integración de lectura, arranca Java, prerenderiza Angular contra GraphQL real y sirve el resultado con Nginx:

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait --wait-timeout 240
```

Las tareas `odoo-init` y `storefront-build` terminan después de preparar sus resultados; no hay servidor Node en producción. Bootstrap descubre los IDs reales y guarda la clave API en un volumen privado, accesible solo al inicializador y a Java. Angular nunca recibe credenciales. Si falla Odoo/GraphQL, no se publica un nuevo escaparate; los archivos verificados se publican de forma atómica. En despliegues posteriores se conservan usuarios, passwords y catálogo existentes, y se regeneran las páginas. `npm run release:build -- --env-file .env.production` es una ayuda opcional para construir imágenes; el arranque completo sigue siendo el comando Compose anterior.

La configuración local `.env` y sus volúmenes permanecen independientes. Producción usa `https://lumio-catalog.escod.com.gt` y `https://lumio-odoo.escod.com.gt`; los valores privados se guardan en `.env.production` y en **Environment** de Dokploy. No hay perfiles ni preparación por partes: con clave API e IDs vacíos el Compose prepara todo automáticamente. La base nueva usa español, logo L y moneda inicial `LUMIO_CURRENCY=GTQ`, sin cargar productos, stock o campañas de demostración. La guía explica los tres destinos HTTPS, incluido el WebSocket de Odoo; WhatsApp requiere el número real del negocio.

Si un arranque previo de Odoo dejó únicamente sus tablas técnicas `orm_signaling_*`, bootstrap completa la instalación sobre el mismo volumen, comprobando nombres y estructura. Las bases con tablas ajenas se conservan y bloquean la inicialización; consulta el diagnóstico de `odoo-init` en la guía antes de modificar datos.

Si ambos dominios responden `404 page not found`, ejecuta `sh scripts/Diagnose-LumioRouting.sh <proyecto-compose>` desde SSH del VPS y consulta la guía de Dokploy. El diagnóstico comprueba servicios, redes, reglas de Traefik y HTTP interno sin imprimir credenciales. Las URLs del entorno no registran dominios: ese enrutamiento se configura en Domains de Dokploy.

### Tienda demo local con Odoo real

Desde PowerShell 7 en la raíz, con Docker y Node instalados:

```powershell
./scripts/Start-LumioDemo.ps1
```

El script usa exclusivamente el proyecto Compose `lumio-demo-local` y la base `lumio_demo`. Crea `.env` desde `.env.example` si no existe, genera contraseñas locales, instala `website_sale`, `website_sale_stock`, `lumio_campaign` y `lumio_storefront`, carga el catálogo demo y genera la clave del usuario de integración. Descubre los IDs reales y los escribe en `.env` y en el ejemplo; **ninguna contraseña o clave se escribe en `.env.example`**. Los secretos adicionales de bootstrap/configuración quedan bajo `infrastructure/odoo/local/`, ignorado por Git y por el contexto Docker de lm-core.

Después inicia Java con proveedor Odoo, prerenderiza Angular contra GraphQL y levanta Nginx. URLs: **Lumio http://localhost:8088** y **Odoo http://localhost:8069/web/login**. El usuario y contraseña de administración están en `ODOO_DEMO_ADMIN_LOGIN` y `ODOO_DEMO_ADMIN_PASSWORD` del `.env` local. La contraseña maestra es `ODOO_DEMO_MASTER_PASSWORD`; no es la contraseña del usuario ni la de PostgreSQL. No copies estos secretos al chat, al frontend o a un commit.

La identidad preparada es **Lumio**, con una **L** blanca sobre negro como logo del sitio y de la compañía. El usuario administrativo previsto tiene nombre visible **Administrador de Lumio** y un login sin “demo”, guardado en el entorno privado; `/web/login` lo rellena desde un parámetro backend y nunca rellena la contraseña. El script migra el login predeterminado antiguo, conserva contraseñas existentes e instala **español `es_ES`** con sus traducciones. Aplica español al administrador, usuario público, integración, sitio y `ODOO_LANGUAGE`; el sitio local ofrece español como único idioma para que un navegador en inglés no cambie el formulario. El nombre del negocio en GraphQL procede del sitio, con `ODOO_BUSINESS_NAME` vacío. El logo se guarda en Odoo y continúa llegando a Angular por el proxy de lm-core. Se utiliza el [idioma de usuario de Odoo](https://www.odoo.com/documentation/19.0/applications/general/users/language.html) además del [idioma del sitio](https://www.odoo.com/documentation/19.0/applications/websites/website/configuration/translate.html).

`infrastructure/odoo/demo/configure_identity.py` separa estos ajustes de la fixture del catálogo: se puede ejecutar explícitamente mediante Odoo shell en la base local con los mounts privados y de scripts, llamando a `configure_identity(env, settings)` y confirmando la transacción. No cambia productos, stock, precios, campañas ni la contraseña administrativa. `seed.py` también lo aplica al preparar la tienda, de modo que una nueva carga mantiene la misma identidad. Estas escrituras son una tarea administrativa local, fuera del proveedor de catálogo de solo lectura.

El catálogo contiene **14 artículos publicados, 17 variantes, cuatro categorías y dos campañas**. Hay talla/color, una combinación sin stock, un artículo agotado y un servicio. También hay un producto interno y una campaña borrador que no deben publicarse. La tarifa demo tiene reglas por variante distintas del precio base: la camiseta cuesta 109.00 o 129.00 GTQ en GraphQL, frente al precio base de 125.00 de su plantilla. Los saldos libres se cargan exclusivamente en el almacén demo. Las imágenes son ilustraciones de prueba identificadas como demo, no fotografías comerciales. WhatsApp queda vacío hasta configurar un número propio válido.

Verificación local realizada: se ejecutó el proceso completo y se volvió a cargar la fixture sin duplicar artículos/variantes ni cambiar sus referencias. GraphQL, precio de tarifa, combinación sin stock, servicio, publicación/borrador y proxy PNG funcionaron contra Odoo real. Angular verificó 14 fichas y generó 17 rutas estáticas; Nginx pasó `nginx -t`. En navegador, 390/1440 px: paginación, selección explícita de variantes, pedido y bloqueo de WhatsApp sin número, favoritos, tema oscuro e hidratación. También se probaron el acceso administrativo de Odoo y las vistas reales de campañas. Se comprobó que `.env.example` y el artefacto del frontend no contienen las credenciales generadas.

Se puede ejecutar `-Stage Prepare` para generar solo configuración privada o `-Stage Seed` para preparar únicamente Odoo y sus datos. **Volver a ejecutar el script completa/reaplica la fixture**: conserva referencias estables y reutiliza la clave vigente, pero restablece contenido, precios, stock y acceso administrativo de los registros demo. Para conservar tus ajustes y simplemente reiniciar los servicios, usa:

```powershell
docker compose --env-file .env --profile odoo up -d
# Detener conservando los datos:
docker compose --env-file .env --profile odoo stop
```

Las imágenes y el HTML ya generado se conservan al reiniciar. Después de editar el catálogo en Odoo, vuelve a ejecutar el build Angular y reconstruye Nginx según el proceso estático. No uses el seeding en otra base: el script rechaza otros nombres de base/proyecto. La carga inicial es una tarea administrativa explícita de esta demo; lm-core conserva integración de solo lectura y no crea contactos de clientes, pedidos, cotizaciones ni reservas.

### Publicación de un catálogo configurado

```sh
cp .env.example .env
# Para JSON: CATALOG_PROVIDER=json. Para Odoo completa su configuración privada;
# en la demo local usa primero el script de la sección anterior.
# Ajusta CATALOG_DIRECTORY y CATALOG_LOCATION si usarás otro catálogo.
# 1. Iniciar la API Java con ese catálogo:
docker compose up -d --build lm-core
# 2. Instalar herramientas, configurar URLs y generar/verificar el HTML:
npm run install:storefront
CATALOG_BUILD_API_URL=http://localhost:8080/graphql PUBLIC_SITE_URL=http://localhost:8088 npm run build:storefront
# 3. Empaquetar los archivos generados y servirlos con Nginx:
docker compose up -d --build --no-deps lm-storefront
```

Escaparate: http://localhost:8088. Compose monta `CATALOG_DIRECTORY` del host en `/catalog` como solo lectura; `CATALOG_LOCATION` indica el archivo dentro del contenedor (por defecto `file:/catalog/example.json`). No es una base de datos ni un volumen de pedidos: solo es la configuración de entrada.

En PowerShell, antes del comando npm: `$env:CATALOG_BUILD_API_URL='http://localhost:8080/graphql'` y `$env:PUBLIC_SITE_URL='http://localhost:8088'`. Las variables de `.env` las lee Compose; npm no las carga automáticamente. La URL del build debe ser accesible desde la máquina que ejecuta Node. El Dockerfile de `lm-storefront` copia `dist/lm-storefront/browser` y exige el marcador del build verificado: **hay que compilar antes de construir su imagen**. Si falta el artefacto, falla; ya no compila Angular dentro de Docker.

Configura el negocio y WhatsApp dentro del JSON o mediante las variables `ODOO_BUSINESS_*` y `ODOO_WHATSAPP_NUMBER` cuando uses Odoo. El enlace de consulta aparece únicamente para artículos y variantes disponibles cuando existe un número válido. El usuario confirma el envío en WhatsApp; no registra pedidos en servidor ni en Odoo.

## Aplicación instalable (PWA)

La compilación de producción incluye el service worker oficial `@angular/service-worker`, manifest e iconos PNG de 192/512 px, icono maskable y Apple Touch Icon. El nombre y descripción del manifest provienen del negocio consultado durante el build; el ID, inicio y ámbito de instalación son `/` dentro del origen público. **Los iconos y el splash se generan a partir de `catalog.branding.logoUrl`**, el mismo logo del encabezado y del footer. Las rutas relativas se consultan contra lm-core (`CATALOG_BUILD_API_URL`), sin credenciales de Odoo. `sharp` se utiliza únicamente al compilar: conserva proporciones y deja margen seguro para máscaras Android, con fondo blanco. Si no hay logo configurado se usa la L genérica; si hay uno configurado y no se puede obtener o procesar, el build falla explícitamente. Se admiten imágenes PNG/JPEG/WebP/SVG compatibles con sharp, hasta 5 MiB y 16 millones de píxeles. No se envían datos privados al manifest.

La instalación requiere **HTTPS** en producción; `localhost` sirve para probarla. El footer ofrece una **sugerencia integrada en la página**, sin modal, sin interrumpir la compra y sin abrir diálogos automáticamente. **Ahora no** la oculta durante 30 días en ese navegador (`lumio.pwa.suggestion.v1`, localStorage versionado); con almacenamiento bloqueado se oculta durante la visita. No se muestra instalada ni sin conexión. Las instrucciones siguen disponibles desde el footer después de descartarla. En navegadores que expongan la invitación, **Instalar aplicación** abre el diálogo únicamente al pulsarlo; cancelar también descarta la sugerencia. Las instrucciones desplegables distinguen iPhone/iPad (Safari → Compartir → Añadir a pantalla de inicio, activar Abrir como app web si aparece → Añadir) y Android (Chrome → menú de tres puntos → Instalar aplicación/Añadir a pantalla de inicio → confirmar), sin inferir el sistema por el user-agent. Véanse las [instrucciones de Apple](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios) y [Angular PWA](https://angular.dev/ecosystem/service-workers/getting-started).

El splash web muestra únicamente el logo al cargar el documento y se desvanece al terminar el primer render de Angular, **sin duración mínima artificial**, sin capturar foco/clics y respetando movimiento reducido. Una interacción, un error de imagen o el límite de 3 segundos lo retira también si falla JavaScript de la aplicación; con JavaScript desactivado permanece oculto. No vuelve a aparecer al navegar entre páginas. Está fuera de `app-root` para conservar la hidratación y funciona también en la estructura CSR sin conexión. Android genera además su pantalla de arranque nativa desde el manifest y el icono de la marca; **iOS no genera esa pantalla nativa a partir del manifest**: esta versión muestra el splash web cuando carga el documento, sin imágenes `apple-touch-startup-image` específicas por dispositivo. Véase [manifest y diferencias entre plataformas](https://web.dev/learn/pwa/web-app-manifest).

Al cambiar el logo o la identidad, vuelve a generar y desplegar los estáticos junto con `ngsw.json`. El sistema operativo puede conservar el icono de una instalación anterior; para verificar la nueva marca puede ser necesario quitar el acceso anterior y volver a instalar. Una aplicación instalada abre en modo standalone. La configuración incluye áreas seguras para móviles y mantiene el zoom accesible. La disponibilidad del diálogo y el comportamiento de la barra del sistema dependen del navegador/dispositivo.

La caché guarda únicamente la estructura CSR y los archivos locales de la aplicación (JS, CSS, fuentes e iconos), con versiones y navegación que intenta primero la red. **No guarda GraphQL, imágenes autenticadas ni HTML prerenderizado de productos**. Sin conexión puede abrir la interfaz y recuperar la selección local, pero consultar catálogo, disponibilidad/precios y preparar WhatsApp requieren la API. El aviso sin conexión lo indica; los errores no borran pedido ni favoritos. No garantiza disponibilidad ni convierte las copias locales en datos vigentes.

Las actualizaciones se descargan en segundo plano. Cuando hay una versión lista, el footer ofrece **Actualizar aplicación**; recarga únicamente con esa acción o con una recarga normal. No se cambia la versión a mitad de una sesión ni se recarga automáticamente mientras el usuario edita su selección. En desarrollo el service worker permanece desactivado.

`npm run build` genera el manifest del negocio y vuelve a generar `ngsw.json` **después** de escribir los artefactos finales; verifica iconos, política de caché y el hash del manifest para no publicar una caché inconsistente. Nginx entrega `ngsw.json`, `ngsw-worker.js`, `theme-init.js` y el manifest sin caché HTTP permanente, con rutas exactas y 404 real cuando faltan. Dokploy sigue compilando todo con `compose.production.yaml` y Nginx sirve los archivos; no hay servidor Node en producción.

Para verificar: compila con lm-core activo y sirve Nginx por HTTPS o localhost; revisa Application → Manifest / Service Workers en DevTools. Espera la activación inicial, recarga y prueba sin conexión: la interfaz debe abrir y preparar WhatsApp debe fallar explícitamente sin producir un enlace. Vuelve a conectar y verifica el pedido. Para comprobar actualizaciones, mantén una pestaña abierta, despliega un build nuevo y vuelve a enfocar la aplicación: debe aparecer la acción de actualizar. Prueba también la instalación desde Android y Safari/iOS en dispositivos reales; la emulación no reproduce el diálogo del sistema ni todas las áreas seguras.

## Catálogo configurable

El ejemplo está en `lm-core/src/main/resources/catalog/example.json`: incluye una camiseta con talla/color y un servicio con una variante sin atributos. Su imagen de ejemplo se sirve desde `lm-storefront/public/images/camiseta.svg`.

Sin configuración, Spring carga `classpath:catalog/example.json`. Para cargar un archivo externo en desarrollo, define `CATALOG_LOCATION=file:./catalogo.json` antes de iniciar Java; en PowerShell: `$env:CATALOG_LOCATION='file:./catalogo.json'`. También se admite una ruta absoluta `file:` o la propiedad `--lumio.catalog.location=file:...`. Spring no carga `.env` automáticamente; ese archivo lo usa Compose.

El archivo declara `name`, `description`, `currency` (código ISO 4217), `currencyDecimals` (entero de 0 a 6), `whatsappNumber`, `categories` e `items`. El número puede estar vacío; cuando se configure debe contener entre 8 y 15 dígitos internacionales, sin `+` ni espacios. Los precios pertenecen a las variantes: `priceMinor` es un entero entre 0 y 2147483647, con valor real `priceMinor / 10^currencyDecimals`. Por ejemplo, 12500 con 2 decimales representa 125.00; 123456 con 3 representa 123.456. El frontend convierte el importe con aritmética entera, sin redondeo de punto flotante.

Validación al iniciar:

- IDs con letras, dígitos, guiones o guiones bajos, únicos por tipo; los IDs de variantes son únicos en todo el catálogo.
- Slugs en minúsculas con palabras separadas por guiones: categorías y artículos únicos por tipo; variantes únicas dentro de cada artículo.
- Referencias `categoryIds` existentes y sin duplicados.
- Al menos una variante por artículo. Los atributos son pares `name`/`value`, sin nombres repetidos ni combinaciones idénticas dentro de un artículo, independientemente del orden.
- Precios y decimales enteros JSON, sin coerción de cadenas o fracciones; disponibilidad booleana explícita.
- Imágenes con URL HTTP(S) o ruta desde `/`, y texto alternativo no vacío. Se permiten listas vacías de imágenes, categorías y atributos.

Los campos del ejemplo son obligatorios, aunque algunas cadenas y listas puedan estar vacías. Un archivo ilegible, JSON mal formado o datos inválidos impiden iniciar la API y reportan la ubicación del archivo y el campo cuando corresponde. El proveedor carga una instantánea inmutable; después de editar el archivo debes reiniciar la API (`docker compose restart lm-core`). No hay recarga automática.

El dominio y `CatalogValidator` no dependen de JSON ni de proveedores externos. `JsonCatalogProvider` adapta el archivo al contrato `CatalogProvider.catalog()`; futuros proveedores entregarán el mismo modelo.

Cada artículo puede declarar `type: "PRODUCT"` o `type: "SERVICE"`; GraphQL expone `CatalogItemType!`. Un tipo inválido impide iniciar Java. Por compatibilidad, omitirlo significa `PRODUCT`; declara `SERVICE` explícitamente en servicios. No se infiere el tipo a partir de categorías ni de atributos.

## Navegación del catálogo

El escaparate consulta `itemPage` mediante GraphQL y presenta **Cargar más**: empieza con 12 artículos y añade el siguiente bloque al mismo listado, conservando las tarjetas visibles. Descarga únicamente los bloques necesarios. IDs repetidos se actualizan sin duplicar tarjetas. La búsqueda se aplica a nombre y descripción, sin distinguir mayúsculas ni acentos. El filtro usa el ID de categoría; búsqueda y categoría se combinan antes de calcular el total y paginar. El orden predeterminado conserva la instantánea del proveedor. `sort` admite `CATALOG_ORDER`, `NAME_ASC`, `PRICE_ASC` y `PRICE_DESC`: se aplica antes de paginar, con desempate por ID. El precio ordenado es el mismo mínimo mostrado en la tarjeta (variantes disponibles, o todas si el artículo está agotado). `availableOnly=true` exige disponibilidad del artículo y de al menos una variante.

La URL es la fuente del estado aplicado: `/?q=camiseta&category=ropa&sort=price-asc&available=1&page=2`. Ahora `page=2` indica los bloques 1 y 2 acumulados. Recargar o volver desde una ficha restaura esos bloques en secuencia, hasta el máximo disponible. Cada carga adicional reemplaza la entrada actual en la URL y conserva el desplazamiento; con teclado, el foco pasa al primer artículo nuevo. Enviar búsqueda o cambiar categoría, disponibilidad u orden reinicia el listado desde el primer bloque y cancela solicitudes anteriores. El orden URL usa `catalog`, `name-asc`, `price-asc` o `price-desc`; valores desconocidos se normalizan al predeterminado. Los valores vacíos y `page=1` se omiten; páginas inválidas se normalizan a 1 y una profundidad mayor que el último bloque se normaliza a la última disponible.

Mientras se cargan más artículos el botón queda deshabilitado y los anteriores permanecen visibles. Un error ofrece **Reintentar**, sin borrar lo cargado ni avanzar la URL; al terminar se indica que se ha visto todo el listado. Si cambia la identidad del catálogo entre bloques se recarga el listado al reintentar, evitando mezclar negocios. La carga inicial, acumulación, filtros y reintentos usan Signals, sin descargar todo el catálogo ni añadir una biblioteca de estado.

El panel lateral contiene búsqueda, **Características** con casillas y cantidades por valor, y disponibilidad. La categoría se elige desde la navegación del encabezado; no se repite un selector en las facetas. Los grupos y valores vienen de `itemPage.facets`, calculados en lm-core sobre los productos del contexto de búsqueda/categoría/disponibilidad, antes de paginar. Varios valores del mismo atributo se combinan con OR; atributos diferentes con AND. Si los atributos corresponden a variantes, deben coincidir en una misma variante; `availableOnly` exige que esa combinación esté disponible. Los conteos excluyen el filtro del propio grupo para permitir añadir alternativas y cuentan productos, no variantes. Las opciones sin coincidencias quedan deshabilitadas; las seleccionadas se pueden quitar aunque su cuenta sea cero. Las selecciones desconocidas producen un estado vacío y siguen visibles para retirarlas. No se infieren colores, materiales u otras características a partir de nombres, imágenes o categorías.

El encabezado conserva **Todo el catálogo**, muestra hasta tres familias principales en escritorio amplio y ofrece **Categorías**. El megamenú se extiende bajo el encabezado y organiza las familias y subcategorías reales en columnas; se abre con hover de ratón, clic o teclado, y admite Escape, cierre exterior y retorno del foco. En móvil las familias con descendientes usan secciones expandibles. Las opciones son enlaces que conservan búsqueda, atributos, disponibilidad y orden en la URL, reiniciando la paginación. El footer reutiliza la navegación agrupada. No se inventan agrupaciones a partir del nombre ni se usan tipos de producto para crear categorías.

Cada categoría expone `parentId: ID` opcional en GraphQL. En JSON se puede omitir o declarar `null` para una categoría principal; las referencias a padres desconocidos y los ciclos impiden cargar el catálogo. Los proveedores anteriores siguen siendo compatibles. El filtro de una categoría principal incluye sus subcategorías a cualquier profundidad, antes de contar, filtrar atributos y paginar, sin duplicar productos. Odoo adapta `product.public.category.parent_id`; si un padre pertenece a otro sitio o no es visible para el usuario API, su hija visible se presenta como principal. Los catálogos sin jerarquía mantienen sus categorías como grupos independientes. Para modificar las familias en Odoo, edita la categoría pública del comercio electrónico y su campo **Categoría padre**; no las categorías internas de inventario. Véase el [modelo oficial de Odoo 19](https://github.com/odoo/odoo/blob/19.0/addons/website_sale/models/product_public_category.py).

Este cambio requiere desplegar juntos lm-core y lm-storefront y regenerar los archivos estáticos: el frontend consulta `parentId` y no puede recuperar una jerarquía que el esquema anterior no exponía. La navegación usa HTML cerrado por defecto en prerenderizado y el Popover API del navegador durante la interacción; no añade bibliotecas ni servidor Node en producción.

Las selecciones usan `attributes` en la URL, como JSON codificado de `[{"name":"Talla","values":["M","L"]},{"name":"Color","values":["Azul"]}]`. Se conservan al recargar, ordenar, buscar, cambiar categoría o cargar más; cambiar un filtro reinicia desde el primer bloque y cancela respuestas anteriores. Las etiquetas sobre la cuadrícula permiten quitar cada valor y **Limpiar filtros** reinicia la selección. El backend valida hasta 16 atributos, 32 valores por atributo, nombres de 120 caracteres y valores de 200, sin duplicados ni textos vacíos. Angular valida/canoniza la URL y limita a 4000 caracteres su parámetro de atributos una vez codificado; deshabilita selecciones adicionales que superarían el presupuesto, conservando las existentes.

En JSON/demo, cada artículo puede declarar `attributes: [{"name":"Material","value":"Algodón"}]` como características de clasificación, incluso con varios valores del mismo nombre; además se incorporan sus atributos de variantes. Los archivos anteriores siguen funcionando. En Odoo se leen `product.template.attribute.line` y sus `product.template.attribute.value` activos, incluyendo atributos con creación de variantes **Nunca**. `product.attribute.visibility=hidden` los excluye de filtros, sin quitar las opciones de variante necesarias en la ficha. Configura esos datos en **Sitio web → Comercio electrónico → Atributos** y asígnalos a los productos: [atributos y visibilidad en Odoo 19](https://www.odoo.com/documentation/19.0/applications/sales/sales/products_prices/products/variants.html). El usuario API necesita lectura sobre las líneas y valores de atributos, incluida en la demo. Una categoría sin atributos configurados muestra únicamente sus controles generales; no se inventan filtros para completarla.

Las tarjetas muestran la primera imagen (con alternativa si falta o falla), nombre, categoría, precio mínimo entre variantes disponibles y disponibilidad conjunta del artículo y sus variantes. Cuando no hay variantes disponibles se muestra el menor precio configurado junto a **No disponible**. Las tarjetas muestran categoría y cantidad de variantes, y enlazan imagen/nombre a la ficha para elegir atributos. Las consultas por WhatsApp se preparan desde la lista de pedido, después de verificar el catálogo actual.

Hay estados separados de carga, error con reintento y resultados vacíos. Los controles tienen etiquetas, foco visible y tamaños adecuados para móvil; los resultados se anuncian con una región de estado. El encabezado identifica la categoría o el pedido activo. Cambiar de ruta lleva el foco al contenido y restaura el desplazamiento; aplicar filtros conserva el foco del formulario. Las solicitudes anteriores se cancelan al navegar para evitar que una respuesta atrasada sobrescriba los filtros actuales.

```graphql
query Browse($search: String, $category: ID, $page: Int!, $size: Int!, $sort: CatalogSort = CATALOG_ORDER, $availableOnly: Boolean = false, $attributes: [CatalogAttributeFilterInput!]) {
  catalog {
    name description currency currencyDecimals whatsappNumber
    branding { logoUrl primaryColor }
    categories { id slug name }
  }
  itemPage(search: $search, categoryId: $category, page: $page, pageSize: $size, sort: $sort, availableOnly: $availableOnly, attributes: $attributes) {
    totalCount totalPages page pageSize
    facets { name values { value count } }
    items {
      id slug name description categoryIds available images { url alt }
      variants { id slug name priceMinor available attributes { name value } }
    }
  }
}
```

`page` empieza en 1. `pageSize` admite de 1 a **50**, con valor predeterminado 12, que también usa Angular. La búsqueda admite hasta 200 caracteres. Valores inválidos producen errores GraphQL `BAD_REQUEST`; no se recortan silenciosamente los tamaños de página. Una categoría desconocida o una página fuera de rango devuelve una lista vacía con los totales correctos. No se usa `Float` para precios.

La PLP usa filtros laterales en escritorio y panel desplegable en móvil, encabezado con categorías, título/cantidad y cuadrícula de dos columnas en móvil y tres en escritorio amplio. La PDP separa galería y compra, con información apilada en móvil. No se incluyen reseñas, descuentos, recomendaciones ni condiciones de envío ausentes. La sección desplegable de referencia aparece cuando existe una variante seleccionada.

La galería de la PDP muestra **una imagen principal a la vez**, con miniaturas, flechas y desplazamiento horizontal en móvil y escritorio. Al elegir todos los atributos usa `CatalogVariant.images`; no elige variantes al pulsar una foto. En JSON cada variante puede declarar `images: [{url, alt}]`: omitirlo hereda las imágenes del artículo, mientras que `[]` declara que esa variante no tiene imagen. Las URLs y textos alternativos se validan también a nivel de variante. En Odoo, una imagen propia de variante sustituye a la principal de la plantilla; sin imagen propia se hereda la plantilla. Se añaden las imágenes adicionales compartidas y únicamente las adicionales de esa variante, según las relaciones reales `product_tmpl_id` / `product_variant_id`. No se deducen asociaciones por posición o nombre de archivo. Véase la [herencia de imágenes de Odoo 19](https://github.com/odoo/odoo/blob/19.0/addons/product/models/product_product.py).

**Ampliar** abre un visor con zoom de 100–300 %, restablecer, navegación y desplazamiento para explorar la foto. Admite teclado (`+`, `-`, `0`, flechas al 100 % y Escape), mantiene el foco dentro del visor y lo devuelve a la imagen activa al cerrar. En móvil conserva el desplazamiento táctil y el zoom nativo del navegador; no deshabilita el zoom de accesibilidad. Se carga al solicitarlo y no interviene en el prerenderizado. La nitidez máxima depende de la imagen disponible; el proxy de Odoo conserva su resolución de 1024 px. Para desplegar esta mejora, actualiza **lm-core y lm-storefront juntos** y regenera los estáticos, porque la PDP consulta el nuevo campo GraphQL.

El código del frontend está en `features/catalog/`: `data-access` contiene tipos, cliente GraphQL, parámetros URL, acumulación y estado con Signals; `ui` contiene filtros, tarjetas y control de carga adicional; `catalog-page` coordina la ruta. `App` mantiene la estructura global y el foco entre rutas; `shared/ui` reúne encabezado, imagen/placeholder, iconos y selector de cantidad reutilizable por detalle y pedido. `core/branding-store` comparte la identidad transferida durante prerenderizado para conservar la hidratación. No hay biblioteca de estado ni configuración Vite adicional.

La [auditoría del frontend](docs/frontend-audit.md) recoge los hallazgos, las correcciones, capturas antes/después y los límites de la validación responsive y de accesibilidad.

El encabezado organiza identidad, categorías, buscador y accesos de favoritos/pedido en una fila en escritorio. En móvil mantiene los accesos junto a la identidad, un buscador completo y acceso al megamenú de categorías mediante familias expandibles. El buscador consulta el catálogo real y conserva la búsqueda en la URL. Los iconos usan [Lucide para Angular](https://lucide.dev/guide/angular/getting-started), mediante un componente compartido que importa únicamente los iconos utilizados.

El encabezado permanece sticky al desplazarse y su sombra aparece con una transición de opacidad de 160 ms. Respeta movimiento reducido. Los filtros y la información de compra tienen offsets adaptados al encabezado en escritorio, y el desplazamiento a controles o anclas reserva espacio para él.

### Marcas en el encabezado y en las facetas

El encabezado incluye un megamenú **Marcas** independiente del de categorías: muestra únicamente las marcas presentes en el catálogo publicado, ordenadas A–Z, con buscador local y cantidad de artículos. Admite clic/táctil, teclado, Escape y cierre al navegar o pulsar fuera. No usa logos ni marcas inventadas; si no hay datos, muestra un estado vacío.

Configura `CATALOG_BRAND_ATTRIBUTE=Marca` en el backend (valor predeterminado). Debe coincidir exactamente con el nombre del atributo de clasificación, en el idioma de los datos; por ejemplo, usa `Brand` si ese es su nombre en Odoo. Compose local y de producción propagan esta variable; no requiere credenciales nuevas ni instalar un módulo de marcas. En Odoo crea o utiliza ese atributo público, configura su visibilidad para filtros y, para tratarlo como clasificación sin elección en la PDP, usa creación de variantes **Nunca**. Asigna sus valores reales a los productos publicados. Se reutilizan las líneas de atributos ya adaptadas por `CatalogProvider`; los atributos ocultos de clasificación no se publican como marcas. En JSON usa, por ejemplo, `"attributes": [{"name":"Marca","value":"Nombre real de la marca"}]` dentro del artículo, sin añadirlo a los atributos de sus variantes.

GraphQL expone `catalog { brandFacet { name values { value count image { url alt } } } }` sin descargar productos para resolver el menú. `image` es opcional. Sus conteos son globales y cuentan artículos, incluyendo los no disponibles. Las facetas de la PLP muestran **Marcas** antes de las demás características y calculan sus conteos según búsqueda, categoría y disponibilidad. Ambas superficies usan el mismo filtro `attributes` y los límites existentes; la selección se conserva al recargar, compartir la URL o volver con el navegador. Se puede combinar más de una marca (OR), además de otras características (AND). Un enlace del megamenú comienza una consulta de esa marca en todo el catálogo, limpiando búsqueda, categoría y profundidad de carga anteriores; no añade artículos al pedido.

El megamenú muestra imágenes de marca con proporción conservada, nombre y conteo, en una cuadrícula de dos a seis columnas. Mantiene los colores originales del logo sobre una superficie blanca también en tema oscuro. Al pasar el cursor, la imagen aumenta suavemente un 4% durante 160 ms; el foco por teclado es inmediato y el movimiento se desactiva con la preferencia de movimiento reducido. Las imágenes se cargan de forma diferida, con espacio reservado. Si faltan o fallan, aparece **Sin imagen**, sin sustituirlas por fotografías de productos ni logos inventados.

En Odoo, abre el atributo configurado como marca y carga la imagen en cada valor. La vista nativa muestra el campo al elegir presentación **Imagen** o **Color**; esto no cambia la configuración **Nunca** para creación de variantes. Odoo 19 guarda esa imagen en `product.attribute.value.image`, limitada a 70×70 px, y la relaciona como `product.template.attribute.value.image`: es adecuada para esta miniatura, no para un banner. El adaptador descubre el campo y publica `/catalog-media/attribute/ID`; lm-core comprueba que el valor esté activo, visible y vinculado a un producto publicado del sitio y compañía configurados antes de servir la imagen autenticada. No expone credenciales ni requiere otro addon. Si el mismo nombre de marca aparece en varios registros, se usa la primera imagen disponible del proveedor. Referencias: [modelo de Odoo 19](https://github.com/odoo/odoo/blob/19.0/addons/product/models/product_attribute_value.py), [vista de atributos](https://github.com/odoo/odoo/blob/19.0/addons/product/views/product_attribute_views.xml).

Con proveedor JSON, configura metadatos opcionales `attributeImages` en la raíz del catálogo. El nombre y valor deben coincidir exactamente con la clasificación del producto; las imágenes por sí solas no crean marcas en el menú:

```json
"attributeImages": [
  {"name":"Marca", "value":"Nombre real de la marca", "image":{"url":"https://tu-dominio.example/marca.png", "alt":"Nombre real de la marca"}}
]
```

Se validan claves únicas por nombre/valor y URLs públicas HTTP(S) sin credenciales o rutas que comiencen con `/`. El dominio conserva estos metadatos independientemente de JSON y Odoo; las imágenes no participan en la identidad o selección de variantes.

Si cambias el nombre del atributo, reinicia lm-core. Si cambias marcas/publicaciones o el nombre configurado, regenera los estáticos para actualizar el encabezado prerenderizado. Despliega backend y frontend juntos por el nuevo campo GraphQL. Las marcas son valores del atributo; al renombrar un valor, sus URLs anteriores pueden quedar sin resultados y permiten quitar el filtro.

Debajo del encabezado, el carrusel de campañas muestra mensajes y enlaces del proveedor activo mediante `campaigns { id title message actionLabel actionUrl }`. Avanza automáticamente cada seis segundos, con control de pausa/reanudación y flechas accesibles. Se pausa con mouse/foco dentro del carrusel o pestaña oculta, y se desactiva con movimiento reducido. No deja espacio cuando la lista está vacía. Su HTML se prerenderiza, se hidrata con los mismos datos y se refresca en el navegador cada 60 segundos visibles. Odoo requiere el addon incluido `lumio_campaign` y `ODOO_CAMPAIGNS_ENABLED=true`; el valor predeterminado conserva las instancias sin el módulo. Consulta la [configuración, permisos, vigencia y verificación de campañas](docs/odoo-campaigns.md). Los dos mensajes de demo están identificados como contenido de ejemplo; nunca sustituyen una falla de Odoo.

El buscador del encabezado y el de los filtros usan el mismo componente y texto compartido con Signals: escribir en cualquiera actualiza ambos, y enviar aplica la búsqueda en la URL y vuelve a la primera página conservando categoría y orden. Repetir la misma búsqueda vuelve a consultar los resultados. El campo usa un fondo suave derivado del color del negocio y la lupa su color accesible; el foco del input se señala reforzando el trazo de la lupa, sin líneas debajo ni marco exterior. La respuesta al mouse/pulsación utiliza transiciones CSS de 120 ms, sin mover el texto ni animar acciones de teclado, y respeta movimiento reducido.

El pie compartido muestra el nombre y descripción configurados del negocio, navegación al catálogo/categorías y accesos a favoritos y pedido. Se apila en móvil y organiza tres columnas en escritorio; usa los mismos colores, tipografía e iconos. El acceso a WhatsApp pasa por la revisión del pedido. La moneda procede del catálogo y no se añaden teléfonos, políticas ni enlaces comerciales ficticios.

El selector de tema está **únicamente en el footer**, con iconos Lucide de luna/sol. Sin preferencia explícita, siempre se muestra claro, aunque el sistema use oscuro. La elección `light`/`dark` se guarda con la clave versionada `lumio.theme.v1` de localStorage, se conserva al recargar/reabrir y se sincroniza entre pestañas del mismo origen. Los valores inválidos o eliminados vuelven a claro. Si el almacenamiento está bloqueado, el cambio funciona durante la visita y se informa que no pudo guardarse. `theme-init.js` aplica la preferencia antes de pintar; Angular restaura el estado después de hidratar sin acceder al navegador durante prerenderizado. El color de la barra del navegador sigue la selección.

Los temas comparten tokens para fondos, texto, controles, estados y overlays de vista rápida. Las imágenes y logos conservan sus colores originales. En oscuro se aclara el color de negocio cuando hace falta para mantener contraste de textos y botones; los contadores mantienen fondos fuertes con texto blanco y las variantes seleccionadas usan texto inverso. No se introduce persistencia de tema en el backend.

El encabezado principal y el footer comparten `StoreBrand`: muestran la misma imagen de `catalog.branding.logoUrl`, con nombre accesible y enlace al inicio. Si no hay imagen o no carga, muestran el nombre del negocio. Con proveedor Odoo, lm-core descubre y lee `website.logo` del sitio configurado por `ODOO_WEBSITE_ID`; prevalece sobre `LUMIO_LOGO_URL`, que queda como respaldo. Cambia el logo en el editor/configuración de ese sitio Odoo. El navegador recibe `/catalog-media/logo/ID`, nunca la URL ni credenciales del ERP. El proxy solo permite ese sitio, sin caché, y admite PNG, JPEG, GIF, WebP y SVG estático validado sin scripts, eventos, entidades o referencias externas. Regenera Angular y Nginx para actualizar el branding prerenderizado al cambiar su presencia o configuración; sustituir la imagen del mismo sitio se refleja al volver a cargarla.

`infrastructure/odoo/addons/lumio_storefront` simplifica `/web/login`: únicamente el formulario de usuario/contraseña, sin header, footer, logo, promoción, bloques comerciales, selector de usuarios anteriores ni opciones de passkey/OAuth en esa pantalla. Mantiene el formulario, POST, token CSRF, errores, contraseña y controladores originales de Odoo. No añade autenticación a Lumio ni modifica el catálogo de Odoo. Usa herencia de [vistas QWeb de Odoo 19](https://www.odoo.com/documentation/19.0/developer/reference/user_interface/view_records.html). Para instalarlo en una base existente, con su servicio Odoo detenido: `docker compose --env-file .env run --rm -T --no-deps odoo odoo -d NOMBRE_BASE -i lumio_storefront --stop-after-init --no-http`; después inicia Odoo. Para actualizarlo usa `-u lumio_storefront`. La demo lo instala automáticamente.

El tema cubre todo el documento: catálogo, fichas, campañas, filtros, búsqueda, favoritos, pedido, estados de carga/error/vacío, mensajes y diálogos. Los colores del negocio también se publican en la raíz después de hidratar para componentes fuera de `app-root`. Controles nativos, opciones de select, selección de texto, scrollbars, sombras y fondo del modal siguen la misma paleta. El único selector continúa en el footer.

La interfaz de **Odoo** tiene una identidad neutral propia: `lumio_storefront/static/src/scss/primary_variables.scss` sustituye el morado de marca por negro `#171717`, acciones `#262626` y grises `#303030`, `#404040`, `#525252`. El módulo antepone estos tokens a `web._assets_primary_variables`, de modo que Odoo deriva botones, enlaces, foco, selección y barra administrativa; la paleta de sitio web/acceso usa los mismos tonos. Los fondos de contenido conservan su legibilidad y los estados semánticos de error/éxito mantienen su función. Es una extensión por [assets de Odoo 19](https://www.odoo.com/documentation/19.0/developer/reference/frontend/assets.html), sin editar sus archivos originales. Aplica cambios con `-u lumio_storefront`, reinicia Odoo y recarga el navegador para obtener el nuevo bundle. Esta paleta es independiente del tema y del color de negocio de Angular.

Las tarjetas incluyen **Vista rápida**, disponible también en móvil y con teclado. Abre un diálogo de Angular CDK con imágenes, categoría, descripción, precio mínimo disponible y disponibilidad de los datos ya cargados para esa tarjeta, sin otra descarga del catálogo. Escape, cerrar o pulsar el fondo devuelven el foco al botón; el fondo no se desplaza mientras está abierto. **Ver ficha y elegir opciones** abre la PDP con sus consultas y validaciones habituales: la vista rápida no elige variantes ni añade al pedido. El diálogo conserva los colores del negocio y el fallback de imágenes.

Los corazones compartidos responden al hover/pulsación y al cambio de selección con transiciones CSS de escala de 120 ms usando `--ease-out`. El estado seleccionado conserva relleno y color accesible. Las acciones de teclado cambian el estado directamente y movimiento reducido elimina la escala; las animaciones no alteran persistencia, contadores ni el pedido.

Los iconos del encabezado tienen feedback al pasar el cursor: favoritos en rojo con fondo rosado suave, pedido en azul y lupa en verde. Los corazones de tarjetas y fichas comparten el rojo y lo mantienen al seleccionar; el encabezado también muestra el corazón relleno cuando hay favoritos. Los iconos usan escala/desplazamiento sutiles de 120 ms y el fondo una transición de opacidad, con hover reservado al mouse y sin movimiento para teclado o movimiento reducido.

## Favoritos locales

Los corazones del listado y de la ficha guardan el **artículo**, sin elegir una variante ni añadirlo al pedido. Comparten estado con Signals, indican la selección con `aria-pressed` y anuncian discretamente añadir/quitar. El encabezado enlaza a `/favoritos` y muestra su contador. Desde esa página puedes quitar artículos o abrir su ficha para elegir atributos y cantidad con las mismas validaciones del catálogo; al eliminar con teclado se conserva un destino de foco útil. El estado vacío ofrece **Explorar el catálogo**.

Configura **`LUMIO_CATALOG_ID` con un identificador estable y único por negocio**, de 1 a 100 letras, dígitos, guiones o guiones bajos. No es un secreto. Mantenlo al mover el JSON, renombrar el negocio o actualizar precios/slugs. **Cámbialo si reutilizas la configuración o el archivo para otro negocio.** El backend combina este identificador con el proveedor y expone un hash opaco como `catalog.id`; cambiar de JSON a Odoo conserva listas separadas. Compose transmite la variable solo a Java. No se exponen rutas de archivos, nombres de bases de datos ni credenciales en esta identidad.

Sin `LUMIO_CATALOG_ID`, la identidad se deriva del proveedor y origen: ubicación configurada del JSON, ejemplo fijo en demo, o URL/base/sitio web de Odoo. Es estable para esa configuración, pero mover la ubicación/instancia cambia la lista visible; para publicaciones usa el identificador explícito. La clave API, nombre, tarifa, moneda y precios no forman parte de la identidad automática.

Se guardan solo IDs estables de artículos, bajo `lumio.favorites.v1.<catalog.id>`, con un documento `{version:1,catalogId,ids}`. No se guardan slugs, variantes, precios, teléfonos ni datos privados. La lectura y las escuchas de `storage` se inicializan con `afterNextRender`, después de hidratar y únicamente en el navegador; el HTML prerenderizado comienza sin selecciones personales. Se validan versión, catálogo, formato/longitud de los IDs, duplicados y tamaño. Se admiten **100 favoritos por catálogo**, IDs de hasta 200 caracteres y documentos de hasta 25.000 caracteres. Los datos corruptos se rechazan con aviso y no se sobrescriben durante la lectura. Al guardar una nueva selección se escribe un documento válido.

Si el almacenamiento está bloqueado o lleno, la selección continúa en memoria con aviso. Las ediciones pendientes se conservan y se combinan con datos válidos al recuperarse el almacenamiento. Los cambios y eliminaciones se sincronizan entre pestañas del mismo origen; las mutaciones leen la selección más reciente antes de escribir. Como localStorage no ofrece transacciones, cambios exactamente simultáneos entre pestañas pueden resolverse por la última escritura. **Los favoritos pertenecen a este navegador y origen; no se sincronizan entre dispositivos.** No requieren autenticación ni se guardan en Odoo o en el backend.

La página consulta configuración y datos actuales por GraphQL, con la transferencia HTTP deshabilitada. Utiliza una consulta por lote, sin descargar todos los artículos ni emitir una petición por favorito:

```graphql
query Favorites($catalogId: ID!, $ids: [ID!]!) {
  catalog { id name currency currencyDecimals categories { id name } }
  itemsByIds(catalogId: $catalogId, ids: $ids) {
    id
    item {
      id slug name categoryIds available images { url alt }
      variants { id priceMinor available attributes { name value } }
    }
  }
}
```

`ids` admite de 1 a 100 referencias distintas; una lista vacía, referencias inválidas o un `catalogId` diferente producen `BAD_REQUEST` antes de consultar el proveedor. Se conserva el orden solicitado y se devuelve una entrada por ID. `item: null` significa que ya no existe o no está publicado: la página mantiene su referencia y permite quitarlo. Un artículo publicado pero agotado conserva sus datos y aparece como **No disponible**. Los fallos de proveedor/conexión producen errores GraphQL, se muestran con reintento y **no eliminan favoritos** ni se presentan como productos inexistentes. Las respuestas incompletas tampoco se aceptan como ausencia. El proveedor permanece detrás de `CatalogProvider`; el navegador recibe exclusivamente modelos de Lumio.

`/favoritos` tiene `noindex` y queda fuera del sitemap, igual que `/pedido`. Su estructura se prerenderiza; la lista personal y sus datos actuales se obtienen en el navegador. Nginx continúa sirviendo archivos estáticos y reenviando `/graphql`, sin servidor Node de producción.

## Identidad del escaparate

La identidad es configurable: el nombre procede de `catalog.name` (JSON/demo) o `website.name`/`ODOO_BUSINESS_NAME` (Odoo). GraphQL añade `catalog.branding { logoUrl primaryColor }`. El JSON admite un bloque opcional `"branding": {"logoUrl":"/images/mi-logo.svg","primaryColor":"#234d46"}`; catálogos anteriores conservan logo vacío y el color de Lumio. Un logo ausente o fallido usa el nombre del negocio.

`LUMIO_LOGO_URL` y `LUMIO_PRIMARY_COLOR` configuran la identidad visual sin exponer modelos del proveedor. En JSON/demo, cuando ambas están vacías se conserva el bloque JSON; al definir alguna se reemplaza el bloque completo (logo vacío y color predeterminado para valores omitidos). En Odoo, el logo del sitio prevalece y `LUMIO_LOGO_URL` solo se utiliza cuando no existe; `LUMIO_PRIMARY_COLOR` sigue configurando el color. La URL de respaldo debe ser pública HTTP(S) sin credenciales o una ruta desde `/`; imágenes privadas de Odoo usan el proxy del backend. El color admite `#RRGGBB`, validado al iniciar. Los botones eligen texto blanco/negro por contraste; un color demasiado claro se reserva para superficies y usa tinta oscura en enlaces sobre blanco. Regenera el HTML al cambiar identidad. Manrope se sirve localmente, con licencia OFL en `public/fonts`, sin peticiones a servicios de fuentes.

La composición se estudió en las páginas actuales de [listado](https://www.nike.com/w/mens-shoes-nik1zy7ok) y [detalle](https://www.nike.com/t/air-force-1-07-mens-shoes-DZejrQoC/CW2288-111) de Nike en escritorio y móvil; Lumio conserva identidad, datos y activos propios. Sin datos de reseñas, descuentos, envío, equivalencias de talla, códigos de color o una API de relacionados, esas funciones permanecen ausentes. Se admiten productos y servicios, sin imponer tallas o colores a otros atributos como capacidad.

## Detalle de artículo

El nombre de cada tarjeta enlaza a `/catalogo/:slug`, por ejemplo `/catalogo/camiseta-algodon`. La consulta `itemBySlug(slug: String!): CatalogItem` busca el slug exacto y devuelve `null` sin errores para un artículo inexistente. El detalle carga configuración, categorías, imágenes y variantes desde la API real, con estados de carga, error con reintento y artículo no encontrado.

Los atributos se presentan como botones de selección con `aria-pressed`, empezando sin elecciones aunque una combinación parcial identifique una sola variante. Las opciones agotadas o incompatibles se muestran tachadas y deshabilitadas; **Restablecer selección** permite empezar de nuevo sin elegir otra variante automáticamente. Hasta elegir todos los atributos se muestra como **Desde** el mínimo entre variantes disponibles, igual que en el listado, sin permitir añadir. Si el artículo está agotado se usa el mínimo configurado junto al aviso de indisponibilidad. Una combinación inexistente se distingue de una variante no disponible. Si los atributos difieren entre variantes, **No aplica** permite elegir explícitamente un atributo ausente. Los servicios con una única variante sin atributos no necesitan una elección adicional. La galería muestra imágenes amplias a la izquierda en escritorio y un carril con scroll-snap en móvil, navegable al deslizar, con flechas o con teclado. Un componente común muestra placeholders explícitos cuando una imagen falta o falla. Las muestras de color no se infieren de nombres: los atributos actuales son texto, sin metadatos cromáticos fiables.

La cantidad debe ser un entero positivo representable de forma segura, sin fracciones ni exponentes. El control compartido permite escribir o usar los botones de aumentar/reducir, sin bajar de uno ni superar el entero seguro máximo; identifica las entradas inválidas y bloquea la acción. **Añadir al pedido** comprueba de nuevo cantidad, pertenencia de la variante y disponibilidad del artículo y variante, además de deshabilitar el botón. La selección se conserva con Signals y almacenamiento local, y se revisa desde `/pedido`.

`catalogo/:slug` usa `RenderMode.Prerender` y conserva `outputMode: static`. Las fichas contienen datos reales del proveedor en el HTML inicial, sin requerir JavaScript para leer nombre, descripción, categoría, imagen y precio. Al hidratar se reutiliza la respuesta de esa ficha mediante `TransferState`; las navegaciones posteriores y la revisión del pedido consultan `/graphql` en el navegador.

## Prerenderizado y SEO

El proceso de publicación es explícito:

1. Configura el JSON e inicia `lm-core` con `CATALOG_LOCATION`. Por ejemplo, desde la raíz: `CATALOG_LOCATION=classpath:catalog/example.json ./gradlew :lm-core:bootRun`. En PowerShell, define `$env:CATALOG_LOCATION='classpath:catalog/example.json'` y ejecuta `gradlew.bat :lm-core:bootRun`. Para un JSON externo usa una ruta absoluta `file:/ruta/absoluta/catalogo.json` (en Windows, `file:C:/ruta/catalogo.json`). Si ya está iniciado después de editar el JSON, reinícialo: el proveedor conserva una instantánea.
2. Define `CATALOG_BUILD_API_URL` con el endpoint GraphQL absoluto y `PUBLIC_SITE_URL` con el origen público HTTP(S). Los valores por defecto son `http://localhost:8080/graphql` y `http://localhost:4200`, únicamente adecuados para desarrollo. La URL pública admite un dominio y puerto, pero no una subruta, credenciales, consulta o fragmento; Lumio se sirve desde `/`. Para producción usa el dominio real, por ejemplo `https://catalogo.example` como marcador a sustituir.
3. Ejecuta `npm run build:storefront`. `scripts/build-static.mjs` consulta primero el catálogo y sus slugs, incluyendo artículos agotados. Angular utiliza `getPrerenderParams` para consultar los slugs y resuelve las fichas contra la misma API durante el build. Genera `catalogo/<slug>/index.html` para cada artículo, además de inicio, pedido y favoritos. No importa directamente el JSON en Angular ni usa datos ficticios como alternativa.
4. El script verifica que cada HTML tenga el encabezado, descripción y precio visibles, título, meta description, canonical y JSON-LD correspondientes a la instantánea consultada. Comprueba también que el inicio incluya su primera página de artículos y su `ItemList`, y que pedido/favoritos mantengan `noindex` sin publicar selecciones locales. Genera `sitemap.xml`, `robots.txt` y un marcador de build verificado. Si falla la API, GraphQL, una ruta o esa verificación, termina con código distinto de cero y **elimina el artefacto de salida**, evitando publicar HTML viejo o pantallas de carga. Usa este script de build; `ng build` por sí solo omite la verificación posterior y el sitemap.
5. Construye y publica la imagen de Nginx, o sirve solamente `dist/lm-storefront/browser` desde otro servidor estático. Nginx entrega las fichas existentes desde disco y mantiene el proxy `/graphql` para funciones interactivas. No hay servidor Node en producción. Para rutas aún no generadas mantiene el fallback `index.csr.html`; un slug inexistente recibe una vista no indexable en el navegador.

Los canonical y el sitemap usan URLs con `/` final, alineadas con los directorios de Nginx. El sitemap incluye el inicio y todas las fichas, y excluye `/pedido` y `/favoritos`, que tienen `noindex`. Las páginas públicas contienen un único script JSON-LD con `@graph` e identificadores públicos estables:

| Tipo Schema.org | Datos y alcance |
| --- | --- |
| `Organization` | Nombre y descripción del negocio, logo configurado y contacto WhatsApp únicamente si existe un número válido. No se presupone una tienda física, razón social ni atención telefónica. |
| `WebSite` | URL pública, nombre y vínculo al negocio editor. |
| `CollectionPage` + `ItemList` | Listado y enlaces ordenados de los artículos visibles. El inicio prerenderiza la primera página real de GraphQL; `numberOfItems` cuenta los artículos mostrados, no todos los resultados. |
| `WebPage` + `BreadcrumbList` | Ficha y ruta visible `Catálogo → Artículo`, con enlaces a su sitio, negocio y entidad principal. |
| `Product` / `Service` | Nombre, descripción, categoría, imágenes y referencia propia de Lumio cuando es producto. Los servicios identifican al negocio como proveedor. |
| `Brand` | Marca real del artículo según `CATALOG_BRAND_ATTRIBUTE` y logo si está configurado; el nombre del vendedor no se convierte automáticamente en marca. La ficha permite leer su clasificación pública en **Características**. |
| `Offer` / `AggregateOffer` | Precios exactos como cadenas decimales obtenidas desde unidades menores enteras, moneda y disponibilidad. Los combos conservan el precio inicial de las configuraciones mediante `AggregateOffer`, sin inventar un precio final ni el número de combinaciones. |

El contrato GraphQL existente ya contiene los datos necesarios; Schema.org se compone en Angular, sin acoplarlo a Odoo. Las URLs relativas de imágenes se convierten a la URL pública configurada; se omiten protocolos inseguros y URLs con credenciales. El JSON-LD escapa caracteres que podrían cerrar el script. Al navegar se reemplaza el marcado anterior, sin acumular scripts; pedido, favoritos, fichas inexistentes y errores no publican una ficha válida anterior. En la PLP se actualizan título, listado y orden al buscar, filtrar, ordenar o cargar más; las URLs filtradas conservan canonical al inicio y se resuelven en el navegador, sin generar miles de páginas estáticas por facetas.

No se inventan valoraciones, GTIN, direcciones, horarios, impuestos incluidos, políticas de envío/devolución ni fechas de vigencia. Tampoco se anuncian pagos o confirmaciones de pedido. El modelo no añade `ProductGroup`: antes de usarlo para resultados de variantes de Google hay que disponer de URLs que preseleccionen explícitamente cada variante, manteniendo la selección manual cuando no se haya indicado una. Los combos configurables y servicios pueden tener marcado Schema.org válido sin cumplir los requisitos de resultados enriquecidos de productos de Google.

Verificación: `npm test --prefix lm-storefront` prueba referencias del grafo, marcas, precisión monetaria, disponibilidad, listados, escape y rechazo de HTML inconsistente. `npm run build:storefront` verifica el JSON-LD y contenido real de todos los HTML generados. Después del despliegue, valida inicio y fichas públicas con [Schema Markup Validator](https://validator.schema.org/) y [Google Rich Results Test](https://search.google.com/test/rich-results), y comprueba su rastreo en Search Console. Esta validación externa y la indexación requieren las nuevas páginas desplegadas; las pruebas locales no garantizan que Google muestre resultados enriquecidos. Referencias: [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [BreadcrumbList](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [ItemList](https://schema.org/ItemList), [Product](https://schema.org/Product), [Service](https://schema.org/Service) y [variantes de Google](https://developers.google.com/search/docs/appearance/structured-data/product-variants).

**Regenera y vuelve a desplegar Nginx** después de cambiar nombres, descripciones, tipos, categorías, imágenes, variantes, precios, disponibilidad, negocio, moneda, decimales o WhatsApp; también al añadir/eliminar artículos o cambiar slugs y URL pública. Reiniciar únicamente Java actualiza la API, pero no modifica el HTML, sitemap ni datos transferidos existentes. El build limpia la salida anterior para quitar rutas eliminadas. Las revisiones de pedidos siempre vuelven a consultar Java; el HTML representa el catálogo en el momento de compilar.

## Pedido local y WhatsApp

**Mi pedido** está disponible desde la cabecera y el detalle. Permite modificar cantidades, eliminar líneas y ver precios unitarios, subtotales y total estimado en la moneda y con los decimales del catálogo. Añadir la misma variante acumula cantidades; se comprueba que el entero resultante siga siendo seguro. Los productos y servicios comparten el mismo flujo. Los importes agregados se calculan y formatean con `BigInt`, sin `Float`, fracciones aritméticas ni pérdida de precisión.

`features/order/` agrupa el modelo, las funciones de cantidades/totales/persistencia/mensaje, el estado con Signals y la página. Se guarda una instantánea versionada en `localStorage`, bajo `lumio.order.v1`, sin guardar destinatarios ni enlaces preparados. La lectura ocurre con `afterNextRender`, únicamente en el navegador y después de la hidratación; durante prerenderizado el estado empieza vacío. `/pedido` genera HTML estático. Las escrituras solo se habilitan tras esa inicialización. Véase la [documentación de `afterNextRender`](https://angular.dev/api/core/afterNextRender).

Los datos recuperados se validan antes de incorporarlos al estado: versión, moneda/decimales, referencias y slug, nombres, atributos sin duplicados, disponibilidad booleana, precio entero dentro del rango GraphQL y cantidad entera positiva segura. Una instantánea inválida se rechaza completa con un aviso, sin recuperar parcialmente ni confiar en precios para preparar el mensaje. Se admiten hasta **100 líneas**, instantáneas de hasta **1.000.000 de caracteres**, textos de hasta 10.000 caracteres y hasta 100 atributos por línea. Superar estos límites se comunica; no se truncan selecciones. Si el navegador bloquea el almacenamiento o se alcanza su cuota, la lista sigue funcionando en memoria y avisa que podría perderse al recargar. La selección pertenece al origen y navegador actuales; no se sincroniza entre dispositivos ni pestañas abiertas.

**Preparar mensaje de WhatsApp** vuelve a consultar una instantánea actual del catálogo por GraphQL, sin reutilizar transferencia HTTP ni hacer escrituras en el backend. Se buscan los IDs del artículo y de su variante; nunca se sustituye una variante ausente por otra. Se actualizan precios, disponibilidad, nombres, atributos y moneda, mostrando las diferencias para revisión. Si hubo cambios no se prepara el enlace: el usuario debe revisar la lista y pulsar **Revisé los cambios: verificar de nuevo**, lo que consulta nuevamente la API. Referencias desaparecidas y líneas no disponibles bloquean la preparación hasta quitarlas o elegir una alternativa. Si falla la verificación tampoco se prepara un enlace. Editar la lista invalida el mensaje y las respuestas anteriores pendientes.

El mensaje incluye negocio, artículos y variantes, sus referencias y atributos, cantidades, precios unitarios, subtotales y **total estimado**. El número proviene exclusivamente de `catalog.whatsappNumber` en la consulta actual; con el ejemplo vacío se muestra un aviso y ningún enlace de WhatsApp. Se utiliza `https://wa.me/<numero>?text=<mensaje codificado>` siguiendo la [documentación de WhatsApp](https://faq.whatsapp.com/5913398998672934).

Lumio aplica un límite conservador de **2.000 caracteres al enlace codificado**, como política de compatibilidad de la aplicación, no como límite universal de WhatsApp. Si se supera, muestra el mensaje completo para copiar y pegar y ofrece abrir el chat sin texto prellenado. Nunca elimina líneas ni recorta el total. Si la copia automática no está disponible, el campo de texto permite seleccionar y copiar manualmente el contenido completo.

**Abrir WhatsApp no significa que el pedido se haya enviado ni confirmado.** El usuario revisa y envía desde WhatsApp; el negocio confirma precio y disponibilidad. La lista local no se borra al abrir el enlace. No hay pedidos almacenados en el backend, reservas de inventario, pagos ni confirmación automática de entrega.

## Estilos

El escaparate utiliza Tailwind CSS mediante `@tailwindcss/postcss`, integrado con Angular CLI en `lm-storefront/.postcssrc.json`. Los colores y fuentes de Lumio están definidos con `@theme` en `src/styles.css`; las plantillas y los hosts de componentes usan clases utilitarias para layout, responsive, disponibilidad y espaciado. La hoja global conserva únicamente la importación, el tema y las reglas base compartidas de controles y foco accesible.

Tailwind analiza explícitamente `src/app` e `index.html`, incluyendo plantillas inline de TypeScript. Escribe clases completas también en los estados condicionales; evita concatenar fragmentos de nombres de clases. `npm run build:storefront` genera el CSS estático de producción, sin CDN ni configuración Vite adicional. La instalación reproducible sigue siendo `npm run install:storefront`.

## Verificación

```sh
./gradlew build
# Desde la raíz:
npm run build:storefront
# Pruebas de URL, variantes, cantidades, totales, persistencia y mensajes:
npm test --prefix lm-storefront
```

Antes del primer build de Angular, ejecuta `npm run install:storefront` para instalar las dependencias del lockfile. En Windows, usa `gradlew.bat build`. Gradle necesita encontrar un JDK 21 instalado para su toolchain.

El build de Angular requiere ahora `lm-core` activo y las URLs de build configuradas como se explica arriba. Las pruebas unitarias (`npm test --prefix lm-storefront`) no requieren una API activa. La verificación de contenido real del HTML se ejecuta como parte de cada build de publicación.

Para validar la configuración de contenedores sin iniciarlos, ejecuta `docker compose config --quiet`. Construir y ejecutar las imágenes requiere que el motor de Docker esté activo. Nginx sirve el HTML con revalidación y devuelve 404 para recursos estáticos inexistentes.

Consulta inicial:

```graphql
query {
  catalog {
    name description currency currencyDecimals whatsappNumber
    categories { id slug name description }
    items {
      id slug name description categoryIds images { url alt } available
      variants { id slug name attributes { name value } priceMinor available }
    }
  }
}
```

GraphiQL está deshabilitado por defecto; habilitar localmente con `GRAPHIQL_ENABLED=true`. Las consultas raíz `items` y `categories` también están disponibles. El contrato anterior `CatalogItem.priceMinor` se sustituye por `CatalogItem.variants[].priceMinor`; la configuración del negocio ya no se toma de `CATALOG_NAME`, `CATALOG_CURRENCY` ni `WHATSAPP_NUMBER`.

## Límites de esta base

El HTML inicial y las fichas se prerenderizan durante el build (`outputMode: static`) con API activa. Los archivos siguen siendo legibles si Java deja de estar disponible; búsqueda, selección de nuevas rutas y verificación de pedidos necesitan la API. Producción no ejecuta Node.

Los proveedores JSON y Odoo implementan `CatalogProvider` sin acoplar el dominio al origen. La búsqueda y paginación operan en memoria sobre una instantánea por petición GraphQL; no hay base de datos, login ni pedidos en servidor. La lista de pedido persiste solo en `localStorage`. Las consultas anteriores de listas completas se mantienen por compatibilidad; la navegación utiliza `itemPage` y la revisión del pedido utiliza el catálogo completo. Las imágenes del JSON deben existir en el frontend o en una URL pública; las imágenes autenticadas de Odoo se sirven mediante lm-core.

## Catálogo desde Odoo 19

`CATALOG_PROVIDER=json` es el valor predeterminado y conserva `CATALOG_LOCATION`. `demo` carga siempre el ejemplo incluido, sin leer un archivo externo. `odoo` activa `OdooCatalogProvider`. Un proveedor desconocido o una configuración incompleta impiden el arranque; un fallo remoto devuelve un error, **nunca un catálogo de demostración como sustituto**.

### Odoo y PostgreSQL en el mismo Compose

`compose.yaml` incluye `odoo` (`odoo:19.0`) y `odoo-db` (`postgres:17`) bajo el perfil `odoo`. Los servicios comparten la red de lm-core. Odoo espera a que PostgreSQL esté saludable; la base no publica un puerto en el host. Los volúmenes `odoo-web-data` y `odoo-db-data` conservan el filestore y los datos de Odoo. Esta persistencia pertenece a Odoo: lm-core sigue sin base de datos local ni almacenamiento de pedidos.

1. Para la demo local usa `scripts/Start-LumioDemo.ps1`, que genera los secretos y datos. Para una configuración propia, copia `.env.example` a `.env` y configura localmente `ODOO_DB_PASSWORD` (sin valor de ejemplo predeterminado). Usa el mismo `ODOO_DB_USER` para Odoo y PostgreSQL. Esta contraseña **no** autentica JSON-2: `ODOO_API_KEY` es otra credencial, que crearás dentro de Odoo.
2. Crea los directorios de `ODOO_CONFIG_DIRECTORY` y `ODOO_ADDONS_DIRECTORY`; por defecto son `../files/config` y `../files/addons`, relativos al Compose. Para una instalación nueva, copia `infrastructure/odoo/odoo.conf.example` al primero como `odoo.conf` y sustituye `CHANGE_ME_LOCALLY` por tu contraseña maestra de administración. Si ya tienes un archivo, conserva su configuración y adapta los campos necesarios. Ambos directorios se montan como solo lectura; addons se administran desde el host. Compose falla si los directorios no existen, evitando crear rutas vacías por error. Conserva el archivo real con su contraseña fuera del repositorio.
3. Inicia los servicios de Odoo:

   ```sh
   docker compose --profile odoo up -d odoo
   ```

4. Abre `http://localhost:8069` (o el puerto de `ODOO_HTTP_PORT`), crea/selecciona la base de **Odoo**, instala los módulos de comercio electrónico e inventario y prepara sitio, productos, tarifa y almacén. `POSTGRES_DB=postgres` es la base inicial del motor; no significa que debas poner `ODOO_DATABASE=postgres`. Usa el nombre de la base Odoo creada en su interfaz.
5. Crea el usuario técnico y su clave API. Completa localmente `ODOO_DATABASE`, `ODOO_API_KEY` y los tres IDs de integración en `.env`, y cambia `CATALOG_PROVIDER=odoo`. Para Java en Compose, `ODOO_URL=http://odoo:8069`; para Java ejecutado en tu terminal, `ODOO_URL=http://localhost:8069`.
6. Inicia/recrea el backend con esa configuración:

   ```sh
   docker compose --profile odoo up -d --build lm-core odoo
   ```

   Comprueba GraphQL y después realiza el build estático de Angular y el despliegue de Nginx como se describe abajo. lm-core no depende de Odoo para arrancar con JSON/demo; con Odoo, la primera consulta comprueba que su API y catálogo estén listos. También puedes seguir apuntando a una instancia externa sin activar el perfil local.

`--proxy-mode` se pasa explícitamente a Odoo: la [imagen oficial](https://github.com/odoo/docker/blob/master/19.0/entrypoint.sh) configura HOST/PORT/USER/PASSWORD, pero no interpreta `PROXY_MODE=True` como opción de Odoo. Los argumentos también incluyen la ruta de addons y el directorio de datos. Si tu `odoo.conf` define `db_host`, `db_user` o `db_password`, la imagen da prioridad al archivo: evita mezclarlo con una conexión distinta en `.env`.

PostgreSQL utiliza `ODOO_DB_PASSWORD` al inicializar un volumen nuevo. Modificarla después en `.env` no cambia la contraseña de un usuario existente: aplica la rotación también en PostgreSQL. Conserva los volúmenes para conservar datos; `docker compose down -v` los elimina.

Variables adicionales del stack local:

| Variable | Uso |
| --- | --- |
| `ODOO_DB_USER` | Usuario PostgreSQL de Odoo, predeterminado `odoo`. |
| `ODOO_DB_PASSWORD` | Contraseña PostgreSQL, requerida localmente para iniciar una base nueva. |
| `ODOO_HTTP_PORT` | Puerto de la interfaz Odoo en localhost, predeterminado `8069`. |
| `ODOO_CONFIG_DIRECTORY` | Directorio con `odoo.conf`, predeterminado `../files/config`. |
| `ODOO_ADDONS_DIRECTORY` | Directorio de addons adicionales, predeterminado `../files/addons`. |

### API y acceso

Se usa [JSON-2 de Odoo 19](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html): POST `/json/2/<modelo>/<método>`, clave API en `Authorization: Bearer` y base de datos en `X-Odoo-Database`. No se envía contraseña ni se inicia sesión desde Angular. En Odoo Online, el acceso a la API externa requiere un plan **Custom**, no Standard ni One App Free. Para otros despliegues verifica que JSON-2 esté habilitada en la instalación y accesible desde lm-core.

Usa un usuario técnico dedicado con permisos mínimos de lectura y acceso a la compañía del sitio. Debe poder consultar `website`, `stock.warehouse`, `product.pricelist`, `res.currency`, `product.template`, `product.product`, `product.public.category`, `product.template.attribute.line`, `product.template.attribute.value`, `product.attribute` y, cuando existan imágenes adicionales, `product.image`, además de los registros que el motor de tarifas necesita leer. No necesita permiso para crear contactos, cotizaciones, pedidos o reservas. Los módulos de comercio electrónico e inventario deben aportar los campos del mapeo; `WEBSITE` requiere también `website_sale_stock`.

Crea la clave API en las preferencias de seguridad del usuario y planifica su rotación/vencimiento según la documentación. El adaptador no crea claves. Revisa `https://TU-ODOO/doc` en **tu base de datos**: los campos y métodos disponibles dependen de la versión, módulos, personalizaciones y permisos. Lumio ejecuta `fields_get` antes de leer los modelos y solicita solo campos reconocidos. Los metadatos se guardan en memoria hasta reiniciar Java; los productos, precios y stock se consultan nuevamente en cada petición GraphQL. No se copia el catálogo a una base de datos local.

### Configuración del backend

Completa una copia local de `.env.example` para Compose. Spring y npm **no cargan `.env` automáticamente**: fuera de Compose exporta las variables al proceso Java desde tu terminal o gestor de secretos. No las exportes a archivos del frontend. `.env` está ignorado; `.env.example` contiene únicamente valores vacíos o ficticios.

| Variable | Uso |
| --- | --- |
| `CATALOG_PROVIDER=odoo` | Seleccionar el adaptador. |
| `ODOO_URL` | Origen HTTP(S), preferentemente HTTPS, sin ruta, parámetros ni credenciales. |
| `ODOO_DATABASE` | Nombre técnico exacto de la base. |
| `ODOO_API_KEY` | Clave del usuario de integración, exclusivamente en lm-core. |
| `ODOO_WEBSITE_ID` | ID positivo del sitio de comercio electrónico. |
| `ODOO_PRICELIST_ID` | ID positivo de la tarifa activa; obligatorio, no hay precio alternativo silencioso. |
| `ODOO_WAREHOUSE_ID` | ID positivo del almacén de la compañía del sitio. |
| `ODOO_STOCK_POLICY` | `FREE_STOCK` por defecto, o `WEBSITE`; véase disponibilidad abajo. |
| `ODOO_LANGUAGE` | Idioma instalado para nombres/descripciones; predeterminado `en_US`. |
| `ODOO_BUSINESS_NAME` | Nombre comercial; vacío utiliza `website.name`. |
| `ODOO_BUSINESS_DESCRIPTION` | Descripción comercial, vacía permitida. |
| `ODOO_WHATSAPP_NUMBER` | Dígitos internacionales sin `+` ni espacios; vacío deshabilita preparar WhatsApp. No se deduce de contactos Odoo. |
| `ODOO_CONNECT_TIMEOUT_MS` | Conexión TCP; 3000 ms, rango 1–60000. |
| `ODOO_REQUEST_TIMEOUT_MS` | Límite de cada solicitud JSON-2, incluido el cuerpo; 10000 ms, rango 1–120000. |
| `ODOO_MAX_RECORDS` | Máximo por búsqueda de modelo, 5000; el exceso falla sin truncar. |
| `ODOO_MAX_IMAGE_BYTES` | Máximo de imagen decodificada, 4000000 bytes; máximo permitido 16000000. |

Compose pasa estas variables únicamente a lm-core. Angular recibe la API pública de Lumio: `/graphql` en el navegador, `CATALOG_BUILD_API_URL` durante la compilación; ninguna URL, base de datos o clave de Odoo pasa al contrato GraphQL.

### Decisiones de mapeo

| Lumio | Origen y reglas en Odoo |
| --- | --- |
| Artículo | `product.template`: `active`, `sale_ok` e `is_published` verdaderos; `website_id` vacío o igual al sitio configurado; compañía global o compañía del sitio. No se confunde publicación contextual de otro sitio con publicación del sitio elegido. |
| Identificadores y slugs | `item-ID`, `variant-ID`, `category-ID`; slug a partir del nombre normalizado y el ID para evitar colisiones. Cambiar el nombre cambia el slug y exige regenerar HTML/sitemap. |
| Categorías | `product.public.category` del sitio o globales; `public_categ_ids`. No se utilizan categorías internas de inventario. Se incluyen las categorías públicas visibles del ámbito elegido y su jerarquía `parent_id`; padres fuera de ese ámbito se omiten sin ocultar sus hijas visibles. |
| Tipo | `type=service` → `SERVICE`; mercancía → `PRODUCT`; `type=combo` → `COMBO`, con grupos y opciones de componentes. Los combos participan en listado, fichas, favoritos y pedido. |
| Variantes | `product.product` activos de las plantillas elegidas; `product_template_attribute_value_ids` → valor PTAV y nombre de `product.attribute`. Solo combinaciones ya materializadas; una plantilla sin variantes activas se omite. No se crean combinaciones dinámicas. |
| Nombre/descripción | `name`, `display_name`; `website_description` si existe y no está vacía, luego `description_sale`. HTML se transforma en texto, eliminando scripts/estilos. Los campos descriptivos opcionales ausentes producen texto vacío. |
| Precio | Una llamada pública `product.product.get_contextual_price` por variante con `pricelist`, `quantity=1`, fecha actual y `uom` de venta. Se usa el motor de tarifas de Odoo, incluidos sus recargos/reglas; no se lee `list_price` directamente ni se sustituye una tarifa fallida. |
| Moneda | `product.pricelist.currency_id` → `res.currency.name`, `decimal_places`, `rounding`. Debe estar activa. Importe JSON convertido con `BigDecimal`, redondeado al múltiplo monetario con HALF_UP y convertido exactamente a `Int` en unidades menores. Se rechazan precios negativos, desbordamiento y precisión incompatible. No hay `Float` en el contrato. |
| Disponibilidad | Mercancía con `is_storable=true`: `free_qty` bajo contexto `warehouse_id`, al menos una unidad libre. Servicios y mercancía no controlada por inventario: disponible si el artículo/variante están activos y se venden. `FREE_STOCK` aplica esa regla siempre. `WEBSITE` permite también vender sin stock cuando `allow_out_of_stock_order=true`; si falta ese campo, falla. |
| Imágenes | `image_128`/`image_variant_128` con `bin_size=true` detectan presencia sin descargar todos los binarios; galería adicional de `product.image`, tanto de plantilla como de variante. El navegador recibe `/catalog-media/template/ID`, `/variant/ID` o `/extra/ID`. lm-core verifica publicación/compañía/sitio y descarga `image_1024` autenticada; admite JPEG, PNG, GIF y WebP, con límite y `nosniff`. No se permite un proxy de modelos/campos arbitrarios ni URLs con claves. |

El método público de precios se ha comprobado en el [código oficial de Odoo 19](https://github.com/odoo/odoo/blob/19.0/addons/product/models/product_product.py), el motor contextual en [product.template](https://github.com/odoo/odoo/blob/19.0/addons/product/models/product_template.py), y las cantidades en [stock](https://github.com/odoo/odoo/blob/19.0/addons/stock/models/product.py). Si una compilación de tu instancia no expone `get_contextual_price`, Lumio devuelve incompatibilidad y exige revisar `/doc`/la versión; no invoca métodos privados como alternativa.

**Cantidad física** (`qty_available`), **cantidad prevista** (`virtual_available`, entradas/salidas futuras) y **cantidad libre sin reservar** (`free_qty`) son conceptos diferentes. Este adaptador utiliza únicamente la tercera para disponibilidad inmediata. El booleano anuncia que se puede consultar al menos una unidad, **no garantiza toda la cantidad de la lista de pedido**. No se reserva stock y otras ventas pueden consumirlo antes de responder por WhatsApp.

El precio es una estimación unitaria para cantidad 1. El MVP no recalcula descuentos por la cantidad de cada línea, impuestos/posición fiscal de un cliente, envío, personalizaciones de configurador ni reglas adicionales de exclusión de combinaciones. No pretende reproducir el checkout de Odoo ni crear un pedido. La lista local vuelve a consultar los precios/disponibilidad antes de preparar WhatsApp y exige revisión si cambian. Confirma el tratamiento fiscal de tu tarifa para el uso comercial de esta estimación.

### Combos configurables

Los combos publicados se muestran sin convertirlos en productos simples ni excluirlos del catálogo. `product.template.combo_ids` referencia grupos `product.combo`; sus `combo_item_ids` contienen opciones `product.combo.item`, cada una vinculada a una variante concreta `product.product`. Se leen por lotes, incluidas variantes que no se publican individualmente. Los atributos corresponden a esa variante concreta. El contrato de Lumio expone `comboGroups { id name options { id variantId name attributes { name value } extraPriceMinor available maxQuantity } }` y sigue siendo independiente de Odoo. JSON puede declarar la misma estructura; el ejemplo verificable está en `lm-core/src/test/resources/catalog/combos.json`.

En Odoo 19 estándar se elige **una opción de cada grupo por unidad de combo**; no se selecciona ninguna automáticamente, ni siquiera en grupos con una sola opción. La ficha muestra el precio «Desde» hasta completar la selección. El total unitario es el precio contextual del combo en la tarifa configurada más los recargos `extra_price` elegidos. No se suman los precios independientes de los componentes. Los recargos admiten signo, se convierten desde su moneda a la de la tarifa con la fecha/compañía configuradas y se redondean a las unidades menores de esa moneda. Se valida que los importes resultantes sean enteros no negativos dentro del rango GraphQL. La ordenación de precios incorpora el recargo mínimo de cada grupo. Véanse los modelos oficiales [de opciones](https://github.com/odoo/odoo/blob/19.0/addons/product/models/product_combo_item.py) y el [cálculo de Odoo](https://github.com/odoo/odoo/blob/19.0/addons/sale/models/sale_order_line.py).

Las opciones inactivas, no vendibles o sin stock libre según la política configurada aparecen deshabilitadas. `maxQuantity=null` significa sin límite de inventario aplicable (servicio, artículo sin seguimiento o venta sin stock permitida explícitamente). Un stock numérico se toma de `free_qty` en el almacén configurado y se redondea hacia abajo para cantidades enteras. Se contempla que un componente se repita en varios grupos; antes de preparar WhatsApp se agrega su demanda en todas las líneas del pedido, incluidas las variantes pedidas por separado. No hay reservas y el negocio debe confirmar disponibilidad.

Cada configuración del mismo combo tiene una línea independiente; repetir exactamente las opciones acumula cantidad. El pedido guarda las referencias de grupo/opción/variante, sus atributos y recargos con persistencia versión 2, manteniendo lectura de pedidos ordinarios versión 1. Al preparar WhatsApp se reconsultan todos los datos: cambios de tarifa, componentes, disponibilidad o cantidad libre requieren revisión; una opción eliminada nunca se sustituye automáticamente. El mensaje incluye la configuración completa, cantidades por componente y total estimado; si excede el enlace permitido, conserva el texto completo para copiarlo.

El alcance sigue siendo una consulta por WhatsApp: no crea pedidos ni reservas en Odoo. Los descuentos por volumen, impuestos/posición fiscal y personalizaciones de configurador (atributos `no_variant` con recargo, valores personalizados o variantes creadas dinámicamente) siguen fuera del cálculo de esta versión; deben confirmarse con el negocio. No se simula el configurador completo del checkout. La implementación representa las variantes concretas configuradas en las opciones estándar de Odoo 19.

Para desplegar, reconstruye **todo `compose.production.yaml`** en Dokploy: `odoo-init` añade lectura sobre `product.combo` y `product.combo.item` al usuario API; después se actualizan lm-core y el escaparate estático. Si administras el usuario API fuera del bootstrap, concede esos dos permisos de lectura sin escritura. No hacen falta claves nuevas por este cambio. Regenera las fichas al cambiar grupos, componentes, recargos, publicación o disponibilidad. Un frontend nuevo requiere desplegar también el esquema GraphQL actualizado.

Verificación: publica un combo con dos grupos en el sitio configurado, consulta su `comboGroups` en GraphQL, abre su ficha, selecciona todas las opciones y añade dos configuraciones al pedido. Comprueba totales y persistencia al recargar; cambia un recargo o retira una opción en Odoo y verifica que preparar WhatsApp exige revisión o bloquea esa referencia. Las pruebas automatizadas utilizan respuestas JSON-2 simuladas, sin modificar tu instancia.

Cada petición GraphQL comparte una lectura del proveedor entre sus campos raíz, ejecutada fuera del event loop de WebFlux. Las llamadas JSON-2 son transacciones independientes: la lectura agregada no tiene aislamiento de una sola transacción Odoo. La búsqueda/paginación de Lumio sigue ocurriendo en memoria; las búsquedas remotas se recorren en páginas de 200 registros. El cálculo individual de tarifa puede ser costoso en catálogos grandes; prueba latencia y límites antes de ampliarlos. No hay caché de productos ni sustitución por datos antiguos.

Errores GraphQL: `extensions.code=CATALOG_UNAVAILABLE`, con `reason` como `AUTHENTICATION`, `ACCESS`, `CONNECTION`, `COMPATIBILITY`, `CONFIGURATION`, `PRICE`, `PROTOCOL`, `LIMIT` o `UPSTREAM`. Las respuestas de error de Odoo no se copian al cliente. Las imágenes responden 404 si el artículo no puede publicarse, o 502 con error seguro si falla la integración; no se almacenan en caché (`no-store`).

### Verificar tu instancia y regenerar el escaparate

1. Verifica versión 19, acceso a JSON-2 y plan/licencia aplicable; identifica IDs de sitio, tarifa y almacén. La tarifa y el almacén deben pertenecer a la compañía del sitio (se acepta una tarifa global). Comprueba en `/doc` campos y método público de precios, y permisos del usuario técnico. Configura la clave localmente, nunca en el chat o en el código.
2. Inicia lm-core con `CATALOG_PROVIDER=odoo` y las variables del backend: `./gradlew :lm-core:bootRun`, o `docker compose up -d --build lm-core`. El arranque comprueba configuración local; la primera consulta comprueba conexión, campos y datos remotos. `/actuator/health` no certifica por sí solo el catálogo Odoo.
3. Consulta la API de **Lumio**, sin encabezados de Odoo:

   ```graphql
   { catalog { name currency currencyDecimals categories { id name }
       items { id slug type name description images { url } available
         variants { id name priceMinor available attributes { name value } } } }
     itemPage(page: 1, pageSize: 12) { totalCount items { slug } } }
   ```

4. Compara dos variantes con recargo y una regla de tarifa con sus valores en Odoo para cantidad 1/UoM de venta. Comprueba una variante con reservas, otra con entrada prevista pero sin cantidad libre y las dos políticas de stock; verifica servicios. Abre las URLs `/catalog-media/...` desde Lumio y confirma que no contienen credenciales. Una clave inválida, un campo inaccesible o una conexión interrumpida deben producir error, no productos de muestra.
5. Con ese lm-core funcionando, exporta `CATALOG_BUILD_API_URL=http://localhost:8080/graphql` y `PUBLIC_SITE_URL` real; ejecuta `npm run build:storefront`. El mismo prerenderizado consulta los slugs/datos de Odoo **a través de GraphQL de Lumio**, verifica el HTML, canonical, datos estructurados y sitemap, y falla claramente si la API falla. Después construye/publica la imagen Nginx. Nginx sirve únicamente archivos estáticos y reenvía `/graphql` y `/catalog-media/` a Java; Node no existe en producción.
6. Regenera y despliega las páginas al cambiar publicaciones, nombres/slugs, descripción, categorías, imágenes, variantes, tarifa/moneda o disponibilidad anunciada en HTML. Los controles interactivos consultan datos actuales, pero el HTML para SEO sigue siendo la última compilación. Despublicar en Odoo no borra una ficha ya generada: hay que regenerar para retirarla del sitio/sitemap.

Pruebas sin credenciales: `./gradlew build` cubre transporte HTTP simulado JSON-2, adaptador, selección de proveedores, GraphQL y proxy de imágenes (variantes, tarifa, precisión, errores de autenticación/permisos/conexión y publicación). `npm test --prefix lm-storefront` cubre las reglas locales del pedido, dinero, variantes y SEO. La integración real requiere URL/base, IDs, política e idioma y una clave del usuario técnico configurada de forma privada; las pruebas simuladas no certifican permisos, campos personalizados ni reglas de negocio de tu instalación.

## Próximos pasos

1. Automatizar la regeneración y despliegue del artefacto cuando cambie el catálogo.
2. Optimizar la consulta de revisión para catálogos grandes conservando una instantánea coherente de las referencias seleccionadas.
3. Validar Schema.org en los dominios de producción y Search Console tras desplegar; incorporar información comercial adicional únicamente cuando el proveedor la entregue. Preparar URLs de selección explícita antes de añadir `ProductGroup` para variantes.

No se requiere Nx ni un orquestador adicional en esta etapa. Gradle agrupa el backend y los scripts raíz coordinan el frontend.

La versión SNAPSHOT se resuelve desde el repositorio oficial de Spring. Puede cambiar entre compilaciones; se usa expresamente como base de desarrollo. Gradle fija el toolchain en Java 21.
