# AutomationOne Project Analysis Report

**Generated:** 2026-02-07
**Branch:** `feature/docs-cleanup`
**Project Root:** `C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one`

---

## 1. Project Structure (Top-Level)

```
Auto-one/
├── .claude/              # AI Agent System (Skills, Agents, Reports, Rules)
├── .github/workflows/    # 8 CI/CD Pipelines
├── .vscode/              # VS Code Settings
├── ARCHIV/               # Archived files
├── backups/              # Database backups
├── docker/               # Docker configs (grafana, loki, prometheus, promtail, postgres, mosquitto)
├── docs/                 # Project documentation
├── El Frontend/          # Layer 3: Vue 3 Dashboard (TypeScript + Tailwind)
├── El Servador/          # Layer 2: FastAPI Backend (Python 3.11+)
├── El Trabajante/        # Layer 1: ESP32 Firmware (C++ / PlatformIO)
├── logs/                 # Runtime logs (mqtt, postgres, server, wokwi)
├── scripts/              # Utility scripts (debug, wokwi, tests)
├── docker-compose.yml    # Main Docker Compose (8 services)
├── docker-compose.dev.yml    # Dev overrides (hot-reload)
├── docker-compose.ci.yml     # CI (GitHub Actions, tmpfs)
├── docker-compose.e2e.yml    # E2E (Playwright, full stack)
├── docker-compose.test.yml   # Test (SQLite, dummy postgres)
├── Makefile              # 28 Make targets
├── .env.example          # Environment template
├── .env                  # Active environment (gitignored)
├── .env.ci               # CI environment
└── README.md             # Project overview
```

---

## 2. Architecture Layers

### Architecture Overview
```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
                                    ↕
                              PostgreSQL + MQTT Broker (Mosquitto)
```

**Core Principle:** Server-Centric. ESP32 = dumb agents. ALL logic on server.

---

### Layer 1: El Trabajante (ESP32 Firmware)

| Property | Value |
|----------|-------|
| **Platform** | espressif32 (Arduino Framework) |
| **Primary Board** | Seeed XIAO ESP32-C3 |
| **Dev Board** | ESP32 DevKit (esp32dev) |
| **Simulation** | Wokwi (extends esp32_dev) |
| **Source Files** | 94 (.cpp + .h) |
| **Monitor Speed** | 115200 baud |

**PlatformIO Environments:**
1. `seeed_xiao_esp32c3` - Production (MAX_SENSORS=10, MAX_ACTUATORS=6, MQTT_MAX_PACKET=1024)
2. `esp32_dev` - Development (MAX_SENSORS=20, MAX_ACTUATORS=12, MQTT_MAX_PACKET=2048)
3. `wokwi_simulation` - CI Testing (extends esp32_dev, WOKWI_SIMULATION=1)

**Key Libraries:**
| Library | Version |
|---------|---------|
| PubSubClient (MQTT) | ^2.8 |
| ArduinoJson | ^6.21.3 |
| NTPClient | ^3.2.1 |
| OneWire | ^2.3.7 |
| DallasTemperature | ^3.11.0 |
| Adafruit BME280 (dev only) | ^2.2.2 |
| Adafruit Unified Sensor (dev only) | ^1.1.9 |

**Build Flags (Key Features):**
- `DYNAMIC_LIBRARY_SUPPORT=1`
- `HIERARCHICAL_ZONES=1`
- `OTA_LIBRARY_ENABLED=1`
- `SAFE_MODE_PROTECTION=1`
- `ZONE_MASTER_ENABLED=1`
- `CONFIG_ENABLE_THREAD_SAFETY`

**Source Structure:**
```
El Trabajante/src/
├── config/              # system_config.h, feature_flags.h, hardware/ (esp32_dev.h, xiao_esp32c3.h)
├── core/                # application.cpp/h, main_loop.cpp/h, system_controller.cpp/h
├── drivers/             # gpio_manager, onewire_bus, pwm_controller, i2c_bus, i2c_sensor_protocol
├── error_handling/      # circuit_breaker, health_monitor, error_tracker
├── models/              # sensor_registry, actuator_types, config_types, error_codes, mqtt_messages, system_state, watchdog_types
├── services/
│   ├── actuator/        # actuator_manager, safety_controller, actuator_drivers/ (pump, pwm, valve)
│   ├── communication/   # mqtt_client, wifi_manager, network_discovery, webserver
│   ├── config/          # config_manager, storage_manager, wifi_config, library_manager, config_response
│   ├── provisioning/    # provision_manager
│   └── sensor/          # sensor_manager, sensor_factory, sensor_drivers/ (isensor_driver, ds18b20, sht31, ph, i2c_generic)
├── utils/               # logger, topic_builder, time_manager, data_buffer, string_helpers, json_helpers, onewire_utils
└── main.cpp             # Entry point
```

---

### Layer 2: El Servador (FastAPI Backend)

| Property | Value |
|----------|-------|
| **Framework** | FastAPI ^0.109.0 |
| **Python** | ^3.11 |
| **Package Manager** | Poetry |
| **Version** | 1.0.1 (pyproject.toml) / 2.0.0 (API) |
| **Source Files** | 170 .py files (excl. __init__) |
| **Port** | 8000 |

**Key Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | ^0.109.0 | Web framework |
| uvicorn[standard] | ^0.27.0 | ASGI server |
| python-multipart | ^0.0.6 | Form data parsing |
| sqlalchemy | ^2.0.25 | ORM |
| asyncpg | ^0.31.0 | PostgreSQL async driver |
| psycopg2-binary | ^2.9.9 | PostgreSQL sync driver |
| alembic | ^1.13.1 | DB migrations |
| paho-mqtt | ^1.6.1 | MQTT client |
| aiomqtt | ^2.0.1 | Async MQTT |
| pydantic[email] | ^2.5.3 | Data validation |
| pydantic-settings | ^2.1.0 | Settings |
| python-jose[cryptography] | ^3.3.0 | JWT |
| passlib[bcrypt] | ^1.7.4 | Password hashing |
| python-dotenv | ^1.0.0 | Environment file loading |
| python-dateutil | ^2.8.2 | Date utilities |
| pytz | ^2024.1 | Timezone support |
| prometheus-client | ^0.19.0 | Metrics |
| prometheus-fastapi-instrumentator | ^7.0 | FastAPI metrics |
| apscheduler | ^3.11.2 | Task scheduling |
| websockets | ^12.0 | WebSocket |
| httpx | ^0.26.0 | HTTP client |
| aiohttp | ^3.9.3 | Async HTTP client |
| requests | ^2.32.5 | HTTP requests |

**Dev Dependencies:** pytest ^8.0, pytest-asyncio ^0.23.3, pytest-cov ^4.1.0, pytest-mock ^3.12.0, pyjwt ^2.9.0, aiosqlite ^0.20.0 (test DB), ruff ^0.8.0, black ^24.1.1, isort ^5.13.2, flake8 ^7.0.0, mypy ^1.8.0, pylint ^3.0.3, types-python-dateutil ^2.8.19, types-pytz ^2024.1

**Source Structure:**
```
El Servador/god_kaiser_server/src/
├── api/
│   ├── dependencies.py       # DI for routes
│   └── v1/
│       ├── __init__.py       # api_v1_router aggregation (14 routers)
│       ├── actuators.py      # Actuator CRUD & control
│       ├── ai.py             # AI endpoints (not in router)
│       ├── audit.py          # Audit log endpoints
│       ├── auth.py           # Authentication (login, register, token)
│       ├── debug.py          # Debug endpoints
│       ├── errors.py         # DS18B20 error handling
│       ├── esp.py            # ESP device management
│       ├── health.py         # Health check endpoints
│       ├── kaiser.py         # Kaiser-Node endpoints (not in router)
│       ├── library.py        # Sensor library endpoints (not in router)
│       ├── logic.py          # Logic engine endpoints
│       ├── sensors.py        # Sensor CRUD & data
│       ├── sensor_type_defaults.py  # Sensor operating modes
│       ├── sequences.py      # Logic sequences
│       ├── subzone.py        # Subzone management
│       ├── users.py          # User management
│       ├── zone.py           # Zone management
│       └── websocket/        # WebSocket realtime (realtime.py)
├── core/
│   ├── config.py             # Settings (Pydantic)
│   ├── constants.py
│   ├── exception_handlers.py
│   ├── exceptions.py
│   ├── logging_config.py
│   ├── resilience/           # CircuitBreaker, Retry, Timeout, Registry, Exceptions
│   └── scheduler.py          # Central APScheduler
├── db/
│   ├── models/               # 16 SQLAlchemy models: auth, user, esp, esp_heartbeat, sensor, actuator, logic, logic_validation, subzone, enums, sensor_type_defaults, audit_log, ai, library, system, kaiser
│   ├── repositories/         # 15 repos: base, esp, esp_heartbeat, sensor, actuator, logic, subzone, user, ai, kaiser, library, token_blacklist, sensor_type_defaults, audit_log, system_config
│   └── session.py            # Engine + async session
├── middleware/
│   └── request_id.py         # X-Request-ID middleware
├── mqtt/
│   ├── client.py             # MQTT client (singleton)
│   ├── handlers/             # 11 registered + base + kaiser (sensor, actuator, heartbeat, discovery, config, zone_ack, subzone_ack, lwt, error, actuator_response, actuator_alert, kaiser [not registered])
│   ├── offline_buffer.py     # Offline message buffer
│   ├── publisher.py          # MQTT publisher
│   ├── subscriber.py         # MQTT subscriber
│   └── websocket_utils.py
├── schemas/                  # 19 Pydantic schemas: auth, common, api_response, esp, sensor, actuator, logic, sequence, zone, subzone, user, sensor_type_defaults, health, debug, debug_db, error_schemas, ai, kaiser, library
├── sensors/
│   ├── base_processor.py
│   ├── sensor_type_registry.py
│   └── sensor_libraries/active/  # pH, EC, moisture, pressure, CO2, flow, light, temperature, humidity
├── services/
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
│   ├── logic/                # Logic Engine (conditions/, actions/, safety/, validator)
│   ├── logic_engine.py
│   ├── logic_scheduler.py
│   ├── logic_service.py
│   ├── maintenance/          # Maintenance jobs (sensor_health, etc.)
│   ├── mqtt_auth_service.py
│   ├── safety_service.py
│   ├── sensor_scheduler_service.py
│   ├── sensor_service.py
│   ├── sensor_type_registration.py
│   ├── simulation/           # Mock-ESP simulation scheduler
│   ├── subzone_service.py
│   └── zone_service.py
├── utils/                    # data_helpers, time_helpers, mqtt_helpers, network_helpers, sensor_formatters
├── websocket/                # WebSocket manager (manager.py)
└── main.py                   # Application entry point with lifespan
```

**API Endpoints (14 registered routers):** `/api/v1/auth`, `/api/v1/audit`, `/api/v1/errors`, `/api/v1/esp`, `/api/v1/sensors`, `/api/v1/sensor_type_defaults`, `/api/v1/actuators`, `/api/v1/health`, `/api/v1/logic`, `/api/v1/debug`, `/api/v1/users`, `/api/v1/zone`, `/api/v1/subzone`, `/api/v1/sequences`, `/api/v1/ws` (WebSocket)

**Startup Sequence (from main.py):**
1. Security Validation (JWT key check)
2. Resilience Patterns (CircuitBreakers: mqtt, database, external_api)
3. Database Init (PostgreSQL + auto-migration)
4. MQTT Connect + 11 handler registrations
5. Central Scheduler + SimulationScheduler
6. MaintenanceService
7. Mock-ESP Recovery (Paket X)
8. Sensor Type Auto-Registration
9. Scheduled Sensor Job Recovery
10. WebSocket Manager Init
11. Safety Service + Logic Engine + Logic Scheduler
12. Prometheus Instrumentator

---

### Layer 3: El Frontend (Vue 3 Dashboard)

| Property | Value |
|----------|-------|
| **Framework** | Vue 3.5.13 |
| **Build Tool** | Vite ^6.2.4 |
| **Language** | TypeScript ~5.7.2 |
| **CSS** | Tailwind CSS ^3.4.17 |
| **State** | Pinia ^2.3.0 |
| **Router** | Vue Router ^4.5.0 |
| **Source Files** | 139 (.vue + .ts) |
| **Dev Port** | 5173 |
| **API Endpoint** | http://localhost:8000 (VITE_API_URL) |
| **WS Endpoint** | ws://localhost:8000 (VITE_WS_URL) |

**Key Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| vue | ^3.5.13 | UI Framework |
| pinia | ^2.3.0 | State Management |
| vue-router | ^4.5.0 | Routing |
| axios | ^1.10.0 | HTTP Client |
| chart.js | ^4.5.0 | Charts |
| chartjs-adapter-date-fns | ^3.0.0 | Chart.js date adapter |
| vue-chartjs | ^5.3.2 | Chart components |
| @vueuse/core | ^10.11.1 | Composition utilities |
| lucide-vue-next | ^0.468.0 | Icons |
| vue-draggable-plus | ^0.6.0 | Drag & Drop |
| date-fns | ^4.1.0 | Date formatting |
| tailwindcss | ^3.4.17 | CSS utility |

**Dev Dependencies:** vitest ^2.1.8, @vitest/coverage-v8 ^2.1.8, @vitest/ui ^2.1.8, @playwright/test ^1.50.0, @testing-library/vue ^8.1.0, @testing-library/user-event ^14.5.2, @vue/test-utils ^2.4.6, @pinia/testing ^0.1.6, msw ^2.6.9, jsdom ^25.0.1, @vitejs/plugin-vue ^5.2.3, vue-tsc ^2.2.0, typescript ~5.7.2, vite ^6.2.4, autoprefixer ^10.4.20, postcss ^8.4.49

**Source Structure:**
```
El Frontend/src/
├── api/                # REST API clients (auth, sensors, actuators, zones, subzones, logic, users, database, audit, config, loadtest, esp, debug, health, logs, errors)
├── components/
│   ├── charts/         # MultiSensorChart
│   ├── common/         # Input, Toggle, Select, Spinner, ToastContainer, LoadingState, EmptyState, Badge, Button, Card, ErrorState, Modal
│   ├── dashboard/      # StatCard, StatusPill, SensorSidebar, ActuatorSidebar, ComponentSidebar, ActionBar, CrossEspConnectionOverlay, UnassignedDropBar
│   ├── database/       # DataTable, SchemaInfoPanel, TableSelector, FilterPanel, RecordDetailModal, Pagination
│   ├── esp/            # ESPCard, ESPOrbitalLayout, SensorSatellite, ActuatorSatellite, SensorValueCard, GpioPicker, PendingDevicesPanel, ESPSettingsPopover, ConnectionLines, AnalysisDropZone
│   ├── error/          # ErrorDetailsModal, TroubleshootingPanel
│   ├── filters/        # UnifiedFilterBar
│   ├── layout/         # AppSidebar, AppHeader, MainLayout
│   ├── modals/         # CreateMockEspModal
│   ├── safety/         # EmergencyStopButton
│   ├── system-monitor/ # MqttTrafficTab, DatabaseTab, MonitorHeader, RssiIndicator, CleanupPanel, CleanupPreview, LogManagementPanel, PreviewEventCard, AutoCleanupStatusBanner, MonitorFilterPanel, DataSourceSelector, EventDetailsPanel, EventTimeline, EventsTab, HealthProblemChip, HealthSummaryBar, HealthTab, MonitorTabs, ServerLogsTab, UnifiedEventList
│   └── zones/          # ZoneGroup, ZoneAssignmentPanel
├── composables/        # useWebSocket, useModal, useToast, useQueryFilters, useGpioStatus, useZoneDragDrop, useSwipeNavigation, useConfigResponse
├── router/             # Vue Router config
├── services/           # websocket.ts (WebSocket service layer)
├── stores/             # Pinia stores (auth, esp, logic, database, dragState)
├── types/              # TypeScript types (logic, gpio, event-grouping, websocket-events, index)
├── utils/              # formatters, labels, gpioConfig, actuatorDefaults, sensorDefaults, wifiStrength, zoneColors, errorCodeTranslator, logMessageTranslator, logSummaryGenerator, eventTransformer, eventTypeIcons, eventGrouper, databaseColumnTranslator
├── views/              # DashboardView, LoginView, SetupView, SettingsView, LogicView, UserManagementView, LoadTestView, SystemConfigView, MaintenanceView, SensorsView, SystemMonitorView
├── App.vue
└── main.ts
```

---

### Layer 4: Technical Manager (AI Agent System)

Located in `.claude/` directory:

**13 Agents:**
| Agent | Role |
|-------|------|
| system-control | Session briefing + operations, creates SESSION_BRIEFING |
| system-control | System operations (start/stop/observe) |
| db-inspector | Database inspection & cleanup |
| esp32-debug | ESP32 serial log analysis |
| server-debug | Server JSON log analysis |
| mqtt-debug | MQTT traffic analysis |
| frontend-debug | Frontend build/runtime analysis |
| meta-analyst | Cross-report correlation |
| agent-manager | Agent consistency checker |
| esp32-dev | ESP32 pattern-conform implementation |
| server-dev | Server pattern-conform implementation |
| mqtt-dev | MQTT protocol implementation |
| frontend-dev | Frontend pattern-conform implementation |

**20 Skills:**
| Skill | Purpose |
|-------|---------|
| esp32-development | ESP32 firmware development |
| server-development | FastAPI backend development |
| frontend-development | Vue 3 dashboard development |
| mqtt-development | MQTT protocol development |
| esp32-debug | ESP32 debug knowledge |
| server-debug | Server debug knowledge |
| mqtt-debug | MQTT debug knowledge |
| frontend-debug | Frontend debug knowledge |
| meta-analyst | Cross-report analysis |
| system-control | System operations |
| db-inspector | Database inspection |
| collect-reports | Report consolidation |
| do | Plan execution |
| updatedocs | Documentation updates |
| verify-plan | Plan verification |
| git-health | Git & GitHub analysis |
| git-commit | Commit preparation |
| agent-manager | Agent flow analysis |
| system-control | Session planning, Briefing |

---

## 3. Docker Infrastructure

### docker-compose.yml (Main - 8 Services)

| # | Service | Image | Container Name | Ports | Depends On | Profile | Resources |
|---|---------|-------|----------------|-------|------------|---------|-----------|
| 1 | **postgres** | postgres:16-alpine | automationone-postgres | 5432:5432 | - | default | 512M limit, 256M reserved |
| 2 | **mqtt-broker** | eclipse-mosquitto:2 | automationone-mqtt | 1883:1883, 9001:9001 | - | default | 128M limit, 64M reserved |
| 3 | **el-servador** | ./El Servador (build) | automationone-server | 8000:8000 | postgres (healthy), mqtt (healthy) | default | 512M limit, 256M reserved |
| 4 | **el-frontend** | ./El Frontend (build) | automationone-frontend | 5173:5173 | el-servador (healthy) | default | 256M limit, 128M reserved |
| 5 | **loki** | grafana/loki:3.4 | automationone-loki | 3100:3100 | - | monitoring | 512M limit, 256M reserved |
| 6 | **promtail** | grafana/promtail:3.4 | automationone-promtail | - | loki (healthy) | monitoring | 128M limit, 64M reserved |
| 7 | **prometheus** | prom/prometheus:v3.2.1 | automationone-prometheus | 9090:9090 | el-servador (healthy) | monitoring | 512M limit, 256M reserved |
| 8 | **grafana** | grafana/grafana:11.5.2 | automationone-grafana | 3000:3000 | prometheus (healthy), loki (healthy) | monitoring | 256M limit, 128M reserved |

**Volumes:**
- `automationone-postgres-data` - PostgreSQL data
- `automationone-mosquitto-data` - Mosquitto data
- `automationone-loki-data` - Loki data
- `automationone-prometheus-data` - Prometheus data
- `automationone-grafana-data` - Grafana data

**Network:** `automationone-net` (bridge)

**Host Volume Mounts:**
- `./docker/postgres/postgresql.conf` -> postgres config
- `./docker/mosquitto/mosquitto.conf` -> MQTT broker config
- `./logs/server` -> server logs
- `./logs/mqtt` -> MQTT logs
- `./logs/postgres` -> PostgreSQL logs
- `./docker/loki/loki-config.yml` -> Loki config
- `./docker/promtail/config.yml` -> Promtail config
- `./docker/prometheus/prometheus.yml` -> Prometheus config
- `./docker/grafana/provisioning/` -> Grafana provisioning

### docker-compose.dev.yml (Development Overrides)
- el-servador: LOG_LEVEL=DEBUG, hot-reload, source mounts (src, alembic, tests)
- el-frontend: NODE_ENV=development, source mounts (src, public, config files)
- **Usage:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`

### docker-compose.ci.yml (GitHub Actions)
- postgres: tmpfs (RAM-based, 512M), hardcoded credentials
- mqtt-broker: CI-specific config (.github/mosquitto/)
- el-servador: ENVIRONMENT=test, LOG_LEVEL=WARNING, TESTING=true
- el-frontend: profile=frontend (opt-in only)
- **No monitoring services** (profiles not activated)
- **Usage:** `docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait`

### docker-compose.e2e.yml (Playwright E2E)
- Like CI but Frontend ALWAYS included (profiles: [])
- Faster healthchecks (3s interval)
- CORS allows localhost:5173 for Playwright browser
- **Usage:** `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --wait`

### docker-compose.test.yml (Lightweight Test)
- postgres replaced with busybox dummy (instant healthy)
- el-servador: SQLite database (`sqlite+aiosqlite:///./test_db.sqlite`)
- el-frontend: profile=frontend (opt-in)
- **Usage:** `docker compose -f docker-compose.yml -f docker-compose.test.yml up -d`

---

## 4. Monitoring Stack (Profile: monitoring)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| Grafana | grafana/grafana:11.5.2 | 3000 | Dashboards & visualization |
| Prometheus | prom/prometheus:v3.2.1 | 9090 | Metrics collection (scrapes el-servador:8000/api/v1/health/metrics, self:9090) |
| Loki | grafana/loki:3.4 | 3100 | Log aggregation |
| Promtail | grafana/promtail:3.4 | - | Log shipping (Docker socket) |

**Prometheus Config:**
```yaml
scrape_configs:
  - job_name: 'el-servador'
    metrics_path: '/api/v1/health/metrics'
    targets: ['el-servador:8000']
  - job_name: 'prometheus'
    targets: ['localhost:9090']
```

**Grafana Provisioning:**
- Datasources: `docker/grafana/provisioning/datasources/datasources.yml`
- Dashboards: `docker/grafana/provisioning/dashboards/dashboards.yml`
- Pre-built dashboard: `system-health.json`

**Activation:** `docker compose --profile monitoring up -d`

---

## 5. Configuration Summary

### Environment Variables (.env.example):
```bash
# PostgreSQL
POSTGRES_USER=god_kaiser
POSTGRES_PASSWORD=CHANGE_ME_USE_STRONG_PASSWORD
POSTGRES_DB=god_kaiser_db

# Server
DATABASE_URL=postgresql+asyncpg://god_kaiser:CHANGE_ME@postgres:5432/god_kaiser_db
DATABASE_AUTO_INIT=true
JWT_SECRET_KEY=CHANGE_ME_GENERATE_SECURE_KEY
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
SERVER_RELOAD=true
ENVIRONMENT=development
LOG_LEVEL=INFO
CORS_ALLOWED_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# MQTT
MQTT_BROKER_HOST=mqtt-broker
MQTT_BROKER_PORT=1883
MQTT_WEBSOCKET_PORT=9001

# Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Grafana (Profile: monitoring)
GRAFANA_ADMIN_PASSWORD=changeme

# Wokwi
WOKWI_CLI_TOKEN=
```

### Makefile Targets (28):

**Core:**
```
make up          - Start production stack
make down        - Stop all containers
make dev         - Start with hot-reload (+ dev overrides)
make test        - Start test environment (SQLite)
make logs        - Follow all logs
make logs-server - Follow server logs
make status      - Container status
make health      - Health check
make build       - Build images
make clean       - Full cleanup (volumes + orphans)
```

**Monitoring:**
```
make monitor-up     - Start monitoring stack (--profile monitoring)
make monitor-down   - Stop monitoring stack
make monitor-logs   - Follow monitoring logs
make monitor-status - Monitoring container status
```

**Database:**
```
make shell-db    - psql shell
make db-migrate  - Alembic upgrade head
make db-rollback - Alembic downgrade -1
make db-status   - Alembic current + history
make db-backup   - Backup database
make db-restore  - Restore (FILE=path)
```

**Frontend Tests:**
```
make test-fe         - Run all frontend tests
make test-fe-unit    - Unit tests with coverage
make test-fe-watch   - Watch mode
make test-fe-coverage- HTML coverage report
make test-full       - Backend + Frontend tests
```

**Wokwi Simulation (163 total scenarios, 13 categories):**
```
make wokwi-build         - Build firmware
make wokwi-test-boot     - Boot test
make wokwi-test-quick    - Boot + heartbeat
make wokwi-test-full     - 23 core CI scenarios (Makefile echo says 24, actual count 23)
make wokwi-test-runner   - Python runner (JSON report)
make wokwi-list          - List scenarios
make wokwi-test-category CAT=01-boot
make wokwi-test-single   SCENARIO=boot_full
make wokwi-test-onewire  - 29 scenarios
make wokwi-test-hardware - 9 scenarios
make wokwi-test-nvs-all  - 40 scenarios (Makefile help says 35, actual count 40)
make wokwi-test-gpio-all - 24 scenarios
make wokwi-test-pwm-all  - 18 scenarios (Makefile help says 15, actual count 18)
make wokwi-test-extended - Full ~163 scenarios (Makefile help says ~135, outdated)
make wokwi-status        - Status check
```

**Backend E2E:**
```
make test-be-e2e         - Full backend E2E (starts/stops Docker)
make test-be-e2e-ws      - WebSocket E2E only
make test-be-e2e-running - Against running stack
```

**Playwright E2E:**
```
make e2e-up      - Start full E2E stack
make e2e-down    - Stop E2E stack
make e2e-test    - Run Playwright tests
make e2e-test-ui - Interactive UI mode
```

---

## 6. Testing Setup

### Test Count Summary

| Layer | Test Type | Count | Tool |
|-------|-----------|-------|------|
| Backend (Python) | Unit + Integration + E2E + ESP32 | 105 test files | pytest ^8.0, pytest-asyncio |
| Frontend (Vue) | Unit tests | 5 test files | vitest ^2.1.8 (jsdom) |
| Frontend (Vue) | E2E (Playwright) | 5 spec files | @playwright/test ^1.50.0 |
| ESP32 (Wokwi) | Simulation scenarios | 163 YAML files | wokwi-cli |
| **Total** | | **278 test files/scenarios** | |

### Backend Test Structure:
```
El Servador/god_kaiser_server/tests/
├── conftest.py
├── unit/           # 36 test files (circuit_breaker, retry, timeout, GPIO, sensor, logic, calibration, etc.)
├── integration/    # 44 test files (API tests, MQTT flow, resilience, emergency stop, logic engine, etc.)
├── esp32/          # 19 test files (GPIO, I2C, MQTT, boot loop, timing, multi-device, performance)
└── e2e/            # 6 test files (logic engine, sensor workflow, real server, WebSocket, actuator)
```

**pytest markers:** unit, integration, esp32, e2e, hardware, performance, slow

### Frontend Unit Test Structure:
```
El Frontend/tests/
├── setup.ts
├── mocks/          # server.ts, websocket.ts, handlers.ts
├── unit/
│   ├── composables/  # useToast.test.ts, useWebSocket.test.ts
│   ├── stores/       # auth.test.ts, esp.test.ts
│   └── utils/        # formatters.test.ts
└── e2e/
    ├── global-setup.ts
    ├── global-teardown.ts
    ├── helpers/      # websocket.ts, mqtt.ts
    └── scenarios/    # auth.spec.ts, device-discovery.spec.ts, sensor-live.spec.ts, actuator.spec.ts, emergency.spec.ts
```

### Wokwi Scenario Categories:
| Category | Count | Description |
|----------|-------|-------------|
| 01-boot | 2 | Boot sequence, safe mode |
| 02-sensor | 5 | Heartbeat, DS18B20, DHT22, analog |
| 03-actuator | 7 | LED, PWM, status, emergency, timeout |
| 04-zone | 2 | Zone + subzone assignment |
| 05-emergency | 3 | Broadcast, ESP stop, full flow |
| 06-config | 2 | Sensor/actuator config add |
| 07-combined | 2 | Multi-device, sensor+actuator |
| 08-i2c | 20 | I2C bus operations |
| 08-onewire | 29 | OneWire protocol tests |
| 09-hardware | 9 | Hardware validation |
| 09-pwm | 18 | PWM controller |
| 10-nvs | 40 | NVS storage operations |
| gpio | 24 | GPIO manager |
| **Total** | **163** | |

### Vitest Config:
- Environment: jsdom
- Coverage: v8 provider
- Pool: forks (singleFork)
- Timeout: 10s

### Playwright Config:
- Test dir: `tests/e2e/scenarios`
- Browser: Chromium only
- Base URL: `http://localhost:5173`
- Auth: Global setup with storageState
- Parallel: true
- Retries: 1 (CI only)

---

## 7. CI/CD Pipelines

**8 GitHub Actions Workflows:**

| Workflow | File | Description |
|----------|------|-------------|
| Server Tests | server-tests.yml | Backend pytest (unit + integration) |
| Frontend Tests | frontend-tests.yml | Frontend vitest |
| ESP32 Tests | esp32-tests.yml | PlatformIO build |
| Wokwi Tests | wokwi-tests.yml | Wokwi simulation scenarios |
| PR Checks | pr-checks.yml | Pull request validation |
| Backend E2E | backend-e2e-tests.yml | Backend E2E tests (Docker) |
| Playwright | playwright-tests.yml | Frontend E2E (Playwright) |
| Security Scan | security-scan.yml | Security scanning |

---

## 8. Current Branch Status (feature/docs-cleanup)

**Recent Commits (15):**
```
3f77818 docs: add security reference and Docker rules
0807fb6 chore(reports): archive old debug session reports
fbf18ce refactor(debug): overhaul session startup script
f0b8c89 docs: update agent routing and reference documentation
9cfac83 feat(logging): improve error handling and log management
040c2b6 feat(docker): improve container configuration and logging
07464e4 feat(agents): add frontend-debug agent for Vue 3 analysis
2d30fcd feat(skills): add new skills for debugging and development
ea7c750 refactor(agents): rename agent files to kebab-case
0b1533e chore: update gitignore and vite config
3fa0c5a docs: add debug reports and update archives
3816ff5 fix(esp32): improve I2C stability and HTTP timeout handling
b2adb84 feat(docker): complete Docker integration with Makefile and scripts
df3432c fix(esp32): resolve watchdog timeout for I2C sensors
782f873 fix(esp32): skip GPIO validation for I2C sensors
```

**Branch Focus:** Documentation cleanup, agent system improvements, Docker infrastructure, debugging tooling

**Changed Files (~90):**
- `.claude/` - Agent configs, skills, rules, reports, references
- Docker configs (docker-compose, Dockerfiles, configs)
- Frontend (package.json, Dockerfile, API clients, tests)
- Backend (pyproject.toml, main.py, handlers, tests)
- ESP32 (sensor_manager, storage_manager, pwm_controller)
- Scripts, CI workflows, Makefile
- Deleted: mosquitto-installer.exe, http_client, pi_enhanced_processor, register_user.json

**Untracked (New) Files:**
- `.claude/agents/agent-manager/`
- `.claude/reference/infrastructure/`
- `.claude/reports/current/` (multiple new reports)
- `.claude/skills/` (agent-manager, do, frontend-debug, git-commit, git-health, verify-plan)
- `.env.ci`
- `.github/workflows/` (backend-e2e, frontend-tests, playwright-tests, security-scan)
- `El Frontend/` (coverage, docker, tests, playwright.config.ts, vitest.config.ts)
- `El Servador/` (new E2E tests)
- Docker configs (grafana, loki, prometheus, promtail)
- `docs/`

---

## 9. Port Mapping Overview

| Port | Service | Container | Protocol | Description |
|------|---------|-----------|----------|-------------|
| 1883 | MQTT Broker | automationone-mqtt | MQTT | ESP32 <-> Server |
| 3000 | Grafana | automationone-grafana | HTTP | Monitoring dashboards |
| 3100 | Loki | automationone-loki | HTTP | Log aggregation API |
| 5173 | Frontend | automationone-frontend | HTTP | Vue 3 dev server |
| 5432 | PostgreSQL | automationone-postgres | TCP | Database |
| 8000 | Backend | automationone-server | HTTP/WS | FastAPI + WebSocket |
| 9001 | MQTT WS | automationone-mqtt | WS | MQTT over WebSocket |
| 9090 | Prometheus | automationone-prometheus | HTTP | Metrics UI |

---

## 10. Next Steps & Recommendations

### For MCP Setup:
1. **Server API Base URL:** `http://localhost:8000/api/v1/`
2. **Health Check:** `GET http://localhost:8000/api/v1/health/live`
3. **WebSocket:** `ws://localhost:8000/api/v1/ws`
4. **OpenAPI Docs:** `http://localhost:8000/docs` (Swagger UI)
5. **Prometheus Metrics:** `http://localhost:8000/api/v1/health/metrics`
6. **MQTT Broker:** `localhost:1883` (no auth in dev)
7. **MQTT WebSocket:** `ws://localhost:9001`

### Quick Start:
```bash
# 1. Copy environment
cp .env.example .env
# Edit .env with your values

# 2. Start core stack
make up          # or: make dev (with hot-reload)

# 3. Start monitoring (optional)
docker compose --profile monitoring up -d

# 4. Run tests
make test-fe       # Frontend unit tests
make test-be-e2e   # Backend E2E (Docker)
make wokwi-test-quick  # ESP32 simulation (needs WOKWI_CLI_TOKEN)
```

### Architecture Notes:
- **No Redis** - Not used in this project
- **No Celery** - APScheduler for task scheduling
- **Database:** PostgreSQL 16 (production) / SQLite (unit tests)
- **MQTT:** Eclipse Mosquitto 2 (no authentication in dev)
- **Auth:** JWT tokens (python-jose) with bcrypt password hashing
- **Resilience:** Circuit Breakers (3), Retry, Timeout patterns built-in
- **Mock-ESP:** Server-side simulation of ESP32 devices for testing

---

*Report generated by Claude Code - AutomationOne Project Analysis*
