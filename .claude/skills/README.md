---
name: skill-router
description: |
  Skill-Index und Router für AutomationOne. Verwenden wenn: unsicher welcher Skill,
  Übersicht benötigt, mehrere Komponenten betroffen, Cross-Component-Aufgabe,
  "wo finde ich", "welche Datei", Projektstruktur, Architektur-Überblick.
allowed-tools: Read
---

# AutomationOne Skills - Index

> **Version:** 3.0 | **Format:** Offizielles Claude Code Skill-Format (Ordner + SKILL.md)

## Skill-Auswahl

| Aufgabe | Skill-Name | Ordner |
|---------|------------|--------|
| **ESP32 Firmware** (C++, PlatformIO, Sensoren, Aktoren, MQTT-Client, Wokwi, GPIO, NVS) | esp32-development | `.claude/skills/esp32-development/` |
| **Server** (Python, FastAPI, PostgreSQL, MQTT-Handler, Logic-Engine, Alembic, pytest) | server-development | `.claude/skills/server-development/` |
| **Frontend** (Vue 3, TypeScript, Pinia, WebSocket, Composables, Tailwind) | frontend-development | `.claude/skills/frontend-development/` |

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
└── System Manager/
    ├── SKILL.md                # Session-Orchestrator
    └── session-planning.md     # Detail-Templates
```

## Session-Planning (Plan Mode)

| Skill | Pfad | Agent |
|-------|------|-------|
| **System-Manager** | `System Manager/SKILL.md` | system-manager |

**Funktion:** Erstellt SESSION_BRIEFING.md für Technical Manager
**Modus:** Plan Mode (Shift+Tab → ⏸) - PFLICHT
**Agent:** `.claude/agents/System Manager/system-manager.md`

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
| **Log-System** | `.claude/reference/debugging/LOG_SYSTEM.md` | Bei Log-Analyse, Serial Capture |
| **CI Pipeline** | `.claude/reference/debugging/CI_PIPELINE.md` | Bei CI-Failures, GitHub Actions |
| **KI-Limitationen** | `.claude/reference/debugging/ACCESS_LIMITATIONS.md` | Bei Zugriffsproblemen |

**WICHTIG:** Test- und Debugging-Dokumentation nur bei Bedarf lesen, nicht automatisch.
