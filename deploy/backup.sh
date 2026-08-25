#!/usr/bin/env bash
# Backs up the BillTracker database and uploaded bills to a network share
# (e.g. a WD My Cloud mounted over SMB/CIFS). Intended to run on a schedule
# via cron - see deploy/README.md for the mount + cron setup.
#
# IMPORTANT: this backs up a point-in-time COPY of the SQLite file. Don't
# point this at the live database path the app is running against for
# anything other than reading a copy - never run the app itself against a
# network share (see deploy/README.md for why).

set -euo pipefail

APP_DIR="${BILLTRACKER_DIR:-$HOME/billtracker}"
BACKUP_DEST="${BILLTRACKER_BACKUP_DEST:-/mnt/mycloud/billtracker-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ ! -d "$BACKUP_DEST" ]; then
  echo "Backup destination $BACKUP_DEST does not exist or isn't mounted. Aborting." >&2
  exit 1
fi

mkdir -p "$BACKUP_DEST/db" "$BACKUP_DEST/uploads"

# SQLite's own .backup command produces a consistent snapshot even if the
# app is writing at the same time - safer than copying the raw file.
sqlite3 "$APP_DIR/prisma/dev.db" ".backup '$BACKUP_DEST/db/dev-$STAMP.db'"

rsync -a --delete "$APP_DIR/public/uploads/" "$BACKUP_DEST/uploads/"

# Keep the last 30 database snapshots, prune older ones.
find "$BACKUP_DEST/db" -name 'dev-*.db' -mtime +30 -delete

echo "Backup complete: $BACKUP_DEST/db/dev-$STAMP.db"
