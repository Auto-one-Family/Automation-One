# Git Commit Plan

**Erstellt:** 2026-02-07
**Branch:** feature/docs-cleanup
**Ungepushte Commits:** 0 (vor diesem Plan)
**Änderungen gesamt:** 117 modified, 1 staged (mosquitto-installer.exe delete), ~100+ untracked

---

## Hinweise: Nicht committen (empfohlen)

Diese Dateien/Verzeichnisse sollten **nicht** ins Repo:

| Pfad | Grund |
|------|-------|
| `El Frontend/coverage/` | Generiert durch Vitest, in .gitignore aufnehmen |
| `scripts/__pycache__/` | Python-Cache, in .gitignore aufnehmen |
| `debug_output.txt` | Debug-Artefakt |
| `.claude/settings.local.json` | Lokale Einstellungen, evtl. sensibel |

**Vor dem ersten Commit:** `.gitignore` erweitern (siehe Commit 1).

---

## Commit 1: chore(git): remove binary, extend gitignore for generated artifacts

**Was:** Entfernt `mosquitto-installer.exe` (bereits in .gitignore, war versehentlich getrackt). Erweitert .gitignore um coverage, __pycache__, debug_output, settings.local – damit generierte/lokale Artefakte nicht versehentlich committed werden.

**Dateien:**
- `mosquitto-installer.exe` – BEREITS STAGED, Löschung
- `.gitignore` – Erweiterung um `El Frontend/coverage/`, `scripts/__pycache__/`, `debug_output.txt`, `.claude/settings.local.json`

**Befehle:**
```bash
git add .gitignore
git commit -m "chore(git): remove binary, extend gitignore for generated artifacts"
```

---

## Commit 2: refactor(server): remove sensor_processing HTTP API, add Prometheus metrics

**Was:** Server-zentrische Architektur – sensor_processing.py (HTTP-HTTP-Anbindung) entfernt. Sensor-Verarbeitung erfolgt ausschließlich über MQTT. Prometheus-Instrumentierung für Monitoring hinzugefügt.

**Dateien:**
- `El Servador/god_kaiser_server/src/main.py` – sensor_processing Router entfernt, Prometheus Instrumentator hinzugefügt
- `El Servador/god_kaiser_server/src/api/sensor_processing.py` – gelöscht
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` – Anpassung (Import/Referenz)
- `El Servador/god_kaiser_server/pyproject.toml` – prometheus_fastapi_instrumentator Dependency

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/src/main.py"
git add "El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py"
git add "El Servador/god_kaiser_server/pyproject.toml"
git rm "El Servador/god_kaiser_server/src/api/sensor_processing.py"
git commit -m "refactor(server): remove sensor_processing HTTP API, add Prometheus metrics"
```

---

## Commit 3: refactor(firmware): server-centric mode, remove PiEnhancedProcessor and http_client

**Was:** ESP32 sendet rohe Sensordaten via MQTT. PiEnhancedProcessor (HTTP-Anbindung) und http_client entfernt. Verarbeitung erfolgt ausschließlich auf dem Server.

**Dateien:**
- `El Trabajante/src/services/sensor/sensor_manager.cpp` – PiProcessor entfernt, raw data → MQTT
- `El Trabajante/src/services/sensor/sensor_manager.h` – pi_processor_ Member entfernt
- `El Trabajante/src/services/sensor/pi_enhanced_processor.cpp` – gelöscht
- `El Trabajante/src/services/sensor/pi_enhanced_processor.h` – gelöscht
- `El Trabajante/src/services/communication/http_client.cpp` – gelöscht
- `El Trabajante/src/services/communication/http_client.h` – gelöscht
- `El Trabajante/src/services/config/storage_manager.cpp` – Anpassung
- `El Trabajante/src/drivers/pwm_controller.cpp` – kleinere Anpassung

**Befehle:**
```bash
git add "El Trabajante/src/services/sensor/sensor_manager.cpp"
git add "El Trabajante/src/services/sensor/sensor_manager.h"
git add "El Trabajante/src/services/config/storage_manager.cpp"
git add "El Trabajante/src/drivers/pwm_controller.cpp"
git rm "El Trabajante/src/services/sensor/pi_enhanced_processor.cpp"
git rm "El Trabajante/src/services/sensor/pi_enhanced_processor.h"
git rm "El Trabajante/src/services/communication/http_client.cpp"
git rm "El Trabajante/src/services/communication/http_client.h"
git commit -m "refactor(firmware): server-centric mode, remove PiEnhancedProcessor and http_client"
```

---

## Commit 4: test(server): update e2e tests, add actuator and websocket tests

**Was:** E2E-Tests an Server-Refactoring angepasst. Neue E2E-Tests: actuator_alert, actuator_direct_control, websocket_events. conftest und bestehende Tests aktualisiert.

**Dateien:**
- `El Servador/god_kaiser_server/tests/conftest.py`
- `El Servador/god_kaiser_server/tests/e2e/conftest.py`
- `El Servador/god_kaiser_server/tests/e2e/test_logic_engine_real_server.py`
- `El Servador/god_kaiser_server/tests/e2e/test_real_server_scenarios.py`
- `El Servador/god_kaiser_server/tests/e2e/test_sensor_workflow.py`
- `El Servador/god_kaiser_server/tests/e2e/test_actuator_alert_e2e.py` – NEU
- `El Servador/god_kaiser_server/tests/e2e/test_actuator_direct_control.py` – NEU
- `El Servador/god_kaiser_server/tests/e2e/test_websocket_events.py` – NEU
- `El Servador/god_kaiser_server/tests/unit/test_ds18b20_errors.py`

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/tests/"
git commit -m "test(server): update e2e tests, add actuator and websocket tests"
```

---

## Commit 5: test(firmware): update Wokwi scenarios for consistency

**Was:** Wokwi-Testszenarien an aktuelle API/Protokoll angepasst – actuator, zone, emergency, config, combined, hardware, pwm, gpio.

**Dateien:**
- `El Trabajante/tests/wokwi/scenarios/03-actuator/*.yaml` (6)
- `El Trabajante/tests/wokwi/scenarios/04-zone/zone_assignment.yaml`
- `El Trabajante/tests/wokwi/scenarios/05-emergency/*.yaml` (3)
- `El Trabajante/tests/wokwi/scenarios/06-config/*.yaml` (2)
- `El Trabajante/tests/wokwi/scenarios/07-combined/*.yaml` (2)
- `El Trabajante/tests/wokwi/scenarios/09-hardware/*.yaml` (7)
- `El Trabajante/tests/wokwi/scenarios/09-pwm/*.yaml` (5)
- `El Trabajante/tests/wokwi/scenarios/gpio/*.yaml` (15)

**Befehle:**
```bash
git add "El Trabajante/tests/wokwi/scenarios/"
git commit -m "test(firmware): update Wokwi scenarios for consistency"
```

---

## Commit 6: feat(frontend): add Vitest, Playwright, unit and e2e tests

**Was:** Vitest und Playwright für Unit- und E2E-Tests. Mocks (MSW), Composables/Store-Tests, E2E-Szenarien (auth, actuator, device-discovery, emergency, sensor-live).

**Dateien:**
- `El Frontend/package.json` – Vitest, Playwright, Testing Library, MSW
- `El Frontend/package-lock.json`
- `El Frontend/vitest.config.ts`
- `El Frontend/playwright.config.ts`
- `El Frontend/tests/` – setup, mocks, unit, e2e
- `El Frontend/src/api/actuators.ts` – kleine Anpassung
- `El Frontend/src/api/errors.ts` – kleine Anpassung
- `El Frontend/Dockerfile` – Build-Anpassung
- `El Frontend/.dockerignore`
- `El Frontend/Docs/UI/02-Individual-Views-Summary.md`

**Befehle:**
```bash
git add "El Frontend/package.json"
git add "El Frontend/package-lock.json"
git add "El Frontend/vitest.config.ts"
git add "El Frontend/playwright.config.ts"
git add "El Frontend/tests/"
git add "El Frontend/src/api/actuators.ts"
git add "El Frontend/src/api/errors.ts"
git add "El Frontend/Dockerfile"
git add "El Frontend/.dockerignore"
git add "El Frontend/Docs/UI/02-Individual-Views-Summary.md"
git commit -m "feat(frontend): add Vitest, Playwright, unit and e2e tests"
```

---

## Commit 7: ci: add frontend, backend-e2e, playwright, security workflows; update existing

**Was:** Neue Workflows: frontend-tests, backend-e2e-tests, playwright-tests, security-scan. pr-checks: verbesserte .env-Erkennung (.env.example, .env.ci erlaubt). esp32-tests, server-tests, wokwi-tests aktualisiert.

**Dateien:**
- `.github/workflows/frontend-tests.yml` – NEU
- `.github/workflows/backend-e2e-tests.yml` – NEU
- `.github/workflows/playwright-tests.yml` – NEU
- `.github/workflows/security-scan.yml` – NEU
- `.github/workflows/pr-checks.yml`
- `.github/workflows/esp32-tests.yml`
- `.github/workflows/server-tests.yml`
- `.github/workflows/wokwi-tests.yml`
- `.env.example` – evtl. neue Variablen
- `.env.ci` – NEU (CI-Config)

**Befehle:**
```bash
git add ".github/workflows/"
git add .env.example
git add .env.ci
git commit -m "ci: add frontend, backend-e2e, playwright, security workflows"
```

---

## Commit 8: chore(docker): add monitoring stack, CI/E2E compose, log rotation

**Was:** Docker-Compose: Log-Rotation, Resource-Limits, Security-Opts. Grafana, Loki, Prometheus, pgAdmin, Promtail. docker-compose.ci.yml und docker-compose.e2e.yml für CI/E2E.

**Dateien:**
- `docker-compose.yml`
- `docker-compose.ci.yml` – NEU
- `docker-compose.e2e.yml` – NEU
- `docker/grafana/` – NEU
- `docker/loki/` – NEU
- `docker/prometheus/` – NEU
- `docker/promtail/` – NEU
- `docker/pgadmin/` – NEU
- `docker/postgres/postgresql.conf`

**Befehle:**
```bash
git add docker-compose.yml
git add docker-compose.ci.yml
git add docker-compose.e2e.yml
git add docker/
git commit -m "chore(docker): add monitoring stack, CI/E2E compose, log rotation"
```

---

## Commit 9: feat(agents): add agent-manager, new skills, update routing and references

**Was:** Agent-Manager für Flow-/Agent-Konsistenz. Neue Skills: agent-manager, collect-system-status, do, frontend-debug, git-commit, git-health, verify-plan. Technical Manager Integration. CLAUDE.md, Agents, Skills, Reference aktualisiert.

**Dateien:**
- `.claude/CLAUDE.md`
- `.claude/agents/Readme.md`
- `.claude/agents/esp32-debug.md`
- `.claude/agents/frontend/frontend-debug-agent.md`
- `.claude/agents/meta-analyst.md`
- `.claude/agents/mqtt/mqtt-debug-agent.md`
- `.claude/agents/server/server-debug-agent.md`
- `.claude/agents/system-control.md`
- `.claude/agents/agent-manager/` – NEU
- `.claude/skills/README.md`
- `.claude/skills/DO/SKILL.md`
- `.claude/skills/esp32-debug/SKILL.md`
- `.claude/skills/esp32-development/SKILL.md`
- `.claude/skills/meta-analyst/SKILL.md`
- `.claude/skills/mqtt-debug/SKILL.md`
- `.claude/skills/server-debug/SKILL.md`
- `.claude/skills/system-control/SKILL.md`
- `.claude/skills/agent-manager/` – NEU
- `.claude/skills/collect-system-status.md/` – NEU (Hinweis: Ordner-name enthält .md)
- `.claude/skills/do/` – NEU
- `.claude/skills/frontend-debug/` – NEU
- `.claude/skills/git-commit/` – NEU
- `.claude/skills/git-health/` – NEU
- `.claude/skills/verify-plan/` – NEU
- `.claude/reference/debugging/CI_PIPELINE.md`
- `.claude/reference/debugging/LOG_LOCATIONS.md`
- `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md`
- `.claude/reference/patterns/COMMUNICATION_FLOWS.md`
- `.claude/reference/patterns/vs_claude_best_practice.md`
- `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`
- `.claude/reference/testing/TEST_WORKFLOW.md`
- `.claude/reference/testing/TEST_ENGINE_REFERENCE.md` – NEU
- `.claude/reference/testing/agent_profiles.md` – NEU
- `.claude/reference/testing/flow_reference.md` – NEU
- `.claude/reference/infrastructure/` – NEU
- `.claude/rules/docker-rules.md`
- `.technical-manager/` – NEU

**Befehle:**
```bash
git add .claude/
git add .technical-manager/
git commit -m "feat(agents): add agent-manager, new skills, update routing and references"
```

---

## Commit 10: docs: update firmware docs, archive reports, add Makefile and scripts

**Was:** El Trabajante Docs aktualisiert (API_REFERENCE, Mqtt_Protocoll, Roadmap, System_Overview, sensor-reading-flow). LOG_INFRASTRUKTUR_ANALYSE nach archive verschoben. BUGBOT, Makefile, scripts (Wokwi, hardware validation → scripts/tests/).

**Dateien:**
- `El Trabajante/docs/API_REFERENCE.md`
- `El Trabajante/docs/Mqtt_Protocoll.md`
- `El Trabajante/docs/Roadmap.md`
- `El Trabajante/docs/System_Overview.md`
- `El Trabajante/docs/system-flows/02-sensor-reading-flow.md`
- `.claude/reports/Technical Manager/PROJECT_OVERVIEW.md`
- `.claude/reports/Technical Manager/TM SKILLS.md` – NEU
- `.claude/reports/User_Reports/AutoOneFullStack.md`
- `.claude/reports/current/LOG_INFRASTRUKTUR_ANALYSE.md` – gelöscht (→ archive)
- `.claude/reports/archive/LOG_INFRASTRUKTUR_ANALYSE.md` – NEU (archiviert)
- `BUGBOT.md`
- `Makefile`
- `scripts/debug/start_session.sh`
- `scripts/run-wokwi.bat`
- `scripts/run-wokwi-tests.py` – NEU
- `scripts/tests/` – NEU (run_hardware_validation_tests.py, test_hardware_validation.ps1 verschoben)
- `run_hardware_validation_tests.py` – gelöscht (→ scripts/tests/)
- `test_hardware_validation.ps1` – gelöscht (→ scripts/tests/)
- `register_user.json` – gelöscht
- `docs/` – NEU (mqtt-injection-analysis.md, wokwi-self-hosted-evaluation.md)

**Befehle:**
```bash
git add "El Trabajante/docs/"
git add ".claude/reports/"
git add BUGBOT.md
git add Makefile
git add scripts/
git add docs/
git rm run_hardware_validation_tests.py
git rm test_hardware_validation.ps1
git rm register_user.json
git rm ".claude/reports/current/LOG_INFRASTRUKTUR_ANALYSE.md"
git add ".claude/reports/archive/LOG_INFRASTRUKTUR_ANALYSE.md"
git commit -m "docs: update firmware docs, archive reports, add Makefile and scripts"
```

---

## Optional: Session-Reports (aktuell) – committen oder ignorieren

**Dateien in `.claude/reports/current/`:**
- AUFTRAG_STATUS_CHECK.md, DOCKER.md, DOCKER_REPORT.md, DOCKER_VOLLAUDIT.md
- ESP_STORE_TEST_ANALYSE.md, PLAN.md, SESSION_BRIEFING.md, SYSTEM_CONTROL_REPORT.md
- TEST_ENGINE_AUDIT.md, TEST_VERIFICATION_TRUTH.md, TEST_ZAHLEN_VERIFIZIERT.md
- WEBSOCKET_E2E_ANALYSE.md, WOKWI_INTEGRATION_AUDIT.md, Wokwi_Full_Integration.md, verifikation_phase3_wokwi.md

**Empfehlung:** Session-Reports sind ephemeral. Normalerweise **nicht** committen. Wenn doch: separater Commit `docs(reports): add current session reports` – oder in `.gitignore` mit `!.gitkeep` belassen.

---

## Abschluss

**Vor Commit 1:** `.gitignore` erweitern:
```
# Vitest coverage
El Frontend/coverage/

# Python cache (root scripts)
scripts/__pycache__/

# Debug / local
debug_output.txt
.claude/settings.local.json
```

**Nach allen Commits:**
```bash
git status
git push origin feature/docs-cleanup
```

**Zusammenfassung:**

| # | Commit | Typ |
|---|--------|-----|
| 1 | chore(git): remove binary, extend gitignore | chore |
| 2 | refactor(server): remove sensor_processing, add Prometheus | refactor |
| 3 | refactor(firmware): server-centric, remove PiEnhanced/http_client | refactor |
| 4 | test(server): update e2e, add actuator/websocket tests | test |
| 5 | test(firmware): update Wokwi scenarios | test |
| 6 | feat(frontend): add Vitest, Playwright, tests | feat |
| 7 | ci: add workflows, update pr-checks | ci |
| 8 | chore(docker): monitoring stack, CI/E2E compose | chore |
| 9 | feat(agents): agent-manager, skills, routing | feat |
| 10 | docs: firmware docs, archive, Makefile, scripts | docs |

**Hinweise:**
- `mosquitto-installer.exe` ist bereits gestaged – Commit 1 baut darauf auf.
- Reihenfolge berücksichtigt Abhängigkeiten (z.B. .gitignore vor anderen Commits).
- Session-Reports (reports/current/) optional – je nach Team-Workflow.
- Skill-Ordner `collect-system-status.md` hat ungewöhnlichen Namen (`.md` im Pfad) – evtl. später zu `collect-system-status` umbenennen.
