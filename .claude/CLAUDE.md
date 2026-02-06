# AutomationOne - KI-Agent Router

> **Projekt:** IoT-Framework für Gewächshausautomation
> **Prinzip:** Server-Zentrisch. ESP32 = dumme Agenten. ALLE Logik auf Server.
```
El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
```

---

## Skills (Entwicklung)

| Trigger | Skill |
|---------|-------|
| ESP32, C++, Sensor, Aktor, GPIO, PlatformIO, Wokwi | `esp32-development` |
| Python, FastAPI, MQTT-Handler, Database, API | `server-development` |
| Vue 3, TypeScript, Pinia, WebSocket, Dashboard | `frontend-development` |
| MQTT Topic, Publisher, Subscriber, Payload-Schema, QoS | `mqtt-development` |
| Reports sammeln, konsolidieren, Session-Ende, TM-Übergabe | `collect-reports` |
| /do, Plan ausführen, Implementierung starten | `do` |
| /updatedocs, Docs aktualisieren, Doku-Update nach Änderungen | `updatedocs` |

## Dev-Agenten (Pattern-konforme Implementierung)

| Agent | Trigger-Keywords |
|-------|------------------|
| `esp32-dev` | Sensor hinzufuegen, Driver erstellen, NVS Key, GPIO, implementieren ESP32 |
| `server-dev` | Handler erstellen, Repository erweitern, Service, Schema, implementieren Server |
| `mqtt-dev` | Topic hinzufuegen, Publisher, Subscriber, Payload Schema, MQTT implementieren |
| `frontend-dev` | Komponente, Composable, Store, View, WebSocket, Vue, implementieren Frontend |

## Session-Orchestrator 

| Agent | Trigger-Keywords | Modus |
|-------|------------------|-------|
| `system-manager` | Session-Start, Briefing, Projektstatus, Hardware-Test, "session gestartet" | Plan Mode |

**Pfad:** `.claude/agents/System Manager/system-manager.md`
**Output:** `.claude/reports/current/SESSION_BRIEFING.md`

**Workflow:**
1. Plan Mode aktivieren (Shift+Tab → ⏸)
2. "session gestartet" senden
3. SESSION_BRIEFING.md wird erstellt
4. Edit Mode für andere Agents

## System-Operator (Log-Generierung)

| Agent | Trigger-Keywords | Rolle |
|-------|------------------|-------|
| `system-control` | Start, Stop, Build, Flash, Commands | ERSTER Agent nach SESSION_BRIEFING - generiert Logs |
| `db-inspector` | Schema, Query, Migration, Alembic | Datenbank-Inspektion & Cleanup |

## Debug-Agenten (Log-Analyse)

| Agent | Trigger-Keywords |
|-------|------------------|
| `esp32-debug` | Serial, Boot, NVS, GPIO-Fehler, Watchdog, Crash |
| `server-debug` | FastAPI, Handler, Error 5xxx, god_kaiser.log |
| `mqtt-debug` | Topic, Payload, QoS, Publish, Subscribe, Broker |
| `frontend-debug` | Build-Error, TypeScript, Vite, WebSocket, Pinia, Vue-Component |

## Meta-Analyse (Cross-Report)

| Agent | Trigger-Keywords |
|-------|------------------|
| `meta-analyst` | Cross-Report-Vergleich, Widersprüche, Problemketten (LETZTE Analyse-Instanz) |

## Referenzen

| Pfad | Inhalt |
|------|--------|
| `reference/api/` | MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS |
| `reference/errors/` | ERROR_CODES (ESP32: 1000-4999, Server: 5000-5999) |
| `reference/patterns/` | COMMUNICATION_FLOWS, ARCHITECTURE_DEPENDENCIES, vs_claude_best_practice |
| `reference/debugging/` | LOG_LOCATIONS, CI_PIPELINE, ACCESS_LIMITATIONS |
| `reference/testing/` | TEST_WORKFLOW, SYSTEM_OPERATIONS_REFERENCE |
| `reference/security/` | PRODUCTION_CHECKLIST |

## Regeln

1. **Server-Zentrisch** → Logic NIEMALS auf ESP32
2. **Patterns erweitern** → Bestehenden Code analysieren
3. **Build verifizieren** → `pio run` / `pytest` vor Abschluss

## Workflow

```
SKILL → DEV-AGENT → ANALYSE → PLAN → IMPLEMENTIEREN → VERIFIZIEREN
```

---

## TM-Workflow (Technical Manager Integration)

Der Technical Manager (TM) ist eine externe Claude-Instanz in claude.ai – hat **KEINEN direkten Projektzugriff**. Der User ist die einzige Schnittstelle (Copy/Paste zwischen VS Code und claude.ai).

### Test-Flow (Analyse & Debugging)

```
1. User führt `scripts/debug/start_session.sh` aus → `logs/current/STATUS.md` wird generiert
2. User schreibt "Session gestartet" + Hardware-Info → system-manager aktiviert sich
3. system-manager liest STATUS.md, erstellt SESSION_BRIEFING.md
4. User kopiert SESSION_BRIEFING.md zum Technical Manager (claude.ai, extern)
5. TM analysiert Briefing, formuliert Agent-Befehle (einzeln pro Agent)
6. User führt system-control ZUERST aus → generiert Log-Daten, Operations-Bericht
7. User führt Debug-Agents EINZELN aus (esp32-debug, server-debug, mqtt-debug, frontend-debug) → jeder schreibt eigenen Report
8. User ruft /collect-reports auf → CONSOLIDATED_REPORT.md
9. User kopiert CONSOLIDATED_REPORT.md zum TM
10. TM analysiert, aktiviert meta-analyst für Cross-Report-Vergleich
11. Weitere TM-Analysen oder Wechsel zum Dev-Flow
```

### Dev-Flow (Implementierung)

```
1. TM hat durch Test-Flow alle Probleme identifiziert und priorisiert
2. TM formuliert gezielte Dev-Agent-Befehle (je ein Befehl pro Agent)
3. User führt Dev-Agents EINZELN aus (esp32-dev, server-dev, mqtt-dev, frontend-dev)
4. Nach Implementierung → zurück zum Test-Flow zur Verifikation
```

### Agent-Aktivierungsreihenfolge (Test-Flow)

| Schritt | Agent/Skill | Funktion | Output |
|---------|-------------|----------|--------|
| 1 | `system-manager` | Erstellt Session-Briefing | SESSION_BRIEFING.md → zum TM |
| 2 | `system-control` | Generiert Logs, führt Operationen aus | Operations-Bericht (MUSS VOR Debug-Agents) |
| 3 | Debug-Agents | Logs analysieren (einzeln, parallel möglich) | Individuelle Reports |
| | - `esp32-debug` | ESP32 Serial-Log | ESP32_*_REPORT.md |
| | - `server-debug` | Server JSON-Log | SERVER_*_REPORT.md |
| | - `mqtt-debug` | MQTT-Traffic | MQTT_*_REPORT.md |
| | - `frontend-debug` | Frontend Build/Runtime | FRONTEND_*_REPORT.md |
| 4 | `/collect-reports` | Konsolidiert alle Reports | CONSOLIDATED_REPORT.md → zum TM |
| 5 | `meta-analyst` | Cross-Report-Vergleich, Widersprüche finden | META_ANALYSIS.md |

### Wechsel Test-Flow → Dev-Flow

Der Technical Manager entscheidet den Wechsel wenn:
- Alle Probleme durch Test-Flow + meta-analyst identifiziert und priorisiert sind
- Die Problemliste präzise genug ist um gezielte Dev-Aufträge zu formulieren
- Keine weiteren Analyse-Runden nötig sind

Der Wechsel zurück (Dev-Flow → Test-Flow) erfolgt nach jeder Implementierung zur Verifikation.

### Wichtige Regeln im TM-Workflow

- **Agents werden IMMER einzeln** im VS Code Chat-Fenster gestartet
- **system-control kommt IMMER vor den Debug-Agents** (er generiert die Logs)
- **Der TM codet nicht** – er beschreibt präzise, die Dev-Agents setzen um
- **Jeder Report geht via User zum TM** – keine direkte Agent-Kommunikation

---

*Details in Skills/Dev-Agents. Commands in `system-control`. Diese Datei ist NUR Router.*
