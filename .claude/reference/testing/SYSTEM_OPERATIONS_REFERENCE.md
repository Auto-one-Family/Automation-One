# SYSTEM_OPERATIONS_REFERENCE.md

> **Version:** 1.0 | **Erstellt:** 2026-02-02
> **Zweck:** Vollständige Befehls-Referenz für Debug-Operations-Agent

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

#### Server starten

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

#### Server stoppen

```bash
# Graceful Shutdown (empfohlen)
# In Terminal: Ctrl+C

# Oder per Signal
kill -SIGTERM <PID>

# PID finden
ps aux | grep uvicorn
# Windows:
tasklist | findstr uvicorn
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
// /health
{
  "success": true,
  "status": "healthy",
  "version": "2.0.0",
  "environment": "development",
  "mqtt_connected": true,
  "uptime_seconds": 3600
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

#### Log-Dateien

| Datei | Inhalt |
|-------|--------|
| `logs/god_kaiser.log` | Haupt-Anwendungs-Log (JSON, rotiert) |
| `logs/mosquitto.log` | MQTT-Broker-Log |

#### Logs lesen

```bash
# Letzte 100 Zeilen
tail -100 "El Servador/god_kaiser_server/logs/god_kaiser.log"

# Live-Stream
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"

# Nur Fehler
grep -E "ERROR|CRITICAL" "El Servador/god_kaiser_server/logs/god_kaiser.log"

# MQTT-Events
grep "mqtt" "El Servador/god_kaiser_server/logs/god_kaiser.log"

# Heartbeats filtern (oft zu viel Output)
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log" | grep -v "heartbeat"
```

#### PowerShell (Windows)

```powershell
# Letzte 50 Zeilen
Get-Content "El Servador/god_kaiser_server/logs/god_kaiser.log" -Tail 50

# Live-Stream
Get-Content "El Servador/god_kaiser_server/logs/god_kaiser.log" -Tail 100 -Wait

# JSON parsen
Get-Content "logs/god_kaiser.log" | ConvertFrom-Json |
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

```bash
# Alle Topics beobachten
mosquitto_sub -h localhost -t "kaiser/#" -v

# Nur Heartbeats
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v

# Nur Sensor-Daten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v

# Nur Actuator-Status
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/status" -v

# Nur Alerts
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/alert" -v

# Nur Fehler
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/error" -v

# Bestimmtes ESP
mosquitto_sub -h localhost -t "kaiser/god/esp/ESP_XXXXX/#" -v

# Broadcasts
mosquitto_sub -h localhost -t "kaiser/broadcast/#" -v
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

### 5.1 Flash-Operationen

```bash
# Projekt-Verzeichnis
cd "El Trabajante"

# Build (ESP32 Dev Board)
pio run -e esp32_dev

# Build (XIAO ESP32-C3)
pio run -e seeed_xiao_esp32c3

# Build (Wokwi Simulation)
pio run -e wokwi_simulation

# Flash/Upload
pio run -e esp32_dev -t upload

# Flash komplett löschen (NVS + Firmware)
pio run -e esp32_dev -t erase

# Build + Upload in einem
pio run -e esp32_dev -t upload
```

### 5.2 Monitoring

```bash
# Serial Monitor
cd "El Trabajante"
pio device monitor -b 115200 -e esp32_dev

# Mit Filter
pio device monitor -b 115200 -e esp32_dev --filter time

# Alle in einem: Erase + Flash + Monitor
pio run -e esp32_dev -t erase && \
pio run -e esp32_dev -t upload && \
pio device monitor -b 115200 -e esp32_dev
```

### 5.3 Wokwi-Simulation

```bash
cd "El Trabajante"

# Build für Wokwi
pio run -e wokwi_simulation

# Wokwi starten
wokwi-cli run --timeout 60000

# Mit Test-Szenario
wokwi-cli run --timeout 60000 --scenario tests/wokwi/boot_test.yaml
```

### 5.4 NVS-Operationen (Programmatisch)

Die NVS-Operationen erfolgen über die Firmware oder Boot-Button:

| Aktion | Methode |
|--------|---------|
| Factory Reset | Boot-Button 10s halten |
| NVS Erase | `pio run -e esp32_dev -t erase` |
| Config Reset | Via MQTT System-Command: `{"command": "reset_config"}` |

---

## 6. Kombinierte Workflows

### 6.1 Neues ESP komplett registrieren

```bash
# 1. ESP flashen
cd "El Trabajante"
pio run -e esp32_dev -t upload

# 2. Monitor öffnen (in neuem Terminal)
pio device monitor -b 115200

# 3. Warten auf Heartbeat (ESP sendet automatisch)
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v

# 4. ESP sollte als "pending" erscheinen
curl http://localhost:8000/api/v1/esp/devices/pending

# 5. ESP genehmigen
curl -X POST http://localhost:8000/api/v1/esp/devices/ESP_XXXXX/approve \
  -H "Content-Type: application/json" \
  -d '{"approved_by": "admin"}'

# 6. Zone zuweisen
curl -X POST http://localhost:8000/api/v1/zone/devices/ESP_XXXXX/assign \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "greenhouse_1", "zone_name": "Gewächshaus 1"}'

# 7. Sensoren konfigurieren
curl -X POST http://localhost:8000/api/v1/sensors/ESP_XXXXX/4 \
  -H "Content-Type: application/json" \
  -d '{"sensor_type": "DS18B20", "name": "Temperatur", "enabled": true}'

# 8. Aktoren konfigurieren
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5 \
  -H "Content-Type: application/json" \
  -d '{"actuator_type": "pump", "name": "Pumpe", "enabled": true}'
```

---

### 6.2 Altes ESP komplett entfernen

```bash
# 1. Alle Aktoren ausschalten
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/command \
  -H "Content-Type: application/json" \
  -d '{"command": "OFF"}'

# 2. ESP über API löschen (löscht auch Configs)
curl -X DELETE http://localhost:8000/api/v1/esp/devices/ESP_XXXXX

# 3. Alte Daten bereinigen (optional)
sqlite3 "El Servador/god_kaiser_server/god_kaiser_dev.db" \
  "DELETE FROM sensor_data WHERE esp_id NOT IN (SELECT id FROM esp_devices);"

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

# 2. Datenbank löschen
rm "El Servador/god_kaiser_server/god_kaiser_dev.db"

# 3. Logs löschen (optional)
rm -rf "El Servador/god_kaiser_server/logs/"*

# 4. Mosquitto Retained Messages löschen (alle)
mosquitto_pub -h localhost -t "kaiser/#" -r -n

# 5. Server neu starten (erstellt neue DB)
cd "El Servador/god_kaiser_server"
poetry run uvicorn src.main:app --reload

# 6. ESP32s: Factory Reset (Boot-Button 10s)
# Oder: Flash erase
cd "El Trabajante"
pio run -e esp32_dev -t erase
pio run -e esp32_dev -t upload
```

---

### 6.4 Debug-Session starten

```bash
# Terminal 1: Server mit Debug-Logs
cd "El Servador/god_kaiser_server"
LOG_LEVEL=DEBUG poetry run uvicorn src.main:app --reload

# Terminal 2: MQTT-Traffic beobachten
mosquitto_sub -h localhost -t "kaiser/#" -v | ts '[%Y-%m-%d %H:%M:%S]'

# Terminal 3: ESP Serial Monitor
cd "El Trabajante"
pio device monitor -b 115200

# Terminal 4: Server-Logs (Errors only)
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log" | grep -E "ERROR|WARNING"

# Schnell-Check: Health
curl -s http://localhost:8000/health | jq

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
mosquitto_sub -h localhost -t "kaiser/god/esp/MOCK_ID/#" -v

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
curl -s http://localhost:8000/health | jq '.status'

# MQTT erreichbar?
mosquitto_pub -h localhost -t "test" -m "ping" && echo "OK"

# DB-Verbindung?
sqlite3 "El Servador/god_kaiser_server/god_kaiser_dev.db" "SELECT 1;"

# ESP32 sendet?
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -C 1

# Letzte Fehler
grep "ERROR" "El Servador/god_kaiser_server/logs/god_kaiser.log" | tail -10
```

---

## 8. Wichtige Pfade

| Komponente | Pfad |
|------------|------|
| **Server Main** | `El Servador/god_kaiser_server/src/main.py` |
| **Server Config** | `El Servador/god_kaiser_server/src/core/config.py` |
| **Server .env** | `El Servador/god_kaiser_server/.env` |
| **Server Logs** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **SQLite DB** | `El Servador/god_kaiser_server/god_kaiser_dev.db` |
| **ESP32 Main** | `El Trabajante/src/main.cpp` |
| **ESP32 Config** | `El Trabajante/platformio.ini` |
| **MQTT Protocol Doc** | `El Trabajante/docs/Mqtt_Protocoll.md` |
| **Wokwi Config** | `El Trabajante/wokwi.toml` |

---

*Erstellt: 2026-02-02 | AutomationOne Debug-Operations-Reference*
