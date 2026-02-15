# Report: Service-Konfigurationen Fixes (infra-part2)
# ===================================================
# Datum: 2026-02-10
# Agent: /do (via system-control)
# Auftrag: .technical-manager/commands/pending/infra-part2-service-configs.md

---

## Status: ABGESCHLOSSEN

Beide Service-Konfigurationen wurden plangemäß angepasst.

---

## Datei 1: docker/postgres/postgresql.conf

### Problem
`log_filename = 'postgresql.log'` ist ein fixer Name. PostgreSQL appendet immer in
dieselbe Datei. `log_rotation_age` und `log_rotation_size` greifen NICHT ohne
Timestamp-Pattern im Dateinamen. Ergebnis: 98MB Einzeldatei, unbegrenzt wachsend.

### Änderungen

| Parameter | Vorher | Nachher |
|-----------|--------|---------|
| `log_filename` | `'postgresql.log'` | `'postgresql-%Y-%m-%d.log'` |
| `log_truncate_on_rotation` | `off` | `on` |
| `log_rotation_age` | `1d` | `1d` (unverändert) |
| `log_rotation_size` | `50MB` | `50MB` (unverändert) |

Kommentar-Block über ROTATION wurde aktualisiert mit klarer Beschreibung:
- Täglich neue Log-Datei
- Zusätzliche Rotation bei 50MB innerhalb eines Tages
- Hinweis dass alte Dateien NICHT automatisch gelöscht werden

### Vollständige Datei nach Änderung

```ini
# PostgreSQL Custom Configuration for AutomationOne
# ================================================
# Mounted as /etc/postgresql/postgresql.conf in container

# ========== CONNECTION ==========
listen_addresses = '*'

# ========== LOGGING ==========
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d.log'
log_file_mode = 0644

# ========== WHAT TO LOG ==========
# 'mod' = INSERT/UPDATE/DELETE/DDL only (not every SELECT)
log_statement = 'mod'
# Log SELECT statements that take >100ms (slow query detection)
log_min_duration_statement = 100
log_duration = off
log_connections = on
log_disconnections = on
log_lock_waits = on

# ========== FORMAT ==========
log_line_prefix = '%t [%p] %u@%d '
log_timezone = 'UTC'

# ========== ROTATION ==========
# Täglich neue Log-Datei (postgresql-YYYY-MM-DD.log)
# Zusätzliche Rotation bei 50MB innerhalb eines Tages
# Alte Dateien werden NICHT automatisch gelöscht – Cleanup via Docker-Volume oder Cron
log_rotation_age = 1d
log_rotation_size = 50MB
log_truncate_on_rotation = on
```

---

## Datei 2: docker/mosquitto/mosquitto.conf

### Problem
Mosquitto loggte in Datei UND stdout gleichzeitig:
- Bind-Mount-Datei (`logs/mqtt/mosquitto.log`) – 1MB, wachsend ohne Rotation
- Docker stdout → json-file Driver → Promtail → Loki
- Doppelte Speicherung desselben Inhalts (~240MB+ Redundanz-Potential)

Mosquitto hat KEINE eingebaute Log-Rotation. Die Datei wächst unbegrenzt (~1.3MB/Tag).

### Änderungen

| Parameter | Vorher | Nachher |
|-----------|--------|---------|
| `log_dest file ...` | aktiv | auskommentiert |
| `log_dest stdout` | aktiv | aktiv (unverändert) |
| Log-Types | alle 6 Types | alle 6 Types (unverändert) |
| Alle anderen Sections | - | unverändert |

Kommentar-Block über Logging wurde aktualisiert:
- Primärer Weg: stdout → Docker json-file → Promtail → Loki
- Hinweis auf Docker json-file Rotation (max-size: 10m, max-file: 3)
- Anleitung für temporäres File-Logging

### Vollständige Logging-Section nach Änderung

```ini
# ============================================
# Logging
# ============================================
# Primärer Log-Weg: stdout → Docker json-file → Promtail → Loki
# Docker json-file rotiert automatisch (max-size: 10m, max-file: 3)
# Für temporäres File-Logging: log_dest file /mosquitto/log/mosquitto.log aktivieren
log_dest stdout
# log_dest file /mosquitto/log/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information
log_type subscribe
log_type unsubscribe
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
```

---

## Verifizierung

Noch NICHT durchgeführt (Docker-Stack nicht gestartet). Befehle für Robin:

```bash
# PostgreSQL Log-Rotation
docker compose restart postgres
sleep 5
docker exec automationone-postgres ls -la /var/log/postgresql/
# Erwartung: postgresql-2026-02-10.log (oder aktuelles Datum), NICHT postgresql.log

# Mosquitto stdout-only
docker compose restart mqtt-broker
docker logs --tail 5 automationone-mqtt
# Erwartung: Log-Output sichtbar
ls -la logs/mqtt/
# Erwartung: Keine NEUE mosquitto.log (alte kann noch existieren)
```

---

## Nicht geändert (bewusst)

- Bestehende 98MB `postgresql.log` in Bind-Mounts → manuelles Löschen durch Robin
- Bestehende 1MB `mosquitto.log` in `logs/mqtt/` → manuelles Löschen durch Robin
- PostgreSQL Performance-Tuning (shared_buffers, work_mem) → separater Auftrag
- Mosquitto Auth/ACL/TLS → bleibt Development-Konfiguration
- Bind-Mount `./logs/mqtt:/mosquitto/log` in docker-compose.yml → beibehalten

## Geänderte Dateien

| Datei | Änderung | Zeilen |
|-------|----------|--------|
| `docker/postgres/postgresql.conf` | log_filename Timestamp-Pattern, log_truncate_on_rotation on, Kommentare | ~6 Zeilen |
| `docker/mosquitto/mosquitto.conf` | log_dest file auskommentiert, Kommentar-Block aktualisiert | ~5 Zeilen |
