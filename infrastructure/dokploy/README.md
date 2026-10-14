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

## Consumo durante el despliegue

Los límites actuales pueden sumar **5,375 GiB** con Odoo (2 GiB), build Angular (2 GiB), Java (768 MiB), PostgreSQL (512 MiB) y Nginx (128 MiB). Son máximos por contenedor, no una reserva ni una medición de uso. Se necesita además margen para Linux, Docker, Dokploy, otros proyectos y las imágenes que se están construyendo. Un VPS con menos memoria libre puede agotar RAM o pasar a swap; antes de ajustar los límites revisa la capacidad y el uso real.

El build Java limita Gradle a un worker, heap de 512 MiB, metaspace de 256 MiB y tests en un único proceso con heap de 384 MiB. Estos heaps no incluyen toda la memoria nativa. La tarea Angular usa por defecto `LUMIO_BUILD_WORKERS=1`, compilación TypeScript sin worker paralelo, heap `LUMIO_BUILD_HEAP_MB=1024` y cuota `LUMIO_BUILD_CPUS=1.0`. Mantén margen entre heap y `LUMIO_BUILD_MEMORY`; el heap de Node no es el consumo total del contenedor. Estos ajustes reducen concurrencia y pueden alargar el despliegue.

**Los `mem_limit`/`cpus` del Compose limitan contenedores en ejecución, no los pasos `RUN` de BuildKit.** `COMPOSE_PARALLEL_LIMIT=1` limita operaciones del cliente Compose; algunas versiones que delegan builds a Bake no lo trasladan al solver. Si el pico ocurre al construir imágenes, configura el builder que ya utiliza Dokploy con `max-parallelism = 1` y su presupuesto de CPU/RAM; no basta con cambiar el límite de `storefront-build`. La [documentación de BuildKit](https://docs.docker.com/build/buildkit/configure/#max-parallelism) explica cómo aplicar ese límite según el driver, y [Docker documenta RAM, CPU y swap](https://docs.docker.com/engine/containers/resource_constraints/). No se crea ni modifica automáticamente un builder del servidor.

`core-entrypoint.sh` espera al proceso Java y comprueba el hash de la configuración cada segundo. Solo reinicia Java si cambió el archivo; un fallo con la configuración estable termina el supervisor y se aplica la política de reinicio de Docker. Para confirmar un cuelgue del VPS, usa la consola/SSH del servidor y recopila:

```sh
free -h
uptime
docker stats --no-stream
df -h
vmstat 1 5
sudo journalctl -k --since "1 hour ago" | rg -i 'out of memory|oom|killed process'
```

Si no está disponible `rg`, usa `grep -Ei` para el último filtro. RAM libre muy baja con actividad de swap, eventos OOM, disco lleno, espera de I/O o CPU sostenida requieren respuestas diferentes; sin esas métricas no se puede atribuir el cuelgue a Lumio. Si el despliegue sigue activo durante la saturación, cancélalo en Dokploy y recopila métricas antes de reintentarlo; conserva los volúmenes de datos.

## Dominios en Dokploy

Activa Isolated Deployments y verifica Preview Compose, la red común, DNS al servidor correcto y HTTPS/Let's Encrypt:

| Host | Servicio | Puerto | Path | Strip Path |
| --- | --- | --- | --- | --- |
| `lumio-catalog.escod.com.gt` | `lm-storefront` | 80 | `/` | No |
| `lumio-odoo.escod.com.gt` | `odoo` | 8069 | `/` | No |
| `lumio-odoo.escod.com.gt` | `odoo` | 8072 | `/websocket` | No |

La regla WebSocket específica debe prevalecer sobre `/`. No asignes dominios ni puertos del host a Java/PostgreSQL o a las tareas. El manager/listado de bases debe permanecer bloqueado. Nginx resuelve Java durante las peticiones para soportar cambios de IP y propaga HTTPS hacia el backend. Los seis servicios declaran explícitamente la red `backend`, cuyo nombre Compose delimita por proyecto. En Preview Compose conserva esa red para todos; Odoo y Nginx también deben acceder a la red que Dokploy/Traefik agregue para sus dominios.

## Ambos dominios devuelven `404 page not found`

Un `404` con ese texto plano es compatible con una petición sin router coincidente en Traefik. Los puertos de esta aplicación son 80 para `lm-storefront`, 8069 para Odoo y 8072 para WebSocket. `PUBLIC_SITE_URL` y `ODOO_PUBLIC_URL` configuran SEO/identidad; **no registran dominios o routers en Dokploy**. Las etiquetas de Traefik llegan desde Domains al desplegar y no están duplicadas en el Compose del repositorio.

Desde SSH del VPS, ejecuta el diagnóstico usando el nombre real del proyecto:

```sh
sh scripts/Diagnose-LumioRouting.sh lumio-app-foi4r6
```

El script no cambia contenedores o redes ni imprime Environment, claves, cookies o etiquetas de autenticación. Muestra estado/health/exit/OOM, redes, reglas HTTP/puertos de Traefik y respuesta HTTP dentro de cada servicio. Si el proxy tiene otro nombre, pásalo mediante `LUMIO_PROXY_CONTAINER`. No ejecutes Docker Inspect completo al compartir resultados: puede incluir contraseñas de Environment.

- Si Odoo/Nginx no están activos o saludables, revisa primero `odoo-init`, conectividad a PostgreSQL y `storefront-build`. Un despliegue bloqueado puede no ofrecer routers activos.
- Si HTTP interno responde pero faltan etiquetas, configura los destinos de la tabla en Domains y despliega. No apuntes al servicio `storefront-build` ni a `odoo-init`.
- Si existen etiquetas, verifica que `Host(...)` contenga solo el hostname esperado, Path `/`, Strip Path desactivado, HTTPS/entrypoint correctos y que el proxy comparta la red seleccionada en `traefik.docker.network` con el contenedor. Preview Compose debe conservar `backend` además de la red de acceso.
- Si el origen funciona y solo falla a través de Cloudflare, revisa que los registros apunten al VPS correcto y que el modo SSL coincida con HTTPS del origen. Usa Full (strict) cuando el origen tenga un certificado válido; una petición HTTPS del navegador no demuestra que Cloudflare esté llegando al origen por HTTPS.

Fuentes: [404 y routers de Traefik](https://doc.traefik.io/traefik/getting-started/faq/), [etiquetas generadas por Dokploy](https://docs.dokploy.com/docs/core/docker-compose/domains), [SSL Full (strict) de Cloudflare](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/). El diagnóstico identifica la capa responsable; no introduce routers manuales que compitan con los definidos en Dokploy ni publica puertos del host para sortear el proxy.

## Error DNS interno `could not translate host name "odoo-db"`

Este error ocurre antes de autenticar o consultar PostgreSQL: Odoo no pudo resolver el nombre del servicio. Puede deberse a redes distintas, ausencia de un endpoint/alias o problemas del DNS embebido de Docker durante la saturación del servidor. Un timeout del cron por sí solo no identifica la causa del DNS ni demuestra falta de RAM.

Dokploy puede agregar una red a los servicios con dominio; depender únicamente de la red implícita puede separar Odoo de PostgreSQL. La red explícita `backend` conserva la comunicación interna mientras Dokploy agrega su red de acceso. Comprueba el Compose efectivo con Preview Compose y los endpoints reales desde SSH, sustituyendo nombres si cambió el proyecto:

```sh
docker inspect --format '{{json .NetworkSettings.Networks}}' lumio-app-foi4r6-odoo-1 lumio-app-foi4r6-odoo-db-1
docker exec lumio-app-foi4r6-odoo-1 getent hosts odoo-db
docker exec lumio-app-foi4r6-odoo-1 cat /etc/resolv.conf
docker inspect --format '{{.State.Status}} OOMKilled={{.State.OOMKilled}} RestartCount={{.RestartCount}}' lumio-app-foi4r6-odoo-db-1
```

Ambos contenedores deben compartir una red y PostgreSQL debe tener el alias `odoo-db` en ella. Si no la comparten, despliega el Compose corregido conservando proyecto y volúmenes. Si ya la comparten y la resolución sigue fallando, revisa los eventos/logs de Docker y las métricas del VPS antes de reiniciar el daemon, que afecta a todas las aplicaciones. Los resolvers públicos como `1.1.1.1` no conocen nombres internos como `odoo-db`; no cambies `HOST` por una IP de contenedor que podría cambiar al recrearlo. Consulta [las redes y dominios de Dokploy](https://docs.dokploy.com/docs/core/docker-compose/domains) y [el DNS de Compose](https://docs.docker.com/compose/how-tos/networking/).

El aviso sobre `http_interface` queda resuelto declarando `0.0.0.0` explícitamente en la configuración Odoo; no era la causa del fallo DNS. No se aumenta el timeout del cron para ocultar esta pérdida de conectividad.

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
