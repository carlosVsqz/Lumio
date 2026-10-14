# Un solo despliegue de Lumio en Dokploy

En tu aplicación Dokploy usa **Docker Compose**, el repositorio Lumio y `compose.production.yaml`. Configura Environment con los valores privados de `.env.production` y despliega. No hay perfiles, fases manuales, registro de imágenes ni API pública previa necesaria para compilar.

El comando equivalente desde la raíz es:

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait --wait-timeout 240
```

Dokploy puede conservar su comando estándar `up -d --build --remove-orphans`; las dependencias del Compose ordenan las tareas. Conserva el mismo nombre de proyecto entre despliegues para reutilizar los volúmenes.

## Qué ejecuta automáticamente

1. **PostgreSQL** crea una base vacía y un rol Odoo sin superusuario/creación de bases/roles, únicamente al inicializar un volumen vacío.
2. **odoo-init** instala los módulos necesarios sin demo, configura administrador seguro, español, logo L y moneda inicial, prepara el usuario de lectura, obtiene sitio/tarifa/almacén reales y genera una clave API válida. Reutiliza clave y referencias existentes; no restablece passwords, precios, productos, stock, moneda o identidad de una instalación ya preparada. Si hay varios registros y no existe una selección previa, exige el ID explícito en Environment. No elige otra tarifa/almacén silenciosamente.
3. **Odoo** arranca después de completar esa tarea, con base única, `list_db=False`, proxy mode y workers. No expone un administrador predeterminado antes de configurarlo.
4. **lm-core** lee la integración privada y arranca. Su dominio/proveedores siguen independientes; CatalogProvider solo realiza lecturas. Si cambian los parámetros privados por una rotación/selección, el supervisor reinicia Java para cargar la configuración nueva.
5. **storefront-build** consulta exclusivamente GraphQL de Lumio, ejecuta el build estático de Angular, verifica HTML/SEO y publica una carpeta completa de forma atómica. Esa tarea usa Node solo como compilador y termina con código 0. No recibe API keys, passwords ni modelos internos de Odoo.
6. **Nginx** sirve únicamente los archivos estáticos del volumen, montado como solo lectura, y reenvía `/graphql` y `/catalog-media/` a Java. La imagen no contiene Node ni Java.

Las imágenes se construyen desde el código antes del arranque, sin consultar una API todavía inexistente. La compilación de Angular que necesita datos ocurre en la tarea de build posterior al arranque de Java, dentro del mismo deploy. Así se conserva `outputMode: static` y prerenderizado real sin introducir un servidor Node en producción.

Si falla la inicialización o GraphQL, la tarea falla y bloquea la publicación del escaparate. Nunca se sustituye el catálogo por demo. Un build fallido conserva la carpeta publicada anterior; la política de reemplazo de contenedores/interrupciones sigue siendo responsabilidad de Dokploy, sin garantía de cero downtime. Cada `up` vuelve a ejecutar las tareas y recompila el catálogo, incluso si no cambió el código.

## Variables y credenciales

Los dominios configurados son:

- `PUBLIC_SITE_URL=https://lumio-catalog.escod.com.gt` para canonical, JSON-LD, sitemap y robots.
- `ODOO_PUBLIC_URL=https://lumio-odoo.escod.com.gt` para administración Odoo.

El tráfico entre servicios utiliza `http://odoo:8069` y `http://lm-core:8080/graphql`; no depende de DNS/HTTPS público durante la preparación. Los cuatro passwords independientes se guardan solo en `.env.production` privado y Environment de Dokploy; la plantilla mantiene secretos vacíos. No hay que generar manualmente la clave API ni copiar IDs de la demo: dejar `ODOO_API_KEY`, `ODOO_WEBSITE_ID`, `ODOO_PRICELIST_ID`, `ODOO_WAREHOUSE_ID` vacíos activa la preparación automática. Esos campos también permiten selección explícita de referencias existentes o una clave válida del usuario de integración.

La clave y referencias reales quedan en `catalog-integration`, archivo `catalog.properties` con permisos `0640` y directorio `2750`. Solo bootstrap y Java montan ese volumen, compartiendo el grupo 11000; Java lo monta como solo lectura. Odoo almacena la verificación de la clave y la tarea conserva/reutiliza su clave vigente, renovándola al desplegar si venció o fue revocada. La clave no se imprime ni entra en frontend, imágenes o argumentos de build.

Las claves generadas vencen a los 89 días. La tarea no permanece ejecutándose: programa su rotación antes del vencimiento, revocando la clave del usuario técnico desde Odoo y ejecutando de nuevo el despliegue completo. Sin un nuevo despliegue no se renueva automáticamente; una clave vencida produce un error explícito del catálogo.

`LUMIO_CURRENCY=GTQ` configura la empresa y las tarifas iniciales en la primera instalación; cambiar ese valor no altera la moneda de una instalación existente. Configura cambios monetarios desde Odoo y su lista de precios. La tarifa inicial se crea solo si no existe una apropiada; no crea reglas, descuentos ni precios de productos. La base nueva queda **sin productos, inventario o campañas ficticias**. El administrador carga el catálogo real desde Odoo normalmente, sin pasos de infraestructura adicionales.

El logo procede del sitio Odoo; `LUMIO_LOGO_URL` vacío significa que no hay respaldo manual. WhatsApp queda deshabilitado hasta indicar el número real del negocio. Los favoritos/pedidos siguen guardados solo en ese navegador; abrir WhatsApp no envía ni confirma el pedido y no se crean pedidos/contactos de clientes/reservas en Odoo.

Requisitos de despliegue: Docker Compose >= 2.23.1, builder Linux y memoria disponible para Odoo, Java, PostgreSQL y el build Angular. Ajusta `LUMIO_BUILD_MEMORY` y los límites de servicios a tu servidor; los valores iniciales no constituyen una medición de capacidad. No necesitas Node instalado en el host ni un registro de imágenes.

## Dominios en Dokploy

Activa Isolated Deployments y verifica Preview Compose, la red común, DNS al servidor correcto y HTTPS/Let's Encrypt:

| Host | Servicio | Puerto | Path | Strip Path |
| --- | --- | --- | --- | --- |
| `lumio-catalog.escod.com.gt` | `lm-storefront` | 80 | `/` | No |
| `lumio-odoo.escod.com.gt` | `odoo` | 8069 | `/` | No |
| `lumio-odoo.escod.com.gt` | `odoo` | 8072 | `/websocket` | No |

La regla WebSocket específica debe prevalecer sobre `/`. No asignes dominios ni puertos del host a Java/PostgreSQL o a las tareas. El manager/listado de bases debe permanecer bloqueado. Nginx resuelve Java durante las peticiones para soportar cambios de IP y propaga HTTPS hacia el backend.

## Actualizaciones, verificación y backups

Después de cambiar productos, slugs, publicación, categorías, atributos, identidad, precios/disponibilidad SEO o dominio, despliega de nuevo: el mismo Compose vuelve a generar las páginas. El navegador consulta datos actuales y revalida precio/disponibilidad antes del pedido; el SEO conserva la última compilación. `storefront-static/current` cambia solo después de verificar el build completo y se conserva una versión anterior.

La preparación instala módulos faltantes; no actualiza automáticamente módulos ya instalados ni migra una base de PostgreSQL entre versiones. Las migraciones de módulos requieren su ventana, backups y operación administrativa apropiada. Cambiar passwords en Environment no cambia roles existentes de PostgreSQL: rota DB y configuración de forma coordinada. No utilices seeding demo en producción.

Haz dumps PostgreSQL consistentes y copias coordinadas del filestore `/var/lib/odoo` y del volumen privado `catalog-integration`, con retención fuera del servidor y ensayo de restauración aislado. Copiar el volumen PostgreSQL en caliente no sustituye un dump válido. El volumen público `storefront-static` puede regenerarse. No uses `down -v` en actualizaciones y no cambies de proyecto para cada deploy.

Comprueba los cuatro servicios saludables y las dos tareas terminadas con código 0, login español, GraphQL, logo/imágenes, HTML de una ficha, canonical/sitemap, variantes, filtros/favoritos/pedido y WebSocket. Una instalación vacía debe mostrar resultados vacíos reales, sin productos demo. Verifica una segunda ejecución con datos existentes y fallos de API en staging.

## Diagnóstico de `odoo-init`

`service "odoo-init" didn't complete successfully: exit 1` es el resumen de Compose. Abre los logs de `odoo-init` en Dokploy para obtener la causa concreta; no compartas Environment, archivos `.env` ni claves.

Odoo 19 puede crear siete tablas técnicas `orm_signaling_*` al arrancar antes de instalar `base`, sin crear aún `ir_module_module`. El inicializador reconoce exclusivamente esos nombres y su estructura `id INTEGER` / `date TIMESTAMP`, y completa la primera instalación sobre el mismo volumen sin borrar tablas. Una versión anterior de Lumio rechazaba ese estado con `Existing database is not an Odoo database`; despliega el código corregido conservando los volúmenes.

Si falta `ir_module_module` y existen otras tablas o estructuras diferentes, se detiene y muestra los nombres inesperados. Verifica `ODOO_DATABASE` en Environment y consulta los nombres desde la terminal de `odoo-db`, sin modificar datos:

```sh
psql -U "$POSTGRES_USER" -d "$ODOO_DATABASE" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
```

No utilices `down -v`, borres tablas ni fuerces la inicialización sobre una base de otro sistema. Si el nombre era incorrecto, selecciona la base Odoo real y vuelve a desplegar. La recuperación automática de tablas técnicas se basa en el [registro oficial de Odoo 19](https://github.com/odoo/odoo/blob/19.0/odoo/orm/registry.py).

Fuentes: [Dokploy Compose](https://docs.dokploy.com/docs/core/docker-compose), [dependencias y tareas completadas de Compose](https://docs.docker.com/reference/compose-file/services/#depends_on), [producción Odoo 19](https://www.odoo.com/documentation/19.0/es_419/administration/on_premise/deploy.html).
