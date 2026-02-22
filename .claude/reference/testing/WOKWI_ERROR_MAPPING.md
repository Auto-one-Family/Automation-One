# Wokwi Error-Injection Mapping

> **Version:** 2.0
> **Aktualisiert:** 2026-02-22
> **Quelle:** Phase 1 Implementierungsplan + Firmware-Verifikation
> **Pfad:** `El Trabajante/tests/wokwi/scenarios/11-error-injection/`
> **Referenz:** `El Trabajante/src/models/error_codes.h` (Error-Code Definitionen)

---

## Test-Pattern

Alle 10 Error-Injection-Szenarien verwenden das **Background-Pattern**:
1. YAML-Datei enthaelt NUR `wait-serial` + `delay` Steps (passives Monitoring)
2. MQTT-Injection erfolgt EXTERN via `mosquitto_pub` in der CI Pipeline
3. CI Pipeline (`wokwi-tests.yml` Job 16) startet `wokwi-cli` im Hintergrund, wartet auf Boot, injiziert MQTT, wartet auf Ergebnis

Fuer Szenario 7 (Emergency Cascade) wird ein Helper-Script verwendet: `tests/wokwi/helpers/emergency_cascade.sh`

---

## Error-Code zu Wokwi-Szenario Mapping

| Error-Code | Name | Wokwi-Szenario | Serial-Pattern | MQTT-Injection | Severity |
|------------|------|----------------|----------------|----------------|----------|
| 1002 | GPIO_CONFLICT | `error_gpio_conflict.yaml` | `ConfigResponse published` | Config mit 2 Sensoren auf GPIO 4 (in EINER Message) | error |
| 1014/1015 | I2C_BUS_ERROR/STUCK | `error_i2c_bus_stuck.yaml` | `ConfigResponse published` | Config mit SHT31 auf nicht-existierender I2C-Adresse | warning |
| 1040 | SENSOR_READ_FAILED | `error_sensor_timeout.yaml` | `ConfigResponse published` | Config mit DS18B20 auf GPIO 32 (nicht angeschlossen) | warning |
| 1050 | ACTUATOR_SET_FAILED | `error_actuator_timeout.yaml` | `Actuator` | Config + ON-Command auf GPIO 5 (LED) | warning |
| 2001 | NVS_INIT_FAILED | `error_nvs_corrupt.yaml` | `FACTORY RESET via MQTT` | system/command mit factory_reset + confirm:true | error |
| 3011 | MQTT_CONNECT_FAILED | `error_mqtt_disconnect.yaml` | `ConfigResponse published` | Config mit DS18B20 auf GPIO 4 (validiert MQTT-Aktivitaet) | error |
| 4001+ | STATE_INVALID | `error_emergency_cascade.yaml` | `BROADCAST EMERGENCY-STOP RECEIVED` | 5 Messages: Config + Actuator ON + Emergency + Clear + Emergency | critical |
| 4040 | MEMORY_FULL | `error_heap_pressure.yaml` | `ConfigResponse published` (2x) | Config mit 8 Sensoren + 6 Aktoren | warning |
| 4070 | WATCHDOG_TIMEOUT | `error_watchdog_trigger.yaml` | `BROADCAST EMERGENCY-STOP RECEIVED` | Config + Broadcast Emergency + Emergency Clear | critical |
| ConfigErrorCode | JSON_PARSE_ERROR | `error_config_invalid_json.yaml` | `Failed to parse` | Absichtlich kaputtes JSON an config-Topic | warning |

---

## Firmware Serial-Strings (verifiziert)

Folgende Strings sind in der Firmware bei DEFAULT Log-Level (LOG_INFO) sichtbar:

| String | Log-Level | Quelle | Kontext |
|--------|-----------|--------|---------|
| `Phase 5: Actuator System READY` | INFO | main.cpp | Boot-Sequenz abgeschlossen |
| `MQTT connected` | INFO | main.cpp / mqtt_client.cpp | Initiale Verbindung / Reconnect |
| `ConfigResponse published` | INFO | config_response.cpp:45 | Nach Config-Verarbeitung (Sensor/Actuator) |
| `Failed to parse sensor config JSON` | ERROR | main.cpp:2305 | JSON-Deserialisierung fehlgeschlagen |
| `BROADCAST EMERGENCY-STOP RECEIVED` | WARNING | main.cpp:919 | Broadcast Emergency empfangen |
| `AUTHORIZED EMERGENCY-CLEAR TRIGGERED` | INFO | main.cpp:886 | Emergency Clear ausgefuehrt |
| `FACTORY RESET via MQTT` | WARNING | main.cpp:952 | Factory-Reset Kommando empfangen |
| `Actuator timeout` | WARNING | actuator_manager.cpp:500 | max_runtime_ms ueberschritten |
| `Actuator` | INFO | main.cpp | Actuator-Command-Verarbeitung |
| `heartbeat` | INFO | main.cpp:787 | NUR bei Boot ("Initial heartbeat sent") |

**NICHT sichtbar bei LOG_INFO:** `Published:` (LOG_DEBUG), Heartbeat-Publishes nach Boot (LOG_DEBUG)

---

## MQTT-Topics (verifiziert)

| Topic | Zweck | Payload-Beispiel |
|-------|-------|------------------|
| `kaiser/god/esp/ESP_00000001/config` | Sensor/Actuator-Konfiguration | `{"sensors":[...],"actuators":[...]}` |
| `kaiser/god/esp/ESP_00000001/system/command` | System-Befehle (factory_reset, set_log_level) | `{"command":"factory_reset","confirm":true}` |
| `kaiser/god/esp/ESP_00000001/actuator/{gpio}/command` | Actuator-Steuerung (GPIO im Topic!) | `{"command":"ON","value":1.0}` |
| `kaiser/broadcast/emergency` | Broadcast Emergency Stop | `{"auth_token":"master_token"}` |
| `kaiser/god/esp/ESP_00000001/actuator/emergency` | ESP-spezifischer Emergency Stop/Clear | `{"command":"clear_emergency","auth_token":"ESP_00000001"}` |

**ACHTUNG:** Es gibt KEINE Topics `emergency/trigger` oder `emergency/clear`. Emergency-Clear verwendet `"command":"clear_emergency"` (NICHT `"emergency_clear"`).

---

## Sensor-Types (verifiziert gegen sensor_registry.cpp)

| Sensor-Type String | Firmware-Mapping | I2C |
|--------------------|-----------------|-----|
| `ds18b20` / `temperature_ds18b20` | DS18B20 OneWire | Nein |
| `dht22` | DHT22 Digital | Nein |
| `moisture` | Analog ADC | Nein |
| `temperature_sht31` / `sht31_temp` | SHT31 I2C | Ja (0x44) |
| `ph_sensor` / `ph` | Analog ADC | Nein |
| `ec_sensor` / `ec` | Analog ADC | Nein |

**ACHTUNG:** `temp_ds18b20` ist KEIN gueltiger Sensor-Type. Verwende `ds18b20` oder `temperature_ds18b20`.

---

## Test-Infrastruktur Error-Codes (6000-6099)

Diese Codes werden in Test-Reports verwendet, nicht in der Firmware selbst.

| Error-Code | Name | Kontext | Serial-Pattern | Severity |
|------------|------|---------|----------------|----------|
| 6000 | TEST_WOKWI_TIMEOUT | CI/CD + Lokal | `WOKWI_TIMEOUT` | error |
| 6001 | TEST_WOKWI_BOOT_INCOMPLETE | CI/CD | `BOOT_INCOMPLETE` | critical |
| 6010 | TEST_SCENARIO_ASSERTION_FAILED | pytest | `ASSERTION_FAILED` | error |
| 6011 | TEST_SCENARIO_NOT_FOUND | CI/CD | `SCENARIO_NOT_FOUND` | error |
| 6050 | TEST_SERIAL_LOG_MISSING | Wokwi | `SERIAL_LOG_MISSING` | error |

---

## Severity-Stufen

| Severity | Beschreibung | Aktion |
|----------|-------------|--------|
| `critical` | System-Stabilitaet bedroht | Sofortige Untersuchung, Pipeline blockiert |
| `error` | Funktionalitaet beeintraechtigt | Regression-Test fehlgeschlagen |
| `warning` | Degradierter Betrieb | Monitoring, kein Pipeline-Block |
| `info` | Erwartetes Verhalten unter Last | Nur Logging |

---

## Nutzung

### test-log-analyst Agent
Der Agent kann diese Tabelle nutzen um Wokwi-Test-Failures einem Error-Code zuzuordnen:
```
Serial-Output "ConfigResponse published" + Szenario error_gpio_conflict.yaml -> Error 1002 -> Severity error
Serial-Output "Failed to parse" -> ConfigErrorCode JSON_PARSE_ERROR -> Szenario error_config_invalid_json.yaml -> Severity warning
```

### CI/CD Pipeline
Die Pipeline (`wokwi-tests.yml`) fuehrt alle 10 Szenarien als Job `error-injection-tests` aus.
Jedes Szenario hat einen eigenen benannten CI-Step mit Background-Pattern (`wokwi-cli &` + `mosquitto_pub`).
Logs werden als Artifacts gespeichert (`error_*.log`).

### Vergleich Wokwi vs. Produktion
Dieselben Error-Codes treten in beiden Kontexten auf. WOKWI_ERROR_MAPPING ermoeglicht:
- Vergleichbare Fehlerberichte
- Gemeinsame Metriken in Phase 4 (Dashboard)
- test-log-analyst kann beide Quellen analysieren
