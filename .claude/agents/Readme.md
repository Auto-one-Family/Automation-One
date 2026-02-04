# Debug-Agenten

> **Version:** 3.0 | **Aktualisiert:** 2026-02-02
> **Format:** Offizielles Claude Code Agent-Format

---

## Verfügbare Agenten

| Agent | Datei | Beschreibung | Tools |
|-------|-------|--------------|-------|
| **esp32-debug** | `esp32-debug.md` | ESP32 Serial-Log Analyse | Read, Grep, Glob |
| **server-debug** | `server-debug.md` | God-Kaiser Server-Log Analyse | Read, Grep, Glob |
| **mqtt-debug** | `mqtt-debug.md` | MQTT Traffic Analyse | Read, Grep, Glob |
| **provisioning-debug** | `provisioning-debug.md` | Provisioning Flow Debugging | Read, Grep, Glob |
| **db-inspector** | `db-inspector.md` | Datenbank-Inspektion & Cleanup | Read, Bash, Grep, Glob |
| **system-control** | `system-control.md` | System-Steuerung & Operations | Read, Bash, Grep, Glob |

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
| server-debug | Server JSON | `logs/current/god_kaiser.log` |
| mqtt-debug | MQTT Traffic | `logs/current/mqtt_traffic.log` |
| provisioning-debug | Alle drei | - |

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

## Migration von v2.x

Die Agenten wurden von der alten Unterordner-Struktur ins flache Format migriert:

| Alt | Neu |
|-----|-----|
| `agents/esp32/ESP32_DEBUG_AGENT.md` | `agents/esp32-debug.md` |
| `agents/server/SERVER_DEBUG_AGENT.md` | `agents/server-debug.md` |
| `agents/mqtt/MQTT_DEBUG_AGENT.md` | `agents/mqtt-debug.md` |
| `agents/Provisioning/PROVISIONING_DEBUG_AGENT.md` | `agents/provisioning-debug.md` |
| `agents/System_Operators/DB-Inspector.md` | `agents/db-inspector.md` |
| `agents/System_Operators/System-Control.md` | `agents/system-control.md` |

Backups der alten Dateien: `.claude/archive/agents_backup_20260202/`

---

## Referenzen

| Thema | Pfad |
|-------|------|
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` |
| Log-Locations | `.claude/reference/debugging/LOG_LOCATIONS.md` |
| MQTT-Topics | `.claude/reference/api/MQTT_TOPICS.md` |
| Communication-Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
