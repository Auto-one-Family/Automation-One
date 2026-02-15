# Server-Debug Infrastruktur-Analyse

**Erstellt:** 2026-02-04
**Zweck:** Vollständige Dokumentation der server-debug Arbeitsumgebung
**Analyst:** Infrastruktur-Analyst Agent (verifiziert und erweitert)

---

## 1. Server-Log Format

### 1.1 JSON-Struktur

**Quelle:** [logging_config.py](El%20Servador/god_kaiser_server/src/core/logging_config.py)

```json
{
  "timestamp": "YYYY-MM-DD HH:MM:SS",
  "level": "INFO",
  "logger": "src.mqtt.handlers.sensor_handler",
  "message": "Sensor data saved: id=123, esp_id=ESP_12AB34CD, gpio=4",
  "module": "sensor_handler",
  "function": "handle_sensor_data",
  "line": 296,
  "request_id": "abc123-def456"
}
```

**Zusätzliche Felder (optional):**
- `exception`: Voller Traceback bei Fehlern (wenn `record.exc_info` vorhanden)
- `request_id`: Request-Correlation-ID (wenn gesetzt, sonst `-`)
- `extra`: Zusätzliche Felder aus `record.extra`

### 1.2 Log-Levels

| Level | Numerischer Wert | Verwendung |
|-------|------------------|------------|
| `DEBUG` | 10 | Handler-Details, Payload-Parsing, DB-Queries |
| `INFO` | 20 | Erfolgreiche Operationen, Startup-Meldungen |
| `WARNING` | 30 | Nicht-kritische Probleme, Low-Memory, Weak-WiFi |
| `ERROR` | 40 | Handler-Fehler, Validation-Fehler, DB-Fehler |
| `CRITICAL` | 50 | Security-Violations, Startup-Failures |

### 1.3 Logger-Namen-Konvention

**Pattern:** `src.{modul}.{submodul}.{komponente}`

| Logger-Name | Komponente | Handler-Datei |
|-------------|------------|---------------|
| `src.mqtt.handlers.sensor_handler` | Sensor-Daten | sensor_handler.py |
| `src.mqtt.handlers.heartbeat_handler` | Heartbeat/Discovery | heartbeat_handler.py |
| `src.mqtt.handlers.actuator_handler` | Actuator-Status | actuator_handler.py |
| `src.mqtt.handlers.config_handler` | Config-Response | config_handler.py |
| `src.mqtt.handlers.lwt_handler` | LWT (Offline-Detection) | lwt_handler.py |
| `src.mqtt.handlers.error_handler` | ESP32 Error-Events | error_handler.py |
| `src.mqtt.handlers.zone_ack_handler` | Zone-Assignment-ACK | zone_ack_handler.py |
| `src.mqtt.handlers.subzone_ack_handler` | Subzone-ACK | subzone_ack_handler.py |
| `src.mqtt.handlers.discovery_handler` | ESP32-Discovery | discovery_handler.py |
| `src.services.maintenance.service` | Maintenance-Jobs | maintenance/service.py |
| `src.services.maintenance.jobs.sensor_health` | Sensor-Timeout-Checks | maintenance/jobs/sensor_health.py |
| `src.websocket.manager` | WebSocket-Broadcasts | websocket/manager.py |
| `src.mqtt.subscriber` | MQTT-Routing | subscriber.py |
| `src.mqtt.client` | MQTT-Verbindung | client.py |
| `src.db.session` | Database-Sessions | db/session.py |
| `apscheduler.executors.default` | Scheduled Jobs | APScheduler-Library |

### 1.4 Timestamp-Format

- **Format:** `%Y-%m-%d %H:%M:%S` (definiert in logging_config.py:117)
- **Beispiel:** `2026-02-02 21:51:27`
- **Timezone:** Server-Lokalzeit (konfigurationsabhängig)

### 1.5 Log-Rotation

**Konfiguration aus settings:**
- `file_path`: `logs/god_kaiser.log`
- `file_max_bytes`: Log-Rotation bei Größenüberschreitung
- `file_backup_count`: Anzahl der Backup-Dateien

---

## 2. MQTT-Handler

### 2.1 Handler-Inventar

| Handler | Datei | Topic-Pattern | QoS | Beschreibung |
|---------|-------|---------------|-----|--------------|
| sensor_handler | sensor_handler.py | `kaiser/{id}/esp/+/sensor/+/data` | 1 | Sensor-Rohdaten |
| actuator_handler | actuator_handler.py | `kaiser/{id}/esp/+/actuator/+/status` | 1 | Actuator-Status |
| actuator_response_handler | actuator_response_handler.py | `kaiser/{id}/esp/+/actuator/+/response` | 1 | Command-Response |
| actuator_alert_handler | actuator_alert_handler.py | `kaiser/{id}/esp/+/actuator/+/alert` | 1 | Actuator-Alerts |
| heartbeat_handler | heartbeat_handler.py | `kaiser/{id}/esp/+/system/heartbeat` | 0 | Heartbeat + Discovery |
| config_handler | config_handler.py | `kaiser/{id}/esp/+/config_response` | 2 | Config-ACK |
| zone_ack_handler | zone_ack_handler.py | `kaiser/{id}/esp/+/zone/ack` | 1 | Zone-Assignment-ACK |
| subzone_ack_handler | subzone_ack_handler.py | `kaiser/{id}/esp/+/subzone/ack` | 1 | Subzone-ACK |
| lwt_handler | lwt_handler.py | `kaiser/{id}/esp/+/system/will` | 1 | LWT (Offline-Detection) |
| error_handler | error_handler.py | `kaiser/{id}/esp/+/system/error` | 1 | ESP32 Error-Events |
| discovery_handler | discovery_handler.py | `kaiser/{id}/discovery/esp32_nodes` | 1 | Legacy Discovery |

### 2.2 Handler-Log-Patterns

#### sensor_handler.py

| Status | Log-Pattern | Code-Location |
|--------|-------------|---------------|
| SUCCESS | `Sensor data saved: id={id}, esp_id={esp_id}, gpio={gpio}, processing_mode={mode}` | :295-297 |
| WARN_CONFIG_MISS | `Sensor config not found: esp_id={esp_id}, gpio={gpio}, type={type}. Saving data without config.` | :197-200 |
| FAIL_PARSE | `[{ValidationErrorCode}] Failed to parse sensor data topic: {topic}` | :109-112 |
| FAIL_VALIDATION | `[{error_code}] Invalid sensor data payload from {esp_id}: {error}` | :127-130 |
| FAIL_ESP_NOT_FOUND | `[{ConfigErrorCode.ESP_DEVICE_NOT_FOUND}] ESP device not found: {esp_id}` | :142-146 |
| FAIL_PI_ENHANCED | `[{ServiceErrorCode.OPERATION_TIMEOUT}] Pi-Enhanced processing failed` | :252-257 |
| FAIL_RESILIENCE | `[resilience] Sensor data handling blocked: {service_name} unavailable` | :357-360 |

#### heartbeat_handler.py

| Status | Log-Pattern | Code-Location |
|--------|-------------|---------------|
| SUCCESS | `Heartbeat processed: esp_id={esp_id}, uptime={uptime}s, heap_free={heap_free} bytes` | :240-244 |
| DISCOVERY | `New ESP discovered: {esp_id} (pending_approval)` | :379-384 |
| REDISCOVERY | `Device rediscovered: {device_id} (pending_approval again)` | :499 |
| APPROVED | `Device {esp_id} now online after approval` | :184 |
| WARN_LOW_MEMORY | `Low memory on {esp_id}: heap_free={heap_free} bytes` | :889-891 |
| WARN_WEAK_WIFI | `Weak WiFi signal on {esp_id}: rssi={wifi_rssi} dBm` | :894-897 |
| WARN_ERRORS | `Device {esp_id} reported {error_count} error(s)` | :900-903 |
| FAIL_VALIDATION | `[{error_code}] Invalid heartbeat payload from {esp_id}: {error}` | :106-109 |
| TIMEOUT | `Device {device_id} timed out. Last seen: {last_seen}` | :1023-1026 |

#### actuator_handler.py

| Status | Log-Pattern | Code-Location |
|--------|-------------|---------------|
| SUCCESS | `Actuator status updated: id={id}, esp_id={esp_id}, gpio={gpio}, state={state}, value={value}` | :182-185 |
| ERROR_REPORTED | `Actuator error reported: esp_id={esp_id}, gpio={gpio}, error={error}` | :189-192 |
| FAIL_PARSE | `[{ValidationErrorCode}] Failed to parse actuator status topic: {topic}` | :74-77 |
| FAIL_ESP_NOT_FOUND | `[{ConfigErrorCode.ESP_DEVICE_NOT_FOUND}] ESP device not found: {esp_id}` | :106-110 |

#### config_handler.py

| Status | Log-Pattern | Code-Location |
|--------|-------------|---------------|
| SUCCESS | `Config Response from {esp_id}: {config_type} ({count} items) - {message}` | :127-130 |
| PARTIAL | `Config PARTIAL SUCCESS on {esp_id}: {config_type} - {count} OK, {failed_count} failed` | :134-137 |
| FAIL | `Config FAILED on {esp_id}: {config_type} - {message} (Error: {error_code})` | :152-155 |
| FAIL_ITEM | `GPIO {gpio}: {error} - {detail}` | :140-142, :160-163 |

#### lwt_handler.py

| Status | Log-Pattern | Code-Location |
|--------|-------------|---------------|
| RECEIVED | `LWT received: ESP {esp_id} disconnected unexpectedly (reason: {reason})` | :82-85 |
| UPDATED | `Device {esp_id} marked offline via LWT` | :145 |
| ALREADY_OFFLINE | `Device {esp_id} already offline, LWT ignored` | :174 |
| UNKNOWN_DEVICE | `[{ConfigErrorCode.ESP_DEVICE_NOT_FOUND}] LWT for unknown device {esp_id}` | :103-106 |

#### error_handler.py

| Status | Log-Pattern | Code-Location |
|--------|-------------|---------------|
| SUCCESS | `Error event saved: id={id}, esp_id={esp_id}, error_code={code}, severity={severity}` | :180-183 |
| FAIL_VALIDATION | `[{error_code}] Invalid error event payload from {esp_id}: {error}` | :113-117 |
| FAIL_ESP_NOT_FOUND | `[{ConfigErrorCode.ESP_DEVICE_NOT_FOUND}] ESP device not found: {esp_id}` | :127-130 |

---

## 3. Error-Codes (Server: 5000-5699)

### 3.1 Ranges

| Range | Kategorie | Konstante | Beschreibung |
|-------|-----------|-----------|--------------|
| 5000-5099 | CONFIG_ERROR | `ConfigErrorCode` | ESP-Device, Config-Build |
| 5100-5199 | MQTT_ERROR | `MQTTErrorCode` | Publish, Connection |
| 5200-5299 | VALIDATION_ERROR | `ValidationErrorCode` | Payload-Validierung |
| 5300-5399 | DATABASE_ERROR | `DatabaseErrorCode` | Query, Connection |
| 5400-5499 | SERVICE_ERROR | `ServiceErrorCode` | Timeout, Dependencies |
| 5500-5599 | AUDIT_ERROR | `AuditErrorCode` | Audit-Logging |
| 5600-5699 | SEQUENCE_ERROR | `SequenceErrorCode` | Automation-Sequenzen |

### 3.2 Format im Log

```json
{
  "level": "ERROR",
  "logger": "src.mqtt.handlers.sensor_handler",
  "message": "[5001] ESP device not found: ESP_12AB34CD - ESP device not found in database"
}
```

**Pattern:** `[{error_code}] {kurze_beschreibung}: {kontext} - {lange_beschreibung}`

### 3.3 Häufige Server-Errors

| Code | Name | Log-Pattern |
|------|------|-------------|
| 5001 | `ESP_DEVICE_NOT_FOUND` | `[5001] ESP device not found: {esp_id}` |
| 5002 | `CONFIG_BUILD_FAILED` | `[5002] Failed to build configuration payload` |
| 5101 | `PUBLISH_FAILED` | `[5101] MQTT publish operation failed` |
| 5201 | `INVALID_ESP_ID` | `[5201] Invalid ESP device ID format` |
| 5202 | `INVALID_GPIO` | `[5202] Invalid GPIO pin number` |
| 5205 | `MISSING_REQUIRED_FIELD` | `[5205] Missing required field: {field}` |
| 5206 | `FIELD_TYPE_MISMATCH` | `[5206] Field '{field}' must be {type}` |
| 5301 | `QUERY_FAILED` | `[5301] Database query failed` |
| 5403 | `OPERATION_TIMEOUT` | `[5403] Service operation timed out` |
| 5640 | `SEQ_ACTUATOR_LOCKED` | `[5640] Actuator locked by another sequence` |

---

## 4. Startup-Sequenz

### 4.1 Erwartete Reihenfolge

**Quelle:** [main.py](El%20Servador/god_kaiser_server/src/main.py) - `lifespan()` Funktion

| Step | Log-Pattern | Code-Location |
|------|-------------|---------------|
| 0 | `God-Kaiser Server Starting...` | :93-95 |
| 0.1 | `Validating security configuration...` | :100 |
| 0.5 | `Initializing resilience patterns...` | :130 |
| 0.5.1 | `[resilience] Resilience patterns initialized` | :148-151 |
| 1 | `Initializing database...` | :155 |
| 1.1 | `Database initialized successfully` | :157 |
| 1.2 | `[resilience] Database circuit breaker initialized` | :165 |
| 2 | `Connecting to MQTT broker...` | :168 |
| 2.1 | `MQTT client connected successfully` | :178 |
| 3 | `Registering MQTT handlers...` | :182 |
| 3.1 | `Main event loop set for MQTT subscriber` | :193 |
| 3.2 | `Using KAISER_ID: {kaiser_id}` | :199-200 |
| 3.3 | `Registered {count} MQTT handlers` | :262 |
| 3.4 | `Initializing Central Scheduler...` | :265 |
| 3.4.1 | `Initializing SimulationScheduler...` | :271 |
| 3.4.2 | `Initializing MaintenanceService...` | :313 |
| 3.5 | `Mock-ESP recovery complete: {count} simulations restored` | :331 |
| 3.6 | `Sensor type auto-registration: {new} new, {existing} existing` | :348-352 |
| 3.7 | `Sensor schedule recovery complete: {count} jobs` | :381-383 |
| 4 | `Subscribing to MQTT topics...` | :391 |
| 4.1 | `MQTT subscriptions complete` | :393 |
| 5 | `Initializing WebSocket Manager...` | :398 |
| 5.1 | `WebSocket Manager initialized` | :402 |
| 6 | `Initializing services...` | :405 |
| 6.1 | `Services initialized successfully` | :481 |
| FINAL | `God-Kaiser Server Started Successfully` | :494 |

### 4.2 Failure-Patterns bei Startup

| Fehler | Log-Pattern | Ursache |
|--------|-------------|---------|
| Security | `SECURITY CRITICAL: Using default JWT secret key in production!` | JWT_SECRET_KEY nicht gesetzt |
| Database | `Startup failed: {error}` + Exception-Traceback | PostgreSQL nicht erreichbar |
| MQTT | `Failed to connect to MQTT broker during startup` | Broker nicht erreichbar |
| Resilience | `[resilience] Status: healthy=False` | Circuit-Breaker offen |

---

## 5. Handler-Registration

### 5.1 Registrierungs-Mechanismus

**Quelle:** [subscriber.py](El%20Servador/god_kaiser_server/src/mqtt/subscriber.py)

```python
# main.py:203-261
_subscriber_instance.register_handler(
    f"kaiser/{kaiser_id}/esp/+/sensor/+/data",
    sensor_handler.handle_sensor_data
)
```

### 5.2 Topic-Subscriptions

| Topic-Pattern | Handler | QoS |
|---------------|---------|-----|
| `kaiser/{id}/esp/+/sensor/+/data` | `sensor_handler.handle_sensor_data` | 1 |
| `kaiser/{id}/esp/+/actuator/+/status` | `actuator_handler.handle_actuator_status` | 1 |
| `kaiser/{id}/esp/+/actuator/+/response` | `actuator_response_handler.handle_actuator_response` | 1 |
| `kaiser/{id}/esp/+/actuator/+/alert` | `actuator_alert_handler.handle_actuator_alert` | 1 |
| `kaiser/{id}/esp/+/system/heartbeat` | `heartbeat_handler.handle_heartbeat` | 0 |
| `kaiser/{id}/discovery/esp32_nodes` | `discovery_handler.handle_discovery` | 1 |
| `kaiser/{id}/esp/+/config_response` | `config_handler.handle_config_ack` | 2 |
| `kaiser/{id}/esp/+/zone/ack` | `zone_ack_handler.handle_zone_ack` | 1 |
| `kaiser/{id}/esp/+/subzone/ack` | `subzone_ack_handler.handle_subzone_ack` | 1 |
| `kaiser/{id}/esp/+/system/will` | `lwt_handler.handle_lwt` | 1 |
| `kaiser/{id}/esp/+/system/error` | `error_handler.handle_error_event` | 1 |

### 5.3 Registration-Logs

```
INFO - Registered handler for pattern: kaiser/god/esp/+/sensor/+/data
INFO - Registered handler for pattern: kaiser/god/esp/+/actuator/+/status
...
INFO - Registered 11 MQTT handlers
```

---

## 6. Database-Operationen

### 6.1 Session-Pattern

**Quelle:** [db/session.py](El%20Servador/god_kaiser_server/src/db/session.py)

```python
async with resilient_session() as session:
    esp_repo = ESPRepository(session)
    # ... operations
    await session.commit()
```

### 6.2 Repository-Logging

Repositories loggen typischerweise NICHT direkt - Handler loggen Ergebnisse:

```python
# sensor_handler.py:295-297
logger.info(
    f"Sensor data saved: id={sensor_data.id}, esp_id={esp_id_str}, "
    f"gpio={gpio}, processing_mode={processing_mode}"
)
```

### 6.3 Resilience-Pattern

**Circuit-Breaker für Database:**

```python
try:
    async with resilient_session() as session:
        # ...
except ServiceUnavailableError as e:
    logger.warning(
        f"[resilience] Sensor data handling blocked: {e.service_name} unavailable"
    )
```

---

## 7. WebSocket-Events

### 7.1 Event-Types

**Quelle:** [websocket/manager.py](El%20Servador/god_kaiser_server/src/websocket/manager.py)

| Event-Type | Handler | Beschreibung |
|------------|---------|--------------|
| `sensor_data` | sensor_handler | Sensor-Wert-Updates |
| `actuator_status` | actuator_handler | Actuator-Zustandsänderungen |
| `esp_health` | heartbeat_handler | Device-Status (online/offline) |
| `device_discovered` | heartbeat_handler | Neues Gerät entdeckt |
| `device_rediscovered` | heartbeat_handler | Gerät nach Rejection |
| `config_response` | config_handler | Config-ACK von ESP |
| `error_event` | error_handler | ESP32 Fehler-Events |

### 7.2 Broadcast-Logs

```
DEBUG - WebSocket broadcast completed for sensor_data: ESP_12AB34CD
WARNING - Failed to broadcast sensor data via WebSocket: {error}
```

---

## 8. Maintenance-Jobs

### 8.1 Scheduled Jobs (APScheduler)

| Job | Intervall | Log-Pattern |
|-----|-----------|-------------|
| `_health_check_esps` | 1 min | `[monitor] health_check_esps: {checked} checked, {online} online, {timed_out} timed out` |
| `_health_check_mqtt` | 30 sec | `Job "MaintenanceService._health_check_mqtt" executed successfully` |
| `_check_sensor_health` | 1 min | `Sensor health check: No enabled sensors found` |

### 8.2 APScheduler-Logs

```json
{"logger": "apscheduler.executors.default", "message": "Running job \"MaintenanceService._health_check_esps (trigger: interval[0:01:00])\""}
{"logger": "apscheduler.executors.default", "message": "Job \"MaintenanceService._health_check_esps\" executed successfully"}
```

---

## 9. Zusammenfassung für Agent-Optimierung

### 9.1 Der server-debug Agent braucht:

**Input:**
1. `logs/current/STATUS.md` - Session-Kontext (Mode, Focus, Zeit)
2. `logs/current/god_kaiser.log` - Primäre Analyse-Quelle
3. `.claude/reference/errors/ERROR_CODES.md` - Bei Error-Code-Lookup

**Wissen:**
1. JSON-Log-Format (eine Zeile = ein JSON-Objekt)
2. Logger-Namen → Handler-Zuordnung (Tabelle 2.1)
3. Error-Code Ranges 5000-5699 (Sektion 3)
4. Startup-Sequenz (Sektion 4)

**Pattern-Matching:**

| Feld | Bedeutung |
|------|-----------|
| `"level"` | Schweregrad (DEBUG < INFO < WARNING < ERROR < CRITICAL) |
| `"logger"` | Komponenten-Zuordnung |
| `"message"` | Menschenlesbare Details |
| `"line"` | Code-Location für Debugging |
| `"exception"` | Voller Traceback bei Fehlern |

### 9.2 Typische Analyse-Szenarien

| Szenario | Filter-Strategie |
|----------|------------------|
| Startup-Probleme | `"level": "ERROR"` oder `"level": "CRITICAL"` in ersten 100 Zeilen |
| Handler-Fehler | `"logger": "src.mqtt.handlers.*"` + `"level": "ERROR"` |
| ESP-spezifisch | Grep nach `esp_id` in Message |
| DB-Probleme | `"logger": "src.db.*"` oder `[resilience]` in Message |
| Timeout-Issues | `[5403]` oder `timed out` in Message |

### 9.3 Kritische Log-Patterns

```
# Startup-Failure
"level": "CRITICAL"

# Security-Issue
"SECURITY CRITICAL"

# Circuit-Breaker offen
"[resilience]" + "unavailable"

# Device-Timeout
"Device {esp_id} timed out"

# Handler-Failure
"[{5xxx}]" + "Failed"
```

---

## 10. Referenzen

| Datei | Pfad | Beschreibung |
|-------|------|--------------|
| logging_config.py | El Servador/god_kaiser_server/src/core/logging_config.py | Log-Format-Definition |
| main.py | El Servador/god_kaiser_server/src/main.py | Startup-Sequenz, Handler-Registration |
| subscriber.py | El Servador/god_kaiser_server/src/mqtt/subscriber.py | MQTT-Routing |
| sensor_handler.py | El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py | Sensor-Daten-Handler |
| heartbeat_handler.py | El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py | Heartbeat + Discovery |
| actuator_handler.py | El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py | Actuator-Status |
| config_handler.py | El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py | Config-Response |
| lwt_handler.py | El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py | LWT (Offline-Detection) |
| error_handler.py | El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py | ESP32 Error-Events |
| ERROR_CODES.md | .claude/reference/errors/ERROR_CODES.md | Error-Code-Referenz |
| MQTT_TOPICS.md | .claude/reference/api/MQTT_TOPICS.md | Topic-Referenz |

---

*Generiert fuer die Spezialisierung des server-debug Agenten.*

---

## ANHANG: Zusaetzliche Handler-Details (Verifizierung 2026-02-04)

### A.1 Actuator-Alert Severity-Mapping (actuator_alert_handler.py:45-50)

```python
ALERT_SEVERITY = {
    "emergency_stop": "critical",
    "runtime_protection": "warning",
    "safety_violation": "critical",
    "hardware_error": "error",
}
```

### A.2 Heartbeat-Timeout-Konstante (heartbeat_handler.py:44)

```python
HEARTBEAT_TIMEOUT_SECONDS = 300  # 5 Minuten
```

### A.3 Handler-Timeout (subscriber.py:254-255)

MQTT-Handler haben ein 30-Sekunden-Timeout:
```python
result = future.result(timeout=30.0)
```

### A.4 Zusaetzliche WebSocket-Events (aus Handler-Analyse)

| Event-Type | Handler | Zusaetzliche Felder |
|------------|---------|---------------------|
| `actuator_response` | actuator_response_handler | esp_id, gpio, command, value, success, message, correlation_id |
| `actuator_alert` | actuator_alert_handler | esp_id, gpio, alert_type, severity, category, troubleshooting, recoverable, user_action_required |
| `zone_assignment` | zone_ack_handler | esp_id, status, zone_id, master_zone_id, timestamp, message |
| `subzone_assignment` | subzone_ack_handler | type, device_id, data (subzone_id, status, timestamp, error_code, message) |

### A.5 Grep-Patterns fuer Debug-Agent

```bash
# Alle Server-Errors (5xxx)
grep -E "\[5[0-9]{3}\]" god_kaiser.log

# Resilience-Events
grep "\[resilience\]" god_kaiser.log

# LWT-Events (Instant Offline)
grep "LWT" god_kaiser.log

# Aktuator-Alerts (Critical)
grep "ACTUATOR ALERT" god_kaiser.log

# Handler-Timeouts
grep -i "timed out" god_kaiser.log

# Startup-Sequence
grep -E "(God-Kaiser Server|Initializing|initialized)" god_kaiser.log | head -40

# ESP-spezifisch (ersetze ESP_ID)
grep "ESP_12AB34CD" god_kaiser.log

# Health-Warnungen
grep -E "(Low memory|Weak WiFi|reported.*error)" god_kaiser.log
```

### A.6 Code-Locations Schnellreferenz

| Handler | Datei (relativ zu src/) | Hauptfunktion |
|---------|-------------------------|---------------|
| Sensor | mqtt/handlers/sensor_handler.py | handle_sensor_data() |
| Actuator Status | mqtt/handlers/actuator_handler.py | handle_actuator_status() |
| Actuator Response | mqtt/handlers/actuator_response_handler.py | handle_actuator_response() |
| Actuator Alert | mqtt/handlers/actuator_alert_handler.py | handle_actuator_alert() |
| Heartbeat | mqtt/handlers/heartbeat_handler.py | handle_heartbeat() |
| Config ACK | mqtt/handlers/config_handler.py | handle_config_ack() |
| LWT | mqtt/handlers/lwt_handler.py | handle_lwt() |
| Error Event | mqtt/handlers/error_handler.py | handle_error_event() |
| Zone ACK | mqtt/handlers/zone_ack_handler.py | handle_zone_ack() |
| Subzone ACK | mqtt/handlers/subzone_ack_handler.py | handle_subzone_ack() |
| Discovery | mqtt/handlers/discovery_handler.py | handle_discovery() |

---

**Ende der Analyse (Verifiziert und erweitert am 2026-02-04)**
