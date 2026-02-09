# AutomationOne — Agent-Profile

> **Version:** 2.1 | **Stand:** 2026-02-09
> **Zweck:** SOLL-Definition aller Agents nach universellem Agenten-Muster (7 Prinzipien)
> **Genutzt von:** agent-manager (primär), system-control, Technical Manager

---

# 1. AGENTEN (.claude/agents/)

## 1.1 agent-manager
- **Datei:** `.claude/agents/agent-manager/agent-manager.md`
- **Rolle:** Hüter der Agenten-Qualität. Prüft, legt an und passt Agenten nach universellem Muster an.
- **Modi:** 1 (Dokument-Ergänzung) / 2 (Agent anpassen)
- **Tools:** Read, Write, Edit, Grep, Glob (kein Bash)
- **Trigger:** agent-check, flow-analyse, IST-SOLL, agent-update, workflow, konsistenz
- **Erweiterte Fähigkeiten:** 7-Prinzipien-Check, Agenten-Katalog, Muster-Vorlage, Qualitätsstandard-Checkliste
- **Skills:** agent-manager
- **Report:** AGENT_MANAGEMENT_REPORT.md
- **Referenzen:** flow_reference.md, agent_profiles.md, vs_claude_best_practice.md, COMMUNICATION_FLOWS.md
- **Andere Agenten:** Kennt alle 13 Agenten mit Bereich, Modi, Tools, Report, Trigger. Arbeitet nur über `.claude/`.

## 1.2 db-inspector
- **Datei:** `.claude/agents/db-inspector.md`
- **Rolle:** Datenbank-Inspektion und Cleanup für PostgreSQL/SQLite. Prüft Schema, Migrations, Orphaned Records.
- **Modi:** A (allgemeiner DB-Health-Check) / B (spezifisches Datenproblem)
- **Tools:** Read, Bash, Grep, Glob
- **Trigger:** Schema, Query, Migration, Alembic, Device-Registrierung, Sensor-Daten, Orphaned Records
- **Erweiterte Fähigkeiten:** Container-Status prüfen, Alembic-Migrations, Server-Log für DB-Errors greppen
- **Skills:** db-inspector
- **Report:** DB_INSPECTOR_REPORT.md
- **Referenzen:** SYSTEM_OPERATIONS_REFERENCE.md, ERROR_CODES.md, LOG_LOCATIONS.md
- **Andere Agenten:** Delegiert Analyse an server-debug, mqtt-debug, esp32-debug; bei Code-Änderungen an Entwickler.

## 1.3 esp32-dev
- **Datei:** `.claude/agents/esp32/esp32-dev-agent.md`
- **Rolle:** Pattern-konformer Implementierer für ESP32 C++/PlatformIO. Findet bestehende Patterns und erweitert sie.
- **Modi:** A (Analyse/Plan) / B (Implementierung)
- **Tools:** Read, Write, Edit, Grep, Glob, Bash
- **Trigger:** Sensor hinzufügen, Driver erstellen, NVS Key, GPIO, implementieren ESP32
- **Erweiterte Fähigkeiten:** Wokwi-Simulation, Build-Verifikation (pio run), 8-Dimensionen-Checkliste, Cross-Layer Checks
- **Skills:** esp32-development (via SKILL.md / MODULE_REGISTRY.md)
- **Report:** ESP32_DEV_REPORT.md
- **Schreibzugriff:** El Trabajante/
- **Referenzen:** MQTT_TOPICS.md, ERROR_CODES.md, COMMUNICATION_FLOWS.md, ARCHITECTURE_DEPENDENCIES.md
- **Andere Agenten:** esp32-debug, mqtt-debug, mqtt-dev, server-dev

## 1.4 esp32-debug
- **Datei:** `.claude/agents/esp32-debug.md`
- **Rolle:** ESP32 Serial-Log-Analyse. Boot-Sequenz, Error-Codes 1000–4999, Firmware-Verhalten.
- **Modi:** A (allgemeine Analyse) / B (spezifisches Problem)
- **Tools:** Read, Grep, Glob, Bash
- **Trigger:** Serial, Boot, NVS, GPIO-Fehler, Watchdog, Crash, SafeMode, Circuit-Breaker
- **Erweiterte Fähigkeiten:** MQTT-Traffic (mosquitto_sub), Server-Health (curl), Docker-Status, DB-Device-Check (psql), Server-Log greppen
- **Skills:** esp32-debug
- **Report:** ESP32_DEBUG_REPORT.md
- **Referenzen:** esp32_serial.log, ERROR_CODES.md, MQTT_TOPICS.md, COMMUNICATION_FLOWS.md
- **Andere Agenten:** server-debug, mqtt-debug, db-inspector, system-control

## 1.5 frontend-dev
- **Datei:** `.claude/agents/frontend/frontend_dev_agent.md`
- **Rolle:** Pattern-konformer Implementierer für Vue 3/TypeScript/Pinia. Erweitert existierende Patterns.
- **Modi:** A (Analyse/Plan) / B (Implementierung)
- **Tools:** Read, Write, Edit, Grep, Glob, Bash
- **Trigger:** Komponente, Composable, Store, View, WebSocket, Vue, implementieren Frontend
- **Erweiterte Fähigkeiten:** Build-Verifikation (npm run build), Type-Check, 8-Dimensionen-Checkliste, Cross-Layer Checks
- **Skills:** frontend-development (via SKILL.md)
- **Report:** FRONTEND_DEV_REPORT.md
- **Schreibzugriff:** El Frontend/
- **Referenzen:** REST_ENDPOINTS.md, WEBSOCKET_EVENTS.md, ERROR_CODES.md, ARCHITECTURE_DEPENDENCIES.md, COMMUNICATION_FLOWS.md
- **Andere Agenten:** frontend-debug, server-dev, mqtt-dev

## 1.6 frontend-debug
- **Datei:** `.claude/agents/frontend/frontend-debug-agent.md`
- **Rolle:** Frontend-Analyse. Build-Errors (Vite/TypeScript), WebSocket, Pinia, API-Fehler.
- **Modi:** A (allgemeine Analyse) / B (spezifisches Problem)
- **Tools:** Read, Grep, Glob, Bash
- **Trigger:** Build-Error, TypeScript, Vite, WebSocket, Pinia, Vue-Component
- **Erweiterte Fähigkeiten:** API-Health (curl), Server-Log greppen, Docker-Status, WebSocket-Server-Status
- **Skills:** frontend-debug
- **Report:** FRONTEND_DEBUG_REPORT.md
- **Referenzen:** frontend_build.log, browser_console.log, WEBSOCKET_EVENTS.md, REST_ENDPOINTS.md
- **Andere Agenten:** server-debug, mqtt-debug, esp32-debug, db-inspector, system-control

## 1.7 meta-analyst
- **Datei:** `.claude/agents/meta-analyst.md`
- **Rolle:** Cross-Report-Analyse. Vergleicht alle Reports, findet Widersprüche und Kausalität. LETZTE Analyse-Instanz.
- **Modi:** A (allgemeine Cross-Analyse) / B (spezifisches Cross-Layer-Problem)
- **Tools:** Read, Grep, Glob (kein Bash)
- **Trigger:** Cross-Report-Vergleich, Widersprüche, Problemketten, NACH allen Debug-Agents
- **Erweiterte Fähigkeiten:** Timeline-Korrelation, Kausalketten-Analyse, Lücken-Erkennung
- **Skills:** meta-analyst
- **Report:** META_ANALYSIS.md
- **Referenzen:** Alle Reports in `.claude/reports/current/`, ERROR_CODES.md, COMMUNICATION_FLOWS.md
- **Andere Agenten:** esp32-debug, server-debug, mqtt-debug, collect-reports
- **Besonderheit:** Sucht KEINE Lösungen – nur präzise Problemdokumentation

## 1.8 mqtt-dev
- **Datei:** `.claude/agents/mqtt/mqtt_dev_agent.md`
- **Rolle:** MQTT-Implementierung auf Server und ESP32. Topics und Handler synchron halten.
- **Modi:** A (Analyse/Plan) / B (Implementierung)
- **Tools:** Read, Write, Edit, Grep, Glob, Bash
- **Trigger:** Topic hinzufügen, Publisher, Subscriber, Payload Schema, MQTT implementieren
- **Erweiterte Fähigkeiten:** Protokoll-Validierung beidseitig (Server + ESP32), Synchronisations-Matrix, 8-Dimensionen-Checkliste
- **Skills:** mqtt-development
- **Report:** MQTT_DEV_REPORT.md
- **Referenzen:** MQTT_TOPICS.md, COMMUNICATION_FLOWS.md, ERROR_CODES.md, ARCHITECTURE_DEPENDENCIES.md
- **Andere Agenten:** mqtt-debug, server-dev, esp32-dev

## 1.9 mqtt-debug
- **Datei:** `.claude/agents/mqtt/mqtt-debug-agent.md`
- **Rolle:** MQTT-Traffic-Analyse. Topic-Sequenzen, Timing, Payload-Validierung.
- **Modi:** A (allgemeine Analyse) / B (spezifisches Problem)
- **Tools:** Read, Grep, Glob, Bash
- **Trigger:** Topic, Payload, QoS, Publish, Subscribe, Broker, Timing
- **Erweiterte Fähigkeiten:** Live-MQTT (mosquitto_sub mit Timeout), Broker-Status/Logs, Server-Handler greppen, ESP-Serial greppen, DB-Device-Check
- **Skills:** mqtt-debug
- **Report:** MQTT_DEBUG_REPORT.md
- **Referenzen:** mqtt_traffic.log, MQTT_TOPICS.md, COMMUNICATION_FLOWS.md
- **Andere Agenten:** esp32-debug, server-debug, db-inspector, system-control

## 1.10 server-dev
- **Datei:** `.claude/agents/server/server_dev_agent.md`
- **Rolle:** Pattern-konformer Implementierer für Python/FastAPI.
- **Modi:** A (Analyse/Plan) / B (Implementierung)
- **Tools:** Read, Write, Edit, Grep, Glob, Bash
- **Trigger:** Handler erstellen, Repository erweitern, Service, Schema, implementieren Server
- **Erweiterte Fähigkeiten:** Test-Verifikation (pytest), Migration-Check, 8-Dimensionen-Checkliste, Cross-Layer Checks
- **Skills:** server-development (via SKILL.md, MODULE_REGISTRY.md)
- **Report:** SERVER_DEV_REPORT.md
- **Schreibzugriff:** El Servador/
- **Referenzen:** COMMUNICATION_FLOWS.md, ARCHITECTURE_DEPENDENCIES.md, MQTT_TOPICS.md, REST_ENDPOINTS.md, WEBSOCKET_EVENTS.md, ERROR_CODES.md
- **Andere Agenten:** server-debug, mqtt-debug, db-inspector, mqtt-dev, esp32-dev, frontend-dev

## 1.11 server-debug
- **Datei:** `.claude/agents/server/server-debug-agent.md`
- **Rolle:** Server-Log-Analyse. JSON-Logs, MQTT-Handler, Error-Codes 5000–5699.
- **Modi:** A (allgemeine Analyse) / B (spezifisches Problem)
- **Tools:** Read, Grep, Glob, Bash
- **Trigger:** FastAPI, Handler, Error 5xxx, god_kaiser.log
- **Erweiterte Fähigkeiten:** DB-Verbindung testen (psql), Docker-Status, Health-Endpoints (curl), MQTT-Broker-Logs, ESP32-Serial greppen
- **Skills:** server-debug
- **Report:** SERVER_DEBUG_REPORT.md
- **Referenzen:** god_kaiser.log, ERROR_CODES.md, MQTT_TOPICS.md
- **Andere Agenten:** esp32-debug, mqtt-debug, db-inspector, system-control

## 1.12 system-control
- **Datei:** `.claude/agents/system-control.md`
- **Rolle:** Universeller System-Spezialist. Erkennt Modus automatisch (7 Modi). Operationen ausführen, Briefing erstellen, Strategie-Empfehlung.
- **Modi:** Full-Stack, Hardware-Test, Trockentest, CI-Analyse, System-Ops, Briefing, Dokument-Ergänzung
- **Tools:** Read, Write, Bash, Grep, Glob | **Model:** opus
- **Trigger:** "session gestartet", Projektstatus, Start/Stop, Build, Flash, curl, make, docker, CI, Briefing
- **Erweiterte Fähigkeiten:** Docker-Befehle, ESP32-Ops, MQTT-Traffic, API-Calls, DB-Queries, Monitoring-Stack
- **Skills:** system-control
- **Report:** SESSION_BRIEFING.md oder SYSTEM_CONTROL_REPORT.md
- **Referenzen:** SYSTEM_OPERATIONS_REFERENCE.md, LOG_LOCATIONS.md, MQTT_TOPICS.md, COMMUNICATION_FLOWS.md, ERROR_CODES.md, REST_ENDPOINTS.md, WEBSOCKET_EVENTS.md, DOCKER_REFERENCE.md, CI_PIPELINE.md, flow_reference.md, TEST_WORKFLOW.md
- **Andere Agenten:** Kennt alle (Agent-Kompendium). Strategie-Empfehlung welcher Agent als nächstes.

## 1.13 test-log-analyst
- **Datei:** `.claude/agents/testing/test-log-analyst.md`
- **Rolle:** Analysiert Test-Outputs (pytest, Vitest, Playwright, Wokwi) lokal und in CI.
- **Modi:** Befehlsliste ausgeben → Robin führt aus → Log-Analyse und Report-Update
- **Tools:** Read, Grep, Glob, Bash
- **Trigger:** /test, CI rot, Test-Failures, "warum schlägt Test X fehl"
- **Erweiterte Fähigkeiten:** JUnit XML parsen, HTML-Reports, Coverage, CI-Logs (gh run view)
- **Skills:** test-log-analyst
- **Report:** `.claude/reports/Testrunner/test.md`
- **Referenzen:** LOG_LOCATIONS.md, CI_PIPELINE.md, TEST_ENGINE_REFERENCE.md, TEST_WORKFLOW.md, flow_reference.md
- **Andere Agenten:** Keine; eigenständiger Flow (F4)

---

# 2. SKILLS (.claude/skills/)

| Skill | Zweck | Genutzt von |
|-------|-------|-------------|
| agent-manager | IST-SOLL-Vergleich, 7-Prinzipien-Check, Agent-Anpassung, Muster-Vorlage | agent-manager |
| collect-reports | Reports in CONSOLIDATED_REPORT.md zusammenführen | Robin (manuell) |
| collect-system-status | IST-Stand aus Code (Docker, Backend, Frontend) | — |
| db-inspector | DB-Wissen, Schema, Diagnose-Queries | db-inspector |
| do | Precision Execution – Plan-Implementierung | Robin (/do) |
| esp32-debug | ESP32-Debug-Wissen, Boot, Error-Codes, Circuit Breaker | esp32-debug |
| esp32-development | ESP32-Entwicklung, Module, Patterns | esp32-dev |
| frontend-debug | Frontend-Debug, Vue, WebSocket, Build | frontend-debug |
| frontend-development | Frontend-Entwicklung, Vue 3, Pinia, Tailwind | frontend-dev |
| git-commit | Git-Changes analysieren, Commit-Plan | Robin |
| git-health | Git-/Repo-Analyse | Robin |
| meta-analyst | Cross-Report-Analyse, Korrelation | meta-analyst |
| mqtt-debug | MQTT-Debug, Broker, Circuit Breaker | mqtt-debug |
| mqtt-development | MQTT-Implementierung (Server + ESP32) | mqtt-dev |
| server-debug | Server-Log-Analyse, Handler, Error-Codes | server-debug |
| server-development | Server-Entwicklung, FastAPI, Services | server-dev |
| system-control | System-Operationen, Docker, Make, Briefing, Session-Planning | system-control |
| test-log-analyst | Test-Log-Analyse, pytest/Vitest/Playwright/Wokwi | test-log-analyst |
| updatedocs | Docs nach Code-Änderungen aktualisieren | Robin (/updatedocs) |
| verify-plan | TM-Pläne gegen Codebase prüfen | Robin (/verify-plan) |

---

# 3. REFERENZEN (.claude/reference/)

| Referenz | Inhalt/Zweck | Referenziert von |
|----------|--------------|------------------|
| api/MQTT_TOPICS.md | MQTT-Topic-Schema | esp32-debug, esp32-dev, mqtt-debug, mqtt-dev, server-debug, system-control |
| api/REST_ENDPOINTS.md | REST-API | frontend-debug, frontend-dev, system-control |
| api/WEBSOCKET_EVENTS.md | WebSocket-Events | frontend-debug, frontend-dev, system-control |
| debugging/ACCESS_LIMITATIONS.md | Zugriffsbeschränkungen | — |
| debugging/CI_PIPELINE.md | CI, Artifacts, gh CLI | test-log-analyst, system-control |
| debugging/LOG_ACCESS_REFERENCE.md | Log-Zugriff | frontend-debug |
| debugging/LOG_LOCATIONS.md | Log-Pfade | db-inspector, system-control, server-debug, test-log-analyst |
| errors/ERROR_CODES.md | Error-Codes ESP32/Server | agent-manager, db-inspector, esp32-debug, esp32-dev, frontend-debug, meta-analyst, mqtt-debug, mqtt-dev, server-debug |
| infrastructure/DOCKER_REFERENCE.md | Docker-Referenz | system-control |
| patterns/ARCHITECTURE_DEPENDENCIES.md | Architektur-Abhängigkeiten | meta-analyst, esp32-dev, server-dev, mqtt-dev, frontend-dev |
| patterns/COMMUNICATION_FLOWS.md | Datenflüsse | agent-manager, esp32-debug, mqtt-debug, mqtt-dev, server-dev, system-control |
| patterns/vs_claude_best_practice.md | Claude-Code Best Practices | agent-manager |
| security/PRODUCTION_CHECKLIST.md | Produktions-Checkliste | mqtt-development |
| testing/agent_profiles.md | Agent-Profile (SOLL) | agent-manager |
| testing/flow_reference.md | Flow-Definitionen | agent-manager, test-log-analyst, system-control |
| testing/SYSTEM_OPERATIONS_REFERENCE.md | Operationen, Befehle | db-inspector, system-control |
| testing/TEST_ENGINE_REFERENCE.md | Makefile, Test-Targets | test-log-analyst |
| testing/TEST_WORKFLOW.md | Test-Workflow | test-log-analyst, system-control |

---

# 4. UNIVERSELLES AGENTEN-MUSTER (7 Prinzipien)

Jeder Agent im AutomationOne-System MUSS diese Prinzipien erfüllen. Der agent-manager prüft bei jeder Anpassung dagegen.

| # | Prinzip | Erfüllt wenn... |
|---|---------|-----------------|
| P1 | Kontexterkennung statt starre Rolle | Agent hat Modi-Tabelle, erkennt automatisch den Arbeitsmodus |
| P2 | Eigenständig statt abhängig | Funktioniert ohne SESSION_BRIEFING oder festes Auftragsformat |
| P3 | Erweitern statt delegieren | Extended Checks bei Auffälligkeiten, Cross-Layer Prüfung |
| P4 | Erst verstehen, dann handeln | Bei schreibenden Ops: Analyse → Erklärung → Bestätigung |
| P5 | Fokussiert aber vollständig | Priorisierte Arbeitsreihenfolge, nichts ausgelassen |
| P6 | Nachvollziehbare Ergebnisse | Report in `.claude/reports/current/` mit Mindeststandard |
| P7 | Querreferenzen für Verständnis | Kennt andere Agenten, gibt Strategie-Empfehlungen |

### Optimierungsstatus

| Agent | P1 | P2 | P3 | P4 | P5 | P6 | P7 | Status |
|-------|----|----|----|----|----|----|----|----|
| system-control | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| esp32-debug | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| server-debug | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| mqtt-debug | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| frontend-debug | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| db-inspector | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | Teilweise |
| meta-analyst | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | Optimiert |
| agent-manager | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | Optimiert |
| esp32-dev | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| server-dev | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| mqtt-dev | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| frontend-dev | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Optimiert |
| test-log-analyst | ⚠️ | ✅ | — | ✅ | ✅ | ✅ | ⚠️ | Teilweise |

---

**Ende der Übersicht. Version 2.1 – AP3 (Dev-Agents Optimierung) abgeschlossen.**
