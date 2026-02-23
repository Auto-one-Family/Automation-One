---
name: skill-router
description: |
  Skill-Index und Router für AutomationOne. Verwenden wenn: unsicher welcher Skill,
  Übersicht benötigt, mehrere Komponenten betroffen, Cross-Component-Aufgabe,
  "wo finde ich", "welche Datei", Projektstruktur, Architektur-Überblick.
allowed-tools: Read
---

# AutomationOne Skills - Index

> **Version:** 3.4 | **Aktualisiert:** 2026-02-22 | **Format:** Offizielles Claude Code Skill-Format (Ordner + SKILL.md)

## Skill-Auswahl

| Aufgabe | Skill-Name | Ordner |
|---------|------------|--------|
| **ESP32 Firmware** (C++, PlatformIO, Sensoren, Aktoren, MQTT-Client, Wokwi, GPIO, NVS) | esp32-development | `.claude/skills/esp32-development/` |
| **Server** (Python, FastAPI, PostgreSQL, MQTT-Handler, Logic-Engine, Alembic, pytest) | server-development | `.claude/skills/server-development/` |
| **Frontend** (Vue 3, TypeScript, Pinia, WebSocket, Composables, Tailwind) | frontend-development | `.claude/skills/frontend-development/` |
| **MQTT-Entwicklung** (Topic, Publisher, Subscriber, Payload-Schema, QoS) | mqtt-development | `.claude/skills/mqtt-development/` |
| **Reports sammeln** (Konsolidieren, Archivieren, beliebiger Ordner, TM-Übergabe) | collect-reports | `.claude/skills/collect-reports/` |
| **System-Status sammeln** (IST-Stand aus Code für Verification) | collect-system-status | `.claude/skills/collect-system-status/` |
| **Plan ausführen** (/do, Precision Execution, Implementierung nach Plan) | do | `.claude/skills/do/` |
| **Docs aktualisieren** (/updatedocs, Doku-Update nach Code-Änderungen) | updatedocs | `.claude/skills/updatedocs/` |
| **ESP32 Debug** (Serial-Log, Boot, NVS, GPIO-Fehler, Watchdog, Crash) | esp32-debug | `.claude/skills/esp32-debug/` |
| **Server Debug** (FastAPI, Handler, Error 5xxx, god_kaiser.log) | server-debug | `.claude/skills/server-debug/` |
| **MQTT Debug** (Topic, Payload, QoS, Broker-Traffic) | mqtt-debug | `.claude/skills/mqtt-debug/` |
| **Frontend Debug** (Vite, WebSocket, Pinia, Build-Errors) | frontend-debug | `.claude/skills/frontend-debug/` |
| **DB Inspector** (Schema, Query, Migration, Alembic, Cleanup) | db-inspector | `.claude/skills/db-inspector/` |
| **System Control** (Start, Stop, Build, Flash, Briefing, Session-Planning) | system-control | `.claude/skills/system-control/` |
| **Meta Analyst** (Cross-Report-Vergleich, Widersprüche, Problemketten) | meta-analyst | `.claude/skills/meta-analyst/` |
| **Test-Log-Analyse** (pytest, Vitest, Playwright, Wokwi, CI) | test-log-analyst | `.claude/skills/test-log-analyst/` |
| **Agent-Manager** (Flow vs. Agent, IST-SOLL, Korrekturen) | agent-manager | `.claude/skills/agent-manager/` |
| **Git-Commit** (Changes analysieren, Conventional Commits) | git-commit | `.claude/skills/git-commit/` |
| **Git-Health** (Repo-Analyse, CI, Branch-Protection) | git-health | `.claude/skills/git-health/` |
| **Verify-Plan** (TM-Pläne gegen Codebase prüfen) | verify-plan | `.claude/skills/verify-plan/` |
| **KI-Audit** (Bereich auf KI-Fehler prüfen, Report/Fix auf Anfrage) | ki-audit | `.claude/skills/ki-audit/` |

## Skill-Ordner-Struktur

```
.claude/skills/
├── README.md                    # Dieser Index
├── esp32-development/
│   └── SKILL.md                # ESP32 Firmware-Entwicklung
├── server-development/
│   ├── SKILL.md                # Server-Entwicklung
│   └── databases.md            # PostgreSQL Schema, Migrations
├── frontend-development/
│   └── SKILL.md                # Frontend-Entwicklung
├── mqtt-development/
│   └── SKILL.md                # MQTT Pattern-Entwicklung
├── collect-reports/
│   └── SKILL.md                # Report-Konsolidierung
├── collect-system-status/
│   └── SKILL.md                # System-Status-Erfassung
├── do/
│   └── SKILL.md                # Precision Execution
├── updatedocs/
│   └── SKILL.md                # Dokumentations-Aktualisierung
├── esp32-debug/
│   └── SKILL.md                # ESP32 Serial-Log Analyse
├── server-debug/
│   └── SKILL.md                # Server-Log Analyse
├── mqtt-debug/
│   └── SKILL.md                # MQTT Traffic Analyse
├── frontend-debug/
│   └── SKILL.md                # Frontend Debug Analyse
├── db-inspector/
│   └── SKILL.md                # Datenbank-Inspektion
├── system-control/
│   └── SKILL.md                # System-Steuerung
├── meta-analyst/
│   └── SKILL.md                # Cross-Report-Analyse
├── test-log-analyst/
│   └── SKILL.md                # Test-Log-Analyse
├── agent-manager/
│   └── SKILL.md                # Agent-System-Korrektur
├── git-commit/
│   └── SKILL.md                # Git-Commit-Vorbereitung
├── git-health/
│   └── SKILL.md                # Git-/Repo-Analyse
├── verify-plan/
│   └── SKILL.md                # TM-Plan Reality-Check
└── ki-audit/
    └── SKILL.md                # KI-Fehler-Audit (Report/Fix auf Anfrage)
```

## Session-Briefing & Planning

| Skill | Pfad | Agent |
|-------|------|-------|
| **system-control** | `system-control/SKILL.md` | system-control |

**Funktion:** Erstellt SESSION_BRIEFING.md für Technical Manager (Briefing-Modus) oder führt Operationen aus (Ops-Modus)

## Zusätzliche Referenz-Dateien

| Datei | Inhalt |
|-------|--------|
| `server-development/databases.md` | PostgreSQL Schema, Alembic Migrations |

## Cross-Component: Welche Skills kombinieren?

| Szenario | Skills lesen |
|----------|--------------|
| MQTT Topic/Payload ändern | esp32 + server |
| Neuen Sensor-Typ hinzufügen | esp32 + server + Frontend |
| WebSocket Event hinzufügen | server + Frontend |
| API Endpoint + UI | server + Frontend |
| Zone/Subzone Feature | esp32 + server + Frontend |
| Nur ESP32 Firmware | esp32 |
| Nur Server-Logik | server |
| Nur UI-Komponente | Frontend |

## Projekt-Struktur (Kurzreferenz)

```
Auto-one/
├── El Trabajante/     → ESP32 Firmware (C++)
├── El Servador/       → Python Server (FastAPI)
├── El Frontend/       → Vue 3 Dashboard
└── .claude/
    ├── skills/        → Diese Skill-Dateien
    ├── reference/     → Architektur, Tests
    └── archive/       → Legacy-Dokumentation
```

## Quick-Links für häufige Aufgaben

| Aufgabe | Direkt zu |
|---------|-----------|
| Server + Frontend starten | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0 |
| MQTT Protokoll | `El Trabajante/docs/Mqtt_Protocoll.md` |
| Error-Codes | esp32-Skill Section 5 |
| API-Endpoints | server-Skill Section 3 |
| Vue Komponenten | Frontend-Skill Section 1 |

---

## Zusätzliche Referenz-Dokumentation

| Dokument | Pfad | Wann lesen? |
|----------|------|-------------|
| **Test-Workflow** | `.claude/reference/testing/TEST_WORKFLOW.md` | NUR wenn User Tests anfordert |
| **Wokwi-Testing** | `.claude/reference/testing/WOKWI_TESTING.md` | Bei Wokwi-Simulation, ESP32-Tests, CI Wokwi-Szenarien |
| **Log-System** | `.claude/reference/debugging/LOG_SYSTEM.md` | Bei Log-Analyse, Serial Capture |
| **CI Pipeline** | `.claude/reference/debugging/CI_PIPELINE.md` | Bei CI-Failures, GitHub Actions |
| **KI-Limitationen** | `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | Bei Zugriffsproblemen |
| **Wokwi Error-Mapping** | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` | Bei Error-Injection-Szenarien (11-error-injection/) |

**WICHTIG:** Test- und Debugging-Dokumentation nur bei Bedarf lesen, nicht automatisch.
