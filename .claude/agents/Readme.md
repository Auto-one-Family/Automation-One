# AutomationOne Agenten

> **Version:** 4.0 | **Aktualisiert:** 2026-02-08
> **Format:** Offizielles Claude Code Agent-Format
> **Agenten gesamt:** 13

---

## Verfügbare Agenten

### Debug-Agenten (Log-Analyse)

| Agent | Datei | Beschreibung | Tools |
|-------|-------|--------------|-------|
| **esp32-debug** | `esp32-debug.md` | ESP32 Serial-Log Analyse | Read, Grep, Glob |
| **server-debug** | `server/server-debug-agent.md` | God-Kaiser Server-Log Analyse | Read, Grep, Glob |
| **mqtt-debug** | `mqtt/mqtt-debug-agent.md` | MQTT Traffic Analyse | Read, Grep, Glob |
| **frontend-debug** | `frontend/frontend-debug-agent.md` | Frontend Build/Runtime Analyse | Read, Grep, Glob |
| **meta-analyst** | `meta-analyst.md` | Cross-Report-Analyse & Problemvergleich | Read, Grep, Glob |

### System-Operators

| Agent | Datei | Beschreibung | Tools |
|-------|-------|--------------|-------|
| **db-inspector** | `db-inspector.md` | Datenbank-Inspektion & Cleanup | Read, Bash, Grep, Glob |
| **system-control** | `system-control.md` | System-Steuerung, Briefing, Session-Planning | Read, Write, Bash, Grep, Glob |

### Utility-Agenten

| Agent | Datei | Beschreibung | Tools |
|-------|-------|--------------|-------|
| **agent-manager** | `agent-manager/agent-manager.md` | Agent-Qualität, IST-SOLL, 7-Prinzipien-Check | Read, Write, Edit, Grep, Glob |
| **test-log-analyst** | `testing/test-log-analyst.md` | Test-Log-Analyse (pytest, Vitest, Playwright, Wokwi) | Read, Grep, Glob, Bash |

### Dev-Agenten (Pattern-konforme Implementierung)

| Agent | Datei | Beschreibung | Tools |
|-------|-------|--------------|-------|
| **esp32-dev** | `esp32/esp32-dev-agent.md` | ESP32 Firmware-Entwicklung | Read, Write, Edit, Bash, Grep, Glob |
| **server-dev** | `server/server_dev_agent.md` | Server-Entwicklung | Read, Write, Edit, Bash, Grep, Glob |
| **mqtt-dev** | `mqtt/mqtt_dev_agent.md` | MQTT-Protokoll-Entwicklung | Read, Write, Edit, Bash, Grep, Glob |
| **frontend-dev** | `frontend/frontend_dev_agent.md` | Frontend-Entwicklung | Read, Write, Edit, Bash, Grep, Glob |

---

## Agent-Format

Alle Agenten verwenden das offizielle Claude Code Format mit YAML-Frontmatter:

```yaml
---
name: agent-name
description: |
  Beschreibung wann der Agent verwendet werden soll.
  MUST BE USED when: [Trigger-Situationen]
tools: Read, Grep, Glob
model: sonnet
---

# Agent-Titel

[Agent-Inhalt]
```

---

## Aktivierung

Die Agenten werden automatisch von Claude Code erkannt basierend auf ihrer `description`.

**Manuelle Aktivierung:**
```
Analysiere mit esp32-debug
```

**Automatische Aktivierung** (basierend auf Kontext):
- "ESP32 boot failure" → esp32-debug
- "MQTT messages not arriving" → mqtt-debug
- "Database cleanup" → db-inspector

---

## STATUS.md Injection

Alle Debug-Agenten lesen `logs/current/STATUS.md` für Session-Kontext:
- Aktueller Test-Modus (boot, config, sensor, actuator, e2e)
- Erwartete Log-Patterns
- Hardware-Konfiguration
- Phasen-Status

**Workflow:**

1. Debug-Session starten: `./scripts/debug/start_session.sh [name] [--mode MODE]`
2. `STATUS.md` wird automatisch generiert
3. Agent liest STATUS.md für Kontext
4. Agent schreibt Report nach `.claude/reports/current/`

**Verfügbare Modi:**

| Modus | Flag | Beschreibung |
|-------|------|--------------|
| BOOT | `--mode boot` | Boot-Sequenz (WiFi, MQTT, Heartbeat) - **default** |
| CONFIG | `--mode config` | Konfigurationsfluss (Zone Assignment, Config Push) |
| SENSOR | `--mode sensor` | Sensor-Datenfluss (Readings, Validation) |
| ACTUATOR | `--mode actuator` | Aktor-Steuerung (Commands, Status) |

---

## Log-Quellen

| Agent | Primärer Input | Log-Pfad |
|-------|----------------|----------|
| esp32-debug | Serial-Log, eigenständig | `logs/current/esp32_serial.log` |
| server-debug | Server-Log, eigenständig | `logs/server/god_kaiser.log` |
| mqtt-debug | MQTT-Traffic, eigenständig | `logs/mqtt/mqtt_traffic.log` |
| frontend-debug | Source-Code, Container, eigenständig | `El Frontend/`, Docker-Logs |
| db-inspector | PostgreSQL, eigenständig | Docker exec psql |
| meta-analyst | Alle Reports | `.claude/reports/current/` |

---

## Report-Ausgabe

Alle Agenten schreiben Reports nach: `.claude/reports/current/`

Format: Standardisierte Namen (kein Modus-Suffix)

| Agent | Report-Datei |
|-------|-------------|
| esp32-debug | `ESP32_DEBUG_REPORT.md` |
| server-debug | `SERVER_DEBUG_REPORT.md` |
| mqtt-debug | `MQTT_DEBUG_REPORT.md` |
| frontend-debug | `FRONTEND_DEBUG_REPORT.md` |
| db-inspector | `DB_INSPECTOR_REPORT.md` |
| meta-analyst | `META_ANALYSIS.md` |
| agent-manager | `AGENT_MANAGEMENT_REPORT.md` |
| test-log-analyst | `.claude/reports/Testrunner/test.md` |

---

## Ordnerstruktur

```
.claude/agents/
├── Readme.md                        # Dieser Index
├── esp32-debug.md                   # ESP32 Debug (flach)
├── meta-analyst.md                  # Meta-Analyst (flach)
├── db-inspector.md                  # DB Inspector (flach)
├── system-control.md                # System Control, Briefing (flach)
├── agent-manager/
│   └── agent-manager.md            # Agent-Manager (Qualität)
├── testing/
│   └── test-log-analyst.md         # Test-Log-Analyst
├── esp32/
│   └── esp32-dev-agent.md          # ESP32 Dev
├── server/
│   ├── server-debug-agent.md       # Server Debug
│   └── server_dev_agent.md         # Server Dev
├── mqtt/
│   ├── mqtt-debug-agent.md         # MQTT Debug
│   └── mqtt_dev_agent.md           # MQTT Dev
└── frontend/
    ├── frontend-debug-agent.md     # Frontend Debug
    └── frontend_dev_agent.md       # Frontend Dev
```

---

## Session-Briefing & Operations (konsolidiert)

| Agent | Pfad | Modus |
|-------|------|-------|
| **system-control** | `system-control.md` | Briefing- oder Ops-Modus |

**Funktion:** Erstellt SESSION_BRIEFING.md (Briefing-Modus) oder führt Operationen aus (Ops-Modus)
**Skill:** `.claude/skills/system-control/SKILL.md`

---

## Referenzen

| Thema | Pfad |
|-------|------|
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` |
| Log-Locations | `.claude/reference/debugging/LOG_LOCATIONS.md` |
| MQTT-Topics | `.claude/reference/api/MQTT_TOPICS.md` |
| Communication-Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
