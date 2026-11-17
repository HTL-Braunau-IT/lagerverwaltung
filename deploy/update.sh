#!/bin/sh
# Backs up the database, then pulls and restarts the app if a new image exists.
# Migrations run automatically when the app container starts.
# Run nightly via cron, e.g.:  30 3 * * *  /opt/lagershop/update.sh >> /var/log/lagershop-update.log 2>&1
set -eu

cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
echo "[$stamp] Backup ..."
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/lager-$stamp.dump"
find "$BACKUP_DIR" -name 'lager-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "[$stamp] Pull ..."
docker compose pull app
docker compose up -d app
docker image prune -f >/dev/null
echo "[$stamp] Fertig."
