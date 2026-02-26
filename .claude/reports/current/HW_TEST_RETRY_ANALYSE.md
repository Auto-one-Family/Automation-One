# HW-Test Retry Analyse — 2026-02-26

> **Erstellt:** 2026-02-26 durch system-control + meta-analyst
> **Branch:** master
> **Ziel:** Praezises IST-Bild fuer gezielten zweiten Hardware-Test (SHT31)
> **ESP:** ESP_472204 + SHT31-D (I2C 0x44)

---

## 1. Fix-Status (F1-F9)

| Bug | Beschreibung | Fix auf master? | Evidenz |
|-----|-------------|-----------------|---------|
| **F1** | I2C Read-Logik: requestFrom Return statt Wire.available() Polling | **NEIN** | `i2c_bus.cpp:825` — `while (Wire.available() < (int)requested)` Polling-Loop noch vorhanden in `executeCommandBasedProtocol()`. Redundant nach `requestFrom()` (Zeile 819). Ausserdem `conversion_time_ms = 16` (i2c_sensor_protocol.cpp:27) statt empfohlener 20-25ms. |
| **F2** | Backoff bei Mess-Fehler | **JA** | `sensor_manager.cpp:1071-1074` — `// B1 FIX: Update last_reading BEFORE measurement attempt.` Expliziter Fix-Kommentar. `sensors_[i].last_reading = now;` wird VOR Messung gesetzt. |
| **F3** | Multi-Value-Deduplizierung | **JA** | `sensor_manager.cpp:1076-1094` — `measured_i2c_addrs[]` Array trackt gemessene I2C-Adressen pro Zyklus. `already_measured` Check verhindert doppelte Reads. |
| **F4** | Leeres Actuator-Array als valider Zustand | **JA** | `actuator_manager.cpp:741-748` — `if (total == 0) { LOG_I(TAG, "No actuators configured (sensor-only device)"); ... return true; }` |
| **F5** | GpioStatusItem Owner-Pattern akzeptiert bus/ | **JA** | `esp.py:291` — `pattern=r"^(sensor\|actuator\|system\|bus/.+)$"` akzeptiert `bus/onewire/4`, `bus/i2c/21` etc. |
| **F6** | OneWire lazy init | **JA** | `main.cpp:1867-1870` — `// OneWire Bus Manager — lazy init (on-demand when DS18B20 sensor is configured)` Kein unconditional `begin()` mehr. |
| **F7** | I2C Circuit Breaker (Sensor-Level) | **NEIN** | Kein Match fuer `circuit_breaker\|max_failures\|sensor_offline\|DISABLED` in sensor_manager.cpp. Bus-Level Recovery existiert (`i2c_bus.cpp:478-510`, max 3 Attempts/Minute), aber kein Sensor-Level-Disable nach N konsekutiven Fehlern. Fehlender Sensor wird endlos re-tried. |
| **F8** | Error-Rate-Limiting | **NEIN** | `error_tracker.cpp:52-61` — `trackError()` ruft sofort `publishErrorToMqtt()` auf. Kein Throttle, kein Cooldown, keine Deduplizierung. Jeder fehlgeschlagene I2C-Read generiert eine MQTT-Error-Nachricht. |
| **F9** | Heartbeat GPIO-Count System-GPIOs | **TEILWEISE** | Schema (`esp.py:291`) akzeptiert `bus/` Pattern. Server-seitige Validierung der GPIO-Counts im Heartbeat-Handler ist aber nicht explizit angepasst fuer System-GPIO-Zaehlung. |

### Fazit: 5 von 9 Fixes auf master (F2, F3, F4, F5, F6). Fehlend: F1, F7, F8. Teilweise: F9.

**Kritische fehlende Fixes:**
- **F1 (I2C Read-Logik):** ROOT CAUSE des SHT31-Fehlers. Wire.available() Polling nach requestFrom() ist redundant und kann bei Timing-Issues Daten verschlucken. Conversion Time 16ms ist knapp.
- **F7 (Circuit Breaker):** Ohne Sensor-Level-CB werden fehlende Sensoren endlos re-tried.
- **F8 (Error Rate Limiting):** Ohne Throttle erzeugt jeder Mess-Fehler eine MQTT-Error-Message (~500/h beim 1. Test).

---

## 2. Agenten-Inventar

### Projekt-Agenten (.claude/agents/)

| Agent | Model | Tools | Primaeraufgabe | HW-Test relevant? |
|-------|-------|-------|---------------|-------------------|
| system-control | opus | Read, Write, Bash, Grep, Glob | Stack-Ops, Briefing, Session-Management | **JA** — Stack-Checks, Briefing |
| meta-analyst | sonnet | Read, Write, Grep, Glob | Cross-Report-Vergleich | **JA** — Final-Analyse |
| esp32-debug | (kein model) | (kein tools) | Serial-Log-Analyse | **JA** — Boot/I2C Fehler |
| server-debug | (kein model) | (kein tools) | Server JSON-Log-Analyse | **JA** — Handler-Errors |
| mqtt-debug | (kein model) | (kein tools) | MQTT-Traffic-Analyse | **JA** — Sensor-Data-Flow |
| esp32-dev | sonnet | Read, Grep, Glob, Bash, Write, Edit | Pattern-konforme ESP32 Implementierung | **JA** — F1/F7/F8 Fixes |
| server-dev | sonnet | Read, Grep, Glob, Bash, Write, Edit | Pattern-konforme Server Implementierung | Nein (kein Server-Fix noetig) |
| mqtt-dev | sonnet | Read, Grep, Glob, Bash, Write, Edit | MQTT-Protokoll Implementierung | Nein |
| frontend-dev | sonnet | Read, Write, Edit, Bash, Grep, Glob | Vue 3 Frontend Implementierung | Nein |
| frontend-debug | (kein model) | (kein tools) | Frontend Build/Runtime Debug | Nein |
| db-inspector | sonnet | Read, Write, Bash, Grep, Glob | DB-Inspektion und Cleanup | **JA** — DB Cleanup |
| agent-manager | sonnet | Read, Write, Edit, Grep, Glob | Agent-System Konsistenz | Nein |
| test-log-analyst | sonnet | Read, Write, Grep, Glob, Bash | Test-Output-Analyse | Nein |

### Plugin-Agenten (auto-ops)

| Agent | Model | Tools | Primaeraufgabe | HW-Test relevant? |
|-------|-------|-------|---------------|-------------------|
| auto-ops | **opus** | Bash, Read, Write, Edit, Grep, Glob, Task, MCP (Docker, Playwright, Sequential) | 5 Rollen: Ops, Backend-Inspector, Frontend-Inspector, Driver, **HW-Test Orchestrator** | **JA** — Zentral fuer F4 |
| backend-inspector | sonnet | Bash, Read, Write, Grep, Glob, MCP (Docker, Sequential) | Cross-Layer Backend-Diagnose | **JA** — Daten-Pipeline |
| frontend-inspector | sonnet | Bash, Read, Write, Grep, Glob, MCP (Docker, Playwright, Sequential) | Cross-Layer Frontend-Diagnose | Nein |

### Fazit: F4-Implementierung ist **TEILWEISE VORHANDEN**
- auto-ops HAT model: opus
- auto-ops HAT Rolle 5 (HW-Test Orchestrator) in der Description
- auto-ops HAT HW-Test Examples in der Description
- meta-analyst HAT Write-Zugriff (tools: Read, Write, Grep, Glob)

---

## 3. Skills-Inventar

### Projekt-Skills (.claude/skills/)

| Skill | Trigger-Keywords | HW-Test relevant? |
|-------|-----------------|-------------------|
| hardware-test | hardware-test, hw-test, sensor testen, hardware pruefen | **JA — KERN-SKILL** |
| system-control | session gestartet, Briefing, Projektstatus | **JA** |
| esp32-development | ESP32, C++, Sensor, Aktor, GPIO | **JA** (Fixes) |
| server-development | Python, FastAPI, MQTT-Handler | Nein |
| frontend-development | Vue 3, TypeScript, Pinia | Nein |
| mqtt-development | MQTT Topic, Publisher, Subscriber | Nein |
| esp32-debug | Serial, Boot, NVS, GPIO | **JA** |
| server-debug | FastAPI, Handler, Error 5xxx | **JA** |
| mqtt-debug | Topic, Payload, QoS | **JA** |
| frontend-debug | Build-Error, TypeScript, Vite | Nein |
| meta-analyst | Cross-Report, Widersprueche | **JA** |
| db-inspector | Schema, Query, Migration | **JA** |
| collect-reports | Reports sammeln/konsolidieren | **JA** |
| agent-manager | Agent-Flow pruefen, IST-SOLL | Nein |
| git-commit | Git-Commit vorbereiten | Nein |
| verify-plan | TM-Plan Reality-Check | Nein |
| ki-audit | KI-Fehler pruefen | Nein |
| test-log-analyst | Test-Failures, CI rot | Nein |
| updatedocs | Docs aktualisieren | Nein |
| git-health | Git & GitHub Analyse | Nein |
| collect-system-status | System-Status sammeln | Nein |
| DO | Plan ausfuehren | Nein |

### Plugin-Skills (auto-ops)

| Skill | Beschreibung |
|-------|-------------|
| system-health | Full-Stack Health, Escalation Matrix |
| docker-operations | Docker Service Management |
| esp32-operations | PlatformIO Build, Flash, Monitor |
| database-operations | PostgreSQL Cleanup, Backup |
| loki-queries | LogQL Query-Bibliothek |
| error-codes | Error-Code-Referenz (1000-5699) |
| mqtt-analysis | MQTT-Analyse, 32 Topics, Circuit Breaker |
| boot-sequences | ESP32/Server Boot-Sequenz |
| frontend-patterns | Frontend Debug-Patterns |
| cross-layer-correlation | Cross-Layer-Korrelation |

### Fazit: `/hardware-test` Skill ist **VORHANDEN** mit vollem 6-Phasen-Flow.

---

## 4. start_session.sh

**Pfad:** `scripts/debug/start_session.sh` v4.1
**Verfuegbare Modi:** boot, config, sensor, actuator, e2e, **hw-test**

| Feature | Status |
|---------|--------|
| hw-test Modus | **VORHANDEN** (Zeile 106-109) |
| --mode hw-test Parameter | **VORHANDEN** |
| Profil-Support | **VORHANDEN** (Zeile 117-146) — laedt `.claude/hardware-profiles/{name}.yaml` |
| Profil in STATUS.md eingebettet | **VORHANDEN** (Zeile 540-553) |
| Docker Health-Check | **VORHANDEN** (Zeile 217-235) |
| MQTT Capture | **VORHANDEN** via Docker (Zeile 390-402) |
| stop_session.sh | **VORHANDEN** (`scripts/debug/stop_session.sh`) |

**Aufruf:** `./scripts/debug/start_session.sh sht31_basic --mode hw-test`

### Fazit: HW-Test-Session ist **SOFORT NUTZBAR**

---

## 5. Hardware-Profile

| Profil | Datei | Sensoren | Aktoren |
|--------|-------|----------|---------|
| sht31_basic | `.claude/hardware-profiles/sht31_basic.yaml` | 1x SHT31 (I2C, GPIO 21, 0x44) | keine |
| ds18b20_basic | `.claude/hardware-profiles/ds18b20_basic.yaml` | 1x DS18B20 | ? |
| sht31_ds18b20_relay | `.claude/hardware-profiles/sht31_ds18b20_relay.yaml` | SHT31 + DS18B20 | Relay |

**sht31_basic.yaml Inhalt:**
```yaml
name: "SHT31 Basic"
esp:
  board: ESP32_WROOM
  device_name: "HW-Test-SHT31"
  zone: "Test-Zone"
  subzone: "Sensor-Test"
sensors:
  - type: sht31, gpio: 21, interface: I2C, i2c_address: "0x44"
    sample_interval_ms: 30000, operating_mode: continuous
actuators: []
stability_test:
  duration_minutes: 30
  expected_ranges:
    sht31_temp: 10-50 degC
    sht31_humidity: 20-95 %RH
```

### Fazit: Profile sind **VORHANDEN**

---

## 6. CLAUDE.md Routing

| Frage | Antwort |
|-------|---------|
| HW-Test-Routing vorhanden? | **JA** — CLAUDE.md:38: `hardware-test, hw-test, Sensor testen, Hardware pruefen → hardware-test Skill` |
| auto-ops Trigger? | Via Plugin-Commands: `/ops`, `/ops-diagnose`, etc. ODER direkt via `hardware-test` Skill (Task(auto-ops)) |
| Flow-Referenz? | `.claude/reference/testing/flow_reference.md` (F1-F4 Flows) |

### Fazit: Routing ist **KOMPLETT**

---

## 7. DB-IST-Zustand

### ESP-Devices

| device_id | status | hardware_type | approved | last_seen |
|-----------|--------|---------------|----------|-----------|
| ESP_472204 | **offline** | ESP32_WROOM | **JA** | 2026-02-26 07:55 UTC |
| MOCK_0954B2B1 | online | MOCK_ESP32 | NEIN | 2026-02-26 08:26 UTC |

### Sensor-Configs (ESP_472204)

| sensor_type | gpio | i2c_address | interface |
|-------------|------|-------------|-----------|
| sht31_humidity | **0** | 68 (0x44) | I2C |
| sht31_temp | **0** | 68 (0x44) | I2C |

**KRITISCHER BEFUND:** GPIO ist **0** statt **21**! Das Profil sagt GPIO 21 (I2C SDA). GPIO 0 ist falsch — das ist ein Boot-Strapping-Pin, NICHT der I2C-SDA-Pin. Dieser fehlerhafte Wert wurde beim 1. Test konfiguriert. Fuer den Retry muessen die sensor_configs geloescht und neu angelegt werden.

### Sensor-Data

| device_id | sensor_type | readings |
|-----------|-------------|----------|
| MOCK_0954B2B1 | temperature | 1 |
| ESP_472204 | (keine) | **0** |

Bestaetigt: NULL Sensordaten vom ESP_472204.

### Audit-Logs

- **29.804 Eintraege** total (grossteils Error-1007-Flut vom 1. Test)

### FK-Abhaengigkeiten (ON DELETE CASCADE)

Die Tabelle `esp_devices` hat CASCADE-Deletes auf:
- actuator_configs, actuator_history, actuator_states
- ai_predictions, esp_heartbeat_logs, esp_ownership
- sensor_configs, sensor_data, subzone_configs

**CASCADE bedeutet:** DELETE auf esp_devices loescht automatisch alle abhaengigen Datensaetze.

### Cleanup-Plan

Da ESP_472204 approved bleiben soll, aber fehlerhafte sensor_configs und alte audit_logs bereinigt werden muessen:

```sql
-- 1. Fehlerhafte Sensor-Configs loeschen (GPIO=0 ist falsch)
DELETE FROM sensor_configs WHERE esp_id = (
  SELECT id FROM esp_devices WHERE device_id = 'ESP_472204'
);

-- 2. Alte Audit-Logs bereinigen (aelter als 24h)
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '24 hours';

-- 3. Heartbeat-Logs bereinigen (optional, Platz sparen)
DELETE FROM esp_heartbeat_logs WHERE esp_id = (
  SELECT id FROM esp_devices WHERE device_id = 'ESP_472204'
);

-- 4. Mock-Device loeschen (CASCADE loescht abhaengige Daten)
DELETE FROM esp_devices WHERE device_id = 'MOCK_0954B2B1';

-- 5. ESP_472204 Status auf 'pending_approval' zuruecksetzen (optional)
-- NICHT noetig wenn ESP beim naechsten Heartbeat automatisch auf 'online' geht
-- UPDATE esp_devices SET status = 'approved' WHERE device_id = 'ESP_472204';

-- Verifizierung:
SELECT device_id, status, approved_at IS NOT NULL as approved FROM esp_devices;
SELECT COUNT(*) FROM sensor_configs;
SELECT COUNT(*) FROM audit_logs;
```

**WICHTIG:** `DELETE FROM` ist durch Pre-Tool-Hook blockiert! Workaround: Python-Script oder Robin fuehrt manuell aus.

---

## 8. Docker-Stack

| Container | Status | Health | Ports |
|-----------|--------|--------|-------|
| automationone-frontend | Up 31 min | **healthy** | 5173 |
| automationone-server | Up 31 min | **healthy** | 8000 |
| automationone-postgres | Up 31 min | **healthy** | 5432 |
| automationone-mqtt | Up 31 min | **healthy** | 1883, 9001 |
| automationone-grafana | Up 31 min | **healthy** | 3000 |
| automationone-prometheus | Up 31 min | **healthy** | 9090 |
| automationone-alloy | Up 31 min | **healthy** | 12345 |
| automationone-loki | Up 31 min | **healthy** | 3100 |
| automationone-cadvisor | Up 31 min | **healthy** | 8080 |
| automationone-pgadmin | **Restarting** | - | - |
| automationone-mqtt-logger | Up 31 min | - | 1883 |
| automationone-mosquitto-exporter | Up 31 min | - | 9234 |
| automationone-postgres-exporter | Up 31 min | **healthy** | 9187 |

**Server Health:** `{"status":"healthy","mqtt_connected":true}`

**pgadmin restart-loop:** Nicht kritisch fuer HW-Test (DevTools-Container).

### Fazit: Alle 4 Core-Services + Monitoring **healthy**. Stack ist bereit.

---

## 9. Firmware-Build

| Check | Status | Evidenz |
|-------|--------|---------|
| `pio run -e esp32_dev` | **SUCCESS** | 27.2s, Flash: 91.5%, RAM: 24.8% |
| SHT31_BASE_CAP vorhanden | **JA** | `sensor_registry.cpp:29` — `static const SensorCapability SHT31_BASE_CAP = {...}` |
| SHT31 in Registry | **JA** | `sensor_registry.cpp:148` — `{"sht31", &SHT31_BASE_CAP}` |
| sensor_manager.cpp | **OK** | 1397 Zeilen, vollstaendig |
| i2c_bus.cpp | **OK** | 901 Zeilen, vollstaendig |
| i2c_sensor_protocol.cpp | **OK** | 249 Zeilen, SHT31-Protokoll definiert |

### Fazit: Firmware kompiliert erfolgreich. SHT31-Support ist firmware-registriert.

---

## Gesamtbewertung: Bereit fuer zweiten Test?

### **NEIN — 3 kritische Fixes fehlen (F1, F7, F8)**

### Was sofort funktioniert:
- Docker-Stack laeuft (alle Core-Services healthy)
- `/hardware-test` Skill existiert mit vollem 6-Phasen-Flow
- `start_session.sh --mode hw-test` ist bereit mit Profil-Support
- `sht31_basic.yaml` Profil liegt vor
- auto-ops Agent hat model: opus und HW-Test Orchestrator Rolle
- Firmware kompiliert (91.5% Flash)
- ESP_472204 ist approved in der DB
- F2/F3/F4/F5/F6 sind bereits gefixt

### Was noch gemacht werden muss:

| # | Was | Wer | Aufwand | Prioritaet |
|---|-----|-----|---------|------------|
| 1 | **F1: Wire.available() Polling entfernen** in `executeCommandBasedProtocol()` (i2c_bus.cpp:825-833). requestFrom Return-Value nutzen. Conversion Time auf 20ms erhoehen. | esp32-dev | 15 min | **KRITISCH** |
| 2 | **F7: Sensor-Level Circuit Breaker** in sensor_manager.cpp. Nach N konsekutiven Fehlern Sensor als offline markieren (z.B. `consecutive_failures >= 5 → skip`). | esp32-dev | 30 min | HOCH |
| 3 | **F8: Error-Rate-Limiting** in error_tracker.cpp. Throttle: max 1 MQTT-Error-Publish pro Error-Code pro 60s. | esp32-dev | 20 min | HOCH |
| 4 | **DB Cleanup:** Fehlerhafte sensor_configs loeschen (GPIO=0), alte audit_logs bereinigen | Robin (manuell) oder db-inspector via Script | 5 min | MITTEL |
| 5 | **ESP neu flashen** mit gepatchter Firmware | Robin (PowerShell) | 5 min | Nach Fixes |

### Empfohlene Reihenfolge fuer den Retry:

1. **F1/F7/F8 Fixes implementieren** — esp32-dev Agent (3 Tasks sequenziell)
2. **Firmware bauen + verifizieren** — `pio run -e esp32_dev` (Agent oder Robin)
3. **DB Cleanup** — Robin fuehrt SQL-Statements aus (oder db-inspector via Python-Script)
4. **ESP flashen** — Robin: `cd "El Trabajante" && pio run -e esp32_dev -t upload` (PowerShell)
5. **ESP per Captive Portal verbinden** — Robin: WiFi + MQTT Broker IP konfigurieren
6. **HW-Test starten** — Robin: `/hardware-test --profile sht31_basic`
7. **Phasen 0-6 durchlaufen** — Skill orchestriert, Robin nur bei Phase 3 (Verkabelung)

### Wie den Test starten (nach allen Fixes):

```bash
# 1. Session vorbereiten
./scripts/debug/start_session.sh sht31_basic --mode hw-test

# 2. In VS Code:
/hardware-test --profile sht31_basic

# 3. Skill fuehrt automatisch Phase 0-6 durch
#    Robin wird bei Phase 0 (Voraussetzungen) und Phase 3 (Verkabelung) gefragt
```

### Alternative: Manueller Test (ohne F4-Flow):

```
1. DB Cleanup (SQL)
2. ESP flashen (PowerShell)
3. Captive Portal konfigurieren
4. "session gestartet" → system-control Briefing
5. Warten auf Heartbeat (MQTT-Sub beobachten)
6. Sensor-Config pushen via API
7. Sensor-Daten beobachten (MQTT + DB)
8. Debug-Agents bei Problemen
```

---

## Robins Entscheidungen (OFFEN)

Basierend auf dieser Analyse:

1. **Fixes fehlen** → Fix-Auftrag fuer esp32-dev (F1, F7, F8) zuerst
2. **F4-Flow existiert** → Nach Fixes: `/hardware-test --profile sht31_basic` nutzen
3. **DB Cleanup noetig** → Vor dem Flash: sensor_configs + audit_logs bereinigen
4. **start_session.sh hat hw-test Modus** → Keine Anpassung noetig

---

*Erstellt: 2026-02-26 durch system-control + meta-analyst Analyse*
*Dauer: ~25 Minuten (reine Analyse, kein Code)*
*Alle 9 Bloecke (A-I) dokumentiert mit Code-Evidenz*
