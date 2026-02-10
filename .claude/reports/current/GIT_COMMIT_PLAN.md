# Git Commit Plan

**Erstellt:** 2026-02-09  
**Branch:** feature/docs-cleanup  
**Ungepushte Commits:** 0 (vor diesem Plan)  
**Änderungen gesamt:** 72 modified, 15 deleted, 38+ untracked (inkl. Verzeichnisse), 0 staged  

---

## Commit 1: chore(docker): add monitoring stack config and Grafana alerting

**Was:** Docker-Compose um Monitoring-Services erweitern, Grafana-Dashboard und Prometheus/Promtail/PgAdmin anpassen, Grafana-Alerting-Regeln hinzufügen.

**Dateien:**
- `docker-compose.yml` – neue/angepasste Services für Monitoring
- `docker/grafana/provisioning/dashboards/system-health.json` – Dashboard-Anpassungen
- `docker/pgadmin/servers.json` – Server-Config
- `docker/prometheus/prometheus.yml` – Scrape-Config
- `docker/promtail/config.yml` – Log-Pipeline
- `docker/grafana/provisioning/alerting/` – neues Verzeichnis mit alert-rules.yml

**Befehle:**
```bash
git add docker-compose.yml docker/grafana/provisioning/dashboards/system-health.json docker/pgadmin/servers.json docker/prometheus/prometheus.yml docker/promtail/config.yml docker/grafana/provisioning/alerting/
git commit -m "chore(docker): add monitoring stack config and Grafana alerting"
```

---

## Commit 2: chore(config): extend .env.example for Grafana, pgAdmin and Wokwi

**Was:** .env.example um Variablen für Monitoring (Grafana, pgAdmin) und optional Wokwi CI ergänzen.

**Dateien:**
- `.env.example` – neue Einträge (z. B. GRAFANA_ADMIN_PASSWORD, PGADMIN_*, WOKWI_CLI_TOKEN)

**Befehle:**
```bash
git add .env.example
git commit -m "chore(config): extend .env.example for Grafana, pgAdmin and Wokwi"
```

---

## Commit 3: chore(build): extend Makefile with monitoring and log targets

**Was:** Makefile um Ziele für Monitoring und Log-Verzeichnisse erweitern.

**Dateien:**
- `Makefile` – neue Targets (z. B. logs, monitoring)

**Befehle:**
```bash
git add Makefile
git commit -m "chore(build): extend Makefile with monitoring and log targets"
```

---

## Commit 4: feat(server): add Prometheus custom metrics and simplify health endpoint

**Was:** Prometheus-Metriken (Uptime, CPU, Memory, MQTT, ESP) im Server einführen, in main einbinden und Health-Endpoint verschlanken.

**Dateien:**
- `El Servador/god_kaiser_server/pyproject.toml` – Abhängigkeit (prometheus-client, psutil)
- `El Servador/god_kaiser_server/src/core/metrics.py` – neu: Gauge-Definitionen und Update-Logik
- `El Servador/god_kaiser_server/src/main.py` – Metriken-Initialisierung und periodische Updates
- `El Servador/god_kaiser_server/src/api/v1/health.py` – Vereinfachung (Metriken ausgelagert)

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/pyproject.toml" "El Servador/god_kaiser_server/src/core/metrics.py" "El Servador/god_kaiser_server/src/main.py" "El Servador/god_kaiser_server/src/api/v1/health.py"
git commit -m "feat(server): add Prometheus custom metrics and simplify health endpoint"
```

---

## Commit 5: feat(frontend): add structured logger and migrate components and stores

**Was:** Zentralen strukturierten Logger (logger.ts) einführen und in API, Composables, Stores, Views und System-Monitor-Komponenten nutzen (JSON für Pipeline, lesbar im Dev).

**Dateien:**
- `El Frontend/src/utils/logger.ts` – neu
- `El Frontend/src/api/esp.ts` – Logger-Nutzung
- `El Frontend/src/api/index.ts` – Logger-Nutzung
- `El Frontend/src/components/charts/MultiSensorChart.vue`
- `El Frontend/src/components/dashboard/UnassignedDropBar.vue`
- `El Frontend/src/components/database/RecordDetailModal.vue`
- `El Frontend/src/components/esp/AnalysisDropZone.vue`
- `El Frontend/src/components/esp/ESPCard.vue`
- `El Frontend/src/components/esp/ESPOrbitalLayout.vue`
- `El Frontend/src/components/esp/ESPSettingsPopover.vue`
- `El Frontend/src/components/esp/SensorSatellite.vue`
- `El Frontend/src/components/esp/SensorValueCard.vue`
- `El Frontend/src/components/system-monitor/CleanupPanel.vue`
- `El Frontend/src/components/system-monitor/DatabaseTab.vue`
- `El Frontend/src/components/system-monitor/EventDetailsPanel.vue`
- `El Frontend/src/components/system-monitor/LogManagementPanel.vue`
- `El Frontend/src/components/system-monitor/MqttTrafficTab.vue`
- `El Frontend/src/components/system-monitor/ServerLogsTab.vue`
- `El Frontend/src/components/system-monitor/UnifiedEventList.vue`
- `El Frontend/src/components/zones/ZoneAssignmentPanel.vue`
- `El Frontend/src/components/zones/ZoneGroup.vue`
- `El Frontend/src/composables/useConfigResponse.ts`
- `El Frontend/src/composables/useWebSocket.ts`
- `El Frontend/src/composables/useZoneDragDrop.ts`
- `El Frontend/src/main.ts`
- `El Frontend/src/services/websocket.ts`
- `El Frontend/src/stores/auth.ts`
- `El Frontend/src/stores/dragState.ts`
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/stores/logic.ts`
- `El Frontend/src/utils/index.ts`
- `El Frontend/src/views/DashboardView.vue`
- `El Frontend/src/views/LoadTestView.vue`
- `El Frontend/src/views/MaintenanceView.vue`
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/vite-env.d.ts`
- `El Frontend/tsconfig.tsbuildinfo`

**Befehle:**
```bash
git add "El Frontend/src/utils/logger.ts" "El Frontend/src/api/esp.ts" "El Frontend/src/api/index.ts" "El Frontend/src/components/charts/MultiSensorChart.vue" "El Frontend/src/components/dashboard/UnassignedDropBar.vue" "El Frontend/src/components/database/RecordDetailModal.vue" "El Frontend/src/components/esp/AnalysisDropZone.vue" "El Frontend/src/components/esp/ESPCard.vue" "El Frontend/src/components/esp/ESPOrbitalLayout.vue" "El Frontend/src/components/esp/ESPSettingsPopover.vue" "El Frontend/src/components/esp/SensorSatellite.vue" "El Frontend/src/components/esp/SensorValueCard.vue" "El Frontend/src/components/system-monitor/CleanupPanel.vue" "El Frontend/src/components/system-monitor/DatabaseTab.vue" "El Frontend/src/components/system-monitor/EventDetailsPanel.vue" "El Frontend/src/components/system-monitor/LogManagementPanel.vue" "El Frontend/src/components/system-monitor/MqttTrafficTab.vue" "El Frontend/src/components/system-monitor/ServerLogsTab.vue" "El Frontend/src/components/system-monitor/UnifiedEventList.vue" "El Frontend/src/components/zones/ZoneAssignmentPanel.vue" "El Frontend/src/components/zones/ZoneGroup.vue" "El Frontend/src/composables/useConfigResponse.ts" "El Frontend/src/composables/useWebSocket.ts" "El Frontend/src/composables/useZoneDragDrop.ts" "El Frontend/src/main.ts" "El Frontend/src/services/websocket.ts" "El Frontend/src/stores/auth.ts" "El Frontend/src/stores/dragState.ts" "El Frontend/src/stores/esp.ts" "El Frontend/src/stores/logic.ts" "El Frontend/src/utils/index.ts" "El Frontend/src/views/DashboardView.vue" "El Frontend/src/views/LoadTestView.vue" "El Frontend/src/views/MaintenanceView.vue" "El Frontend/src/views/SystemMonitorView.vue" "El Frontend/src/vite-env.d.ts" "El Frontend/tsconfig.tsbuildinfo"
git commit -m "feat(frontend): add structured logger and migrate components and stores"
```

---

## Commit 6: docs(tm): cleanup TM commands and inbox, add pending commands and archive

**Was:** Alte TM-Pending- und Inbox-Reports entfernen, neue Pending-Commands (mosquitto-exporter, grafana-alerting, pgadmin, frontend-logging) und Completed/Inbox/Archive hinzufügen.

**Dateien (Modified/Deleted):**
- `.technical-manager/README.md`
- `.technical-manager/TECHNICAL_MANAGER.md`
- `.technical-manager/skills/infrastructure-status/SKILL.md`
- Gelöscht: `.technical-manager/commands/pending/agent-manager-log-access-reference.md`
- Gelöscht: `.technical-manager/commands/pending/system-control-docker-vollaudit-korrektur.md`
- Gelöscht: `.technical-manager/commands/pending/system-control-grafana-config.md`
- Gelöscht: `.technical-manager/commands/pending/system-control-promtail-healthcheck-filter.md`
- Gelöscht: `.technical-manager/commands/pending/system-control-promtail-positions.md`
- Gelöscht: alle 10 `.technical-manager/inbox/agent-reports/*-2026-02-09.md`

**Dateien (Untracked):**
- `.technical-manager/archive/` (ganzes Verzeichnis)
- `.technical-manager/commands/completed/CONSOLIDATED_REPORT.md`
- `.technical-manager/commands/pending/3-1_mosquitto-exporter-plan.md`
- `.technical-manager/commands/pending/3-1_mosquitto-exporter.md`
- `.technical-manager/commands/pending/3-2_grafana-alerting-plan.md`
- `.technical-manager/commands/pending/3-2_grafana-alerting.md`
- `.technical-manager/commands/pending/4-1_pgadmin-devtools.md`
- `.technical-manager/commands/pending/4-1_pgadmin-plan.md`
- `.technical-manager/commands/pending/4-2_frontend-logging-plan.md`
- `.technical-manager/commands/pending/4-2_frontend-logging.md`
- `.technical-manager/inbox/agent-reports/CONSOLIDATED_REPORT.md`
- `.technical-manager/inbox/agent-reports/mosquitto-exporter-impl-plan.md`

**Befehle:**
```bash
git add .technical-manager/README.md .technical-manager/TECHNICAL_MANAGER.md .technical-manager/skills/infrastructure-status/SKILL.md
git rm .technical-manager/commands/pending/agent-manager-log-access-reference.md .technical-manager/commands/pending/system-control-docker-vollaudit-korrektur.md .technical-manager/commands/pending/system-control-grafana-config.md .technical-manager/commands/pending/system-control-promtail-healthcheck-filter.md .technical-manager/commands/pending/system-control-promtail-positions.md
git rm .technical-manager/inbox/agent-reports/agent-manager-log-access-reference-2026-02-09.md .technical-manager/inbox/agent-reports/grafana-analysis-2026-02-09.md .technical-manager/inbox/agent-reports/loki-analysis-2026-02-09.md .technical-manager/inbox/agent-reports/pgadmin-analysis-2026-02-09.md .technical-manager/inbox/agent-reports/prometheus-analysis-2026-02-09.md .technical-manager/inbox/agent-reports/promtail-analysis-2026-02-09.md .technical-manager/inbox/agent-reports/server-dev-grafana-panels-2026-02-09.md .technical-manager/inbox/agent-reports/system-control-docker-vollaudit-korrektur-2026-02-09.md .technical-manager/inbox/agent-reports/system-control-grafana-config-2026-02-09.md .technical-manager/inbox/agent-reports/system-control-promtail-healthcheck-filter-2026-02-09.md .technical-manager/inbox/agent-reports/system-control-promtail-positions-2026-02-09.md
git add .technical-manager/archive/ .technical-manager/commands/completed/CONSOLIDATED_REPORT.md .technical-manager/commands/pending/3-1_mosquitto-exporter-plan.md .technical-manager/commands/pending/3-1_mosquitto-exporter.md .technical-manager/commands/pending/3-2_grafana-alerting-plan.md .technical-manager/commands/pending/3-2_grafana-alerting.md .technical-manager/commands/pending/4-1_pgadmin-devtools.md .technical-manager/commands/pending/4-1_pgadmin-plan.md .technical-manager/commands/pending/4-2_frontend-logging-plan.md .technical-manager/commands/pending/4-2_frontend-logging.md .technical-manager/inbox/agent-reports/CONSOLIDATED_REPORT.md .technical-manager/inbox/agent-reports/mosquitto-exporter-impl-plan.md
git commit -m "docs(tm): cleanup TM commands and inbox, add pending commands and archive"
```

---

## Commit 7: docs(claude): update reference, skills and current reports

**Was:** CLAUDE-Routing, Referenz-Docs (Docker, Testing), Skills (README, collect-reports) und aktuelle Reports (Frontend-Logging, Mosquitto, etc.) aktualisieren.

**Dateien:**
- `.claude/CLAUDE.md`
- `.claude/reference/infrastructure/DOCKER_REFERENCE.md`
- `.claude/reference/testing/agent_profiles.md`
- `.claude/reference/testing/flow_reference.md`
- `.claude/skills/README.md`
- `.claude/skills/collect-reports/SKILL.md`
- `.claude/reports/current/FRONTEND_LOGGING_ANALYSIS.md`
- `.claude/reports/current/FRONTEND_COMPONENT_LOGGER_MIGRATION.md` (untracked)
- `.claude/reports/current/FRONTEND_DEV_REPORT.md` (untracked)
- `.claude/reports/current/FRONTEND_DEV_STORE_LOGGER_MIGRATION.md` (untracked)
- `.claude/reports/current/FRONTEND_DEV_SYSTEM_MONITOR_LOGGER.md` (untracked)
- `.claude/reports/current/FRONTEND_LOGGING_IMPL_PLAN.md` (untracked)
- `.claude/reports/current/MOSQUITTO_EXPORTER_ANALYSIS.md` (untracked)
- `.claude/reports/current/GIT_COMMIT_PLAN.md` (diese Datei, neu)
- `.claude/reports/current/GIT_HEALTH_REPORT.md` (von git-health erstellt, neu)

**Befehle:**
```bash
git add .claude/CLAUDE.md .claude/reference/infrastructure/DOCKER_REFERENCE.md .claude/reference/testing/agent_profiles.md .claude/reference/testing/flow_reference.md .claude/skills/README.md .claude/skills/collect-reports/SKILL.md .claude/reports/current/FRONTEND_LOGGING_ANALYSIS.md .claude/reports/current/FRONTEND_COMPONENT_LOGGER_MIGRATION.md .claude/reports/current/FRONTEND_DEV_REPORT.md .claude/reports/current/FRONTEND_DEV_STORE_LOGGER_MIGRATION.md .claude/reports/current/FRONTEND_DEV_SYSTEM_MONITOR_LOGGER.md .claude/reports/current/FRONTEND_LOGGING_IMPL_PLAN.md .claude/reports/current/MOSQUITTO_EXPORTER_ANALYSIS.md .claude/reports/current/GIT_COMMIT_PLAN.md .claude/reports/current/GIT_HEALTH_REPORT.md
git commit -m "docs(claude): update reference, skills and current reports"
```

---

## Abschluss

**Nach allen Commits:**
```bash
git status
git push origin feature/docs-cleanup
```

**Zusammenfassung:**

| # | Commit | Typ | Schwerpunkt |
|---|--------|-----|-------------|
| 1 | chore(docker): add monitoring stack config and Grafana alerting | chore | Docker/Monitoring |
| 2 | chore(config): extend .env.example for Grafana, pgAdmin and Wokwi | chore | Config |
| 3 | chore(build): extend Makefile with monitoring and log targets | chore | Build |
| 4 | feat(server): add Prometheus custom metrics and simplify health endpoint | feat | Server |
| 5 | feat(frontend): add structured logger and migrate components and stores | feat | Frontend |
| 6 | docs(tm): cleanup TM commands and inbox, add pending commands and archive | docs | TM |
| 7 | docs(claude): update reference, skills and current reports | docs | Claude |

**Hinweise:**
- Commit 6: `git rm` für bereits gelöschte Dateien ausführen, danach neue/geänderte TM-Dateien mit `git add`. Unter Windows Pfade in Anführungszeichen setzen, falls Leerzeichen vorkommen.
- Commit 5: Viele Dateien; bei Bedarf in einem Schritt mit `git add "El Frontend/"` (ohne Anführungszeichen-Anzahl reduzieren), dann prüfen ob nur die gewünschten Änderungen gestaged sind.
- Reihenfolge einhalten: Infrastruktur (1–3) → Code (4–5) → Dokumentation (6–7).
