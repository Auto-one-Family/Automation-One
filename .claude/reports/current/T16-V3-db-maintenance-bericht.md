# T16-V3 — Database Maintenance, Backup & Retention

**Datum:** 2026-03-10
**Typ:** Verifikationsbericht
**Pruefumfang:** 5 Tests (V-DB-01 bis V-DB-05)
**Gesamtergebnis:** 2 PASS, 2 PARTIAL, 1 FAIL

---

## Uebersicht

| Test-ID | Fokus | Ergebnis | Kritisch? |
|---------|-------|----------|-----------|
| V-DB-01 | Backup-Service Health | **FAIL** | JA — pg_dump Version-Mismatch |
| V-DB-02 | Sensor-Data-Retention + SHT31 | **PARTIAL** | JA — Dedup-Migration fehlt |
| V-DB-03 | Maintenance-Jobs Scheduler | **PASS** | Nein |
| V-DB-04 | Diagnostics Health-Checks | **PASS** | Nein |
| V-DB-05 | Admin-Backup-UI | **PARTIAL** | Nein |

---

## V-DB-01: Backup-Service Health — FAIL

### Befund

**Backup-Cron-Job:** Registriert und aktiv.
```
DatabaseBackupService initialized. backup_dir=/app/backups/database, enabled=True, schedule=02:00
Database backup job registered (daily 02:00, retain 7d, max 20)
```

**Letztes Backup:** KEINES. Backup-Verzeichnis `/app/backups/database/` ist leer.

**Manueller Trigger:** GESCHEITERT.
```
POST /api/v1/backups/database/create → 500
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 16.13; pg_dump version: 15.16 (Debian 15.16-0+deb12u1)
```

**Root Cause:**
- Server-Container basiert auf `python:3.11-slim-bookworm` (Debian 12)
- Debian 12 liefert `postgresql-client` Version 15.16
- PostgreSQL-Container ist `postgres:16-alpine` (Version 16.13)
- pg_dump 15 verweigert Dump von PostgreSQL 16 (Major-Version-Mismatch)

**Konfiguration (aus Code-Defaults):**
| Setting | Wert |
|---------|------|
| `DB_BACKUP_ENABLED` | `True` |
| `DB_BACKUP_HOUR` | `2` (02:00 UTC) |
| `DB_BACKUP_MINUTE` | `0` |
| `DB_BACKUP_MAX_AGE_DAYS` | `7` |
| `DB_BACKUP_MAX_COUNT` | `20` |

**Backup-Rotation:** Konfiguriert (7 Tage, max 20 Backups), aber irrelevant da kein Backup erstellt wird.

**Docker-Volume:** Kein Backup-Volume in `docker-compose.yml`. Selbst wenn pg_dump funktionieren wuerde, gingen Backups bei Container-Neustart verloren (nur Container-Dateisystem).

### Empfehlung

1. **CRITICAL FIX:** Im Dockerfile `postgresql-client-16` aus PostgreSQL APT-Repository installieren statt Default-`postgresql-client`
2. **IMPORTANT:** Backup-Volume in `docker-compose.yml` hinzufuegen: `./backups:/app/backups`
3. Nach Fix: Manuellen Backup-Test ausfuehren

---

## V-DB-02: Sensor-Data-Retention + SHT31-Duplikate — PARTIAL

### sensor_data Statistik

| Metrik | Wert |
|--------|------|
| Gesamt-Rows | 7.136 |
| Aeltester Eintrag | 2026-03-08 13:27:08 UTC |
| Neuester Eintrag | 2026-03-10 09:42:37 UTC |
| Tabellengroesse | 3.632 kB |
| DB-Gesamtgroesse | 16 MB |

### Wachstumsrate

| Tag | Rows |
|-----|------|
| 2026-03-08 | 84 |
| 2026-03-09 | 6.463 |
| 2026-03-10 | 589 (bis 10:15 UTC) |

**Anomalie:** 2026-03-09 zeigt massiven Anstieg (6.463 Rows) — vermutlich durch intensive Mock-ESP-Simulation oder SHT31-Duplikate vor dem Fix-Versuch. Aktuell (2026-03-10) normalisiert sich die Rate.

**Hochrechnung:** Bei ~2.000 Rows/Tag (normaler Betrieb mit 3 Sensoren):
- 1 GB erreicht in ~500 Tagen (unrealistisch bei aktuellem Setup)
- Kein akutes Wachstumsproblem im Dev-Setup

### Retention-Policy

| Setting | Wert |
|---------|------|
| `SENSOR_DATA_RETENTION_ENABLED` | `False` (DISABLED) |
| `SENSOR_DATA_RETENTION_DAYS` | `30` |
| `SENSOR_DATA_CLEANUP_DRY_RUN` | `True` |

**Status:** Korrekt fuer Dev-Setup. Unbegrenztes Wachstum bei aktuellem Volumen kein Problem.

### SHT31-Duplikate

**UNIQUE Constraint:** FEHLT auf sensor_data!

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'sensor_data'::regclass AND contype = 'u';
→ 0 rows
```

**Alembic-Version:** `add_device_scope_and_context` — die Migration `add_sensor_data_dedup` wurde NICHT angewandt.

**Existierende Duplikate:** 993 Duplikat-Gruppen gefunden.
```sql
SELECT COUNT(*) FROM (
  SELECT esp_id, gpio, sensor_type, timestamp, COUNT(*) as cnt
  FROM sensor_data
  GROUP BY esp_id, gpio, sensor_type, timestamp
  HAVING COUNT(*) > 1
) sub;
→ 993
```

### Empfehlung

1. **CRITICAL:** Alembic-Migration `add_sensor_data_dedup` anwenden: `alembic upgrade head`
   - Migration entfernt automatisch existierende Duplikate (behaelt jeweils kleinste ID)
   - Erstellt UNIQUE Constraint `uq_sensor_data_esp_gpio_type_timestamp`
2. **MEDIUM:** Fuer Production: Retention aktivieren (`SENSOR_DATA_RETENTION_ENABLED=True`)
3. **LOW:** Partitionierung erst ab >1M Rows erwaegen

---

## V-DB-03: Maintenance-Jobs Scheduler — PASS

### Registrierte Jobs (aus Server-Startup-Logs)

| Job | Typ | Schedule | Status |
|-----|-----|----------|--------|
| `health_check_esps` | MONITOR | Interval (60s) | AKTIV |
| `health_check_mqtt` | MONITOR | Interval | AKTIV |
| `health_check_sensors` | MONITOR | Interval | AKTIV |
| `cleanup_orphaned_mocks` | MAINTENANCE | Hourly | AKTIV (WARN ONLY) |
| `database_backup` | CUSTOM | Daily 02:00 | AKTIV (aber pg_dump scheitert, s. V-DB-01) |
| `system_cleanup` (Plugin) | CUSTOM | Cron `0 4 * * 0` | AKTIV (woechentlich So 04:00) |
| `cleanup_sensor_data` | MAINTENANCE | Daily 03:00 | **DISABLED** |
| `cleanup_command_history` | MAINTENANCE | Daily 03:30 | **DISABLED** |

### Scheduler-Framework

- **APScheduler** `AsyncIOScheduler` (in-memory JobStore, AsyncIO Executor)
- Wrapper: `CentralScheduler` mit Job-Kategorien (Prefix: `mock_`, `maintenance_`, `monitor_`)
- Event-Listener fuer `JOB_ERROR`, `JOB_EXECUTED`, `JOB_MISSED`

### Heartbeat-Log-Cleanup

**Kein dedizierter Heartbeat-Log-Cleanup-Job registriert.** Die `HeartbeatLogCleanup`-Klasse existiert im Code (`cleanup.py`), aber der `MaintenanceService` registriert keinen entsprechenden Job. Der Cleanup ist nur im Code vorbereitet, nicht aktiviert.

| Metrik | Wert |
|--------|------|
| `esp_heartbeat_logs` Gesamt | 1.657 Rows |
| Tabellengroesse | 1.584 kB |
| Aelter als 7 Tage | 0 Rows |

**Ergebnis:** Kein Cleanup noetig — Tabelle ist erst 2 Tage alt und klein.

### Fehlerbehandlung

- APScheduler `EVENT_JOB_ERROR` Listener registriert → Fehler werden geloggt
- Kein Retry-Mechanismus fuer fehlgeschlagene Jobs
- Kein Alert-System bei Job-Failures
- Graceful Shutdown: Jobs werden bei Server-Stop gestoppt

### Empfehlung

1. **LOW:** Heartbeat-Log-Cleanup-Job in `MaintenanceService.start()` registrieren (existiert als Klasse, fehlt als Job)
2. **LOW:** Job-Failure-Alerting ueber Notification-Service (Push/Email bei kritischen Fehlern)

---

## V-DB-04: Diagnostics Health-Checks — PASS

### Diagnostics-Ergebnis (Live-Ausfuehrung)

```
POST /api/v1/diagnostics/run → 200
Gesamtstatus: warning
Dauer: 0.90s
Ergebnis: 7/10 Checks gesund, 3 Warnungen
```

| Check | Status | Details |
|-------|--------|---------|
| server | healthy | CPU 0.9%, RAM 15.4%, Uptime 1h 9m |
| database | healthy | 31 Tabellen, 16 MB, 1 aktive Connection |
| mqtt | healthy | Verbunden, 0 stale Devices |
| esp_devices | **warning** | 1/3 online, 2 offline |
| sensors | **warning** | 3 Sensoren, 0 mit Alert-Config |
| actuators | healthy | 1 Aktor |
| monitoring | healthy | Grafana/Prometheus/Loki: up |
| logic_engine | healthy | 0 Rules, 0 Fehler |
| alerts | **warning** | 2.0 Alarme/h, 12 stehend (7 warning, 5 info) |
| plugins | healthy | 4/4 aktiv |

**Hinweis:** Die Diagnostics-Checks fokussieren auf System-Health (Server, MQTT, ESPs, Monitoring) statt auf detaillierte DB-Diagnostik (Vacuum, Bloat, Index-Health). Die im Auftrag erwarteten 10 DB-spezifischen Checks existieren so NICHT — stattdessen gibt es 10 System-Checks.

### Top 5 Tabellen nach Groesse

| Tabelle | Groesse | Live Rows |
|---------|---------|-----------|
| sensor_data | 3.632 kB | 6.891 |
| esp_heartbeat_logs | 1.584 kB | 1.655 |
| audit_logs | 656 kB | 458 |
| notifications | 272 kB | 86 |
| esp_devices | 216 kB | 3 |

### Vacuum-Status

| Tabelle | Letzter Auto-Vacuum | Dead Tuples | Live Tuples |
|---------|---------------------|-------------|-------------|
| sensor_data | 2026-03-10 09:15 | 0 | 6.891 |
| esp_heartbeat_logs | 2026-03-10 08:25 | 0 | 1.655 |
| audit_logs | 2026-03-10 07:49 | 114 | 458 |
| notifications | 2026-03-10 07:46 | 8 | 86 |

**Auto-Vacuum funktioniert korrekt.** sensor_data und esp_heartbeat_logs haben 0 Dead Tuples.

### Connection-Pool

| Metrik | Wert |
|--------|------|
| Active Connections | 1 |
| Idle Connections | 11 |
| Max Connections | 100 |

**Kein Pool-Erschoepfungsrisiko.** 12/100 Connections belegt.

### Bloat-Estimation

| Tabelle | Dead Tuples | Live Tuples | Bloat % |
|---------|-------------|-------------|---------|
| audit_logs | 114 | 458 | 24.89% |
| token_blacklist | 44 | 61 | 72.13% |
| subzone_configs | 42 | 2 | 2100% |
| kaiser_registry | 36 | 1 | 3600% |
| actuator_states | 31 | 2 | 1550% |

**Hohe Bloat-Prozente bei kleinen Tabellen** (subzone_configs, kaiser_registry, actuator_configs) — typisch fuer haeufig aktualisierte Tabellen mit wenigen Rows. Absolut unkritisch bei diesen Groessen. Auto-Vacuum wird das bereinigen.

### Empfehlung

1. **LOW:** 12 stehende Alarme pruefen (7 warning, 5 info) — moeglicherweise Altlasten
2. **LOW:** Sensor-Alert-Configs einrichten (0/3 konfiguriert)

---

## V-DB-05: Admin-Backup-UI — PARTIAL

### Frontend Admin-Routen (existieren)

| Route | View | Auth |
|-------|------|------|
| `/system-monitor` | SystemMonitorView | Admin |
| `/system-config` | SystemConfigView | Admin |
| `/users` | UserManagementView | Admin |
| `/calibration` | CalibrationView | Admin |
| `/load-test` | LoadTestView | Admin |
| `/plugins` | PluginsView | Admin |
| `/email` | EmailPostfachView | Admin |

### Backup/Diagnostics-spezifische UI

**API-Clients vorhanden:**
- `El Frontend/src/api/backups.ts` — Backup create, list, download, delete, restore, cleanup
- `El Frontend/src/api/diagnostics.ts` — Diagnostics run, history, export
- `El Frontend/src/api/database.ts` — DB-Explorer
- `El Frontend/src/api/health.ts` — Health-Status

**UI-Komponenten vorhanden:**
- `SystemMonitorView` mit 7+ Tabs inkl. `DiagnoseTab.vue`, `HealthTab.vue`, `DatabaseTab.vue`, `CleanupPanel.vue`
- Database-Explorer mit `DataTable.vue`, `SchemaInfoPanel.vue`, `TableSelector.vue`

**Kein dediziertes `/admin`-Prefix** — Admin-Funktionalitaet ist ueber einzelne Routen mit `requiresAdmin`-Meta verteilt.

### API-Endpoints (Server-seitig)

| Endpoint | Methode | Auth | Status |
|----------|---------|------|--------|
| `/api/v1/backups/database/create` | POST | Admin | Funktional (aber pg_dump scheitert) |
| `/api/v1/backups/database/list` | GET | Admin | Funktional (gibt leere Liste) |
| `/api/v1/backups/database/{id}/download` | GET | Admin | Nicht testbar (keine Backups) |
| `/api/v1/backups/database/{id}` | DELETE | Admin | Nicht testbar |
| `/api/v1/backups/database/{id}/restore` | POST | Admin | Nicht testbar |
| `/api/v1/backups/database/cleanup` | POST | Admin | Funktional |
| `/api/v1/diagnostics/run` | POST | Active | Funktional |
| `/api/v1/diagnostics/checks` | GET | Active | Funktional |
| `/api/v1/diagnostics/history` | GET | Active | Funktional |
| `/api/v1/diagnostics/export/{id}` | POST | Active | Funktional |

### Bewertung

- **Admin-UI existiert** — SystemMonitorView mit Diagnostics, Health, Database-Tabs
- **Backup-UI-Luecke:** API-Client und Endpoints vorhanden, aber ob die UI diese tatsaechlich nutzt (Backup-Status, Trigger-Button) konnte ohne Browser-Test nicht verifiziert werden
- **Kein `/admin`-Prefix** ist ein Design-Entscheid (Meta-basierte Routen-Guards), kein Bug
- **API-only fuer Scheduler-Jobs:** Kein UI-Element zum Anzeigen/Steuern von Cron-Jobs

### Empfehlung

1. **MEDIUM:** Browser-Test der SystemMonitorView auf Backup-Integration
2. **LOW:** Scheduler-Job-Uebersicht im Admin-Bereich (welche Jobs laufen, letzte Ausfuehrung)

---

## Kritische Findings — Zusammenfassung

### 1. CRITICAL: pg_dump Version-Mismatch (V-DB-01)

**Problem:** Server-Container hat pg_dump 15.16 (Debian Bookworm Default), PostgreSQL ist 16.13.
**Impact:** KEIN Backup moeglich. Taeglich um 02:00 scheitert der Backup-Job still.
**Fix:** Dockerfile anpassen:
```dockerfile
# STATT: postgresql-client (liefert v15 auf Bookworm)
# NEU: PostgreSQL 16 Client installieren
RUN echo "deb http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    apt-get update && apt-get install -y postgresql-client-16
```

### 2. CRITICAL: Dedup-Migration nicht angewandt (V-DB-02)

**Problem:** Alembic-Version ist `add_device_scope_and_context`, Migration `add_sensor_data_dedup` fehlt.
**Impact:** 993 Duplikat-Gruppen in sensor_data. Neue Duplikate werden weiterhin gespeichert.
**Fix:** `cd "El Servador/god_kaiser_server" && alembic upgrade head`

### 3. LOW: Kein Backup-Volume (V-DB-01)

**Problem:** Backup-Verzeichnis liegt im Container-Dateisystem, kein Docker-Volume gemountet.
**Impact:** Selbst nach pg_dump-Fix wuerden Backups bei `docker compose down` verloren gehen.
**Fix:** In `docker-compose.yml`:
```yaml
el-servador:
  volumes:
    - ./backups:/app/backups
```

---

## Production-Readiness Bewertung

| Bereich | Dev-Status | Production-Ready? |
|---------|------------|-------------------|
| Backup-Service | Code vorhanden, Runtime kaputt | NEIN — pg_dump Fix + Volume noetig |
| Sensor-Data-Retention | Korrekt disabled | JA — Aktivierung bei Bedarf |
| Heartbeat-Cleanup | Code vorhanden, Job nicht registriert | NEIN — Job registrieren |
| Diagnostics | Funktional (10 System-Checks) | JA |
| Admin-UI | Vorhanden (SystemMonitorView) | PARTIAL — Browser-Test noetig |
| Scheduler | APScheduler funktional | JA |
| Fehlerbehandlung | Logging OK, kein Retry/Alert | PARTIAL — Alerting empfohlen |

---

*Bericht erstellt: 2026-03-10 | Agent: T16-V3 Database Maintenance Verifikation*
