# Debug-Agenten

> **Version:** 2.1 | **Aktualisiert:** 2026-02-02
> **Orchestrierung:** Via STATUS.md Prompts (keine Slash-Commands)

---

## Aktivierung

Die Agenten werden über **kopierfertige Prompts** aus `logs/current/STATUS.md` aktiviert.

**Workflow:**

1. Debug-Session starten: `./scripts/debug/start_session.sh [name] [--mode MODE]`
2. `STATUS.md` enthält kopierfertige Prompts für jeden Agent
3. Prompt in VS Code Claude kopieren
4. Agent arbeitet, schreibt Report nach `.claude/reports/current/`

**Verfügbare Modi:**

| Modus | Flag | Beschreibung |
|-------|------|--------------|
| BOOT | `--mode boot` | Boot-Sequenz (WiFi, MQTT, Heartbeat) - **default** |
| CONFIG | `--mode config` | Konfigurationsfluss (Zone Assignment, Config Push) |
| SENSOR | `--mode sensor` | Sensor-Datenfluss (Readings, Validation) |
| ACTUATOR | `--mode actuator` | Aktor-Steuerung (Commands, Status) |

**Beispiel-Prompt (aus STATUS.md):**

```
Du bist der ESP32_DEBUG_AGENT für AutomationOne.

WORKFLOW (in dieser Reihenfolge):
1. Lies dein Agent-Profil: .claude/agents/esp32/ESP32_DEBUG_AGENT.md
2. Lies den Session-Kontext: logs/current/STATUS.md
3. Analysiere den Log: logs/current/esp32_serial.log
4. Schreibe Report: .claude/reports/current/ESP32_[MODUS]_REPORT.md
```

---

## Verfügbare Agenten

| Agent | Profil | Log | Report |
|-------|--------|-----|--------|
| ESP32 | `esp32/ESP32_DEBUG_AGENT.md` | `esp32_serial.log` | `ESP32_[MODUS]_REPORT.md` |
| Server | `server/SERVER_DEBUG_AGENT.md` | `god_kaiser.log` | `SERVER_[MODUS]_REPORT.md` |
| MQTT | `mqtt/MQTT_DEBUG_AGENT.md` | `mqtt_traffic.log` | `MQTT_[MODUS]_REPORT.md` |

---

## Report-Naming

Der **Modus** kommt aus `--mode` Parameter (wird in STATUS.md gespeichert):

| Modus | Beispiel-Reports |
|-------|------------------|
| BOOT | `ESP32_BOOT_REPORT.md`, `SERVER_BOOT_REPORT.md`, `MQTT_BOOT_REPORT.md` |
| CONFIG | `ESP32_CONFIG_REPORT.md`, `SERVER_CONFIG_REPORT.md`, `MQTT_CONFIG_REPORT.md` |
| SENSOR | `ESP32_SENSOR_REPORT.md`, `SERVER_SENSOR_REPORT.md`, `MQTT_SENSOR_REPORT.md` |
| ACTUATOR | `ESP32_ACTUATOR_REPORT.md`, `SERVER_ACTUATOR_REPORT.md`, `MQTT_ACTUATOR_REPORT.md` |

---

## Agent-Design

Die Agenten sind **universell** designed:

- **System-Spezialisierung:** ESP32 / Server / MQTT (fest)
- **Modus-Fokus:** Variable aus STATUS.md (BOOT, CONFIG, SENSOR, etc.)
- **Kein Modus-Lock:** Agents dokumentieren IMMER Errors/Warnings

**Was im Agent-Profil steht:**
- Identität und Zuständigkeit
- Input-Pfade (welcher Log)
- Output-Pfad (wo Report)
- Referenzen (Detail-Doku)

**Was NICHT im Agent-Profil steht:**
- Konkrete Patterns für einen Modus (→ STATUS.md)
- Checklisten für einen Modus (→ STATUS.md)
- Session-spezifische Informationen (→ STATUS.md)

---

## Log-Quellen

| Agent | Liest | Format |
|-------|-------|--------|
| ESP32 | `logs/current/esp32_serial.log` | Plain Text |
| Server | `logs/current/god_kaiser.log` | JSON |
| MQTT | `logs/current/mqtt_traffic.log` | Plain Text (mosquitto_sub -v) |

---

## Workflow-Diagramm

```
┌─────────────────────────────────────────────────────────────────┐
│  1. start_session.sh                                            │
│     └─► Generiert logs/current/STATUS.md                        │
│         (Session-ID, Modus, Patterns, Checklisten)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. User kopiert Prompt aus STATUS.md                           │
│     └─► "Du bist der ESP32_DEBUG_AGENT..."                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Agent arbeitet                                              │
│     └─► Liest Agent-Profil                                      │
│     └─► Liest STATUS.md (Modus, Patterns)                       │
│     └─► Analysiert Log                                          │
│     └─► Schreibt Report                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Report in .claude/reports/current/                          │
│     └─► ESP32_BOOT_REPORT.md                                    │
│     └─► SERVER_BOOT_REPORT.md                                   │
│     └─► MQTT_BOOT_REPORT.md                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Referenzen

| Thema | Pfad |
|-------|------|
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` |
| Log-Locations | `.claude/reference/debugging/LOG_LOCATIONS.md` |
| MQTT-Topics | `.claude/reference/api/MQTT_TOPICS.md` |
| Communication-Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
