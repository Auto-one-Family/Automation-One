# Wokwi-Erstanalyse - Gesamtbericht

> **Version:** 1.0
> **Datum:** 2026-02-23
> **Typ:** Analyse-Only (keine Fixes)
> **Autor:** Claude (Wokwi-Erstanalyse-Auftrag)

---

## Executive Summary

Das Wokwi-Testsystem von AutomationOne ist **architektonisch solide konzipiert**, aber in **zwei von drei Hauptbereichen** operativ gebrochen:

| Bereich | Status | Kern-Problem |
|---------|--------|--------------|
| **Konfiguration** (wokwi.toml, diagram.json, platformio.ini) | OK | Korrekt und konsistent |
| **CI/CD Pipeline** (wokwi-tests.yml) | OK | Gut strukturiert, 23 Jobs |
| **YAML-Szenarien** (173 Dateien) | GEBROCHEN | 28 Dateien nutzen nicht-existentes `part-id: "mqtt"` |
| **Error-Injection** (11-error-injection/) | OK | Korrekte passive Architektur |
| **Serial-String-Matching** | OK | Alle Strings in Firmware verifiziert |
| **MQTT-Infrastruktur** | OK | Docker Mosquitto läuft, Ports korrekt |
| **Agent-Driven Testing** | TEILWEISE | Mapping existiert, kein dedizierter Agent |

**Zentrale Erkenntnis:** Die 10 Error-Injection-Szenarien sind korrekt implementiert (passives wait-serial + externes mosquitto_pub). Das `part-id: "mqtt"` Problem betrifft ausschließlich die Kategorien `gpio/` (20 Dateien) und `09-hardware/` (8 Dateien).

---

## Teil 1: Konfigurationsdateien

### 1.1 wokwi.toml

| Parameter | Wert | Status |
|-----------|------|--------|
| firmware | `.pio/build/wokwi_simulation/firmware.bin` | OK - matches platformio.ini |
| elf | `.pio/build/wokwi_simulation/firmware.elf` | OK |
| gateway | `true` | OK - required for MQTT |
| rfc2217ServerPort | `4000` | OK - for external serial access |
| baud | `115200` | OK - matches `monitor_speed` |

**Bewertung:** Vollständig und korrekt. Keine Probleme.

### 1.2 diagram.json

**11 Parts:**

| Part | Type | GPIO | Wiring |
|------|------|------|--------|
| esp | wokwi-esp32-devkit-v1 | - | Serial Monitor TX/RX |
| temp1 | wokwi-ds18b20 | D4 (DQ) | + 4.7k Pullup (r1) |
| dht22 | wokwi-dht22 | D15 (SDA) | VCC=3V3, GND |
| led1 (green) | wokwi-led | D5 | + 220R (r2) |
| led_red | wokwi-led | D13 | + 220R (r_led_red) |
| led_blue | wokwi-led | D14 | + 220R (r_led_blue) |
| pot_analog | wokwi-potentiometer | GPIO34 | ADC Input |
| btn_emergency | wokwi-pushbutton | D27 | Pulldown to GND |
| r1 | wokwi-resistor (4.7k) | - | DS18B20 Pullup |
| r2 | wokwi-resistor (220) | - | Green LED |
| r_led_red | wokwi-resistor (220) | - | Red LED |

**KRITISCH:** Es gibt **kein Part mit ID "mqtt"**. Dies ist die Ursache für 81 Fehler in 28 Szenario-Dateien (siehe Teil 2).

**Alternative Diagramme:**
- `tests/wokwi/diagrams/diagram_i2c.json` — SHT31 + BME280 (für I2C-Tests)
- `tests/wokwi/diagrams/diagram_extended.json` — erweitert

### 1.3 platformio.ini (Wokwi-relevante Environments)

| Environment | Extends | Key Flags | Zweck |
|-------------|---------|-----------|-------|
| `wokwi_simulation` | `esp32_dev` | `WOKWI_SIMULATION=1`, `WOKWI_WIFI_SSID="Wokwi-GUEST"`, `WOKWI_MQTT_HOST="host.wokwi.internal"`, `WOKWI_MQTT_PORT=1883`, `WOKWI_ESP_ID="ESP_00000001"` | Haupt-Simulations-Env |
| `wokwi_esp01` | `wokwi_simulation` | `WOKWI_ESP_ID="ESP_00000001"` | Multi-Device #1 |
| `wokwi_esp02` | `wokwi_simulation` | `WOKWI_ESP_ID="ESP_00000002"` | Multi-Device #2 |
| `wokwi_esp03` | `wokwi_simulation` | `WOKWI_ESP_ID="ESP_00000003"` | Multi-Device #3 |

**Bewertung:** Sauber strukturiert. `extends`-Kette korrekt. Multi-Device-Envs für paralleles Testen vorhanden.

**Hinweis:** `wokwi_esp01` definiert `WOKWI_ESP_ID` doppelt (einmal aus `wokwi_simulation`, einmal explizit). PlatformIO nimmt den letzten Wert — funktioniert, aber redundant.

---

## Teil 2: Szenario-Inventar

### 2.1 Gesamtübersicht (173 Szenarien, 14 Kategorien)

| Kategorie | Anzahl | Pattern | Status |
|-----------|--------|---------|--------|
| `01-boot/` | 2 | wait-serial | OK |
| `02-sensor/` | 5 | wait-serial | OK |
| `03-actuator/` | 7 | wait-serial | OK |
| `04-zone/` | 2 | wait-serial | OK |
| `05-emergency/` | 3 | wait-serial | OK |
| `06-config/` | 2 | wait-serial | OK |
| `07-combined/` | 2 | wait-serial | OK |
| `08-i2c/` | 20 | wait-serial | OK (nutzt diagram_i2c.json) |
| `08-onewire/` | 29 | wait-serial + set-control(temp1) | OK |
| `09-hardware/` | 9 | **set-control: part-id: "mqtt"** | GEBROCHEN (8 von 9) |
| `09-pwm/` | 18 | wait-serial | OK |
| `10-nvs/` | 40 | wait-serial | OK |
| `11-error-injection/` | 10 | wait-serial + delay (passiv) | OK |
| `gpio/` | 24 | **set-control: part-id: "mqtt"** | GEBROCHEN (20 von 24) |

### 2.2 Das `part-id: "mqtt"` Problem

**Fakten:**
- 81 Vorkommen von `set-control: part-id: "mqtt"` in 28 Dateien
- Verteilung: 20 Dateien in `gpio/`, 8 Dateien in `09-hardware/`
- `diagram.json` enthält **kein** Part mit ID "mqtt"
- Wokwi-CLI wird bei `set-control` auf nicht-existentes Part mit Fehler abbrechen

**Betroffene Dateien (gpio/ — 20 Dateien):**

| Datei | Vorkommen |
|-------|-----------|
| gpio_subzone_safe.yaml | 8 |
| gpio_integration_emergency.yaml | 5 |
| gpio_safe_mode_emergency.yaml | 5 |
| gpio_integration_actuator.yaml | 4 |
| gpio_edge_invalid_pin.yaml | 3 |
| gpio_reservation_release.yaml | 3 |
| gpio_reservation_invalid.yaml | 3 |
| gpio_reservation_owner.yaml | 3 |
| gpio_safe_mode_verify.yaml | 3 |
| gpio_subzone_conflict.yaml | 3 |
| gpio_subzone_assign.yaml | 3 |
| gpio_safe_mode_single.yaml | 3 |
| gpio_edge_multi_init.yaml | 2 |
| gpio_edge_strings.yaml | 2 |
| gpio_reservation_conflict.yaml | 2 |
| gpio_reservation_success.yaml | 1 |
| gpio_integration_sensor.yaml | 2 |
| gpio_integration_heartbeat.yaml | 2 |
| gpio_subzone_pins.yaml | 2 |
| gpio_edge_max_pins.yaml | 1 |

**Betroffene Dateien (09-hardware/ — 8 Dateien):**

| Datei | Vorkommen |
|-------|-----------|
| hw_reserved_pins.yaml | 5 |
| hw_pwm_config.yaml | 4 |
| hw_input_only_reject.yaml | 3 |
| hw_actuator_limit.yaml | 2 |
| hw_cross_board_constants.yaml | 2 |
| hw_sensor_limit.yaml | 2 |
| hw_safe_pins_verify.yaml | 2 |
| hw_i2c_config.yaml | 1 |

**NICHT betroffen:** `11-error-injection/` (alle 10 Szenarien nutzen korrekte passive Architektur)

### 2.3 Error-Injection Architektur (korrekt)

Alle 10 Error-Injection-Szenarien verwenden ein **passives Pattern:**

```yaml
# Pattern: wait-serial prüft Firmware-Output, delay gibt Zeit für externe Injection
- wait-serial: "MQTT connected"
- delay: 5000
# CI injiziert via: mosquitto_pub -t "auto-one/ESP_00000001/..." -m '...'
- wait-serial: "Expected response string"
```

| Szenario | Injections-Methode | Getestetes Verhalten |
|----------|--------------------|----------------------|
| error_sensor_timeout | Ghost GPIO 32 sensor | Sensor read failure handling |
| error_config_invalid_json | Malformed JSON payload | JSON parse error + error code |
| error_emergency_cascade | 5-step MQTT sequence (helper script) | Emergency lifecycle |
| error_gpio_conflict | 2 sensors on same GPIO | Conflict detection |
| error_heap_pressure | 14 device configs | Memory management under load |
| error_nvs_corrupt | factory_reset MQTT command | NVS recovery |
| error_mqtt_disconnect | Config + verify sequence | Post-reconnect state |
| error_i2c_bus_stuck | Ghost I2C device (0x44) | I2C bus error handling |
| error_actuator_timeout | Actuator ON command | Actuator timeout detection |
| error_watchdog_trigger | Load + emergency combo | Watchdog behavior |

### 2.4 Weitere Szenario-Patterns

| Pattern | Verwendung | Beispiel |
|---------|------------|---------|
| `wait-serial` (substring match) | ALLE Kategorien | `- wait-serial: "Phase 1: Core Infrastructure READY"` |
| `set-control: part-id: "temp1"` | 08-onewire/ | Temperatur-Simulation |
| `set-control: part-id: "pot_analog"` | 02-sensor/ | ADC-Wert setzen |
| `set-control: part-id: "btn_emergency"` | 05-emergency/ | Button-Press simulieren |
| `delay` | Überall | Wartezeiten zwischen Steps |
| `set-control: part-id: "mqtt"` | gpio/, 09-hardware/ | **GEBROCHEN** |

---

## Teil 3: CI/CD Pipeline

### 3.1 Workflow-Struktur (wokwi-tests.yml)

**23 Jobs total:**

| # | Job | Szenarien | Trigger |
|---|-----|-----------|---------|
| 0 | build-firmware | - | Immer (Artefakt für alle) |
| 1 | boot-tests | 2 (01-boot/) | PR + Push |
| 2 | sensor-tests | 5 (02-sensor/) | PR + Push |
| 3 | actuator-tests | 7 (03-actuator/) | PR + Push |
| 4 | mqtt-connection-test | 1 (legacy mqtt_connection.yaml) | PR + Push |
| 5 | zone-tests | 2 (04-zone/) | PR + Push |
| 6 | emergency-tests | 3 (05-emergency/) | PR + Push |
| 7 | config-tests | 2 (06-config/) | PR + Push |
| 8 | sensor-flow-tests | ~5 (02-sensor/ Subset) | PR + Push |
| 9 | actuator-flow-tests | ~7 (03-actuator/ Subset) | PR + Push |
| 10 | combined-flow-tests | 2 (07-combined/) | PR + Push |
| 11 | gpio-core-tests | ~5 (gpio/ Subset) | PR + Push |
| 12 | i2c-core-tests | ~5 (08-i2c/ Subset) | PR + Push |
| 13 | nvs-core-tests | ~5 (10-nvs/ Subset) | PR + Push |
| 14 | pwm-core-tests | ~5 (09-pwm/ Subset) | PR + Push |
| 15 | onewire-core-tests | ~5 (08-onewire/ Subset) | PR + Push |
| 16 | error-injection-tests | 10 (11-error-injection/) | PR + Push |
| 17 | gpio-extended-tests | 24 (gpio/ alle) | Nightly |
| 18 | i2c-extended-tests | 20 (08-i2c/ alle) | Nightly |
| 19 | nvs-extended-tests | 40 (10-nvs/ alle) | Nightly |
| 20 | pwm-extended-tests | 18 (09-pwm/ alle) | Nightly |
| 21 | onewire-extended-tests | 29 (08-onewire/ alle) | Nightly |
| 22 | test-summary | - | Immer (Report) |

**Trigger:** `push` (El Trabajante/**), `pull_request`, `schedule` (cron: 0 2 * * *, nightly), `workflow_dispatch`

### 3.2 Mosquitto-Strategie in CI

```yaml
# Per-Job Docker-Container (nicht Service-Container):
docker run -d --name mosquitto -p 1883:1883 eclipse-mosquitto:2
# + Inline mosquitto.conf mit allow_anonymous true
```

**Warum kein Service-Container?** Jeder Job braucht einen frischen Broker. Docker-Run gibt volle Kontrolle über Lifecycle.

### 3.3 Error-Injection in CI (Job 16)

```bash
# 1. Wokwi im Background starten
wokwi-cli . --timeout $TIMEOUT --serial-log-file $LOG &
WOKWI_PID=$!

# 2. Smart Wait für MQTT (nicht fester Sleep!)
for i in $(seq 1 60); do
    if grep -q "MQTT connected" "$LOG"; then break; fi
    sleep 1
done

# 3. MQTT Injection
mosquitto_pub -t "auto-one/ESP_00000001/sensor/ghost_temp/command" -m '...'

# 4. Serial-Log prüfen
grep -q "Expected error string" "$LOG"
```

**Bewertung:** Gut implementiert. Smart-Wait statt Sleep. Background-PID-Tracking.

### 3.4 Besonderheiten

- **I2C-Tests:** Tauschen `diagram.json` gegen `diagram_i2c.json` (SHT31 + BME280 statt DS18B20)
- **Legacy-Test:** `mqtt_connection.yaml` liegt NICHT in `scenarios/` sondern direkt in `tests/wokwi/`
- **Firmware-Artefakt:** Build-once, download per Job (effizient)
- **Concurrency:** Enabled (neuerer Run cancelt älteren auf gleicher Branch)

---

## Teil 4: Serial-String-Verifizierung

### 4.1 Boot-Phasen (alle verifiziert)

| Phase | String in YAML | Fundort in Firmware | Zeile |
|-------|----------------|---------------------|-------|
| Phase 1 | `Phase 1: Core Infrastructure READY` | main.cpp | 600 |
| Phase 2 | `Phase 2: Communication Layer READY` | main.cpp | 1804 |
| Phase 3 | `Phase 3: Hardware Abstraction READY` | main.cpp | 1869 |
| Phase 4 | `Phase 4: Sensor System READY` | main.cpp | 1915 |
| Phase 5 | `Phase 5: Actuator System READY` | main.cpp | 1954 |

### 4.2 MQTT & Connectivity

| String | Fundort | Zeile |
|--------|---------|-------|
| `MQTT connected successfully` | main.cpp | 778 |
| `WiFi connected successfully` | main.cpp | 690 |
| `Subscribed to system + actuator + zone + subzone + sensor + heartbeat-ack topics` | main.cpp | 827 |
| `Initial heartbeat sent for ESP registration` | main.cpp | 790 |
| `ConfigResponse published` | config_response.cpp | 48, 120 |

### 4.3 Error Handling

| String | Fundort | Zeile |
|--------|---------|-------|
| `Failed to parse sensor config JSON` | main.cpp | 2308 |
| `BROADCAST EMERGENCY-STOP RECEIVED` | main.cpp | 922 |
| `AUTHORIZED EMERGENCY-CLEAR TRIGGERED` | main.cpp | 889 |
| `FACTORY RESET via MQTT` | main.cpp | 955 |
| `GPIO SAFE-MODE INITIALIZATION` | gpio_manager.cpp | 80 |
| `de-energized` | gpio_manager.cpp | 295, 317 |

### 4.4 Error Codes

| Code | Konstante | Fundort |
|------|-----------|---------|
| 1002 | ERROR_GPIO_CONFLICT | error_codes.h |
| 1040 | ERROR_SENSOR_READ_FAILED | error_codes.h |
| - | JSON_PARSE_ERROR | error_codes.h (ConfigErrorCode enum) |
| - | GPIO_CONFLICT | error_codes.h (ConfigErrorCode enum) |

**Bewertung:** Alle von Szenarien referenzierten Serial-Strings existieren in der Firmware. Kein String-Mismatch gefunden.

---

## Teil 5: MQTT-Infrastruktur

### 5.1 Broker-Konfiguration

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Host (Wokwi) | `host.wokwi.internal` | platformio.ini Build-Flag |
| Host (CI) | `localhost` (Docker Mosquitto) | wokwi-tests.yml |
| Port | 1883 | platformio.ini Build-Flag |
| Auth | anonymous | CI Mosquitto Config |

**Lokaler Status:** Docker Mosquitto läuft (`0.0.0.0:1883->1883/tcp`, healthy)

### 5.2 ESP32 MQTT-Topics (Subscriptions)

| Topic-Pattern | Typ | Zweck |
|---------------|-----|-------|
| `auto-one/{esp_id}/system/command` | Sub | Systemkommandos (factory_reset, reboot) |
| `auto-one/{esp_id}/system/config` | Sub | Gerätekonfiguration |
| `auto-one/broadcast/emergency` | Sub | Broadcast Emergency-Stop |
| `auto-one/{esp_id}/actuator/+/command` | Sub (Wildcard) | Aktor-Steuerung |
| `auto-one/{esp_id}/emergency` | Sub | ESP-spezifischer Emergency |
| `auto-one/{esp_id}/zone/assign` | Sub | Zonen-Zuweisung |
| `auto-one/{esp_id}/subzone/assign` | Sub | Subzonen-Zuweisung |
| `auto-one/{esp_id}/subzone/remove` | Sub | Subzonen-Entfernung |
| `auto-one/{esp_id}/sensor/+/command` | Sub (Wildcard) | Sensor-Konfiguration |
| `auto-one/{esp_id}/heartbeat-ack` | Sub | Heartbeat-Bestätigung |

### 5.3 ESP32 MQTT-Topics (Publications)

| Topic-Pattern | Typ | Zweck |
|---------------|-----|-------|
| `auto-one/{esp_id}/heartbeat` | Pub | Periodischer Heartbeat |
| `auto-one/{esp_id}/system/config/response` | Pub | Config-Antwort |
| `auto-one/{esp_id}/actuator/{name}/response` | Pub | Aktor-Status |
| `auto-one/{esp_id}/emergency/response` | Pub | Emergency-Status |
| `auto-one/{esp_id}/system/command/response` | Pub | System-Antwort |
| `auto-one/{esp_id}/onewire/scan` | Pub | OneWire-Scan-Ergebnis |
| `auto-one/{esp_id}/diagnostics` | Pub | Diagnose-Daten |

### 5.4 Error-Injection MQTT-Kommandos (aus CI)

| Szenario | Topic | Payload-Typ |
|----------|-------|-------------|
| error_sensor_timeout | `.../sensor/ghost_temp/command` | Sensor-Config JSON |
| error_config_invalid_json | `.../system/config` | Malformed JSON |
| error_emergency_cascade | Mehrere (emergency, actuator, config) | 5-Step Sequence |
| error_gpio_conflict | `.../sensor/conflict_1/command` + `.../sensor/conflict_2/command` | Gleicher GPIO |
| error_heap_pressure | `.../sensor/{n}/command` (x14) | 14 Sensor-Configs |
| error_nvs_corrupt | `.../system/command` | `{"command":"factory_reset"}` |
| error_mqtt_disconnect | `.../system/config` | Config + Wait + Verify |
| error_i2c_bus_stuck | `.../sensor/ghost_i2c/command` | I2C-Sensor Config |
| error_actuator_timeout | `.../actuator/test_relay/command` | `{"action":"ON"}` |
| error_watchdog_trigger | `.../sensor/+/command` (x6) + emergency | Load + Emergency |

---

## Teil 6: Helper-Infrastruktur

### 6.1 Helper-Scripts (5 Dateien)

| Script | Pfad | Funktion |
|--------|------|----------|
| `emergency_cascade.sh` | `tests/wokwi/helpers/` | 5-Step MQTT Emergency Sequence |
| `emergency_cascade_stress.sh` | `tests/wokwi/helpers/` | Stress-Variante |
| `mqtt_inject.py` | `tests/wokwi/helpers/` | Python paho-mqtt Injector (--topic, --payload, --delay, --repeat, --qos) |
| `preflight_check.sh` | `tests/wokwi/helpers/` | 3-Check: kein lokaler Mosquitto, Docker Port published, MQTT erreichbar |
| `wait_for_mqtt.sh` | `tests/wokwi/helpers/` | Pollt Serial-Log auf MQTT-Connection (configurable timeout) |

### 6.2 Convenience-Scripts

| Script | Pfad | Funktion |
|--------|------|----------|
| `run-wokwi.bat` | `scripts/` | Windows Batch für Wokwi-Start |
| `run-wokwi-tests.py` | `scripts/` | Python Test-Runner |
| `start-wokwi-dev.ps1` | `scripts/` | PowerShell Dev-Starter |

### 6.3 Seed-Script

**`scripts/seed_wokwi_esp.py` existiert NICHT** im Repository. MEMORY.md referenziert es, aber die Datei ist nicht vorhanden. Die ESP-Registrierung erfolgt über den normalen Heartbeat-Flow (ESP sendet Heartbeat → Server registriert automatisch).

---

## Teil 7: Makefile-Targets

| Target | Szenarien | Beschreibung |
|--------|-----------|--------------|
| `wokwi-test-quick` | 2 | Boot + Heartbeat |
| `wokwi-test-full` | ~22 | Core-Szenarien (echo sagt 23, tatsächlich 22) |
| `wokwi-test-all` | 173 | Alle Szenarien |
| `wokwi-test-error-injection` | 10 | Error-Injection |
| `wokwi-test-scenario` | 1 | Einzelnes Szenario (Parameter) |
| `wokwi-test-category` | variabel | Kategorie (Parameter) |

**Bekannte Echo-Bugs:** Die Makefile-Echo-Messages zeigen falsche Zahlen (nvs: 35 statt 40, pwm: 15 statt 18, extended: ~135 statt ~163, full: 23 statt 22).

---

## Teil 8: Dokumentations-Konsistenz

### 8.1 Vorhandene Wokwi-Dokumentation

| Dokument | Status | Inhalt |
|----------|--------|--------|
| `WOKWI_ERROR_MAPPING.md` | AKTUELL (v2.0) | Alle 10 Error-Injection-Szenarien gemappt |
| `SYSTEM_OPERATIONS_REFERENCE.md` | Teilweise aktuell | Wokwi-Abschnitte vorhanden |
| `TEST_WORKFLOW.md` | Teilweise aktuell | Wokwi-Workflow dokumentiert |
| `LOG_LOCATIONS.md` | Teilweise aktuell | Wokwi-Log-Pfade |
| MEMORY.md | Enthält falsches seed-script | `seed_wokwi_esp.py` existiert nicht |

### 8.2 Konsistenz-Findings

| Finding | Detail |
|---------|--------|
| Makefile Echo-Counts | 4 falsche Zahlen (nvs, pwm, extended, full) |
| seed_wokwi_esp.py | In MEMORY.md referenziert, existiert nicht |
| Legacy mqtt_connection.yaml | Außerhalb von scenarios/, wird aber in CI genutzt |
| Doppel-Nummern | 08-i2c + 08-onewire, 09-hardware + 09-pwm (jeweils gleiche Prefix) |

---

## Teil 9: Agent-Driven Testing

### 9.1 Vorhandene Infrastruktur

| Komponente | Status | Detail |
|------------|--------|--------|
| WOKWI_ERROR_MAPPING.md | Vorhanden | Alle 10 Szenarien → Error-Codes gemappt |
| test-log-analyst Agent | Vorhanden | Kann Wokwi-Logs analysieren |
| esp32-debug Agent | Vorhanden | Serial-Log-Expertise |
| mqtt_inject.py Helper | Vorhanden | Programmatische MQTT-Injection |
| wait_for_mqtt.sh | Vorhanden | MQTT-Connection-Wait |
| preflight_check.sh | Vorhanden | Pre-Flight Validation |
| wokwi-cli --serial-log-file | Unterstützt | Log-Capture für Agent-Analyse |

### 9.2 Fehlende Infrastruktur

| Komponente | Fehlt | Auswirkung |
|------------|-------|------------|
| Dedizierter Wokwi-Test-Agent | Ja | Kein Agent orchestriert Wokwi-Tests end-to-end |
| Automatische Log-Analyse-Pipeline | Ja | Serial-Logs werden nicht automatisch an Agents weitergereicht |
| Retry/Recovery-Logik | Ja | Bei Wokwi-Timeout kein automatischer Retry |
| Local Wokwi Test Orchestrator | Ja | Nur Makefile-Targets, kein intelligenter Orchestrator |

### 9.3 Bewertung

Die **Grundlagen sind gelegt** (Mapping, Helper-Scripts, Log-Capture). Für echtes Agent-Driven Testing fehlt ein **Orchestrator**, der:
1. `wokwi-cli` startet
2. Serial-Log monitort
3. Bei Bedarf MQTT injiziert
4. Ergebnisse an `test-log-analyst` weiterreicht
5. Report schreibt

Das existierende CI-Setup (wokwi-tests.yml Job 16) ist ein gutes **Referenz-Pattern** dafür.

---

## Teil 10: Prioritäts-Matrix

### Sofort behebbar (Quick Wins)

| # | Problem | Betroffene Dateien | Aufwand |
|---|---------|--------------------|---------|
| 1 | Makefile Echo-Counts korrigieren | 1 Datei (Makefile) | 5 Min |
| 2 | Legacy mqtt_connection.yaml in scenarios/ verschieben | 1 Datei + CI-Referenz | 10 Min |
| 3 | MEMORY.md seed_wokwi_esp.py Referenz entfernen | 1 Datei | 2 Min |

### Mittel-Aufwand (systematisch)

| # | Problem | Betroffene Dateien | Aufwand |
|---|---------|--------------------|---------|
| 4 | `part-id: "mqtt"` in gpio/ ersetzen | 20 YAML-Dateien | 1-2h |
| 5 | `part-id: "mqtt"` in 09-hardware/ ersetzen | 8 YAML-Dateien | 30 Min |
| 6 | Doppel-Nummern-Prefixe auflösen (08-*, 09-*) | Verzeichnisstruktur + CI | 30 Min |

### Architektur-Entscheidung nötig

| # | Problem | Frage |
|---|---------|----|
| 7 | Was soll `set-control: part-id: "mqtt"` ersetzen? | Passives Pattern (wie error-injection) oder neues Wokwi-Part? |
| 8 | Dedizierter Wokwi-Test-Agent? | Eigener Agent oder Erweiterung von test-log-analyst? |
| 9 | Diagram-Management | Ein diagram.json + Alternativen, oder pro Kategorie? |

---

## Anhang A: Nicht getestete Bereiche

| Bereich | Grund |
|---------|-------|
| Firmware-Build (`pio run -e wokwi_simulation`) | Analyse-Only Auftrag |
| Live Wokwi-Test (wokwi-cli) | WOKWI_CLI_TOKEN nicht gesetzt in lokaler Umgebung |
| CI-Pipeline End-to-End | Nur YAML analysiert, nicht ausgeführt |

## Anhang B: Datei-Referenzen

| Datei | Pfad |
|-------|------|
| wokwi.toml | `El Trabajante/wokwi.toml` |
| diagram.json | `El Trabajante/diagram.json` |
| platformio.ini | `El Trabajante/platformio.ini` |
| wokwi-tests.yml | `.github/workflows/wokwi-tests.yml` |
| WOKWI_ERROR_MAPPING.md | `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` |
| main.cpp | `El Trabajante/src/main.cpp` |
| gpio_manager.cpp | `El Trabajante/src/drivers/gpio_manager.cpp` |
| error_codes.h | `El Trabajante/src/models/error_codes.h` |
| config_response.cpp | `El Trabajante/src/services/config/config_response.cpp` |
| Makefile | `Makefile` (Projekt-Root) |
| Helpers | `El Trabajante/tests/wokwi/helpers/` |
| Alternative Diagrams | `El Trabajante/tests/wokwi/diagrams/` |

---

*Report generiert am 2026-02-23. Analyse-Only — keine Änderungen am Repository vorgenommen.*
