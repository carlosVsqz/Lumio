# Lumio: despliegue desde código en Dokploy

Usa la aplicación **Docker Compose** que tienes configurada en Dokploy, con el repositorio Lumio y ruta `compose.production.yaml`. Dokploy compila Java, Angular y los addons Odoo desde ese checkout con `up --build`. No requiere un registro de imágenes, GHCR ni un paso de push. Los nombres de imagen los genera Compose con el proyecto de Dokploy. Conserva ese proyecto entre despliegues para mantener los volúmenes.

## Entorno y dominios

Configura los valores de `.env.production` privado en **Environment** de Dokploy. `.env.production.example` contiene los valores públicos y secretos vacíos; no copies el `.env` de desarrollo. Dokploy escribe el entorno en `.env` junto al Compose. Este archivo referencia explícitamente las variables necesarias para cada servicio; no inyecta todas las credenciales en todos los contenedores.

- Tienda y SEO: `PUBLIC_SITE_URL=https://lumio-catalog.escod.com.gt`.
- Administración Odoo: `ODOO_PUBLIC_URL=https://lumio-odoo.escod.com.gt`.
- Build: `ODOO_BUILD_URL=https://lumio-odoo.escod.com.gt`, accesible desde el builder de Dokploy.
- Runtime: `ODOO_URL=http://odoo:8069`, dentro de la red privada Compose.
- Base prevista: `lumio_production`; identidad estable del catálogo: `lumio-escod-production`.

Las cuatro contraseñas independientes están en `.env.production` privado: administrador PostgreSQL, conexión Odoo/PostgreSQL, contraseña maestra Odoo y administrador Odoo. No se copian a Git, a la plantilla, a argumentos Docker ni al frontend. La clave API de integración debe generarse en **Odoo de producción**; no equivale a ninguno de esos passwords. Los IDs de sitio, tarifa y almacén se obtienen allí, sin reutilizar los de la demo. WhatsApp queda deshabilitado hasta configurar el número real. `LUMIO_LOGO_URL` queda vacío a propósito porque el logo procede del sitio Odoo.

## Primera instalación: Odoo antes del escaparate

Mantén inicialmente `COMPOSE_PROFILES=odoo`. Los servicios Java/escaparate tienen perfil `storefront`, por lo que su build no bloquea la preparación inicial cuando aún faltan API key e IDs.

1. En la primera preparación usa el comando avanzado de tu aplicación Dokploy para iniciar **solo `odoo-db`**. Conserva el nombre de proyecto y ruta que muestra Dokploy; cambia temporalmente su selección de servicios a `up -d --build odoo-db`. PostgreSQL crea un rol Odoo sin superusuario/creación de bases/roles y una base vacía propiedad de ese rol. No expongas Odoo HTTP antes de configurar el administrador.
2. Desde la terminal del servidor en el checkout que utiliza Dokploy, ejecuta el inicializador offline. Exporta desde tu gestor de secretos/terminal privada estas cuatro variables: `ODOO_ADMIN_LOGIN`, `ODOO_ADMIN_PASSWORD`, `LUMIO_BUSINESS_NAME`, `ODOO_PUBLIC_URL`. El `.env` de Compose no las exporta por sí solo a la terminal. Usa `-e NOMBRE` para importar su valor sin escribir el secreto en la línea de comando. Si Odoo estaba iniciado, detenlo antes de inicializar.

   ```sh
   docker compose -p NOMBRE-PROYECTO-DOKPLOY --env-file .env -f compose.production.yaml run --build --rm -T \
     -e ODOO_ADMIN_LOGIN -e ODOO_ADMIN_PASSWORD -e LUMIO_BUSINESS_NAME -e ODOO_PUBLIC_URL \
     odoo python3 /opt/lumio/initialize.py
   ```

   Compose compila la imagen Odoo desde código antes de ejecutarla. Instala los módulos sin demo, configura administrador `lumio-admin`, español, negocio y logo L, y crea `lumio-catalog` con permisos de lectura y sin contraseña de acceso. No crea catálogo, stock, precios ni API key. Rechaza cualquier base que ya tenga tablas; no cambia passwords de una instalación existente. Si falla después de instalar módulos, mantén HTTP detenido y resuelve esa base con administración; no hay borrado/reinicialización automática. No uses los scripts demo en producción.
3. Configura los dominios Odoo indicados abajo y restaura el comando normal de Dokploy, manteniendo el perfil `odoo`. Al desplegar, Dokploy compila Odoo e inicia Odoo/PostgreSQL. El entrypoint genera configuración privada `0600` con base única, `list_db=False`, proxy mode y workers; no ejecuta bootstrap ni actualiza módulos al arrancar.
4. Entra a Odoo, configura compañía/moneda y sus decimales, sitio, tarifa, almacén, política de disponibilidad y el catálogo real. La base vacía conserva la moneda inicial de Odoo hasta que la configures. Genera la clave API del usuario `lumio-catalog`, revisa sus reglas por compañía, permisos y fecha de vencimiento. Odoo combina ACL heredadas: no añadas grupos de ventas/inventario de escritura ni uses una clave del administrador. El adaptador de Lumio además limita sus métodos a lectura.
5. Completa `ODOO_API_KEY`, `ODOO_WEBSITE_ID`, `ODOO_PRICELIST_ID`, `ODOO_WAREHOUSE_ID` en Environment y el entorno privado local. Cambia a `COMPOSE_PROFILES=odoo,storefront` y despliega. Odoo debe estar accesible por HTTPS durante el build; `depends_on` ordena el runtime, no inicia servicios antes de construir imágenes.

Si conectas una instancia Odoo existente, no ejecutes bootstrap: instala sus addons y configura acceso/IDs allí, usa `COMPOSE_PROFILES=storefront` y un `ODOO_URL` externo HTTPS. No se modifican sus datos ni se instalan módulos desde CatalogProvider. Con campañas desactivadas no se requiere `lumio_campaign` para leer el catálogo.

## Build nativo del escaparate

`lm-core` compila y ejecuta Gradle build. El build `lm-storefront` recibe esa imagen mediante `additional_contexts: lumio_core: service:lm-core`; utiliza el mismo binario/contrato Java del checkout, sin exigir una API Lumio pública ya desplegada.

Durante una sola instrucción RUN del builder:

1. BuildKit monta temporalmente `ODOO_API_KEY` como secreto, leído desde Environment de Compose. La clave no es ARG/ENV del Dockerfile ni se escribe en una capa.
2. El controlador de build inicia Java en `127.0.0.1:8080` con la clave y configuración Odoo. Comprueba salud y una consulta real de catálogo; no usa datos de respaldo si falla.
3. Angular recibe únicamente `http://127.0.0.1:8080/graphql` y `PUBLIC_SITE_URL`. Consulta slugs y prerenderiza/verifica cada ficha, títulos, descripciones, canonical, JSON-LD, sitemap y robots. Las pruebas Angular se ejecutan dentro del build.
4. Se comprueba que los archivos públicos no contengan la clave y se detiene Java. La imagen final copia únicamente los archivos estáticos a Nginx: no contiene Node, Java, código Odoo ni credenciales.

`no_cache: true` del build frontend obliga a repetir la consulta/prerenderización en cada despliegue, incluso si cambió solo el catálogo o una clave. Un fallo de API, permisos, IDs, build o verificación impide completar la imagen, conservando la instancia publicada anterior. La política de despliegue/interrupciones sigue dependiendo de Dokploy; esta configuración no garantiza cero downtime.

Requiere Docker Compose >= 2.23.1 y BuildKit, compatibles con secretos de build, contextos de servicios e inline configs. No requiere Node en el host Dokploy. La arquitectura de las imágenes corresponde a su builder; utiliza el builder configurado en tu servidor y revisa recursos para los procesos de compilación.

Para verificar/build local del mismo flujo, con Node 24 y Docker:

```sh
npm run test:deployment
npm run release:build -- --env-file .env.production --odoo-only --check
# Tras configurar Odoo y sus IDs:
npm run release:build -- --env-file .env.production --check
npm run release:build -- --env-file .env.production
```

La ayuda local solo llama a `docker compose build`. No publica imágenes ni despliega; `--push` no forma parte de este flujo. El Compose local y el Dockerfile que empaqueta artefactos locales se conservan; Dokploy usa `infrastructure/dokploy/Dockerfile.storefront` y no depende de un dist generado en tu equipo.

## Domains y HTTPS

Activa **Isolated Deployments** en tu aplicación Dokploy y conserva su configuración Git/build. Configura DNS A/AAAA al servidor correcto, HTTPS/Let's Encrypt y estos destinos en Domains:

| Host | Servicio | Puerto | Path | Strip Path |
| --- | --- | --- | --- | --- |
| `lumio-catalog.escod.com.gt` | `lm-storefront` | 80 | `/` | No |
| `lumio-odoo.escod.com.gt` | `odoo` | 8069 | `/` | No |
| `lumio-odoo.escod.com.gt` | `odoo` | 8072 | `/websocket` | No |

La regla WebSocket específica debe prevalecer sobre `/`. Verifica Preview Compose/Traefik y las notificaciones Odoo. No asignes dominios ni puertos del host a Java o PostgreSQL. El navegador utiliza únicamente `/graphql` y `/catalog-media/` del dominio de tienda. Nginx resuelve el nombre Java durante las peticiones para soportar cambios de IP y propaga el protocolo HTTPS hacia Java.

Los volúmenes `odoo-db-data` y `odoo-web-data` conservan DB/filestore entre despliegues. No montes carpetas del checkout: los addons están en la imagen. Ajusta los límites iniciales a CPU/RAM reales y reserva margen para Dokploy/Traefik/SO; no miden por sí solos la salud del catálogo.

## Verificación, cambios y recuperación

Tras desplegar verifica HTTPS, login Odoo español, WebSocket, `/healthz`, GraphQL, logo/imagen, una ficha cuyo HTML tenga datos reales, canonical y sitemap. Prueba búsqueda/facetas/cargar más, variantes, favoritos y pedido/WhatsApp. Abrir WhatsApp no envía ni confirma el pedido. Los favoritos/pedidos siguen siendo locales al navegador.

Antes de cambios de Odoo/módulos realiza un dump PostgreSQL consistente y una copia coordinada de `/var/lib/odoo` durante una ventana sin escrituras. Configura backups externos/retención en Dokploy y prueba una restauración aislada. Una copia del volumen PostgreSQL en caliente no sustituye un dump válido; restaura DB y filestore de la misma copia. Conserva configuración privada y versiones de código/imágenes. `down -v` no forma parte de actualizaciones.

Actualiza addons de forma explícita: detén Odoo, conserva backups, utiliza la imagen compilada del nuevo código para ejecutar `odoo -d BASE -u MODULOS --no-http --stop-after-init` y después inicia el servicio. Cambiar passwords en Environment no cambia roles PostgreSQL de un volumen existente: rota ambos de forma coordinada. El rollback de código se realiza con el mecanismo de Dokploy y su checkout/build, sin borrar/restaurar datos Odoo automáticamente. Se conserva Spring Boot `4.2.0-SNAPSHOT`; reconstruir un commit podría resolver otro snapshot, por lo que registra los binarios realmente probados.

Después de cambiar catálogo, slugs, publicación, identidad, precios/disponibilidad SEO o dominio, vuelve a desplegar para regenerar HTML estático. El navegador consulta datos actuales y revalida pedidos; el SEO conserva el snapshot del último build.

Verificación de este flujo: build nativo Compose de Java/Odoo/escaparate, 53 pruebas Angular y nueve de configuración/prerenderizado, API Java temporal contra un Odoo aislado, HTML con contenido real y canonical del dominio de producción, runtime Nginx sin Node/Java y navegación/hidratación/favoritos/pedido en 390/1440 px. Se cambió únicamente la clave API después de un build válido: el nuevo build falló, no reutilizó un prerender cacheado y conservó la imagen anterior. Los datos sintéticos y credenciales del ensayo no se escriben en `.env.production` ni en Odoo de producción.

Pendientes que requieren la instancia/servidor reales: clave API e IDs de Odoo, WhatsApp del negocio, DNS/HTTPS y routing WebSocket en tu Dokploy, recursos y ensayo de backup/restauración. No se sustituyen por valores ficticios ni por datos de la demo.

Fuentes oficiales: [Dokploy Compose y Environment](https://docs.dokploy.com/docs/core/docker-compose), [dominios Compose](https://docs.dokploy.com/docs/core/docker-compose/domains), [BuildKit secrets](https://docs.docker.com/build/building/secrets/), [Compose build](https://docs.docker.com/reference/compose-file/build/), [producción Odoo 19](https://www.odoo.com/documentation/19.0/es_419/administration/on_premise/deploy.html).
