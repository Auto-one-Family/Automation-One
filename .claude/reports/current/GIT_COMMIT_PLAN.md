# Git Commit Plan (Executed)
**Erstellt:** 2026-02-22
**Branch:** feature/frontend-consolidation
**Status:** ✅ Alle 10 Commits ausgefuehrt und gepusht
**Aenderungen gesamt:** 132 Dateien (30 modified, ~93 deleted, ~40 new)

---

## Commit 1: `chore: add .serena/ to gitignore and Cursor project rules`

**Was:** .serena/ (lokale Serena LSP Config) zu .gitignore hinzugefuegt. Cursor-Projektregeln (.cursor/rules/ + BUGBOT.md) erstmals getrackt.

**Dateien:**
- `.gitignore` — .serena/ Pattern hinzugefuegt
- `.cursor/BUGBOT.md` — BugBot Review-Regeln (neu)
- `.cursor/rules/backend.mdc` — Backend-Review-Regeln (neu)
- `.cursor/rules/firmware.mdc` — Firmware-Review-Regeln (neu)
- `.cursor/rules/frontend.mdc` — Frontend-Review-Regeln (neu)

---

## Commit 2: `chore(docker): fix mosquitto-exporter healthcheck and update Makefile help text`

**Was:** Mosquitto-Exporter ist ein Scratch-Go-Binary ohne Shell — Healthcheck-Strategie auf NONE gesetzt. Makefile-Hilfetext korrigiert (22 statt 23 Tests).

**Dateien:**
- `docker-compose.yml` — Healthcheck CMD-SHELL → NONE
- `Makefile` — Hilfetext aktualisiert

---

## Commit 3: `feat(server,firmware): add I2C recovery, DS18B20 and test infrastructure error codes (6000-6099)`

**Was:** I2C Bus-Recovery Codes 1015-1018, DS18B20-spezifische Codes 1060-1063 und komplette Testinfrastruktur-Codes 6000-6099 in Python und C++ synchron hinzugefuegt.

**Dateien:**
- `El Servador/god_kaiser_server/src/core/error_codes.py` — Python-Mirror erweitert
- `El Trabajante/src/models/error_codes.h` — C++ Definitionen + Descriptions

---

## Commit 4: `fix(server): add GPIO 12 MTDI strapping rejection and ADC2 WiFi conflict warning`

**Was:** GPIO 12 (MTDI Strapping Pin) wird jetzt als System-Pin blockiert. ADC2-Pins bekommen eine Warnung bei ANALOG-Sensoren (WiFi-Konflikt). Tests erweitert.

**Dateien:**
- `El Servador/god_kaiser_server/src/core/constants.py` — GPIO_RESERVED erweitert
- `El Servador/god_kaiser_server/src/services/gpio_validation_service.py` — ADC2 Warning + GPIO 12
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` — Warning-Logging
- `El Servador/god_kaiser_server/tests/unit/test_gpio_validation.py` — 8 neue Tests

---

## Commit 5: `feat(server): add Prometheus metrics instrumentation and skip offline ESPs in sensor health`

**Was:** Prometheus-Metriken in 9 Services instrumentiert (HTTP errors, ESP heartbeats, MQTT reconnects, safety triggers, WS disconnects). Sensor-Health-Job ueberspringt jetzt offline-ESPs.

**Dateien:**
- `middleware/request_id.py` — HTTP error metric
- `mqtt/handlers/error_handler.py` — ESP error metric
- `mqtt/handlers/heartbeat_handler.py` — Heartbeat + boot_count metrics
- `mqtt/handlers/sensor_handler.py` — Sensor reading metric
- `mqtt/subscriber.py` — MQTT reconnect metric
- `services/actuator_service.py` — Actuator timeout metric
- `services/logic_engine.py` — Logic error + safety trigger metrics
- `services/safety_service.py` — Safety trigger metric
- `websocket/manager.py` — WS disconnect metric
- `services/maintenance/jobs/sensor_health.py` — Skip offline ESPs, inline cache

---

## Commit 6: `feat(frontend): add I2C sensor support, calibration view and simplify ZoneMonitorView`

**Was:** AddSensorModal unterstuetzt jetzt I2C-Sensoren mit Adress-Picker. Neuer CalibrationView mit Wizard. ZoneMonitorView: Vue Flow Diagramm entfernt (vereinfacht). Vite-Proxy auf localhost geaendert.

**Dateien:**
- `El Frontend/src/api/esp.ts` — page_size 500→100
- `El Frontend/src/api/calibration.ts` — Neuer API-Client (neu)
- `El Frontend/src/components/esp/AddSensorModal.vue` — I2C-Support
- `El Frontend/src/components/calibration/` — CalibrationStep + Wizard (neu)
- `El Frontend/src/components/charts/TimeRangeSelector.vue` — Zeitraum-Selektor (neu)
- `El Frontend/src/components/zones/ZoneMonitorView.vue` — Vue Flow entfernt
- `El Frontend/src/composables/index.ts` — Trailing newline fix
- `El Frontend/src/router/index.ts` — Calibration + SensorHistory Routes
- `El Frontend/src/utils/sensorDefaults.ts` — I2C Address Registry
- `El Frontend/src/views/CalibrationView.vue` — Neuer View (neu)
- `El Frontend/src/views/UserManagementView.vue` — Whitespace
- `El Frontend/vite.config.ts` — Proxy el-servador → localhost
- `El Frontend/Docs/UI/02-Individual-Views-Summary.md` — Formatting

---

## Commit 7: `feat(docker): add 18 Grafana alert rules for infrastructure, ESP32 and application monitoring`

**Was:** 18 neue Prometheus-basierte Alert-Rules fuer Grafana: DB-Performance, Container-Health, ESP32-Heartbeats, MQTT-Latenz, Safety-System, API-Errors, Logic-Engine, WebSocket-Disconnects.

**Dateien:**
- `docker/grafana/provisioning/alerting/alert-rules.yml` — +901 Zeilen

---

## Commit 8: `feat(firmware): add 10 Wokwi error-injection test scenarios for CI`

**Was:** 10 YAML-Szenarien fuer Error-Injection-Tests: MQTT disconnect, heap pressure, watchdog trigger, NVS corrupt, I2C bus stuck, sensor timeout, actuator timeout, GPIO conflict, invalid JSON config, emergency cascade.

**Dateien:**
- `El Trabajante/tests/wokwi/scenarios/11-error-injection/` — 10 YAML-Dateien (neu)
- `El Trabajante/tests/wokwi/helpers/emergency_cascade.sh` — Mode change

---

## Commit 9: `docs: update reference docs, CI pipeline, error codes and autoops commands for venv paths`

**Was:** CI-Pipeline-Doku aktualisiert (17 Jobs statt 12). Error-Code-Doku: Luecken als korrigiert markiert, Test-Codes 6000-6099 dokumentiert. AutoOps-Commands: poetry → venv Pfade. WOKWI_ERROR_MAPPING.md neu.

**Dateien:**
- `.claude/CLAUDE.md` — Figma MCP Integration Rules + Design Token Mapping
- `.claude/commands/autoops/debug.md` — venv Pfade
- `.claude/commands/autoops/run.md` — venv Pfade
- `.claude/commands/autoops/status.md` — venv Pfade
- `.claude/settings.json` — venv + Credentials Update
- `.claude/reference/debugging/CI_PIPELINE.md` — 17 Jobs, Artifacts
- `.claude/reference/errors/ERROR_CODES.md` — Luecken korrigiert, Test-Codes
- `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` — MCP/Serena Pfade
- `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` — 173 Szenarien, 52 CI
- `.claude/reference/testing/WOKWI_TESTING.md` — Error-Injection Pattern
- `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` — Neues Referenzdokument
- `.claude/skills/test-log-analyst/SKILL.md` — error-injection-test-logs
- `.technical-manager/TECHNICAL_MANAGER.md` — Boot-Orientierung

---

## Commit 10: `chore(reports): clean up 90+ stale reports and add current session reports`

**Was:** 90+ veraltete Reports aus .claude/reports/current/ entfernt. Aktuelle Session-Reports hinzugefuegt (AUTO-ONE, testrun-phasen/, CI_CD_FULL_AUDIT, WOKWI_VALIDATION, etc.). GIT_HEALTH_REPORT aktualisiert.

**Dateien:**
- 90+ geloeschte alte Reports
- 12+ neue/aktualisierte Reports
- `testrun-phasen/` Verzeichnis mit 9 Phasendokumenten

---

## Zusammenfassung

| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `chore: add .serena/ to gitignore and Cursor project rules` | 5 | chore |
| 2 | `chore(docker): fix mosquitto-exporter healthcheck` | 2 | chore |
| 3 | `feat(server,firmware): add error codes 6000-6099` | 2 | feat |
| 4 | `fix(server): GPIO 12 MTDI + ADC2 WiFi warning` | 4 | fix |
| 5 | `feat(server): Prometheus metrics + offline ESP skip` | 10 | feat |
| 6 | `feat(frontend): I2C support + calibration view` | 13 | feat |
| 7 | `feat(docker): 18 Grafana alert rules` | 1 | feat |
| 8 | `feat(firmware): 10 Wokwi error-injection scenarios` | 11 | feat |
| 9 | `docs: reference docs + CI pipeline + autoops venv` | 13 | docs |
| 10 | `chore(reports): clean up 90+ stale reports` | 112 | chore |
