# System Status (Code Perspective)

**Generated:** 2026-02-10
**Branch:** feature/docs-cleanup
**Agent:** VS Code Claude (collect-system-status v1.0.0)

---

## 1. Docker Configuration

### Compose Files (5)
- docker-compose.yml (main)
- docker-compose.dev.yml
- docker-compose.test.yml
- docker-compose.ci.yml
- docker-compose.e2e.yml

### Services (11 Total)

| # | Service | Profile | Image |
|---|---------|---------|-------|
| 1 | postgres | core | postgres:16-alpine |
| 2 | mqtt-broker | core | eclipse-mosquitto:2 |
| 3 | el-servador | core | custom (Dockerfile) |
| 4 | el-frontend | core | custom (Dockerfile) |
| 5 | loki | monitoring | grafana/loki:3.4 |
| 6 | promtail | monitoring | grafana/promtail:3.4 |
| 7 | prometheus | monitoring | prom/prometheus:v3.2.1 |
| 8 | grafana | monitoring | grafana/grafana:11.5.2 |
| 9 | postgres-exporter | monitoring | prometheuscommunity/postgres-exporter:v0.16.0 |
| 10 | mosquitto-exporter | monitoring | sapcc/mosquitto-exporter:0.8.0 |
| 11 | pgadmin | devtools | dpage/pgadmin4:9.12 |

**Breakdown:** 4 core + 6 monitoring + 1 devtools

### Profiles (2)
- `monitoring` (loki, promtail, prometheus, grafana, postgres-exporter, mosquitto-exporter)
- `devtools` (pgadmin)

### Port Mappings

| Host Port | Container Port | Service | Note |
|-----------|----------------|---------|------|
| 5432 | 5432 | postgres | |
| 1883 | 1883 | mqtt-broker | MQTT |
| 9001 | 9001 | mqtt-broker | WebSocket |
| 8000 | 8000 | el-servador | |
| 5173 | 5173 | el-frontend | |
| 3100 | 3100 | loki | monitoring |
| 9090 | 9090 | prometheus | monitoring |
| 3000 | 3000 | grafana | monitoring |
| 5050 | 80 | pgadmin | devtools |

**Internal Only (expose, no host port):**
- 9187: postgres-exporter (monitoring)
- 9234: mosquitto-exporter (monitoring)

### Volumes (7)
automationone-postgres-data, automationone-mosquitto-data, automationone-loki-data, automationone-prometheus-data, automationone-grafana-data, automationone-promtail-positions, automationone-pgadmin-data

### Network
- automationone-net (bridge)

---

## 2. Backend (El Servador)

- **Routers:** 17 files (excl. `__init__.py`)
  - kaiser, library, ai, sequences, zone, sensor_type_defaults, users, sensors, subzone, audit, errors, actuators, esp, auth, logic, debug, health
- **Models:** 16 files (excl. `__init__.py`)
  - auth, user, subzone, enums, sensor_type_defaults, esp_heartbeat, logic, logic_validation, audit_log, sensor, esp, system, actuator, library, ai, kaiser
- **Services:** 40 files (excl. 8 `__init__.py`)
  - Includes logic engine (conditions, actions, safety), maintenance jobs, simulation, config builder
- **Tests:** 115 files total
  - Unit: 37 (36 test + 1 conftest)
  - Integration: 45 (44 test + 1 conftest_logic)
  - ESP32: 25 (16 test + 3 mocks + 2 `__init__` + 1 conftest + 3 support)
  - E2E: 7 (6 test + 1 conftest)
  - Root: 1 conftest

---

## 3. Frontend (El Frontend)

- **Components:** 67 .vue files
  - common: 12 (Button, Card, Badge, Modal, Input, Toggle, Select, Spinner, LoadingState, EmptyState, ErrorState, ToastContainer)
  - dashboard: 8 (CrossEspConnectionOverlay, StatusPill, StatCard, SensorSidebar, ActuatorSidebar, ComponentSidebar, ActionBar, UnassignedDropBar)
  - esp: 10 (ESPCard, ESPOrbitalLayout, ESPSettingsPopover, SensorSatellite, SensorValueCard, ActuatorSatellite, ConnectionLines, GpioPicker, PendingDevicesPanel, AnalysisDropZone)
  - system-monitor: 20 (ServerLogsTab, MqttTrafficTab, DatabaseTab, EventsTab, HealthTab, CleanupPanel, LogManagementPanel, EventDetailsPanel, UnifiedEventList, MonitorTabs, MonitorHeader, MonitorFilterPanel, EventTimeline, DataSourceSelector, HealthSummaryBar, HealthProblemChip, PreviewEventCard, AutoCleanupStatusBanner, RssiIndicator, CleanupPreview)
  - database: 6 (DataTable, TableSelector, FilterPanel, Pagination, SchemaInfoPanel, RecordDetailModal)
  - layout: 3 (MainLayout, AppHeader, AppSidebar)
  - zones: 2 (ZoneAssignmentPanel, ZoneGroup)
  - error: 2 (ErrorDetailsModal, TroubleshootingPanel)
  - charts: 1 (MultiSensorChart)
  - filters: 1 (UnifiedFilterBar)
  - modals: 1 (CreateMockEspModal)
  - safety: 1 (EmergencyStopButton)
- **Views:** 11 files
  - DashboardView, LoginView, SensorsView, LogicView, SettingsView, SetupView, SystemMonitorView, MaintenanceView, LoadTestView, UserManagementView, SystemConfigView
- **Stores:** 5 files (auth, esp, logic, dragState, database)
- **API Clients:** 17 files (incl. index.ts)
  - auth, esp, sensors, actuators, zones, subzones, logic, audit, database, health, logs, errors, debug, config, users, loadtest, index
- **Composables:** 9 files (incl. index.ts)
  - useWebSocket, useToast, useModal, useGpioStatus, useQueryFilters, useZoneDragDrop, useSwipeNavigation, useConfigResponse, index

---

## 4. Firmware (El Trabajante)

- **C++ Files:** 42 .cpp
- **Header Files:** 56 .h
- **Total Source:** 98 files

### Architecture
```
src/
  config/          (2 .h: feature_flags, system_config + 2 hardware)
  core/            (3 .cpp + 3 .h: application, main_loop, system_controller)
  drivers/         (5 .cpp + 5 .h: gpio_manager, i2c_bus, i2c_sensor_protocol, onewire_bus, pwm_controller)
  error_handling/  (3 .cpp + 3 .h: circuit_breaker, error_tracker, health_monitor)
  models/          (1 .cpp + 8 .h: sensor_registry, mqtt_messages, system_state, system_types, etc.)
  services/
    actuator/      (4 .cpp + 4 .h: actuator_manager, safety_controller, pump/pwm/valve_actuator)
    communication/ (5 .cpp + 5 .h: mqtt_client, wifi_manager, http_client, network_discovery, webserver)
    config/        (5 .cpp + 5 .h: config_manager, config_response, library_manager, storage_manager, wifi_config)
    provisioning/  (1 .cpp + 1 .h: provision_manager)
    sensor/        (5 .cpp + 5 .h: sensor_manager, sensor_factory, pi_enhanced_processor, 4 drivers)
  utils/           (6 .cpp + 6 .h: logger, data_buffer, string_helpers, time_manager, topic_builder, onewire_utils)
  main.cpp
```

### PlatformIO Environments (3)
1. `seeed_xiao_esp32c3` - Production Xiao board
2. `esp32_dev` - Development ESP32-DevKit
3. `wokwi_simulation` - Wokwi virtual testing (extends esp32_dev)

---

## 5. Agent System (.claude/)

- **Agents:** 13 (subagent types)
  - Debug: esp32-debug, server-debug, mqtt-debug, frontend-debug
  - Dev: esp32-dev, server-dev, mqtt-dev, frontend-dev
  - System: system-control, db-inspector, agent-manager
  - Meta: meta-analyst, test-log-analyst
- **Agent .md files in .claude/agents/:** 4 (meta-analyst, esp32-debug, db-inspector, system-control) + Readme
- **Skills:** 21 (SKILL.md files)
  - Development: esp32-development, server-development, frontend-development, mqtt-development
  - Debug: esp32-debug, server-debug, frontend-debug, mqtt-debug
  - System: system-control, db-inspector, collect-system-status, collect-reports
  - Analysis: meta-analyst, test-log-analyst, verify-plan, agent-manager
  - Workflow: git-commit, git-health, updatedocs, do
  - Quality: ki-audit
- **Current Reports:** 42 files in .claude/reports/current/

---

## 6. CI/CD

### GitHub Workflows (8)
1. security-scan.yml
2. esp32-tests.yml
3. pr-checks.yml
4. server-tests.yml
5. wokwi-tests.yml
6. frontend-tests.yml
7. playwright-tests.yml
8. backend-e2e-tests.yml

### Makefile Targets (36)
**Core:** help, up, down, build, clean, status, health
**Dev:** dev, dev-down
**Test:** test, test-down, e2e-up, e2e-down, e2e-test, e2e-test-ui
**Logs:** logs, logs-server, logs-mqtt, logs-frontend, logs-db
**Shell:** shell-server, shell-db
**Database:** db-migrate, db-rollback, db-status, db-backup, db-restore
**MQTT:** mqtt-sub
**Monitoring:** monitor-up, monitor-down, monitor-logs, monitor-status
**DevTools:** devtools-up, devtools-down, devtools-logs, devtools-status

---

## 7. Discrepancies (vs Expected in Skill Template)

| Item | Expected | Actual | Delta | Note |
|------|----------|--------|-------|------|
| Docker Services | 8 | 11 | +3 | postgres-exporter, mosquitto-exporter, pgadmin added |
| Profiles | 1 | 2 | +1 | devtools profile added (pgadmin) |
| Routers | 18 | 17 | -1 | Skill template outdated |
| Models | 17 | 16 | -1 | Skill template outdated |
| Tests (total) | ~105 | 115 | +10 | New tests added since last count |
| Tests (unit) | 36 | 37 | +1 | |
| Tests (integration) | 44 | 45 | +1 | |
| Tests (esp32) | 19 | 25 | +6 | New: conftest, test_performance, test_cross_esp, test_integration |
| Tests (e2e) | 6 | 7 | +1 | conftest added |

### Skill Template Corrections Needed
- `collect-system-status/SKILL.md` line "Expected: 18" routers -> should be 17
- `collect-system-status/SKILL.md` line "Expected: 17" models -> should be 16
- Docker services expected count should be 11 (4 core + 6 monitoring + 1 devtools)
- Profiles count should be 2 (monitoring, devtools)

---

*Generated by VS Code Claude*
*Skill: collect-system-status v1.0.0*
