#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backups/automationone_${TIMESTAMP}.sql.gz"

mkdir -p backups

echo "Creating backup: ${BACKUP_FILE}"
docker exec automationone-postgres pg_dump -U god_kaiser -d god_kaiser_db | gzip > "${BACKUP_FILE}"

echo "Done: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Keep last 7 backups
ls -1t backups/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
