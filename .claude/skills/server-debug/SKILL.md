---
name: server-debug
description: "Server-Log Analyse für God-Kaiser Server (FastAPI/Python). Analysiert JSON-Logs, MQTT-Handler-Verhalten, Startup-Sequenz, Error-Codes 5000-5699, Database-Operationen, WebSocket-Events, Resilience-System, Exception-Hierarchie, Datenflüsse."
---

# Server Debug - Skill Dokumentation

> **Fokus:** FastAPI Backend Log-Analyse und Fehlerpfad-Diagnose
> **Log-Quelle:** `logs/server/god_kaiser.log` (JSON, via Docker Bind-Mount `./logs/server/`)

---

## 1. Server-Modulstruktur

```
El Servador/god_kaiser_server/src/
├── main.py                    # Entry-Point (710 Zeilen, Lifespan)
├── api/v1/                    # 14 Sub-Router + websocket/
├── core/                      # Config, Exceptions, Resilience, Logging, Scheduler
├── db/models/                 # 19 Tabellen in 15 Model-Dateien
├── db/repositories/           # 15 Repositories (BaseRepository-Pattern)
├── middleware/                 # RequestIdMiddleware
├── mqtt/                      # Client, Subscriber, Publisher, Offline-Buffer
│   └── handlers/              # 13 Handler + base_handler
├── schemas/                   # Pydantic Schemas
├── sensors/                   # Sensor-Processing-Libraries (Pi-Enhanced)
├── services/                  # 23 Services + logic/ + maintenance/ + simulation/
├── utils/                     # Data/MQTT/Network/Time Helpers
└── websocket/                 # WebSocketManager Singleton
```

**Zählung:** ~120 Python-Dateien, 14 API-Router, 13 MQTT-Handler, 23+ Services, 19 DB-Tabellen, 15 Repos

---

## 2. Startup-Sequenz (20+ Steps)

| Step | Log-Pattern | Fehlschlag-Impact |
|------|-------------|-------------------|
| 0 | `God-Kaiser Server Starting...` | - |
| 0.1 | `Validating security configuration...` | Server-Exit (Prod + Default-Key) |
| 0.5 | `Initializing resilience patterns...` | Kein Circuit Breaker |
| 0.5.1 | `external_api breaker registered` | API ungeschützt |
| 1 | `Initializing database...` | Kein DB-Zugriff |
| 1.1 | `Database initialized successfully` | - |
| 1.2 | `[resilience] Database circuit breaker initialized` | DB ungeschützt |
| 2 | `Connecting to MQTT broker...` | Auto-Reconnect (nicht-fatal) |
| 2.1 | `MQTT client connected successfully` | - |
| 3 | `Registering MQTT handlers...` | - |
| 3.1 | `Main event loop set for MQTT subscriber` | - |
| 3.2 | `Using KAISER_ID: {id}` | - |
| 3.3 | `Registered {count} MQTT handlers` | - |
| 3.4 | `Central Scheduler started` | Kein APScheduler |
| 3.4.1 | `SimulationScheduler initialized` | Keine Mock-ESPs |
| 3.4.2 | `MaintenanceService initialized and started` | Keine Maintenance |
| 3.5 | `Mock-ESP recovery complete: {n} simulations restored` | Mock-ESPs weg (non-fatal) |
| 3.6 | `Sensor type auto-registration: {n} new, {n} existing` | Defaults fehlen (non-fatal) |
| 3.7 | `Sensor schedule recovery complete: {n} jobs` | Scheduled inaktiv (non-fatal) |
| 4 | `Subscribing to MQTT topics...` / `MQTT subscriptions complete` | Topics fehlen |
| 5 | `Initializing WebSocket Manager...` | Kein Real-Time |
| 6 | `Initializing services...` | Logic/Safety/Actuator weg |
| 6.1 | `Services initialized successfully` | - |
| RES | `[resilience] Status: healthy={bool}` | - |
| FINAL | `God-Kaiser Server Started Successfully` | - |

**Shutdown:** Logic Scheduler → Logic Engine → SequenceExecutor → Maintenance → Mock-ESP → Scheduler → WS → MQTT Subscriber → MQTT Client → DB Engine

**Failure-Patterns:**

| Pattern | Bedeutung |
|---------|-----------|
| `SECURITY CRITICAL` | JWT-Secret nicht gesetzt → `.env` prüfen |
| `Startup failed:` + Exception | Kritischer Fehler → Traceback analysieren |
| `Failed to connect to MQTT` | Broker nicht erreichbar |
| `[resilience]` + `unavailable` | Circuit Breaker bereits offen |

---

## 3. Logging-System

### JSON-Log-Felder

```json
{
  "timestamp": "2026-02-04 14:30:45",
  "level": "INFO|WARNING|ERROR|CRITICAL",
  "logger": "src.mqtt.handlers.sensor_handler",
  "message": "Sensor data saved: id=123",
  "module": "sensor_handler",
  "function": "handle_sensor_data",
  "line": 296,
  "request_id": "abc123-def456",
  "exception": "Traceback ..."
}
```

**request_id:** UUID via `RequestIdMiddleware` für HTTP. MQTT-Handler: `request_id = "-"`.
**Noise-Reduction:** paho.mqtt, urllib3, asyncio, apscheduler (+ executors.default, scheduler) auf WARNING.
**Rotation:** 10 MB, 10 Backups (`LOG_FILE_MAX_BYTES`, `LOG_FILE_BACKUP_COUNT`).

### Logger→Handler-Zuordnung (21+)

| Logger | Verantwortung |
|--------|---------------|
| `src.main` | Startup, Shutdown, Lifespan |
| `src.mqtt.client` | MQTT-Verbindung, Reconnect, Circuit Breaker |
| `src.mqtt.subscriber` | Message-Routing, Handler-Dispatch |
| `src.mqtt.handlers.sensor_handler` | Sensor-Daten |
| `src.mqtt.handlers.heartbeat_handler` | Heartbeat, Discovery, Timeout |
| `src.mqtt.handlers.actuator_handler` | Actuator-Status |
| `src.mqtt.handlers.actuator_response_handler` | Command-Response |
| `src.mqtt.handlers.actuator_alert_handler` | Actuator-Alerts |
| `src.mqtt.handlers.config_handler` | Config-ACK |
| `src.mqtt.handlers.discovery_handler` | ESP32 Discovery |
| `src.mqtt.handlers.lwt_handler` | LWT Offline-Detection |
| `src.mqtt.handlers.error_handler` | ESP32 Error-Events |
| `src.mqtt.handlers.zone_ack_handler` | Zone-ACK |
| `src.mqtt.handlers.subzone_ack_handler` | Subzone-ACK |
| `src.mqtt.handlers.kaiser_handler` | Kaiser-Verarbeitung |
| `src.db.session` | DB-Sessions, Circuit Breaker |
| `src.websocket.manager` | WebSocket-Broadcasts |
| `src.core.exception_handlers` | Global Exception Handling |
| `src.services.maintenance.service` | Maintenance-Jobs |
| `src.services.logic_engine` | Logic-Rule-Evaluation |
| `src.services.logic_scheduler` | Timer-basierte Logic |
| `src.services.simulation.scheduler` | Mock-ESP-Simulation |

---

## 4. Resilience-System

### Circuit Breaker

| Breaker | Threshold | Recovery | Half-Open | Settings-Prefix |
|---------|-----------|----------|-----------|-----------------|
| **database** | 3 | 10s | 5s | `CIRCUIT_BREAKER_DB_*` |
| **mqtt** | 5 | 30s | 10s | `CIRCUIT_BREAKER_MQTT_*` |
| **external_api** | 5 | 60s | 15s | `CIRCUIT_BREAKER_API_*` |

State-Machine: `CLOSED → (failures >= threshold) → OPEN → (recovery) → HALF_OPEN → (success) → CLOSED`

### Retry-Konfiguration

| Setting | Default |
|---------|---------|
| `RETRY_MAX_ATTEMPTS` | 3 |
| `RETRY_BASE_DELAY` | 1.0s |
| `RETRY_MAX_DELAY` | 30.0s |
| `RETRY_EXPONENTIAL_BASE` | 2.0 |
| `RETRY_JITTER_ENABLED` | true |

### Timeout-Konfiguration

| Setting | Default |
|---------|---------|
| `TIMEOUT_MQTT_PUBLISH` | 5.0s |
| `TIMEOUT_DB_QUERY` | 5.0s |
| `TIMEOUT_DB_QUERY_COMPLEX` | 30.0s |
| `TIMEOUT_EXTERNAL_API` | 10.0s |
| `TIMEOUT_WEBSOCKET_SEND` | 2.0s |
| `TIMEOUT_SENSOR_PROCESSING` | 1.0s |

### Offline-Buffer

- Max 1000 Messages (`OFFLINE_BUFFER_MAX_SIZE`)
- Flush-Batch 50 (`OFFLINE_BUFFER_FLUSH_BATCH_SIZE`)
- Automatischer Flush bei Reconnect

### Log-Patterns Resilience

```bash
grep -i "\[resilience\]" logs/server/god_kaiser.log
grep "Circuit Breaker" logs/server/god_kaiser.log
grep "\[resilience\] Database" logs/server/god_kaiser.log
grep "\[resilience\] MQTT" logs/server/god_kaiser.log
```

| Log-Message | Bedeutung |
|-------------|-----------|
| `Database operation blocked by Circuit Breaker` | DB-Breaker OPEN → PostgreSQL prüfen |
| `MQTT publish blocked by Circuit Breaker` | MQTT-Breaker OPEN → Mosquitto prüfen |
| `CircuitBreaker reset on connect` | Service wieder verfügbar |

---

## 5. Exception-Hierarchie + Error-Codes

### Hierarchie

```
Exception
├── GodKaiserException → WARNING, JSON {"success": false, "error": {...}}
│   ├── ConfigError (5000-5099)
│   ├── MQTTError (5100-5199)
│   ├── ValidationError (5200-5299)
│   ├── DatabaseError (5300-5399)
│   ├── ServiceError (5400-5499)
│   ├── AuditError (5500-5599)
│   └── SequenceError (5600-5699)
└── Exception → ERROR + Stack Trace, "INTERNAL_ERROR"
```

**Wichtig:** `general_exception_handler` feuert → Bug gefunden! Stack Trace = Root Cause.

### Error-Code Ranges

| Range | Kategorie | Häufige Codes |
|-------|-----------|---------------|
| 5000-5099 | CONFIG | 5001 ESP_NOT_FOUND, 5007 ESP_OFFLINE |
| 5100-5199 | MQTT | 5104 CONNECTION_LOST, 5106 BROKER_UNAVAILABLE |
| 5200-5299 | VALIDATION | 5201 INVALID_ESP_ID, 5205 MISSING_FIELD |
| 5300-5399 | DATABASE | 5301 QUERY_FAILED, 5304 CONNECTION_FAILED |
| 5400-5499 | SERVICE | 5402 CIRCUIT_BREAKER_OPEN, 5403 TIMEOUT |
| 5500-5599 | AUDIT | 5501 AUDIT_LOG_FAILED |
| 5600-5699 | SEQUENCE | 5610 SEQ_ALREADY_RUNNING, 5640 ACTUATOR_LOCKED, 5642 SAFETY_BLOCKED |

Bei unbekanntem Code → `.claude/reference/errors/ERROR_CODES.md` konsultieren.

---

## 6. Middleware-Chain (LIFO)

| Position | Middleware | Funktion |
|----------|-----------|----------|
| 1 (zuerst) | `CORSMiddleware` | CORS-Validierung |
| 2 | `RequestIdMiddleware` | UUID-Tracking pro Request |
| 3 | Auth Dependencies | JWT-Token pro Endpoint |

---

## 7. Datenflüsse

**HTTP:** Client → CORS → RequestID → Router → Auth → Service → Repo → DB → Response (X-Request-ID)

**MQTT:** ESP32 → Broker → paho Client → Subscriber → ThreadPool → async Handler → Repo → DB → WS Broadcast → Frontend

**WebSocket:** Frontend → WS `/api/v1/ws/realtime` → WebSocketManager → subscribe(filters) → broadcast

**Startup:** uvicorn → lifespan() → Security → Resilience → DB → MQTT → Handlers → Scheduler → Simulation → Maintenance → Recovery → Subscribe → WS → Services → Ready

**Kritisch:** Async-Handler MÜSSEN im Main-Event-Loop laufen (`asyncio.run_coroutine_threadsafe()`).

---

## 8. Health-Endpoints

| Endpoint | Auth | Beschreibung |
|----------|------|-------------|
| `/api/v1/health/live` | Nein | Server-Prozess läuft? (immer 200) |
| `/api/v1/health/ready` | Nein | DB + MQTT connected? |
| `/api/v1/health/` | Nein | mqtt_connected Status |
| `/api/v1/health/detailed` | Ja | DB/MQTT/WS/System + Circuit Breaker |
| `/api/v1/health/esp` | Ja | ESP-Fleet (online/offline) |
| `/api/v1/health/metrics` | Nein | Prometheus-Format |

**Debug-Reihenfolge:** live → ready → detailed

---

## 9. Request-Tracing

1. Client sendet Request (mit/ohne `X-Request-ID` Header)
2. `RequestIdMiddleware` generiert UUID falls fehlend
3. UUID in ContextVar → alle Logs enthalten `request_id`
4. Response erhält `X-Request-ID` Header
5. MQTT-Handler: `request_id = "-"`, Korrelation über `esp_id`/`topic`

---

## 10. Grep-Patterns

```bash
# Errors & Criticals
grep '"level": "ERROR"' logs/server/god_kaiser.log
grep '"level": "CRITICAL"' logs/server/god_kaiser.log

# Circuit Breaker / Resilience
grep -i "circuit\|resilience" logs/server/god_kaiser.log

# Request tracen
grep "REQUEST_ID" logs/server/god_kaiser.log

# MQTT-bezogene Logs
grep -i "mqtt" logs/server/god_kaiser.log

# Unhandled Exceptions (Stack Traces)
grep -A 20 "Unhandled exception" logs/server/god_kaiser.log

# Startup-Sequenz
grep "God-Kaiser Server" logs/server/god_kaiser.log
grep "Registered.*MQTT handlers" logs/server/god_kaiser.log

# WebSocket
grep -iE "websocket|ws_manager|broadcast" logs/server/god_kaiser.log

# Sensor-Processing (Pi-Enhanced)
grep "pi_enhanced\|sensor.*process" logs/server/god_kaiser.log

# Logic-Engine
grep "logic.*evaluat\|logic.*trigger\|logic.*action" logs/server/god_kaiser.log

# Sequence-Execution
grep "sequence.*start\|sequence.*stop\|sequence.*step" logs/server/god_kaiser.log

# Maintenance-Jobs
grep "maintenance\|cleanup\|retention" logs/server/god_kaiser.log

# Mock-ESP-Simulation
grep "simulation\|mock.*esp\|mock.*actuator" logs/server/god_kaiser.log

# Safety-Events
grep "safety.*block\|safety.*check\|conflict.*detect" logs/server/god_kaiser.log

# Error-Codes (alle Server-Errors)
grep -E "\[5[0-9]{3}\]" logs/server/god_kaiser.log

# Langsame Requests
grep "duration=" logs/server/god_kaiser.log
```

---

## 11. DB-Tabellen Quick-Reference

| Tabelle | Model | Schlüsselfelder |
|---------|-------|-----------------|
| `esp_devices` | ESPDevice | device_id, status, last_seen |
| `sensor_configs` | SensorConfig | esp_device_id, gpio_pin, sensor_type |
| `sensor_data` | SensorData | sensor_config_id, value, timestamp |
| `sensor_type_defaults` | SensorTypeDefaults | sensor_type, unit, min/max |
| `actuator_configs` | ActuatorConfig | esp_device_id, gpio_pin, actuator_type |
| `actuator_states` | ActuatorState | actuator_config_id, current_state |
| `actuator_history` | ActuatorHistory | actuator_config_id, action, timestamp |
| `cross_esp_logic` | CrossESPLogic | name, conditions, actions, enabled |
| `logic_execution_history` | LogicExecutionHistory | logic_id, result, timestamp |
| `audit_logs` | AuditLog | action, entity_type, user_id |
| `esp_heartbeat_logs` | ESPHeartbeatLog | esp_device_id, timestamp |
| `user_accounts` | User | username, email, role |
| `token_blacklist` | TokenBlacklist | token, expires_at |
| `system_config` | SystemConfig | key, value |
| `subzone_configs` | SubzoneConfig | zone_id, name |
| `kaiser_registry` | KaiserRegistry | kaiser_id |
| `esp_ownership` | ESPOwnership | kaiser_id, esp_device_id |
| `library_metadata` | LibraryMetadata | name, version |
| `ai_predictions` | AIPredictions | sensor_id, predicted_value |

**Queries:** Siehe Agent Quick-Commands (Section 5).

---

## 12. Docker Quick-Reference

| Service | Container | Port(s) |
|---------|-----------|---------|
| `el-servador` | `automationone-server` | 8000 |
| `mqtt-broker` | `automationone-mqtt` | 1883, 9001 |
| `postgres` | `automationone-postgres` | 5432 |
| `el-frontend` | `automationone-frontend` | 5173 |

**Log Bind-Mounts:** `./logs/server/` → el-servador `/app/logs`, `./logs/mqtt/` → mqtt-broker, `./logs/postgres/` → postgres

---

## 13. Config-System Quick-Reference

| Settings-Klasse | Env-Prefix | Wichtigste Werte |
|-----------------|------------|------------------|
| `DatabaseSettings` | `DATABASE_*` | URL, pool_size(10), auto_init |
| `MQTTSettings` | `MQTT_*` | broker_host, port(1883), keepalive(60) |
| `ServerSettings` | `SERVER_*` | host, port(8000), workers(4) |
| `SecuritySettings` | `JWT_*` | secret_key, algorithm(HS256), expire(30min) |
| `CORSSettings` | `CORS_*` | allowed_origins |
| `HierarchySettings` | `KAISER_ID` | kaiser_id("god") |
| `LoggingSettings` | `LOG_*` | level(INFO), format(json), max_bytes(10MB) |
| `ESP32Settings` | `ESP_*` | heartbeat_timeout(120s) |
| `SensorSettings` | `SENSOR_*` | pi_enhanced, retention(90d) |
| `ActuatorSettings` | `ACTUATOR_*` | command_timeout(10s), safety_checks |
| `WebSocketSettings` | `WEBSOCKET_*` | max_connections(100), heartbeat(30s) |
| `ResilienceSettings` | `CIRCUIT_BREAKER_*`, `RETRY_*`, `TIMEOUT_*` | CB thresholds, retry(3) |
| `DevelopmentSettings` | `DEBUG_*` | debug_mode, mock_esp32 |
| `MaintenanceSettings` | Various | retention_enabled(false!), dry_run(true!) |
| `RedisSettings` / `ExternalServices` / `Notification` | `REDIS_*` / `GOD_LAYER_*` / `SMTP_*` | alle enabled(false) |

**Wichtig:** Cleanup-Jobs alle DISABLED per Default (Safety). JWT Default-Key → SECURITY CRITICAL in Production.

---

*Kompakter Skill für Server-Debug. Details in ERROR_CODES.md und server-development SKILL.md*
