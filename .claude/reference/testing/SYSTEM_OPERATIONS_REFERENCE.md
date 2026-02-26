# SYSTEM_OPERATIONS_REFERENCE.md

> **Version:** 2.14 | **Erstellt:** 2026-02-02 | **Aktualisiert:** 2026-02-26
> **Zweck:** Vollständige Befehls-Referenz für Debug-Operations-Agent
> **Änderungen 2.13:** Auth-Token-Pfad korrigiert (response.tokens.access_token statt response.access_token)
> **Änderungen 2.12:** E2E Sensor-Test-Script (scripts/test_e2e_sensor_publish.py), ENVIRONMENT Bugfix (test→testing in CI/Test Compose)
> **Änderungen 2.11:** Wokwi: make wokwi-test-all (173), make wokwi-test-error-injection (10), wokwi-seed fix (lokal statt docker exec)
> **Änderungen 2.10:** Serena MCP-Server Pfade in §9, .mcp.json Pfad ergänzt
> **Änderungen 2.9:** Health-Response korrigiert (Code-Abgleich), Provisioning Portal für Real-Hardware (§6.1), `tasklist` → Docker-Alternative, sqlite3 → PostgreSQL in §6.2/6.3, PlatformIO Git-Bash-Hinweis, Auth-Header ergänzt
> **Änderungen 2.8:** Frontend-Container-Logs als Quelle ergänzt (Loki/docker compose logs, §9 + Log-Verzeichnisse)
> **Änderungen 2.7:** Playwright E2E-Pfade und -Befehle; Playwright MCP für Agenten (Browser-Inspection) in §9.1
> **Änderungen 2.6:** Loki-Queries auf compose_service umgestellt (ROADMAP §1.1); MQTT-Logs ohne Bind-Mount dokumentiert
> **Änderungen 2.5:** Admin-Credentials ergänzt, Wokwi-Seed lokal (nicht im Container), PowerShell Test-Befehle, Wokwi Windows-Voraussetzungen
> **Änderungen 2.4:** Native Tests vollständig: 22 Tests (12 TopicBuilder + 10 GPIOManager), Toolchain-Fix (set_native_toolchain.py), korrigierte Pfade
> **Änderungen 2.3:** Native Test-Commands (pio test -e native/esp32dev_test), wokwi-test-full Count korrigiert (22 Szenarien)
> **Änderungen 2.2:** Wokwi-Testing Makefile-Targets (8 neue Targets für ESP32-Simulation)
> **Änderungen 2.5:** Promtail → Grafana Alloy Migration (EOL 2026-03-02). Service alloy:12345
> **Änderungen 2.1:** Monitoring-Stack (Loki, Alloy, Prometheus, Grafana), Monitoring-Configs in Pfade
> **Änderungen 2.0:** Docker-Flow als primärer Workflow, .env-Auslagerung, session.sh v4.0

---

## 0. Schnellstart & Authentifizierung

### 0.1 Test-Credentials

| Username | Password | Rolle | Verwendung |
|----------|----------|-------|------------|
| admin | Admin123# | Admin | Production, Development & Testing |

### 0.2 Login (Bash)

```bash
# Login und Token holen
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "Admin123#"}'

# Token aus Response extrahieren (verschachtelt unter "tokens"):
TOKEN="<response.tokens.access_token>"

# Authentifizierte Requests:
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/...
```

### 0.3 Login (PowerShell)

```powershell
# Variante 1: JSON-Escaping
curl -X POST http://localhost:8000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\": \"admin\", \"password\": \"Admin123#\"}'

# Variante 2: Here-String (empfohlen)
$body = @{username="admin"; password="Admin123#"} | ConvertTo-Json
curl -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d $body

# Token speichern
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" `
  -Method POST -ContentType "application/json" -Body $body
$TOKEN = $response.tokens.access_token
```

### 0.4 Windows-Umgebung

```powershell
# MQTT Tools Pfade (müssen im PATH sein oder vollständig angeben):
# C:\Program Files\mosquitto\mosquitto_sub.exe
# C:\Program Files\mosquitto\mosquitto_pub.exe

# Beispiel mit vollständigem Pfad:
& "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/#" -v -C 10 -W 30
```

---

## 0.5 Docker-Workflow (PRIMÄR)

> **Empfohlen:** Docker-Stack ist der primäre Workflow für Entwicklung und Debugging.

### Stack starten/stoppen

```bash
# Stack starten (alle Services)
docker compose up -d

# Stack stoppen
docker compose down

# Stack stoppen und Volumes löschen
docker compose down -v

# Einzelnen Service neu starten
docker compose restart el-servador
docker compose restart mqtt-broker

# Logs aller Services
docker compose logs -f

# Logs eines Services
docker compose logs -f el-servador
docker compose logs -f mqtt-broker
docker compose logs -f postgres
docker compose logs -f el-frontend
```

### Health-Checks

```bash
# Status aller Container
docker compose ps

# Health eines Services
docker compose ps el-servador --format json

# Container-Ressourcen
docker stats --no-stream
```

### Debug-Session starten

```bash
# Session-Script (v4.0) - nutzt Docker-Stack
./scripts/debug/start_session.sh [session-name] [--with-server] [--mode MODE]

# Beispiele:
./scripts/debug/start_session.sh boot-test
./scripts/debug/start_session.sh sensor-test --mode sensor
./scripts/debug/start_session.sh e2e-test --mode e2e --with-server
```

**Session-Script Features (v4.0):**
- Docker-Stack Health-Check statt lokaler Services
- MQTT-Capture mit Timestamps via Docker exec
- Log-Archivierung nach `logs/archive/`
- Erweiterte STATUS.md mit Docker-Container-Details

### Log-Verzeichnisse

| Verzeichnis | Inhalt |
|-------------|--------|
| `logs/server/` | Server JSON-Logs (Bind-Mount) |
| `logs/mqtt/` | Deaktiviert (Mosquitto stdout-only); Broker-Logs via Loki `compose_service=mqtt-broker` |
| (kein Bind-Mount) postgres | PostgreSQL stderr → Docker → Alloy → Loki `compose_service=postgres` (level, query_duration_ms) |
| `logs/esp32/` | ESP32 Serial-Logs (manuell via PlatformIO) |
| `logs/current/` | Session-Logs (via start_session.sh) |
| `logs/archive/` | Archivierte Session-Logs |
| (stdout only) el-frontend | Vue/Vite → Loki `compose_service=el-frontend`; `docker compose logs el-frontend` |
| Docker: `esp32-serial-logger` | ESP32 Serial via TCP-Bridge (stdout only, Profile: hardware) |

### .env Konfiguration

**Datei:** `.env` (Projektroot)

```bash
# PostgreSQL
POSTGRES_USER=god_kaiser
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=god_kaiser_db

# JWT
JWT_SECRET_KEY=your_secure_jwt_secret

# Optional: MQTT Auth
MQTT_USERNAME=
MQTT_PASSWORD=
```

> **WICHTIG:** Alle Secrets aus `docker-compose.yml` ausgelagert in `.env`

---

## 1. Datenbank

### 1.1 Zugang

| Eigenschaft | Wert |
|-------------|------|
| **Typ (Development)** | SQLite |
| **Typ (Production)** | PostgreSQL |
| **Pfad (SQLite)** | `El Servador/god_kaiser_server/god_kaiser_dev.db` |
| **PostgreSQL URL** | `postgresql+asyncpg://god_kaiser:password@localhost:5432/god_kaiser_db` |

#### Direkt-Zugang (SQLite CLI)

```bash
# SQLite öffnen
sqlite3 "El Servador/god_kaiser_server/god_kaiser_dev.db"

# Mit Read-Only
sqlite3 -readonly "El Servador/god_kaiser_server/god_kaiser_dev.db"

# Pretty-Print aktivieren
sqlite3 "El Servador/god_kaiser_server/god_kaiser_dev.db" -header -column
```

#### Direkt-Zugang (PostgreSQL)

```bash
# psql verbinden
psql -h localhost -U god_kaiser -d god_kaiser_db

# Inline-Query
psql -h localhost -U god_kaiser -d god_kaiser_db -c "SELECT * FROM esp_devices;"
```

---

### 1.2 Schema-Übersicht

| Tabelle | Beschreibung | Wichtige Felder |
|---------|--------------|-----------------|
| `esp_devices` | ESP32-Geräte | device_id, status, zone_id, last_seen, health_status |
| `sensor_configs` | Sensor-Konfigurationen | esp_id, gpio, sensor_type, enabled, config_status |
| `sensor_data` | Sensor-Messwerte (Time-Series) | esp_id, gpio, raw_value, processed_value, timestamp |
| `actuator_configs` | Aktor-Konfigurationen | esp_id, gpio, actuator_type, enabled |
| `actuator_states` | Aktuelle Aktor-Zustände | esp_id, gpio, current_value, state |
| `actuator_history` | Aktor-Historie (Time-Series) | esp_id, gpio, command_type, success, timestamp |
| `cross_esp_logic` | Automatisierungs-Regeln | rule_name, enabled, trigger_conditions, actions |
| `logic_execution_history` | Regel-Ausführungen | logic_rule_id, success, execution_time_ms |
| `esp_heartbeat_logs` | Heartbeat-Logs | device_id, heap_free, wifi_rssi, uptime, timestamp |
| `audit_logs` | System-Audit-Trail | event_type, severity, source_type, message |
| `user_accounts` | Benutzerkonten | username, email, role, is_active |
| `token_blacklist` | Logout-Token-Tracking | token_hash, expires_at, blacklisted_at |
| `subzone_configs` | Subzone-Konfigurationen | esp_id, subzone_id, assigned_gpios |
| `kaiser_registry` | Kaiser-Nodes (geplant) | kaiser_id, status, zone_ids |
| `system_config` | System-Konfiguration | config_key, config_value, config_type |

---

### 1.3 Inspection Queries

#### ESP-Geräte anzeigen

```sql
-- Alle ESPs mit Status
SELECT device_id, name, status, zone_id, last_seen, health_status
FROM esp_devices
ORDER BY last_seen DESC;

-- Nur Online-ESPs
SELECT device_id, name, zone_id, last_seen
FROM esp_devices
WHERE status = 'online';

-- Pending (nicht genehmigte) ESPs
SELECT device_id, name, discovered_at, ip_address
FROM esp_devices
WHERE status = 'pending'
ORDER BY discovered_at DESC;

-- ESPs mit Problemen (degraded/unhealthy)
SELECT device_id, name, health_status, last_seen
FROM esp_devices
WHERE health_status IN ('degraded', 'unhealthy', 'critical');
```

#### Sensoren anzeigen

```sql
-- Alle Sensoren eines ESP
SELECT gpio, sensor_type, sensor_name, enabled, config_status
FROM sensor_configs
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'ESP_XXXXX');

-- Sensoren mit Config-Fehlern
SELECT sc.sensor_name, sc.config_status, sc.config_error, ed.device_id
FROM sensor_configs sc
JOIN esp_devices ed ON sc.esp_id = ed.id
WHERE sc.config_status = 'error';

-- Letzte Messwerte pro Sensor
SELECT esp_id, gpio, sensor_type, raw_value, processed_value, timestamp
FROM sensor_data
WHERE timestamp > datetime('now', '-1 hour')
ORDER BY timestamp DESC
LIMIT 100;
```

#### Aktoren anzeigen

```sql
-- Alle Aktoren eines ESP
SELECT gpio, actuator_type, actuator_name, enabled, config_status
FROM actuator_configs
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'ESP_XXXXX');

-- Aktuelle Aktor-Zustände
SELECT ast.gpio, ast.actuator_type, ast.current_value, ast.state, ed.device_id
FROM actuator_states ast
JOIN esp_devices ed ON ast.esp_id = ed.id
WHERE ast.state != 'idle';

-- Letzte Aktor-Commands
SELECT esp_id, gpio, command_type, value, success, timestamp
FROM actuator_history
ORDER BY timestamp DESC
LIMIT 50;
```

#### Logic-Regeln anzeigen

```sql
-- Alle aktiven Regeln
SELECT id, rule_name, enabled, priority, last_triggered
FROM cross_esp_logic
WHERE enabled = 1
ORDER BY priority;

-- Letzte Regel-Ausführungen
SELECT leh.success, leh.execution_time_ms, leh.timestamp, cel.rule_name
FROM logic_execution_history leh
JOIN cross_esp_logic cel ON leh.logic_rule_id = cel.id
ORDER BY leh.timestamp DESC
LIMIT 50;
```

#### System-Statistiken

```sql
-- ESP-Statistik
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
  SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
FROM esp_devices;

-- Sensor-Daten Volumen (letzte 24h)
SELECT COUNT(*) as data_points,
       sensor_type,
       data_source
FROM sensor_data
WHERE timestamp > datetime('now', '-24 hours')
GROUP BY sensor_type, data_source;

-- Audit-Log Zusammenfassung
SELECT severity, COUNT(*) as count
FROM audit_logs
WHERE created_at > datetime('now', '-24 hours')
GROUP BY severity;
```

---

### 1.4 Cleanup Queries

> ⚠️ **WARNUNG:** DELETE-Operationen sind permanent. Backup empfohlen!

#### Orphaned Mock-ESPs finden

```sql
-- Mock-ESPs ohne Aktivität (>24h)
SELECT device_id, name, last_seen, status
FROM esp_devices
WHERE device_id LIKE 'MOCK_%'
AND last_seen < datetime('now', '-24 hours');
```

#### Mock-ESP komplett löschen (mit Kaskade)

```sql
-- Variante 1: CASCADE (wenn FK konfiguriert)
DELETE FROM esp_devices WHERE device_id = 'MOCK_XXXXX';

-- Variante 2: Manuell (SQLite ohne CASCADE)
-- Schritt 1: Sensor-Daten löschen
DELETE FROM sensor_data
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'MOCK_XXXXX');

-- Schritt 2: Sensor-Configs löschen
DELETE FROM sensor_configs
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'MOCK_XXXXX');

-- Schritt 3: Aktor-History löschen
DELETE FROM actuator_history
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'MOCK_XXXXX');

-- Schritt 4: Aktor-States löschen
DELETE FROM actuator_states
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'MOCK_XXXXX');

-- Schritt 5: Aktor-Configs löschen
DELETE FROM actuator_configs
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'MOCK_XXXXX');

-- Schritt 6: Heartbeat-Logs löschen
DELETE FROM esp_heartbeat_logs
WHERE device_id = 'MOCK_XXXXX';

-- Schritt 7: ESP löschen
DELETE FROM esp_devices WHERE device_id = 'MOCK_XXXXX';
```

#### Alle Mock-ESPs löschen

```sql
-- Alle Mocks auf einmal (nur wenn CASCADE aktiv)
DELETE FROM esp_devices WHERE device_id LIKE 'MOCK_%';
```

#### Alte Sensor-Daten bereinigen

```sql
-- Daten älter als 30 Tage löschen
DELETE FROM sensor_data
WHERE timestamp < datetime('now', '-30 days');

-- Test-Daten löschen
DELETE FROM sensor_data
WHERE data_source IN ('test', 'simulation', 'mock');
```

#### Alte Aktor-History bereinigen

```sql
-- History älter als 30 Tage
DELETE FROM actuator_history
WHERE timestamp < datetime('now', '-30 days');
```

#### Alte Heartbeat-Logs bereinigen

```sql
-- Logs älter als 7 Tage
DELETE FROM esp_heartbeat_logs
WHERE timestamp < datetime('now', '-7 days');
```

#### Audit-Logs bereinigen

```sql
-- Info-Level älter als 7 Tage
DELETE FROM audit_logs
WHERE severity = 'info'
AND created_at < datetime('now', '-7 days');

-- Alle Logs älter als 90 Tage
DELETE FROM audit_logs
WHERE created_at < datetime('now', '-90 days');
```

#### Abgelaufene Token löschen

```sql
DELETE FROM token_blacklist
WHERE expires_at < datetime('now');
```

#### Offline-ESPs finden (Cleanup-Kandidaten)

```sql
-- ESPs ohne Heartbeat seit >7 Tagen
SELECT device_id, name, last_seen, status
FROM esp_devices
WHERE last_seen < datetime('now', '-7 days')
AND device_id NOT LIKE 'MOCK_%';
```

---

## 2. Server

### 2.1 Start/Stop

#### Via Docker (EMPFOHLEN)

```bash
# Server starten (Teil des Docker-Stacks)
docker compose up -d el-servador

# Server neu starten
docker compose restart el-servador

# Server stoppen
docker compose stop el-servador

# Server-Logs live
docker compose logs -f el-servador

# In Container Shell
docker compose exec el-servador bash
```

#### Via Poetry (Lokal/Alternative)

```bash
# Development (mit Hot-Reload)
cd "El Servador/god_kaiser_server"
poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Production (4 Worker)
cd "El Servador/god_kaiser_server"
poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers 4

# Mit expliziten Umgebungsvariablen
cd "El Servador/god_kaiser_server"
ENVIRONMENT=production LOG_LEVEL=INFO poetry run uvicorn src.main:app --workers 4

# Kurzform (wenn poetry venv aktiviert)
cd "El Servador/god_kaiser_server"
uvicorn src.main:app --reload
```

#### Server stoppen (Poetry)

```bash
# Graceful Shutdown (empfohlen)
# In Terminal: Ctrl+C

# Oder per Signal
kill -SIGTERM <PID>

# PID finden
ps aux | grep uvicorn
# Windows (PowerShell):
Get-Process | Where-Object { $_.ProcessName -like '*uvicorn*' }
# Windows (Docker):
docker compose ps el-servador
```

---

### 2.2 Health & Status

#### Health-Check Endpoints

```bash
# Basic Health (öffentlich)
curl http://localhost:8000/health

# Detaillierter Health (Auth erforderlich)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/v1/health/detailed

# ESP-Zusammenfassung
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/v1/health/esp

# Kubernetes Liveness
curl http://localhost:8000/api/v1/health/live

# Kubernetes Readiness
curl http://localhost:8000/api/v1/health/ready

# Prometheus Metrics
curl http://localhost:8000/api/v1/health/metrics
```

#### Erwartete Responses

```json
// GET / (Root - Service Info)
{
  "service": "God-Kaiser Server",
  "version": "2.0.0",
  "status": "online",
  "mqtt_connected": true,
  "environment": "development",
  "docs": "/docs",
  "api_prefix": "/api/v1"
}

// GET /health (Simple Health Check)
{
  "status": "healthy",       // "healthy" oder "degraded"
  "mqtt_connected": true
}

// /api/v1/health/detailed
{
  "success": true,
  "status": "healthy",
  "database": {"connected": true, "latency_ms": 5.0},
  "mqtt": {"connected": true, "broker_host": "localhost"},
  "websocket": {"active_connections": 2}
}
```

---

### 2.3 Logs

#### Log-Dateien (Docker Bind-Mounts)

| Pfad | Inhalt | Rotation |
|------|--------|----------|
| `logs/server/god_kaiser.log` | Server JSON-Logs | 10 Backups × 10MB |
| `logs/mqtt/mosquitto.log` | – (Bind-Mount in docker-compose auskommentiert; MQTT-Logs: `docker compose logs mqtt-broker` oder Loki) | – |
| (kein Bind-Mount) | PostgreSQL: `docker compose logs postgres` oder Loki `{compose_service="postgres"}` | Docker json-file Rotation |

#### Via Docker (EMPFOHLEN)

```bash
# Server-Logs live
docker compose logs -f el-servador

# Letzte 100 Zeilen
docker compose logs --tail=100 el-servador

# MQTT-Broker-Logs
docker compose logs -f mqtt-broker

# PostgreSQL-Logs
docker compose logs -f postgres

# Alle Services
docker compose logs -f
```

#### Via Dateisystem

```bash
# Server-Logs (Docker Bind-Mount)
tail -f logs/server/god_kaiser.log
tail -100 logs/server/god_kaiser.log

# Nur Fehler
grep -E "ERROR|CRITICAL" logs/server/god_kaiser.log

# MQTT-Events
grep "mqtt" logs/server/god_kaiser.log

# Heartbeats filtern (oft zu viel Output)
tail -f logs/server/god_kaiser.log | grep -v "heartbeat"

# PostgreSQL Slow Queries (>100ms) — via Docker oder Loki
docker compose logs postgres | grep "duration:"

# MQTT Broker-Logs (Bind-Mount deaktiviert: docker compose logs -f mqtt-broker oder Loki compose_service=mqtt-broker)
docker compose logs -f mqtt-broker
```

#### PowerShell (Windows)

```powershell
# Letzte 50 Zeilen
Get-Content "logs/server/god_kaiser.log" -Tail 50

# Live-Stream
Get-Content "logs/server/god_kaiser.log" -Tail 100 -Wait

# JSON parsen
Get-Content "logs/server/god_kaiser.log" | ConvertFrom-Json |
  Where-Object { $_.level -eq "ERROR" } |
  Format-Table timestamp, message
```

---

## 3. REST-API

### 3.1 ESP-Management

```bash
# Alle ESPs auflisten
curl http://localhost:8000/api/v1/esp/devices

# Einzelnes ESP
curl http://localhost:8000/api/v1/esp/devices/ESP_XXXXX

# Pending ESPs (warten auf Genehmigung)
curl http://localhost:8000/api/v1/esp/devices/pending

# ESP genehmigen
curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/approve \
  -H "Content-Type: application/json" \
  -d '{"approved_by": "admin"}'

# ESP ablehnen
curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/reject \
  -H "Content-Type: application/json" \
  -d '{"reason": "Nicht autorisiert"}'

# ESP löschen
curl -X DELETE http://localhost:8000/api/v1/esp/devices/ESP_XXXXX

# ESP Health
curl http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/health

# GPIO-Status
curl http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/gpio-status

# Config an ESP senden
curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/config \
  -H "Content-Type: application/json" \
  -d '{"sensors": [...], "actuators": [...]}'

# ESP neu starten
curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/restart

# ESP Factory-Reset
curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/reset \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

---

### 3.2 Sensor-Management

```bash
# Alle Sensoren auflisten
curl http://localhost:8000/api/v1/sensors/

# Sensoren eines ESP
curl "http://localhost:8000/api/v1/sensors/?esp_id=ESP_XXXXX"

# Sensor erstellen/aktualisieren
curl -X POST http://localhost:8000/api/v1/sensors/ESP_XXXXX/4 \
  -H "Content-Type: application/json" \
  -d '{
    "sensor_type": "DS18B20",
    "name": "Temperatur Boden",
    "enabled": true,
    "interface_type": "ONEWIRE"
  }'

# Sensor löschen
curl -X DELETE http://localhost:8000/api/v1/sensors/ESP_XXXXX/4

# Sensor-Daten abfragen
curl "http://localhost:8000/api/v1/sensors/data?esp_id=ESP_XXXXX&gpio=4&limit=100"

# Statistiken
curl http://localhost:8000/api/v1/sensors/ESP_XXXXX/4/stats

# Manuelle Messung triggern
curl -X POST http://localhost:8000/api/v1/sensors/ESP_XXXXX/4/measure

# OneWire-Bus scannen
curl -X POST "http://localhost:8000/api/v1/sensors/esp/ESP_XXXXX/onewire/scan?pin=4"
```

---

### 3.3 Actuator-Management

```bash
# Alle Aktoren auflisten
curl http://localhost:8000/api/v1/actuators/

# Aktor erstellen
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5 \
  -H "Content-Type: application/json" \
  -d '{
    "actuator_type": "pump",
    "name": "Wasserpumpe 1",
    "enabled": true
  }'

# Aktor-Status
curl http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/status

# Aktor-Command senden
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/command \
  -H "Content-Type: application/json" \
  -d '{"command": "ON", "value": 1.0, "duration": 0}'

# PWM setzen
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/command \
  -H "Content-Type: application/json" \
  -d '{"command": "PWM", "value": 0.75}'

# Aktor ausschalten
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/command \
  -H "Content-Type: application/json" \
  -d '{"command": "OFF"}'

# Aktor löschen (sendet erst OFF)
curl -X DELETE http://localhost:8000/api/v1/actuators/ESP_XXXXX/5

# Command-History
curl http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/history

# ⚠️ EMERGENCY STOP (alle Aktoren)
curl -X POST http://localhost:8000/api/v1/actuators/emergency_stop \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manueller Test"}'
```

---

### 3.4 Zone-Management

```bash
# ESP einer Zone zuweisen
curl -X POST http://localhost:8000/api/v1/zone/devices/ESP_XXXXX/assign \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "greenhouse_1", "zone_name": "Gewächshaus 1"}'

# Zone-Zuweisung entfernen
curl -X DELETE http://localhost:8000/api/v1/zone/devices/ESP_XXXXX/zone

# Zone-Info eines ESP
curl http://localhost:8000/api/v1/zone/devices/ESP_XXXXX

# Alle ESPs einer Zone
curl http://localhost:8000/api/v1/zone/greenhouse_1/devices

# ESPs ohne Zone
curl http://localhost:8000/api/v1/zone/unassigned
```

---

### 3.5 Debug-Endpoints

```bash
# Mock-ESP erstellen
curl -X POST http://localhost:8000/api/v1/debug/mock-esp \
  -H "Content-Type: application/json" \
  -d '{"name": "Test-Mock", "sensor_count": 3, "actuator_count": 2}'

# Alle Mock-ESPs auflisten
curl http://localhost:8000/api/v1/debug/mock-esp

# Mock-ESP Details
curl http://localhost:8000/api/v1/debug/mock-esp/MOCK_XXXXX

# Mock-ESP Simulation starten
curl -X POST http://localhost:8000/api/v1/debug/mock-esp/MOCK_XXXXX/start

# Mock-ESP Simulation stoppen
curl -X POST http://localhost:8000/api/v1/debug/mock-esp/MOCK_XXXXX/stop

# Heartbeat manuell triggern
curl -X POST http://localhost:8000/api/v1/debug/mock-esp/MOCK_XXXXX/heartbeat

# Sensor-Wert manuell setzen
curl -X POST http://localhost:8000/api/v1/debug/mock-esp/MOCK_XXXXX/sensor/temp_0/value \
  -H "Content-Type: application/json" \
  -d '{"value": 25.5}'

# Mock-ESP löschen
curl -X DELETE http://localhost:8000/api/v1/debug/mock-esp/MOCK_XXXXX

# DB-Tabellen auflisten
curl http://localhost:8000/api/v1/debug/db/tables

# Tabellen-Daten abfragen
curl "http://localhost:8000/api/v1/debug/db/tables/esp_devices?limit=10"

# Tabellen-Schema
curl http://localhost:8000/api/v1/debug/db/tables/esp_devices/schema

# Test-Daten bereinigen
curl -X DELETE http://localhost:8000/api/v1/debug/db/purge \
  -H "Content-Type: application/json" \
  -d '{"older_than_days": 7, "data_sources": ["test", "mock"]}'
```

---

### 3.6 Logic-Regeln

```bash
# Alle Regeln auflisten
curl http://localhost:8000/api/v1/logic/rules

# Regel erstellen
curl -X POST http://localhost:8000/api/v1/logic/rules \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Temperatur-Alarm",
    "description": "Pumpe an wenn T > 30°C",
    "enabled": true,
    "trigger_conditions": {
      "esp_id": "ESP_XXXXX",
      "gpio": 4,
      "operator": ">",
      "value": 30.0
    },
    "actions": [
      {"esp_id": "ESP_XXXXX", "gpio": 5, "command": "ON"}
    ]
  }'

# Regel aktivieren/deaktivieren
curl -X POST http://localhost:8000/api/v1/logic/rules/RULE_ID/toggle

# Regel testen (Simulation)
curl -X POST http://localhost:8000/api/v1/logic/rules/RULE_ID/test

# Regel löschen
curl -X DELETE http://localhost:8000/api/v1/logic/rules/RULE_ID

# Ausführungs-History
curl http://localhost:8000/api/v1/logic/execution_history
```

---

### 3.7 Authentifizierung

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=your_password"

# Response: {"access_token": "...", "token_type": "bearer"}

# Token verwenden
curl -H "Authorization: Bearer ACCESS_TOKEN" \
  http://localhost:8000/api/v1/esp/devices

# Token refreshen
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Authorization: Bearer REFRESH_TOKEN"

# Logout
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer ACCESS_TOKEN"

# Auth-Status prüfen
curl http://localhost:8000/api/v1/auth/status
```

---

## 4. MQTT

### 4.1 Monitoring

#### Via Docker (EMPFOHLEN)

```bash
# Alle Topics beobachten (via Docker)
docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v -C 10 -W 30

# Mit Timestamps (wie in session.sh)
docker compose exec -T mqtt-broker mosquitto_sub -t "kaiser/#" -v -C 10 -W 30 | while IFS= read -r line; do
    echo "[$(date -Iseconds)] $line"
done

# Broker-Logs
docker compose logs -f mqtt-broker
```

#### Via lokalen Client

```bash
# Alle Topics beobachten
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30

# Nur Heartbeats
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v -C 1 -W 60

# Nur Sensor-Daten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v -C 3 -W 90

# Nur Actuator-Status
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/status" -v -C 3 -W 90

# Nur Alerts
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/alert" -v -C 3 -W 90

# Nur Fehler
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/error" -v -C 3 -W 90

# Bestimmtes ESP
mosquitto_sub -h localhost -t "kaiser/god/esp/ESP_XXXXX/#" -v -C 10 -W 30

# Broadcasts
mosquitto_sub -h localhost -t "kaiser/broadcast/#" -v -C 10 -W 30
```

---

### 4.2 Simulation (als ESP)

```bash
# Heartbeat senden
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_TEST/system/heartbeat" \
  -m '{
    "esp_id": "ESP_TEST",
    "ts": '$(date +%s)',
    "uptime": 3600,
    "heap_free": 245760,
    "wifi_rssi": -65,
    "sensor_count": 3,
    "actuator_count": 2
  }'

# Sensor-Daten senden
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_TEST/sensor/4/data" \
  -m '{
    "ts": '$(date +%s)',
    "esp_id": "ESP_TEST",
    "gpio": 4,
    "sensor_type": "DS18B20",
    "raw": 2150,
    "value": 21.5,
    "unit": "°C",
    "quality": "good",
    "raw_mode": true
  }'

# Actuator-Status melden
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_TEST/actuator/5/status" \
  -m '{
    "ts": '$(date +%s)',
    "esp_id": "ESP_TEST",
    "gpio": 5,
    "type": "pump",
    "state": true,
    "pwm": 255,
    "runtime_ms": 60000,
    "emergency": "normal"
  }'

# Config-Response senden
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_TEST/config_response" \
  -m '{
    "ts": '$(date +%s)',
    "esp_id": "ESP_TEST",
    "config_id": "cfg_12345",
    "config_applied": true,
    "restart_required": false
  }'

# Zone-ACK senden
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_TEST/zone/ack" \
  -m '{
    "esp_id": "ESP_TEST",
    "zone_id": "greenhouse_1",
    "zone_name": "Gewächshaus 1",
    "success": true
  }'
```

---

### 4.3 Commands (als Server)

```bash
# Actuator-Command
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/actuator/5/command" \
  -m '{
    "command": "ON",
    "value": 1.0,
    "duration": 0,
    "timestamp": '$(date +%s)'
  }'

# PWM setzen
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/actuator/5/command" \
  -m '{
    "command": "PWM",
    "value": 0.75,
    "timestamp": '$(date +%s)'
  }'

# System-Command (Reboot)
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/system/command" \
  -m '{"command": "reboot", "params": {"delay": 5000}}'

# System-Command (Safe-Mode)
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/system/command" \
  -m '{"command": "safe_mode"}'

# Config senden
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/config" \
  -m '{
    "config_id": "cfg_'$(date +%s)'",
    "sensors": [
      {"gpio": 4, "type": "DS18B20", "name": "Temp1", "active": true}
    ],
    "actuators": [
      {"gpio": 5, "type": "pump", "name": "Pumpe1", "active": true}
    ]
  }'

# Zone zuweisen
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/zone/assign" \
  -m '{"zone_id": "greenhouse_1", "master_zone_id": "main"}'

# ⚠️ Emergency-Stop (Broadcast)
mosquitto_pub -h localhost -t "kaiser/broadcast/emergency" \
  -m '{"action": "stop_all", "reason": "Manueller Test"}'
```

---

### 4.4 Cleanup (Retained)

```bash
# Retained Message löschen (leere Message mit -r -n)
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/actuator/5/status" -r -n

# Alle Retained für ein ESP löschen (manuell pro Topic)
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/system/heartbeat" -r -n
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/status" -r -n

# Emergency-Stop Retained löschen
mosquitto_pub -h localhost -t "kaiser/broadcast/emergency" -r -n
```

---

## 5. ESP32-Hardware

**Hinweis:** `pio` ist in Git Bash nicht im PATH. Vollständiger Pfad: `~/.platformio/penv/Scripts/pio.exe` (v6.1.18). Build, Flash UND zeitbegrenzter Monitor funktionieren aus Git Bash (COM5/CH340 verifiziert 2026-02-26). Fuer interaktiven Monitor (Ctrl+C) PowerShell nutzen.

### 5.1 Flash-Operationen

```bash
# Projekt-Verzeichnis
cd "El Trabajante"

# Build (ESP32 Dev Board)
pio run -e esp32_dev

# Build (XIAO ESP32-C3)
pio run -e seeed_xiao_esp32c3

# Build (Wokwi Simulation - Single Device)
pio run -e wokwi_simulation

# Build (Wokwi Multi-Device - Individual)
pio run -e wokwi_esp01  # ESP_00000001
pio run -e wokwi_esp02  # ESP_00000002
pio run -e wokwi_esp03  # ESP_00000003

# Flash/Upload
pio run -e esp32_dev -t upload

# Flash komplett löschen (NVS + Firmware)
pio run -e esp32_dev -t erase

# Build + Upload in einem
pio run -e esp32_dev -t upload
```

### 5.2 Monitoring

**Wichtig:** Flash/Monitor funktionieren auch aus Git Bash (`timeout N pio device monitor` fuer zeitbegrenzten Capture). Fuer interaktiven Monitor (Ctrl+C): PowerShell. `&&` geht NICHT in PS 5.x → Befehle einzeln oder mit `;` trennen.

```powershell
# Zuerst ins PlatformIO-Projektverzeichnis wechseln
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"

# Serial Monitor
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -b 115200 -e esp32_dev

# Mit Filter
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -b 115200 -e esp32_dev --filter time

# Alle in einem: Erase + Flash + Monitor (PowerShell, Befehle einzeln)
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev -t erase
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev -t upload
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -b 115200 -e esp32_dev
```

### 5.3 Wokwi-Simulation

#### Via Makefile (EMPFOHLEN)

```bash
# Build firmware für alle Wokwi ESPs (parallel, 3 devices)
make wokwi-build

# Build einzelnes ESP
make wokwi-build-esp01  # ESP_00000001
make wokwi-build-esp02  # ESP_00000002
make wokwi-build-esp03  # ESP_00000003

# Database seeden mit 3 Wokwi test devices (ESP_00000001/02/03, status="approved")
make wokwi-seed
# Nutzt lokales .venv/Scripts/python.exe (Script ist nicht im Container gemountet)

# Alle verfügbaren Szenarien auflisten (173 total, 14 Kategorien)
make wokwi-list

# Schnelltest (3 Szenarien: boot_full, boot_safe_mode, sensor_heartbeat)
make wokwi-test-quick

# Alle CI core-Szenarien lokal (22 passive Szenarien, ~30 Minuten)
make wokwi-test-full

# ALLE 173 Szenarien (Nightly-Equivalent, erfordert Mosquitto)
make wokwi-test-all

# 10 Error-Injection Szenarien (erfordert Mosquitto + mosquitto_pub)
make wokwi-test-error-injection

# Einzelnes Szenario (default: ESP_00000001)
make wokwi-test-scenario SCENARIO=tests/wokwi/scenarios/01-boot/boot_full.yaml

# Gesamte Kategorie testen
make wokwi-test-category CAT=01-boot
make wokwi-test-category CAT=02-sensor

# Interaktiver Modus (ohne Szenario, manuelles Testen)
make wokwi-run        # Default: ESP_00000001
make wokwi-run-esp01  # ESP_00000001
make wokwi-run-esp02  # ESP_00000002
make wokwi-run-esp03  # ESP_00000003
```

#### Via PlatformIO/wokwi-cli (Direkt)

```bash
cd "El Trabajante"

# Build für Wokwi (einzelne Devices)
pio run -e wokwi_esp01  # ESP_00000001
pio run -e wokwi_esp02  # ESP_00000002
pio run -e wokwi_esp03  # ESP_00000003

# Wokwi starten (ESP_00000001)
wokwi-cli . --timeout 0 --firmware .pio/build/wokwi_esp01/firmware.bin

# Mit Test-Szenario (ESP_00000001)
wokwi-cli . --timeout 60000 --firmware .pio/build/wokwi_esp01/firmware.bin \
  --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml

# Mit Serial-Log (ESP_00000002)
wokwi-cli . --timeout 60000 --firmware .pio/build/wokwi_esp02/firmware.bin \
  --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml --serial-log-file esp02_output.log
```

**Windows-Voraussetzungen für Wokwi Full Boot (MQTT Gateway):**
1. Docker Stack mit mqtt-broker auf Host-Port 1883 (`0.0.0.0:1883->1883/tcp`)
2. Kein lokaler Mosquitto Windows-Service (blockiert Port 1883)
3. Windows Firewall: Inbound-Regel für Port 1883 TCP
4. Wokwi DB Seed lokal: `.venv\Scripts\python.exe scripts\seed_wokwi_esp.py`

**Vollständige Dokumentation:** `.claude/reference/testing/WOKWI_TESTING.md`

### 5.4 Native Tests (PlatformIO)

```bash
cd "El Trabajante"

# Alle nativen Tests ausfuehren (22 Tests: 12 TopicBuilder + 10 GPIOManager)
pio test -e native

# Verbose (empfohlen fuer Debugging)
pio test -e native -vvv

# Nur TopicBuilder-Tests
pio test -e native -f test_infra

# Nur GPIOManager-Tests
pio test -e native -f test_managers

# Hardware-Tests auf echtem ESP32
pio test -e esp32dev_test -t upload
```

**Toolchain-Voraussetzung:** MinGW-w64 muss installiert sein (gcc/g++). Der Pfad wird automatisch via `scripts/set_native_toolchain.py` gesetzt (sucht in bekannten Installationspfaden). Static linking ist aktiviert, sodass keine MinGW-DLLs zur Laufzeit benoetigt werden.

**Environments:**

| Environment | Platform | Zweck |
|-------------|----------|-------|
| `native` | x86_64 | Unit Tests ohne Hardware (Unity Framework, 22 Tests) |
| `esp32dev_test` | espressif32 | Hardware-Tests direkt auf ESP32 |

**Aktive Native Tests (2 Suites, 22 Tests):**
- `test/test_infra/test_topic_builder.cpp` (12 Tests: MQTT Topic-Generierung)
- `test/test_managers/test_gpio_manager_mock.cpp` (10 Tests: GPIOManager mit MockGPIOHal)

### 5.5 Lokale Tests (PowerShell)

```powershell
# Frontend (Vitest) - 1118 Tests
cd "El Frontend"
npx vitest run

# Backend Unit (pytest) - 759+ Tests
cd "El Servador\god_kaiser_server"
.venv\Scripts\pytest.exe tests\unit\ -x -q

# ESP32 Native (Unity) - 22 Tests
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" test -e native

# Backend Integration (braucht Docker Stack)
cd "El Servador\god_kaiser_server"
.venv\Scripts\pytest.exe tests\integration\ -v --tb=short

# Wokwi Build (PowerShell, ohne make)
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e wokwi_esp01

# Wokwi Test (PowerShell)
cd "El Trabajante"
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml
```

**Hinweis:** `poetry run` kann auf Python 3.14 statt `.venv` (3.13) resolven. Workaround: `.venv\Scripts\` direkt nutzen.

### 5.6 NVS-Operationen (Programmatisch)

Die NVS-Operationen erfolgen über die Firmware oder Boot-Button:

| Aktion | Methode |
|--------|---------|
| Factory Reset | Boot-Button 10s halten |
| NVS Erase | `pio run -e esp32_dev -t erase` |
| Config Reset | Via MQTT System-Command: `{"command": "reset_config"}` |

---

## 6. Kombinierte Workflows

### 6.1 Neues ESP komplett registrieren

#### Reale Hardware (Provisioning Portal)

```bash
# 1. ESP flashen (Git Bash, PowerShell oder PlatformIO Terminal)
cd "El Trabajante"
pio run -e esp32_dev -t upload

# 2. ESP startet im AP-Modus (Provisioning Portal)
#    - SSID: "AutoOne-ESP_XXXXXXXX" (Chip-ID)
#    - Passwort: "provision"
#    - Portal-URL: http://192.168.4.1
#    → WiFi-SSID, WiFi-Password, MQTT-Broker-IP konfigurieren
#    → Nach Speichern: ESP rebootet und verbindet sich via WiFi+MQTT

# 3. Monitor öffnen (PowerShell oder PlatformIO Terminal)
pio device monitor -b 115200

# 4. Warten auf Heartbeat (ESP sendet automatisch nach WiFi+MQTT Verbindung)
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v -C 1 -W 60

# 5. ESP sollte als "pending" erscheinen (Auth erforderlich)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/esp/devices/pending

# 6. ESP genehmigen
curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved_by": "admin"}'

# 7. Zone zuweisen
curl -X POST http://localhost:8000/api/v1/zone/devices/ESP_XXXXX/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "greenhouse_1", "zone_name": "Gewächshaus 1"}'

# 8. Sensoren konfigurieren
curl -X POST http://localhost:8000/api/v1/sensors/ESP_XXXXX/4 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sensor_type": "DS18B20", "name": "Temperatur", "enabled": true}'

# 9. Aktoren konfigurieren
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"actuator_type": "pump", "name": "Pumpe", "enabled": true}'
```

**Hinweis:** `$TOKEN` muss vorher via Login geholt werden (siehe §0.2). Flash/Monitor funktionieren aus Git Bash (verifiziert 2026-02-26). Serial Monitor zeitbegrenzt: `timeout N pio device monitor`.

---

### 6.2 Altes ESP komplett entfernen

```bash
# 1. Alle Aktoren ausschalten
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/command \
  -H "Content-Type: application/json" \
  -d '{"command": "OFF"}'

# 2. ESP über API löschen (löscht auch Configs)
curl -X DELETE http://localhost:8000/api/v1/esp/devices/ESP_XXXXX \
  -H "Authorization: Bearer $TOKEN"

# 3. Alte Daten bereinigen (optional, PostgreSQL)
docker exec -i postgres psql -U god_kaiser -d god_kaiser_db \
  -c "DELETE FROM sensor_data WHERE esp_id NOT IN (SELECT id FROM esp_devices);"

# 4. Retained MQTT Messages löschen
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/system/heartbeat" -r -n
mosquitto_pub -h localhost -t "kaiser/god/esp/ESP_XXXXX/status" -r -n
```

---

### 6.3 System-Reset (Clean State)

```bash
# ⚠️ WARNUNG: Löscht ALLE Daten!

# 1. Server stoppen
# Ctrl+C im Server-Terminal

# 2. Datenbank zurücksetzen (PostgreSQL via Docker)
docker exec -i postgres psql -U god_kaiser -d god_kaiser_db \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
# Oder: Cleanup-Script nutzen (behält User-Accounts):
cd "El Servador/god_kaiser_server"
.venv/Scripts/python.exe ../../scripts/cleanup_for_real_esp.py

# 3. Logs löschen (optional)
rm -rf logs/server/*

# 4. Mosquitto Retained Messages löschen (alle)
mosquitto_pub -h localhost -t "kaiser/#" -r -n

# 5. Server neu starten (Docker)
docker compose restart el-servador

# 6. ESP32s: Factory Reset (Boot-Button 10s)
# Oder: Flash erase
cd "El Trabajante"
pio run -e esp32_dev -t erase
pio run -e esp32_dev -t upload
```

---

### 6.4 Debug-Session starten

#### Via session.sh (EMPFOHLEN)

```bash
# Session-Script startet automatisch:
# - Docker-Stack Health-Check
# - MQTT-Capture mit Timestamps
# - Log-Archivierung
# - STATUS.md für Agents

./scripts/debug/start_session.sh boot-test
./scripts/debug/start_session.sh sensor-test --mode sensor
./scripts/debug/start_session.sh e2e-test --mode e2e

# Session beenden
./scripts/debug/stop_session.sh
```

#### Manuelle Debug-Session

```bash
# Terminal 1: Docker-Logs
docker compose logs -f el-servador

# Terminal 2: MQTT-Traffic (via Docker)
docker compose exec -T mqtt-broker mosquitto_sub -t "kaiser/#" -v -C 10 -W 30 | while read line; do
    echo "[$(date -Iseconds)] $line"
done

# Terminal 3: ESP Serial Monitor
cd "El Trabajante"
pio device monitor -b 115200 | tee logs/current/esp32_serial.log

# Terminal 4: Server-Logs (Errors only)
tail -f logs/server/god_kaiser.log | grep -E "ERROR|WARNING"

# Schnell-Check: Health
curl -s http://localhost:8000/api/v1/health/live | jq

# Schnell-Check: ESP Status
curl -s http://localhost:8000/api/v1/esp/devices | jq '.data[] | {device_id, status, last_seen}'
```

---

### 6.5 Mock-ESP Debug-Session

```bash
# 1. Mock erstellen
curl -X POST http://localhost:8000/api/v1/debug/mock-esp \
  -H "Content-Type: application/json" \
  -d '{"name": "Debug-Mock", "sensor_count": 2}'

# Response enthält MOCK_ID

# 2. Simulation starten
curl -X POST http://localhost:8000/api/v1/debug/mock-esp/MOCK_ID/start

# 3. MQTT beobachten
mosquitto_sub -h localhost -t "kaiser/god/esp/MOCK_ID/#" -v -C 10 -W 30

# 4. Sensor-Wert manuell setzen
curl -X POST http://localhost:8000/api/v1/debug/mock-esp/MOCK_ID/sensor/temp_0/value \
  -H "Content-Type: application/json" \
  -d '{"value": 35.0}'

# 5. Heartbeat triggern
curl -X POST http://localhost:8000/api/v1/debug/mock-esp/MOCK_ID/heartbeat

# 6. Aufräumen
curl -X DELETE http://localhost:8000/api/v1/debug/mock-esp/MOCK_ID
```

---

### 6.6 Flow-Verifikation: MQTT parallel beobachten

**Prinzip:** Bei jeder Operation den **kompletten Kommunikationsfluss** verifizieren - nicht nur "Befehl gesendet", sondern "Befehl gesendet → empfangen → verarbeitet → Antwort erhalten".

```bash
# Terminal 1: MQTT Traffic beobachten (ERST starten!)
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30

# Terminal 2: Operation ausführen
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/command \
  -H "Content-Type: application/json" -d '{"command": "ON"}'
```

**Erwarteter Flow für Actuator-Command:**

```
1. [API]     POST /actuators/.../command      → HTTP 202
2. [MQTT →]  kaiser/god/esp/ESP_XXX/actuator/5/command   {"command":"ON"...}
3. [MQTT ←]  kaiser/god/esp/ESP_XXX/actuator/5/response  {"success":true...}
4. [MQTT ←]  kaiser/god/esp/ESP_XXX/actuator/5/status    {"state":"ON"...}
```

**Wenn Schritt 3 oder 4 fehlt:** ESP hat nicht geantwortet → esp32-debug konsultieren.

---

### 6.7 Sensor-Daten Flow verifizieren

```bash
# E2E-Test via Python (umgeht Shell-Escaping-Probleme mit mosquitto_pub):
cd "El Servador/god_kaiser_server"
.venv/Scripts/python.exe ../../scripts/test_e2e_sensor_publish.py

# MQTT beobachten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v -C 3 -W 90

# Erwarteter Flow (alle 30s bei aktivem Sensor):
# kaiser/god/esp/ESP_XXX/sensor/4/data {"ts":...,"gpio":4,"raw":2048,"raw_mode":true}
```

**Kein Traffic?** Prüfen:
1. ESP online? → `curl http://localhost:8000/api/v1/esp/devices/ESP_XXX`
2. Sensor konfiguriert? → `curl http://localhost:8000/api/v1/sensors/ESP_XXX`
3. ESP Serial-Log → esp32-debug

---

### 6.8 Config-Push Flow verifizieren

```bash
# Terminal 1: Config-Topics beobachten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/config*" -v -C 1 -W 30

# Terminal 2: Config pushen (z.B. Sensor hinzufügen)
curl -X POST http://localhost:8000/api/v1/sensors/ESP_XXX/4 \
  -H "Content-Type: application/json" \
  -d '{"sensor_type": "DS18B20", "name": "Temp1", "enabled": true}'
```

**Erwarteter Flow:**

```
1. [API]     POST /sensors/ESP_XXX/4           → HTTP 201
2. [MQTT →]  kaiser/god/esp/ESP_XXX/config     {"sensors":[...]...}
3. [MQTT ←]  kaiser/god/esp/ESP_XXX/config_response  {"config_applied":true}
```

**config_applied:false?** → ESP konnte Config nicht anwenden → esp32-debug

---

### 6.9 Operations-Checkliste

Nach jeder Operation prüfen:

| Schritt | Prüfung | Tool |
|---------|---------|------|
| 1. API Response | HTTP 2xx erhalten? | curl Output |
| 2. MQTT Outbound | Server hat Message gesendet? | mosquitto_sub |
| 3. MQTT Inbound | ESP hat geantwortet? | mosquitto_sub |
| 4. State Updated | DB/API zeigt neuen State? | curl GET |

**Delegation bei Problemen:**

| Wenn fehlt | Problem | Delegieren an |
|------------|---------|---------------|
| Schritt 2 | Server-Problem | **server-debug** |
| Schritt 3 | ESP-Problem | **esp32-debug** |
| Schritt 4 | DB-Problem | **db-inspector** |

---

## 7. Troubleshooting

### Häufige Probleme

| Problem | Diagnose | Lösung |
|---------|----------|--------|
| ESP nicht sichtbar | Heartbeat prüfen | WiFi/MQTT-Config prüfen |
| MQTT disconnected | Server-Logs prüfen | Mosquitto-Service neustarten |
| "Circuit Breaker opened" | Zu viele Fehler | Ursache beheben, Server neustarten |
| DB locked (SQLite) | Mehrere Verbindungen | Server neustarten |
| JWT abgelaufen | 401 Unauthorized | Neu einloggen |
| ESP "pending" bleibt | Approval fehlt | `/approve` Endpoint nutzen |

### Diagnose-Befehle

```bash
# Server erreichbar?
curl -s http://localhost:8000/api/v1/health/live | jq '.status'

# MQTT erreichbar?
mosquitto_pub -h localhost -t "test" -m "ping" && echo "OK"

# DB-Verbindung?
sqlite3 "El Servador/god_kaiser_server/god_kaiser_dev.db" "SELECT 1;"

# ESP32 sendet?
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -C 1 -W 60

# Letzte Fehler
grep "ERROR" "El Servador/god_kaiser_server/logs/god_kaiser.log" | tail -10
```

---

## 8. Monitoring-Stack

### 8.1 Starten/Stoppen

```bash
# Monitoring starten (Loki, Alloy, Prometheus, Grafana, postgres-exporter, mosquitto-exporter)
make monitor-up
# oder: docker compose --profile monitoring up -d

# Monitoring stoppen (Core bleibt laufen)
make monitor-down

# Monitoring-Logs
make monitor-logs

# Monitoring-Status
make monitor-status
```

### 8.2 Zugang

| Tool | URL | Credentials |
|------|-----|-------------|
| Grafana | http://localhost:3000 | admin / GRAFANA_ADMIN_PASSWORD aus .env |
| Prometheus | http://localhost:9090 | - |
| Loki API | http://localhost:3100 | - |
| pgAdmin | http://localhost:5050 | PGADMIN_DEFAULT_EMAIL / PGADMIN_DEFAULT_PASSWORD aus .env |

### 8.3 Loki-Queries (Log-Suche)

```bash
# Service-Logs via Loki API (Label compose_service, ROADMAP §1.1)
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"}' \
  --data-urlencode 'limit=50'

# Verfuegbare Labels
curl -s http://localhost:3100/loki/api/v1/labels

# Verfuegbare Services (compose_service = Alloy-Target-Label)
curl -s "http://localhost:3100/loki/api/v1/label/compose_service/values"
```

### 8.4 Loki-Labels

| Service | Label `compose_service=` (ROADMAP §1.1) | Container-Name |
|---------|----------------------------------------|----------------|
| Frontend | `el-frontend` | `automationone-frontend` |
| Server | `el-servador` | `automationone-server` |
| MQTT Broker | `mqtt-broker` | `automationone-mqtt` |
| PostgreSQL | `postgres` | `automationone-postgres` |
| ESP32 Serial Logger | `esp32-serial-logger` | `automationone-esp32-serial` |

### 8.5 Prometheus-Metriken

```bash
# Server-Metriken
curl -s http://localhost:8000/api/v1/health/metrics

# Prometheus Targets pruefen
curl -s http://localhost:9090/api/v1/targets | python -m json.tool
```

### 8.6 Hardware-Profile (ESP32 Serial Logger)

```bash
# Hardware-Profile starten (ESP32 Serial Logger via TCP-Bridge)
docker compose --profile hardware up -d

# Hardware-Profile stoppen
docker compose --profile hardware down

# ESP32 Serial Logs
docker logs automationone-esp32-serial --tail=100 -f
```

**Voraussetzung:** socat TCP-Bridge muss auf dem Host laufen (WSL2: `socat TCP-LISTEN:3333,fork,reuseaddr,bind=0.0.0.0 /dev/ttyUSB0,raw,echo=0,b115200,local`)

**ENV-Variablen (.env):**

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `ESP32_SERIAL_HOST` | `host.docker.internal` | TCP-Bridge Host |
| `ESP32_SERIAL_PORT` | `3333` | TCP-Bridge Port |
| `ESP32_DEVICE_ID` | `esp32-xiao-01` | Device-ID fuer Log-Labels |
| `ESP32_LOG_FORMAT` | `structured` | Log-Format (structured/raw) |
| `ESP32_RECONNECT_DELAY` | `5` | Reconnect-Delay in Sekunden |

---

## 9. Wichtige Pfade

| Komponente | Pfad |
|------------|------|
| **Server Main** | `El Servador/god_kaiser_server/src/main.py` |
| **Server Config** | `El Servador/god_kaiser_server/src/core/config.py` |
| **Environment** | `.env` (Projektroot) |
| **Server Logs** | `logs/server/god_kaiser.log` (Docker Bind-Mount) |
| **MQTT Logs** | `docker compose logs mqtt-broker` oder Loki `compose_service=mqtt-broker` (kein Bind-Mount) |
| **Frontend Logs** | Loki `compose_service=el-frontend` / `docker compose logs el-frontend` (stdout only, kein Bind-Mount) |
| **PostgreSQL Logs** | `docker compose logs postgres` oder Loki `compose_service=postgres` (kein Bind-Mount; logging_collector=off) |
| **ESP32 Logs** | `logs/esp32/` (manuell) |
| **Session Logs** | `logs/current/` (via session.sh) |
| **ESP32 Main** | `El Trabajante/src/main.cpp` |
| **ESP32 Config** | `El Trabajante/platformio.ini` |
| **MQTT Protocol Doc** | `El Trabajante/docs/Mqtt_Protocoll.md` |
| **Wokwi Config** | `El Trabajante/wokwi.toml` |
| **Docker Compose** | `docker-compose.yml` |
| **PostgreSQL Config** | `docker/postgres/postgresql.conf` |
| **Mosquitto Config** | `docker/mosquitto/mosquitto.conf` |
| **Loki Config** | `docker/loki/loki-config.yml` |
| **Alloy Config** | `docker/alloy/config.alloy` (native River syntax) |
| **Prometheus Config** | `docker/prometheus/prometheus.yml` |
| **Grafana Provisioning** | `docker/grafana/provisioning/` |
| **Session Script** | `scripts/debug/start_session.sh` (v4.0) |
| **Playwright E2E Config** | `El Frontend/playwright.config.ts` |
| **Playwright E2E Report** | `logs/frontend/playwright/playwright-report/` |
| **Playwright E2E test-results** | `logs/frontend/playwright/test-results/` |
| **MCP Server Config** | `.mcp.json` (Projektroot, git-committed) |
| **Serena LSP Config** | `.serena/project.yml` (gitignored, lokale LSP-Config für Python/TypeScript/C++) |

### 9.1 Playwright (E2E + MCP für Agenten)

**E2E-Tests (Befehle):**
- Stack: `make e2e-up` / `make e2e-down` (docker-compose.e2e.yml)
- Tests: `npx playwright test` (aus `El Frontend/`) bzw. `make e2e-test`
- Base URL: `http://localhost:5173`
- Report nach Run: `logs/frontend/playwright/playwright-report/`

**Playwright MCP (Browser-Zugang für Agenten):**  
Wenn Cursor den Playwright MCP-Server nutzt (z. B. cursor-ide-browser), kann der Agent den Browser live inspizieren – DOM, Console, Network, Screenshots. Tools: `browser_navigate`, `browser_snapshot`, `browser_console_messages`, `browser_network_requests`. Frontend muss laufen (`http://localhost:5173`). Details: `docs/plans/Debug.md` Sektion „Playwright MCP“.

---

*Erstellt: 2026-02-02 | Aktualisiert: 2026-02-25 | AutomationOne Debug-Operations-Reference*
