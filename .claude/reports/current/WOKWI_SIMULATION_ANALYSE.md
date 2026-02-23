# Wokwi-Simulation Komplett-Analyse & Verifikation

**Datum:** 2026-02-23
**Branch:** feature/frontend-consolidation
**Auftrag:** Blocks A-G Wokwi-Infrastruktur auf Produktionsqualitaet bringen

---

## Executive Summary

173 Wokwi-Szenarien analysiert, 52 Core-Tests + 122 Nightly-Extended-Tests in CI integriert.
10 Error-Injection-YAMLs waren BEREITS korrekt (kein `set-control: mqtt` gefunden).
4 PWM-Szenarien hatten kritische Bugs (nicht-existierender String + LOG_DEBUG-Unsichtbarkeit).
CI-Pipeline um 6 Nightly-Jobs erweitert (concurrency, Mosquitto, I2C-Diagram-Fix).

---

## Block A: Grundlagen-Verifikation

### wokwi.toml
- **Status:** OK
- firmware = `.pio/build/wokwi_simulation/firmware.bin`
- gateway = true, rfc2217ServerPort = 4000, baud = 115200

### diagram.json (Standard)
- **Status:** OK — 11 Parts
- esp (ESP32 DevKit), temp1 (DS18B20 GPIO4), led1 (green GPIO5), dht22 (GPIO15)
- pot_analog (GPIO34), led_red (GPIO13), led_blue (GPIO14), btn_emergency (GPIO27)
- 3x Resistors

### diagram_i2c.json
- **Status:** OK — SHT31 (SDA=GPIO21, SCL=GPIO22), BME280, DS18B20, LED status

### diagram_extended.json
- **Status:** OK — Extra led2 (GPIO18), btn_boot (GPIO0), dht1

### Szenario-Zaehlung (173 total)
| Kategorie | Anzahl | In Core-CI | Nightly |
|-----------|--------|-----------|---------|
| 01-boot | 2 | 2 | 0 |
| 02-sensor | 5 | 5 | 0 |
| 03-actuator | 7 | 7 | 0 |
| 04-zone | 2 | 2 | 0 |
| 05-emergency | 3 | 3 | 0 |
| 06-config | 2 | 2 | 0 |
| 07-combined | 2 | 2 | 0 |
| 08-i2c | 20 | 5 | 15 |
| 08-onewire | 29 | 0 | 29 |
| 09-hardware | 9 | 0 | 9 |
| 09-pwm | 18 | 3 | 15 |
| 10-nvs | 40 | 5 | 35 |
| 11-error-injection | 10 | 10 | 0 |
| gpio | 24 | 5 | 19 |
| **Total** | **173** | **52** | **122** |

---

## Block B: wait-serial String-Verifikation

### Kritische Findings

1. **"Boot started" existiert NICHT in Firmware**
   - Verwendet in: 4 PWM-Szenarien (pwm_init_success, pwm_init_config, pwm_frequency_change, pwm_resolution_verify)
   - Kein `grep -r "Boot started" El Trabajante/src/` Match
   - **Fix:** Ersetzt durch `"ESP32 Sensor Network"` (tatsaechliches Boot-Banner, main.cpp:148)

2. **LOG_DEBUG Strings unsichtbar bei CORE_DEBUG_LEVEL=3**
   - `"PWM Config: Channels=16, Freq=1000Hz, Resolution=12 bits"` (pwm_controller.cpp:41-43)
   - `wokwi_simulation` erbt von `esp32_dev` mit `-DCORE_DEBUG_LEVEL=3` (INFO)
   - LOG_DEBUG = Level 4, unsichtbar bei Level 3
   - **Fix:** Ersetzt durch LOG_INFO Aequivalente: `"Channels: 16"`, `"Default Frequency: 1000 Hz"`, `"Default Resolution: 12 bits"` (pwm_controller.cpp:63-65)

3. **gpio_boot_first.yaml Reihenfolge-Bug**
   - `wait-serial` ist sequenziell — sucht ab aktueller Position vorwaerts
   - YAML hatte Phase 2 VOR Phase 1, aber Phase 1 erscheint VOR Phase 2 im Serial
   - **Fix:** Phase 1 und Phase 2 Schritte getauscht

### Verifizierte Strings (alle OK)
- Boot-Phasen: Phase 1-5 READY
- MQTT: "MQTT connected", "MQTT connected successfully"
- Heartbeat: "Initial heartbeat sent", "heartbeat"
- Config: "ConfigResponse published", "Failed to parse"
- Emergency: "BROADCAST EMERGENCY-STOP RECEIVED", "EMERGENCY-CLEAR"
- GPIO: "GPIO SAFE-MODE INITIALIZATION", "Safe-Mode initialization complete", "Board Type:", "Available Pins:", "Reserved Pins:"
- NVS: "StorageManager: Initialized"
- PWM: "PWM Controller initialization started", "PWM Controller initialized successfully"
- I2C: "I2C Bus Manager initialized successfully"
- OneWire: "OneWire Bus Manager initialization started"

---

## Block C: Error-Injection Verifikation

### Ergebnis: ALLE 10 YAMLs BEREITS KORREKT

Keine einzige `set-control: mqtt` Zeile gefunden. Alle 10 Error-Injection-Szenarien verwenden ausschliesslich:
- `wait-serial` (passive Beobachtung)
- Externe MQTT-Injection via CI (Background-Pattern: wokwi-cli & + sleep + mosquitto_pub)

| Szenario | Pattern | Status |
|----------|---------|--------|
| error_sensor_timeout | wait-serial + CI MQTT inject | OK |
| error_mqtt_disconnect | wait-serial + CI MQTT inject | OK |
| error_gpio_conflict | wait-serial + CI MQTT inject | OK |
| error_watchdog_trigger | wait-serial + CI MQTT inject | OK |
| error_config_invalid_json | wait-serial + CI MQTT inject | OK |
| error_actuator_timeout | wait-serial + CI MQTT inject | OK |
| error_emergency_cascade | wait-serial + CI emergency_cascade.sh | OK |
| error_i2c_bus_stuck | wait-serial + CI MQTT inject | OK |
| error_nvs_corrupt | wait-serial + CI MQTT inject | OK |
| error_heap_pressure | wait-serial + CI MQTT inject (14 devices) | OK |

---

## Block D: CI Pipeline Fixes

### Aenderungen an .github/workflows/wokwi-tests.yml

1. **Concurrency Block hinzugefuegt** (verhindert parallele Runs)
   ```yaml
   concurrency:
     group: wokwi-tests-${{ github.ref }}
     cancel-in-progress: true
   ```

2. **I2C Core Tests (Job 13) gefixt**
   - Mosquitto MQTT Broker hinzugefuegt
   - diagram_i2c.json wird vor Tests kopiert
   - Restore Default Diagram nach Tests
   - Mosquitto Cleanup

3. **GPIO Core Tests (Job 12) gefixt**
   - Mosquitto MQTT Broker hinzugefuegt (fuer Phase 2 Boot)
   - Mosquitto Cleanup

4. **NVS Core Tests (Job 14) gefixt**
   - Mosquitto MQTT Broker hinzugefuegt (alle 5 Szenarien warten auf "MQTT connected successfully")
   - Mosquitto Cleanup

5. **PWM Core Tests (Job 15) komplett umgebaut**
   - Mosquitto MQTT Broker hinzugefuegt
   - `pwm_duty_percent_50`: Background-Pattern + MQTT-Injection (Config + SET 50%)
   - `pwm_resolution_verify`: Background-Pattern + MQTT-Injection (Config + SET 50%)
   - `pwm_frequency_change`: Bleibt passiv (nur Boot-Verifikation)
   - Timeout von 12 auf 15 Minuten erhoeht

6. **6 Nightly-Extended-Jobs hinzugefuegt**
   - `nightly-i2c-extended`: 15 Szenarien (I2C Diagram + Mosquitto)
   - `nightly-onewire-extended`: 29 Szenarien
   - `nightly-hardware-extended`: 9 Szenarien
   - `nightly-pwm-extended`: 15 Szenarien
   - `nightly-nvs-extended`: 35 Szenarien
   - `nightly-gpio-extended`: 19 Szenarien
   - Alle mit `if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`
   - Alle mit Mosquitto, Loop-Pattern, Pass/Fail-Zaehlung
   - Core-Tests werden per SKIP-Liste uebersprungen

### CI-Strategie
- **PR/Push:** 52 Core-Szenarien (16 Jobs, schnelles Feedback)
- **Nightly 03:00 UTC:** Alle 173 Szenarien (22 Jobs + Summary)
- **Manual:** Alle 173 Szenarien (workflow_dispatch)

---

## Block E: Logging

### Log-Verzeichnisse
| Pfad | Status |
|------|--------|
| `logs/wokwi/` | Existiert (mit alten Logs) |
| `logs/wokwi/serial/` | Existiert |
| `logs/wokwi/reports/` | Existiert |
| `logs/wokwi/mqtt/` | Existiert |
| `logs/wokwi/error-injection/` | **NEU erstellt** |

---

## Block F: Branch-Analyse

- **Aktueller Branch:** `feature/frontend-consolidation`
- **Wokwi-relevante Commits:** Alle auf diesem Branch (wokwi-tests.yml, error-injection YAMLs, Makefile)
- **Cherry-Pick noetig:** NEIN — alle Aenderungen sind auf dem aktiven Branch
- **Merge-Konflikte:** Keine erwartet fuer Wokwi-Dateien

---

## Makefile Fixes

1. **`wokwi-seed`:** `docker exec -it` → lokales `.venv/Scripts/python.exe` (Script nicht im Container gemountet)
2. **`wokwi-test-full`:** Help-Text praezisiert ("22 passive tests")
3. **NEU `wokwi-test-all`:** Alle 173 Szenarien im Loop mit Pass/Fail-Zaehlung
4. **NEU `wokwi-test-error-injection`:** 10 Error-Injection-Szenarien

---

## Offene Punkte / Naechste Schritte

1. **MQTT-Injection fuer Nightly-Szenarien:** Einige erweiterte Szenarien (z.B. `onewire_mqtt_scan_command`, `pwm_e2e_*`) benoetigen MQTT-Injection im Background-Pattern. Diese werden im Nightly-Loop derzeit als FAIL gewertet.
2. **CI-Run verifizieren:** Ein manueller `workflow_dispatch` Run sollte alle 22 Jobs testen.
3. **Wokwi Pro Budget:** 2000 CI-Minuten/Monat. Nightly mit allen 173 Szenarien ~= 4-5h. Budget fuer ~13 Nightly-Runs/Monat.
4. **Lokaler Testlauf:** `make wokwi-test-quick` zur Basisverifikation empfohlen.

---

## Geaenderte Dateien (Zusammenfassung)

| Datei | Aenderung |
|-------|-----------|
| `.github/workflows/wokwi-tests.yml` | Concurrency, Mosquitto fuer GPIO/NVS/I2C/PWM, PWM MQTT-Injection, 6 Nightly-Jobs |
| `El Trabajante/tests/wokwi/scenarios/09-pwm/pwm_init_success.yaml` | "Boot started" → "ESP32 Sensor Network", LOG_DEBUG entfernt |
| `El Trabajante/tests/wokwi/scenarios/09-pwm/pwm_init_config.yaml` | "Boot started" → "ESP32 Sensor Network", LOG_DEBUG → LOG_INFO |
| `El Trabajante/tests/wokwi/scenarios/09-pwm/pwm_frequency_change.yaml` | "Boot started" → "ESP32 Sensor Network", LOG_DEBUG entfernt |
| `El Trabajante/tests/wokwi/scenarios/09-pwm/pwm_resolution_verify.yaml` | "Boot started" → "ESP32 Sensor Network", LOG_DEBUG entfernt |
| `El Trabajante/tests/wokwi/scenarios/gpio/gpio_boot_first.yaml` | Phase 1/Phase 2 Reihenfolge gefixt |
| `Makefile` | wokwi-seed lokal, neue Targets (wokwi-test-all, wokwi-test-error-injection) |
| `logs/wokwi/error-injection/.gitkeep` | Neues Verzeichnis |
