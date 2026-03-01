# Git Commit Plan
**Erstellt:** 2026-03-01 22:30
**Branch:** master
**Ungepushte Commits:** 0
**Änderungen gesamt:** 41 modified, 33 untracked, 0 staged

---

## Commit 1: feat(server): add dashboard persistence API with CRUD endpoints

**Was:** Kompletter Dashboard-Persistenz-Stack: Alembic Migration, SQLAlchemy Model, Repository, Service, Pydantic Schemas und FastAPI Endpoints.

## Commit 2: feat(frontend): add shared composables, device components, and utils

**Was:** useSparklineCache, useZoneGrouping, useDeviceMetadata, SensorCard, ActuatorCard, DeviceMetadataSection, LinkedRulesSection, chartColors, qualityToStatus, normalizeRawTimestamp.

## Commit 3: feat(frontend): enhance dashboard editor with templates and widget config

**Was:** Dashboard Store Templates/Scopes/Breadcrumbs, CustomDashboardView Edit/View-Modus, WidgetConfigPanel, MultiSensorWidget, /editor Route.

## Commit 4: fix(frontend): fix widget state loss and chart Y-axis defaults

**Was:** Alle Widgets nutzen lokalen State statt Props, SENSOR_TYPE_CONFIG für Y-Achsen, LineChartWidget watched last_read.

## Commit 5: feat(frontend): rewrite views with routing, deep-linking, and monitor L3

**Was:** MonitorView L1/L2/L3, LogicView Deep-Linking, SensorsView refactored, RuleFlowEditor Hysteresis/Compound, Config-Panels mit Metadata/LinkedRules.

## Commit 6: docs: update reference docs, skills, and session reports

**Was:** REST_ENDPOINTS has_prev, Frontend-Skill v9.10, alle Session-Reports.

| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `feat(server): add dashboard persistence API` | 10 | feat |
| 2 | `feat(frontend): add shared composables and components` | 16 | feat |
| 3 | `feat(frontend): enhance dashboard editor` | 4 | feat |
| 4 | `fix(frontend): fix widget state loss and chart axes` | 7 | fix |
| 5 | `feat(frontend): rewrite views with routing and monitor L3` | 14 | feat |
| 6 | `docs: update reference docs, skills, and reports` | ~20 | docs |
