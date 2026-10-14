#!/bin/bash
set -eu
settings_file="${LUMIO_SETTINGS_FILE:-}"
if [ -z "$settings_file" ]; then
  exec java -jar /app/app.jar "$@"
fi
if [ ! -r "$settings_file" ]; then
  echo 'No se pudo leer la configuración privada del catálogo.' >&2
  exit 1
fi
java_pid=''
watcher_pid=''
stop() {
  trap - TERM INT
  [ -z "$watcher_pid" ] || kill "$watcher_pid" 2>/dev/null || true
  [ -z "$java_pid" ] || kill -TERM "$java_pid" 2>/dev/null || true
  [ -z "$java_pid" ] || wait "$java_pid" 2>/dev/null || true
  exit 0
}
trap stop TERM INT
while true; do
  initial_hash=$(sha256sum "$settings_file")
  java -jar /app/app.jar --spring.config.additional-location="file:$settings_file" "$@" &
  java_pid=$!
  (
    while kill -0 "$java_pid" 2>/dev/null; do
      sleep 1
      current_hash=$(sha256sum "$settings_file")
      if [ "$current_hash" != "$initial_hash" ]; then
        kill -TERM "$java_pid" 2>/dev/null || true
        exit 0
      fi
    done
  ) &
  watcher_pid=$!
  status=0
  wait "$java_pid" || status=$?
  kill "$watcher_pid" 2>/dev/null || true
  wait "$watcher_pid" 2>/dev/null || true
  if [ "$(sha256sum "$settings_file")" = "$initial_hash" ]; then
    exit "$status"
  fi
  echo 'Configuración de integración actualizada; reiniciando Java.'
done
