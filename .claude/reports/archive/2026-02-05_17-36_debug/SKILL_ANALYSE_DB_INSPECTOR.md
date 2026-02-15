# Skill-Analyse: db-inspector

**Datum:** 2026-02-05 21:00 UTC
**Skill:** `db-inspector`
**Fragen:** 8-10
**Status:** VOLLSTÄNDIG

---

## 8. Datenbankschema - Letzte 5 Migrations

**Verzeichnis:** `El Servador/god_kaiser_server/alembic/versions/`

| # | Datei | Revision | Datum | Beschreibung |
|---|-------|----------|-------|--------------|
| 1 | `950ad9ce87bb_add_i2c_address_to_sensor_unique_.py` | 950ad9ce87bb | 2026-02-04 04:05 | UNIQUE erweitert: `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` |
| 2 | `add_token_version_to_user.py` | add_token_version | 2026-02-04 00:36 | `user_accounts.token_version` Column für Logout-All |
| 3 | `fix_sensor_unique_constraint_onewire.py` | fix_onewire | 2026-01-27 15:27 | UNIQUE: `(esp_id, gpio, sensor_type, onewire_address)` |
| 4 | `add_discovery_approval_fields.py` | add_discovery | 2026-01-27 11:01 | 5 Columns auf `esp_devices`: discovered_at, approved_at, etc. |
| 5 | `add_esp_heartbeat_logs.py` | add_heartbeat | 2026-01-24 19:59 | Neue Tabelle `esp_heartbeat_logs` mit 8 Indizes |

### Migration Details

#### Migration 1: I2C Address Support (950ad9ce87bb)
```python
# Erweitert UNIQUE Constraint für Multiple I2C Sensoren auf gleichem Bus
# Vorher: (esp_id, gpio, sensor_type, onewire_address)
# Nachher: (esp_id, gpio, sensor_type, onewire_address, i2c_address)
```

#### Migration 2: Token Version (add_token_version)
```python
# Fügt Column für Logout-All-Devices Feature hinzu
sa.Column('token_version', sa.Integer(), nullable=False, server_default='0')
```

#### Migration 3: OneWire Constraint Fix (fix_onewire)
```python
# Ermöglicht mehrere DS18B20 Sensoren auf gleichem GPIO
# Unterscheidung via OneWire ROM Address
```

#### Migration 4: Discovery Approval (add_discovery)
```python
# 5 neue Columns auf esp_devices:
# - discovered_at (TIMESTAMP)
# - approved_at (TIMESTAMP)
# - approved_by (FK -> user_accounts)
# - rejection_reason (VARCHAR)
# - last_rejection_at (TIMESTAMP)
```

#### Migration 5: Heartbeat Logs (add_heartbeat)
```python
# Neue Time-Series Tabelle für ESP32 Heartbeat-Daten
# - id, esp_id, device_id, timestamp
# - heap_free, heap_min, uptime_ms
# - wifi_rssi, mqtt_connected
# - sensor_count, actuator_count
# - health_status, data_source
```

---

## Indizes

### esp_heartbeat_logs Indizes

**Datei:** `add_esp_heartbeat_logs.py:53-79`

| Index-Name | Spalten | Typ | Zweck |
|------------|---------|-----|-------|
| `ix_esp_heartbeat_logs_esp_id` | `esp_id` | Single | Device-Lookups |
| `ix_esp_heartbeat_logs_device_id` | `device_id` | Single | Device-ID-Filter |
| `ix_esp_heartbeat_logs_timestamp` | `timestamp` | Single | Time-Series Queries |
| `ix_esp_heartbeat_logs_data_source` | `data_source` | Single | Production vs Mock |
| `idx_heartbeat_esp_timestamp` | `esp_id, timestamp` | **COMPOSITE** | ESP + Zeit |
| `idx_heartbeat_device_timestamp` | `device_id, timestamp` | **COMPOSITE** | Device + Zeit |
| `idx_heartbeat_data_source_timestamp` | `data_source, timestamp` | **COMPOSITE** | Source + Zeit |
| `idx_heartbeat_health_status` | `health_status, timestamp` | **COMPOSITE** | Health-Filter |

### Query-Optimierung

| Query-Pattern | Empfohlener Index |
|---------------|-------------------|
| `WHERE esp_id = X ORDER BY timestamp` | `idx_heartbeat_esp_timestamp` |
| `WHERE device_id = X ORDER BY timestamp` | `idx_heartbeat_device_timestamp` |
| `WHERE data_source = 'production' AND timestamp > X` | `idx_heartbeat_data_source_timestamp` |
| `WHERE health_status = 'critical' ORDER BY timestamp` | `idx_heartbeat_health_status` |

---

## Foreign Keys mit Cascades

**Datei:** `add_esp_heartbeat_logs.py:49-50`

```python
sa.ForeignKeyConstraint(['esp_id'], ['esp_devices.id'], ondelete='CASCADE'),
```

### Cascade-Effekte

| Parent Table | Child Table | ON DELETE |
|--------------|-------------|-----------|
| `esp_devices` | `esp_heartbeat_logs` | **CASCADE** |
| `esp_devices` | `sensors` | CASCADE |
| `esp_devices` | `actuators` | CASCADE |
| `user_accounts` | `esp_devices.approved_by` | SET NULL |

**Wichtig:** ESP-Device löschen → ALLE zugehörigen Heartbeat-Logs werden gelöscht!

---

## 9. Retention und Cleanup

### Implementierung

**Datei:** `El Servador/god_kaiser_server/src/services/maintenance/jobs/cleanup.py:525-702`

**Klasse:** `HeartbeatLogCleanup`

| Parameter | Default | Beschreibung |
|-----------|---------|--------------|
| `heartbeat_log_retention_enabled` | **TRUE** | Cleanup aktiviert |
| `heartbeat_log_retention_days` | **7 days** | Retention-Zeit |
| `heartbeat_log_cleanup_dry_run` | **TRUE** | Dry-Run default ON |
| `heartbeat_log_cleanup_batch_size` | konfigurierbar | Records pro Batch |
| `heartbeat_log_cleanup_max_batches` | konfigurierbar | Max Batches pro Run |

### Cleanup-Logic (DELETE-basiert)

**Zeile 580-702:**
```python
# Cutoff-Berechnung
cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)

# Phase 1: Count
records_to_delete = SELECT COUNT(*) FROM esp_heartbeat_logs
                    WHERE timestamp < cutoff_date

# Phase 2: Check Dry-Run
if dry_run:
    return {"status": "dry_run", "records_found": records_to_delete}

# Phase 3: Batch DELETE
while batches_processed < max_batches:
    batch_ids = SELECT id FROM esp_heartbeat_logs
                WHERE timestamp < cutoff_date LIMIT batch_size

    DELETE FROM esp_heartbeat_logs WHERE id IN (batch_ids)
    await session.commit()  # Per-Batch Commit für Rollback-Sicherheit
```

### Scheduler-Aufruf

**Datei:** `El Servador/god_kaiser_server/src/services/maintenance/service.py:76-100`

| Aspekt | Wert |
|--------|------|
| Job-ID | `cleanup_heartbeat_logs` |
| Zeitplan | **Täglich 04:00 UTC** |
| Category | MAINTENANCE |

### Cleanup-Flow

```
04:00 UTC täglich:
  1. Job startet
  2. Berechne cutoff_date (now - 7 days)
  3. Zähle Records älter als cutoff
  4. Wenn dry_run=True: Log count, exit
  5. Wenn dry_run=False:
     a. Hole batch_size IDs
     b. DELETE WHERE id IN (batch_ids)
     c. COMMIT
     d. Wiederhole bis max_batches erreicht
  6. Log Ergebnis
```

### Wichtige Hinweise

| Aspekt | Detail |
|--------|--------|
| **Kein Partitioning** | DELETE-basiert (einfacher, aber langsamer) |
| **Dry-Run Default** | Sicherheit - erst aktivieren nach Verifizierung |
| **Batch-Commits** | Verhindert lange Locks |
| **Retention** | 7 Tage Standard - konfigurierbar |

---

## 10. Backup/Restore Detail

### Backup-Script

**Datei:** `scripts/docker/backup.sh`

| Aspekt | Zeile | Detail |
|--------|-------|--------|
| Was wird gesichert | 10 | **Schema + Daten** (vollständiger pg_dump) |
| Kompression | 10 | GZ-komprimiert |
| Naming | 4-5 | `automationone_YYYYMMDD_HHMMSS.sql.gz` |
| Zielverzeichnis | 5,7 | `./backups/` |
| Retention | 14-15 | **Letzte 7 Backups** behalten |

**Code (Zeile 9-10):**
```bash
docker exec automationone-postgres pg_dump -U god_kaiser -d god_kaiser_db | gzip > "${BACKUP_FILE}"
```

### Backup-Naming

```
./backups/
├── automationone_20260205_040000.sql.gz  (heute)
├── automationone_20260204_040000.sql.gz
├── automationone_20260203_040000.sql.gz
├── automationone_20260202_040000.sql.gz
├── automationone_20260201_040000.sql.gz
├── automationone_20260131_040000.sql.gz
└── automationone_20260130_040000.sql.gz  (ältestes)
```

### Restore-Script

**Datei:** `scripts/docker/restore.sh`

| Aspekt | Zeile | Detail |
|--------|-------|--------|
| Eingabe | 4-11 | `FILE=path` oder `FILE=latest` |
| Safety-Check | 13-16 | **Interaktive Bestätigung** |
| Datenbank-Reset | 18-20 | Stop Server → DROP DB → CREATE DB |
| Restore | 21 | `gunzip -c \| psql` |
| Server-Neustart | 22 | `docker start` |

### Restore-Flow

```bash
# Step 1: Stop server (verhindert Locks)
docker stop automationone-server 2>/dev/null || true

# Step 2: Drop alte DB
docker exec automationone-postgres psql -U god_kaiser -d postgres \
  -c "DROP DATABASE IF EXISTS god_kaiser_db;"

# Step 3: Create neue DB
docker exec automationone-postgres psql -U god_kaiser -d postgres \
  -c "CREATE DATABASE god_kaiser_db OWNER god_kaiser;"

# Step 4: Restore aus Backup
gunzip -c "$FILE" | docker exec -i automationone-postgres \
  psql -U god_kaiser -d god_kaiser_db

# Step 5: Start server
docker start automationone-server
```

### Restore-Optionen

| Option | Befehl | Beschreibung |
|--------|--------|--------------|
| Spezifisches Backup | `make db-restore FILE=./backups/automationone_20260205_040000.sql.gz` | Bestimmtes Backup |
| Neuestes Backup | `make db-restore FILE=latest` | Automatisch neuestes |

---

## Kritische Dateien für db-inspector

| Datei | Zweck |
|-------|-------|
| `El Servador/god_kaiser_server/alembic/versions/` | Alle Migrations |
| `El Servador/god_kaiser_server/src/db/models/` | SQLAlchemy Models |
| `El Servador/god_kaiser_server/src/services/maintenance/jobs/cleanup.py` | Cleanup-Jobs |
| `El Servador/god_kaiser_server/src/services/maintenance/service.py` | Scheduler |
| `scripts/docker/backup.sh` | Backup Script |
| `scripts/docker/restore.sh` | Restore Script |

---

## Findings für Skill-Erstellung

### Wichtige SQL-Queries für db-inspector

```sql
-- Heartbeat-Logs pro ESP (letzte 24h)
SELECT esp_id, COUNT(*) as count, MAX(timestamp) as last_seen
FROM esp_heartbeat_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY esp_id;

-- Älteste Heartbeat-Logs
SELECT MIN(timestamp) as oldest, COUNT(*) as total
FROM esp_heartbeat_logs;

-- Cleanup-Preview (Dry-Run)
SELECT COUNT(*) as to_delete
FROM esp_heartbeat_logs
WHERE timestamp < NOW() - INTERVAL '7 days';

-- Index-Nutzung prüfen
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Empfehlungen

| Bereich | Empfehlung |
|---------|------------|
| **Retention** | 7 Tage ist gut für Debugging, anpassbar |
| **Backup** | Täglich automatisieren (cron) |
| **Restore-Test** | Regelmäßig auf Test-System verifizieren |
| **Index-Monitoring** | `pg_stat_user_indexes` prüfen |
