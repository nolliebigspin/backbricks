#!/bin/sh
set -eu
umask 077

staging=/backup-staging
tag="${BACKUP_NAMESPACE:?Configure a deployment backup namespace first}"
has_garage_data() {
  [ -n "$(ls -A /garage/meta)" ] || [ -n "$(ls -A /garage/data)" ]
}

case "${1:-}" in
  init)
    exec restic init
    ;;
  snapshots)
    shift
    exec restic snapshots --tag "$tag" "$@"
    ;;
  backup)
    mkdir -p "$staging"
    pg_dump --format=custom --file="$staging/database.dump"
    if has_garage_data; then
      printf 'yes\n' > "$staging/has-garage"
      restic backup --tag "$tag" "$staging" /garage/meta /garage/data
    else
      printf 'no\n' > "$staging/has-garage"
      restic backup --tag "$tag" "$staging"
    fi
    restic forget --tag "$tag" --keep-within 30d --group-by tags --prune
    ;;
  restore)
    snapshot="${2:?Specify a Backbricks snapshot ID}"
    case "$snapshot" in
      *[!a-f0-9]*|'') echo 'Specify a hexadecimal snapshot ID.' >&2; exit 2 ;;
    esac
    tables=$(psql -XAtqc "select count(*) from pg_tables where schemaname = 'public'")
    if [ "$tables" != 0 ]; then
      echo 'Restore requires a new database without application tables.' >&2
      exit 1
    fi
    if has_garage_data; then
      echo 'Restore requires empty Garage volumes.' >&2
      exit 1
    fi
    restic restore "$snapshot" --target "$staging" --verify
    dump="$staging/backup-staging/database.dump"
    test -s "$dump"
    pg_restore --list "$dump" >/dev/null
    has_objects=$(cat "$staging/backup-staging/has-garage")
    case "$has_objects" in
      yes) test -d "$staging/garage/meta"; test -d "$staging/garage/data" ;;
      no) ;;
      *) echo 'The snapshot is missing its storage inventory.' >&2; exit 1 ;;
    esac
    pg_restore --single-transaction --exit-on-error --no-owner --no-acl \
      --dbname="$PGDATABASE" "$dump"
    if [ "$has_objects" = yes ]; then
      cp -a "$staging"/garage/meta/. /garage/meta/
      cp -a "$staging"/garage/data/. /garage/data/
    fi
    ;;
  *)
    echo 'Usage: backup [init|snapshots|backup|restore SNAPSHOT_ID]' >&2
    exit 2
    ;;
esac
