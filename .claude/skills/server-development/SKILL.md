---
name: server-development
description: |
  God-Kaiser Server Entwicklung für AutomationOne IoT-Framework.
  Verwenden bei: Python, FastAPI, PostgreSQL, SQLAlchemy, Alembic, MQTT-Handler,
  REST-API, Pydantic, Sensor-Processing, Actuator-Service, Logic-Engine,
  Cross-ESP-Automation, Database-Models, Repositories, WebSocket, JWT-Auth,
  Audit-Log, Maintenance-Jobs, SimulationScheduler, Mock-ESP, Zone-Service,
  Subzone-Service, Safety-Service, Config-Builder, MQTT-Publisher, MQTT-Subscriber,
  Heartbeat-Handler, Sensor-Handler, Actuator-Handler, Pi-Enhanced-Processing,
  Sensor-Libraries, Library-Loader, Error-Codes, pytest, Integration-Tests.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
argument-hint: "[Beschreibe was implementiert werden soll]"
---

# God-Kaiser Server - Skill Dokumentation

> **Architektur:** Server-Centric. ESP32 = dumme Agenten. ALLE Logik auf Server.
> **Codebase:** `El Servador/god_kaiser_server/src/` (~60,604 Zeilen Python)

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Service hinzufügen** | [Section 6: Workflow](#6-workflow) | `src/services/` |
| **MQTT Handler hinzufügen** | [Section 3: MQTT Layer](#3-mqtt-layer) | `src/mqtt/handlers/` |
| **REST Endpoint hinzufügen** | [Section 4: REST API](#4-rest-api) | `src/api/v1/` |
| **Database Model hinzufügen** | [Section 5: Database](#5-database) | `src/db/models/` |
| **Sensor Library hinzufügen** | MODULE_REGISTRY.md | `src/sensors/sensor_libraries/active/` |
| **Error-Codes verstehen** | `.claude/reference/errors/ERROR_CODES.md` | `src/core/error_codes.py` |
| **MQTT Topics verstehen** | `.claude/reference/api/MQTT_TOPICS.md` | `src/mqtt/topics.py` |
| **Startup verstehen** | [Section 2: Startup](#2-startup-sequenz) | `src/main.py` |
| **Tests schreiben** | `.claude/reference/testing/TEST_WORKFLOW.md` | `tests/` |

### Ordnerstruktur (Kurzübersicht)

```
src/ (60,604 Zeilen)
├── services/      13,675 (22.6%)  Business Logic, Logic Engine
├── api/v1/        12,210 (20.1%)  REST Endpoints (~230, inkl. zone_context, backups, export, schema_registry)
├── core/           7,294 (12.0%)  Config, Security, Scheduler
├── db/             6,942 (11.5%)  Models (19), Repositories (18)
├── mqtt/           6,938 (11.4%)  Client, Handlers (14), Publisher
├── schemas/        6,778 (11.2%)  Pydantic DTOs (70+)
├── sensors/        3,728 (6.2%)   Sensor Libraries
├── main.py           711 (1.2%)   FastAPI App, Lifespan
└── andere          2,328 (3.8%)   WebSocket, Utils, Middleware
```

**API-Details:** Siehe `MODULE_REGISTRY.md`

---

## 1. Architektur-Prinzip: Server-Centric

**KRITISCH:** Server ist die "Intelligenz". ESP32 = dumme Agenten.

```
ESP32 sendet:   RAW-Daten (analogRead = 2048)
Server macht:   Transformation (2048 → pH 7.2), Speicherung, Logic Engine
Server sendet:  Actuator-Commands, Config-Updates
```

### 3-Schichten-Architektur

```
┌─────────────────────────────────────────────────────┐
│  API Layer (api/v1/)                                │
│  REST Endpoints → Pydantic Validation → Response    │
├─────────────────────────────────────────────────────┤
│  Service Layer (services/)                          │
│  Business Logic, Safety, Logic Engine               │
├─────────────────────────────────────────────────────┤
│  Data Layer (db/, mqtt/)                            │
│  Repositories, MQTT Handlers, Persistence           │
└─────────────────────────────────────────────────────┘
```

---

## 2. Startup-Sequenz (main.py)

**Datei:** `src/main.py` (711 Zeilen)

### Startup-Reihenfolge (kritische Steps)

| Step | Aktion | Zeile | Kritisch |
|------|--------|-------|----------|
| 0 | Security Validation (JWT Secret) | 99-127 | HALT in Prod |
| 0.5 | Resilience Registry Init | 129-151 | JA |
| 1 | **Database Init** | 153-165 | KRITISCH |
| 2 | MQTT Client Connect | 167-178 | NON-FATAL |
| 3 | MQTT Handler Registration | 180-310 | JA |
| 3.4 | Central Scheduler Init | 264-268 | JA |
| 3.4.1 | Simulation Scheduler | 270-278 | JA |
| 3.4.2 | Maintenance Service | 312-322 | JA |
| 3.4.5 | Alert Suppression Scheduler | ~325 | NON-FATAL |
| 3.5 | Mock-ESP Recovery | 324-336 | NON-FATAL |
| 3.5.1 | Rebuild simulation_configs (Write-Through Cache) | ~466-485 | NON-FATAL |
| 3.6 | Sensor Type Auto-Reg | 338-357 | NON-FATAL |
| 3.7 | Sensor Schedule Recovery | 359-387 | NON-FATAL |
| 4 | MQTT Topics Subscribe | 389-395 | CONDITIONAL |
| 5 | **WebSocket Manager Init** | 397-402 | JA |
| 6 | **Services Init (Safety → Logic)** | 404-482 | KRITISCH |
| 6.1 | Plugin-Sync (Registry → DB) | ~484-500 | NON-FATAL |
| 6.2 | Daily Diagnostic Scheduler | ~502-530 | NON-FATAL |
| 6.3 | Plugin Schedule Registration (DB → APScheduler) | ~532-580 | NON-FATAL |

### Shutdown-Reihenfolge

| Priorität | Aktion | Zeile |
|-----------|--------|-------|
| FIRST | Logic Scheduler/Engine Stop | 514-524 |
| EARLY | Sequence Executor Cleanup | 526-530 |
| EARLY | Maintenance/Mock-ESP Stop | 532-560 |
| MIDDLE | WebSocket/MQTT Shutdown | 562-578 |
| LAST | Database Dispose | 580-583 |

---

## 3. MQTT Layer

**Dateien:** `src/mqtt/` (6,938 Zeilen, 14 Handler)

### Handler-Übersicht

| Topic Pattern | Handler | QoS | Zeile (main.py) |
|---------------|---------|-----|-----------------|
| `+/sensor/+/data` | SensorDataHandler | 1 | 203-206 |
| `+/actuator/+/status` | ActuatorStatusHandler | 1 | 207-210 |
| `+/actuator/+/response` | ActuatorResponseHandler | 1 | 212-215 |
| `+/actuator/+/alert` | ActuatorAlertHandler | 1 | 217-220 |
| `+/system/heartbeat` | HeartbeatHandler | 0 | 221-224 |
| `discovery/esp32_nodes` | DiscoveryHandler | 1 | 225-228 |
| `+/config_response` | ConfigHandler | 1 | 229-232 |
| `+/zone/ack` | ZoneAckHandler | 1 | 234-237 |
| `+/subzone/ack` | SubzoneAckHandler | 1 | 239-242 |
| `+/system/will` | LWTHandler | 0 | 248-251 |
| `+/system/error` | ErrorEventHandler | 1 | 256-259 |
| `+/actuator/+/command` | MockActuatorHandler | 1 | 297-300 |
| `+/actuator/emergency` | MockActuatorHandler | 1 | 302-305 |
| `broadcast/emergency` | MockActuatorHandler | 1 | 306-309 |

### Handler-Flow

```
MQTT Message → Subscriber._route_message()
    ↓
JSON Parse → TopicBuilder.matches_subscription()
    ↓
ThreadPool → Handler (sync oder async)
    ↓
DB Persist → Logic Engine → WebSocket Broadcast
```

### Neuen Handler hinzufügen

1. Erstelle `src/mqtt/handlers/your_handler.py`
2. Implementiere `async def handle_your_event(topic: str, payload: dict) -> bool`
3. Registriere in `main.py` (lifespan, ~Zeile 260)
4. Füge Topic zu `src/mqtt/topics.py` hinzu

**Vollständige Topics:** `.claude/reference/api/MQTT_TOPICS.md`

---

## 4. REST API

**Dateien:** `src/api/v1/` (~12,500 Zeilen, 21 Router inkl. 3 PLANNED, ~208 Endpoints)

### Auth Matrix

| Rolle | Zugriff |
|-------|---------|
| **Public** | `/auth/status`, `/auth/login`, `/health/*` |
| **Active** | GET `/sensors/`, `/actuators/`, `/esp/`, `/audit/` |
| **Operator** | CRUD Sensors/Actuators, Commands, Logic Rules |
| **Admin** | `/users/*`, `/debug/*`, `/audit/retention/*` |

### Router-Übersicht

| Router | Prefix | Endpoints | Auth |
|--------|--------|-----------|------|
| auth | /v1/auth | 10 | Mixed |
| esp | /v1/esp | 17 | Active/Operator |
| sensors | /v1/sensors | 16 | Active/Operator |
| actuators | /v1/actuators | 12 | Active/Operator |
| logic | /v1/logic | 8 | Operator+ |
| health | /v1/health | 6 | Mixed |
| audit | /v1/audit | 21 | Admin/Active |
| debug | /v1/debug | 59 | Admin |
| zone | /v1/zone | 7 | Operator+ |
| zones | /v1/zones | 8 | Operator+ |
| subzone | /v1/subzone | 6 | Operator+ |
| users | /v1/users | 7 | Admin |
| errors | /v1/errors | 4 | Active |
| sensor_type_defaults | /v1/sensor-type-defaults | 6 | Operator+ |
| sequences | /v1/sequences | 4 | Operator+ |
| logs | /v1/logs | 1 | Public |
| notifications | /v1/notifications | 15 | Active/Operator/Admin |
| diagnostics | /v1/diagnostics | 6 | Operator/Active |
| plugins | /v1/plugins | 8 | Operator/Active |
| device_context | /v1/device-context | 3 | Operator+ |
| webhooks | /v1/webhooks | 1 | Public (Grafana) |
| ai | /v1/ai | PLANNED | - |
| kaiser | /v1/kaiser | PLANNED | - |

### Neuen Endpoint hinzufügen

1. Erstelle oder erweitere `src/api/v1/your_router.py`
2. Nutze Dependencies: `db: AsyncSession = Depends(get_db)`
3. Nutze Auth: `user: User = Depends(get_current_active_user)`
4. Erstelle Schemas in `src/schemas/your_schema.py`
5. Registriere Router in `src/api/v1/__init__.py`

```python
# Beispiel Endpoint
@router.get("/items", response_model=SuccessResponse)
async def get_items(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user)
):
    service = YourService(db)
    return {"status": "success", "data": await service.get_all()}
```

---

## 5. Database

**Dateien:** `src/db/` (6,942 Zeilen, 20 Models, 18 Repositories)

### Repository Pattern

```python
# Alle Queries über Repositories, NIE direkt auf Session
class YourRepository(BaseRepository[YourModel]):
    async def get_by_custom(self, value: str) -> Optional[YourModel]:
        result = await self.session.execute(
            select(YourModel).where(YourModel.field == value)
        )
        return result.scalar_one_or_none()
```

### Core Models

| Model | Tabelle | Wichtige Felder |
|-------|---------|-----------------|
| ESPDevice | `esps` | esp_id (PK), zone_id, zone_name, master_zone_id, is_online, last_heartbeat, deleted_at (soft-delete), deleted_by |
| SensorConfig | `sensor_configs` | esp_id (FK), gpio, sensor_type, i2c_address, sensor_metadata (JSON, inkl. description, unit), alert_config (JSONB), runtime_stats (JSONB) |
| ActuatorConfig | `actuator_configs` | esp_id (FK), gpio, actuator_type, inverted, alert_config (JSONB), runtime_stats (JSONB) |
| Zone | `zones` | id (UUID PK), zone_id (UNIQUE), name, description, status (active/archived/deleted), deleted_at, deleted_by, created_at, updated_at. FK: esp_devices.zone_id → zones.zone_id (T13-R1) |
| SubzoneConfig | `subzone_configs` | id (UUID PK), esp_id (FK), subzone_id, assigned_gpios (JSON), assigned_sensor_config_ids (JSON), is_active (Bool), safe_mode_active |
| DeviceZoneChange | `device_zone_changes` | id (UUID PK), esp_id, old_zone_id, new_zone_id, subzone_strategy, affected_subzones (JSON), changed_by, changed_at (T13-R1 Audit) |
| CrossESPLogic | `cross_esp_logic` | rule_name (UNIQUE), trigger_conditions (JSON), logic_operator, actions (JSON), priority, cooldown_seconds |
| LogicHysteresisState | `logic_hysteresis_states` | rule_id (FK CASCADE), condition_index, is_active, last_value, last_activation, last_deactivation, updated_at. UQ(rule_id, condition_index) |
| SensorData | `sensor_data` | sensor_id (FK), esp_id (FK SET NULL), raw_value, processed_value, zone_id, subzone_id (Phase 0.1), device_name, data_source |
| AuditLog | `audit_logs` | event_type, severity, source_type |
| Notification | `notifications` | title, severity (critical/warning/info), source, category, channel, fingerprint (FIX-07 dedup), status (active/acknowledged/resolved), correlation_id, acknowledged_at, acknowledged_by, resolved_at |
| NotificationPreferences | `notification_preferences` | user_id, channel, enabled, severity_filter |
| DiagnosticReport | `diagnostic_reports` | id (UUID PK), overall_status, checks (JSON, nullable), started_at, duration_seconds, triggered_by, summary |
| PluginConfig | `plugin_configs` | plugin_id (PK), display_name, is_enabled, config (JSONB), schedule, capabilities |
| PluginExecution | `plugin_executions` | id (UUID PK), plugin_id (FK), status, started_at, duration_seconds, result (JSONB), error_message |
| DeviceActiveContext | `device_active_context` | config_type (sensor/actuator), config_id (UUID FK), active_zone_id, active_subzone_id, context_source (zone_local/multi_zone/mobile), changed_at, changed_by (T13-R2) |
| EmailLog | `email_log` | id (UUID PK), notification_id (FK, SET NULL), to_address, subject, template, provider, status (sent/failed/pending), sent_at, error_message, retry_count (Phase C V1.1) |

### Multi-Value Sensor Support

**Unique Constraint:** Expression index `unique_esp_gpio_sensor_interface_v2` using `COALESCE(onewire_address, ''), COALESCE(i2c_address::text, '')` — NULL-safe (V19-F02+F13)

```python
# SHT31: 2 Configs auf gleichem GPIO
SensorConfig(gpio=21, sensor_type="sht31_temp", i2c_address=68)
SensorConfig(gpio=21, sensor_type="sht31_humidity", i2c_address=68)
```

### Migration erstellen

```bash
cd "El Servador/god_kaiser_server"
python -m alembic revision --autogenerate -m "Add your_table"
python -m alembic upgrade head
```

---

## 6. Workflow für häufige Aufgaben

### Neuen Service hinzufügen

1. Erstelle `src/services/your_service.py`
2. Definiere Klasse mit Repository-Dependencies
3. Implementiere public methods
4. Instanziiere in `main.py` lifespan (wenn Singleton nötig)
5. Nutze in API-Endpoints via Dependency Injection

```python
class YourService:
    def __init__(self, session: AsyncSession):
        self.repo = YourRepository(session)

    async def do_something(self, data: dict) -> Result:
        # Business Logic hier
        return await self.repo.create(data)
```

### Neue Sensor Library hinzufügen

1. Erstelle `src/sensors/sensor_libraries/active/your_sensor.py`
2. Erbe von `BaseSensorProcessor`
3. Implementiere `process(raw_value, calibration) -> dict`
4. Library wird automatisch geladen (Dynamic Import)

```python
class YourSensorProcessor(BaseSensorProcessor):
    SENSOR_TYPE = "your_sensor"
    UNIT = "unit"

    def process(self, raw_value: float, calibration: dict = None) -> dict:
        processed = self._transform(raw_value)
        return {
            "processed_value": processed,
            "unit": self.UNIT,
            "quality": self._assess_quality(processed)
        }
```

### Build & Test

```bash
cd "El Servador"
poetry install                                    # Dependencies
poetry run pytest god_kaiser_server/tests/ -v     # Tests
poetry run uvicorn god_kaiser_server.src.main:app --reload  # Server

# Wokwi Test-Devices seeden (3 ESPs: ESP_00000001/02/03)
cd "El Servador/god_kaiser_server"
poetry run python scripts/seed_wokwi_esp.py
```

---

## 7. Kritische Regeln

### NIEMALS

- Business-Logic auf ESP32 (Server-Centric!)
- Actuator-Command ohne `SafetyService.validate_actuator_command()`
- DB-Queries direkt auf Session (immer Repository)
- MQTT-Topics ohne `TopicBuilder`
- Schemas ohne Pydantic-Validierung
- Blocking-Code in async Handlers
- ORM-Relationships ohne `selectinload()` in async Queries (→ `MissingGreenlet`)
- `datetime.now()` ohne timezone (→ naive/aware Mismatch). Immer `datetime.now(timezone.utc)`
- `DateTime` ohne `timezone=True` in Model-Spalten (→ DB liefert naive Timestamps)

### IMMER

- `selectinload()` für jede ORM-Relationship die im Response genutzt wird (async SQLAlchemy!)
- Safety-Check VOR jedem Actuator-Command
- Repository-Pattern für alle DB-Operationen
- Pydantic-Schemas für Request/Response
- Error-Codes aus `src/core/error_codes.py` (5000-5999)
- Logging via `src/core/logging_config.py`
- Circuit Breaker für externe Calls (MQTT, DB)
- `datetime.now(timezone.utc)` statt `datetime.now()` für alle Zeitstempel
- `DateTime(timezone=True)` für alle datetime-Spalten in SQLAlchemy Models

### Safety-First Invarianten

1. **SafetyService** ist CRITICAL PATH für alle Actuator-Commands
2. **Database** ist Single Source of Truth (nicht In-Memory)
3. **Mock-ESP Recovery** nach Server-Restart via `recover_mocks()`
4. **Rate Limiting** pro Rule: `max_executions_per_hour`

---

## 8. Services Inventar

### Core Services

| Service | Datei | Zeilen | Hauptmethoden |
|---------|-------|--------|---------------|
| **LogicEngine** | logic_engine.py | 1502 | `start()`, `stop()`, `evaluate_sensor_data()`, `evaluate_timer_triggered_rules()` |
| **SafetyService** | safety_service.py | 264 | `validate_actuator_command()`, `emergency_stop_all()` |
| **SensorService** | sensor_service.py | 545 | `process_reading()`, `trigger_measurement()` |
| **ActuatorService** | actuator_service.py | 279 | `send_command()` |
| **ESPService** | esp_service.py | 944 | `register()`, `approve()`, `reject()` |
| **ZoneService** | zone_service.py | ~500 | `assign_zone()`, `remove_zone()` — T13-R1: Zone muss existieren + aktiv sein. subzone_strategy (transfer/copy/reset). DeviceZoneChange Audit |
| **MonitorDataService** | monitor_data_service.py | - | `get_zone_monitor_data()` — Subzone-Gruppierung für Monitor L2 |
| **SubzoneService** | subzone_service.py | 595 | `assign_subzone()`, `remove_subzone()`, `set_safe_mode()` |
| **ConfigBuilder** | config_builder.py | 249 | `build_esp_config()` |
| **MaintenanceService** | maintenance/service.py | 260 | `start()`, `stop()`, `register_jobs()` |
| **NotificationRouter** | notification_router.py | ~467 | `route()` — persist → fingerprint dedup → WS broadcast → optional email + email_log |
| **AlertSuppressionService** | alert_suppression_service.py | ~180 | `check_suppression()`, `update_config()`, `expire_suppressions()` — ISA-18.2 Shelved Alarms |
| **DiagnosticsService** | diagnostics_service.py | ~350 | `run_full_diagnostic()`, `cleanup_old_reports()` — 10 modulare System-Checks |
| **PluginService** | plugin_service.py | ~380 | `execute_plugin()`, `update_schedule()`, `sync_registry_to_db()` — Registry ↔ DB Mediator |
| **StateAdoptionService** | state_adoption_service.py | ~160 | `start_reconnect_cycle()`, `record_adopted_state()`, `mark_adoption_completed()`, `is_adoption_completed()` — Reconnect-Handover-Gate (adopting → adopted → delta_enforced) |
| **DeviceScopeService** | device_scope_service.py | - | `get_active_context()` → `ActiveContextData` (NamedTuple), `set_context()`, `resolve_zone()` — 3-Way Resolution, Cache 30s TTL, session-safe (T13-R2+Phase3) |
| **MQTTCommandBridge** | mqtt_command_bridge.py | ~230 | `send_and_wait_ack()`, `resolve_ack()`, `has_pending()`, `shutdown()` — ACK-gesteuerte MQTT-Kommunikation für Zone/Subzone-Operationen (T13-Phase2) |

### Logic Engine Architektur

```
LogicEngine
├── Condition Evaluators
│   ├── SensorConditionEvaluator (Schwellenwerte, optional subzone_id Phase 2.4)
│   ├── TimeConditionEvaluator (Zeit-Fenster)
│   ├── HysteresisEvaluator (Zustandsübergänge, DB-persistiert via logic_hysteresis_states)
│   └── CompoundConditionEvaluator (AND/OR/NOT, setzt condition_index pro Sub-Condition)
│
├── Action Executors
│   ├── ActuatorActionExecutor (Befehle, Phase 2.4 Subzone-Matching)
│   ├── DelayActionExecutor (Verzögerungen)
│   ├── NotificationActionExecutor (WebSocket)
│   └── SequenceActionExecutor (Sub-Aktionen)
│
└── Safety Components
    ├── ConflictManager (Actuator-Konflikte)
    ├── RateLimiter (max_executions_per_hour)
    └── LoopDetector (Feedback-Schleifen)
```

---

## 9. Scheduler & Jobs

### Job-Kategorien

| Prefix | Kategorie | Beispiel |
|--------|-----------|----------|
| `mock_` | Mock-ESP | `mock_ESP_123_heartbeat` |
| `maintenance_` | Cleanup | `maintenance_cleanup_sensor_data` |
| `monitor_` | Health | `monitor_health_check_esps` |
| `sensor_schedule_` | Scheduled | `sensor_schedule_ESP_123_34_ph` |
| `alert_` | Alert Suppression | `alert_expire_suppressions` |
| `custom_` | Plugin-Jobs | `custom_plugin_health_check` |

### Maintenance Jobs

| Job | Schedule | Config-Key |
|-----|----------|------------|
| cleanup_sensor_data | Daily 03:00 | SENSOR_DATA_RETENTION_ENABLED |
| cleanup_command_history | Daily 03:30 | COMMAND_HISTORY_RETENTION_ENABLED |
| cleanup_heartbeat_logs | Daily 03:15 | HEARTBEAT_LOG_RETENTION_ENABLED |
| health_check_esps | 60s | ESP_HEALTH_CHECK_INTERVAL_SECONDS |
| health_check_mqtt | 30s | MQTT_HEALTH_CHECK_INTERVAL_SECONDS |
| expire_alert_suppressions | Hourly :00 | ALERT_SUPPRESSION_ENABLED |
| daily_diagnostic | Daily 04:00 | DIAGNOSTIC_SCHEDULE_ENABLED |
| plugin_* (DB-driven) | Per-plugin cron | PluginConfig.schedule |

---

## 10. Referenz-Dokumentation

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | Handler implementieren |
| **REST API** | `.claude/reference/api/REST_ENDPOINTS.md` | Endpoints verstehen |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | Fehler (5000-5999) |
| **Module APIs** | `MODULE_REGISTRY.md` | Vollständige Service-APIs |
| **Tests** | `.claude/reference/testing/TEST_WORKFLOW.md` | NUR auf Anfrage |
| **Datenflüsse** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | System verstehen |

---

## 11. Workflow

```
1. ANALYSE      → Modul in Quick Reference finden
2. API PRÜFEN   → MODULE_REGISTRY.md für Details
3. PATTERN      → Bestehenden Code als Vorlage
4. IMPLEMENT    → 3-Schichten-Architektur beachten
5. VERIFY       → poetry run pytest
```

---

*Kompakter Skill für Server-Entwicklung. Details in MODULE_REGISTRY.md*
