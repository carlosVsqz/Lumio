#!/bin/sh
# Read-only Docker metadata and loopback HTTP checks. Never read container environments.
set -eu
project=${1:-lumio-app-foi4r6}
case "$project" in ''|*[!a-z0-9_-]*) echo 'Usa el nombre real del proyecto Compose.' >&2; exit 2;; esac
command -v docker >/dev/null || { echo 'Docker no está disponible.' >&2; exit 2; }
docker info --format '{{.ServerVersion}}' >/dev/null
found=false

find_container() {
  docker ps -aq --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=$1"
}

for service in odoo-db odoo-init odoo lm-core storefront-build lm-storefront; do
  printf '\nServicio: %s\n' "$service"
  ids=$(find_container "$service")
  if [ -z "$ids" ]; then echo 'No hay contenedor de este servicio en el proyecto.'; continue; fi
  for id in $ids; do
    found=true
    docker inspect --format '{{.Name}} state={{.State.Status}} exit={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} restarts={{.RestartCount}}{{if .State.Health}} health={{.State.Health.Status}}{{end}}' "$id"
    docker inspect --format '{{range $name, $network := .NetworkSettings.Networks}}network={{$name}} ip={{$network.IPAddress}} aliases={{json $network.Aliases}}{{println}}{{end}}' "$id"
    case "$service" in
      odoo|lm-storefront)
        labels=$(docker inspect --format '{{range $key, $value := .Config.Labels}}{{println $key "=" $value}}{{end}}' "$id" |
          awk '/^traefik\.enable =/ || /^traefik\.docker\.network =/ || /^traefik\.http\.routers\./ || /^traefik\.http\.services\..*\.loadbalancer\.server\.port =/')
        if [ -z "$labels" ]; then echo 'No hay etiquetas HTTP de Traefik en este contenedor.'; else printf '%s\n' "$labels"; fi
        if [ "$(docker inspect --format '{{.State.Running}}' "$id")" != true ]; then continue; fi
        if [ "$service" = odoo ]; then
          docker exec "$id" getent hosts odoo-db || echo 'No se resolvió odoo-db desde Odoo.'
          docker exec "$id" curl --silent --show-error --connect-timeout 3 --max-time 8 \
            --output /dev/null --write-out 'HTTP interno Odoo /web/login: %{http_code}\n' \
            --header 'Host: lumio-odoo.escod.com.gt' http://127.0.0.1:8069/web/login || true
        else
          if docker exec "$id" wget -q -T 8 -O /dev/null http://127.0.0.1/; then
            echo 'HTTP interno Nginx /: correcto.'
          else
            echo 'HTTP interno Nginx /: falló; revisar storefront-build y el volumen estático.'
          fi
          docker exec "$id" test -f /usr/share/nginx/html/current/index.html &&
            echo 'Artefacto de producción current/index.html: presente.' ||
            echo 'Artefacto de producción current/index.html: ausente.'
        fi
        ;;
    esac
  done
done

if [ "$found" = false ]; then
  echo 'No se encontró el proyecto; verifica su nombre en Dokploy o en docker ps.' >&2
  exit 1
fi

proxy=${LUMIO_PROXY_CONTAINER:-dokploy-traefik}
printf '\nRedes del proxy: %s\n' "$proxy"
if docker inspect "$proxy" >/dev/null 2>&1; then
  docker inspect --format '{{range $name, $network := .NetworkSettings.Networks}}network={{$name}} ip={{$network.IPAddress}}{{println}}{{end}}' "$proxy"
else
  echo 'Proxy no encontrado con ese nombre; define LUMIO_PROXY_CONTAINER con el nombre real.'
fi
printf '\nLas URLs de .env.production no crean routers. Revisa Domains y Preview Compose en Dokploy.\n'
