# Infrastructure Notes

## Backup

AutomationOne fuehrt den geplanten Datenbank-Backup-Lauf ueber den `el-servador` Scheduler aus.

- **Schedule:** Standardmaessig taeglich `02:00 UTC` (`DB_BACKUP_HOUR`, `DB_BACKUP_MINUTE`)
- **Storage:** `/app/backups/database` im Container, via Host-Mount `./backups`
- **Retention:** `DB_BACKUP_MAX_AGE_DAYS` und `DB_BACKUP_MAX_COUNT`
- **Auth-Quelle (Dev):** `DB_BACKUP_PG_PASSWORD` wird aus `${POSTGRES_PASSWORD}` in `docker-compose.yml` gespiegelt
- **Auth-Quelle (Prod empfohlen):** `DB_BACKUP_PGPASSFILE` mit Docker Secret im `.pgpass`-Format

### Schnellchecks

```bash
docker exec automationone-server printenv DB_BACKUP_PG_PASSWORD
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT 1;"
docker compose logs el-servador --since 10m
```

### Backup-Script

Das Shell-Hilfsskript `scripts/docker/backup.sh` ist fuer manuelle Laufpruefungen gedacht:

- 3 Versuche mit Exponential Backoff
- JSON-Logzeilen nach `logs/backup/backup.log`
- Exit-Code `0` nur bei erfolgreichem Dump
