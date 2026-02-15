# AutomationOne -- Server-Architektur (El Servador / God-Kaiser Server)

> **Version:** 1.0 | **Stand:** 2026-02-14
> **Grundlage:** Vollstaendige Codebase-Analyse aller Dateien in `El Servador/god_kaiser_server/src/`
> **Referenzen:** REST_ENDPOINTS, WEBSOCKET_EVENTS, MQTT_TOPICS, COMMUNICATION_FLOWS, ERROR_CODES

---

## 1. Ueberblick

| Eigenschaft | Wert |
|-------------|------|
| **Framework** | FastAPI (Python 3.11, async) |
| **Port** | 8000 (REST + WebSocket) |
| **Datenbank** | PostgreSQL 16 (asyncpg, SQLAlchemy 2.0 ORM) |
| **MQTT** | paho-mqtt (Client), Eclipse Mosquitto (Broker, Port 1883) |
| **Source-Dateien** | ~190 Python-Dateien in `src/` |
| **API-Router** | 14 REST-Router, ~170 Endpoints |
| **MQTT-Handler** | 12 Handler-Module + 1 Inline-Handler |
| **Services** | 23+ Services (davon 5 Stubs) |
| **DB-Tabellen** | 19 Tabellen in 15 Model-Dateien |
| **Repositories** | 15 (14 Domain + BaseRepository) |
| **Schemas** | 20 Pydantic-Schema-Dateien |
| **Test-Dateien** | ~119 Test-Module (unit, integration, esp32, e2e) |
| **Pfad** | `El Servador/god_kaiser_server/src/` |

**Kernprinzip:** Der Server ist die zentrale Intelligenz des Systems. ESP32-Geraete sind "dumme Agenten" -- sie erfassen Rohdaten und fuehren Befehle aus. Alle Logik, Verarbeitung, Entscheidungen und Persistenz liegen auf dem Server. Dieses Prinzip garantiert, dass Firmware-Updates auf den ESP32s fast nie noetig sind: neue Sensoren, neue Regeln, neue Aktoren -- alles wird ueber den Server konfiguriert.

**Abhaengigkeiten:** FastAPI, SQLAlchemy 2.0 (asyncpg), paho-mqtt, Pydantic + pydantic-settings, APScheduler, prometheus-fastapi-instrumentator, python-jose (JWT), passlib (bcrypt), uvicorn.

---

## 2. Dateistruktur

Die tatsaechliche Verzeichnisstruktur von `El Servador/god_kaiser_server/src/`:

```
src/
├── main.py                                  # Entry-Point, Lifespan (529 Zeilen)
├── __init__.py
│
├── api/
│   ├── sensor_processing.py                 # Pi-Enhanced HTTP-Endpoint (385 Zeilen)
│   ├── deps.py                              # Auth-Dependencies (ActiveUser, OperatorUser, AdminUser)
│   └── v1/                                  # 14 REST-Router
│       ├── __init__.py                      # api_v1_router (Router-Aggregation)
│       ├── auth.py                          # JWT Login, Refresh, Setup (631 Zeilen)
│       ├── audit.py                         # Audit-Logs, Retention, Backups (1.366 Zeilen)
│       ├── errors.py                        # Error-Logs, Stats, Code-Referenz (328 Zeilen)
│       ├── esp.py                           # ESP-Verwaltung, Approval/Reject (1.306 Zeilen)
│       ├── sensors.py                       # Sensor CRUD, Daten, Kalibrierung (1.526 Zeilen)
│       ├── sensor_type_defaults.py          # Defaults pro Sensor-Typ (271 Zeilen)
│       ├── actuators.py                     # Aktor CRUD, Commands, Safety (674 Zeilen)
│       ├── health.py                        # Liveness, Readiness, Metriken (390 Zeilen)
│       ├── logic.py                         # Logic-Rules CRUD, Toggle, History (607 Zeilen)
│       ├── debug.py                         # Mock-ESP, DB Explorer, Logs, MQTT (4.324 Zeilen)
│       ├── users.py                         # User CRUD, Password-Reset (320 Zeilen)
│       ├── zone.py                          # Zone-Zuweisung, ESPs pro Zone (300 Zeilen)
│       ├── subzone.py                       # Subzone CRUD, Sensor-Zuordnung (419 Zeilen)
│       ├── sequences.py                     # Sequences auflisten, Cancel (177 Zeilen)
│       └── websocket/
│           └── realtime.py                  # WebSocket-Endpoint (145 Zeilen)
│
├── core/
│   ├── config.py                            # Pydantic Settings, Env-Prefixe (635 Zeilen)
│   ├── config_mapping.py                    # Config-Mapping ESP <-> Server (506 Zeilen)
│   ├── constants.py                         # Systemkonstanten (301 Zeilen)
│   ├── error_codes.py                       # Error-Code-Definitionen 5000-5699 (482 Zeilen)
│   ├── exceptions.py                        # Exception-Hierarchie (381 Zeilen)
│   ├── exception_handlers.py                # Global Exception Handler (97 Zeilen)
│   ├── logging_config.py                    # JSON-Logging, Rotation (167 Zeilen)
│   ├── metrics.py                           # Prometheus Gauges, Counters, Histograms (262 Zeilen)
│   ├── scheduler.py                         # APScheduler Central Scheduler (439 Zeilen)
│   ├── security.py                          # JWT, Password-Hashing, Auth-Utils (274 Zeilen)
│   └── resilience/                          # Resilience-Pattern-Paket (~1.761 Zeilen gesamt)
│       ├── __init__.py                      # Re-Exports
│       ├── circuit_breaker.py               # CircuitBreaker, CircuitState
│       ├── retry.py                         # Retry-Decorator, Exponential Backoff
│       ├── timeout.py                       # Timeout-Decorator, Fallback
│       ├── registry.py                      # ResilienceRegistry (Singleton)
│       └── exceptions.py                    # CircuitBreakerOpenError, ServiceUnavailableError
│
├── db/
│   ├── base.py                              # SQLAlchemy Base + TimestampMixin (47 Zeilen)
│   ├── session.py                           # Async Session, DB Circuit Breaker (317 Zeilen)
│   ├── models/                              # 15 Model-Dateien -> 19 Tabellen
│   │   ├── esp.py                           # ESPDevice
│   │   ├── sensor.py                        # SensorConfig, SensorData
│   │   ├── sensor_type_defaults.py          # SensorTypeDefaults
│   │   ├── actuator.py                      # ActuatorConfig, ActuatorState, ActuatorHistory
│   │   ├── logic.py                         # CrossESPLogic, LogicExecutionHistory
│   │   ├── logic_validation.py              # Pydantic-Models fuer JSON-Conditions/Actions
│   │   ├── esp_heartbeat.py                 # ESPHeartbeatLog (8 Indizes)
│   │   ├── audit_log.py                     # AuditLog, AuditEventType, AuditSeverity
│   │   ├── user.py                          # User (JWT Auth)
│   │   ├── auth.py                          # TokenBlacklist
│   │   ├── subzone.py                       # SubzoneConfig
│   │   ├── system.py                        # SystemConfig
│   │   ├── kaiser.py                        # KaiserRegistry, ESPOwnership
│   │   ├── ai.py                            # AIPredictions (vorbereitet)
│   │   ├── library.py                       # LibraryMetadata
│   │   └── enums.py                         # DataSource, SensorOperatingMode
│   └── repositories/                        # 15 Repositories
│       ├── base_repo.py                     # BaseRepository (generisches CRUD-Pattern)
│       ├── esp_repo.py                      # ESPRepository
│       ├── sensor_repo.py                   # SensorRepository
│       ├── sensor_type_defaults_repo.py     # SensorTypeDefaultsRepository
│       ├── actuator_repo.py                 # ActuatorRepository
│       ├── logic_repo.py                    # LogicRepository
│       ├── esp_heartbeat_repo.py            # ESPHeartbeatRepository
│       ├── audit_log_repo.py                # AuditLogRepository
│       ├── user_repo.py                     # UserRepository
│       ├── token_blacklist_repo.py          # TokenBlacklistRepository
│       ├── subzone_repo.py                  # SubzoneRepository
│       ├── system_config_repo.py            # SystemConfigRepository
│       ├── kaiser_repo.py                   # KaiserRepository
│       ├── ai_repo.py                       # AIRepository
│       └── library_repo.py                  # LibraryRepository
│
├── mqtt/
│   ├── client.py                            # Singleton MQTT-Client, Auto-Reconnect (488 Zeilen)
│   ├── publisher.py                         # Retry, Exponential Backoff + Jitter (425 Zeilen)
│   ├── subscriber.py                        # Handler Registry, Thread Pool (364 Zeilen)
│   ├── topics.py                            # TopicBuilder, Wildcard Matching (795 Zeilen)
│   ├── offline_buffer.py                    # Deque (max 1000), Auto-Flush (357 Zeilen)
│   └── handlers/                            # 12 Handler-Module
│       ├── base_handler.py                  # BaseHandler-Klasse (584 Zeilen)
│       ├── sensor_handler.py                # Sensor-Daten + Pi-Enhanced (733 Zeilen)
│       ├── heartbeat_handler.py             # Discovery, Health, Timeout (971 Zeilen)
│       ├── actuator_handler.py              # Actuator-Status (458 Zeilen)
│       ├── actuator_response_handler.py     # Command-Bestaetigung (280 Zeilen)
│       ├── actuator_alert_handler.py        # Emergency/Timeout-Alerts (321 Zeilen)
│       ├── config_handler.py                # Config-ACK (462 Zeilen)
│       ├── zone_ack_handler.py              # Zone-Assignment ACK (316 Zeilen)
│       ├── subzone_ack_handler.py           # Subzone-ACK (175 Zeilen)
│       ├── lwt_handler.py                   # Last Will & Testament (211 Zeilen)
│       ├── error_handler.py                 # ESP32 Error-Events (330 Zeilen)
│       ├── discovery_handler.py             # ESP32 Discovery (224 Zeilen)
│       ├── diagnostics_handler.py           # HealthMonitor Snapshots (264 Zeilen)
│       └── kaiser_handler.py                # Stub (21 Zeilen, PLANNED, nicht implementiert)
│
├── sensors/
│   ├── library_loader.py                    # LibraryLoader Singleton (310 Zeilen)
│   ├── base_processor.py                    # BaseSensorProcessor ABC (253 Zeilen)
│   ├── sensor_type_registry.py              # Sensor-Typ-Normalisierung (290 Zeilen)
│   └── sensor_libraries/active/             # 9 Processing-Libraries
│       ├── ph_sensor.py                     # pH-Wert (ADC -> Spannungs-Kompensation -> pH)
│       ├── ec_sensor.py                     # EC-Leitfaehigkeit (Temperatur-Kompensation)
│       ├── temperature.py                   # DS18B20, SHT31 Temperatur
│       ├── humidity.py                      # Luftfeuchtigkeit
│       ├── moisture.py                      # Bodenfeuchte (ADC -> Prozent)
│       ├── pressure.py                      # BMP280 Druck (Validierung, Unit-Konvertierung)
│       ├── co2.py                           # CO2-Konzentration
│       ├── flow.py                          # Durchfluss (Pulse -> Liter/min)
│       └── light.py                         # Lichtstaerke (ADC -> Lux)
│
├── services/
│   ├── logic_engine.py                      # Rule-Evaluation, Background-Task (781 Zeilen)
│   ├── logic_scheduler.py                   # Timer-basierte Logic-Evaluation (131 Zeilen)
│   ├── logic_service.py                     # CRUD fuer Rules (426 Zeilen)
│   ├── actuator_service.py                  # Command Execution, Safety, MQTT Publish (279 Zeilen)
│   ├── safety_service.py                    # Safety Validation vor Commands (264 Zeilen)
│   ├── sensor_service.py                    # Sensor CRUD + Processing (545 Zeilen)
│   ├── zone_service.py                      # Zone-Management (454 Zeilen)
│   ├── subzone_service.py                   # Subzone CRUD (595 Zeilen)
│   ├── esp_service.py                       # ESP CRUD, Discovery, Approval (950 Zeilen)
│   ├── config_builder.py                    # Config-Payload fuer MQTT (249 Zeilen)
│   ├── gpio_validation_service.py           # GPIO-Konflikte, Board-Constraints (497 Zeilen)
│   ├── sensor_scheduler_service.py          # Scheduled Sensor Jobs (545 Zeilen)
│   ├── sensor_type_registration.py          # Auto-Registration beim Startup (252 Zeilen)
│   ├── event_aggregator_service.py          # Event-Aggregation (740 Zeilen)
│   ├── audit_retention_service.py           # Audit Cleanup + Auto-Retention (894 Zeilen)
│   ├── audit_backup_service.py              # Audit Backups + Restore (506 Zeilen)
│   ├── mqtt_auth_service.py                 # MQTT-Credentials-Management (377 Zeilen)
│   ├── health_service.py                    # Stub (1 Zeile)
│   ├── god_client.py                        # Stub (1 Zeile)
│   ├── ai_service.py                        # Stub (1 Zeile)
│   ├── library_service.py                   # Stub (1 Zeile)
│   ├── kaiser_service.py                    # Stub (1 Zeile)
│   ├── logic/
│   │   ├── validator.py                     # LogicValidator (363 Zeilen)
│   │   ├── conditions/                      # Modulare Condition-Evaluatoren
│   │   │   ├── base.py                      # BaseConditionEvaluator ABC
│   │   │   ├── sensor_evaluator.py          # sensor_threshold, sensor (132 Zeilen)
│   │   │   ├── time_evaluator.py            # time_window, time (140 Zeilen)
│   │   │   ├── hysteresis_evaluator.py      # Anti-Flattern (293 Zeilen)
│   │   │   └── compound_evaluator.py        # AND/OR-Logik (130 Zeilen)
│   │   ├── actions/                         # Modulare Action-Executoren
│   │   │   ├── base.py                      # BaseActionExecutor ABC, ActionResult
│   │   │   ├── actuator_executor.py         # actuator_command (156 Zeilen)
│   │   │   ├── delay_executor.py            # Verzoegerung 1-3600s (108 Zeilen)
│   │   │   ├── notification_executor.py     # WebSocket/Email/Webhook (249 Zeilen)
│   │   │   └── sequence_executor.py         # Verkettete Actions (907 Zeilen)
│   │   └── safety/                          # Safety-Komponenten
│   │       ├── conflict_manager.py          # Priority-basierte Aktor-Locks (255 Zeilen)
│   │       ├── rate_limiter.py              # max_executions_per_hour (211 Zeilen)
│   │       └── loop_detector.py             # Zirkulaere Dependencies (238 Zeilen)
│   ├── maintenance/
│   │   ├── service.py                       # MaintenanceService (604 Zeilen)
│   │   └── jobs/
│   │       ├── cleanup.py                   # 4 Cleanup-Klassen (703 Zeilen)
│   │       └── sensor_health.py             # Stale-Sensor-Detection (412 Zeilen)
│   └── simulation/
│       ├── scheduler.py                     # SimulationScheduler, MockESPRuntime (1.723 Zeilen)
│       └── actuator_handler.py              # MockActuatorHandler (770 Zeilen)
│
├── schemas/                                 # 20 Pydantic-Schema-Dateien
│   ├── esp.py, sensor.py, actuator.py, logic.py, auth.py, user.py
│   ├── health.py, zone.py, subzone.py, sequence.py, debug.py, debug_db.py
│   ├── common.py, api_response.py, error_schemas.py, sensor_type_defaults.py
│   ├── ai.py, library.py, kaiser.py
│   └── __init__.py
│
├── utils/                                   # 5 Helper-Module
│   ├── sensor_formatters.py                 # Sensor-Daten-Formatierung
│   ├── network_helpers.py                   # Netzwerk-Utilities
│   ├── mqtt_helpers.py                      # MQTT-Hilfs-Funktionen
│   ├── data_helpers.py                      # Daten-Konvertierung
│   └── time_helpers.py                      # Zeit-Utilities
│
├── middleware/
│   └── request_id.py                        # UUID pro Request (68 Zeilen)
│
└── websocket/
    └── manager.py                           # WebSocketManager Singleton (317 Zeilen)
```

---

## 3. Entry-Point und Startup-Sequenz

Die Server-Initialisierung folgt einer strikten Reihenfolge in `main.py` (Lifespan-Context). Jeder Schritt hat einen definierten Log-Marker:

| Schritt | main.py Zeilen | Log-Pattern | Was passiert |
|---------|---------------|-------------|-------------|
| 0 | 95-97 | `God-Kaiser Server Starting...` | Lifespan-Start |
| 0.1 | 101-128 | `Validating security configuration...` | JWT-Secret pruefen: Prod + Default-Key = SystemExit. MQTT-TLS-Warnung wenn deaktiviert |
| 0.5 | 130-152 | `Initializing resilience patterns...` | ResilienceRegistry Singleton, external_api Circuit Breaker registrieren |
| 1 | 155-166 | `Initializing database...` | `init_db()` (PostgreSQL verbinden, Tabellen erstellen), `init_db_circuit_breaker()` |
| 2 | 168-179 | `Connecting to MQTT broker...` | `MQTTClient.get_instance().connect()` -- nicht-fatal bei Fehler (Auto-Reconnect) |
| 3 | 182-271 | `Registering MQTT handlers...` | Subscriber erzeugen, Main-Event-Loop setzen, 12 Handler + Mock-ESP-Handler registrieren |
| 3.4 | 274-277 | `Central Scheduler started` | `init_central_scheduler()` (APScheduler) |
| 3.4.1 | 279-290 | `SimulationScheduler initialized` | `init_simulation_scheduler(mqtt_publish_for_simulation)` + Mock-ESP Actuator-Handler |
| 3.4.2 | 324-334 | `MaintenanceService initialized and started` | `init_maintenance_service()`, registriert Cleanup- und Health-Jobs |
| 3.4.3 | 338-354 | `Prometheus metrics job registered` | `update_all_metrics_async` alle 15 Sekunden |
| 3.5 | 356-368 | `Mock-ESP recovery complete` | `SimulationScheduler.recover_mocks()` -- aktive Simulationen aus DB wiederherstellen |
| 3.6 | 370-388 | `Sensor type auto-registration` | `auto_register_sensor_types()` -- idempotent, neue Libraries registrieren |
| 3.7 | 390-417 | `Sensor schedule recovery complete` | `SensorSchedulerService.recover_all_jobs()` -- Scheduled-Sensor-Jobs wiederherstellen |
| 4 | 419-424 | `MQTT subscriptions complete` | `subscribe_all()` (nur wenn connected) |
| 5 | 427-431 | `WebSocket Manager initialized` | `WebSocketManager.get_instance()`, `initialize()` |
| 6 | 434-480 | `Services initialized successfully` | SafetyService, ActuatorService, LogicEngine (mit allen Evaluatoren und Executoren), LogicScheduler |
| FINAL | 482-491 | `God-Kaiser Server Started Successfully` | Environment, Log-Level, MQTT-Broker, Resilience-Status |

**Kritische Schritte:**
- Schritt 0.1: Production-Mode mit Default-JWT-Key = sofortiger Exit (`SystemExit`)
- Schritt 6: Circular-Dependency-Aufloesung: SequenceActionExecutor bekommt via `set_action_executors()` Zugriff auf alle anderen Executoren, nachdem alle erstellt wurden

### Shutdown-Sequenz

Die Shutdown-Reihenfolge ist das Inverse der Startup-Reihenfolge (main.py, ab Zeile 496):

| Schritt | Was wird gestoppt | Warum diese Reihenfolge |
|---------|-------------------|-------------------------|
| 1 | Logic Scheduler | Keine neuen Timer-Evaluierungen |
| 2 | Logic Engine | Keine neuen Rule-Ausfuehrungen |
| 2.1 | SequenceActionExecutor | Cleanup-Task beenden |
| 2.3 | MaintenanceService | Jobs entfernen (vor Scheduler-Shutdown) |
| 2.4 | SimulationScheduler (alle Mocks stoppen) | Mock-ESPs koennen noch MQTT senden |
| 2.5 | Central Scheduler | APScheduler herunterfahren |
| 3 | WebSocket Manager | Alle Connections schliessen |
| 4 | MQTT Subscriber (Thread Pool) | `shutdown(wait=True, timeout=30s)` |
| 5 | MQTT Client | `disconnect()` (stoppt Background-Thread) |
| 6 | Database Engine | `dispose_engine()` (Connection-Pool freigeben) |

---

## 4. API-Layer

14 REST-Router unter `/api/v1/`, zusammengefuehrt in `api/v1/__init__.py`. Zusaetzlich: `api/sensor_processing.py` (Pi-Enhanced HTTP-Endpoint, ausserhalb v1).

### 4.1 Router-Uebersicht

| Router | Datei | Prefix | Endpoints | Auth | Kernfunktionalitaet |
|--------|-------|--------|-----------|------|---------------------|
| auth | `api/v1/auth.py` | `/v1/auth` | 10 | Mixed | Login, JWT-Token, Refresh, Setup, MQTT-Credentials |
| audit | `api/v1/audit.py` | `/v1/audit` | 22 | Admin | Audit-Logs, Retention, Export, Backups, Auto-Cleanup |
| errors | `api/v1/errors.py` | `/v1/errors` | 4 | JWT | Error-Logs, Stats, Error-Code-Referenz |
| esp | `api/v1/esp.py` | `/v1/esp` | 15 | Mixed | Device-Registry, Pending, Approval/Reject, Config-Push, GPIO-Status |
| sensors | `api/v1/sensors.py` | `/v1/sensors` | 12 | JWT | Sensor CRUD, historische Daten, Kalibrierung, OneWire-Scan, Trigger |
| sensor_type_defaults | `api/v1/sensor_type_defaults.py` | `/v1/sensors/type-defaults` | 6 | JWT | Defaults pro Sensor-Typ (Unit, Min/Max) |
| actuators | `api/v1/actuators.py` | `/v1/actuators` | 8 | JWT | Aktor CRUD, Commands, History, Emergency-Stop |
| health | `api/v1/health.py` | `/v1/health` | 6 | Mixed | live, ready, detailed, database, mqtt, esp, metrics |
| logic | `api/v1/logic.py` | `/v1/logic` | 8 | JWT | Rules CRUD, Toggle, Test, Execution-History |
| debug | `api/v1/debug.py` | `/v1/debug` | ~60 | JWT | Mock-ESP (CRUD, Heartbeat, Sensoren, Actuators), DB Explorer, Logs, MQTT, Scheduler, Resilience |
| users | `api/v1/users.py` | `/v1/users` | 7 | Admin | User CRUD, Password-Reset, Rollenaenderung |
| zone | `api/v1/zone.py` | `/v1/zone` | 5 | Mixed | Zone-Zuweisung (MQTT), ESPs pro Zone, Unassigned |
| subzone | `api/v1/subzone.py` | `/v1/subzone` | 6 | JWT | Subzone CRUD, Sensor-Zuordnung |
| sequences | `api/v1/sequences.py` | `/sequences` | 4 | JWT | Sequences auflisten, Details, Stats, Cancel |

**Authentifizierung:** JWT Bearer Token. Access Token (30 min default), Refresh Token (7 Tage). Drei Rollen-Stufen:
- `ActiveUser` (JWT) -- Standard, alle authentifizierten User
- `OperatorUser` -- Operator-Rolle (ESP-Management, Config-Push)
- `AdminUser` -- Admin-Rolle (User-Management, Audit)

Health-Endpoints (`/live`, `/ready`, `/metrics`) und Auth-Status (`/auth/status`, `/auth/setup`) sind oeffentlich.

Vollstaendige Endpoint-Referenz: `.claude/reference/api/REST_ENDPOINTS.md`

### 4.2 Pi-Enhanced HTTP-Endpoint

`api/sensor_processing.py` (385 Zeilen) stellt einen separaten REST-Endpoint bereit, ueber den ESP32-Geraete Sensor-Rohdaten per HTTP (statt MQTT) zur Verarbeitung schicken koennen. Dieser Endpoint nutzt denselben LibraryLoader wie der MQTT-Pfad.

---

## 5. MQTT-Layer

### 5.1 Client-Architektur

Die MQTT-Infrastruktur besteht aus fuenf Modulen im `mqtt/`-Verzeichnis:

| Modul | Datei | Zeilen | Verantwortung |
|-------|-------|--------|---------------|
| Client | `mqtt/client.py` | 488 | Singleton, paho-mqtt, Auto-Reconnect (`reconnect_delay_set(min=1, max=60)`), Circuit Breaker |
| Publisher | `mqtt/publisher.py` | 425 | Retry mit Exponential Backoff + Jitter, Failed Messages gehen in Offline-Buffer |
| Subscriber | `mqtt/subscriber.py` | 364 | Handler Registry, Thread Pool (`max_workers=10`), Async-Handler-Dispatch via `asyncio.run_coroutine_threadsafe()` |
| Topics | `mqtt/topics.py` | 795 | TopicBuilder (statische Topic-Konstruktion), Wildcard Matching, Topic-Parsing per Regex |
| Offline Buffer | `mqtt/offline_buffer.py` | 357 | `collections.deque` (max 1000), `asyncio.Lock`, Auto-Flush nach Reconnect (Batch 50, 0.1s Delay) |

**Kritisches Design:** MQTT-Callbacks von paho laufen in einem separaten Thread. Alle async Handler-Funktionen (die SQLAlchemy AsyncEngine nutzen) muessen im Main-Event-Loop ausgefuehrt werden. Der Subscriber setzt den Main-Loop explizit via `set_main_loop()` (main.py, Zeile ~192) und dispatcht Handler via `asyncio.run_coroutine_threadsafe()`.

### 5.2 Handler-Uebersicht

12 Handler-Module plus ein Inline-Handler in main.py. Alle Topics verwenden Wildcard `+` fuer `kaiser_id` (Multi-Kaiser-Support):

| Handler | Datei | Topic-Pattern | Zeilen | Verarbeitung |
|---------|-------|---------------|--------|-------------|
| sensor_handler | `mqtt/handlers/sensor_handler.py` | `kaiser/+/esp/+/sensor/+/data` | 733 | Topic parsen, Payload validieren, ESP/Sensor-Lookup, Pi-Enhanced Processing, DB-Save (resilient_session), Logic Engine (async), WebSocket Broadcast |
| heartbeat_handler | `mqtt/handlers/heartbeat_handler.py` | `kaiser/+/esp/+/system/heartbeat` | 971 | Auto-Discovery (neue ESPs registrieren), Health-Tracking, Timeout-Detection, esp_heartbeat_logs, Heartbeat-ACK senden |
| actuator_handler | `mqtt/handlers/actuator_handler.py` | `kaiser/+/esp/+/actuator/+/status` | 458 | Aktor-Status -> actuator_states updaten, WebSocket Broadcast (`actuator_status`) |
| actuator_response_handler | `mqtt/handlers/actuator_response_handler.py` | `kaiser/+/esp/+/actuator/+/response` | 280 | Command-Bestaetigung vom ESP, actuator_history updaten, WebSocket (`actuator_response`) |
| actuator_alert_handler | `mqtt/handlers/actuator_alert_handler.py` | `kaiser/+/esp/+/actuator/+/alert` | 321 | Emergency-Stop, Safety-Timeout Alerts, WebSocket (`actuator_alert`) |
| config_handler | `mqtt/handlers/config_handler.py` | `kaiser/+/esp/+/config_response` | 462 | Config-ACK vom ESP verarbeiten, Config-Status updaten, WebSocket (`config_response`) |
| zone_ack_handler | `mqtt/handlers/zone_ack_handler.py` | `kaiser/+/esp/+/zone/ack` | 316 | Zone-Zuweisung bestaetigt, ESP-Record updaten, WebSocket (`zone_assignment`) |
| subzone_ack_handler | `mqtt/handlers/subzone_ack_handler.py` | `kaiser/+/esp/+/subzone/ack` | 175 | Subzone-ACK, WebSocket (`subzone_assignment`) |
| lwt_handler | `mqtt/handlers/lwt_handler.py` | `kaiser/+/esp/+/system/will` | 211 | Last Will & Testament: ESP offline setzen, Audit-Log, WebSocket Broadcast |
| error_handler | `mqtt/handlers/error_handler.py` | `kaiser/+/esp/+/system/error` | 330 | ESP32 Error-Events (GPIO, I2C, OneWire, etc.), Audit-Log, WebSocket (`error_event`) |
| discovery_handler | `mqtt/handlers/discovery_handler.py` | `kaiser/+/discovery/esp32_nodes` | 224 | ESP32 Discovery-Broadcasts verarbeiten |
| diagnostics_handler | `mqtt/handlers/diagnostics_handler.py` | `kaiser/+/esp/+/system/diagnostics` | 264 | HealthMonitor Snapshots (Heap, RSSI, Uptime, State), WebSocket (`esp_diagnostics`) |
| Mock-ESP (inline) | `main.py` Zeilen 291-319 | `kaiser/+/esp/+/actuator/+/command`, `kaiser/+/esp/+/actuator/emergency`, `kaiser/broadcast/emergency` | ~30 | Route Actuator-Commands an `SimulationScheduler.handle_mqtt_message()` fuer aktive Mock-ESPs |

**Hinweis:** `kaiser_handler.py` existiert als Stub (21 Zeilen, Status: PLANNED) fuer zukuenftigen Multi-Kaiser-Support. Es ist nicht implementiert und nicht registriert. `base_handler.py` (584 Zeilen) stellt die Basis-Klasse fuer Handler mit gemeinsamer Logik (Topic-Parsing, Payload-Validierung, Resilience) bereit.

---

## 6. Service-Layer

### 6.1 Aktive Services

| Service | Datei | Zeilen | Verantwortung | Abhaengigkeiten |
|---------|-------|--------|---------------|-----------------|
| LogicEngine | `services/logic_engine.py` | 781 | Background-Task, Rule-Evaluation bei Sensor-Events und Timer-Trigger | LogicRepository, ActuatorService, WebSocketManager, Condition-Evaluatoren, Action-Executoren, ConflictManager, RateLimiter |
| LogicScheduler | `services/logic_scheduler.py` | 131 | Timer-basierte Logic-Evaluation (Default: 60s Intervall) | LogicEngine |
| LogicService | `services/logic_service.py` | 426 | CRUD-Operationen fuer Cross-ESP Logic Rules | LogicRepository, LogicValidator |
| ActuatorService | `services/actuator_service.py` | 279 | Command Execution: Safety-Check, MQTT Publish, State-Update | ActuatorRepository, SafetyService, Publisher |
| SafetyService | `services/safety_service.py` | 264 | Pre-Command Validation: ESP online?, Aktor existiert?, GPIO-Konflikt?, Emergency-State? | ActuatorRepository, ESPRepository |
| SensorService | `services/sensor_service.py` | 545 | Sensor CRUD, Processing-Trigger, Kalibrierung | SensorRepository, LibraryLoader |
| ZoneService | `services/zone_service.py` | 454 | Zone-Management: Zuweisung via MQTT, Zone-CRUD, Mock-ESP-Erkennung | ESPRepository, Publisher |
| SubzoneService | `services/subzone_service.py` | 595 | Subzone CRUD, Sensor-Zuordnung, SafeMode-Control | SubzoneRepository, SensorRepository, Publisher |
| ESPService | `services/esp_service.py` | 950 | ESP-Lifecycle: CRUD, Discovery, Approval/Reject, Health-Tracking, Rate-Limited Discovery | ESPRepository, Publisher, AuditLogRepository |
| ConfigPayloadBuilder | `services/config_builder.py` | 249 | Config-Payload-Erstellung fuer MQTT-Push an ESP32 | SensorRepository, ActuatorRepository |
| GpioValidationService | `services/gpio_validation_service.py` | 497 | GPIO-Konflikt-Erkennung, Board-Constraints (ESP32-WROOM vs XIAO) | SensorRepository, ActuatorRepository |
| SensorSchedulerService | `services/sensor_scheduler_service.py` | 545 | APScheduler-Jobs fuer Sensoren mit `operating_mode='scheduled'` | SensorRepository, ESPRepository, Publisher, CentralScheduler |
| SensorTypeRegistrationService | `services/sensor_type_registration.py` | 252 | Auto-Registration: Sensor-Libraries -> sensor_type_defaults | LibraryLoader, SensorTypeDefaultsRepository |
| MaintenanceService | `services/maintenance/service.py` | 604 | Registriert Cleanup- und Health-Jobs beim CentralScheduler | CentralScheduler, MQTTClient, SessionFactory |
| EventAggregatorService | `services/event_aggregator_service.py` | 740 | Event-Aggregation fuer Audit-Timeline und Dashboard-Statistiken | AuditLogRepository |
| AuditRetentionService | `services/audit_retention_service.py` | 894 | Audit-Cleanup mit konfigurierbarer Retention und Auto-Cleanup | AuditLogRepository |
| AuditBackupService | `services/audit_backup_service.py` | 506 | Audit-Log Backup, Restore, Download, WebSocket-Notification bei Restore | AuditLogRepository, WebSocketManager |
| MQTTAuthService | `services/mqtt_auth_service.py` | 377 | Mosquitto MQTT-Credentials: Password-File Management, Credential-Distribution via MQTT | MQTTClient, Publisher |
| SimulationScheduler | `services/simulation/scheduler.py` | 1.723 | Mock-ESP Lifecycle: Create, Start, Stop, Recovery, Auto-Heartbeat, Sensor-Simulation | CentralScheduler, MQTTClient, ESPRepository |
| MockActuatorHandler | `services/simulation/actuator_handler.py` | 770 | Mock-ESP Actuator-Command-Verarbeitung: Status-Simulation, Response, Alerts | MQTTClient |
| LogicValidator | `services/logic/validator.py` | 363 | Validierung von Logic-Rules: Conditions, Actions, Safety-Constraints, Duplikate | SensorRepository, ActuatorRepository |

### 6.2 Stub-Services (vorbereitet, nicht implementiert)

| Service | Datei | Zweck |
|---------|-------|-------|
| HealthService | `services/health_service.py` | Aggregierte Health-Informationen |
| GodClient | `services/god_client.py` | God-Layer-Kommunikation (Multi-Tier) |
| AIService | `services/ai_service.py` | KI-Vorhersagen |
| LibraryService | `services/library_service.py` | Sensor-Library-OTA-Management |
| KaiserService | `services/kaiser_service.py` | Multi-Kaiser-Koordination |

---

## 7. Logic Engine

Die Logic Engine ermoeglicht regelbasierte Automation ueber mehrere ESP32 hinweg. Beispiel: "Wenn der Temperatursensor an ESP_01 ueber 28 Grad steigt, schalte den Luefter an ESP_02 ein."

### 7.1 Architektur

```
Sensor-Daten (MQTT)
       |
       v
  sensor_handler.py --> logic_engine.evaluate_sensor_data()  (async, non-blocking)
                               |
                               v
                        Regeln aus DB laden (get_rules_by_trigger)
                               |
                               v
                    +----------+-----------+
                    |  Conditions pruefen  |
                    |  (modulare Evaluatoren)
                    +----------+-----------+
                               | Match?
                    +----------+-----------+
                    |  Safety-Checks       |
                    |  ConflictManager     |
                    |  RateLimiter         |
                    +----------+-----------+
                               | Freigegeben?
                    +----------+-----------+
                    |  Actions ausfuehren  |
                    |  (modulare Executoren)
                    +----------------------+
```

### 7.2 Condition-Evaluatoren

Alle Evaluatoren in `services/logic/conditions/`, erben von `BaseConditionEvaluator` (ABC):

| Evaluator | Datei | Zeilen | Condition-Typen | Beschreibung |
|-----------|-------|--------|-----------------|-------------|
| SensorConditionEvaluator | `conditions/sensor_evaluator.py` | 132 | `sensor_threshold`, `sensor` | Sensor-Wert-Vergleich (>, <, ==, >=, <=) |
| TimeConditionEvaluator | `conditions/time_evaluator.py` | 140 | `time_window`, `time` | Zeitfenster (z.B. 08:00-18:00) |
| HysteresisConditionEvaluator | `conditions/hysteresis_evaluator.py` | 293 | `hysteresis` | Anti-Flattern: Aktivieren bei >28, Deaktivieren bei <24 |
| CompoundConditionEvaluator | `conditions/compound_evaluator.py` | 130 | `compound` | AND/OR-Logik ueber andere Conditions |

### 7.3 Action-Executoren

Alle Executoren in `services/logic/actions/`, erben von `BaseActionExecutor` (ABC):

| Executor | Datei | Zeilen | Action-Typ | Beschreibung |
|----------|-------|--------|------------|-------------|
| ActuatorActionExecutor | `actions/actuator_executor.py` | 156 | `actuator_command` | Aktor steuern via ActuatorService (Safety-Check inklusive) |
| DelayActionExecutor | `actions/delay_executor.py` | 108 | `delay` | Verzoegerung (1-3600 Sekunden) |
| NotificationActionExecutor | `actions/notification_executor.py` | 249 | `notification` | WebSocket-Broadcast, Email (SMTP), Webhook |
| SequenceActionExecutor | `actions/sequence_executor.py` | 907 | `sequence` | Verkettete Actions: Schritt 1 -> Schritt 2 -> Schritt 3. Verwaltet aktive Sequences, Cancelation, Timeout, WebSocket-Progress-Events |

**Circular-Dependency-Aufloesung:** SequenceActionExecutor benoetigt Zugriff auf die anderen Executoren, um Sub-Actions innerhalb einer Sequence auszufuehren. Die Abhaengigkeit wird nach der Erstellung aller Executoren ueber `_sequence_executor.set_action_executors(action_executors)` aufgeloest (main.py, Zeile ~457).

### 7.4 Safety-Komponenten

| Komponente | Datei | Zeilen | Funktion |
|------------|-------|--------|----------|
| ConflictManager | `safety/conflict_manager.py` | 255 | Priority-basierte Aktor-Locks. Verhindert, dass zwei Rules denselben Aktor gleichzeitig steuern. Hoehere Priority gewinnt |
| RateLimiter | `safety/rate_limiter.py` | 211 | Token-Bucket-Algorithmus: Begrenzt Ausfuehrungen pro Rule pro Stunde (`max_executions_per_hour`) |
| LoopDetector | `safety/loop_detector.py` | 238 | Erkennt zirkulaere Abhaengigkeiten zwischen Rules (Rule A triggert Aktor, der Sensor aendert, der Rule B triggert, der Rule A triggert) |

### 7.5 Evaluation-Flow (Detail)

1. `sensor_handler.py` empfaengt Sensor-Daten via MQTT
2. Nach DB-Save ruft der Handler `logic_engine.evaluate_sensor_data(sensor_config_id, value)` auf (async, non-blocking)
3. LogicEngine laedt alle aktiven Rules, deren Trigger zum Sensor passen (`get_rules_by_trigger`)
4. Fuer jede Rule: Conditions evaluieren (alle Evaluatoren durchlaufen)
5. Bei Match: Safety-Checks (ConflictManager, RateLimiter, LoopDetector)
6. Bei Freigabe: Actions ausfuehren (alle zutreffenden Executoren)
7. Ergebnis in `logic_execution_history` speichern
8. WebSocket Broadcast (`logic_execution`)

Timer-basierte Evaluation: LogicScheduler prueft alle 60 Sekunden (konfigurierbar) Rules mit `time_window`-Conditions.

---

## 8. Pi-Enhanced Sensor Processing

### 8.1 Konzept

"Pi-Enhanced Processing" bedeutet: Der Server (urspruenglich ein Raspberry Pi) uebernimmt die rechenintensive Verarbeitung von Sensor-Rohdaten, die der ESP32 nicht effizient ausfuehren kann. Der ESP32 sendet Rohwerte (ADC-Werte, Rohregisterwerte), der Server konvertiert sie in physikalische Groessen.

### 8.2 Pipeline

1. ESP32 liest Rohwert (z.B. ADC-Wert 2150 fuer pH-Sensor)
2. ESP32 sendet via MQTT mit `raw_mode: true` an `kaiser/{id}/esp/{esp_id}/sensor/{gpio}/data`
3. Server empfaengt in `sensor_handler.py` -> `handle_sensor_data()`
4. Handler prueft `raw_mode` und laedt passende Library: `LibraryLoader.get_instance().get_processor(sensor_type)`
5. Library fuehrt `processor.process(raw_value, calibration, params)` aus -> `ProcessingResult(value, unit, quality)`
6. Ergebnis wird: in `sensor_data` gespeichert, via WebSocket (`sensor_data`) broadcast, an LogicEngine weitergeleitet

### 8.3 LibraryLoader

`sensors/library_loader.py` (310 Zeilen) -- Singleton:
- Dynamischer Import via `importlib` aus `sensor_libraries/active/`
- Processor-Instanz-Cache (ein Prozessor pro Sensor-Typ)
- Automatische Discovery neuer Prozessoren beim Init
- Typ-Normalisierung via `sensor_type_registry.py` (ESP32-Format -> Server-Prozessor-Format, z.B. `temperature_sht31` -> `sht31_temp`)

### 8.4 Processing-Interface

`sensors/base_processor.py` (253 Zeilen) definiert die abstrakte Basis-Klasse `BaseSensorProcessor`:

```
BaseSensorProcessor (ABC)
  +-- process(raw_value, calibration, params) -> ProcessingResult
  +-- validate_sensor_data(raw_value) -> ValidationResult
  +-- get_sensor_type() -> str
  +-- get_version() -> str
  +-- calibrate()  (optional)
  +-- get_default_params()  (optional)
  +-- RECOMMENDED_MODE: str  (class attribute, default: "continuous")
  +-- RECOMMENDED_TIMEOUT_SECONDS: int
  +-- RECOMMENDED_INTERVAL_SECONDS: int
  +-- SUPPORTS_ON_DEMAND: bool
```

### 8.5 Verfuegbare Sensor-Libraries

9 Libraries in `sensors/sensor_libraries/active/`:

| Library | Sensor-Typen | Verarbeitung |
|---------|-------------|-------------|
| `ph_sensor.py` | pH | ADC -> Spannungs-Kompensation -> pH-Wert |
| `ec_sensor.py` | EC | ADC -> Temperatur-Kompensation -> Leitfaehigkeit (uS/cm) |
| `temperature.py` | DS18B20, SHT31 | Rohwert -> Grad Celsius |
| `humidity.py` | SHT31 | Rohwert -> relative Feuchte (%) |
| `moisture.py` | Bodenfeuchte | ADC -> Prozent |
| `pressure.py` | BMP280 | Validierung, Unit-Konvertierung (hPa) |
| `co2.py` | CO2 | Sensor-spezifische Berechnung (ppm) |
| `flow.py` | Durchfluss | Pulse -> Liter/min |
| `light.py` | Lichtstaerke | ADC -> Lux |

**Erweiterung:** Neue Libraries als Python-Modul in `sensor_libraries/active/` ablegen. Interface implementieren (`process()`, `validate_sensor_data()`, `get_version()`). Kein Server-Neustart noetig -- LibraryLoader laedt dynamisch.

---

## 9. Datenbank-Schema

### 9.1 Tabellen-Uebersicht

19 Tabellen in 15 Model-Dateien (`db/models/`):

| Tabelle | Model-Datei | Schluesselfelder | Retention |
|---------|-------------|------------------|-----------|
| `esp_devices` | `esp.py` -> ESPDevice | device_id, status, zone_id, capabilities, last_seen | Permanent |
| `sensor_configs` | `sensor.py` -> SensorConfig | esp_device_id, gpio_pin, sensor_type, onewire_address, i2c_address | Permanent |
| `sensor_data` | `sensor.py` -> SensorData | sensor_config_id (FK), value, unit, quality, timestamp | Konfigurierbar (Default: unbegrenzt) |
| `sensor_type_defaults` | `sensor_type_defaults.py` -> SensorTypeDefaults | sensor_type, unit, min_value, max_value | Permanent |
| `actuator_configs` | `actuator.py` -> ActuatorConfig | esp_device_id, gpio_pin, actuator_type, safety_config | Permanent |
| `actuator_states` | `actuator.py` -> ActuatorState | actuator_config_id (FK), current_state, pwm_value | Permanent |
| `actuator_history` | `actuator.py` -> ActuatorHistory | actuator_config_id (FK), action, source, timestamp | Konfigurierbar |
| `cross_esp_logic` | `logic.py` -> CrossESPLogic | name, conditions (JSON), actions (JSON), enabled, priority | Permanent |
| `logic_execution_history` | `logic.py` -> LogicExecutionHistory | logic_id, result, triggered_by, timestamp | Permanent |
| `esp_heartbeat_logs` | `esp_heartbeat.py` -> ESPHeartbeatLog | esp_device_id (FK), timestamp, heap_free, wifi_rssi, uptime | 7 Tage |
| `audit_logs` | `audit_log.py` -> AuditLog | action, entity_type, entity_id, user_id, changes, timestamp | Permanent |
| `user_accounts` | `user.py` -> User | username, email, role, hashed_password, token_version | Permanent |
| `token_blacklist` | `auth.py` -> TokenBlacklist | token, expires_at | Auto-Cleanup |
| `subzone_configs` | `subzone.py` -> SubzoneConfig | zone_id, name, parent_zone_id | Permanent |
| `system_config` | `system.py` -> SystemConfig | key, value | Permanent |
| `kaiser_registry` | `kaiser.py` -> KaiserRegistry | kaiser_id, name, status | Permanent (vorbereitet) |
| `esp_ownership` | `kaiser.py` -> ESPOwnership | kaiser_id, esp_device_id | Permanent (vorbereitet) |
| `library_metadata` | `library.py` -> LibraryMetadata | name, version, sensor_type | Permanent |
| `ai_predictions` | `ai.py` -> AIPredictions | sensor_id, prediction_type, predicted_value, confidence | Permanent (vorbereitet) |

### 9.2 Sensor Unique Constraint

Aktuell (Migration `950ad9ce87bb`):

```
UNIQUE(esp_id, gpio, sensor_type, onewire_address, i2c_address)
```

Ermoeglicht: Mehrere DS18B20 auf gleichem OneWire-GPIO (via `onewire_address`), mehrere I2C-Sensoren an verschiedenen Adressen (via `i2c_address`), Multi-Value-Sensoren wie SHT31 (Temperatur + Humidity auf gleichem GPIO).

### 9.3 Foreign Key Cascades

| Tabelle | FK -> | ON DELETE |
|---------|-------|-----------|
| `sensor_configs` | `esp_devices` | CASCADE |
| `sensor_data` | `sensor_configs` | CASCADE |
| `actuator_configs` | `esp_devices` | CASCADE |
| `actuator_states` | `actuator_configs` | CASCADE |
| `actuator_history` | `actuator_configs` | CASCADE |
| `esp_heartbeat_logs` | `esp_devices` | CASCADE |

**Konsequenz:** Ein ESP loeschen = alle zugehoerigen Sensor-Daten, Aktor-Historien, Heartbeats werden kaskadierend mitgeloescht.

### 9.4 Indizes (esp_heartbeat_logs)

Die Heartbeat-Log-Tabelle hat 8 Indizes fuer Time-Series-Performance:

| Index | Spalten | Typ |
|-------|---------|-----|
| `ix_esp_heartbeat_logs_esp_id` | esp_id | Single |
| `ix_esp_heartbeat_logs_device_id` | device_id | Single |
| `ix_esp_heartbeat_logs_timestamp` | timestamp | Single |
| `ix_esp_heartbeat_logs_data_source` | data_source | Single |
| `idx_heartbeat_esp_timestamp` | esp_id, timestamp | Composite |
| `idx_heartbeat_device_timestamp` | device_id, timestamp | Composite |
| `idx_heartbeat_data_source_timestamp` | data_source, timestamp | Composite |
| `idx_heartbeat_health_status` | health_status, timestamp | Composite |

### 9.5 Alembic Migrations

19 Migrations. Aktueller HEAD: `950ad9ce87bb`.

Wichtige Migrations (chronologisch):

| Revision | Beschreibung |
|----------|-------------|
| `add_token_blacklist_table` | Token-Blacklist fuer JWT-Logout |
| `add_master_zone_id_to_esp_device` | Master-Zone-ID an ESP-Device |
| `add_subzone_configs_table` | Subzone-Tabelle |
| `add_data_source_field` | data_source (mock/real) |
| `add_sensor_operating_modes` | scheduled/continuous/on_demand |
| `add_esp_heartbeat_logs` | Heartbeat Time-Series |
| `add_discovery_approval_fields` | Discovery/Approval-Workflow |
| `fix_sensor_unique_constraint_onewire` | UNIQUE + onewire_address |
| `24e8638e14a5` | request_id zu audit_log |
| `950ad9ce87bb` | UNIQUE erweitert um i2c_address |

### 9.6 Repository-Pattern

15 Repositories in `db/repositories/`, alle erben von `BaseRepository` (`base_repo.py`):

| Repository | Model | Kernmethoden |
|------------|-------|-------------|
| ESPRepository | ESPDevice | get_by_device_id, get_online, get_pending, update_last_seen |
| SensorRepository | SensorConfig, SensorData | get_by_esp, get_data_range, save_data, find_by_gpio |
| SensorTypeDefaultsRepository | SensorTypeDefaults | get_by_type, upsert |
| ActuatorRepository | ActuatorConfig, ActuatorState, ActuatorHistory | get_by_esp, update_state, add_history |
| LogicRepository | CrossESPLogic, LogicExecutionHistory | get_active_rules, get_rules_by_trigger, add_execution |
| ESPHeartbeatRepository | ESPHeartbeatLog | save_heartbeat, get_latest, get_range |
| AuditLogRepository | AuditLog | create_entry, search, get_timeline |
| UserRepository | User | get_by_username, create, update_password |
| TokenBlacklistRepository | TokenBlacklist | blacklist_token, is_blacklisted, cleanup_expired |
| SubzoneRepository | SubzoneConfig | get_by_zone, create, delete |
| SystemConfigRepository | SystemConfig | get_value, set_value |
| KaiserRepository | KaiserRegistry, ESPOwnership | (vorbereitet) |
| AIRepository | AIPredictions | (vorbereitet) |
| LibraryRepository | LibraryMetadata | get_by_name, upsert |

**BaseRepository** bietet generische CRUD-Operationen: `get_by_id`, `get_all`, `create`, `update`, `delete`, `count`, `exists`.

---

## 10. Core-Infrastruktur

### 10.1 Config-System

`core/config.py` (635 Zeilen) definiert alle Settings-Klassen als Pydantic `BaseSettings`. Jede Klasse liest Werte aus `.env`:

| Settings-Klasse | Env-Prefix | Wichtigste Werte |
|-----------------|------------|------------------|
| DatabaseSettings | `DATABASE_*` | URL, pool_size (10), max_overflow (20), auto_init (true) |
| MQTTSettings | `MQTT_*` | broker_host, port (1883), keepalive (60), subscriber_max_workers (10) |
| ServerSettings | `SERVER_*` | host (0.0.0.0), port (8000), workers (4) |
| SecuritySettings | `JWT_*` | secret_key, algorithm (HS256), access_expire (30min), refresh_expire (7d) |
| CORSSettings | `CORS_*` | allowed_origins (localhost:3000, localhost:5173) |
| HierarchySettings | `KAISER_ID` | kaiser_id ("god"), god_id ("god_pi_central") |
| PerformanceSettings | `PERFORMANCE_*` | logic_scheduler_interval (60s) |
| LoggingSettings | `LOG_*` | level (INFO), format (json), max_bytes (10 MB), backup_count (10) |
| ESP32Settings | `ESP_*` | heartbeat_timeout (120s), discovery_interval (300s) |
| SensorSettings | `SENSOR_*`, `PI_ENHANCED_*` | pi_enhanced_enabled (true), retention_days (90) |
| ActuatorSettings | `ACTUATOR_*` | command_timeout (10s), safety_checks (true) |
| WebSocketSettings | `WEBSOCKET_*` | max_connections (100), heartbeat_interval (30s) |
| ResilienceSettings | `CIRCUIT_BREAKER_*`, `RETRY_*`, `TIMEOUT_*` | CB-Thresholds, Retry (3), Timeouts |
| MaintenanceSettings | Diverse | Alle Cleanup-Jobs DISABLED per Default (Safety) |
| DevelopmentSettings | `DEBUG_*` | debug_mode (false), mock_esp32_enabled (false) |
| RedisSettings | `REDIS_*` | enabled (false) -- vorbereitet, nicht aktiv |
| ExternalServicesSettings | `GOD_LAYER_*` | enabled (false) -- vorbereitet, nicht aktiv |
| NotificationSettings | `SMTP_*`, `WEBHOOK_*` | smtp_enabled (false), webhook_timeout (5s) |

Zugriff: `get_settings()` (Singleton via `@lru_cache`).

### 10.2 Logging

`core/logging_config.py` (167 Zeilen):
- **Format:** JSON (`{"timestamp", "level", "logger", "message", "module", "function", "line", "request_id", "exception"}`)
- **Rotation:** 10 MB, 10 Backups (`LOG_FILE_MAX_BYTES`, `LOG_FILE_BACKUP_COUNT`)
- **Noise-Reduction:** paho.mqtt, urllib3, asyncio auf WARNING
- **request_id:** UUID via RequestIdMiddleware fuer HTTP-Requests. MQTT-Handler: `request_id = "-"`, Korrelation ueber `esp_id`/`topic`

### 10.3 Resilience-System

`core/resilience/` (Paket, ~1.761 Zeilen in 6 Dateien):

**Circuit Breaker:**

| Breaker | Threshold | Recovery | Half-Open |
|---------|-----------|----------|-----------|
| database | 3 Failures | 10s | 5s |
| mqtt | 5 Failures | 30s | 10s |
| external_api | 5 Failures | 60s | 15s |

State-Machine: `CLOSED -> (failures >= threshold) -> OPEN -> (recovery timeout) -> HALF_OPEN -> (success) -> CLOSED`

**Retry-Konfiguration:**

| Setting | Default |
|---------|---------|
| Max Attempts | 3 |
| Base Delay | 1.0s |
| Max Delay | 30.0s |
| Exponential Base | 2.0 |
| Jitter | enabled |

**Timeout-Konfiguration:**

| Setting | Default |
|---------|---------|
| MQTT Publish | 5.0s |
| DB Query | 5.0s |
| DB Query Complex | 30.0s |
| External API | 10.0s |
| WebSocket Send | 2.0s |
| Sensor Processing | 1.0s |

**Offline-Buffer (MQTT):**
- Max 1000 Messages (`OFFLINE_BUFFER_MAX_SIZE`)
- Flush-Batch: 50 (`OFFLINE_BUFFER_FLUSH_BATCH_SIZE`)
- Automatischer Flush bei Reconnect

### 10.4 Exception-Hierarchie

`core/exceptions.py` (381 Zeilen):

```
GodKaiserException (Base, status_code=500)
  |
  +-- DatabaseException
  |     +-- RecordNotFoundException
  |     +-- DuplicateRecordException
  |     +-- DatabaseConnectionException
  |
  +-- MQTTException
  |     +-- MQTTConnectionException
  |     +-- MQTTPublishException
  |     +-- MQTTSubscribeException
  |
  +-- AuthenticationException
  |     +-- InvalidCredentialsException
  |     +-- TokenExpiredException
  |     +-- InvalidTokenException
  |
  +-- InsufficientPermissionsException (status_code=403)
  |
  +-- NotFoundError (status_code=404)
  |     +-- ESPNotFoundError
  |     +-- SensorNotFoundError
  |     +-- ActuatorNotFoundError
  |
  +-- ESP32Exception
  |     +-- ESP32NotFoundException
  |     +-- ESP32OfflineException
  |     +-- ESP32CommandFailedException
  |
  +-- SensorException
  |     +-- SensorNotFoundException
  |     +-- SensorProcessingException
  |
  +-- ActuatorException
  |     +-- ActuatorNotFoundException
  |     +-- ActuatorCommandFailedException
  |     +-- SafetyConstraintViolationException
  |
  +-- ValidationException (status_code=400)
  +-- DuplicateError (status_code=409)
  +-- AuthenticationError (status_code=401)
  +-- AuthorizationError (status_code=403)
  +-- ServiceUnavailableError (status_code=503)
  +-- ConfigurationException
  |
  +-- ExternalServiceException
  |     +-- GodLayerException
  |     +-- KaiserCommunicationException
  |
  +-- SimulationException
        +-- SimulationNotRunningError
```

**Global Exception Handler** (`core/exception_handlers.py`, 97 Zeilen):
- `GodKaiserException` -> WARNING-Log, JSON-Response `{"success": false, "error": {...}}`
- `Exception` (unhandled) -> ERROR-Log mit Stack Trace, `"INTERNAL_ERROR"` Response

### 10.5 Middleware

| Middleware | Datei | Zeilen | Funktion |
|------------|-------|--------|----------|
| RequestIdMiddleware | `middleware/request_id.py` | 68 | UUID pro Request (generiert oder aus `X-Request-ID` Header), ContextVar fuer Log-Korrelation |
| CORSMiddleware | (FastAPI built-in) | - | CORS-Validierung, `expose_headers=["X-Request-ID"]` |

Reihenfolge (LIFO): CORSMiddleware -> RequestIdMiddleware -> Auth Dependencies -> Handler.

### 10.6 Prometheus-Metriken

`core/metrics.py` (262 Zeilen):

| Metrik | Typ | Beschreibung |
|--------|-----|-------------|
| `UPTIME_GAUGE` | Gauge | Server-Uptime in Sekunden |
| `CPU_GAUGE` | Gauge | CPU-Auslastung (%) |
| `MEMORY_GAUGE` | Gauge | Memory-Auslastung (%) |
| `MQTT_CONNECTED_GAUGE` | Gauge | MQTT-Verbindungsstatus (0/1) |
| `MQTT_MESSAGES_TOTAL` | Counter | MQTT-Nachrichten (labels: direction) |
| `MQTT_ERRORS_TOTAL` | Counter | MQTT-Fehler |
| `WEBSOCKET_CONNECTIONS_GAUGE` | Gauge | Aktive WebSocket-Connections |
| `DB_QUERY_DURATION` | Histogram | DB-Query-Latenz (Buckets) |
| `ESP_TOTAL_GAUGE` | Gauge | Registrierte ESPs |
| `ESP_ONLINE_GAUGE` | Gauge | Online ESPs |
| `ESP_OFFLINE_GAUGE` | Gauge | Offline ESPs |
| `ESP_AVG_HEAP_FREE_GAUGE` | Gauge | Durchschnittlicher Heap aller ESPs |
| `ESP_MIN_HEAP_FREE_GAUGE` | Gauge | Minimaler Heap |
| `ESP_AVG_WIFI_RSSI_GAUGE` | Gauge | Durchschnittlicher RSSI |
| `ESP_AVG_UPTIME_GAUGE` | Gauge | Durchschnittliche Uptime |

Update-Intervall: alle 15 Sekunden via CentralScheduler-Job. Endpoint: `/api/v1/health/metrics` (Prometheus Text-Format, via `prometheus-fastapi-instrumentator`).

### 10.7 Scheduler

`core/scheduler.py` (439 Zeilen) -- Central Scheduler basierend auf APScheduler:
- Singleton (`init_central_scheduler()`)
- Job-Kategorien: `MAINTENANCE`, `MONITOR`, `SIMULATION`, `LOGIC`, `CUSTOM`
- Methoden: `add_interval_job()`, `add_cron_job()`, `remove_job()`, `remove_jobs_by_category()`, `get_all_jobs()`, `get_job_stats()`
- Shutdown: `shutdown_central_scheduler()` (entfernt alle Jobs, gibt Stats zurueck)

---

## 11. WebSocket-Manager

`websocket/manager.py` (317 Zeilen) -- Singleton:

| Feature | Detail |
|---------|--------|
| Pattern | Singleton (`get_instance()`) |
| Connection | `connect(websocket, client_id)`, `disconnect(client_id)` |
| Subscriptions | `subscribe(client_id, filters)` mit `types`, `esp_ids`, `sensor_types` |
| Broadcast | `broadcast(event_type, data)` (async), `broadcast_threadsafe()` (fuer MQTT-Callbacks) |
| Rate Limiting | 10 Messages/Sekunde pro Client (Sliding Window mit `deque`) |
| Thread Safety | `asyncio.Lock`, `broadcast_threadsafe` nutzt `asyncio.run_coroutine_threadsafe` |
| Shutdown | `shutdown()` schliesst alle Connections |

**28 Event-Typen** (vollstaendige Referenz: `.claude/reference/api/WEBSOCKET_EVENTS.md`):

| Gruppe | Events |
|--------|--------|
| ESP/Device | `esp_health`, `device_discovered`, `device_rediscovered`, `device_approved`, `device_rejected`, `esp_diagnostics` |
| Sensor | `sensor_data`, `sensor_health` |
| Actuator | `actuator_status`, `actuator_command`, `actuator_command_failed`, `actuator_response`, `actuator_alert` |
| Config | `config_response`, `config_published`, `config_failed` |
| Zone | `zone_assignment`, `subzone_assignment` |
| Logic | `logic_execution`, `notification` |
| Sequence | `sequence_started`, `sequence_step`, `sequence_completed`, `sequence_error`, `sequence_cancelled` |
| System | `system_event`, `error_event`, `events_restored` |

---

## 12. Simulation und Mock-ESP

### 12.1 SimulationScheduler

`services/simulation/scheduler.py` (1.723 Zeilen):
- Verwaltet Mock-ESP-Instanzen (`MockESPRuntime`)
- Funktionen: Create, Start, Stop, Auto-Heartbeat, Sensor-Wert-Simulation, Disconnect/Reconnect-Simulation
- Recovery: `recover_mocks()` stellt aktive Simulationen aus der DB nach Server-Restart wieder her
- Nutzt CentralScheduler fuer periodische Jobs (Heartbeat, Sensor-Daten)

### 12.2 MockActuatorHandler

`services/simulation/actuator_handler.py` (770 Zeilen):
- Empfaengt Actuator-Commands fuer Mock-ESPs (via Inline-Handler in main.py)
- Simuliert Actuator-Response (Bestaetigung) und Status-Updates
- Unterstuetzt Emergency-Stop und Safety-Timeout-Simulation

### 12.3 Mock-ESP Routing

Kein separater `kaiser_handler.py` -- stattdessen Inline-Funktion `mock_actuator_command_handler` in main.py (Zeilen 291-319). Diese Funktion wird als Handler fuer drei Topics registriert:
- `kaiser/+/esp/+/actuator/+/command`
- `kaiser/+/esp/+/actuator/emergency`
- `kaiser/broadcast/emergency`

Bei eingehenden Messages prueft sie, ob das Ziel-ESP ein aktiver Mock ist, und leitet die Message an `SimulationScheduler.handle_mqtt_message()` weiter.

---

## 13. Maintenance-Jobs

`services/maintenance/service.py` (604 Zeilen) registriert alle Jobs beim CentralScheduler:

### 13.1 Cleanup-Jobs (Default: DISABLED)

| Job | Schedule | Config-Key | Default | Dry-Run |
|-----|----------|------------|---------|---------|
| `cleanup_sensor_data` | Daily 03:00 | `SENSOR_DATA_RETENTION_ENABLED` | disabled | true |
| `cleanup_command_history` | Daily 03:30 | `COMMAND_HISTORY_RETENTION_ENABLED` | disabled | true |
| `cleanup_orphaned_mocks` | Hourly | `ORPHANED_MOCK_CLEANUP_ENABLED` | disabled | warn only |

Alle Cleanup-Klassen in `services/maintenance/jobs/cleanup.py` (703 Zeilen):
- `SensorDataCleanup` (Zeilen 28-229)
- `CommandHistoryCleanup` (Zeilen 230-400)
- `OrphanedMocksCleanup` (Zeilen 401-524)
- `HeartbeatLogCleanup` (Zeilen 525-703) -- existiert als Klasse, ist aber NICHT als Job im MaintenanceService registriert

### 13.2 Health-Check-Jobs (immer aktiv)

| Job | Schedule | Funktion |
|-----|----------|----------|
| `health_check_esps` | Konfigurierbar (Default: 60s) | ESP-Timeout-Detection, Status auf offline setzen |
| `health_check_mqtt` | Konfigurierbar (Default: 30s) | MQTT-Broker-Erreichbarkeit pruefen |
| `health_check_sensors` | Konfigurierbar (Default: 120s) | Stale-Sensor-Detection fuer continuous-Mode Sensoren |

### 13.3 Stats-Aggregation

| Job | Schedule | Config-Key | Default |
|-----|----------|------------|---------|
| `aggregate_stats` | Konfigurierbar (Default: 5min) | `STATS_AGGREGATION_ENABLED` | disabled |

---

## 14. Datenfluesse

### 14.1 HTTP Request -> Response

```
Client -> CORSMiddleware -> RequestIdMiddleware -> Router -> Auth Dependency
  -> Service -> Repository -> DB -> Response (X-Request-ID Header)
```

### 14.2 MQTT Message -> DB + WebSocket

```
ESP32 -> Mosquitto Broker -> paho Client (Background Thread)
  -> Subscriber (Handler Registry) -> ThreadPool
  -> asyncio.run_coroutine_threadsafe() -> Main Event Loop
  -> async Handler -> resilient_session() -> Repository -> DB
  -> WebSocketManager.broadcast_threadsafe() -> Frontend
```

### 14.3 WebSocket

```
Frontend -> ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt}
  -> WebSocketManager.connect()
  -> Client sendet: {"action": "subscribe", "filters": {"types": [...], "esp_ids": [...]}}
  -> Server Broadcast: {"type": "sensor_data", "timestamp": ..., "data": {...}}
```

### 14.4 Logic Engine (Cross-ESP)

```
sensor_handler.py (Sensor-Daten empfangen)
  -> logic_engine.evaluate_sensor_data(sensor_config_id, value)
  -> LogicRepository.get_rules_by_trigger()
  -> Condition-Evaluatoren (sensor_evaluator, time_evaluator, hysteresis_evaluator, compound_evaluator)
  -> Safety-Checks (ConflictManager, RateLimiter, LoopDetector)
  -> Action-Executoren (actuator_executor -> ActuatorService -> Publisher -> MQTT -> ESP32)
  -> LogicExecutionHistory (DB)
  -> WebSocket Broadcast (logic_execution)
```

Detaillierte Sequenzdiagramme: `.claude/reference/patterns/COMMUNICATION_FLOWS.md`

---

## 15. Error-Codes

Server Error-Codes 5000-5699:

| Range | Kategorie | Haeufige Codes |
|-------|-----------|----------------|
| 5000-5099 | Config | 5001 ESP_NOT_FOUND, 5002 ESP_ALREADY_EXISTS, 5007 ESP_OFFLINE |
| 5100-5199 | MQTT | 5101 PUBLISH_FAILED, 5104 CONNECTION_LOST, 5106 BROKER_UNAVAILABLE |
| 5200-5299 | Validation | 5201 INVALID_ESP_ID, 5205 MISSING_FIELD |
| 5300-5399 | Database | 5301 QUERY_FAILED, 5304 CONNECTION_FAILED |
| 5400-5499 | Service | 5402 CIRCUIT_BREAKER_OPEN, 5403 TIMEOUT |
| 5500-5599 | Audit | 5501 AUDIT_LOG_FAILED |
| 5600-5699 | Sequence | 5610 SEQ_ALREADY_RUNNING, 5640 ACTUATOR_LOCKED, 5642 SAFETY_BLOCKED |

Vollstaendige Referenz: `.claude/reference/errors/ERROR_CODES.md`

---

## 16. Test-Infrastruktur

~119 Test-Module in `El Servador/god_kaiser_server/tests/`:

| Kategorie | Verzeichnis | Fokus |
|-----------|-------------|-------|
| Unit | `tests/unit/` | Repositories, Processors, Validators, Circuit Breaker, GPIO-Validation |
| Integration | `tests/integration/` | API-Endpoints, MQTT-Handler, Logic Engine, WebSocket, Auth-Security |
| ESP32 | `tests/esp32/` | Cross-ESP-Szenarien, Sensor/Actuator-Integration, Performance |
| E2E | `tests/e2e/` | Full-Stack: Smoke, Recovery, Emergency, WebSocket-Events, Actuator-Direct-Control |

**Fixtures:** Gemeinsame `conftest.py` in Root, Unit, ESP32, E2E. Logic-Tests haben eigene `conftest_logic.py`.
**Mock-ESP-Client:** `tests/esp32/mocks/mock_esp32_client.py` -- simuliert ESP32-Kommunikation fuer Tests.

---

## 17. Docker-Konfiguration

| Service | Container | Port(s) | Healthcheck |
|---------|-----------|---------|-------------|
| el-servador | automationone-server | 8000 | `curl /api/v1/health/live` |
| mqtt-broker | automationone-mqtt | 1883, 9001 | `mosquitto_sub -t $SYS/#` |
| postgres | automationone-postgres | 5432 | `pg_isready` |

**Netzwerk:** `automationone-net` (bridge). Server verbindet via `mqtt-broker:1883` (Docker DNS).
**Log Bind-Mounts:** `./logs/server/` -> el-servador `/app/logs`

---

## Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| REST Endpoints | `.claude/reference/api/REST_ENDPOINTS.md` | Alle ~170 Endpoints mit Details |
| WebSocket Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` | 28 Event-Typen mit Payloads |
| MQTT Topics | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Hierarchie, QoS, Retain |
| Communication Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Sequenzdiagramme mit Datei:Zeile |
| Error Codes | `.claude/reference/errors/ERROR_CODES.md` | ESP32 1000-4999, Server 5000-5699 |
| Production Checklist | `.claude/reference/security/PRODUCTION_CHECKLIST.md` | Sicherheitsanforderungen |
| System-Architektur | `.claude/reports/current/auto-one_systemarchitektur.md` | Gesamtsystem (3 Schichten) |
| ESP32-Architektur | `.claude/reports/current/auto-one_esparchitektur.md` | Firmware-Detail |
