# V5.1 PostgreSQL-Backup: DatabaseBackupService — Implementierungsbericht

> **Datum:** 2026-03-03
> **Agent:** server-dev + db-inspector (parallel)
> **Status:** IMPLEMENTIERT

---

## A1: Docker-Topologie — Analyse

| Aspekt | Ergebnis |
|--------|----------|
| PostgreSQL-Container | `automationone-postgres` (Service: `postgres`) |
| Image | `postgres:16-alpine` |
| pg_dump Version | 16.12 (nativ im postgres-Container) |
| Netzwerk | `automationone-net` (bridge) |
| Volume | `automationone-postgres-data` (benannt) |
| Server-Container | `python:3.11-slim-bookworm` — hat `libpq5` aber KEIN `pg_dump` |
| DB-Groesse | 17 MB total, 26 Tabellen |
| Credentials | `POSTGRES_USER=god_kaiser`, `POSTGRES_DB=god_kaiser_db` (aus .env) |

### Gewaehlte Option: B — pg_dump im Server-Container

**Begruendung:**
- Kein Docker-Socket noetig (sicherer)
- Server-Container kann PostgreSQL ueber Docker-DNS erreichen (`postgres:5432`)
- `postgresql-client` in Dockerfile Runtime-Stage installiert (~15 MB)
- `asyncio.create_subprocess_exec()` fuer non-blocking Ausfuehrung

---

## A2: Pattern-Analyse

| Pattern | Quelle | Anwendung in V5.1 |
|---------|--------|-------------------|
| Settings-Subklasse | `MaintenanceSettings` | `DatabaseBackupSettings` in config.py |
| Service-Singleton | `init_maintenance_service()` | `init_database_backup_service()` |
| Cron-Job-Registration | `MaintenanceService.start()` | Direkt in main.py Step 3.4.6 (analog Step 3.4.4 Digest) |
| Backup-Verzeichnis | `audit_backup_service.py` → `backups/audit_logs/` | `backups/database/` |
| REST-Router | `diagnostics.py`, `audit.py` | `backups.py` mit AdminUser Guard |
| Prometheus-Metriken | `metrics.py` Pattern | 4 neue Metriken (Counter, Gauge) |

### Architektur-Unterschied zu audit_backup_service:
- `AuditBackupService` nimmt `AsyncSession` (JSON-basiert)
- `DatabaseBackupService` nimmt `DatabaseBackupSettings` (subprocess-basiert, keine DB-Session)

---

## A3: Implementierte Dateien

### Neue Dateien

| Datei | Zeilen | Beschreibung |
|-------|--------|-------------|
| `src/services/database_backup_service.py` | ~380 | Service: create, list, get, delete, cleanup, restore |
| `src/api/v1/backups.py` | ~180 | REST-Router: 6 Endpoints (Admin only) |
| `tests/unit/test_database_backup_service.py` | ~280 | 20 Unit-Tests |

### Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/core/config.py` | `DatabaseBackupSettings` Subklasse (10 ENV-Variablen) + `backup` in Settings |
| `src/core/metrics.py` | 4 Prometheus-Metriken: `backup_created_total`, `backup_failed_total`, `backup_size_bytes`, `backup_last_success_timestamp` |
| `src/api/v1/__init__.py` | `backups_router` Import + include_router |
| `src/main.py` | Step 3.4.6: DatabaseBackupService init + Cron-Job (02:00) |
| `El Servador/Dockerfile` | `postgresql-client` in Runtime-Stage + `/app/backups/database` Verzeichnis |

---

## REST-API Endpoints

| Method | Route | Auth | Beschreibung |
|--------|-------|------|-------------|
| `POST` | `/v1/backups/database/create` | Admin | Sofort-Backup ausloesen |
| `GET` | `/v1/backups/database/list` | Admin | Alle Backups auflisten |
| `GET` | `/v1/backups/database/{id}/download` | Admin | Backup-Datei herunterladen |
| `DELETE` | `/v1/backups/database/{id}` | Admin | Einzelnes Backup loeschen |
| `POST` | `/v1/backups/database/{id}/restore` | Admin | Restore (confirm=true Pflicht) |
| `POST` | `/v1/backups/database/cleanup` | Admin | Manuelle Cleanup-Ausloesung |

---

## ENV-Variablen

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `DB_BACKUP_ENABLED` | `True` | Backup-Job aktiviert |
| `DB_BACKUP_HOUR` | `2` | Stunde fuer taegl. Backup |
| `DB_BACKUP_MINUTE` | `0` | Minute fuer taegl. Backup |
| `DB_BACKUP_MAX_AGE_DAYS` | `7` | Max Alter in Tagen |
| `DB_BACKUP_MAX_COUNT` | `20` | Max Anzahl Backups |
| `DB_BACKUP_PG_HOST` | `postgres` | PostgreSQL Host (Docker DNS) |
| `DB_BACKUP_PG_PORT` | `5432` | PostgreSQL Port |
| `DB_BACKUP_PG_DATABASE` | `god_kaiser_db` | Datenbankname |
| `DB_BACKUP_PG_USER` | `god_kaiser` | DB-User |
| `DB_BACKUP_PG_PASSWORD` | `password` | DB-Passwort (via PGPASSWORD) |

---

## Scheduler-Reihenfolge (nach Implementierung)

```
02:00 — database_backup (NEU - V5.1)        ← VOR Cleanup!
03:00 — cleanup_sensor_data                   (wenn ENABLED)
03:30 — cleanup_command_history               (wenn ENABLED)
hourly — cleanup_orphaned_mocks              (wenn ENABLED)
```

---

## Prometheus-Metriken

| Metrik | Typ | Beschreibung |
|--------|-----|-------------|
| `god_kaiser_backup_created_total` | Counter | Erfolgreiche Backups |
| `god_kaiser_backup_failed_total` | Counter | Fehlgeschlagene Backups |
| `god_kaiser_backup_size_bytes` | Gauge | Groesse des letzten Backups |
| `god_kaiser_backup_last_success_timestamp` | Gauge | Unix-Timestamp letztes Backup |

### Grafana-Alert (manuell hinzufuegen):
```yaml
- alert: DatabaseBackupMissing
  expr: time() - god_kaiser_backup_last_success_timestamp > 90000  # >25h
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Kein DB-Backup seit >25h"
```

---

## Safety-Features

1. **Atomic Write:** Temp-File → Rename (verhindert korrupte Partial-Backups)
2. **PGPASSWORD:** Passwort wird nur als ENV-Variable an Subprocess uebergeben (nicht in Commandline)
3. **Restore-Gate:** `confirm=true` Query-Parameter Pflicht
4. **Backup VOR Cleanup:** 02:00 < 03:00 (durch Scheduler-Reihenfolge garantiert)
5. **Zweistufiger Cleanup:** Erst nach Alter, dann nach Anzahl (max 20)

---

## A4: Verifikation

| # | Test | Status |
|---|------|--------|
| 1 | Syntax-Check (ast.parse) | BESTANDEN |
| 2 | Unit-Tests (29 Tests) | BESTANDEN (29/29, 0.46s) |
| 3 | Docker Build mit postgresql-client | AUSSTEHEND |
| 4 | `POST /v1/backups/database/create` | AUSSTEHEND |
| 5 | Scheduler-Job um 02:00 | AUSSTEHEND |
| 6 | Backup-Datei .sql.gz korrekt | Unit-Test BESTANDEN |
| 7 | Cleanup nach 7 Tagen | Unit-Test BESTANDEN |

### Fixes waehrend Verifikation

- Import-Pfad korrigiert: `god_kaiser_server.src.*` → `src.*` (Docker-Container Pattern)
- Test `test_create_backup_pg_dump_failure`: Mock um `_check_pg_dump()` Version-Check erweitert

---

## Naechste Schritte

1. `docker compose up -d --build el-servador` (Rebuild mit postgresql-client)
2. `POST /v1/backups/database/create` testen (manuell)
3. Grafana-Alert hinzufuegen (manuell)
