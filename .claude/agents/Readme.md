# AutomationOne Agenten

> **Version:** 5.1 | **Aktualisiert:** 2026-03-07
> **Format:** Offizielles Claude Code Plugin-Agent-Format
> **Agenten gesamt:** 13 | **Struktur:** Flach (alle .md direkt im agents/)

---

## Verfuegbare Agenten

### Debug-Agenten (Log-Analyse)

| Agent | Datei | Color | Beschreibung |
|-------|-------|-------|--------------|
| **esp32-debug** | `esp32-debug.md` | cyan | ESP32 Serial-Log Analyse, Cross-Layer Stack |
| **server-debug** | `server-debug.md` | cyan | God-Kaiser Server JSON-Log Analyse |
| **mqtt-debug** | `mqtt-debug.md` | cyan | MQTT Traffic Analyse, Broker-Health |
| **frontend-debug** | `frontend-debug.md` | cyan | Vue 3 Source-Code + Docker-Log Analyse |
| **meta-analyst** | `meta-analyst.md` | magenta | Cross-Report Korrelation, Widersprueche |

### System-Operators

| Agent | Datei | Color | Beschreibung |
|-------|-------|-------|--------------|
| **system-control** | `system-control.md` | blue | System-Steuerung, Briefing, 7 Modi |
| **db-inspector** | `db-inspector.md` | yellow | Datenbank-Inspektion & Cleanup |

### Utility-Agenten

| Agent | Datei | Color | Beschreibung |
|-------|-------|-------|--------------|
| **agent-manager** | `agent-manager.md` | yellow | Agent-Qualitaet, IST-SOLL, Konsistenz |
| **test-log-analyst** | `test-log-analyst.md` | cyan | Test-Log-Analyse (pytest, Vitest, Playwright, Wokwi) |

### Dev-Agenten (Pattern-konforme Implementierung)

| Agent | Datei | Color | Beschreibung |
|-------|-------|-------|--------------|
| **esp32-dev** | `esp32-dev.md` | green | ESP32 Firmware-Entwicklung |
| **server-dev** | `server-dev.md` | green | Server-Entwicklung (FastAPI/Python) |
| **mqtt-dev** | `mqtt-dev.md` | green | MQTT-Protokoll-Entwicklung |
| **frontend-dev** | `frontend-dev.md` | green | Frontend-Entwicklung (Vue 3/TypeScript) |

---

## Agent-Format (Plugin-Standard)

Alle Agenten verwenden das offizielle Claude Code Plugin-Format:

```yaml
---
name: agent-name
description: |
  Beschreibung wann der Agent verwendet werden soll.
  MUST BE USED when: [Trigger-Situationen]
  NOT FOR: [Abgrenzung]

  <example>
  Context: [Situation]
  user: "[User-Anfrage]"
  assistant: "[Wie Claude reagieren soll]"
  <commentary>
  [Warum dieser Agent der richtige ist]
  </commentary>
  </example>
model: sonnet
color: cyan
tools: ["Read", "Grep", "Glob", "Bash"]
skills: ["skill-name"]  # Optional: Skill automatisch vorladen
---

# Agent-Titel

[System Prompt - Agent-Verhalten und Arbeitsanweisungen]
```

### Frontmatter-Felder

| Feld | Required | Format | Optionen |
|------|----------|--------|----------|
| `name` | Ja | lowercase-hyphens, 3-50 Zeichen | z.B. `esp32-debug` |
| `description` | Ja | Text + `<example>` Bloecke | Triggering-Bedingungen |
| `model` | Ja | String | `sonnet`, `opus`, `haiku`, `inherit` |
| `color` | Ja | String | `blue`, `cyan`, `green`, `yellow`, `magenta`, `red` |
| `tools` | Nein | JSON Array | `["Read", "Grep", "Glob"]` |
| `skills` | Nein | JSON Array | `["esp32-development"]` |

### Farb-Schema

| Farbe | Kategorie | Agenten |
|-------|-----------|---------|
| **cyan** | Analyse & Debug | esp32-debug, server-debug, mqtt-debug, frontend-debug, test-log-analyst |
| **magenta** | Cross-Layer Meta | meta-analyst |
| **green** | Implementierung | esp32-dev, server-dev, mqtt-dev, frontend-dev |
| **blue** | System Operations | system-control |
| **yellow** | Validation & Utility | db-inspector, agent-manager |

---

## Aktivierung

### Automatisch (basierend auf `description` + `<example>` Bloecke)

Agenten werden durch ihre Description und Example-Bloecke automatisch getriggert:
- "ESP32 Boot-Problem" → esp32-debug
- "MQTT Messages kommen nicht an" → mqtt-debug
- "Dashboard zeigt keine Daten" → frontend-debug
- "Vergleiche alle Reports" → meta-analyst
- "Sensor hinzufuegen" → esp32-dev

### Manuell

```
Analysiere mit esp32-debug die Serial-Logs
```

---

## Log-Quellen

| Agent | Primaerer Input | Log-Pfad |
|-------|-----------------|----------|
| esp32-debug | Serial-Log | `logs/current/esp32_serial.log` |
| server-debug | Server JSON-Log | `logs/server/god_kaiser.log` |
| mqtt-debug | MQTT-Traffic | `logs/mqtt/mqtt_traffic.log` |
| frontend-debug | Source-Code + Docker | `El Frontend/`, Docker-Logs |
| db-inspector | PostgreSQL | Docker exec psql |
| meta-analyst | Alle Reports | `.claude/reports/current/` |
| test-log-analyst | Test-Output | `logs/backend/`, `logs/frontend/`, `logs/wokwi/` |

---

## Report-Ausgabe

Alle Agenten schreiben Reports nach: `.claude/reports/current/`

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
├── Readme.md              # Dieser Index
├── agent-manager.md       # Agent-Manager (yellow)
├── db-inspector.md        # DB Inspector (yellow)
├── esp32-debug.md         # ESP32 Debug (cyan)
├── esp32-dev.md           # ESP32 Dev (green)
├── frontend-debug.md      # Frontend Debug (cyan)
├── frontend-dev.md        # Frontend Dev (green)
├── meta-analyst.md        # Meta-Analyst (magenta)
├── mqtt-debug.md          # MQTT Debug (cyan)
├── mqtt-dev.md            # MQTT Dev (green)
├── server-debug.md        # Server Debug (cyan)
├── server-dev.md          # Server Dev (green)
├── system-control.md      # System Control (blue)
└── test-log-analyst.md    # Test-Log-Analyst (cyan)
```

---

## Referenzen

| Thema | Pfad |
|-------|------|
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` |
| Log-Locations | `.claude/reference/debugging/LOG_LOCATIONS.md` |
| MQTT-Topics | `.claude/reference/api/MQTT_TOPICS.md` |
| Communication-Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` |
| REST-Endpoints | `.claude/reference/api/REST_ENDPOINTS.md` |
| WebSocket-Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
