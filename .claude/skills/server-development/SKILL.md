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
> **Codebase:** `El Servador/god_kaiser_server/src/` (grosses Monorepo-Backend; Umfang bei Bedarf im Repo messen).

---

## 0.1 Stack-Anker (Ist-Stand)

Verbindliche Tech-Liste aus `El Servador/god_kaiser_server/pyproject.toml` — **keine** parallelen Frameworks oder ORM-Stile einführen.

| Technologie | Version / Hinweis | Anker im Repo |
|-------------|-------------------|---------------|
| Python | ^3.11 | Tooling: ruff `py311`, pytest |
| FastAPI | >=0.115, unter 1.0 (pyproject) | `src/main.py` (`lifespan`), `src/api/` |
| Uvicorn | ^0.27 (standard extras) | Start / Container |
| SQLAlchemy | ^2.0 | `src/db/session.py`, Models `src/db/models/` |
| Alembic | ^1.13 | `alembic/`, Revisionen unter `alembic/versions/` |
| asyncpg / psycopg2-binary | PostgreSQL | `DATABASE_URL` mit `postgresql+asyncpg://` (async App) |
| Pydantic | ^2.5 (+ email extras) | `src/schemas/` |
| paho-mqtt, aiomqtt | MQTT | `src/mqtt/client.py`, `subscriber.py`, `publisher.py` |
| python-jose, passlib | JWT / Passwort | `src/core/security.py`, `src/api/deps.py` |
| httpx, aiohttp | HTTP-Clients | Services / Outbound |
| prometheus-client, prometheus-fastapi-instrumentator | Metriken | `src/core/metrics.py`, App-Setup in `main.py` |
| APScheduler | Jobs | `src/services/*scheduler*.py`, Lifespan-Registrierung |
| websockets | WS-Protokoll | zusammen mit FastAPI-Starlette-Stack |
| pytest, pytest-asyncio, aiosqlite | Tests | `tests/conftest.py` (SQLite In-Memory, Overrides) |

---

## 0.2 Schichten & Protokolle (El Servador)

| Schicht | Rolle | Pfad (unter `god_kaiser_server/src/`) |
|---------|--------|--------------------------------------|
| REST API | Router, Auth-Dependencies, Pydantic-IO | `api/v1/` (`api/v1/__init__.py` bündelt Router) |
| DI / Auth | Session, JWT, Rollen, API-Key-Stellen | `api/deps.py` |
| Services | Domänenlogik, Safety, Logic Engine, Zonen | `services/` |
| Daten | ORM-Modelle, Repositories | `db/models/` (~25 Moduldateien), `db/repositories/` (~23 Module inkl. `base_repo.py`) |
| MQTT | Transport, Routing, Handler, Publisher | `mqtt/subscriber.py`, `mqtt/handlers/`, `mqtt/publisher.py`, `mqtt/topics.py` |
| Realtime | WebSocket an Clients | `api/v1/websocket/realtime.py`, `websocket/manager.py` |
| Querschnitt | Config, Logging, Request-ID, Resilience | `core/config.py`, `core/logging_config.py`, `middleware/request_id.py`, `core/resilience.py` |

**Dual-Protokoll-Denken:** Zustände und Befehle betreffen oft **REST + MQTT** (und bei UI/Monitor zusätzlich **WebSocket**). Finalität und Korrelation (z. B. `correlation_id`, ACK-Pfade) sind in `El Servador/god_kaiser_server/docs/finalitaet-http-mqtt-ws.md` und in `.claude/reference/api/MQTT_TOPICS.md` / `WEBSOCKET_EVENTS.md` beschrieben — bei Änderungen immer mitlesen und Payloads/Events abstimmen.

### Datenbank-Session: drei gängige Muster

| API | Verwendung |
|-----|------------|
| `get_db()` in `api/deps.py` | FastAPI-`Depends(get_db)` für Request-Handler — intern `async for session in get_session(): yield` |
| `get_session()` in `db/session.py` | Async-Generator für Services, MQTT-Handler, Lifespan, wenn keine FastAPI-Request-Dependency verfügbar ist |
| `get_session_maker()` | Explizite Session-Factory (z. B. Scheduler, Background-Jobs, `async with get_session_maker()()`) |

Tests überschreiben **`get_db`** via `app.dependency_overrides[get_db]` (siehe `tests/conftest.py` — `override_get_db`).

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
src/
├── services/       Business Logic, Logic Engine, Scheduler-Jobs
├── api/v1/         REST (u. a. zone_context, backups, export, schema_registry)
├── core/           Config, Security, Resilience, Metriken, Logging
├── db/             Models (`db/models/`), Repositories (`db/repositories/`)
├── mqtt/           Client, Subscriber, Handlers, Publisher, Topics
├── schemas/        Pydantic DTOs
├── sensors/        Sensor Libraries (`sensor_libraries/active/`)
├── main.py         FastAPI App, Lifespan (MQTT/WebSocket/Services)
└── (weitere)       WebSocket, Utils, Middleware
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

**Datei:** `src/main.py` — `lifespan()` kapselt Startup/Shutdown.

### Startup-Reihenfolge (logisch, Reihenfolge im Code beachten)

| Phase | Aktion | Kritisch |
|-------|--------|----------|
| 0 | Security Validation (JWT Secret — Abbruch in Production bei Default) | HALT in Prod |
| 0.5 | Resilience Registry | JA |
| 1 | Database Init (`init_db`, Circuit Breaker) | KRITISCH |
| 2 | MQTT Client Connect | NON-FATAL (Betrieb oft ohne Broker möglich) |
| 3 | MQTT-Handler registrieren (`Subscriber.register_handler`, Topic-Pattern aus `mqtt/topics`) | JA |
| 3.x | Scheduler (Simulation, Maintenance, Alert-Suppression, …) | gemischt |
| 4 | MQTT Subscriptions / Bridge (inkl. `MQTTCommandBridge` wo konfiguriert) | JA |
| 5 | WebSocket Manager | JA |
| 6 | Services (Safety → Logic Engine, Runtime-State, …) | KRITISCH |
| 7 | Plugin-Sync / diagnostische Jobs / weitere Registrierungen | meist NON-FATAL |

**Handler-Registrierung:** Im `lifespan`-Block — Suche nach `register_handler(` und Log-Zeilen `... handler registered` für die aktuelle Liste (Topics ändern sich seltener als Zeilennummern).

### Shutdown-Reihenfolge (logisch)

Logic/Scheduler zuerst stoppen → Maintenance/Mock → WebSocket/MQTT → Engine `dispose` (Details im `lifespan`-Shutdown-Teil von `main.py`).

---

## 3. MQTT Layer

**Dateien:** `src/mqtt/` — u. a. `client.py`, `subscriber.py`, `publisher.py`, `handlers/`, `topics.py`

### Handler-Übersicht

**Vollständige Topic-Pattern und QoS:** `.claude/reference/api/MQTT_TOPICS.md` und Registrierung in `src/main.py` (`register_handler`-Aufrufe im `lifespan`). Die Tabelle im Skill war historisch; bei Abweichungen gilt **Code + MQTT_TOPICS**.

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

1. Neues Modul unter `src/mqtt/handlers/` — **bestehenden Handler gleicher Domäne** als Vorlage (z. B. `sensor_handler.py`: Klasse mit Methoden wie `handle_sensor_data`; andere nutzen `BaseMQTTHandler` aus `handlers/base_handler.py`).
2. Callback an `Subscriber.register_handler(topic_pattern, callable)` übergeben — Signatur wie die Nachbarn (siehe `mqtt/subscriber.py`).
3. Im `lifespan` von `main.py` registrieren (gleiche Stelle wie andere Handler).
4. Topic-Pattern und Konstanten in `src/mqtt/topics.py` / `TopicBuilder` abstimmen — **kein** freier String-Bau neben dem etablierten Builder.
5. Payload-Validierung, Error-Codes, Logging wie in `base_handler`-Mustern; Exceptions nicht schlucken.

**Vollständige Topics:** `.claude/reference/api/MQTT_TOPICS.md`

**Skill `mqtt-development`:** bei reinem Protokoll-/Topic-/Payload-Contract-Fokus zusätzlich nutzen.

---

## 4. REST API

**Dateien:** `src/api/v1/` (viele Router-Module; exakte Endpoint-Zahl in OpenAPI oder `.claude/reference/api/REST_ENDPOINTS.md`)

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
| logic | /v1/logic | 12 | Operator+ |
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

**Dateien:** `src/db/` — Models unter `db/models/`, Repositories unter `db/repositories/` (siehe Quick-Reference-Ordnerliste).

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
| CrossESPLogic | `cross_esp_logic` | rule_name (UNIQUE), trigger_conditions (JSON), logic_operator, actions (JSON), priority (kleinere Zahl = höhere Ausführungs-/Konfliktpriorität), cooldown_seconds, is_critical (Bool, default false), escalation_policy (JSON, nullable), degraded_since (DateTime TZ, nullable), degraded_reason (VARCHAR 64, nullable) |
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

### Feuchte-Kalibrierung (Moisture)

- `CalibrationService._compute_calibration`: `moisture_2point` und (Legacy) `linear_2point` mit normalisiertem Sensor **`moisture`** liefern **`derived`** mit `dry_value`/`wet_value` für `MoistureSensorProcessor`; `resolve_calibration_for_processor` reicht `derived` flach an `process()`.
- Kurzreferenz: `docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-2026-04-09.md`
- Persistenz/Tests: nach Session **Apply** ist `sensor_configs.calibration_data` kanonisch mit vollem `derived` abgesichert u. a. in `tests/unit/test_calibration_service.py` (Persistenz-Assertions).
- Altbestände (DB) / Operator: `docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-operator-hinweis-2026-04-10.md`
- Live-Messung (Wizard): `mqtt/handlers/calibration_response_handler.py` → WS `calibration_measurement_received` / `calibration_measurement_failed`; fehlendes `raw`/`raw_value` in der MQTT-Antwort → Fehler-Event (**kein** `get_latest_reading`-Fallback). Doku: `.claude/reference/api/WEBSOCKET_EVENTS.md` §4.4–4.5, `MQTT_TOPICS.md` §1.4.

### Build & Test

```bash
cd "El Servador/god_kaiser_server"
poetry install
poetry run pytest tests/ -q
poetry run ruff check .
poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Wokwi Test-Devices seeden (Skript im jeweiligen `scripts/`-Ordner prüfen)
# poetry run python scripts/seed_wokwi_esp.py
```

(Abgleich mit `AGENTS.md` / `.claude/CLAUDE.md` Verifikations-Tabelle.)

### Feature erweitern (Minimalpfad)

1. **Suchen:** `Grep`/`Glob` nach ähnlichem Router, Handler oder Service.
2. **Wiederverwenden:** gleiche Exception-, Log- und Session-Muster wie der Nachbarcode.
3. **REST:** Schema in `src/schemas/`, Endpoint in passendem `api/v1/*`, Router in `api/v1/__init__.py` registrieren.
4. **Persistenz:** Model/Repository nur bei echtem Datenbedarf; Migration mit Alembic (`alembic revision --autogenerate` + Review + `upgrade head`).
5. **MQTT betroffen:** Handler + Topics + ggf. Publisher; Referenzen `MQTT_TOPICS.md`, `mqtt-development`-Skill.
6. **UI/Realtime betroffen:** WebSocket-Events in `.claude/reference/api/WEBSOCKET_EVENTS.md` prüfen.
7. **Tests:** Unit/Integration unter `tests/unit/` bzw. `tests/integration/`; `conftest.py` nutzt `dependency_overrides` für `get_db`.

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
- Logging via `src/core/logging_config.py` (strukturierte JSON-Logs; Request-ID über `middleware/request_id.py`, optional `traceparent` im Kontext)
- Circuit Breaker für externe Calls (MQTT, DB) — siehe `core/resilience.py` / `db/session.py`
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
| **LogicEngine** | logic_engine.py | ~2100 | `start()`, `stop()`, `evaluate_sensor_data()`, `evaluate_timer_triggered_rules()`, `_enter_degraded_state()`, `_exit_degraded_state()` |
| **SafetyService** | safety_service.py | 264 | `validate_actuator_command()`, `emergency_stop_all()` |
| **SensorService** | sensor_service.py | 545 | `process_reading()`, `trigger_measurement()` |
| **ActuatorService** | actuator_service.py | ~347 | `send_command()` → `ActuatorSendCommandResult` |
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
| **MQTTCommandBridge** | mqtt_command_bridge.py | ~230 | `send_and_wait_ack()`, `resolve_ack()` (**nur** `correlation_id`-Match, kein FIFO), `extract_ack_correlation_id()`, `has_pending()`, `shutdown()` — Zone/Subzone (T13-Phase2, Epic1-04) |

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
    ├── ConflictManager (Actuator-Konflikte, Regel-vs-Regel)
    ├── ActuatorService.send_command (pro `esp_id:gpio` asyncio.Lock — serialisiert Manual+Logic-MQTT)
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
| **HTTP-Finalität** | `El Servador/god_kaiser_server/docs/finalitaet-http-mqtt-ws.md` | REST vs. MQTT/WS (Aktor, Zone, Subzone, Emergency) |

---

## 11. Workflow

```
1. ANALYSE      → Modul in Quick Reference finden
2. API PRÜFEN   → MODULE_REGISTRY.md für Details
3. PATTERN      → Bestehenden Code als Vorlage
4. IMPLEMENT    → 3-Schichten-Architektur beachten
5. VERIFY       → poetry run pytest (+ ruff bei Backend-Änderung)
```

---

## 12. Coding-Agenten: typische Fehler und Soll-Verhalten

Kurz-Checkliste für KI- und Menschen-Reviews — **kein** Ersatz für die Pflichtregeln in `.cursor/rules/backend.mdc` und `AGENTS.md`.

### Typische Fehler (vermeiden)

- Anderes Web-Framework, anderen async-DB-Stil oder synchrones ORM neben SQLAlchemy 2.0 Async einführen.
- Nur REST entwerfen, obwohl **MQTT** (Topics, Payload, Handler) und/oder **WebSocket**-Events betroffen sind — führt zu Schema-Drift und fehlenden Realtime-Updates.
- Geschäftslogik in `main.py` oder doppelt im Router statt in `services/` und Repositories.
- `time.sleep` oder blockierende CPU-Arbeit im async-Request-/Handler-Pfad ohne `asyncio.to_thread` / Executor — Event-Loop blockieren.
- Roh-SQL per String-Format statt parametrisierter Queries; Secrets hardcoden.
- Alembic-Revision ohne Abgleich mit Models und ohne Review der generierten Migration; Downgrade ignorieren, wenn das Team Downgrades erwartet.
- Observability schwächen: willkürliche Log-Formate, Request-/Korrelationsfelder ignorieren (`request_id`, bestehende Metrik-Labels).
- Tests weglassen oder nur sync annehmen, obwohl das Projekt `pytest-asyncio`, SQLite-In-Memory und `dependency_overrides` nutzt.
- Scope ausweiten: große Refactors oder neue Architektur-Schichten ohne Auftrag.

### Soll-Verhalten (immer)

- Zuerst im Repo **suchen** (`Glob`/`Grep`) nach dem nächstliegenden Pattern (Endpoint, Handler, Service).
- **Minimal-invasiv** bleiben; Namensgebung und Fehlerbehandlung wie im Nachbarcode.
- **Schemas** (`src/schemas/`) und **DB** konsistent halten; Schemaänderungen nur mit **Alembic** nach Projektkonvention.
- **Tests** anpassen oder ergänzen (`tests/conftest.py`, Marker in `pyproject.toml`).
- Bei Geräte-/Dashboard-Bezug: **MQTT**, **REST** und **WebSocket**-Verträge gegen Referenzdateien unter `.claude/reference/api/` abgleichen.
- **Auth-Stufen** (`deps.py`: active user, operator, admin, API-Key-Stellen) und **Safety-Pfad** für Aktoren (`SafetyService`) respektieren.

---

*Kompakter Skill für Server-Entwicklung. Details in MODULE_REGISTRY.md*
