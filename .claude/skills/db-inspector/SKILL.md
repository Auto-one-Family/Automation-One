---
name: db-inspector
description: |
  Datenbank-Inspektion und Cleanup für AutomationOne PostgreSQL/SQLite.
  MUST BE USED when: checking device registration, sensor data, audit logs,
  verifying database state, debugging data persistence issues, finding orphaned records,
  cleaning up stale data, analyzing data volume, checking schema.
  NOT FOR: Server-Logs (server-debug), MQTT-Traffic (mqtt-debug), Code-Änderungen.
  Proactively inspect database when debugging data issues.
allowed-tools: Read, Bash, Grep, Glob
---

# DB Inspector - Skill Dokumentation

> **Architektur:** Server-Centric. PostgreSQL ist Single Source of Truth.
> **Fokus:** Schema-Inspektion, Migration-Status, Retention-Jobs, Backup/Restore

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Zugriff |
|-------------|----------------|---------|
| **Schema prüfen** | [Section 3: Schema-Übersicht](#3-schema-übersicht) | `make shell-db` |
| **Migration-Status** | [Section 4: Alembic Migrations](#4-alembic-migrations) | `alembic current` |
| **Cleanup-Status** | [Section 6: Retention & Cleanup](#6-retention--cleanup) | Health-Endpoint |
| **Index-Performance** | [Section 5: Indizes](#5-indizes-esp_heartbeat_logs) | `pg_stat_user_indexes` |
| **Backup erstellen** | [Section 7: Backup/Restore](#7-backuprestore) | `make db-backup` |
| **Restore durchführen** | [Section 7: Backup/Restore](#7-backuprestore) | `make db-restore` |
| **Circuit Breaker prüfen** | [Section 9: Circuit Breaker](#9-circuit-breaker-db-seitig) | `/v1/health/detailed` |

---

## 1. Rolle & Abgrenzung

### Mein Bereich

- PostgreSQL Schema-Inspektion
- Alembic Migration-Status und -History
- Index-Analyse und Performance
- Foreign Key & Cascade Überprüfung
- Retention/Cleanup-Job Monitoring
- Backup/Restore Operationen
- Datenbank-Konsistenz-Checks
- Orphaned Records finden und bereinigen

### NICHT mein Bereich (delegieren an)

| Situation | Delegieren an | Grund |
|-----------|---------------|-------|
| Server wirft DB-Fehler | `server-debug` | Server-Log Analyse |
| MQTT Messages fehlen | `mqtt-debug` | MQTT-Traffic Analyse |
| ESP sendet keine Daten | `esp32-debug` | Serial-Log Analyse |
| API-Endpoint Probleme | `server-debug` | Handler-Analyse |
| Schema-Änderung nötig | **Dev-Agent** | Code-Änderung |
| Alembic Migration erstellen | **Dev-Agent** | Code-Änderung |

---

## 2. Datenbank-Verbindung

### Docker-Container

| Parameter | Wert |
|-----------|------|
| Container | `automationone-postgres` |
| Image | `postgres:16-alpine` |
| User | `god_kaiser` |
| Password | `password` (dev) |
| Database | `god_kaiser_db` |
| Port | `5432` (intern + extern) |

### Zugriff

```bash
# Interaktive psql-Session
make shell-db

# Einzelner Befehl
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT 1;"

# Mit Ausgabe-Formatierung
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "\dt+" --pager=off
```

### Healthcheck

```bash
# Container Health
docker exec automationone-postgres pg_isready -U god_kaiser -d god_kaiser_db

# Aktive Connections
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = 'god_kaiser_db';"
```

---

## 3. Schema-Übersicht

### Haupttabellen

| Tabelle | Funktion | Wichtige Constraints |
|---------|----------|---------------------|
| `esp_devices` | Device Registry | status, zone_id, capabilities |
| `sensor_configs` | Sensor-Config pro GPIO | UNIQUE(esp_id, gpio, sensor_type, onewire_address, i2c_address) |
| `sensor_data` | Time-Series Messwerte | FK → sensor_configs |
| `actuator_configs` | Aktuator-Config + Safety | FK → esp_devices |
| `actuator_states` | Echtzeit-Zustand | FK → actuator_configs |
| `actuator_history` | Command History | FK → actuator_configs |
| `esp_heartbeat_logs` | Heartbeat Time-Series | 8 Indizes, 7-Tage Retention |
| `audit_logs` | Globales Event-Log | 5 Indizes |
| `user_accounts` | JWT Auth | token_version für Logout-All |
| `token_blacklist` | Revoked JWT Tokens | expires_at |
| `cross_esp_logic` | Logic Engine Rules | conditions (JSON), actions (JSON) |
| `subzone_configs` | Subzone-Definitionen | FK → zones |

### Sensor Unique Constraint

**Aktuell (Migration 950ad9ce87bb):**
```sql
UNIQUE(esp_id, gpio, sensor_type, onewire_address, i2c_address)
```

Ermöglicht:
- Mehrere DS18B20 auf gleichem OneWire-GPIO (via `onewire_address`)
- Mehrere I2C-Sensoren an verschiedenen Adressen (via `i2c_address`)
- Multi-Value-Sensoren wie SHT31 (Temp + Humidity auf gleichem GPIO)

### Foreign Key Cascades

| Tabelle | FK → | ON DELETE |
|---------|------|-----------|
| `sensor_configs` | `esp_devices` | CASCADE |
| `sensor_data` | `sensor_configs` | CASCADE |
| `actuator_configs` | `esp_devices` | CASCADE |
| `actuator_states` | `actuator_configs` | CASCADE |
| `actuator_history` | `actuator_configs` | CASCADE |
| `esp_heartbeat_logs` | `esp_devices` | CASCADE |

**WICHTIG:** ESP gelöscht = ALLE zugehörigen Daten gelöscht!

---

## 4. Alembic Migrations

### Aktueller HEAD

```
950ad9ce87bb (HEAD - 19 Migrations total)
```

### Migration-History (letzte 6)

| Revision | Datum | Beschreibung |
|----------|-------|-------------|
| `950ad9ce87bb` | 2026-02-04 | UNIQUE erweitert um i2c_address |
| `24e8638e14a5` | 2026-01-27 | request_id zu audit_log |
| `245078bda463` | 2026-01-27 | Merge heads |
| `add_token_version_to_user` | 2025-12-11 | user_accounts.token_version |
| `fix_onewire_constraint` | 2026-01-27 | UNIQUE + onewire_address |
| `add_discovery_approval_fields` | 2026-01-27 | Discovery/Approval Felder |
| `add_esp_heartbeat_logs` | 2026-01-24 | esp_heartbeat_logs Tabelle |

### Make-Targets

```bash
# Migrationen anwenden
make db-migrate       # alembic upgrade head

# Letzte Migration rückgängig
make db-rollback      # alembic downgrade -1
```

**Hinweis:** `make db-status` Target existiert nicht. Status im Container prüfen:

### Prüf-Befehle (im Container)

```bash
# Aktueller Migration-Status
docker exec automationone-server python -m alembic current

# Migration-History
docker exec automationone-server python -m alembic history

# Pending Migrations
docker exec automationone-server python -m alembic heads
```

---

## 5. Indizes (esp_heartbeat_logs)

### 8 Indizes für Time-Series Performance

| Index | Spalten | Typ | Zweck |
|-------|---------|-----|-------|
| `ix_esp_heartbeat_logs_esp_id` | esp_id | Single | ESP-Filter |
| `ix_esp_heartbeat_logs_device_id` | device_id | Single | Device-Filter |
| `ix_esp_heartbeat_logs_timestamp` | timestamp | Single | Zeit-Filter |
| `ix_esp_heartbeat_logs_data_source` | data_source | Single | Mock vs Prod |
| `idx_heartbeat_esp_timestamp` | esp_id, timestamp | Composite | ESP + Zeitraum |
| `idx_heartbeat_device_timestamp` | device_id, timestamp | Composite | Device + Zeitraum |
| `idx_heartbeat_data_source_timestamp` | data_source, timestamp | Composite | Source + Zeitraum |
| `idx_heartbeat_health_status` | health_status, timestamp | Composite | Status + Zeitraum |

### Index-Nutzung prüfen

```sql
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

---

## 6. Retention & Cleanup

### Cleanup-Jobs (MaintenanceService)

| Job | Schedule | Config-Key | Default |
|-----|----------|------------|---------|
| `cleanup_sensor_data` | Daily 03:00 | `SENSOR_DATA_RETENTION_ENABLED` | disabled |
| `cleanup_command_history` | Daily 03:30 | `COMMAND_HISTORY_RETENTION_ENABLED` | disabled |
| `cleanup_orphaned_mocks` | Hourly | `ORPHANED_MOCK_CLEANUP_ENABLED` | disabled |

### HeartbeatLogCleanup (cleanup.py:525-702)

**⚠️ HINWEIS:** Die `HeartbeatLogCleanup`-Klasse existiert in cleanup.py, ist aber **NICHT** als Job im MaintenanceService registriert! Bei Bedarf muss diese manuell oder per Dev-Agent hinzugefügt werden.

| Parameter | Wert | Config-Key |
|-----------|------|------------|
| Retention | 7 Tage | `HEARTBEAT_LOG_RETENTION_DAYS` |
| Dry-Run | **TRUE** (default!) | `HEARTBEAT_LOG_CLEANUP_DRY_RUN` |
| Batch-Size | konfigurierbar | `HEARTBEAT_LOG_CLEANUP_BATCH_SIZE` |

**WICHTIG:** `dry_run = TRUE` by default → Cleanup läuft, löscht aber NICHTS bis explizit auf FALSE gesetzt!

### Diagnose-Queries

```sql
-- Heartbeat-Logs: Wie viele Records älter als 7 Tage?
SELECT COUNT(*) FROM esp_heartbeat_logs
WHERE timestamp < NOW() - INTERVAL '7 days';

-- Heartbeat-Logs: Tabellengröße
SELECT pg_size_pretty(pg_total_relation_size('esp_heartbeat_logs'));

-- Sensor-Data: Volumen pro Tag
SELECT DATE(timestamp), COUNT(*)
FROM sensor_data
GROUP BY DATE(timestamp)
ORDER BY DATE(timestamp) DESC
LIMIT 7;
```

### Cleanup manuell triggern

```bash
# Via REST API (Admin-Auth erforderlich)
curl -X POST http://localhost:8000/api/v1/debug/maintenance/run-cleanup \
  -H "Authorization: Bearer <token>"
```

---

## 7. Backup/Restore

### Backup (scripts/docker/backup.sh)

| Aspekt | Beschreibung |
|--------|-------------|
| Was | Schema + Daten (vollständiger pg_dump) |
| Format | GZ-komprimiert |
| Ziel | `./backups/automationone_YYYYMMDD_HHMMSS.sql.gz` |
| Retention | Letzte 7 Backups behalten |

```bash
# Backup erstellen
make db-backup

# Manuell
./scripts/docker/backup.sh
```

### Restore (scripts/docker/restore.sh)

| Aspekt | Beschreibung |
|--------|-------------|
| Input | `FILE=path` oder `FILE=latest` |
| Safety | Interaktive Bestätigung |

**Ablauf:**
1. Server stoppen
2. `DROP DATABASE`
3. `CREATE DATABASE`
4. `gunzip | psql`
5. Server starten

```bash
# Restore von spezifischem Backup
make db-restore FILE=backups/automationone_20260204_120000.sql.gz

# Restore vom letzten Backup
make db-restore FILE=latest
```

**ACHTUNG:** Restore = DESTRUKTIV. Immer vorher Backup machen!

---

## 8. Diagnose-Queries

### System-Status

```sql
-- Alle Tabellen mit Größe
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::text) DESC;

-- Gesamte Datenbank-Größe
SELECT pg_size_pretty(pg_database_size('god_kaiser_db'));
```

### ESP-Devices

```sql
-- ESP-Übersicht nach Status
SELECT status, COUNT(*) FROM esp_devices GROUP BY status;

-- Mocks vs. Real Devices
SELECT
  SUM(CASE WHEN device_id LIKE 'MOCK_%' THEN 1 ELSE 0 END) as mocks,
  SUM(CASE WHEN device_id NOT LIKE 'MOCK_%' THEN 1 ELSE 0 END) as real
FROM esp_devices;

-- Offline ESPs (>7 Tage)
SELECT device_id, name, last_seen
FROM esp_devices
WHERE last_seen < NOW() - INTERVAL '7 days'
AND device_id NOT LIKE 'MOCK_%';
```

### Sensor-Configs

```sql
-- Sensor-Configs pro ESP
SELECT esp_id, COUNT(*) FROM sensor_configs GROUP BY esp_id;

-- Sensoren nach Typ
SELECT sensor_type, COUNT(*) FROM sensor_configs GROUP BY sensor_type ORDER BY COUNT(*) DESC;

-- Multi-Value Sensoren (I2C/OneWire)
SELECT * FROM sensor_configs
WHERE onewire_address IS NOT NULL OR i2c_address IS NOT NULL;
```

### Heartbeat-Logs

```sql
-- Heartbeat-Logs Volumen (letzte 24h)
SELECT COUNT(*) FROM esp_heartbeat_logs
WHERE timestamp > NOW() - INTERVAL '24 hours';

-- Pro Device (letzte 24h)
SELECT device_id, COUNT(*)
FROM esp_heartbeat_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY device_id;

-- Health-Status Verteilung
SELECT health_status, COUNT(*)
FROM esp_heartbeat_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY health_status;
```

### Orphaned Records

```sql
-- Orphaned Sensor-Configs (kein zugehöriges ESP)
SELECT sc.id, sc.gpio, sc.sensor_type
FROM sensor_configs sc
LEFT JOIN esp_devices ed ON sc.esp_id = ed.id
WHERE ed.id IS NULL;

-- Orphaned Actuator-Configs
SELECT ac.id, ac.gpio, ac.actuator_type
FROM actuator_configs ac
LEFT JOIN esp_devices ed ON ac.esp_id = ed.id
WHERE ed.id IS NULL;

-- Orphaned Mocks (>24h ohne Aktivität)
SELECT device_id, name, last_seen
FROM esp_devices
WHERE device_id LIKE 'MOCK_%'
AND last_seen < NOW() - INTERVAL '24 hours';
```

### Aktive Connections

```sql
-- Aktive Connections mit Details
SELECT pid, usename, application_name, state, query_start
FROM pg_stat_activity
WHERE datname = 'god_kaiser_db';
```

---

## 9. Circuit Breaker (DB-seitig)

Der Server hat einen Circuit Breaker für DB-Connections (session.py:185-218).

### Konfiguration

| Parameter | Wert | Config-Key |
|-----------|------|------------|
| Threshold | 5 failures | `CIRCUIT_BREAKER_DB_FAILURE_THRESHOLD` |
| Recovery Timeout | 30s OPEN | `CIRCUIT_BREAKER_DB_RECOVERY_TIMEOUT` |
| Half-Open Timeout | 10s HALF_OPEN | `CIRCUIT_BREAKER_DB_HALF_OPEN_TIMEOUT` |

### States

| State | Bedeutung |
|-------|-----------|
| CLOSED | Normal - Requests gehen durch |
| OPEN | Blocked - Error 5402 für alle DB-Requests |
| HALF_OPEN | Test - Ein Request erlaubt, bei Success → CLOSED |

### Diagnose

```bash
# Health-Endpoint zeigt DB + Circuit Breaker Status
curl http://localhost:8000/api/v1/health/detailed
```

**Error-Code:** `5402` (CIRCUIT_BREAKER_OPEN) → Alle DB-Operationen blockiert

---

## 10. Workflow

### Bei Analyse-Anfragen

```
1. VERBINDUNG PRÜFEN → make shell-db oder docker healthcheck
2. MIGRATION-STATUS  → alembic current
3. QUERIES AUSFÜHREN → Diagnose-Queries aus Section 8
4. ERGEBNIS FORMAT   → Tabellen, Empfehlungen
```

### Bei Cleanup-Anfragen

```
1. ZEIGEN WAS GELÖSCHT WIRD → SELECT vor DELETE
2. BESTÄTIGUNG EINHOLEN    → User muss bestätigen
3. KASKADEN BEACHTEN       → FK-Reihenfolge
4. DOKUMENTIEREN           → Was wurde gelöscht
```

### Cleanup-Reihenfolge (ESP löschen)

```
1. sensor_data
2. sensor_configs
3. actuator_history
4. actuator_states
5. actuator_configs
6. esp_heartbeat_logs
7. esp_devices
```

**ODER:** Einfach ESP löschen → CASCADE erledigt den Rest!

---

## 11. Kritische Regeln

### NIEMALS

- DELETE ohne Bestätigung
- Schema-Struktur ändern (das ist Dev-Agent Aufgabe)
- Migrations erstellen/ändern
- Produktionsdaten ohne Backup löschen

### IMMER

- SELECT vor DELETE zeigen
- Backup vor Restore prüfen
- Kaskaden bei Löschungen beachten
- Dry-Run Status bei Cleanup prüfen

---

*Kompakter Skill für DB-Inspektion. Details in SYSTEM_OPERATIONS_REFERENCE.md*
