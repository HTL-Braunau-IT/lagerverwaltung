#!/bin/bash
#
# Lagershop: nächtliches Datenbank-Backup (für selbst betriebene Installationen).
# Wird per lagershop-backup.timer aufgerufen (README, Abschnitt 6).
#
# Aufruf: lagershop-backup [stack-verzeichnis]   (Standard: /srv/lagershop)
#
set -euo pipefail
# Dumps enthalten personenbezogene Daten: nur für den Besitzer lesbar.
umask 077

STACK_DIR=${1:-/srv/lagershop}
RETENTION_DAYS=${RETENTION_DAYS:-30}

cd "$STACK_DIR"

if [ -z "$(docker compose ps -q db 2>/dev/null)" ]; then
  echo "[backup] kein laufender db-Container in ${STACK_DIR}; nichts zu tun"
  exit 0
fi

mkdir -p backups
chmod 700 backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="backups/nightly-${STAMP}.dump"

# Erst unter temporärem Namen schreiben: ein abgebrochener Dump soll nicht wie
# ein gültiges Backup aussehen.
docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "${OUT}.partial"
mv "${OUT}.partial" "$OUT"

echo "[backup] ${STACK_DIR}/${OUT} geschrieben ($(du -h "$OUT" | cut -f1))"

find backups -maxdepth 1 -name 'nightly-*.dump' -mtime +"${RETENTION_DAYS}" -print -delete
find backups -maxdepth 1 -name '*.partial' -mtime +1 -print -delete
