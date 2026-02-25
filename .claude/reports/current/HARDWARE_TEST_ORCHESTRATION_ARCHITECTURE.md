# Hardware-Test-Orchestration Architecture (F4)

**Version:** 1.0
**Datum:** 2026-02-24
**Typ:** Architektur-Dokument (reine Analyse, kein Code)
**Autor:** Claude Opus 4.6 (Agent-Analyse)

---

## Inhaltsverzeichnis

1. [Executive Summary](#1-executive-summary)
2. [IST-Analyse (Block A)](#2-ist-analyse)
   - 2.1 Agent-Capabilities-Audit
   - 2.2 Flow-Analyse
   - 2.3 AutoOps Python-Framework
   - 2.4 Hardware-Konfigurationslogik
3. [SOLL-Architektur (Block B)](#3-soll-architektur)
   - 3.1 F4 Hardware-Test-Flow
   - 3.2 Hardware-Profil-System
   - 3.3 Agent-Chaining-Architektur
   - 3.4 start_session.sh Erweiterung
   - 3.5 Agent-Anpassungen vs. neue Agents
4. [Risiko-Analyse (Block C)](#4-risiko-analyse)
5. [Entscheidungspunkte](#5-entscheidungspunkte)
6. [Implementierungs-Roadmap](#6-implementierungs-roadmap)

---

## 1. Executive Summary

### Ziel

Ein universeller Hardware-Test-Flow (F4) fuer AutomationOne, der:
- **Jeden Sensor/Actuator** unterstuetzt, den Robin anschliesst (SHT31, DS18B20, pH, EC, BMP280, BME280, Relay, Pump, Valve, PWM)
- **Agent-Chaining automatisiert** (kein manuelles Copy/Paste zwischen TM und VS Code)
- Robin **nur fuer physische Schritte** braucht (Flash, Captive Portal, Verkabelung)
- **Alle Layer** verifiziert: Frontend, Server, PostgreSQL, ESP32, MQTT, WebSocket, Grafana Alerts
- **30-Minuten Stabilitaetstests** ohne Agent-Overload durchhaelt

### Architektur-Constraint

**Nur `auto-ops` hat das Task-Tool** (Subagent-Delegation). Kein anderer Agent kann Subagents spawnen. Der Orchestrator MUSS der Main-Thread sein oder auto-ops.

---

## 2. IST-Analyse

### 2.1 Agent-Capabilities-Audit

#### 2.1.1 Agent-Inventar (14 + 3 = 17 Agents)

| Agent | Model | Tools | Task-Tool | Primaere Rolle |
|-------|-------|-------|-----------|----------------|
| **system-control** | opus | Read, Write, Bash, Grep, Glob | NEIN | Session-Briefing, Operationen |
| **esp32-debug** | sonnet | Read, Grep, Glob, Bash | NEIN | ESP32 Serial-Log Analyse |
| **server-debug** | sonnet | Read, Grep, Glob, Bash | NEIN | Server JSON-Log Analyse |
| **mqtt-debug** | sonnet | Read, Grep, Glob, Bash | NEIN | MQTT-Traffic Analyse |
| **frontend-debug** | sonnet | Read, Grep, Glob, Bash | NEIN | Frontend Build/Runtime |
| **meta-analyst** | sonnet | Read, Grep, Glob | NEIN | Cross-Report Vergleich (KEIN Bash!) |
| **agent-manager** | sonnet | Read, Write, Edit, Grep, Glob | NEIN | Agent-Konsistenz (KEIN Bash!) |
| **esp32-dev** | sonnet | Read, Grep, Glob, Bash, Write, Edit | NEIN | C++ Implementierung |
| **server-dev** | sonnet | Read, Grep, Glob, Bash, Write, Edit | NEIN | Python Implementierung |
| **mqtt-dev** | sonnet | Read, Grep, Glob, Bash, Write, Edit | NEIN | MQTT Protokoll-Impl. |
| **frontend-dev** | sonnet | Read, Write, Edit, Bash, Grep, Glob | NEIN | Vue/TS Implementierung |
| **db-inspector** | sonnet | Read, Bash, Grep, Glob | NEIN | DB Inspektion & Cleanup |
| **test-log-analyst** | sonnet | Read, Grep, Glob, Bash | NEIN | Test-Log Analyse |
| **auto-ops** (Plugin) | sonnet | Bash, Read, Write, Edit, Grep, Glob, **Task** | **JA** | Orchestrator (4 Rollen) |
| backend-inspector | sonnet | Bash, Read, Write, Grep, Glob, MCP | NEIN | Cross-Layer Backend |
| frontend-inspector | sonnet | Bash, Read, Write, Grep, Glob, MCP | NEIN | Cross-Layer Frontend |

#### 2.1.2 Kritische Erkenntnisse

1. **Task-Tool-Monopol:** Nur `auto-ops` kann Subagents spawnen. Dies macht auto-ops zum natuerlichen Orchestrator-Kandidaten fuer F4.
2. **Kein Agent-zu-Agent-Spawning:** Ein Subagent kann keinen weiteren Subagent spawnen. Maximale Tiefe = 1.
3. **meta-analyst hat kein Bash:** Kann keine Verifikations-Kommandos ausfuehren, liest nur Reports.
4. **system-control ist der einzige opus-Agent:** Alle anderen nutzen sonnet.
5. **MCP-Zugang:** Nur backend-inspector und frontend-inspector haben `mcp__MCP_DOCKER__sequentialthinking`.
6. **Hooks:** PreToolUse:Bash blockiert destruktive Commands (rm -rf, DELETE FROM, docker compose restart/stop/down). PostToolUse ist leer.

#### 2.1.3 Auto-Ops 4-Rollen-System

| Rolle | Beschreibung | Task-Delegation |
|-------|-------------|-----------------|
| Operations (Default) | System-Diagnose, Docker, DB, MQTT | Delegiert an backend-inspector |
| Backend Inspector | Wird von auto-ops delegiert | Kann NICHT weiter delegieren |
| Frontend Inspector | Wird von auto-ops delegiert | Kann NICHT weiter delegieren |
| Driver-Modus | Playwright-basiert (UI-Test) | Kein Task-Tool noetig |

---

### 2.2 Flow-Analyse

#### 2.2.1 Bestehende Flows

| Flow | Status | Automatisierung |
|------|--------|-----------------|
| F1 (Test-Flow) | Implementiert | 0% - Vollstaendig manuell via TM |
| F2 (Dev-Flow) | Implementiert | 0% - Manuell, abhaengig von F1 |
| F3 (Docker-Monitoring) | Implementiert | Teilweise (Docker Compose) |
| **F4 (Hardware-Test)** | **NICHT VORHANDEN** | **Ziel dieses Dokuments** |

#### 2.2.2 F1 Test-Flow Ablauf (IST)

```
1. User startet scripts/debug/start_session.sh
2. User schreibt "Session gestartet" + Hardware-Info
3. system-control erstellt SESSION_BRIEFING.md
4. User kopiert Briefing zum TM (Claude Desktop)
5. TM formuliert Agent-Befehle (einzeln)
6. User fuehrt system-control Ops aus (generiert Logs)
7. User fuehrt Debug-Agents einzeln aus (esp32/server/mqtt/frontend)
8. User ruft /collect-reports auf → CONSOLIDATED_REPORT.md
9. User kopiert Report zum TM → Analyse
```

**Probleme fuer F4:**
- Vollstaendig manuell (9 Copy/Paste-Schritte)
- Kein hardware-spezifischer Modus in start_session.sh
- frontend-debug fehlt in F1 Step 5
- Keine Grafana-Alert-Monitoring-Integration
- Kein Stabilitaetstest-Mechanismus

#### 2.2.3 start_session.sh (v4.1) Analyse

**5 Modi:** boot, config, sensor, actuator, e2e

**E2E-Modus ist HARDCODED:**
```bash
# Nur DS18B20 (GPIO 4) + Relay (GPIO 26)
# Keine parametrische Konfiguration
# MQTT subscribes auf kaiser/# (kein Profil-Filter)
```

**STATUS.md Hardware-Sektion:** Manuelle Platzhalter-Tabelle (wird nicht automatisch befuellt).

**COM-Port:** Auto-Detection auf Windows vorhanden.

#### 2.2.4 stop_session.sh (v3.0) Analyse

Archiviert Logs nach `logs/archive/{session_id}/` und Reports nach `.claude/reports/archive/{session_id}/`. Stoppt MQTT-Capture. Kann als Basis fuer F4-Cleanup dienen.

---

### 2.3 AutoOps Python-Framework

#### 2.3.1 Plugin-Architektur

```
El Servador/god_kaiser_server/src/autoops/
  core/
    api_client.py     → GodKaiserClient (httpx, async, retry)
    context.py        → AutoOpsContext, SensorSpec, ActuatorSpec, ESPSpec
    reporter.py       → AutoOpsReporter (Markdown-Reports)
    base_plugin.py    → PluginAction, PluginResult
    plugin_registry.py
  plugins/
    health_check.py   → System-Health Check
    esp_configurator.py → ESP-Konfiguration (Mock + Real)
    debug_fix.py      → Auto-Fix Logik
    system_cleanup.py → Resource Cleanup
  agent.py            → Agent-Koordination
  runner.py           → Plugin-Runner
```

#### 2.3.2 GodKaiserClient API-Coverage

| Bereich | Endpoints | Status |
|---------|-----------|--------|
| Auth | authenticate | OK |
| Devices | list, get, create, update, delete | OK |
| Mock ESP | create, list, heartbeat | OK |
| Sensors | CRUD, mock, data query | OK |
| Actuators | CRUD, mock, command | OK |
| Zones | assign, list, create | OK |
| Subzones | CRUD | OK |
| Health | live, ready, detailed, metrics | OK |
| OneWire | scan | OK |
| Logic Rules | CRUD | OK |
| Audit Logs | list | OK |
| Diagnostics | run | OK |
| **ESP Approval** | **FEHLT** | **BUG** |

**Kritischer Bug:** `api_client.py` hat KEINE `approve_device()`-Methode. Registrierte Real-ESPs landen im `pending_approval`-Status und koennen nicht automatisch freigeschaltet werden. Muss fuer F4 ergaenzt werden.

#### 2.3.3 ESPConfiguratorPlugin Workflow

```
Create ESP → Add Sensors → Add Actuators → Enable Heartbeat
    → Trigger Initial Heartbeat → Start Simulation → Verify
```

**GPIO-Zuweisung (esp_configurator.py):**

| Sensor-Typ | Interface | GPIO-Strategie |
|------------|-----------|----------------|
| DS18B20 | OneWire | Start bei GPIO 4 |
| SHT31 | I2C | GPIO 21/22 (SDA/SCL) |
| BMP280/BME280 | I2C | GPIO 21/22 (SDA/SCL) |
| pH | Analog | ADC1: GPIO 32-39 |
| EC | Analog | ADC1: GPIO 32-39 |
| Moisture | Analog | ADC1: GPIO 32-39 |

**Sensor-Defaults im esp_configurator (9 Typen):**
temperature, humidity, ph, ec, moisture, pressure, co2, light, flow

**DeviceMode (context.py):**
- MOCK: Debug-API (Standard, sicher)
- REAL: Device-Registration-API
- HYBRID: Bestehende Real-Devices nutzen, Luecken mit Mocks fuellen

#### 2.3.4 AutoOps Reporter

Generiert Markdown-Reports in `autoops/reports/`. Format kompatibel mit meta-analyst. Enthalt: Plugin-Ergebnisse, API-Aktionslog, Fehler/Warnungen, Abschluss-Summary.

---

### 2.4 Hardware-Konfigurationslogik

#### 2.4.1 Sensor-Registry (ESP32 Firmware)

**Datei:** `El Trabajante/src/models/sensor_registry.cpp`

| Device Type | Server Types | Interface | I2C Addr | Multi-Value |
|-------------|-------------|-----------|----------|-------------|
| sht31 | sht31_temp, sht31_humidity | I2C | 0x44 | JA (2) |
| ds18b20 | ds18b20 | OneWire | - | NEIN |
| bmp280 | bmp280_pressure, bmp280_temp | I2C | 0x76 | JA (2) |
| bme280 | bme280_pressure, bme280_temp, bme280_humidity | I2C | 0x76 | JA (3) |
| ph_sensor | ph | Analog | - | NEIN |
| ec_sensor | ec | Analog | - | NEIN |
| moisture | moisture | Analog | - | NEIN |

**Type-Aliase:** 28 Eintraege im SENSOR_TYPE_MAP (bidirektionale Namensaufloesung).

#### 2.4.2 Frontend Sensor-Defaults

**Datei:** `El Frontend/src/utils/sensorDefaults.ts`

**SENSOR_TYPE_CONFIG:** 17 Eintraege (DS18B20, pH, EC, SHT31, BME280, analog, digital, flow, level, light, co2, moisture + Case-Varianten)

**MULTI_VALUE_DEVICES:** 3 Eintraege (sht31, bmp280, bme280) mit vollstaendiger Werte-Konfiguration.

**Zusaetzliche Features:**
- `inferInterfaceType()`: Automatische Interface-Erkennung
- `I2C_ADDRESS_REGISTRY`: Dropdown-Optionen fuer I2C-Adressen
- `recommendedGpios`: GPIO-Empfehlungen pro Sensor-Typ (nur DS18B20)
- Operating Mode Recommendations (continuous/on_demand)

#### 2.4.3 Actuator-Registry (ESP32 Firmware)

**Datei:** `El Trabajante/src/models/actuator_types.h`

| Typ | Token | Kategorie |
|-----|-------|-----------|
| pump | "pump" | Binary |
| valve | "valve" | Binary |
| relay | "relay" | Binary |
| pwm | "pwm" | PWM (0.0-1.0) |

**Actuator-Mapping (Server → ESP32):**
- "digital" → "relay"
- "binary" → "relay"
- "switch" → "relay"
- Alle anderen: unveraendert

#### 2.4.4 Config-Push-Pipeline

```
DB Model (SensorConfig/ActuatorConfig)
    ↓
ConfigPayloadBuilder.build_combined_config()
    ↓  (laedt alle Sensoren/Aktoren des ESP aus DB)
ConfigMappingEngine.apply_sensor_mapping() / apply_actuator_mapping()
    ↓  (DEFAULT_SENSOR_MAPPINGS / DEFAULT_ACTUATOR_MAPPINGS)
GPIO-Konflikt-Check (I2C/OneWire ausgenommen)
    ↓
ESP32-Payload Dict
    ↓
MQTT Topic: kaiser/{kaiser_id}/esp/{esp_id}/config
    ↓
ESP32 ConfigManager verarbeitet Payload
    ↓
Config Response: kaiser/god/esp/{esp_id}/config_response
    ↓
ConfigHandler: success/partial_success/error → DB Update + WebSocket Broadcast
```

**Sensor-Mapping-Felder (12 Felder):**
gpio, sensor_type, sensor_name, subzone_id, active, sample_interval_ms, raw_mode, operating_mode, measurement_interval_seconds, interface_type, onewire_address, i2c_address

**Actuator-Mapping-Felder (10 Felder):**
gpio, actuator_type, actuator_name, subzone_id, active, aux_gpio, critical, inverted_logic, default_state, default_pwm

**Config-Response Status-Typen:**
- `success`: Alle Items konfiguriert
- `partial_success`: Phase 4 - einige OK, einige fehlgeschlagen (failures Array)
- `error`/`failed`: Komplett fehlgeschlagen

#### 2.4.5 GPIO-Validierung

**Datei:** `El Servador/god_kaiser_server/src/services/gpio_validation_service.py`

**Board-spezifische Constraints:**

| Constraint | ESP32-WROOM | XIAO ESP32-C3 |
|------------|-------------|---------------|
| System-Reserved | 0,1,2,3,6,7,8,9,10,11,12 (11 Pins) | 18,19 (2 Pins) |
| Input-Only | 34,35,36,39 | keine |
| I2C Bus | 21,22 (SDA/SCL) | 4,5 (SDA/SCL) |
| GPIO Range | 0-39 | 0-21 |
| ADC1 (WiFi-safe) | 32,33,34,35,36,39 | - |
| ADC2 (WiFi-Konflikt) | 0,2,4,12,13,14,15,25,26,27 | - |

**Validierungs-Reihenfolge:**
1. GPIO Range Check (board-spezifisch)
2. System-Pin Check (statisch, kein DB-Query)
3. Hardware Constraints (Input-Only, I2C-Bus)
4. DB: Sensor-Belegung
5. DB: Actuator-Belegung
6. ESP-gemeldeter Status (Phase 1 Daten)
7. ADC2 WiFi-Warning (nur Warnung, kein Reject)

#### 2.4.6 Grafana Alerts (28 Rules)

| Kategorie | Alerts | Relevant fuer F4 |
|-----------|--------|-------------------|
| Infrastruktur | Server Down, MQTT Disconnected, DB Down, Loki Down, Alloy Down, cAdvisor Down | KRITISCH |
| Sensor-Daten | Temp Out of Range, pH Out of Range, Humidity Out of Range, EC Out of Range, Sensor Data Stale | HOCH |
| ESP-Zustand | Heartbeat Gap, ESP Boot Loop, ESP in Safe Mode, ESP Devices Offline | HOCH |
| System-Performance | High Memory, DB Query Slow, DB Connections High, WebSocket Disconnects | MITTEL |
| MQTT | High Error Rate, MQTT Backlog, Broker No Clients, Broker Messages Stored High | HOCH |
| Applikation | API Error Rate High, Logic Engine Errors, Error Cascade | MITTEL |
| Safety | Actuator Timeout, Safety System Triggered | KRITISCH |

---

## 3. SOLL-Architektur

### 3.1 F4 Hardware-Test-Flow

#### 3.1.1 Flow-Uebersicht

```
                    ┌─────────────────────────────────────┐
                    │         F4: HARDWARE-TEST-FLOW       │
                    │  (Universelle Hardware-Orchestrierung)│
                    └─────────────────┬───────────────────┘
                                      │
    Phase 0: VORBEREITUNG             │     (Robin + Agent)
    ──────────────────────            │
    ┌─────────────────────────────────┤
    │ 0.1 Hardware-Profil waehlen     │ ← Robin waehlt / Agent schlaegt vor
    │ 0.2 ESP32 flashen               │ ← Robin (physisch)
    │ 0.3 Captive Portal + WiFi       │ ← Robin (physisch)
    │ 0.4 Docker Stack pruefen        │ ← Agent (automatisch)
    └─────────────────────────────────┤
                                      │
    Phase 1: SESSION-START            │     (Automatisch)
    ──────────────────────            │
    ┌─────────────────────────────────┤
    │ 1.1 start_session.sh hw-test    │ ← Neuer Modus
    │ 1.2 Profil-basierte STATUS.md   │
    │ 1.3 system-control Briefing     │
    └─────────────────────────────────┤
                                      │
    Phase 2: DEVICE-SETUP             │     (Automatisch)
    ─────────────────────             │
    ┌─────────────────────────────────┤
    │ 2.1 Device in DB registrieren   │ ← AutoOps ESP-Configurator
    │ 2.2 Sensoren/Aktoren anlegen    │ ← Profil-gesteuert
    │ 2.3 Zone/Subzone zuweisen       │
    │ 2.4 Config-Push via MQTT        │
    │ 2.5 Config-Response abwarten    │
    └─────────────────────────────────┤
                                      │
    Phase 3: HARDWARE-WIRING          │     (Robin)
    ────────────────────────          │
    ┌─────────────────────────────────┤
    │ 3.1 Agent zeigt Wiring-Guide    │ ← Generiert aus Profil
    │ 3.2 Robin verbindet Hardware    │ ← Physisch
    │ 3.3 Robin bestaetigt "fertig"   │
    └─────────────────────────────────┤
                                      │
    Phase 4: LIVE-VERIFIKATION        │     (Automatisch)
    ──────────────────────────        │
    ┌─────────────────────────────────┤
    │ 4.1 Heartbeat-Check             │ ← MQTT: kaiser/god/esp/{id}/heartbeat
    │ 4.2 Sensor-Daten pruefen        │ ← MQTT: kaiser/god/esp/{id}/sensor_data
    │ 4.3 Actuator-Kommando testen    │ ← REST: /api/v1/actuators/{id}/command
    │ 4.4 WebSocket-Events pruefen    │ ← WS: sensor_data, actuator_update
    │ 4.5 DB-Persistenz pruefen       │ ← SQL: sensor_readings, actuator_states
    │ 4.6 Frontend-Darstellung        │ ← Playwright Snapshot (optional)
    │ 4.7 Grafana Alert Status        │ ← Grafana API: /api/v1/provisioning/alert-rules
    └─────────────────────────────────┤
                                      │
    Phase 5: STABILITAETSTEST         │     (Automatisch, 30 Min)
    ─────────────────────────         │
    ┌─────────────────────────────────┤
    │ 5.1 Polling-Loop (5 Min Takt)   │ ← Bash sleep + API-Calls
    │ 5.2 Sensor-Werte sammeln        │ ← Loki / DB Queries
    │ 5.3 Heartbeat-Luecken pruefen   │
    │ 5.4 Drift/Anomalie-Erkennung    │
    │ 5.5 Grafana Alert Monitoring    │
    └─────────────────────────────────┤
                                      │
    Phase 6: REPORT & CLEANUP         │     (Automatisch)
    ──────────────────────────        │
    ┌─────────────────────────────────┤
    │ 6.1 Consolidated Report         │
    │ 6.2 Hardware-Test-Scorecard     │
    │ 6.3 Optional: Cleanup/Archiv    │
    └─────────────────────────────────┘
```

#### 3.1.2 Detaillierte Phase-Beschreibungen

**Phase 0: Vorbereitung (Robin + Agent-Unterstuetzung)**

| Schritt | Akteur | Aktion | Ergebnis |
|---------|--------|--------|----------|
| 0.1 | Robin | Waehlt Hardware-Profil oder erstellt neues | `{profile}.yaml` geladen |
| 0.2 | Robin | Flasht ESP32 via PlatformIO | Firmware auf ESP32 |
| 0.3 | Robin | Captive Portal: WiFi + MQTT Broker IP | ESP32 verbindet sich |
| 0.4 | Agent | Prueft Docker Stack (Server, MQTT, DB, Loki) | Health-Check bestanden |

**Phase 1: Session-Start (Automatisch)**

| Schritt | Akteur | Aktion | Ergebnis |
|---------|--------|--------|----------|
| 1.1 | Agent/Robin | `start_session.sh hw-test --profile sht31_ds18b20` | Logs, MQTT Capture gestartet |
| 1.2 | Script | Generiert profil-basierte STATUS.md | Hardware-Tabelle ausgefuellt |
| 1.3 | system-control | Liest STATUS.md, erstellt SESSION_BRIEFING.md | Briefing fertig |

**Phase 2: Device-Setup (Automatisch via AutoOps)**

| Schritt | Akteur | API-Calls | Ergebnis |
|---------|--------|-----------|----------|
| 2.1 | AutoOps | POST /api/v1/esp + (ggf. approve) | Device in DB, Status active |
| 2.2 | AutoOps | POST /api/v1/sensors (pro Sensor im Profil) | Sensoren angelegt |
| 2.3 | AutoOps | POST /api/v1/actuators (pro Actuator im Profil) | Aktoren angelegt |
| 2.4 | AutoOps | Zone/Subzone Assignment | Zugewiesen |
| 2.5 | AutoOps | Config-Push wird automatisch getriggert | Config via MQTT gesendet |
| 2.6 | Agent | Wartet auf config_response (Timeout: 30s) | Config applied/failed |

**Phase 3: Hardware-Wiring (Robin, physisch)**

Agent generiert aus dem Profil einen Wiring-Guide:
```
WIRING GUIDE: Profil "SHT31 + DS18B20"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESP32 Board: ESP32-WROOM

1. SHT31 (I2C):
   SHT31 SDA  → ESP32 GPIO 21
   SHT31 SCL  → ESP32 GPIO 22
   SHT31 VCC  → 3.3V
   SHT31 GND  → GND

2. DS18B20 (OneWire):
   DS18B20 DATA → ESP32 GPIO 4
   4.7kΩ Pullup: DATA → 3.3V
   DS18B20 VCC  → 3.3V
   DS18B20 GND  → GND
```

Robin bestaetigt mit "Fertig" oder "Hardware verbunden".

**Phase 4: Live-Verifikation (Automatisch)**

| Check | Methode | Erwartung | Timeout |
|-------|---------|-----------|---------|
| Heartbeat | MQTT Subscribe `kaiser/god/esp/{id}/heartbeat` | Nachricht innerhalb 60s | 120s |
| Sensor-Daten | MQTT Subscribe `kaiser/god/esp/{id}/sensor_data` | Werte im gueltigen Range | 90s |
| Actuator-Test | REST POST `/api/v1/actuators/{id}/command` ON/OFF | Response success | 10s |
| WebSocket | Browser/Playwright: `sensor_data` Event | Event empfangen | 30s |
| DB-Persistenz | SQL: `SELECT FROM sensor_readings WHERE esp_id=X` | Mindestens 1 Eintrag | 60s |
| Frontend | Playwright: Dashboard zeigt Sensor-Karte | Visuell korrekt | 30s |
| Grafana | API: Alert-Rules Status | Keine firing Alerts | 30s |

**Phase 5: Stabilitaetstest (Automatisch, 30 Minuten)**

```
Strategie: Polling-Loop mit 5-Minuten-Takt
Keine dauerhaft laufenden Subscriptions (vermeidet Agent-Overload)

Loop (6 Iterationen, je 5 Minuten):
  1. API: GET /api/v1/sensors/{id}/data?limit=30 → Daten-Kontinuitaet
  2. API: GET /health → Server gesund
  3. MQTT: mosquitto_sub -C 1 -t kaiser/god/esp/{id}/heartbeat → Heartbeat da
  4. Loki: Letzten 5 Min Logs auf Errors pruefen
  5. Grafana: Alert-Status abfragen
  6. Ergebnis in Zwischen-Report schreiben

  sleep 300 (5 Minuten)
```

**Warum kein dauerhaftes Subscribe:** `mosquitto_sub` ohne `-C` oder `-W` haengt ewig (wird vom Hook blockiert). Der 5-Min-Polling-Ansatz ist agent-freundlich und liefert ausreichende Granularitaet.

**Phase 6: Report & Cleanup (Automatisch)**

Output: `HARDWARE_TEST_REPORT_{profile}_{timestamp}.md`

Enthalt:
- Profil-Zusammenfassung (welche Hardware getestet)
- Phase-fuer-Phase Ergebnisse
- Sensor-Daten-Statistik (Min/Max/Avg/StdDev ueber 30 Min)
- Actuator-Response-Zeiten
- Heartbeat-Luecken
- Grafana-Alert-Historie
- Hardware-Test-Scorecard (PASS/FAIL pro Check)
- Empfehlungen (z.B. "ADC2-Pin vermeiden", "OneWire Pullup pruefen")

---

### 3.2 Hardware-Profil-System

#### 3.2.1 Profil-Format (YAML)

**Speicherort:** `.claude/hardware-profiles/`

```yaml
# .claude/hardware-profiles/sht31_ds18b20.yaml
name: "SHT31 + DS18B20 Combo"
description: "Temperature (OneWire) + Temperature/Humidity (I2C)"
version: "1.0"

esp:
  board: ESP32_WROOM          # ESP32_WROOM | XIAO_ESP32_C3
  device_name: "GH-Sensor-1"  # Optional, auto-generiert wenn leer
  zone: "Gewaechshaus"
  subzone: "Bereich-A"

sensors:
  - type: ds18b20
    name: "Wasser-Temperatur"
    gpio: 4
    interface: ONEWIRE
    # onewire_address wird automatisch per OneWire-Scan befuellt
    sample_interval_ms: 30000
    operating_mode: continuous

  - type: sht31
    name: "Luft-Klima"
    gpio: 21                   # I2C SDA (SCL implizit auf 22)
    interface: I2C
    i2c_address: 0x44
    sample_interval_ms: 30000
    operating_mode: continuous

actuators: []                  # Keine Aktoren in diesem Profil

stability_test:
  duration_minutes: 30
  polling_interval_minutes: 5
  expected_ranges:
    ds18b20:
      min: 5.0
      max: 45.0
      unit: "°C"
    sht31_temp:
      min: 10.0
      max: 50.0
      unit: "°C"
    sht31_humidity:
      min: 20.0
      max: 95.0
      unit: "% RH"
```

#### 3.2.2 Vorgefertigte Profile

| Profil-Datei | Sensoren | Aktoren | Beschreibung |
|-------------|----------|---------|--------------|
| `ds18b20_basic.yaml` | 1x DS18B20 | - | Einfachster Test |
| `sht31_basic.yaml` | 1x SHT31 | - | I2C Multi-Value Test |
| `sht31_ds18b20.yaml` | 1x SHT31 + 1x DS18B20 | - | I2C + OneWire Combo |
| `ph_ec_water.yaml` | 1x pH + 1x EC | - | Wasser-Qualitaet |
| `relay_pump.yaml` | - | 1x Relay + 1x Pump | Aktor-Test |
| `full_greenhouse.yaml` | 1x SHT31 + 1x DS18B20 + 1x pH + 1x EC + 1x Moisture | 1x Relay + 1x Pump + 1x PWM | Vollstaendiges Setup |
| `bme280_airquality.yaml` | 1x BME280 + 1x CO2 | - | Luft-Qualitaet |
| `xiao_minimal.yaml` | 1x SHT31 | - | XIAO ESP32-C3 Board |

#### 3.2.3 Profil-Validierung

Vor Nutzung wird jedes Profil gegen folgende Regeln validiert:

1. **Board-Kompatibilitaet:** GPIO-Nummern im gueltigen Range fuer Board-Typ
2. **System-Pin-Check:** Keine reservierten Pins (Flash SPI, UART, Boot-Strapping)
3. **GPIO-Konflikt-Check:** Keine doppelte GPIO-Nutzung (ausser I2C/OneWire Shared-Bus)
4. **Input-Only-Check:** Aktoren nicht auf Input-Only-Pins (34,35,36,39 bei WROOM)
5. **ADC2-Warning:** Analog-Sensoren auf ADC2-Pins erhalten Warnung
6. **Interface-Konsistenz:** I2C-Sensoren auf I2C-Pins, OneWire-Sensoren nicht auf I2C-Pins
7. **Sensor-Type-Existenz:** Sensor-Typ muss in sensor_registry.cpp existieren

#### 3.2.4 Profil-Erstellung (Interaktiv)

Wenn Robin kein vorgefertigtes Profil waehlt, kann er interaktiv eines erstellen:

```
Agent: Welches Board verwendest du?
Robin: ESP32 WROOM

Agent: Welche Sensoren?
Robin: SHT31 und 2x DS18B20

Agent: GPIO fuer DS18B20 (Standard: 4)?
Robin: 4

Agent: I2C-Adresse fuer SHT31 (Standard: 0x44)?
Robin: Standard

Agent: Aktoren?
Robin: Keine

→ Profil wird generiert und in .claude/hardware-profiles/ gespeichert
```

---

### 3.3 Agent-Chaining-Architektur

#### 3.3.1 Orchestrator-Design

**Architektur-Entscheidung:** Der **Main-Thread** (Claude Code direkt) orchestriert F4, NICHT auto-ops als Subagent.

**Begruendung:**
1. auto-ops hat zwar Task-Tool, ist aber selbst ein Subagent (wird via Task gestartet)
2. Subagents koennen keine weiteren Subagents spawnen (Tiefe=1 Limit)
3. Der Main-Thread kann sowohl auto-ops als auch alle anderen Agents via Task starten
4. Der Main-Thread hat Zugriff auf alle Tools (Bash, Read, Write, etc.)
5. Nur der Main-Thread kann Robin Fragen stellen (AskUserQuestion)

**Resultat:** F4 wird als **Skill** implementiert, der im Main-Thread laeuft und Agents sequenziell via Task startet.

#### 3.3.2 Agent-Chaining-Muster

```
Main-Thread (F4 Skill)
    │
    ├── Phase 0: Profil laden + validieren (direkt im Main-Thread)
    │
    ├── Phase 1: Task(system-control) → SESSION_BRIEFING.md
    │       └── Wartet auf Completion
    │
    ├── Phase 2: Task(auto-ops) → Device + Sensors + Actuators + Config
    │       └── auto-ops nutzt AutoOps Python-Framework
    │       └── Wartet auf Completion
    │
    ├── Phase 3: AskUserQuestion → Robin verbindet Hardware
    │       └── Wartet auf Robin's Bestaetigung
    │
    ├── Phase 4: Verifikation (parallelisierbar)
    │   ├── Task(auto-ops) → Health Check + MQTT + DB
    │   ├── Task(auto-ops:frontend-inspector) → WebSocket + UI
    │   └── Direkt: Grafana API Check (curl/Bash)
    │       └── Wartet auf alle Completions
    │
    ├── Phase 5: Stabilitaetstest (Main-Thread Bash Loop)
    │   └── 6x: sleep 300 → API Checks → Zwischen-Report
    │       └── Kein Agent noetig, nur Bash + Read
    │
    └── Phase 6: Report (Main-Thread)
        ├── Generiert HARDWARE_TEST_REPORT.md
        └── Optional: Task(meta-analyst) fuer Cross-Report
```

#### 3.3.3 Report-basierter Handoff

Agents kommunizieren NICHT direkt. Stattdessen:

```
Agent A schreibt → .claude/reports/current/HW_TEST_PHASE_N.md
Main-Thread liest → .claude/reports/current/HW_TEST_PHASE_N.md
Main-Thread gibt Kontext an → Agent B (via Task prompt)
Agent B schreibt → .claude/reports/current/HW_TEST_PHASE_M.md
```

**Vorteile:**
- Kein State-Verlust (alles persistent auf Disk)
- Debugging einfach (jede Phase nachvollziehbar)
- meta-analyst kann Zwischen-Reports analysieren
- Kompatibel mit bestehendem Report-System

#### 3.3.4 State-Tracking

**State-File:** `.claude/reports/current/HW_TEST_STATE.json`

```json
{
  "session_id": "hw-abc123",
  "profile": "sht31_ds18b20",
  "started_at": "2026-02-24T10:00:00Z",
  "current_phase": 4,
  "phases": {
    "0": {"status": "completed", "result": "ok"},
    "1": {"status": "completed", "result": "ok", "briefing": "SESSION_BRIEFING.md"},
    "2": {"status": "completed", "result": "ok", "device_id": "ESP_12AB34CD", "sensors": 3},
    "3": {"status": "completed", "result": "ok", "user_confirmed": true},
    "4": {"status": "in_progress", "checks": {"heartbeat": "pass", "sensor_data": "pending"}},
    "5": {"status": "pending"},
    "6": {"status": "pending"}
  },
  "errors": [],
  "warnings": ["ADC2 GPIO 26 not recommended with WiFi active"]
}
```

**Nutzen:** Bei Abbruch/Crash kann F4 an der letzten Phase fortgesetzt werden.

#### 3.3.5 Stabilitaetstest ohne Agent-Overload

**Problem:** 30-Minuten Test darf keinen Agent dauerhaft blockieren.

**Loesung: Main-Thread Bash-Loop**

```bash
# Phase 5 wird NICHT als Agent-Task ausgefuehrt
# Sondern direkt im Main-Thread als Bash-Kommando

for i in 1 2 3 4 5 6; do
  # Health-Check
  curl -s http://localhost:8000/health | jq .

  # Sensor-Daten (letzte 5 Min)
  curl -s http://localhost:8000/api/v1/sensors/{id}/data?limit=30 | jq '.count'

  # Heartbeat (einmalig, -C 1)
  timeout 10 mosquitto_sub -h localhost -t "kaiser/god/esp/{esp_id}/heartbeat" -C 1

  # Zwischen-Report schreiben (via Write-Tool)
  # → HW_TEST_STABILITY_ITERATION_{i}.md

  sleep 300
done
```

**Warum kein Agent:**
- `sleep 300` wuerde einen Agent 5 Minuten blockieren (Timeout-Risiko)
- Bash `sleep` ist resource-schonend
- API-Calls sind trivial (curl)
- Kein komplexes Reasoning noetig in der Polling-Phase

---

### 3.4 start_session.sh Erweiterung

#### 3.4.1 Neuer Modus: `hw-test`

**Aufruf:** `start_session.sh hw-test --profile <profil-name>`

**Erweiterungen gegenueber dem E2E-Modus:**

| Feature | E2E (IST) | hw-test (SOLL) |
|---------|-----------|----------------|
| Sensor-Config | Hardcoded DS18B20+Relay | Profil-gesteuert |
| STATUS.md Hardware-Tabelle | Manuelle Platzhalter | Auto-generiert aus Profil |
| MQTT Topic-Filter | `kaiser/#` (alles) | `kaiser/god/esp/{device_id}/#` (gefiltert) |
| Expected-Values | Keine | Aus Profil (min/max Ranges) |
| Grafana Check | Keine | Alert-Status Abfrage |
| Session-Typ Marker | "e2e" | "hw-test:{profil-name}" |

#### 3.4.2 STATUS.md Erweiterung

```markdown
## Hardware-Setup (automatisch generiert)

| Profil | Board | Device-ID |
|--------|-------|-----------|
| sht31_ds18b20 | ESP32_WROOM | ESP_12AB34CD |

### Sensoren

| # | Typ | Name | GPIO | Interface | I2C Addr | Interval |
|---|-----|------|------|-----------|----------|----------|
| 1 | ds18b20 | Wasser-Temperatur | 4 | ONEWIRE | - | 30s |
| 2 | sht31_temp | Luft-Klima (Temp) | 21 | I2C | 0x44 | 30s |
| 3 | sht31_humidity | Luft-Klima (Humidity) | 21 | I2C | 0x44 | 30s |

### Aktoren

Keine Aktoren in diesem Profil.

### Expected Ranges

| Sensor | Min | Max | Unit |
|--------|-----|-----|------|
| ds18b20 | 5.0 | 45.0 | °C |
| sht31_temp | 10.0 | 50.0 | °C |
| sht31_humidity | 20.0 | 95.0 | % RH |
```

#### 3.4.3 Kompatibilitaet

- `boot`, `config`, `sensor`, `actuator`, `e2e` Modi bleiben UNVERAENDERT
- `hw-test` ist ein NEUER Modus (kein Breaking Change)
- `--profile` Parameter nur fuer `hw-test` Modus relevant
- Ohne `--profile`: Interaktive Profil-Auswahl (Liste verfuegbarer Profile)

---

### 3.5 Agent-Anpassungen vs. Neue Agents

#### 3.5.1 Bewertung

| Option | Aufwand | Risiko | Empfehlung |
|--------|---------|--------|------------|
| Neuer "hw-test-orchestrator" Agent | Hoch | Mittel | NEIN |
| Neuer "stability-tester" Agent | Mittel | Niedrig | NEIN |
| Erweiterung system-control | Niedrig | Niedrig | JA |
| Erweiterung auto-ops Playbook | Niedrig | Niedrig | JA |
| Neuer F4 Skill | Niedrig | Niedrig | **JA (EMPFOHLEN)** |

**Entscheidung: Kein neuer Agent. Stattdessen:**

1. **Neuer Skill `hardware-test`** (`.claude/skills/hardware-test/SKILL.md`)
   - Implementiert die F4-Orchestrierung im Main-Thread
   - Trigger-Keywords: "hardware-test", "hw-test", "sensor testen", "hardware pruefen"
   - Nutzt bestehende Agents via Task-Tool

2. **Erweiterung `system-control`**
   - Neuer Modus "Hardware-Test" (erkennt `hw-test` Session-Typ)
   - Liest Hardware-Profil aus STATUS.md
   - Generiert profil-spezifisches Briefing

3. **Erweiterung `auto-ops` Playbook**
   - Neues Playbook "Hardware-Test Device Setup"
   - Profil-gesteuerte Device/Sensor/Actuator-Erstellung
   - Config-Push + Response-Monitoring

4. **Keine Aenderung an Debug-Agents**
   - esp32-debug, server-debug, mqtt-debug, frontend-debug bleiben unveraendert
   - Sie analysieren Logs wie bisher - die Logs kommen nur aus dem hw-test Kontext

#### 3.5.2 Skill-Design: `hardware-test`

**Trigger:** `/hardware-test` oder natuerlichsprachlich "Hardware testen", "Sensor testen"

**Skill-Ablauf:**
```
1. Profil-Auswahl (AskUserQuestion oder Parameter)
2. Profil-Validierung (GPIO, Board, Konsistenz)
3. Pre-Check: Docker Stack, Server Health
4. Phase 1-6 sequenziell ausfuehren
5. Final Report generieren
```

**Skill hat KEINEN eigenen Agent** - laeuft im Main-Thread und delegiert an bestehende Agents.

---

## 4. Risiko-Analyse

### 4.1 Technische Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| ESP32 meldet sich nicht nach Flash | Mittel | Hoch | Captive Portal Check + Timeout + Anleitung |
| Config-Response kommt nicht | Mittel | Hoch | 30s Timeout + Retry (3x) + Fallback auf Polling |
| Agent-Timeout waehrend Stabilitaetstest | Hoch | Mittel | Main-Thread Bash-Loop statt Agent (Design-Entscheidung) |
| MQTT `mosquitto_sub` haengt | Hoch | Hoch | Hook blockiert bereits. Immer `-C 1` oder `-W` verwenden |
| GPIO-Konflikt bei Real-Hardware | Niedrig | Mittel | Profil-Validierung + GpioValidationService |
| ESP Approval fehlt in API | Sicher | Hoch | `approve_device()` muss in api_client.py ergaenzt werden |
| Sensor liefert Out-of-Range Werte | Mittel | Niedrig | Expected-Ranges aus Profil, Warnung statt Abbruch |
| Docker Service down waehrend Test | Niedrig | Hoch | Pre-Check in Phase 0.4, Health-Monitoring in Phase 5 |
| Context-Window Overflow bei langem Test | Mittel | Hoch | Report-basierter Handoff, kein State im Agent-Kontext |

### 4.2 Organisatorische Risiken

| Risiko | Mitigation |
|--------|------------|
| Profil-Pflege wird vernachlaessigt | Profile sind selbstdokumentierend (YAML mit Beschreibung) |
| F4 wird zu komplex fuer Debugging | Jede Phase schreibt eigenen Report (nachvollziehbar) |
| Inkompatibilitaet mit zukuenftigen Sensor-Typen | Profil-System ist erweiterbar, sensor_registry.cpp als Source of Truth |
| start_session.sh wird zu gross | hw-test Logik in separater Funktion, modularer Aufbau |

### 4.3 Architektur-Risiken

| Risiko | Mitigation |
|--------|------------|
| Main-Thread Orchestrierung zu fragil | State-File ermoeglicht Wiederaufnahme |
| Report-basierter Handoff zu langsam | Reports sind klein (< 50 KB), Disk-I/O vernachlaessigbar |
| Profil-Format aendert sich | Version-Feld im Profil, Abwaertskompatibilitaet |
| auto-ops Playbook wird ueberladen | Separates Playbook pro Use-Case (nicht alles in einem) |

---

## 5. Entscheidungspunkte

### EP-1: Profil-Format

| Option | Pro | Contra | Empfehlung |
|--------|-----|--------|------------|
| **YAML** | Menschenlesbar, ausfuehrlich | Erfordert PyYAML (Server) | **EMPFOHLEN** |
| JSON | Kein Parser noetig, nativ in TS/Python | Weniger lesbar, keine Kommentare | Akzeptabel |
| Markdown (Tabellen) | Direkt in Docs nutzbar | Schwer zu parsen, fehleranfaellig | NEIN |

**Empfehlung: YAML.** Robin soll Profile lesen und editieren koennen. YAML erlaubt Kommentare und ist selbstdokumentierend. PyYAML ist bereits in vielen Python-Projekten Standard.

### EP-2: Orchestrator-Ebene

| Option | Pro | Contra | Empfehlung |
|--------|-----|--------|------------|
| **Main-Thread Skill** | Voller Tool-Zugriff, AskUserQuestion | Kein eigener Agent-Kontext | **EMPFOHLEN** |
| auto-ops als Orchestrator | Hat Task-Tool | Ist selbst Subagent, kein AskUserQuestion | NEIN |
| Neuer Agent | Dediziert | Overhead, Maintenance | NEIN |

**Empfehlung: Main-Thread Skill.** Einzige Option die sowohl Task-Delegation als auch Robin-Interaktion unterstuetzt.

### EP-3: Stabilitaetstest-Strategie

| Option | Pro | Contra | Empfehlung |
|--------|-----|--------|------------|
| **Bash Polling-Loop** | Agent-freundlich, kein Timeout-Risiko | Weniger intelligent | **EMPFOHLEN** |
| Agent mit sleep | Mehr Analyse moeglich | 30 Min Agent blockiert, Timeout-Risiko | NEIN |
| Externer Cron/Script | Unabhaengig | Komplexitaet, Integration | NEIN |

**Empfehlung: Bash Polling-Loop.** Der Stabilitaetstest braucht kein komplexes Reasoning - nur periodische API-Calls und Datensammlung.

### EP-4: ESP Approval Workflow

| Option | Pro | Contra | Empfehlung |
|--------|-----|--------|------------|
| **Auto-Approve nach Registration** | Einfach, schnell | Weniger sicher | EMPFOHLEN (fuer Tests) |
| Manuelles Approve durch Robin | Sicherer | Unterbricht Automatisierung | Option fuer Produktion |
| Approve via API + Whitelist | Automatisch + sicher | Implementierungsaufwand | Zukunft |

**Empfehlung: Auto-Approve in hw-test Kontext.** Fuer Tests ist Sicherheit sekundaer. In Produktion kann manuelles Approve beibehalten werden.

### EP-5: Profil-Speicherort

| Option | Pro | Contra | Empfehlung |
|--------|-----|--------|------------|
| **`.claude/hardware-profiles/`** | Git-tracked, versioniert | Nur in Claude-Kontext | **EMPFOHLEN** |
| `scripts/profiles/` | Allgemeiner | Weniger sichtbar fuer Agents | Akzeptabel |
| DB-basiert | Dynamisch | Overkill fuer Test-Profile | NEIN |

**Empfehlung: `.claude/hardware-profiles/`.** Profile sind Agent-spezifisch und gehoeren zum Agent-Kontext.

---

## 6. Implementierungs-Roadmap

### Phase I: Foundation (Geschaetzter Umfang: Mittel)

| # | Task | Dateien | Abhaengigkeiten |
|---|------|---------|-----------------|
| I.1 | Hardware-Profil YAML Schema definieren | `.claude/hardware-profiles/SCHEMA.md` | Keine |
| I.2 | 3 Basis-Profile erstellen | `.claude/hardware-profiles/*.yaml` | I.1 |
| I.3 | Profil-Validierung implementieren (Python) | `autoops/core/profile_validator.py` | I.1 |
| I.4 | `approve_device()` in api_client.py ergaenzen | `autoops/core/api_client.py` | Keine |
| I.5 | ESP-Approval Endpoint identifizieren/erstellen | `api/v1/esp.py` | I.4 |

### Phase II: Orchestrierung (Geschaetzter Umfang: Gross)

| # | Task | Dateien | Abhaengigkeiten |
|---|------|---------|-----------------|
| II.1 | Skill `hardware-test` erstellen | `.claude/skills/hardware-test/SKILL.md` | I.1-I.5 |
| II.2 | start_session.sh `hw-test` Modus hinzufuegen | `scripts/debug/start_session.sh` | I.2 |
| II.3 | STATUS.md Auto-Generation aus Profil | `scripts/debug/start_session.sh` | II.2 |
| II.4 | system-control hw-test Modus | `.claude/agents/system-control.md` | II.2 |
| II.5 | auto-ops hw-test Playbook | `auto-ops/agents/auto-ops.md` | I.3, I.4 |

### Phase III: Verifikation & Stabilitaet (Geschaetzter Umfang: Mittel)

| # | Task | Dateien | Abhaengigkeiten |
|---|------|---------|-----------------|
| III.1 | Live-Verifikation Checks implementieren | In Skill `hardware-test` | II.1 |
| III.2 | Stabilitaetstest Bash-Loop | In Skill `hardware-test` | II.1 |
| III.3 | Hardware-Test-Report Template | In Skill `hardware-test` | III.1, III.2 |
| III.4 | Grafana Alert Status Integration | In Skill `hardware-test` | II.1 |

### Phase IV: Erweiterung (Geschaetzter Umfang: Klein)

| # | Task | Dateien | Abhaengigkeiten |
|---|------|---------|-----------------|
| IV.1 | Weitere Profile (pH/EC, BME280, Full Greenhouse) | `.claude/hardware-profiles/*.yaml` | I.1 |
| IV.2 | XIAO ESP32-C3 Profil | `.claude/hardware-profiles/xiao_*.yaml` | I.1 |
| IV.3 | Interaktive Profil-Erstellung | In Skill `hardware-test` | II.1 |
| IV.4 | Wiring-Guide Generator | In Skill `hardware-test` | I.2 |

### Abhaengigkeits-Graph

```
I.1 (Schema) ──→ I.2 (Profile) ──→ II.2 (start_session.sh)
     │                                      │
     └──→ I.3 (Validator) ──→ II.5 (auto-ops Playbook)
                                            │
I.4 (approve_device) ──→ I.5 (API) ──→ II.5
                                            │
                          II.1 (Skill) ←────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         II.3 (STATUS.md)  II.4 (system-ctl)  III.1 (Checks)
                                                │
                                           III.2 (Stability)
                                                │
                                           III.3 (Report)
```

---

## Anhang A: Sensor-Type Konsistenz-Matrix

Ueber alle drei Layer hinweg (ESP32, Server, Frontend):

| Device | ESP32 Registry | Server AutoOps | Frontend sensorDefaults | Konsistent? |
|--------|---------------|----------------|------------------------|-------------|
| DS18B20 | ds18b20 | temperature (default) | DS18B20, ds18b20 | TEILWEISE (Server nutzt "temperature" statt "ds18b20") |
| SHT31 | sht31, sht31_temp, sht31_humidity | humidity (default) | SHT31, sht31, sht31_temp, sht31_humidity | TEILWEISE |
| BMP280 | bmp280, bmp280_pressure, bmp280_temp | pressure (default) | - (nur BME280 Config vorhanden) | LUECKE (Frontend fehlt BMP280 single-value) |
| BME280 | bme280, bme280_pressure, bme280_temp, bme280_humidity | - (nicht in esp_configurator defaults) | BME280, BME280_humidity, BME280_pressure | LUECKE (Server fehlt BME280 defaults) |
| pH | ph, ph_sensor | ph | pH | OK |
| EC | ec, ec_sensor | ec | EC | OK |
| Moisture | moisture | moisture | moisture | OK |
| CO2 | - (nicht in Registry) | co2 | co2 | LUECKE (ESP32 fehlt CO2) |
| Light | - (nicht in Registry) | light | light | LUECKE (ESP32 fehlt Light) |
| Flow | - (nicht in Registry) | flow | flow | LUECKE (ESP32 fehlt Flow) |
| Level | - (nicht in Registry) | - | level | LUECKE (nur Frontend) |

**Handlungsbedarf:**
- ESP32 sensor_registry.cpp fehlt: CO2, Light, Flow, Level
- Server esp_configurator.py fehlt: BME280 Defaults
- Server nutzt generische Typen ("temperature", "humidity") statt device-spezifische
- Frontend hat BMP280 nur als MULTI_VALUE_DEVICE, nicht als Single-Type Config

---

## Anhang B: GPIO-Zuweisungs-Strategie pro Profil

### ESP32-WROOM (GPIO 0-39, 28 nutzbar)

```
System-Reserved:  0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 12  (11 Pins)
Input-Only:       34, 35, 36, 39                         (4 Pins)
I2C Standard:     21 (SDA), 22 (SCL)                     (2 Pins)
ADC1 Safe:        32, 33, 34, 35, 36, 39                 (6 Pins, 34-39 input-only)
ADC2 WiFi-Risky:  4, 13, 14, 15, 25, 26, 27             (7 Pins)
Free GPIO:        4, 5, 13, 14, 15, 16, 17, 18, 19, 23, (15 Pins)
                  25, 26, 27, 32, 33

Empfohlene Zuweisung:
  OneWire:    GPIO 4 (Standard), dann 5, 13, 14, 15
  Analog:     GPIO 32, 33 (ADC1, WiFi-safe), dann 34, 35, 36, 39 (input-only)
  I2C:        GPIO 21 (SDA) + 22 (SCL) (Standard-Bus)
  Digital:    GPIO 16, 17, 18, 19, 23, 25, 26, 27
  Relay/Pump: GPIO 16, 17, 18, 19, 23, 25, 26, 27
  PWM:        GPIO 16, 17, 18, 19 (LEDC-faehig)
```

### XIAO ESP32-C3 (GPIO 0-21, 20 nutzbar)

```
System-Reserved:  18 (USB D-), 19 (USB D+)  (2 Pins)
Input-Only:       keine
I2C Standard:     4 (SDA), 5 (SCL)           (2 Pins)
Free GPIO:        0, 1, 2, 3, 6, 7, 8, 9, 10, 20, 21  (11 Pins)

Empfohlene Zuweisung:
  OneWire:    GPIO 2, 3
  Analog:     GPIO 0, 1, 2, 3 (alle ADC-faehig)
  I2C:        GPIO 4 (SDA) + 5 (SCL)
  Digital:    GPIO 6, 7, 8, 9, 10, 20, 21
```

---

## Anhang C: Referenz-Dateien

| Datei | Relevanz |
|-------|----------|
| `El Trabajante/src/models/sensor_registry.cpp` | ESP32 Sensor-Type Registry (Source of Truth) |
| `El Trabajante/src/models/sensor_registry.h` | ESP32 Registry Header |
| `El Trabajante/src/models/actuator_types.h` | ESP32 Actuator Types |
| `El Frontend/src/utils/sensorDefaults.ts` | Frontend Sensor-Konfiguration |
| `El Servador/god_kaiser_server/src/autoops/plugins/esp_configurator.py` | AutoOps ESP-Konfiguration |
| `El Servador/god_kaiser_server/src/autoops/core/api_client.py` | REST API Client |
| `El Servador/god_kaiser_server/src/autoops/core/context.py` | AutoOps Context |
| `El Servador/god_kaiser_server/src/services/gpio_validation_service.py` | GPIO-Validierung |
| `El Servador/god_kaiser_server/src/services/config_builder.py` | Config-Payload Builder |
| `El Servador/god_kaiser_server/src/core/config_mapping.py` | Config Field Mappings |
| `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` | Config-Response Handler |
| `scripts/debug/start_session.sh` | Session-Management |
| `scripts/debug/stop_session.sh` | Session-Cleanup |
| `.claude/reference/testing/flow_reference.md` | Flow-Definitionen F1-F3 |
| `docker/grafana/provisioning/alerting/alert-rules.yml` | 28 Grafana Alerts |

---

*Dieses Dokument ist eine reine Architektur-Analyse. Keine Code-Aenderungen wurden vorgenommen.*
*Erstellt am 2026-02-24 durch Claude Opus 4.6 auf Basis der vollstaendigen Codebase-Analyse.*
