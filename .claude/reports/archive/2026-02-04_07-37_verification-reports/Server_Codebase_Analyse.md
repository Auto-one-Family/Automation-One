# God-Kaiser Server Codebase-Analyse Report

**Datum:** 2026-02-04 (Verifiziert: 2026-02-04)
**Analysierte Version:** feature/docs-cleanup (4a7f3e4)
**Gesamtzeilen:** ~60,604 Python LOC
**Dateien:** 127 .py-Dateien (exkl. __init__.py)

---

## Zusammenfassung

| Bereich | Status | Highlights |
|---------|--------|------------|
| Verzeichnisstruktur | ✅ | 3-schichtiges Pattern (API → Services → DB) |
| Startup/Shutdown | ✅ | 6 kritische Steps, Resilience-First |
| Services | ✅ | 23+ Services, Logic Engine als Herzstück |
| MQTT Layer | ✅ | 14 Handler, Circuit Breaker, Offline Buffer |
| REST API | ✅ | 169 Endpoints, 3-Rollen Auth Matrix |
| Database | ✅ | 17 Models, Multi-Value Sensor Support |
| Scheduler | ✅ | APScheduler, 10+ Background Jobs |
| Schemas | ✅ | 70+ Pydantic Schemas, Industrielle Validierung |

---

## 1. Verzeichnisstruktur

```
src/ (60,604 Zeilen insgesamt)
│
├── main.py (711 Zeilen)
│   └─ FastAPI App, Lifespan, MQTT Setup, Service Init
│
├── core/ (7,294 Zeilen, 24 Dateien)
│   ├── config.py (837 Zeilen) - Pydantic Settings (19 Klassen)
│   ├── scheduler.py (595 Zeilen) - APScheduler Central
│   ├── esp32_error_mapping.py (2,093 Zeilen) - Error Code Mappings
│   ├── error_codes.py (683 Zeilen) - Server Error Codes (5000-5999)
│   ├── constants.py (333 Zeilen) - Globale Konstanten
│   ├── security.py (277 Zeilen) - JWT, Password Hashing
│   ├── logging_config.py (168 Zeilen) - Structured Logging
│   ├── exceptions.py (498 Zeilen) - Custom Exceptions
│   └── resilience/ (1,458 Zeilen) - Circuit Breaker, Retry, Timeout
│
├── db/ (6,942 Zeilen)
│   ├── session.py (299 Zeilen) - Async SQLAlchemy Engine
│   ├── models/ (2,845 Zeilen, 17 Dateien) - ORM Models
│   └── repositories/ (1,428 Zeilen, 16 Dateien) - Data Access Layer
│
├── mqtt/ (6,938 Zeilen)
│   ├── client.py (632 Zeilen) - Paho MQTT + Circuit Breaker
│   ├── publisher.py (441 Zeilen) - Publish mit Retry
│   ├── subscriber.py (365 Zeilen) - Thread Pool Handler
│   ├── topics.py (991 Zeilen) - Topic Builder/Parser
│   └── handlers/ (4,422 Zeilen, 14 Dateien) - Message Handler
│
├── api/ (3,987 Zeilen)
│   ├── deps.py (826 Zeilen) - Dependency Injection
│   └── v1/ (12,210 Zeilen, 18 Dateien) - REST Endpoints
│
├── services/ (13,675 Zeilen)
│   ├── logic_engine.py (781 Zeilen) - Cross-ESP Automation
│   ├── sensor_service.py (545 Zeilen) - Sensor CRUD + Processing
│   ├── actuator_service.py (279 Zeilen) - Actuator Commands
│   ├── safety_service.py (264 Zeilen) - Safety Validation
│   ├── esp_service.py (944 Zeilen) - ESP Management
│   ├── logic/ (1,547 Zeilen) - Conditions, Actions, Safety
│   ├── maintenance/ (673 Zeilen) - Cleanup Jobs
│   └── simulation/ (802 Zeilen) - Mock-ESP Scheduler
│
├── schemas/ (6,778 Zeilen, 20 Dateien) - Pydantic DTOs
│
├── sensors/ (3,728 Zeilen)
│   └── sensor_libraries/active/ (1,267 Zeilen) - Sensor Processors
│
├── websocket/ (313 Zeilen) - WebSocket Manager
│
├── utils/ (390 Zeilen) - Helpers
│
└── middleware/ (71 Zeilen) - Request-ID Tracking
```

### Modulübersicht nach Zeilen

| Modul | Zeilen | Prozent |
|-------|--------|---------|
| services/ | 13,675 | 22.6% |
| api/v1/ | 12,210 | 20.1% |
| core/ | 7,294 | 12.0% |
| db/ | 6,942 | 11.5% |
| mqtt/ | 6,938 | 11.4% |
| schemas/ | 6,778 | 11.2% |
| sensors/ | 3,728 | 6.2% |
| main.py | 711 | 1.2% |
| andere | ~2,328 | 3.8% |

---

## 2. Startup-Sequenz (main.py lifespan)

### Startup-Reihenfolge

| Step | Aktion | Zeile | Kritisch |
|------|--------|-------|----------|
| 0 | **Security Validation** | 99-127 | ⚠️ JA |
| 0.1 | JWT Secret Key prüfen | 103-117 | HALT in Prod |
| 0.5 | **Resilience Patterns Init** | 129-151 | ⚠️ JA |
| 0.5.1 | ResilienceRegistry (Singleton) | 133 | ⚠️ JA |
| 1 | **Database Init** | 153-165 | 🔴 KRITISCH |
| 1.1 | DB Auto-Init oder Engine | 154-161 | 🔴 |
| 1.2 | DB Circuit Breaker | 164 | ⚠️ JA |
| 2 | **MQTT Broker Connect** | 167-178 | ⚠️ NON-FATAL |
| 2.1 | MQTTClient.get_instance() | 169 | Singleton |
| 2.2 | connect() (Auto-Reconnect) | 170 | ⚠️ |
| 3 | **MQTT Handler Registration** | 180-310 | ⚠️ JA |
| 3.1 | Subscriber + Thread Pool | 184-192 | ⚠️ JA |
| 3.2-3.5 | Alle Handler registrieren | 203-260 | ⚠️ JA |
| 3.4 | **Central Scheduler Init** | 264-268 | ⚠️ JA |
| 3.4.1 | Simulation Scheduler Init | 270-278 | ⚠️ JA |
| 3.4.2 | Maintenance Service Start | 312-322 | ⚠️ JA |
| 3.5 | Mock-ESP Recovery | 324-336 | NON-FATAL |
| 3.6 | Sensor Type Auto-Reg | 338-357 | NON-FATAL |
| 3.7 | Sensor Schedule Recovery | 359-387 | NON-FATAL |
| 4 | MQTT Topics Subscribe | 389-395 | CONDITIONAL |
| 5 | **WebSocket Manager Init** | 397-402 | ⚠️ JA |
| 6 | **Services Init** | 404-482 | 🔴 KRITISCH |
| 6.1-6.6 | Repos, Safety, Publisher | 408-434 | ⚠️ JA |
| 6.7 | SequenceExecutor (zirkulär) | 438 | 🔴 KRITISCH |
| 6.8 | Zirkuläre Abhängigkeit | 449 | 🔴 KRITISCH |
| 6.10 | Logic Engine Start | 459-468 | ⚠️ JA |
| 6.11 | Logic Scheduler Start | 471-475 | ⚠️ JA |

### Shutdown-Reihenfolge

| Step | Aktion | Zeile | Priorität |
|------|--------|-------|-----------|
| 1 | Logic Scheduler Stop | 514-518 | 🔴 FIRST |
| 2 | Logic Engine Stop | 520-524 | 🔴 FIRST |
| 2.1 | Sequence Executor Cleanup | 526-530 | 🟠 EARLY |
| 2.3 | Maintenance Service Stop | 532-542 | 🟠 EARLY |
| 2.4 | Mock-ESP Stop All | 544-551 | 🟠 EARLY |
| 2.5 | Central Scheduler Shutdown | 553-560 | 🟠 EARLY |
| 3 | WebSocket Manager Shutdown | 562-566 | 🟡 MIDDLE |
| 4 | MQTT Subscriber Shutdown | 568-572 | 🟡 MIDDLE |
| 5 | MQTT Client Disconnect | 574-578 | 🟡 MIDDLE |
| 6 | Database Dispose | 580-583 | 🟢 LAST |

---

## 3. Services Inventar

### 3.1 Core Services

| Service | Datei | Zeilen | Dependencies | Hauptmethoden |
|---------|-------|--------|--------------|---------------|
| **LogicEngine** | logic_engine.py | 781 | LogicRepo, ActuatorService, WS | `start()`, `stop()`, `evaluate_sensor_data()` |
| **LogicService** | logic_service.py | 426 | LogicRepo, LogicValidator | `create_rule()`, `validate_rule()`, `test_rule()` |
| **LogicScheduler** | logic_scheduler.py | 194 | LogicEngine | `start()`, `stop()`, `trigger_rules()` |
| **SensorService** | sensor_service.py | 545 | SensorRepo, ESPRepo, Publisher | `process_reading()`, `trigger_measurement()` |
| **SensorSchedulerService** | sensor_scheduler_service.py | 545 | SensorRepo, CentralScheduler | `schedule_sensor()`, `recover_all_jobs()` |
| **ActuatorService** | actuator_service.py | 279 | ActuatorRepo, SafetyService, Publisher | `send_command()` |
| **SafetyService** | safety_service.py | 264 | ActuatorRepo, Publisher | `validate_actuator_command()`, `emergency_stop_all()` |
| **ESPService** | esp_service.py | 944 | ESPRepo, Publisher | `register()`, `approve()`, `reject()` |
| **ZoneService** | zone_service.py | 430 | ESPRepo, Publisher | `assign_zone()`, `unassign_zone()` |
| **SubzoneService** | subzone_service.py | 595 | SubzoneRepo, Publisher | `assign_subzone()`, `set_safe_mode()` |
| **ConfigBuilder** | config_builder.py | 249 | SensorRepo, ActuatorRepo | `build_esp_config()` |
| **GpioValidationService** | gpio_validation_service.py | 497 | SensorRepo, ActuatorRepo | `validate_gpio_conflict()` |
| **EventAggregatorService** | event_aggregator_service.py | 740 | AuditRepo | `aggregate_events()`, `get_dashboard_stats()` |
| **AuditRetentionService** | audit_retention_service.py | 894 | AuditLogRepo | `apply_retention_policy()`, `cleanup()` |
| **AuditBackupService** | audit_backup_service.py | 506 | AuditLogRepo | `backup()`, `export_csv()` |
| **MQTTAuthService** | mqtt_auth_service.py | 377 | ESPRepo | `generate_credentials()`, `validate_token()` |
| **SensorTypeRegistrationService** | sensor_type_registration.py | 252 | SensorTypeDefaultsRepo | `auto_register_sensor_types()` |
| **MaintenanceService** | maintenance/service.py | 260 | CentralScheduler | `start()`, `stop()`, `register_jobs()` |

### 3.2 Logic Engine Architektur

```
LogicEngine
├── Condition Evaluators
│   ├── SensorConditionEvaluator (Schwellenwerte)
│   ├── TimeConditionEvaluator (Zeit-Fenster)
│   ├── HysteresisEvaluator (Zustandsübergänge)
│   └── CompoundConditionEvaluator (AND/OR/NOT)
│
├── Action Executors
│   ├── ActuatorActionExecutor (Befehle)
│   ├── DelayActionExecutor (Verzögerungen)
│   ├── NotificationActionExecutor (WebSocket)
│   └── SequenceActionExecutor (Sub-Aktionen)
│
└── Safety Components
    ├── ConflictManager (Actuator-Konflikte)
    ├── RateLimiter (max_executions_per_hour)
    └── LoopDetector (Feedback-Schleifen)
```

### 3.3 Maintenance Services

| Job | Schedule | Config-Key | Status |
|-----|----------|------------|--------|
| cleanup_sensor_data | Daily 03:00 | SENSOR_DATA_RETENTION_ENABLED | Optional |
| cleanup_command_history | Daily 03:30 | COMMAND_HISTORY_RETENTION_ENABLED | Optional |
| cleanup_orphaned_mocks | Hourly | ORPHANED_MOCK_CLEANUP_ENABLED | Optional |
| health_check_esps | 60s | ESP_HEALTH_CHECK_INTERVAL_SECONDS | Always |
| health_check_mqtt | 30s | MQTT_HEALTH_CHECK_INTERVAL_SECONDS | Always |
| health_check_sensors | 60s | SENSOR_HEALTH_CHECK_INTERVAL_SECONDS | Always |
| aggregate_stats | 60 min | STATS_AGGREGATION_INTERVAL_MINUTES | Optional |

### 3.4 Simulation Services

| Job | Job-ID Pattern | Intervall | Funktion |
|-----|---------------|-----------|----------|
| Heartbeat | `mock_{esp_id}_heartbeat` | 60s (konfig.) | Uptime/Heap/WiFi/State |
| Sensor Data | `mock_{esp_id}_sensor_{gpio}_{type}` | 30s (konfig.) | DRIFT/RANDOM/CONSTANT |

---

## 4. MQTT Layer

### 4.1 Subscribed Topics (14 Handler)

| Topic Pattern | QoS | Handler | Verarbeitung | Zeile (main.py) |
|---------------|-----|---------|--------------|-----------------|
| `kaiser/{id}/esp/+/sensor/+/data` | 1 | SensorDataHandler | DB → Logic → WS | 203-206 |
| `kaiser/{id}/esp/+/actuator/+/status` | 1 | ActuatorStatusHandler | Update State | 207-210 |
| `kaiser/{id}/esp/+/actuator/+/response` | 1 | ActuatorResponseHandler | Log Response | 212-215 |
| `kaiser/{id}/esp/+/actuator/+/alert` | 1 | ActuatorAlertHandler | Log + E-Stop | 217-220 |
| `kaiser/{id}/esp/+/system/heartbeat` | 0 | HeartbeatHandler | Auto-Discovery | 221-224 |
| `kaiser/{id}/discovery/esp32_nodes` | 1 | DiscoveryHandler | Registration | 225-228 |
| `kaiser/{id}/esp/+/config_response` | 1 | ConfigHandler | Verify Config | 229-232 |
| `kaiser/{id}/esp/+/zone/ack` | 1 | ZoneAckHandler | Confirmation | 234-237 |
| `kaiser/{id}/esp/+/subzone/ack` | 1 | SubzoneAckHandler | Confirmation | 239-242 |
| `kaiser/{id}/esp/+/system/will` | 0 | LWTHandler | Instant Offline | 248-251 |
| `kaiser/{id}/esp/+/system/error` | 1 | ErrorEventHandler | Log + Enrich | 256-259 |
| `kaiser/{id}/esp/+/actuator/+/command` | 1 | MockActuatorHandler | Mock-ESP Befehle | 297-300 |
| `kaiser/{id}/esp/+/actuator/emergency` | 1 | MockActuatorHandler | Mock-ESP E-Stop | 302-305 |
| `kaiser/broadcast/emergency` | 1 | MockActuatorHandler | Broadcast E-Stop | 306-309 |

**Hinweis:** `{id}` = KAISER_ID aus Config (default: "god")

### 4.2 Published Topics

| Topic | QoS | Method | Purpose |
|-------|-----|--------|---------|
| `/actuator/{gpio}/command` | 2 | publish_actuator_command() | Befehle |
| `/sensor/{gpio}/command` | var | publish_sensor_command() | Trigger |
| `/config/sensor/{gpio}` | 2 | publish_sensor_config() | Config Push |
| `/config/actuator/{gpio}` | 2 | publish_actuator_config() | Config Push |
| `/config` | 2 | publish_config() | Combined Config |
| `/system/command` | 2 | publish_system_command() | REBOOT, OTA |
| `/system/heartbeat/ack` | 0 | _send_heartbeat_ack() | Approval |
| `/sensor/{gpio}/processed` | 1 | publish_pi_enhanced_response() | Pi-Enhanced |

### 4.3 Handler-Architektur

```
MQTT Message → Global Callback
    ↓
_route_message() → JSON-Parse
    ↓
_find_handler() → TopicBuilder.matches_subscription()
    ↓
ThreadPool Execute → _execute_handler()
    ├─ Sync Handler: Direkt
    └─ Async Handler: asyncio.run_coroutine_threadsafe()
```

### 4.4 Handler-Dateien (14 Dateien, 4,422 Zeilen)

| Handler-Datei | Zeilen | Funktion |
|---------------|--------|----------|
| heartbeat_handler.py | 1,112 | Heartbeat + Auto-Discovery |
| sensor_handler.py | 731 | Sensor-Data Processing |
| base_handler.py | 583 | Abstract Handler-Basisklasse |
| actuator_handler.py | 457 | Actuator Status Updates |
| config_handler.py | 396 | Config ACK Verarbeitung |
| error_handler.py | 329 | Error Event Processing |
| actuator_alert_handler.py | 320 | Emergency/Alert Handling |
| zone_ack_handler.py | 288 | Zone Assignment ACK |
| actuator_response_handler.py | 279 | Command Response Logging |
| discovery_handler.py | 214 | ESP32 Discovery |
| lwt_handler.py | 210 | Last Will & Testament (Offline) |
| subzone_ack_handler.py | 173 | Subzone Assignment ACK |
| kaiser_handler.py | 20 | Kaiser-Level Events |

### 4.5 Resilience Patterns

- **Circuit Breaker**: Threshold-basiert, Auto-Recovery
- **Offline Buffer**: Persistente Queue für Reconnect
- **Retry Strategy**: Exponential Backoff mit Jitter
- **Rate-Limited Logging**: 1x pro 60s Disconnect-Warnings

---

## 5. REST API

### 5.1 Router-Übersicht

| Router | Prefix | Endpoints | Zeilen | Auth Required |
|--------|--------|-----------|--------|---------------|
| auth | /v1/auth | 10 | 506 | Mixed |
| users | /v1/users | 7 | 396 | Admin |
| sensors | /v1/sensors | 11 | 647 | Active/Operator |
| actuators | /v1/actuators | 8 | 362 | Active/Operator |
| esp | /v1/esp | 14 | 715 | Active/Operator |
| health | /v1/health | 6 | 421 | Mixed |
| audit | /v1/audit | 21 | 728 | Admin/Active |
| logic | /v1/logic | 8 | 442 | Operator+ |
| debug | /v1/debug | 59 | 1,587 | Admin |
| zone | /v1/zone | 5 | 217 | Operator+ |
| subzone | /v1/subzone | 6 | 326 | Operator+ |
| errors | /v1/errors | 4 | 161 | Active |
| sensor_type_defaults | /v1/sensor-type-defaults | 6 | 271 | Operator+ |
| sequences | /v1/sequences | 4 | 177 | Operator+ |

**Gesamt: 169 Endpoints (18 Router-Dateien, 12,210 Zeilen)**

### 5.2 Authentication Matrix

```
┌─ Public ───────────────────────────────────────────────┐
│ /auth/status, /auth/setup, /auth/login, /auth/refresh │
│ /health/, /health/metrics, /health/live, /health/ready│
└────────────────────────────────────────────────────────┘

┌─ Active User (Viewer + Operator + Admin) ──────────────┐
│ GET /sensors/, /actuators/, /esp/, /health/detailed   │
│ GET /audit/logs, /logic/rules, /errors/               │
│ GET /auth/me, POST /auth/logout                       │
└────────────────────────────────────────────────────────┘

┌─ Operator User (Operator + Admin) ─────────────────────┐
│ CRUD /sensors/, /actuators/                           │
│ POST /actuators/{esp_id}/{gpio}/command               │
│ POST /actuators/emergency_stop                        │
│ POST /esp/approval/approve, /reject                   │
│ CRUD /logic/rules, /zone/, /subzone/                  │
└────────────────────────────────────────────────────────┘

┌─ Admin User ───────────────────────────────────────────┐
│ CRUD /users/, POST /auth/register                     │
│ ALL /debug/*, /audit/retention/*                      │
└────────────────────────────────────────────────────────┘
```

### 5.3 Dependency Injection

| Dependency | Typ | Verwendung |
|-----------|-----|-----------|
| DBSession | AsyncSession | Alle DB-Endpoints |
| CurrentUser | User | Auth Required |
| AdminUser | User (role=admin) | Admin Only |
| OperatorUser | User (role∈{admin,operator}) | Operator+ |
| MQTTPublisher | Publisher Singleton | Sensor/Actuator Befehle |
| SensorService | Service | Sensor-Operationen |
| ActuatorService | Service | Actuator-Operationen |

---

## 6. Database

### 6.1 ER-Diagramm

```
┌─────────────────────────────────────────────────────────────┐
│                   DEVICE HIERARCHY                          │
└─────────────────────────────────────────────────────────────┘

KaiserRegistry (1) ────<N──── ESPOwnership ────N>──── (1) ESPDevice
  [zone_ids]                (priority-based)          [capabilities]

ESPDevice (1) ────<N──── SensorConfig
           ├─ gpio=34, sensor_type="temperature"
           ├─ gpio=21, sensor_type="sht31_temp", i2c_address=0x44
           └─ gpio=21, sensor_type="sht31_humidity", i2c_address=0x44

ESPDevice (1) ────<N──── ActuatorConfig
           ├─ gpio=18, actuator_type="pump"
           └─ gpio=19, actuator_type="valve"

ESPDevice (1) ────<N──── SubzoneConfig
           └─ subzone_id="irrigation_a", assigned_gpios=[18,19,20]

┌─────────────────────────────────────────────────────────────┐
│                   TIME-SERIES DATA                          │
└─────────────────────────────────────────────────────────────┘

SensorConfig (1) ────<N──── SensorData [timestamp DESC indexed]
ActuatorConfig (1) ────1──── ActuatorState (current)
ActuatorConfig (1) ────<N──── ActuatorHistory [timestamp DESC indexed]
ESPDevice (1) ────<N──── ESPHeartbeatLog [timestamp DESC indexed]

┌─────────────────────────────────────────────────────────────┐
│                   AUTOMATION                                │
└─────────────────────────────────────────────────────────────┘

CrossESPLogic (1) ────<N──── LogicExecutionHistory

┌─────────────────────────────────────────────────────────────┐
│                   SYSTEM                                    │
└─────────────────────────────────────────────────────────────┘

User (username, email, role: admin|operator|viewer)
AuditLog (event_type, severity, source_type, correlation_id)
SystemConfig (config_key → config_value)
SensorTypeDefaults (sensor_type → operating_mode, timeout)
TokenBlacklist (jti, expires_at) - JWT Logout/Revocation
LibraryMetadata (sensor_type → library_path, version)
AIPredictions (sensor_id → prediction, confidence)
```

### 6.1.1 Model-Dateien (17 Dateien, 2,845 Zeilen)

| Model-Datei | Zeilen | Entities |
|-------------|--------|----------|
| actuator.py | 426 | ActuatorConfig, ActuatorState, ActuatorHistory |
| sensor.py | 361 | SensorConfig, SensorData |
| logic.py | 331 | CrossESPLogic, LogicExecutionHistory |
| logic_validation.py | 276 | Validation-Schemas |
| audit_log.py | 252 | AuditLog, AuditEventType, AuditSeverity |
| esp.py | 239 | ESPDevice |
| esp_heartbeat.py | 220 | ESPHeartbeatLog |
| kaiser.py | 198 | KaiserRegistry, ESPOwnership |
| auth.py | 158 | TokenBlacklist |
| subzone.py | 145 | SubzoneConfig |
| ai.py | 129 | AIPredictions |
| library.py | 125 | LibraryMetadata |
| sensor_type_defaults.py | 125 | SensorTypeDefaults |
| enums.py | 120 | DataSource, SensorOperatingMode |
| user.py | 105 | User |
| system.py | 93 | SystemConfig |

### 6.2 Repository Pattern (16 Dateien)

| Repository | Model | Spezial-Queries |
|-----------|-------|-----------------|
| ESPRepository | ESPDevice | `get_by_device_id()`, `get_running_mocks()` |
| SensorRepository | SensorConfig | `get_by_esp_gpio_type_and_i2c()` (4-way) |
| ActuatorRepository | ActuatorConfig | `get_state()`, `log_command()` |
| LogicRepository | CrossESPLogic | `get_rules_by_trigger_sensor()` |
| AuditLogRepository | AuditLog | `search()`, `get_stats()` |
| UserRepository | User | `get_by_username()`, `get_by_email()` |
| SubzoneRepository | SubzoneConfig | `get_by_esp_and_subzone()` |
| ESPHeartbeatRepository | ESPHeartbeatLog | `get_latest()`, `get_history()` |
| SystemConfigRepository | SystemConfig | `get_value()`, `set_value()` |
| SensorTypeDefaultsRepository | SensorTypeDefaults | `get_by_sensor_type()` |
| TokenBlacklistRepository | TokenBlacklist | `is_blacklisted()`, `add()` |
| KaiserRepository | KaiserRegistry, ESPOwnership | `get_by_zone()` |
| AIRepository | AIPredictions | `get_latest_prediction()` |
| LibraryRepository | LibraryMetadata | `get_by_sensor_type()` |

### 6.3 Multi-Value Sensor Support

```python
# SHT31 I2C (0x44): 2 Configs auf GPIO 21
SensorConfig(gpio=21, sensor_type="sht31_temp", i2c_address=68)
SensorConfig(gpio=21, sensor_type="sht31_humidity", i2c_address=68)

# Multiple DS18B20 auf OneWire GPIO 4
SensorConfig(gpio=4, sensor_type="ds18b20", onewire_address="28FF641E...")
SensorConfig(gpio=4, sensor_type="ds18b20", onewire_address="28FF641F...")
```

**Unique Constraint:** `(esp_id, gpio, sensor_type, onewire_address, i2c_address)`

---

## 7. Scheduler & Jobs

### 7.1 Central Scheduler

- **Implementation:** APScheduler (AsyncIOScheduler)
- **JobStore:** MemoryJobStore (nicht persistent)
- **Executor:** AsyncIOExecutor
- **Job Defaults:** coalesce=True, max_instances=1, misfire_grace_time=30s

### 7.2 Job-Kategorien

| Prefix | Kategorie | Beispiel |
|--------|-----------|----------|
| `mock_` | Mock-ESP | `mock_ESP_123_heartbeat` |
| `maintenance_` | Cleanup | `maintenance_cleanup_sensor_data` |
| `monitor_` | Health | `monitor_health_check_esps` |
| `sensor_schedule_` | Scheduled | `sensor_schedule_ESP_123_34_ph` |

### 7.3 Job-Übersicht

| Job | Kategorie | Zeitplan | Config |
|-----|-----------|----------|--------|
| Heartbeat (Mock) | MOCK_ESP | 60s | Dynamic per Mock |
| Sensor Data (Mock) | MOCK_ESP | 30s | Dynamic per Sensor |
| cleanup_sensor_data | MAINTENANCE | 03:00 Daily | Retention Policy |
| cleanup_command_history | MAINTENANCE | 03:30 Daily | Retention Policy |
| health_check_esps | MONITOR | 60s | Always |
| health_check_mqtt | MONITOR | 30s | Always |
| health_check_sensors | MONITOR | 60s | Always |
| aggregate_stats | MAINTENANCE | 60 min | Optional |

---

## 8. Validierung

### 8.1 Pydantic Schemas

| Schema | Required Fields | Validierungen |
|--------|-----------------|---------------|
| ESPDeviceCreate | device_id | `^(ESP_[A-F0-9]{6,8}\|MOCK_[A-Z0-9]+)$` |
| SensorConfigCreate | gpio, sensor_type | gpio 0-39, interval_ms 1000-300000 |
| ActuatorConfigCreate | gpio, actuator_type | gpio 0-39, value 0.0-1.0 |
| LogicRuleCreate | rule_name, conditions | min 1 condition, priority 1-100 |
| LoginRequest | username, password | password min 8 chars + strength |
| RegisterRequest | username, email, password | email valid, password komplexität |

### 8.2 Password Requirements

```
✓ >= 8 Zeichen
✓ Mind. 1 Großbuchstabe (A-Z)
✓ Mind. 1 Kleinbuchstabe (a-z)
✓ Mind. 1 Ziffer (0-9)
✓ Mind. 1 Special-Zeichen (!@#$%^&*...)
```

### 8.3 Validierungs-Flow

```
HTTP Request
    ↓
Pydantic Schema (automatic)
    ├─ Field constraints
    ├─ @field_validator
    └─ @model_validator
    ↓
Service Layer
    ├─ GPIO-Konflikt prüfen
    ├─ Safety-Constraints
    └─ DB-Integrity
    ↓
Database Persist
```

---

## 9. Abhängigkeits-Graph

```
main.py
  ├── lifespan()
  │     ├── init_db()
  │     ├── MQTTClient.get_instance()
  │     │     └── Settings.mqtt
  │     ├── Subscriber.register_handlers()
  │     │     ├── sensor_handler
  │     │     │     ├─→ SensorService
  │     │     │     ├─→ LogicEngine
  │     │     │     └─→ WebSocketManager
  │     │     ├── heartbeat_handler
  │     │     │     └─→ ESPService
  │     │     ├── actuator_handler
  │     │     │     └─→ ActuatorService
  │     │     └── ...
  │     ├── SimulationScheduler
  │     │     └─→ CentralScheduler
  │     └── MaintenanceService
  │           └─→ CentralScheduler
  │
  └── api_v1_router
        ├── esp_router → ESPService
        ├── sensor_router → SensorService
        ├── actuator_router → ActuatorService
        ├── logic_router → LogicService → LogicEngine
        └── ...
```

---

## 10. Empfehlungen für SKILL.md Struktur (~400 Zeilen)

1. **Quick Reference** (50 Zeilen)
   - Ordner → Verantwortlichkeit Tabelle
   - Wichtigste Dateien pro Modul

2. **Startup/Shutdown Flow** (40 Zeilen)
   - Kritische Steps mit Zeilen-Referenz
   - Fehlerbehandlung

3. **Service-Architektur** (80 Zeilen)
   - Logic Engine Diagramm
   - Safety Service Integration
   - Dependency Injection Pattern

4. **MQTT Handler Pattern** (60 Zeilen)
   - Topic → Handler Mapping
   - Payload-Validierung
   - WebSocket Broadcast

5. **REST API Pattern** (40 Zeilen)
   - Auth Matrix (Rollen)
   - Endpoint-Kategorien
   - Dependency Injection

6. **Database Pattern** (40 Zeilen)
   - Repository Pattern
   - Multi-Value Sensor
   - Session Management

7. **Scheduler-Konfiguration** (30 Zeilen)
   - Job-Kategorien
   - Maintenance Jobs
   - Mock-ESP Recovery

8. **Regeln** (30 Zeilen)
   - NIEMALS/IMMER Liste
   - Safety-First Prinzipien

9. **Workflow** (30 Zeilen)
   - Neuer Handler hinzufügen
   - Neuer Endpoint hinzufügen
   - Neuer Service hinzufügen

---

## 11. Empfehlungen für MODULE_REGISTRY.md (~600-700 Zeilen)

1. **Vollständige Service-APIs** (150 Zeilen)
   - Alle public methods
   - Parameter und Return Types

2. **Alle MQTT Topics mit Payloads** (100 Zeilen)
   - Subscribed + Published
   - Payload-Schemas

3. **Alle REST Endpoints** (150 Zeilen)
   - Method, Path, Auth, Beschreibung
   - Request/Response Schemas

4. **Database Models** (100 Zeilen)
   - Alle Tabellen
   - Wichtige Felder und Constraints
   - Relationships

5. **Pydantic Schemas** (100 Zeilen)
   - Alle Schemas
   - Kritische Validierungen

6. **Config-Klassen** (50 Zeilen)
   - Environment Variables
   - Default-Werte

---

## 12. Kritische Invarianten

1. **Safety MUST pass before any Actuator command**
   - `SafetyService.validate_actuator_command()` ist CRITICAL PATH

2. **Database as Single Source of Truth**
   - Mock-ESP Config in DB, nicht hardcoded
   - Recovery nach Restart via `recover_mocks()`

3. **Multi-Value Sensor Support**
   - Job-IDs: `mock_{esp_id}_sensor_{gpio}_{sensor_type}`
   - Unique Constraint schützt vor Duplikaten

4. **Rate Limiting**
   - Pro Regel: `max_executions_per_hour`
   - Discovery: Global + Per-Device Limits

5. **Thread-Safety**
   - `SafetyService` nutzt `asyncio.Lock()`
   - Alle DB-Operationen via async sessions

---

**Report erstellt:** 2026-02-04
**Verifiziert:** 2026-02-04
**Analysierte Dateien:** 127
**Gesamtzeilen:** 60,604 LOC
