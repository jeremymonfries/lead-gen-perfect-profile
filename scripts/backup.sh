#!/bin/bash
# Full local database data backup -> backups/data-YYYY-MM-DD-HHMMSS.sql (newest 30 kept).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running, so the database can't be backed up. Open Docker Desktop and try again."; exit 1
fi
if ! npx supabase status >/dev/null 2>&1; then
  echo "The database isn't running. Start it first (double-click Start Perfect Profile), then try again."; exit 1
fi

mkdir -p backups
file="backups/data-$(date +%Y-%m-%d-%H%M%S).sql"
echo "Backing up the database..."
if ! npx supabase db dump --local --data-only -f "$file"; then
  rm -f "$file"
  echo "Backup failed."; exit 1
fi
if [ ! -s "$file" ]; then rm -f "$file"; echo "Backup failed (empty file)."; exit 1; fi

echo "Saved: $PWD/$file ($(du -h "$file" | cut -f1 | tr -d ' '))"

# Keep only the newest 30 backups.
ls -1t backups/data-*.sql 2>/dev/null | tail -n +31 | while IFS= read -r old; do rm -f "$old"; done
