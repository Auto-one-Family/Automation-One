# F4 Hardware-Test-Flow: Complete System Overview

**Datum:** 2026-02-24
**Version:** Post-Audit (alle Agent-Referenzen verifiziert)

---

## 1. Was ist F4?

F4 ist der **Hardware-Test-Flow** im AutomationOne-Framework. Er testet echte ESP32-Hardware End-to-End: von der physischen Sensor-Verkabelung ueber MQTT-Kommunikation und Server-Verarbeitung bis zur Datenbank-Persistenz und Frontend-Anzeige.

**Kernidee:** Ein YAML-Profil beschreibt die Hardware-Konfiguration. Der Flow orchestriert automatisch alle Schritte — Robin (der User) muss nur fuer physische Aktionen eingreifen (Verkabeln, Flash bestaetigen).

---

## 2. Beteiligte Dateien und ihre Rolle

### 2.1 Orchestrierung (Skill + Agent)

| Datei | Typ | Rolle |
|-------|-----|-------|
| `.claude/skills/hardware-test/SKILL.md` | Skill | **Einstiegspunkt.** Wird durch `/hardware-test` oder `hw-test` aktiviert. Laedt das Profil, validiert es, orchestriert die 6 Phasen, ruft auto-ops mehrfach als Task auf. |
| `.claude/local-marketplace/auto-ops/agents/auto-ops.md` | Agent (Rolle 5) | **Ausfuehrender.** Wird vom Skill pro Phase als Task aufgerufen. Fuehrt Setup, Verifikation, Stabilitaetstest durch. Delegiert bei Problemen an Debug-Agents. |

**Beziehung:** Der Skill ist der "Regisseur", auto-ops ist der "Hauptdarsteller". Der Skill ruft auto-ops 4x auf (Setup, Verify, Stability, Meta).

### 2.2 Hardware-Profile (YAML)

| Datei | Beschreibung |
|-------|-------------|
| `.claude/hardware-profiles/ds18b20_basic.yaml` | Einfachster Test: 1x OneWire-Temperatursensor, keine Aktoren |
| `.claude/hardware-profiles/sht31_basic.yaml` | 1x I2C-Klimasensor (Temp+Humidity), keine Aktoren |
| `.claude/hardware-profiles/sht31_ds18b20_relay.yaml` | Combo-Test: 1x DS18B20 + 1x SHT31 + 1x Relay (Multi-Interface E2E) |

**Profil-Struktur:**
```yaml
name: "Profilname"
description: "Was wird getestet"
version: "1.0"

esp:
  board: ESP32_WROOM          # oder XIAO_ESP32_C3
  device_name: "HW-Test-XXX"
  zone: "Test-Zone"
  subzone: "Sensor-Test"

sensors:
  - type: sht31               # Muss firmware-registriert sein (7 Typen)
    name: "Klima-Sensor"
    gpio: 21
    interface: I2C
    i2c_address: "0x44"
    sample_interval_ms: 30000
    operating_mode: continuous

actuators:
  - type: relay
    name: "Bewaesserung"
    gpio: 16

stability_test:
  duration_minutes: 30
  polling_interval_minutes: 5
  expected_ranges:
    sht31_temp: { min: 10.0, max: 50.0, unit: "°C" }
```

### 2.3 Profil-Validierung (Python)

| Datei | Rolle |
|-------|-------|
| `El Servador/god_kaiser_server/src/autoops/core/profile_validator.py` | Validiert Profile vor dem Test. Prueft Board-Typ, GPIO-Konflikte, Sensor-Typen, Input-Only-Pins. |

**Sensor-Typ-Kategorisierung:**
```
FIRMWARE_PROVEN_SENSOR_TYPES    = {ds18b20, sht31, bmp280, bme280}       # Getestet, stabil
FIRMWARE_REGISTERED_SENSOR_TYPES = proven + {ph, ec, moisture}            # Haben ESP32-Driver
SERVER_ONLY_SENSOR_TYPES         = {co2, light, flow}                     # KEIN ESP32-Driver
VALID_SENSOR_TYPES               = FIRMWARE_REGISTERED (7 Typen)          # Fuer F4 erlaubt
```

**GPIO-Blacklists** (synchronisiert mit `gpio_validation_service.py`):
- ESP32_WROOM: System-Reserved {0,1,2,3,6-12}, Input-Only {34,35,36,39}
- XIAO_ESP32_C3: System-Reserved {18,19}

### 2.4 AutoOps Python-Backend (REST API Client)

| Datei | Rolle |
|-------|-------|
| `src/autoops/core/api_client.py` | **GodKaiserClient** — Async HTTP Client fuer ALLE Server-API-Calls. Retry mit Exponential Backoff. |
| `src/autoops/core/agent.py` | **AutoOpsAgent** — Orchestriert Plugins (health_check, esp_configurator, debug_fix) |
| `src/autoops/core/context.py` | **ESPSpec, SensorSpec, ActuatorSpec, DeviceMode** — Datenmodelle |
| `src/autoops/runner.py` | **CLI Entry Point** — `python -m src.autoops.runner --mode configure --device-mode real` |
| `src/autoops/plugins/health_check.py` | Health-Check Plugin (Server, DB, MQTT) |
| `src/autoops/plugins/esp_configurator.py` | ESP-Konfigurations-Plugin (Device + Sensor + Actuator + Zone) |
| `src/autoops/plugins/debug_fix.py` | Debug & Fix Plugin |
| `src/autoops/plugins/system_cleanup.py` | System-Cleanup Plugin |

**API-Client Methoden fuer F4:**
```
authenticate()           → JWT Token holen
register_real_device()   → ESP registrieren (device_mode=real)
approve_device()         → Pending Device genehmigen
add_sensor()             → Sensor auf GPIO anlegen
add_actuator()           → Aktor auf GPIO anlegen
assign_zone()            → Device einer Zone zuweisen
list_sensor_data()       → Sensor-Daten aus DB abfragen
send_actuator_command()  → Aktor schalten (ON/OFF/PWM)
```

### 2.5 Sub-Agents (Delegation bei Problemen)

| Agent | Datei | Wann aufgerufen | Report-Output |
|-------|-------|-----------------|---------------|
| `backend-inspector` | `auto-ops/agents/backend-inspector.md` | Phase 4 bei Backend-Problemen | `BACKEND_INSPECTION.md` |
| `frontend-inspector` | `auto-ops/agents/frontend-inspector.md` | Phase 4 bei Frontend-Problemen | `FRONTEND_INSPECTION.md` |
| `esp32-debug` | `.claude/agents/esp32-debug.md` | Phase 4 bei ESP-Problemen | `HW_TEST_ESP32_DEBUG.md` |
| `server-debug` | `.claude/agents/server-debug.md` | Phase 4 bei Server-Problemen | `HW_TEST_SERVER_DEBUG.md` |
| `mqtt-debug` | `.claude/agents/mqtt-debug.md` | Phase 4 bei MQTT-Problemen | `HW_TEST_MQTT_DEBUG.md` |
| `frontend-debug` | `.claude/agents/frontend-debug.md` | Phase 4 bei UI-Problemen | `HW_TEST_FRONTEND_DEBUG.md` |
| `meta-analyst` | `.claude/agents/meta-analyst.md` | Phase 6 fuer Cross-Report-Korrelation | `HW_TEST_META_ANALYSIS.md` |
| `system-control` | `.claude/agents/system-control.md` | Phase 1 fuer Session-Briefing | `SESSION_BRIEFING.md` |

### 2.6 Plugin-Skills (Wissensbasis)

| Skill | Datei | Wozu im F4-Kontext |
|-------|-------|-------------------|
| `system-health` | `auto-ops/skills/system-health/` | Stack-Diagnose, Eskalationsmatrix |
| `database-operations` | `auto-ops/skills/database-operations/` | DB-Queries, Schema-Referenz, Cleanup |
| `loki-queries` | `auto-ops/skills/loki-queries/` | Zentrale Loki-Query-Bibliothek |
| `error-codes` | `auto-ops/skills/error-codes/` | ESP32 (1000-4999) + Server (5000-5999) Error-Codes |
| `mqtt-analysis` | `auto-ops/skills/mqtt-analysis/` | 32 Topics, Payload-Struktur, Timing |
| `cross-layer-correlation` | `auto-ops/skills/cross-layer-correlation/` | Timestamp-Korrelation, Kaskaden-Muster |
| `esp32-operations` | `auto-ops/skills/esp32-operations/` | PlatformIO Build/Flash/Monitor |
| `docker-operations` | `auto-ops/skills/docker-operations/` | Docker Service Management |
| `frontend-patterns` | `auto-ops/skills/frontend-patterns/` | WS-Events, Stores, Auth-Flow |
| `boot-sequences` | `auto-ops/skills/boot-sequences/` | ESP32 Boot-Phasen, Server-Startup |

---

## 3. Der Flow im Detail (6 Phasen)

### Phase 0: Profil & Pre-Check

**Wer:** `hardware-test` Skill (direkt, kein Agent)

**Was passiert:**
1. Profil-YAML laden aus `.claude/hardware-profiles/{name}.yaml`
2. `profile_validator.py` ausfuehren — prueft Board, GPIOs, Sensor-Typen, Konflikte
3. Stack Pre-Check:
   - Docker Container laufen? (`docker compose ps`)
   - Server erreichbar? (`curl http://localhost:8000/api/v1/health/live`)
   - MQTT Broker aktiv? (`mosquitto_sub -t '$SYS/broker/uptime' -C 1 -W 5`)
   - DB erreichbar? (`pg_isready`)
4. Firmware-Status abfragen (Flash noetig?)
5. Mock-Mode-Empfehlung fuer Erstlauf
6. Profil-Summary + Voraussetzungsliste an Robin zeigen

**Output:** Validierungsergebnis + Bestaetigung von Robin

### Phase 1: Session starten + Briefing

**Wer:** `hardware-test` Skill → delegiert an `system-control`

**Was passiert:**
1. `start_session.sh hw-test` ausfuehren (oder manuell STATUS.md schreiben)
2. `system-control` Agent erstellt `SESSION_BRIEFING.md`

**Output:** `.claude/reports/current/SESSION_BRIEFING.md`

### Phase 2: Device Setup

**Wer:** `hardware-test` Skill → delegiert an `auto-ops` (Rolle 5, Aufruf 1)

**Was passiert:**
1. Pre-Check: Server Health, MQTT Broker, DB
2. Device registrieren via Python-Framework (`device_mode=real`) oder REST API
3. Device genehmigen: `POST /api/v1/esp/devices/{esp_id}/approve`
4. Sensoren aus Profil anlegen (jeder Sensor = ein API-Call mit GPIO, Typ, Interface)
5. Aktoren aus Profil anlegen (wenn vorhanden)
6. Zone/Subzone zuweisen
7. Config-Push abwarten (MQTT `config_response`, 30s Timeout)

**Error Recovery:**
- "Device already exists" → Bestehende ID nutzen oder inaktives Device loeschen + neu anlegen
- "GPIO-Konflikt" → GPIO-Belegung pruefen, bestehenden Sensor loeschen
- "Config push timeout" → 1x Retry, dann Serial-Log pruefen

**Output:** `.claude/reports/current/HW_TEST_PHASE_SETUP.md` (Device-ID, Sensor-IDs, GPIO-Mapping)

### Phase 3: Hardware verbinden (Robin)

**Wer:** Robin (physisch) — **einzige manuelle Phase**

**Was passiert:**
1. Skill generiert Wiring-Guide aus Profil:
   - **I2C:** SDA, SCL, VCC, GND + Pull-Up-Hinweis + alternative I2C-Adresse
   - **OneWire:** DATA + 4.7kOhm Pull-Up (PFLICHT!) + Daisy-Chain-Hinweis
   - **Analog:** Signal + ADC1-only Warnung bei WiFi (Pins 32-39)
   - **Relay:** Signal + 5V-Versorgung + Input-Only-Pin-Warnung
2. Robin verkabelt und bestaetigt ("fertig", "verbunden")

**Output:** Robins Bestaetigung

### Phase 4: Live-Verifikation

**Wer:** `hardware-test` Skill → delegiert an `auto-ops` (Rolle 5, Aufruf 2)

**Was passiert:**
1. **Heartbeat-Check:** `mosquitto_sub -t "kaiser/god/esp/+/system/heartbeat" -C 1 -W 60`
2. **Sensor-Daten-Check:** `mosquitto_sub -t "kaiser/god/esp/+/sensor/+/data" -C 3 -W 90`
3. **Actuator-Test** (wenn Profil Aktoren hat): REST POST → ON → 2s → OFF
4. **DB-Persistenz:** `SELECT COUNT(*) FROM sensor_data WHERE timestamp > NOW() - INTERVAL '2 minutes'`
5. **Grafana-Alert-Status:** Keine firing Alerts erwartet
6. **Bei Problemen:** Debug-Agents delegieren (esp32-debug, server-debug, mqtt-debug, frontend-debug)

**Delegation bei Problemen:**
```
Kein Heartbeat?     → Task(esp32-debug) + Task(mqtt-debug)
Keine Sensor-Daten? → Task(esp32-debug) + Task(server-debug) + Task(mqtt-debug)
DB leer?            → Task(server-debug)
UI zeigt nichts?    → Task(frontend-debug)
```

**Output:** `.claude/reports/current/HW_TEST_PHASE_VERIFY.md` (Check-Tabelle mit PASS/FAIL pro Check)

### Phase 5: Stabilitaetstest

**Wer:** `hardware-test` Skill → delegiert an `auto-ops` (Rolle 5, Aufruf 3)

**Was passiert:**
Bash Polling-Loop mit 6 Iterationen (je 5 Minuten Pause = 30 Min total):
```
Pro Iteration:
  1. Server Health Check
  2. Sensor-Daten der letzten 5 Min aus DB
  3. Heartbeat-Check (einmalig, -C 1 -W 10)
  4. Werte gegen Expected Ranges pruefen
  5. Zwischen-Ergebnis loggen
```
Nach Loop: Statistik berechnen (Min/Max/Avg/StdDev pro Sensor)

**Output:** `.claude/reports/current/HW_TEST_PHASE_STABILITY.md` (Iteration-Tabelle, Statistik, Out-of-Range Events)

### Phase 6: Meta-Analyse + Final Report

**Wer:** `hardware-test` Skill → delegiert an `auto-ops` (Rolle 5, Aufruf 4) → delegiert an `meta-analyst`

**Was passiert:**
1. `meta-analyst` liest ALLE `HW_TEST_*.md` Reports
2. Cross-Report-Korrelation: Timestamps, Kausalketten, Widersprueche
3. Final Report mit Scorecard generieren

**Output:**
- `.claude/reports/current/HW_TEST_META_ANALYSIS.md`
- `.claude/reports/current/HW_TEST_FINAL_REPORT.md` (Scorecard: 10 Checks PASS/FAIL + Sensor-Statistik + Ergebnis)

---

## 4. Datenfluss-Diagramm

```
User: "hw-test --profile sht31_basic"
         │
         ▼
┌──────────────────────────┐
│  hardware-test SKILL     │  Phase 0: Profil laden + validieren
│  (Orchestrator)          │  Phase 1: system-control → Briefing
│                          │
│  Ruft auto-ops 4x auf:  │
└──────┬───────────────────┘
       │
       ├── Phase 2 ──► auto-ops (Rolle 5) ──► Python API Client ──► God-Kaiser REST API
       │                                        │
       │                                        ├── POST /esp/devices (Register)
       │                                        ├── POST /esp/devices/{id}/approve
       │                                        ├── POST /sensors/{id}/{gpio} (je Sensor)
       │                                        ├── POST /actuators/{id}/{gpio} (je Aktor)
       │                                        └── POST /zone/devices/{id}/assign
       │
       ├── Phase 3 ──► Robin verkabelt (PAUSE)
       │
       ├── Phase 4 ──► auto-ops (Rolle 5) ──► mosquitto_sub (MQTT Checks)
       │                    │                  ├── Heartbeat pruefen
       │                    │                  ├── Sensor-Daten pruefen
       │                    │                  ├── DB SELECT (Persistenz)
       │                    │                  └── Grafana API (Alerts)
       │                    │
       │                    └── Bei Fehler ──► Task(esp32-debug)
       │                                      Task(server-debug)
       │                                      Task(mqtt-debug)
       │                                      Task(frontend-debug)
       │
       ├── Phase 5 ──► auto-ops (Rolle 5) ──► 6x Polling (30 Min)
       │                                        ├── Health Check
       │                                        ├── Sensor-Daten aus DB
       │                                        ├── Heartbeat Check
       │                                        └── Range Validation
       │
       └── Phase 6 ──► auto-ops (Rolle 5) ──► Task(meta-analyst) ──► Final Report
```

---

## 5. Report-Kette

```
Phase 0:  [keine Datei, nur Konsolen-Output]
Phase 1:  SESSION_BRIEFING.md
Phase 2:  HW_TEST_PHASE_SETUP.md
Phase 3:  [keine Datei, Robin-Bestaetigung]
Phase 4:  HW_TEST_PHASE_VERIFY.md
          + optional: HW_TEST_ESP32_DEBUG.md
          + optional: HW_TEST_SERVER_DEBUG.md
          + optional: HW_TEST_MQTT_DEBUG.md
          + optional: HW_TEST_FRONTEND_DEBUG.md
Phase 5:  HW_TEST_PHASE_STABILITY.md
Phase 6:  HW_TEST_META_ANALYSIS.md
          HW_TEST_FINAL_REPORT.md

Alle in: .claude/reports/current/
```

**Persistent State:** `.claude/reports/current/HW_TEST_STATE.json`
- Wird nach jeder Phase aktualisiert
- Ermoeglicht Resume bei Abbruch (springe zur letzten nicht-abgeschlossenen Phase)

---

## 6. Entscheidungslogik: Python-Framework vs. curl

| Phase | Methode | Warum |
|-------|---------|-------|
| Phase 2 (Setup) | **Python-Framework** (`run_autoops()`) | Einzelner Aufruf erledigt Register + Approve + Sensors + Actuators + Zone. Retry mit Backoff eingebaut. |
| Phase 4 (Verify) | **curl + mosquitto_sub** | Einzelne Checks (Health, MQTT, DB, Grafana). Schnell, direkt, kein Framework noetig. |
| Phase 5 (Stability) | **curl + mosquitto_sub** | Polling-Loop mit Sleep. Leichtgewichtig. |
| Phase 6 (Meta) | **Agent-Delegation** | meta-analyst liest Reports, kein API-Call noetig. |

**Fallback:** Wenn Python-Framework nicht verfuegbar (Import-Fehler), nutze curl fuer alles.

---

## 7. Sensor-Typ-Pipeline (ESP32 → DB)

```
ESP32 Firmware (sensor_registry.cpp)
│
│  Registrierte Typen: ds18b20, sht31, bmp280, bme280, ph, ec, moisture
│
├── Sensor-Driver liest Hardware aus
│   ├── OneWire: DS18B20 (GPIO 4, Pull-Up noetig)
│   ├── I2C: SHT31/BMP280/BME280 (GPIO 21=SDA, 22=SCL)
│   └── Analog: pH/EC/Moisture (ADC1-Pins: 32-39)
│
├── MQTT Publish: kaiser/god/esp/{id}/sensor/{gpio}/data
│   Payload: { sensor_type, raw_value, processed_value, quality, timestamp, unit }
│
├── Server Handler: sensor_handler verarbeitet Payload
│   ├── Validierung
│   ├── Processing (pi_enhanced)
│   └── DB Write: INSERT INTO sensor_data (esp_id, gpio, raw_value, processed_value, ...)
│
├── DB Table: sensor_data
│   Columns: id, esp_id (UUID FK→esp_devices), gpio, sensor_type,
│            raw_value, processed_value, quality, timestamp
│
├── WebSocket Broadcast: sensor_data Event
│
└── Frontend: Pinia Store → Dashboard Card zeigt Wert
```

---

## 8. DB-Schema (F4-relevant)

| Tabelle | Key Columns | FK | Rolle |
|---------|------------|-----|-------|
| `esp_devices` | id (UUID PK), device_id (string), status, last_seen | — | Device-Registry |
| `sensor_configs` | id, esp_id, gpio, sensor_type, interface_type | esp_id → esp_devices.id | Sensor-Konfiguration |
| `actuator_configs` | id, esp_id, gpio, actuator_type | esp_id → esp_devices.id | Aktor-Konfiguration |
| `sensor_data` | id, esp_id, gpio, raw_value, processed_value, quality, timestamp | esp_id → esp_devices.id | Messwerte |
| `actuator_history` | id, esp_id, gpio, command, timestamp | esp_id → esp_devices.id | Aktor-Befehle |
| `esp_heartbeat_logs` | id, esp_id, device_id, timestamp | esp_id → esp_devices.id | Heartbeat-Log |

**WICHTIG:** Alle Child-Tables nutzen `esp_id` (UUID) als FK. Queries mit device_id (String) muessen JOINen:
```sql
SELECT sd.* FROM sensor_data sd
JOIN esp_devices e ON sd.esp_id = e.id
WHERE e.device_id = 'ESP_AABBCCDD'
```

---

## 9. Trigger und Aufrufmoeglichkeiten

| Aufruf | Effekt |
|--------|--------|
| `/hardware-test` | Skill aktiviert, fragt nach Profil |
| `hw-test --profile sht31_basic` | Skill aktiviert, laedt Profil direkt |
| "Hardware-Test mit SHT31" | Skill aktiviert, matcht auf `sht31_basic` |
| "sensor testen" | Skill aktiviert, listet Profile auf |
| `/ops` → dann F4-Kontext | auto-ops erkennt Rolle 5 |

---

## 10. Sicherheitsregeln

| Aktion | Erlaubt? |
|--------|----------|
| Logs lesen, DB-SELECTs, Loki-Queries | Frei |
| `pio run` (Build only) | Frei |
| mosquitto_sub mit `-C` und `-W` | Frei (IMMER mit Timeout!) |
| Reports schreiben | Frei |
| `pio run -t upload` (Flash) | **FRAGEN** |
| `docker compose restart` | **FRAGEN** |
| DELETE/TRUNCATE auf DB | **FRAGEN** |
| `docker compose down -v` | **NIEMALS** |
| `rm -rf`, `git push --force` | **NIEMALS** |

---

## 11. Zusammenspiel der Komponenten

```
                    ┌─────────────────────────────┐
                    │     hardware-test SKILL      │
                    │   (Regisseur: 6 Phasen)      │
                    └──────────┬──────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                     │
          ▼                    ▼                     ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
   │ system-ctrl  │   │  auto-ops    │   │  meta-analyst    │
   │ (Briefing)   │   │ (Rolle 5)    │   │ (Report-Compare) │
   │  Phase 1     │   │ Phase 2,4,5  │   │  Phase 6         │
   └──────────────┘   └──────┬───────┘   └──────────────────┘
                              │
                     ┌────────┼────────┐
                     │        │        │
                     ▼        ▼        ▼
             ┌───────────┐ ┌────────┐ ┌──────────────┐
             │ Python    │ │  curl  │ │ Debug-Agents │
             │ Framework │ │  MQTT  │ │ (bei Fehler) │
             │ (Phase 2) │ │(Ph4-5) │ │   Phase 4    │
             └─────┬─────┘ └────────┘ └──────┬───────┘
                   │                          │
                   ▼                          ├── esp32-debug
           ┌──────────────┐                   ├── server-debug
           │ God-Kaiser   │                   ├── mqtt-debug
           │ REST API     │                   └── frontend-debug
           │ (Port 8000)  │
           └──────┬───────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌────────┐  ┌─────────┐  ┌──────────┐
│ PostgreSQL│ │  MQTT   │  │ Frontend │
│ (DB)    │  │ Broker  │  │ (Vue 3)  │
└────────┘  └────┬────┘  └──────────┘
                  │
                  ▼
            ┌──────────┐
            │  ESP32   │
            │ (echte   │
            │ Hardware) │
            └──────────┘
```

---

## 12. Plugin-Cache-Synchronisation

Claude Code liest Agent/Skill-Dateien aus dem **Plugin-Cache**, nicht direkt aus dem Source:

| Source (editierbar) | Cache (gelesen von Claude Code) |
|--------------------|---------------------------------|
| `.claude/local-marketplace/auto-ops/` | `~/.claude/plugins/cache/automationone-local/auto-ops/2.0.0/` |

**Regel:** Bei jeder Aenderung an Plugin-Dateien muessen Source UND Cache aktualisiert werden. Sonst arbeiten Agents mit veralteten Anweisungen.

---

## 13. Abgrenzung zu anderen Flows

| Flow | Zweck | Unterschied zu F4 |
|------|-------|-------------------|
| F1: Mock-ESP-Setup | Software-only, simulierte Hardware | Kein echtes ESP32, kein Verkabeln |
| F2: Wokwi-Simulation | Virtuelle ESP32-Tests | Kein physischer Sensor, Wokwi-CLI |
| F3: Full-Stack-Diagnose | System-Gesundheitscheck | Keine Hardware-Verifikation |
| **F4: Hardware-Test** | **Echte Hardware E2E** | **Physische Sensoren, Flash, Verkabeln** |

---

## 14. Typischer Ablauf (Beispiel: SHT31)

```
Robin:  "hw-test --profile sht31_basic"

Phase 0: Profil geladen. SHT31 auf GPIO 21 (I2C). Board: ESP32_WROOM.
         Validierung: PASS (0 Fehler).
         Stack: 4/4 Container laufen. Server OK. MQTT OK. DB OK.
         "Ist die Firmware aktuell?" → Robin: "Ja"
         "Voraussetzungen erfuellt?" → Robin: "Ja"

Phase 1: system-control erstellt SESSION_BRIEFING.md

Phase 2: auto-ops registriert Device "HW-Test-SHT31"
         → POST /esp/devices → Approve → Add Sensor (SHT31, GPIO 21, I2C, 0x44)
         → Assign Zone "Test-Zone" → Config Push → config_response empfangen
         → HW_TEST_PHASE_SETUP.md geschrieben

Phase 3: "Bitte SHT31 verkabeln: SDA→GPIO21, SCL→GPIO22, VCC→3.3V, GND→GND.
          4.7kOhm Pull-Up empfohlen."
         → Robin: "fertig"

Phase 4: Heartbeat empfangen (12s). Sensor-Daten: 3 Messages in 45s.
         DB: 3 Eintraege in sensor_data. Grafana: keine Alerts.
         → HW_TEST_PHASE_VERIFY.md: alle Checks PASS

Phase 5: 6x Polling ueber 30 Min.
         Temp: Min=21.3, Max=22.8, Avg=22.1, StdDev=0.4 → In Range (10-50°C)
         Humidity: Min=44.2, Max=48.7, Avg=46.1, StdDev=1.3 → In Range (20-95%)
         → HW_TEST_PHASE_STABILITY.md: PASS

Phase 6: meta-analyst: Keine Widersprueche, Pipeline konsistent.
         → HW_TEST_FINAL_REPORT.md: BESTANDEN (10/10 Checks PASS)
```
