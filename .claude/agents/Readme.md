# Debug-Agenten

> **Version:** 3.1 | **Aktualisiert:** 2026-02-06
> **Format:** Offizielles Claude Code Agent-Format

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
| **system-control** | `system-control.md` | System-Steuerung & Operations | Read, Bash, Grep, Glob |

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

| Agent | Primärer Log | Pfad |
|-------|--------------|------|
| esp32-debug | ESP32 Serial | `logs/current/esp32_serial.log` |
| server-debug | Server JSON | `logs/server/god_kaiser.log` |
| mqtt-debug | MQTT Traffic | `logs/mqtt/mqtt_traffic.log` |
| frontend-debug | Frontend Build/Console | `El Frontend/` (Vite Output) |
| meta-analyst | Alle Reports in reports/current/ | - |

---

## Report-Ausgabe

Alle Agenten schreiben Reports nach: `.claude/reports/current/`

Format: `[AGENT]_[MODUS]_REPORT.md`

| Modus | Beispiel-Reports |
|-------|------------------|
| BOOT | `ESP32_BOOT_REPORT.md`, `SERVER_BOOT_REPORT.md`, `MQTT_BOOT_REPORT.md` |
| CONFIG | `ESP32_CONFIG_REPORT.md`, `SERVER_CONFIG_REPORT.md`, `MQTT_CONFIG_REPORT.md` |
| SENSOR | `ESP32_SENSOR_REPORT.md`, `SERVER_SENSOR_REPORT.md`, `MQTT_SENSOR_REPORT.md` |
| ACTUATOR | `ESP32_ACTUATOR_REPORT.md`, `SERVER_ACTUATOR_REPORT.md`, `MQTT_ACTUATOR_REPORT.md` |

---

## Ordnerstruktur

```
.claude/agents/
├── Readme.md                        # Dieser Index
├── esp32-debug.md                   # ESP32 Debug (flach)
├── meta-analyst.md                  # Meta-Analyst (flach)
├── db-inspector.md                  # DB Inspector (flach)
├── system-control.md                # System Control (flach)
├── esp32/
│   └── esp32-dev-agent.md          # ESP32 Dev
├── server/
│   ├── server-debug-agent.md       # Server Debug
│   └── server_dev_agent.md         # Server Dev
├── mqtt/
│   ├── mqtt-debug-agent.md         # MQTT Debug
│   └── mqtt_dev_agent.md           # MQTT Dev
├── frontend/
│   ├── frontend-debug-agent.md     # Frontend Debug
│   └── frontend_dev_agent.md       # Frontend Dev
└── System Manager/
    └── system-manager.md           # Session-Orchestrator
```

---

## Session-Orchestrator

| Agent | Pfad | Modus |
|-------|------|-------|
| **system-manager** | `System Manager/system-manager.md` | Plan Mode PFLICHT |

**Funktion:** Erstellt SESSION_BRIEFING.md für Technical Manager
**Skill:** `.claude/skills/System Manager/SKILL.md`

---

## Referenzen

| Thema | Pfad |
|-------|------|
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` |
| Log-Locations | `.claude/reference/debugging/LOG_LOCATIONS.md` |
| MQTT-Topics | `.claude/reference/api/MQTT_TOPICS.md` |
| Communication-Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
