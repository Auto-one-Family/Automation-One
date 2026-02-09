# Server-Debug Fullstack-Analyse

**Erstellt:** 2026-02-08
**Zweck:** Vollständige Bestandsaufnahme des server-debug Bereichs. Dient als Wissensbasis für die Neuerstellung des server-debug Agenten.
**Methode:** Direkte Code-Analyse aller relevanten Dateien im `El Servador/god_kaiser_server/src/`

---

## 1. IST-Zustand: Agent + Skill + Optimierungsplan

### 1.1 Agent (`server-debug-agent.md`) – 252 Zeilen

| Aspekt | Wert |
|--------|------|
| **Pfad** | `.claude/agents/server/server-debug-agent.md` |
| **Tools** | Read, Grep, Glob, Bash |
| **Model** | sonnet |
| **Modi** | A (Allgemeine Analyse), B (Spezifisches Problem) |
| **Report** | `.claude/reports/current/SERVER_DEBUG_REPORT.md` |
| **Eigenanalyse** | Ja – Docker, curl, SQL, mosquitto_sub |
| **Sicherheitsregeln** | GET-only curl, SELECT-only SQL, mosquitto_sub mit -C/-W |

**Kerninhalt:** Zwei Modi, Logger→Handler-Zuordnung (15 Handler), Error-Codes 5000-5699 in 7 Ranges, Startup-Sequenz (14 Steps), Circuit Breaker Diagnose (3 Breaker), Health-Endpoints, Quick-Commands.

### 1.2 Skill (`SKILL.md`) – 598 Zeilen

| Aspekt | Wert |
|--------|------|
| **Pfad** | `.claude/skills/server-debug/SKILL.md` |
| **Sektionen** | 15 (Quick Reference, Log-Format, Request-Tracing, Middleware, Exceptions, Circuit Breaker, Fehlerpfade, Error-Codes, Health, Logger→Handler, Quick-Commands, Startup, Cross-Layer, Referenzen, Regeln) |
| **Stärke** | Detaillierte Code-References mit Zeilennummern |
| **Schwäche** | Zeilennummern veralten bei Code-Änderungen |

### 1.3 Geplante Änderungen (Agentplan.md, Abschnitte 1.2, 2.2, 3.2)

Der Agent wurde bereits TEILWEISE auf den SOLL-Zustand aktualisiert:
- ✅ Tools: Bash hinzugefügt
- ✅ Model: `sonnet` (nicht mehr gepinnt)
- ✅ Zwei Modi (A/B) mit automatischer Erkennung
- ✅ Eigenanalyse statt Delegation
- ✅ SESSION_BRIEFING optional
- ⚠️ Startup-Sequenz im Skill dokumentiert nur 14 Steps – tatsächlich sind es 20+
- ⚠️ Einige Service-Namen noch korrigierbar (z.B. Alembic-Command)

---

## 2. Vollständige Server-Modulstruktur

### 2.1 Verzeichnisübersicht

```
El Servador/god_kaiser_server/src/
├── main.py                          # Entry-Point (710 Zeilen)
├── __init__.py
├── api/                             # REST API Layer
│   ├── __init__.py
│   ├── dependencies.py              # FastAPI Dependencies
│   ├── deps.py                      # Auth Dependencies
│   ├── schemas.py                   # Shared API Schemas
│   ├── sensor_processing.py         # Sensor Processing API (root-level)
│   └── v1/                          # API Version 1
│       ├── __init__.py              # Router Aggregation (14 Sub-Router)
│       ├── actuators.py             # Actuator Endpoints
│       ├── ai.py                    # AI Predictions
│       ├── audit.py                 # Audit Log Endpoints
│       ├── auth.py                  # JWT Authentication
│       ├── debug.py                 # Debug Endpoints
│       ├── errors.py                # Error Event Endpoints
│       ├── esp.py                   # ESP Device Management
│       ├── health.py                # Health Check Endpoints
│       ├── kaiser.py                # Kaiser Registry
│       ├── library.py               # Library Management
│       ├── logic.py                 # Logic Rules
│       ├── sensors.py               # Sensor Endpoints
│       ├── sensor_type_defaults.py  # Sensor Type Defaults
│       ├── sequences.py             # Sequence Actions
│       ├── subzone.py               # Subzone Management
│       ├── users.py                 # User Management
│       ├── zone.py                  # Zone Management
│       └── websocket/
│           ├── __init__.py
│           └── realtime.py          # WebSocket Endpoint
├── core/                            # Core Infrastructure
│   ├── __init__.py
│   ├── config.py                    # Pydantic Settings (838 Zeilen, 17 Settings-Klassen)
│   ├── constants.py                 # System-Konstanten
│   ├── exception_handlers.py        # Global Exception Handlers
│   ├── exceptions.py                # GodKaiserException Hierarchy
│   ├── logging_config.py            # JSON/Text Logging Setup (169 Zeilen)
│   ├── request_context.py           # Request-ID ContextVar
│   ├── scheduler.py                 # APScheduler Central Scheduler
│   └── resilience/                  # Resilience Patterns
│       ├── __init__.py              # Public API
│       ├── circuit_breaker.py       # CircuitBreaker Implementation
│       ├── exceptions.py            # Resilience Exceptions
│       ├── registry.py              # ResilienceRegistry Singleton
│       ├── retry.py                 # Retry with Backoff
│       └── timeout.py              # Async Timeout Wrappers
├── db/                              # Database Layer
│   ├── __init__.py
│   ├── base.py                      # SQLAlchemy Base
│   ├── session.py                   # Engine, Session, Circuit Breaker (300 Zeilen)
│   ├── models/                      # ORM Models (19 Tabellen)
│   │   ├── __init__.py              # Model Registry
│   │   ├── actuator.py              # ActuatorConfig, ActuatorState, ActuatorHistory
│   │   ├── ai.py                    # AIPredictions
│   │   ├── audit_log.py             # AuditLog
│   │   ├── auth.py                  # TokenBlacklist
│   │   ├── enums.py                 # Shared Enums
│   │   ├── esp.py                   # ESPDevice
│   │   ├── esp_heartbeat.py         # ESPHeartbeatLog
│   │   ├── kaiser.py                # KaiserRegistry, ESPOwnership
│   │   ├── library.py               # LibraryMetadata
│   │   ├── logic.py                 # CrossESPLogic, LogicExecutionHistory
│   │   ├── sensor.py                # SensorConfig, SensorData
│   │   ├── sensor_type_defaults.py  # SensorTypeDefaults
│   │   ├── subzone.py               # SubzoneConfig
│   │   ├── system.py                # SystemConfig
│   │   └── user.py                  # User
│   └── repositories/                # Data Access Layer
│       ├── __init__.py
│       ├── base_repo.py             # BaseRepository Pattern
│       ├── actuator_repo.py
│       ├── ai_repo.py
│       ├── audit_log_repo.py
│       ├── esp_heartbeat_repo.py
│       ├── esp_repo.py
│       ├── kaiser_repo.py
│       ├── library_repo.py
│       ├── logic_repo.py
│       ├── sensor_repo.py
│       ├── sensor_type_defaults_repo.py
│       ├── subzone_repo.py
│       ├── system_config_repo.py
│       ├── token_blacklist_repo.py
│       └── user_repo.py
├── middleware/
│   └── request_id.py               # RequestIdMiddleware (UUID Tracking)
├── mqtt/                            # MQTT Integration
│   ├── __init__.py
│   ├── client.py                    # MQTTClient Singleton (633 Zeilen)
│   ├── offline_buffer.py            # Offline Message Buffer
│   ├── publisher.py                 # MQTT Publisher
│   ├── subscriber.py                # Message Routing + Thread Pool (366 Zeilen)
│   ├── topics.py                    # TopicBuilder
│   ├── websocket_utils.py           # WS-Broadcast Helpers
│   └── handlers/                    # MQTT Message Handlers
│       ├── __init__.py
│       ├── base_handler.py
│       ├── actuator_handler.py
│       ├── actuator_alert_handler.py
│       ├── actuator_response_handler.py
│       ├── config_handler.py
│       ├── discovery_handler.py
│       ├── error_handler.py
│       ├── heartbeat_handler.py
│       ├── kaiser_handler.py
│       ├── lwt_handler.py
│       ├── sensor_handler.py
│       ├── subzone_ack_handler.py
│       └── zone_ack_handler.py
├── schemas/                         # Pydantic Schemas
│   ├── ai.py
│   ├── api_response.py
│   ├── debug_db.py
│   ├── kaiser.py
│   ├── library.py
│   ├── sequence.py
│   ├── sensor_type_defaults.py
│   ├── subzone.py
│   ├── user.py
│   └── zone.py
├── sensors/                         # Sensor Processing Libraries
│   ├── __init__.py
│   ├── base_processor.py
│   ├── sensor_type_registry.py
│   └── sensor_libraries/
│       ├── __init__.py
│       └── active/
│           ├── __init__.py
│           ├── co2.py
│           ├── ec_sensor.py
│           ├── flow.py
│           ├── light.py
│           ├── moisture.py
│           ├── ph_sensor.py
│           └── pressure.py
├── services/                        # Business Logic Layer
│   ├── __init__.py
│   ├── actuator_service.py
│   ├── ai_service.py
│   ├── audit_backup_service.py
│   ├── audit_retention_service.py
│   ├── config_builder.py
│   ├── esp_service.py
│   ├── event_aggregator_service.py
│   ├── god_client.py
│   ├── gpio_validation_service.py
│   ├── health_service.py
│   ├── kaiser_service.py
│   ├── library_service.py
│   ├── logic_engine.py
│   ├── logic_scheduler.py
│   ├── logic_service.py
│   ├── mqtt_auth_service.py
│   ├── safety_service.py
│   ├── sensor_scheduler_service.py
│   ├── sensor_service.py
│   ├── sensor_type_registration.py
│   ├── subzone_service.py
│   ├── zone_service.py
│   ├── logic/                       # Logic Engine Sub-System
│   │   ├── __init__.py
│   │   ├── validator.py
│   │   ├── actions/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── actuator_executor.py
│   │   │   ├── delay_executor.py
│   │   │   ├── notification_executor.py
│   │   │   └── sequence_executor.py
│   │   ├── conditions/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── compound_evaluator.py
│   │   │   ├── hysteresis_evaluator.py
│   │   │   ├── sensor_evaluator.py
│   │   │   └── time_evaluator.py
│   │   └── safety/
│   │       ├── __init__.py
│   │       ├── conflict_manager.py
│   │       ├── loop_detector.py
│   │       └── rate_limiter.py
│   ├── maintenance/                 # Maintenance Jobs
│   │   ├── __init__.py
│   │   ├── service.py               # MaintenanceService
│   │   └── jobs/
│   │       ├── __init__.py
│   │       ├── cleanup.py
│   │       └── sensor_health.py
│   └── simulation/                  # Mock-ESP Simulation
│       ├── __init__.py
│       ├── scheduler.py
│       └── actuator_handler.py
├── utils/                           # Utility Functions
│   ├── __init__.py
│   ├── data_helpers.py
│   ├── mqtt_helpers.py
│   ├── network_helpers.py
│   └── time_helpers.py
└── websocket/                       # WebSocket Layer
    ├── __init__.py
    └── manager.py                   # WebSocketManager Singleton (314 Zeilen)
```

**Gesamtzählung:**
- **Python-Dateien:** ~120+
- **API-Endpoints:** 14 Sub-Router + root + sensor_processing + websocket
- **MQTT-Handlers:** 13 (+ 1 kaiser_handler, + 3 Mock-ESP handlers in main.py)
- **Services:** 23 Service-Dateien + Logic-Subsystem (11 Dateien) + Maintenance (3) + Simulation (3)
- **DB-Models:** 15 Model-Dateien → 19 Tabellen
- **DB-Repositories:** 15 Repository-Dateien

---

## 3. Alle Code-Locations (Exakte Pfade)

### 3.1 Server Entry-Point

| Datei | Pfad | Zeilen | Funktion |
|-------|------|--------|----------|
| **main.py** | `El Servador/god_kaiser_server/src/main.py` | 710 | Lifespan, Middleware, Router-Registration |

### 3.2 Alle MQTT-Handler (registriert in main.py Zeile 203-309)

| Handler | Pfad | Topic-Pattern | Funktion |
|---------|------|---------------|----------|
| **sensor_handler** | `src/mqtt/handlers/sensor_handler.py` | `kaiser/{id}/esp/+/sensor/+/data` | Sensor-Daten empfangen und speichern |
| **actuator_handler** | `src/mqtt/handlers/actuator_handler.py` | `kaiser/{id}/esp/+/actuator/+/status` | Actuator-Status Updates |
| **actuator_response_handler** | `src/mqtt/handlers/actuator_response_handler.py` | `kaiser/{id}/esp/+/actuator/+/response` | Command-Bestätigungen |
| **actuator_alert_handler** | `src/mqtt/handlers/actuator_alert_handler.py` | `kaiser/{id}/esp/+/actuator/+/alert` | Emergency/Timeout-Alerts |
| **heartbeat_handler** | `src/mqtt/handlers/heartbeat_handler.py` | `kaiser/{id}/esp/+/system/heartbeat` | Heartbeat + Discovery + Timeout |
| **discovery_handler** | `src/mqtt/handlers/discovery_handler.py` | `kaiser/{id}/discovery/esp32_nodes` | ESP32 Discovery |
| **config_handler** | `src/mqtt/handlers/config_handler.py` | `kaiser/{id}/esp/+/config_response` | Config-ACK von ESP |
| **zone_ack_handler** | `src/mqtt/handlers/zone_ack_handler.py` | `kaiser/{id}/esp/+/zone/ack` | Zone-Assignment-ACK |
| **subzone_ack_handler** | `src/mqtt/handlers/subzone_ack_handler.py` | `kaiser/{id}/esp/+/subzone/ack` | Subzone-ACK |
| **lwt_handler** | `src/mqtt/handlers/lwt_handler.py` | `kaiser/{id}/esp/+/system/will` | LWT Offline-Detection |
| **error_handler** | `src/mqtt/handlers/error_handler.py` | `kaiser/{id}/esp/+/system/error` | ESP32 Error-Events |
| **kaiser_handler** | `src/mqtt/handlers/kaiser_handler.py` | (import only) | Kaiser-spezifische Verarbeitung |
| **base_handler** | `src/mqtt/handlers/base_handler.py` | (base class) | Handler-Basis-Klasse |
| **mock_actuator_command** | `src/main.py:282-309` | `kaiser/{id}/esp/+/actuator/+/command`, `+/emergency`, `broadcast/emergency` | Mock-ESP Actuator-Commands |

**Hinweis:** `kaiser_id` wird aus `settings.hierarchy.kaiser_id` geladen (Default: `"god"`).

### 3.3 Alle REST-Router (registriert in `api/v1/__init__.py`)

| Router | Pfad | Prefix | Auth | Endpoints |
|--------|------|--------|------|-----------|
| **auth** | `api/v1/auth.py` | `/v1/auth` | Nein (Login) | POST login, POST register, POST refresh, POST logout |
| **esp** | `api/v1/esp.py` | `/v1/esp` | Ja | GET list, GET detail, POST register, PUT update, DELETE remove, POST config-push |
| **sensors** | `api/v1/sensors.py` | `/v1/sensors` | Ja | GET configs, GET data, POST create, PUT update, DELETE remove |
| **sensor_type_defaults** | `api/v1/sensor_type_defaults.py` | `/v1/sensor-type-defaults` | Ja | GET list, GET detail, PUT update |
| **actuators** | `api/v1/actuators.py` | `/v1/actuators` | Ja | GET list, GET detail, POST create, POST command, POST emergency, DELETE remove, GET history |
| **logic** | `api/v1/logic.py` | `/v1/logic` | Ja | GET rules, POST create, PUT update, DELETE remove, POST evaluate |
| **sequences** | `api/v1/sequences.py` | `/v1/sequences` | Ja | GET list, POST create, POST start, POST stop |
| **health** | `api/v1/health.py` | `/v1/health` | Mixed | GET live (no auth), GET ready (no auth), GET detailed (auth), GET esp (auth), GET metrics (no auth) |
| **audit** | `api/v1/audit.py` | `/v1/audit` | Ja | GET logs, GET stats |
| **errors** | `api/v1/errors.py` | `/v1/errors` | Ja | GET error-events |
| **debug** | `api/v1/debug.py` | `/v1/debug` | Ja | GET db-stats, GET mqtt-stats |
| **users** | `api/v1/users.py` | `/v1/users` | Ja | GET list, GET me, PUT update |
| **zone** | `api/v1/zone.py` | `/v1/zones` | Ja | GET list, POST create, POST assign-esp, DELETE remove |
| **subzone** | `api/v1/subzone.py` | `/v1/subzones` | Ja | GET list, POST create, PUT update, DELETE remove |
| **kaiser** | `api/v1/kaiser.py` | `/v1/kaiser` | Ja | Kaiser Registry Operations |
| **library** | `api/v1/library.py` | `/v1/library` | Ja | Library Operations |
| **ai** | `api/v1/ai.py` | `/v1/ai` | Ja | AI Prediction Operations |
| **sensor_processing** | `api/sensor_processing.py` | (root) | Mixed | POST process, GET libraries, GET status, POST batch |
| **websocket** | `api/v1/websocket/realtime.py` | `/v1/ws` | Ja (Token) | WS /realtime |

**Root-Endpoints (main.py):**
- `GET /` – Server-Status (kein Auth)
- `GET /health` – Simple Health (kein Auth)

### 3.4 Alle Services

| Service | Pfad | Klasse/Funktion | Verantwortung |
|---------|------|-----------------|---------------|
| **ActuatorService** | `services/actuator_service.py` | `ActuatorService` | Actuator-Steuerung + Safety-Validierung |
| **SafetyService** | `services/safety_service.py` | `SafetyService` | Safety-Checks vor Actuator-Commands |
| **ESPService** | `services/esp_service.py` | `ESPService` | ESP-Device-Management |
| **SensorService** | `services/sensor_service.py` | `SensorService` | Sensor-Config + Data |
| **SensorSchedulerService** | `services/sensor_scheduler_service.py` | `SensorSchedulerService` | Scheduled Sensor Jobs |
| **SensorTypeRegistration** | `services/sensor_type_registration.py` | `auto_register_sensor_types()` | Sensor-Library-Auto-Registration |
| **LogicEngine** | `services/logic_engine.py` | `LogicEngine` | Cross-ESP Automation Execution |
| **LogicScheduler** | `services/logic_scheduler.py` | `LogicScheduler` | Timer-basierte Logic-Evaluation |
| **LogicService** | `services/logic_service.py` | `LogicService` | Logic-Rule CRUD |
| **ZoneService** | `services/zone_service.py` | `ZoneService` | Zone-Management |
| **SubzoneService** | `services/subzone_service.py` | `SubzoneService` | Subzone-Management |
| **ConfigBuilder** | `services/config_builder.py` | `ConfigBuilder` | ESP-Config-Generation |
| **HealthService** | `services/health_service.py` | `HealthService` | System-Health-Aggregation |
| **MQTTAuthService** | `services/mqtt_auth_service.py` | `MQTTAuthService` | MQTT-Credential-Management |
| **EventAggregatorService** | `services/event_aggregator_service.py` | `EventAggregatorService` | Event-Aggregation |
| **GPIOValidationService** | `services/gpio_validation_service.py` | `GPIOValidationService` | GPIO-Validierung |
| **AuditBackupService** | `services/audit_backup_service.py` | `AuditBackupService` | Audit-Backup |
| **AuditRetentionService** | `services/audit_retention_service.py` | `AuditRetentionService` | Audit-Log-Retention |
| **KaiserService** | `services/kaiser_service.py` | `KaiserService` | Kaiser-Registry-Operationen |
| **LibraryService** | `services/library_service.py` | `LibraryService` | Library-Management |
| **AIService** | `services/ai_service.py` | `AIService` | AI-Predictions |
| **GodClient** | `services/god_client.py` | `GodClient` | External God-Layer Communication |
| **MaintenanceService** | `services/maintenance/service.py` | `MaintenanceService` | APScheduler Job-Management |
| **CleanupJobs** | `services/maintenance/jobs/cleanup.py` | Various | Data-Retention-Cleanup |
| **SensorHealthJob** | `services/maintenance/jobs/sensor_health.py` | `SensorHealthJob` | Sensor-Timeout-Detection |
| **SimulationScheduler** | `services/simulation/scheduler.py` | `SimulationScheduler` | Mock-ESP-Simulation |

**Logic-Subsystem:**

| Komponente | Pfad | Verantwortung |
|-----------|------|---------------|
| `SensorConditionEvaluator` | `services/logic/conditions/sensor_evaluator.py` | Sensor-Wert-Vergleiche |
| `TimeConditionEvaluator` | `services/logic/conditions/time_evaluator.py` | Zeitbasierte Bedingungen |
| `HysteresisConditionEvaluator` | `services/logic/conditions/hysteresis_evaluator.py` | Hysterese-Logik |
| `CompoundConditionEvaluator` | `services/logic/conditions/compound_evaluator.py` | AND/OR-Verknüpfung |
| `ActuatorActionExecutor` | `services/logic/actions/actuator_executor.py` | Actuator-Aktionen |
| `DelayActionExecutor` | `services/logic/actions/delay_executor.py` | Zeitverzögerung |
| `NotificationActionExecutor` | `services/logic/actions/notification_executor.py` | WebSocket-Benachrichtigung |
| `SequenceActionExecutor` | `services/logic/actions/sequence_executor.py` | Sequenz-Ausführung |
| `ConflictManager` | `services/logic/safety/conflict_manager.py` | Actuator-Konflikt-Erkennung |
| `RateLimiter` | `services/logic/safety/rate_limiter.py` | Action-Rate-Limiting |
| `LoopDetector` | `services/logic/safety/loop_detector.py` | Endlos-Loop-Erkennung |
| `LogicValidator` | `services/logic/validator.py` | Rule-Validierung |

### 3.5 Alle DB-Models und Tabellen

| Model-Klasse | Tabellenname | Model-Datei |
|-------------|-------------|-------------|
| `ESPDevice` | `esp_devices` | `db/models/esp.py` |
| `SensorConfig` | `sensor_configs` | `db/models/sensor.py` |
| `SensorData` | `sensor_data` | `db/models/sensor.py` |
| `SensorTypeDefaults` | `sensor_type_defaults` | `db/models/sensor_type_defaults.py` |
| `ActuatorConfig` | `actuator_configs` | `db/models/actuator.py` |
| `ActuatorState` | `actuator_states` | `db/models/actuator.py` |
| `ActuatorHistory` | `actuator_history` | `db/models/actuator.py` |
| `CrossESPLogic` | `cross_esp_logic` | `db/models/logic.py` |
| `LogicExecutionHistory` | `logic_execution_history` | `db/models/logic.py` |
| `AuditLog` | `audit_logs` | `db/models/audit_log.py` |
| `ESPHeartbeatLog` | `esp_heartbeat_logs` | `db/models/esp_heartbeat.py` |
| `User` | `user_accounts` | `db/models/user.py` |
| `TokenBlacklist` | `token_blacklist` | `db/models/auth.py` |
| `SystemConfig` | `system_config` | `db/models/system.py` |
| `SubzoneConfig` | `subzone_configs` | `db/models/subzone.py` |
| `KaiserRegistry` | `kaiser_registry` | `db/models/kaiser.py` |
| `ESPOwnership` | `esp_ownership` | `db/models/kaiser.py` |
| `LibraryMetadata` | `library_metadata` | `db/models/library.py` |
| `AIPredictions` | `ai_predictions` | `db/models/ai.py` |

**Gesamt: 19 Tabellen in 15 Model-Dateien**

### 3.6 Alle Repositories

| Repository | Pfad | Model |
|-----------|------|-------|
| `BaseRepository` | `db/repositories/base_repo.py` | (abstract) |
| `ESPRepository` | `db/repositories/esp_repo.py` | ESPDevice |
| `SensorRepository` | `db/repositories/sensor_repo.py` | SensorConfig, SensorData |
| `ActuatorRepository` | `db/repositories/actuator_repo.py` | ActuatorConfig, ActuatorState, ActuatorHistory |
| `LogicRepository` | `db/repositories/logic_repo.py` | CrossESPLogic, LogicExecutionHistory |
| `AuditLogRepository` | `db/repositories/audit_log_repo.py` | AuditLog |
| `ESPHeartbeatRepository` | `db/repositories/esp_heartbeat_repo.py` | ESPHeartbeatLog |
| `UserRepository` | `db/repositories/user_repo.py` | User |
| `TokenBlacklistRepository` | `db/repositories/token_blacklist_repo.py` | TokenBlacklist |
| `SubzoneRepository` | `db/repositories/subzone_repo.py` | SubzoneConfig |
| `SystemConfigRepository` | `db/repositories/system_config_repo.py` | SystemConfig |
| `SensorTypeDefaultsRepository` | `db/repositories/sensor_type_defaults_repo.py` | SensorTypeDefaults |
| `KaiserRepository` | `db/repositories/kaiser_repo.py` | KaiserRegistry, ESPOwnership |
| `LibraryRepository` | `db/repositories/library_repo.py` | LibraryMetadata |
| `AIRepository` | `db/repositories/ai_repo.py` | AIPredictions |

### 3.7 WebSocket-Komponenten

| Komponente | Pfad | Funktion |
|-----------|------|----------|
| `WebSocketManager` | `src/websocket/manager.py` | Singleton, Broadcast, Rate-Limiting (10 msg/s), Filter-Subscriptions |
| `realtime.py` | `src/api/v1/websocket/realtime.py` | WebSocket-Endpoint `/api/v1/ws/realtime` |
| `websocket_utils.py` | `src/mqtt/websocket_utils.py` | Helper für WS-Broadcast aus MQTT-Handlers |

### 3.8 Config-System

| Settings-Klasse | Pfad | Env-Prefix | Wichtige Werte |
|----------------|------|------------|----------------|
| `DatabaseSettings` | `core/config.py` | `DATABASE_*` | URL, pool_size(10), max_overflow(20), auto_init |
| `MQTTSettings` | `core/config.py` | `MQTT_*` | broker_host, port(1883), keepalive(60), TLS, subscriber_max_workers(10) |
| `ServerSettings` | `core/config.py` | `SERVER_*` | host, port(8000), workers(4) |
| `SecuritySettings` | `core/config.py` | `JWT_*` | secret_key, algorithm(HS256), expire_minutes(30) |
| `CORSSettings` | `core/config.py` | `CORS_*` | allowed_origins (localhost:3000, :5173) |
| `HierarchySettings` | `core/config.py` | `KAISER_ID`, `GOD_ID` | kaiser_id("god"), god_id("god_pi_central") |
| `PerformanceSettings` | `core/config.py` | `PERFORMANCE_*` | logic_scheduler_interval(60s) |
| `LoggingSettings` | `core/config.py` | `LOG_*` | level(INFO), format(json), file_path, max_bytes(10MB), backup_count(10) |
| `ESP32Settings` | `core/config.py` | `ESP_*` | heartbeat_timeout(120s), discovery_interval(300s) |
| `SensorSettings` | `core/config.py` | `SENSOR_*` | pi_enhanced, processing_timeout(5000ms), retention(90d) |
| `ActuatorSettings` | `core/config.py` | `ACTUATOR_*` | command_timeout(10s), emergency_stop, safety_checks |
| `WebSocketSettings` | `core/config.py` | `WEBSOCKET_*` | max_connections(100), heartbeat(30s) |
| `RedisSettings` | `core/config.py` | `REDIS_*` | enabled(false), host, port(6379) |
| `ExternalServicesSettings` | `core/config.py` | `GOD_LAYER_*` | url, enabled(false) |
| `NotificationSettings` | `core/config.py` | `SMTP_*` | enabled(false), webhook_timeout(5s) |
| `DevelopmentSettings` | `core/config.py` | `DEBUG_*` | debug_mode, testing_mode, mock_esp32 |
| `MaintenanceSettings` | `core/config.py` | Various | retention_enabled(false!), dry_run(true!), batch_sizes, health_check_intervals |
| `ResilienceSettings` | `core/config.py` | `CIRCUIT_BREAKER_*`, `RETRY_*`, `TIMEOUT_*`, `OFFLINE_BUFFER_*` | CB thresholds/timeouts, retry(3 attempts), timeouts per operation |

**Alle Cleanup-Jobs sind per Default DISABLED** (Safety-Feature). Heartbeat-Cleanup ist per Default ENABLED (365 Tage).

---

## 4. Startup-Sequenz (Komplett aus main.py)

Die tatsächliche Startup-Sequenz hat **20+ Steps** (nicht 14 wie im Skill dokumentiert):

| Step | main.py | Log-Pattern | Kann fehlschlagen? | Impact |
|------|---------|-------------|---------------------|--------|
| 0 | Z.93-95 | `God-Kaiser Server Starting...` | Nein | - |
| 0.1 | Z.100 | `Validating security configuration...` | Ja (Production + Default-Key) | Server-Exit |
| 0.5 | Z.130 | `Initializing resilience patterns...` | Ja | Kein Circuit Breaker |
| 0.5.1 | Z.140-146 | `external_api breaker registered` | Ja | External API ungeschützt |
| 1 | Z.154-156 | `Initializing database...` | Ja | Kein DB-Zugriff |
| 1.1 | Z.157 | `Database initialized successfully` | - | - |
| 1.2 | Z.164-165 | `[resilience] Database circuit breaker initialized` | Ja | DB ungeschützt |
| 2 | Z.168-170 | `Connecting to MQTT broker...` | Ja (nicht-fatal) | Auto-Reconnect aktiv |
| 2.1 | Z.178 | `MQTT client connected successfully` | - | - |
| 3 | Z.182 | `Registering MQTT handlers...` | Nein | - |
| 3.1 | Z.192-193 | `Main event loop set for MQTT subscriber` | Nein | - |
| 3.2 | Z.199-200 | `Using KAISER_ID: {id}` | Nein | - |
| 3.3 | Z.262 | `Registered {count} MQTT handlers` | Nein | - |
| 3.4 | Z.265-268 | `Central Scheduler started` | Ja | Kein APScheduler |
| 3.4.1 | Z.271-278 | `SimulationScheduler initialized` | Ja | Keine Mock-ESPs |
| 3.4.2 | Z.313-322 | `MaintenanceService initialized and started` | Ja | Keine Maintenance-Jobs |
| 3.5 | Z.327-336 | `Mock-ESP recovery complete: {n} simulations restored` | Ja (non-fatal) | Mock-ESPs nicht wiederhergestellt |
| 3.6 | Z.342-357 | `Sensor type auto-registration: {n} new, {n} existing` | Ja (non-fatal) | Sensor-Defaults fehlen |
| 3.7 | Z.363-387 | `Sensor schedule recovery complete: {n} jobs` | Ja (non-fatal) | Scheduled Sensors inaktiv |
| 4 | Z.390-395 | `Subscribing to MQTT topics...` / `MQTT subscriptions complete` | Nur wenn connected | Topics nicht subscribed |
| 5 | Z.398-402 | `Initializing WebSocket Manager...` | Ja | Kein Real-Time |
| 6 | Z.404-482 | `Initializing services...` | Ja | Logic Engine, Safety, Actuator nicht verfügbar |
| 6.1 | Z.481 | `Services initialized successfully` | - | - |
| RESILIENCE | Z.484-491 | `[resilience] Status: healthy={bool}` | Nein | - |
| FINAL | Z.493-500 | `God-Kaiser Server Started Successfully` | Nein | - |

**Shutdown-Sequenz (main.py Z.508-591):**
1. Stop Logic Scheduler → 2. Stop Logic Engine → 3. Stop SequenceActionExecutor → 4. Stop MaintenanceService → 5. Stop Mock-ESP Simulations → 6. Stop Central Scheduler → 7. Shutdown WebSocket Manager → 8. Shutdown MQTT Subscriber (Thread Pool) → 9. Disconnect MQTT Client → 10. Dispose Database Engine

---

## 5. Logging-System

### 5.1 Konfiguration (`core/logging_config.py`)

| Aspekt | Wert |
|--------|------|
| **Format** | JSON (Default) oder Text (via `LOG_FORMAT` env) |
| **File-Handler** | `RotatingFileHandler` |
| **Max-Größe** | 10 MB Default (`LOG_FILE_MAX_BYTES`) |
| **Backup-Count** | 10 Default (`LOG_FILE_BACKUP_COUNT`) |
| **Pfad (Container)** | `/app/logs/god_kaiser.log` |
| **Pfad (Host)** | `logs/god_kaiser.log` (relativ zum Working-Dir) |
| **Console** | Text-Format (immer) |
| **Request-ID** | Via `RequestIdFilter` → `request_id` in jedem Log-Eintrag |
| **Noise-Reduction** | paho.mqtt, urllib3, asyncio auf WARNING |

### 5.2 JSON-Log-Felder

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

**request_id:** UUID via `RequestIdMiddleware` für HTTP-Requests. MQTT-Handler haben `request_id = "-"`.

### 5.3 Logger→Handler-Zuordnung (Erweitert)

| Logger-Name | Datei | Verantwortung |
|-------------|-------|---------------|
| `src.main` | main.py | Startup, Shutdown, Lifespan |
| `src.mqtt.client` | mqtt/client.py | MQTT-Verbindung, Reconnect, Circuit Breaker |
| `src.mqtt.subscriber` | mqtt/subscriber.py | Message-Routing, Handler-Dispatch |
| `src.mqtt.handlers.sensor_handler` | handlers/sensor_handler.py | Sensor-Daten |
| `src.mqtt.handlers.heartbeat_handler` | handlers/heartbeat_handler.py | Heartbeat, Discovery, Timeout |
| `src.mqtt.handlers.actuator_handler` | handlers/actuator_handler.py | Actuator-Status |
| `src.mqtt.handlers.actuator_response_handler` | handlers/actuator_response_handler.py | Command-Response |
| `src.mqtt.handlers.actuator_alert_handler` | handlers/actuator_alert_handler.py | Actuator-Alerts |
| `src.mqtt.handlers.config_handler` | handlers/config_handler.py | Config-ACK |
| `src.mqtt.handlers.lwt_handler` | handlers/lwt_handler.py | LWT Offline-Detection |
| `src.mqtt.handlers.error_handler` | handlers/error_handler.py | ESP32 Error-Events |
| `src.mqtt.handlers.zone_ack_handler` | handlers/zone_ack_handler.py | Zone-ACK |
| `src.mqtt.handlers.subzone_ack_handler` | handlers/subzone_ack_handler.py | Subzone-ACK |
| `src.mqtt.handlers.discovery_handler` | handlers/discovery_handler.py | ESP32 Discovery |
| `src.db.session` | db/session.py | DB-Sessions, Circuit Breaker |
| `src.websocket.manager` | websocket/manager.py | WebSocket-Broadcasts |
| `src.core.exception_handlers` | core/exception_handlers.py | Global Exception Handling |
| `src.services.maintenance.service` | services/maintenance/service.py | Maintenance-Jobs |
| `src.services.logic_engine` | services/logic_engine.py | Logic-Rule-Evaluation |
| `src.services.logic_scheduler` | services/logic_scheduler.py | Timer-basierte Logic |
| `src.services.simulation.scheduler` | services/simulation/scheduler.py | Mock-ESP-Simulation |

---

## 6. Resilience-System (Circuit Breaker, Retry, Timeout)

### 6.1 Circuit Breaker

| Breaker | Registriert in | Default Threshold | Recovery | Half-Open |
|---------|---------------|-------------------|----------|-----------|
| **database** | `db/session.py:init_db_circuit_breaker()` | 3 | 10s | 5s |
| **mqtt** | `mqtt/client.py:MQTTClient._init_circuit_breaker()` | 5 | 30s | 10s |
| **external_api** | `main.py:140-146` | 5 | 60s | 15s |

**State-Machine:** `CLOSED → OPEN → HALF_OPEN → CLOSED`

**Alle Werte konfigurierbar via Settings:**
- `CIRCUIT_BREAKER_DB_FAILURE_THRESHOLD` / `_RECOVERY_TIMEOUT` / `_HALF_OPEN_TIMEOUT`
- `CIRCUIT_BREAKER_MQTT_FAILURE_THRESHOLD` / `_RECOVERY_TIMEOUT` / `_HALF_OPEN_TIMEOUT`
- `CIRCUIT_BREAKER_API_FAILURE_THRESHOLD` / `_RECOVERY_TIMEOUT` / `_HALF_OPEN_TIMEOUT`

### 6.2 Retry-Konfiguration

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `RETRY_MAX_ATTEMPTS` | 3 | Max Versuche |
| `RETRY_BASE_DELAY` | 1.0s | Basis-Verzögerung |
| `RETRY_MAX_DELAY` | 30.0s | Max-Verzögerung |
| `RETRY_EXPONENTIAL_BASE` | 2.0 | Exponential-Faktor |
| `RETRY_JITTER_ENABLED` | true | Anti-Thundering-Herd |

### 6.3 Timeout-Konfiguration

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `TIMEOUT_MQTT_PUBLISH` | 5.0s | MQTT-Publish |
| `TIMEOUT_DB_QUERY` | 5.0s | Einfache DB-Query |
| `TIMEOUT_DB_QUERY_COMPLEX` | 30.0s | Komplexe Aggregationen |
| `TIMEOUT_EXTERNAL_API` | 10.0s | Externe API-Calls |
| `TIMEOUT_WEBSOCKET_SEND` | 2.0s | WebSocket-Send |
| `TIMEOUT_SENSOR_PROCESSING` | 1.0s | Sensor-Datenverarbeitung |

### 6.4 Offline-Buffer

- Max 1000 Messages (`OFFLINE_BUFFER_MAX_SIZE`)
- Flush-Batch 50 Messages (`OFFLINE_BUFFER_FLUSH_BATCH_SIZE`)
- Automatischer Flush bei Reconnect

---

## 7. Exception-Handler-System

### 7.1 Hierarchie

```
Exception
├── GodKaiserException (automation_one_exception_handler → WARNING, JSON Response)
│   ├── ConfigError (5000-5099)
│   ├── MQTTError (5100-5199)
│   ├── ValidationError (5200-5299)
│   ├── DatabaseError (5300-5399)
│   ├── ServiceError (5400-5499)
│   ├── AuditError (5500-5599)
│   └── SequenceError (5600-5699)
└── Exception (general_exception_handler → ERROR + Stack Trace, "INTERNAL_ERROR")
```

### 7.2 Error-Code Ranges

| Range | Kategorie | Häufige Codes |
|-------|-----------|---------------|
| 5000-5099 | CONFIG | 5001 ESP_DEVICE_NOT_FOUND, 5007 ESP_OFFLINE |
| 5100-5199 | MQTT | 5104 CONNECTION_LOST, 5106 BROKER_UNAVAILABLE |
| 5200-5299 | VALIDATION | 5201 INVALID_ESP_ID, 5205 MISSING_REQUIRED_FIELD |
| 5300-5399 | DATABASE | 5301 QUERY_FAILED, 5304 CONNECTION_FAILED |
| 5400-5499 | SERVICE | 5402 CIRCUIT_BREAKER_OPEN, 5403 OPERATION_TIMEOUT |
| 5500-5599 | AUDIT | 5501 AUDIT_LOG_FAILED |
| 5600-5699 | SEQUENCE | 5610 SEQ_ALREADY_RUNNING, 5640 ACTUATOR_LOCKED, 5642 SAFETY_BLOCKED |

---

## 8. Middleware-Chain

**Ausführungsreihenfolge (LIFO – zuletzt hinzugefügt = zuerst ausgeführt):**

| Position | Middleware | Code | Funktion |
|----------|-----------|------|----------|
| 1 (zuerst) | `CORSMiddleware` | main.py:636-643 | CORS-Validierung |
| 2 | `RequestIdMiddleware` | main.py:633 | UUID-Tracking pro Request |
| 3 | Auth Dependencies | pro Endpoint | JWT-Token-Validierung |

---

## 9. Architektur-Abhängigkeiten und Datenflüsse

### 9.1 HTTP-Request-Flow

```
Client → CORSMiddleware → RequestIdMiddleware → Router → Auth Dependency
    → Service → Repository → SQLAlchemy → PostgreSQL
    → Response (mit X-Request-ID Header)
```

### 9.2 MQTT-Message-Flow

```
ESP32 → Mosquitto Broker → paho-mqtt Client (client.py:_on_message)
    → Subscriber._route_message() → JSON-Parse → _find_handler()
    → ThreadPool._execute_handler() → asyncio.run_coroutine_threadsafe()
    → Handler (async, main event loop) → Repository → DB
    → WebSocketManager.broadcast_threadsafe() → Frontend
```

**Kritisch:** Async-Handler MÜSSEN im Main-Event-Loop laufen (Bug O Fix, Z.189-192).

### 9.3 WebSocket-Flow

```
Frontend → WS /api/v1/ws/realtime → WebSocketManager.connect()
    → subscribe(filters) → broadcast(message_type, data)
    → websocket.send_json(message)
```

**Thread-Safety:** `broadcast_threadsafe()` für MQTT-Callback-Invocations via `asyncio.run_coroutine_threadsafe()`.

### 9.4 Startup-Flow

```
uvicorn → main.py:lifespan() →
    Security-Validation → Resilience-Init →
    DB-Init → MQTT-Connect → Handler-Registration →
    Scheduler-Init → Simulation-Init → Maintenance-Init →
    Mock-Recovery → Sensor-Registration → Sensor-Schedule-Recovery →
    MQTT-Subscribe → WebSocket-Init → Services-Init →
    God-Kaiser Server Started Successfully
```

### 9.5 Dependency-Graph (Startup-Reihenfolge)

```
Settings (Config) ← alles
    ↓
Database (Engine, Session) ← Repositories ← Services ← API-Router
    ↓
MQTT Client ← Subscriber ← Handlers (brauchen DB-Sessions)
    ↓
WebSocket Manager ← Handlers (broadcast), Logic Engine (notifications)
    ↓
Logic Engine ← Conditions + Actions + Safety ← LogicScheduler
    ↓
Maintenance Service ← APScheduler ← Cleanup + Health Jobs
    ↓
Simulation Scheduler ← Mock-ESP Recovery
```

---

## 10. Health-Endpoints (Debug-Tools)

| Endpoint | Auth | HTTP | Beschreibung |
|----------|------|------|-------------|
| `/api/v1/health/live` | Nein | GET | Server-Prozess läuft? (immer 200) |
| `/api/v1/health/ready` | Nein | GET | DB + MQTT connected? |
| `/api/v1/health/` | Nein | GET | mqtt_connected Status |
| `/api/v1/health/detailed` | Ja | GET | DB/MQTT/WS/System Details + Circuit Breaker |
| `/api/v1/health/esp` | Ja | GET | ESP-Fleet-Übersicht (online/offline counts) |
| `/api/v1/health/metrics` | Nein | GET | Prometheus-Format |

**Debug-Reihenfolge:**
1. `/health/live` → Server da?
2. `/health/ready` → Dependencies OK?
3. `/health/detailed` → Was genau ist kaputt? (mit Auth!)

---

## 11. Vorgehensweise Modus A – Allgemeine Server-Analyse

### Schritt-für-Schritt

**Schritt 1: Server-Verfügbarkeit**
```bash
# Server erreichbar?
curl -s http://localhost:8000/api/v1/health/live
# Expected: {"status": "alive"}

# Dependencies OK?
curl -s http://localhost:8000/api/v1/health/ready
# Expected: {"status": "ready", "database": true, "mqtt": true}
```

**Schritt 2: Docker-Container-Status**
```bash
docker compose ps
# Prüfe: el-servador, automationone-postgres, mqtt-broker
```

**Schritt 3: Server-Log parsen (Priorität: CRITICAL > ERROR > WARNING)**
```bash
# Host-Pfad (von Docker-Volume gemountet):
# logs/server/god_kaiser.log

# Alle CRITICAL
grep '"level": "CRITICAL"' logs/server/god_kaiser.log

# Alle ERROR
grep '"level": "ERROR"' logs/server/god_kaiser.log

# Circuit Breaker Events
grep -i "circuit\|resilience" logs/server/god_kaiser.log
```

**Schritt 4: Startup-Sequenz verifizieren**
```bash
# Vollständig gestartet?
grep "God-Kaiser Server" logs/server/god_kaiser.log
# Expected: "Starting..." → "Started Successfully"

# Handler registriert?
grep "Registered.*MQTT handlers" logs/server/god_kaiser.log

# Services initialisiert?
grep "Services initialized successfully" logs/server/god_kaiser.log
```

**Schritt 5: Handler-Statistiken**
```bash
# MQTT-Handler-Aktivität
grep "sensor_handler\|heartbeat_handler\|actuator_handler" logs/server/god_kaiser.log | wc -l

# Error pro Handler
grep '"level": "ERROR"' logs/server/god_kaiser.log | grep "handler" | head -20
```

**Schritt 6: Error-Kategorien (nach Code-Range)**
```bash
# CONFIG Errors (5000-5099)
grep -E "\[50[0-9]{2}\]" logs/server/god_kaiser.log

# MQTT Errors (5100-5199)
grep -E "\[51[0-9]{2}\]" logs/server/god_kaiser.log

# DB Errors (5300-5399)
grep -E "\[53[0-9]{2}\]" logs/server/god_kaiser.log

# Service Errors (5400-5499)
grep -E "\[54[0-9]{2}\]" logs/server/god_kaiser.log
```

**Schritt 7: Erweiterte Prüfungen bei Auffälligkeiten**

| Auffälligkeit | Eigenständige Prüfung |
|---------------|----------------------|
| DB-Connection-Fehler | `docker compose ps automationone-postgres` |
| MQTT-Publish fehlgeschlagen | `docker compose ps mqtt-broker` |
| Handler-Error mit ESP-ID | `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT device_id, status FROM esp_devices WHERE device_id = 'ESP_XXX'"` |
| MQTT-Messages fehlen | `mosquitto_sub -h localhost -t "kaiser/#" -v -C 5 -W 5` |
| WebSocket-Problem | `curl -s http://localhost:8000/api/v1/health/detailed` |
| Alembic-Status | `docker compose exec el-servador alembic current` |
| Container-Logs | `docker compose logs --tail=50 el-servador` |

---

## 12. Vorgehensweise Modus B – Spezifische Probleme

### Szenario 1: "Server-Handler crashed bei Sensor-Daten"

**Analyse-Kette:**
1. **Server-Log filtern:**
   ```bash
   grep "sensor_handler" logs/server/god_kaiser.log | grep -i "error\|exception\|failed" | tail -20
   ```
2. **Stack-Trace finden:**
   ```bash
   grep -A 20 "Unhandled exception" logs/server/god_kaiser.log | grep -B 2 -A 20 "sensor"
   ```
3. **Error-Code identifizieren:**
   ```bash
   grep -E "\[5[0-9]{3}\]" logs/server/god_kaiser.log | grep "sensor" | tail -10
   ```
4. **DB-Schema prüfen (Validation-Error?):**
   ```bash
   docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "\d sensor_data"
   ```
5. **MQTT-Payload prüfen (kommen Daten an?):**
   ```bash
   mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v -C 3 -W 15
   ```
6. **Worauf achten:**
   - `[5201]` → Ungültige ESP-ID im Payload
   - `[5205]` → Pflichtfeld fehlt im Sensor-Payload
   - `[5301]` → DB-Query fehlgeschlagen (Connection-Pool erschöpft?)
   - Stack-Trace → exakte Zeile im Handler-Code

### Szenario 2: "API antwortet mit 500"

**Analyse-Kette:**
1. **Server-Health:**
   ```bash
   curl -s http://localhost:8000/api/v1/health/live
   curl -s http://localhost:8000/api/v1/health/ready
   ```
2. **Stack-Trace im Log suchen:**
   ```bash
   grep "Unhandled exception" logs/server/god_kaiser.log | tail -5
   grep -A 30 "Unhandled exception" logs/server/god_kaiser.log | tail -35
   ```
3. **Request-ID tracen (wenn bekannt):**
   ```bash
   grep "REQUEST_ID_HERE" logs/server/god_kaiser.log
   ```
4. **Container-Logs:**
   ```bash
   docker compose logs --tail=50 el-servador
   ```
5. **DB-Verfügbarkeit:**
   ```bash
   docker compose ps automationone-postgres
   docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT 1"
   ```
6. **Worauf achten:**
   - `general_exception_handler` feuert → Bug (unerwartete Exception)
   - `automation_one_exception_handler` feuert → Bekannter Fehler (Error-Code)
   - `OperationalError` → DB-Connection-Problem
   - `CircuitBreakerOpenError` → Service blockiert

### Szenario 3: "WebSocket-Events kommen nicht beim Frontend an"

**Analyse-Kette:**
1. **Server-seitig: WS-Manager aktiv?**
   ```bash
   curl -s http://localhost:8000/api/v1/health/detailed
   # Prüfe: websocket.connection_count, websocket.status
   ```
2. **Server-Log: WS-Events gesendet?**
   ```bash
   grep -iE "websocket|ws_manager|broadcast" logs/server/god_kaiser.log | tail -20
   ```
3. **MQTT-Handler → WS-Broadcast-Kette:**
   ```bash
   grep "broadcast_threadsafe\|broadcast" logs/server/god_kaiser.log | tail -10
   ```
4. **Event-Loop-Probleme?**
   ```bash
   grep "event loop\|Bug O\|Queue bound" logs/server/god_kaiser.log
   ```
5. **Frontend-Container läuft?**
   ```bash
   docker compose ps el-frontend
   ```
6. **Worauf achten:**
   - `connection_count: 0` → Kein Frontend verbunden
   - `"Cannot broadcast: event loop not available"` → Event-Loop tot
   - `"Rate limit exceeded"` → Client bekommt zu viele Messages (>10/s)
   - `"Error sending message"` → Client disconnect (Race-Condition)
   - Keine WS-Logs → Handler broadcastet nicht (Code-Problem)

---

## 13. Empfehlungen für den neuen Agenten

### 13.1 Startup-Sequenz aktualisieren

Der Skill dokumentiert 14 Steps, tatsächlich sind es 20+. Die fehlenden Steps:
- Step 3.4.1: SimulationScheduler
- Step 3.5: Mock-ESP Recovery
- Step 3.6: Sensor Type Auto-Registration
- Step 3.7: Sensor Schedule Recovery
- Step 3.4.2: MaintenanceService (korrekte Einordnung)
- Mock-Actuator-Handler-Registration (Z.297-310)
- Resilience-Status-Logging (Z.484-491)

### 13.2 Logger→Handler-Zuordnung erweitern

Fehlende Logger im aktuellen Skill:
- `src.main` (Startup/Shutdown)
- `src.mqtt.handlers.discovery_handler`
- `src.mqtt.handlers.actuator_response_handler`
- `src.mqtt.handlers.actuator_alert_handler`
- `src.mqtt.handlers.kaiser_handler`
- `src.services.logic_engine`
- `src.services.logic_scheduler`
- `src.services.simulation.scheduler`
- `src.core.exception_handlers`

### 13.3 Neue Grep-Patterns

```bash
# Sensor-Processing (Pi-Enhanced)
grep "pi_enhanced\|sensor.*process" logs/server/god_kaiser.log

# Logic-Engine-Evaluationen
grep "logic.*evaluat\|logic.*trigger\|logic.*action" logs/server/god_kaiser.log

# Sequence-Execution (Actuator-Sequenzen)
grep "sequence.*start\|sequence.*stop\|sequence.*step" logs/server/god_kaiser.log

# Maintenance-Jobs
grep "maintenance\|cleanup\|retention" logs/server/god_kaiser.log

# Mock-ESP-Simulation
grep "simulation\|mock.*esp\|mock.*actuator" logs/server/god_kaiser.log

# Safety-Events
grep "safety.*block\|safety.*check\|conflict.*detect" logs/server/god_kaiser.log
```

### 13.4 Korrigierte Docker-Service-Namen

| FALSCH (im Agentplan) | RICHTIG |
|----------------------|---------|
| `god-kaiser-server` | `el-servador` |
| `mosquitto` | `mqtt-broker` |
| `postgres` | `automationone-postgres` |

### 13.5 Fehlende Quick-Commands

```bash
# Alembic Migration-Status
docker compose exec el-servador alembic current

# DB-Tabellen-Größen
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT tablename, pg_size_pretty(pg_total_relation_size('public.'||tablename))
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;"

# MQTT-Handler-Stats (via Debug-Endpoint)
curl -s http://localhost:8000/api/v1/debug/mqtt-stats

# Resilience-Status (im Health-Detailed)
curl -s http://localhost:8000/api/v1/health/detailed | python -m json.tool

# Container-Logs aller Services
docker compose logs --tail=20 el-servador mqtt-broker automationone-postgres
```

### 13.6 Sicherheitsregeln (bestätigt)

| Erlaubt | Verboten (User-Bestätigung nötig) |
|---------|----------------------------------|
| `docker compose ps` | `docker compose restart el-servador` |
| `docker compose logs --tail=N el-servador` | `curl -X POST/PUT/DELETE` (schreibende API) |
| `curl -s http://localhost:8000/...` (GET only) | Jede schreibende SQL (DELETE, UPDATE, DROP) |
| `mosquitto_sub -C N -W N` (mit Timeout!) | Alembic migrate/downgrade |
| `docker exec automationone-postgres psql -c "SELECT ..."` | Container starten/stoppen |
| Grep in Log-Dateien | Server-Restart |

### 13.7 Config-System Wissen

Der Agent sollte wissen:
- **17 Settings-Klassen** via Pydantic BaseSettings
- **Alle Werte konfigurierbar via .env** → bei Problemen `.env` prüfen
- **Default JWT-Key** → SECURITY CRITICAL in Production
- **Cleanup-Jobs alle DISABLED per Default** → bewusste Design-Entscheidung
- **Resilience-Settings** → Circuit Breaker Thresholds konfigurierbar

---

## 14. Zusammenfassung: Abdeckung des Agents

### Was der Agent BEREITS gut abdeckt:
- ✅ Log-Format (JSON-Felder)
- ✅ Error-Code-Interpretation (5000-5699)
- ✅ Circuit Breaker Diagnose (3 Breaker)
- ✅ Health-Endpoints als Debug-Tool
- ✅ Eigenständige Erweiterung (Docker, curl, SQL, mosquitto_sub)
- ✅ Zwei Modi (A/B)
- ✅ Sicherheitsregeln
- ✅ Report-Format

### Was der Agent VERBESSERN sollte:
- ⚠️ Startup-Sequenz: 14 → 20+ Steps dokumentieren
- ⚠️ Logger→Handler: 15 → 21+ Logger dokumentieren
- ⚠️ Grep-Patterns: Logic-Engine, Simulation, Safety, Maintenance fehlen
- ⚠️ Docker-Service-Namen: K1/K2/K3 Korrekturen
- ⚠️ Config-System-Wissen: 17 Settings-Klassen kennen
- ⚠️ Resilience-Details: Retry, Timeout, Offline-Buffer (nicht nur Circuit Breaker)
- ⚠️ Quick-Commands: Alembic, DB-Größen, Debug-Endpoint, Container-Logs

### Was der Agent NICHT abdecken muss (andere Agents):
- ESP32 Serial-Logs → `esp32-debug`
- MQTT Broker-Level → `mqtt-debug`
- Frontend Build/Runtime → `frontend-debug`
- DB-Schema/Migrations → `db-inspector`
- Code-Änderungen → Dev-Agents

---

*Analyse abgeschlossen. Alle Pfade verifiziert gegen echten Code.*
