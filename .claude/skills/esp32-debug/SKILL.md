---
name: esp32-debug
description: |
  ESP32 Debug-Wissensdatenbank: Boot-Sequenz, Error-Codes, MQTT-Topics,
  Datenfluesse, Circuit Breaker, Diagnose-Workflows, Cross-Layer Commands.
  Trigger-Keywords: esp32, serial, firmware, boot, sensor, actuator, gpio,
  heartbeat, safemode, watchdog, circuit-breaker, wokwi
allowed-tools: Read, Grep, Glob, Bash
context: inline
---

# ESP32 Debug Skill

> **Fokus:** Firmware-Fehler, Boot-Probleme, Hardware-Issues, Sensor/Actuator-Kommunikation
> **Log-Quelle:** `logs/current/esp32_serial.log` (PlatformIO Monitor) OR `docker logs automationone-esp32-serial` (TCP-Bridge)
> **Error-Codes:** 1000-4999 (ESP32-spezifisch)

---

## 0. Quick Reference - Debugging-Fokus

| Problem | Sektion | Grep-Pattern |
|---------|---------|--------------|
| **Boot haengt** | [Boot-Sequenz](#2-boot-sequenz) | `grep -iE "STEP\|Phase\|ERROR"` |
| **SafeMode** | [SafeMode-Trigger](#3-safemode-trigger) | `grep -i "safe.mode\|boot.loop"` |
| **GPIO-Fehler** | [Error-Codes](#5-error-code-vollreferenz) | `grep -E "1001\|1002\|GPIO"` |
| **Sensor-Problem** | [Datenfluesse](#4-datenfluesse) | `grep -E "1040\|1041\|sensor"` |
| **MQTT offline** | [Circuit-Breaker](#8-circuit-breaker) | `grep -i "circuit\|MQTT\|3011"` |
| **Watchdog** | [Error-Codes](#5-error-code-vollreferenz) | `grep -E "4070\|4071\|watchdog"` |

---

## 1. ESP32 Firmware-Architektur (Debug-relevante Module)

100 Source-Dateien (42 .cpp + 58 .h), Singleton-Pattern. Debug-Kernmodule:

| Modul | Pfad | Funktion |
|-------|------|----------|
| Boot/Entry | `src/main.cpp` | 16-Schritt Initialisierung |
| MQTT Client | `src/services/communication/mqtt_client.cpp` | Connect, publish, subscribe, Circuit Breaker |
| WiFi Manager | `src/services/communication/wifi_manager.cpp` | Connect, reconnect, RSSI |
| Sensor Manager | `src/services/sensor/sensor_manager.cpp` | Sensor-Loop, Readings |
| Actuator Manager | `src/services/actuator/actuator_manager.cpp` | GPIO/PWM-Steuerung |
| Error Tracker | `src/error_handling/error_tracker.cpp` | Error-Reporting an Server |
| Circuit Breaker | `src/error_handling/circuit_breaker.cpp` | CLOSED/OPEN/HALF_OPEN |
| Error-Codes | `src/models/error_codes.h` | Alle Codes 1000-4999 |

---

## 2. Boot-Sequenz (main.cpp)

> Exakte Reihenfolge aus main.cpp mit STEP-Kommentaren

| # | Zeile | Modul | Was passiert | Fehler wenn... |
|---|-------|-------|-------------|----------------|
| 1 | 131-142 | Serial | UART 115200 bps, Wokwi +500ms | Kein Output |
| 2 | 147-152 | Boot Banner | Chip Model, CPU Freq, Heap | - |
| 3 | 179-242 | Boot-Button | GPIO 0 long-press 10s = Factory Reset | Factory Reset |
| 4 | 245-248 | GPIO Safe-Mode | `gpioManager.initializeAllPinsToSafeMode()` | 1001-1006 |
| 5 | 251-255 | Logger | `logger.begin()`, LOG_INFO | - |
| 6 | 258-263 | Storage | NVS-Access Layer (`storageManager.begin()`) | 2001-2005 |
| 7 | 266-278 | Config | `loadAllConfigs()` | 2010-2014 |
| 8 | 280-308 | Defensive Repair | Inconsistent state check | SafeMode |
| 9 | 310-357 | Boot-Loop Detect | 5x in <60s → SafeMode | SafeMode |
| 10 | 359-405 | Watchdog Init | Provisioning: 300s / Production: 60s | 4070 bei Timeout |
| 11 | 433-546 | Provisioning | Keine Config → AP-Mode | Portal oder LED-Blink |
| 12 | 552-562 | Skip Check | Skip WiFi/MQTT bei SAFE_MODE | - |
| 13 | 567-577 | Error Tracker | `begin()`, TopicBuilder init | - |
| 14 | 600-674 | WiFi | CB: 10 failures → 60s timeout | 3001-3005, Provisioning Portal |
| 15 | 676+ | MQTT | CB: 5 failures → 30s timeout | 3010-3016 |
| 16 | - | Health Monitor | Sensor/Actuator Manager start | - |

**KRITISCH:** Schritt 4 (GPIO Safe-Mode) kommt VOR Config-Load!
Alle Pins starten in sicherem Zustand, egal was die Config sagt.

---

## 3. SafeMode-Trigger (5 Ausloeser)

| Trigger | Zeile | Bedingung | Ergebnis |
|---------|-------|-----------|----------|
| Boot-Button 10s | 179-237 | GPIO 0 gedrueckt 10s | NVS loeschen, Neustart |
| Boot-Loop | 338-357 | 5x reboot in <60s | SafeMode-State (Infinite Loop) |
| Inconsistent State | 292-308 | provisioning-safe + valid config | Repair/SafeMode |
| WiFi Failure | 615-671 | Keine Verbindung | Provisioning Portal |
| AP-Mode Failure | 517-545 | Portal kann nicht starten | LED 4x blink → Halt |

### Diagnose-Workflow SafeMode

```
1. Serial Output pruefen → Wo bleibt der Boot haengen?
2. NVS-Content pruefen → Sind Configs korrupt?
3. Boot-Counter pruefen → Boot-Loop (>5 in <60s)?
4. GPIO 0 Status → Versehentlich gedrueckt?
5. LED-Blink-Pattern? → 3x=Provision-Fail, 4x=AP-Mode-Fail, 5x=WiFi-Fail
```

---

## 4. Datenfluesse

### Sensor → Server (QoS 1)
```
Hardware → SensorManager.loop() → MQTTClient.safePublish()
→ MQTT Broker → SensorDataHandler → SensorRepository → DB INSERT
→ WebSocket broadcast → LogicEngine
```
Timing: 50-230ms. **Kein lokaler Buffer bei Broker-Offline → Daten gehen verloren!**

### Heartbeat (QoS 0, alle ~5s)
```
HealthMonitor.loop() → publish heartbeat
→ HeartbeatHandler → ESPDevice lookup/create → Log ESPHeartbeat
→ WebSocket broadcast → heartbeat_ack zurueck an ESP
```

### Registration
```
ESP32 bootet → Erster Heartbeat → Device entdeckt (status="pending_approval")
→ Admin approved via REST → Config-Push → Normaler Betrieb
```

### Actuator-Command (QoS 2)
```
REST API/Logic → ActuatorService → SafetyService.validate()
→ MQTT publish → ESP32 ActuatorManager → GPIO/PWM setzen
→ Publish Status + Response → Server Handler → DB + WebSocket
```
Timing: 100-290ms.

### Emergency-Stop (QoS 2, < 100ms)
```
POST /actuators/emergency-stop → kaiser/broadcast/emergency
→ ALLE ESPs → SafetyController.emergencyStopAll()
→ Alle Outputs auf INPUT → Publish status="emergency"
```

### NVS Persistenz

Namespaces: `wifi_config` (SSID/PW/Server), `zone_config` (Zone-Zuordnung), `system_config` (ESP-ID/State/Boot-Count), `sensors_config` (GPIO/Type/Interval), `actuators_config` (GPIO/Type/Safety).
**NICHT gespeichert:** Sensor-Messwerte, Aktuator-States (fluechtig!)

---

## 5. Error-Code Vollreferenz (1000-4999)

### Hardware (1000-1999)

| Range | Kategorie | Haeufigste | Debug-Aktion |
|-------|-----------|-----------|--------------|
| 1001-1006 | GPIO | RESERVED(1001), CONFLICT(1002) | Pin-Belegung pruefen |
| 1007-1019 | I2C | TIMEOUT(1007), BUS_STUCK(1015) | Verkabelung, Pull-ups 4.7k |
| 1020-1029 | OneWire | NO_DEVICES(1021), INVALID_ROM(1023-1025) | Sensor angeschlossen? |
| 1030-1032 | PWM | CHANNEL_FULL(1031) | Max PWM-Channels erreicht |
| 1040-1043 | Sensor | READ_FAILED(1040), TIMEOUT(1043) | Hardware defekt? |
| 1050-1053 | Actuator | SET_FAILED(1050), CONFLICT(1053) | GPIO-Kollision? |
| 1060-1063 | DS18B20 | SENSOR_FAULT(1060), OUT_OF_RANGE(1062) | Verkabelung, Sensor |

### Service (2000-2999)

| Range | Kategorie | Haeufigste |
|-------|-----------|-----------|
| 2001-2005 | NVS | INIT_FAILED(2001), WRITE_FAILED(2003) |
| 2010-2014 | Config | LOAD_FAILED(2012), INVALID(2010) |
| 2020-2021 | Logger | BUFFER_FULL(2021) |
| 2500-2506 | Subzone | ASSIGN_FAILED(2500), GPIO_CONFLICT(2501) |

### Communication (3000-3999)

| Range | Kategorie | Haeufigste |
|-------|-----------|-----------|
| 3001-3005 | WiFi | CONNECT_FAILED(3003), TIMEOUT(3002), NO_SSID(3005) |
| 3010-3016 | MQTT | CONNECT_FAILED(3011), BUFFER_FULL(3015), PAYLOAD_INVALID(3016) |

### Application (4000-4999)

| Range | Kategorie | Haeufigste |
|-------|-----------|-----------|
| 4001-4003 | State Machine | INVALID_TRANSITION(4002), STUCK(4003) |
| 4040-4042 | Memory | FULL(4040), ALLOCATION(4041) |
| 4070-4072 | Watchdog | WDT_TIMEOUT(4070), FEED_BLOCKED(4071) |
| 4200-4202 | Approval | DEVICE_REJECTED(4200), APPROVAL_TIMEOUT(4201) |

### Server Error-Codes (ESP32-relevant, 5000-5699)

| Code | Name | Bedeutung |
|------|------|-----------|
| 5001 | ESP_DEVICE_NOT_FOUND | Device-ID nicht in DB |
| 5002 | ESP_DEVICE_OFFLINE | Heartbeat-Timeout ueberschritten |
| 5010 | SENSOR_NOT_FOUND | Sensor-Config fehlt |
| 5011 | ACTUATOR_NOT_FOUND | Actuator-Config fehlt |
| 5100 | BROKER_DOWN | MQTT-Broker nicht erreichbar |
| 5200 | DB_CONNECTION_FAILED | PostgreSQL-Verbindung unterbrochen |
| 5601 | CIRCUIT_BREAKER_OPEN | Server-seitiger CB ausgeloest |

---

## 6. Error-Meldung an Server

Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/error` (QoS 1)

```json
{
  "error_code": 1002,
  "severity": "error",
  "message": "GPIO 21 conflict",
  "timestamp": 1707158400
}
```

| Level | Bedeutung | Aktion |
|-------|-----------|--------|
| `info` | Informational | Dokumentieren |
| `warning` | Degraded aber funktional | Beobachten |
| `error` | Feature nicht verfuegbar | Untersuchen |
| `critical` | System-Level Problem | Sofort handeln |

---

## 7. MQTT-Topics Quick-Reference

### ESP publiziert

| Topic | QoS | Inhalt |
|-------|-----|--------|
| `kaiser/{id}/esp/{esp}/sensor/{gpio}/data` | 1 | Sensor-Messwert |
| `kaiser/{id}/esp/{esp}/sensor/{gpio}/batch` | 1 | Batch-Daten |
| `kaiser/{id}/esp/{esp}/actuator/{gpio}/status` | 1 | Actuator-Zustand |
| `kaiser/{id}/esp/{esp}/system/heartbeat` | 0 | Health-Status alle ~5s |
| `kaiser/{id}/esp/{esp}/system/error` | 1 | Error-Report |
| `kaiser/{id}/esp/{esp}/system/will` | 1 | LWT (offline-Erkennung) |

### ESP abonniert

| Topic | QoS | Inhalt |
|-------|-----|--------|
| `kaiser/{id}/esp/{esp}/sensor/+/command` | 1 | Sensor-Konfiguration |
| `kaiser/{id}/esp/{esp}/actuator/+/command` | 2 | Actuator-Befehl |
| `kaiser/{id}/esp/{esp}/actuator/+/emergency` | 2 | Emergency-Stop |
| `kaiser/{id}/esp/{esp}/system/command` | 1 | System-Befehle |
| `kaiser/{id}/esp/{esp}/config` | 1 | Config-Push |
| `kaiser/broadcast/emergency` | 2 | Globaler Emergency-Stop |

---

## 8. Circuit Breaker auf ESP32

| Breaker | Modul | Threshold | Recovery | Half-Open |
|---------|-------|-----------|----------|-----------|
| MQTT | mqtt_client.cpp | 5 failures | 30s | 10s |
| WiFi | wifi_manager.cpp | 10 failures | 60s | - |

### Serial-Output bei CB-Events

```
[MQTT] Circuit Breaker: CLOSED → OPEN (5 failures)
[MQTT] Circuit Breaker: OPEN → HALF_OPEN (30s elapsed)
[MQTT] Circuit Breaker: HALF_OPEN → CLOSED (test success)
```

### CB-State Impact

| State | Reconnect-Verhalten | Watchdog-Feed |
|-------|---------------------|---------------|
| CLOSED | Normal (Backoff) | Erlaubt |
| OPEN | Blockiert (30s) | Mit Warning |
| HALF_OPEN | Sofort versuchen | Erlaubt |

---

## 9. Log-Location & Analyse

### Primaere Quelle

`logs/current/esp32_serial.log` – Plain Text, Prefix-Tags `[MQTT]`, `[WiFi]`, `[GPIO]`, Level: DEBUG/INFO/WARNING/ERROR/CRITICAL

### Sekundaere Quellen (fuer Cross-Layer-Checks)

| Quelle | Pfad | Wann nutzen |
|--------|------|-------------|
| Server-Log | `logs/server/god_kaiser.log` | ESP-bezogene Server-Errors greppen |
| MQTT-Traffic | `mosquitto_sub` live | Wenn Serial MQTT-Probleme zeigt |
| Docker-Status | `docker compose ps` | Container-Verfuegbarkeit pruefen |

### Grep-Patterns

```bash
grep -iE "ERROR|CRITICAL" logs/current/esp32_serial.log          # Alle Fehler
grep -iE "boot|safe.mode|factory.reset" logs/current/esp32_serial.log  # Boot
grep -iE "gpio|conflict|1001|1002" logs/current/esp32_serial.log  # GPIO
grep "\[MQTT\]" logs/current/esp32_serial.log                     # MQTT
grep "\[WiFi\]" logs/current/esp32_serial.log                     # WiFi
grep -iE "watchdog|wdt|4070" logs/current/esp32_serial.log        # Watchdog
grep -iE "circuit|breaker" logs/current/esp32_serial.log          # CB
grep -iE "provisioning|ap.mode" logs/current/esp32_serial.log     # Provisioning
grep "ESP_XXX" logs/server/god_kaiser.log | tail -20              # Cross-Layer
```

---

## 10. Diagnose-Workflows

### ESP bootet nicht

```
1. Serial Monitor pruefen → Wo stoppt der Output?
2. Boot-Banner vorhanden? → Ja: Hardware OK, Nein: Flash korrupt
3. SafeMode-Message? → Welcher Trigger? (Boot-Loop, Inconsistent, WiFi-Fail)
4. Boot-Loop? → Counter in NVS pruefen (>5 in <60s)
5. LED-Blink-Pattern? → 3x=Provision, 4x=AP-Mode, 5x=WiFi
```

### Sensor liefert keine Daten

```
1. Sensor konfiguriert? → NVS sensors_config
2. GPIO korrekt? → Kein Conflict (1002)?
3. Hardware OK? → READ_FAILED (1040)?
4. Bus initialisiert? → I2C(1010)/OneWire(1020)
5. MQTT connected? → Circuit Breaker Status
6. Topic korrekt? → sensor/{gpio}/data
```

### ESP geht offline

```
1. WiFi stabil? → grep [WiFi] in Serial
2. MQTT Circuit Breaker? → OPEN state?
3. Watchdog? → 4070 im Serial
4. Power-Problem? → Heap/Stack Overflow?
5. Boot-Loop? → 5x in <60s
```

### Actuator reagiert nicht

```
1. Actuator konfiguriert? → NVS actuators_config
2. GPIO reserviert? → gpioManager.requestPin() erfolgt?
3. MQTT Command empfangen? → Serial-Log pruefen
4. SafetyController blockiert? → Emergency-Stop aktiv?
5. Command-Payload gueltig? → 4030 PAYLOAD_INVALID?
```

---

## 11. DB-Tabellen Quick-Reference

| Tabelle | Wichtige Felder | Beispiel-Query |
|---------|----------------|----------------|
| `esp_devices` | device_id, status, last_seen, ip_address | `SELECT device_id, status, last_seen FROM esp_devices ORDER BY last_seen DESC LIMIT 5` |
| `sensor_configs` | id, esp_device_id, gpio_pin, sensor_type | `SELECT * FROM sensor_configs WHERE esp_device_id = 'ESP_XXX'` |
| `sensor_data` | id, esp_device_id, gpio_pin, value, created_at | `SELECT COUNT(*) FROM sensor_data WHERE esp_device_id = 'ESP_XXX' AND created_at > NOW() - INTERVAL '5 minutes'` |
| `actuator_configs` | id, esp_device_id, gpio_pin, actuator_type | `SELECT * FROM actuator_configs WHERE esp_device_id = 'ESP_XXX'` |
| `esp_heartbeats` | id, esp_device_id, heap_free, wifi_rssi, created_at | `SELECT * FROM esp_heartbeats WHERE esp_device_id = 'ESP_XXX' ORDER BY created_at DESC LIMIT 5` |

Alle Queries via: `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "..."`

---

## 12. Docker Quick-Reference

| Service | Container | Port | Health |
|---------|-----------|------|--------|
| `postgres` | automationone-postgres | 5432 | pg_isready |
| `mqtt-broker` | automationone-mqtt | 1883, 9001 | mosquitto_sub $SYS |
| `el-servador` | automationone-server | 8000 | curl /api/v1/health/live |
| `el-frontend` | automationone-frontend | 5173 | node fetch |

**KRITISCH:** Service-Namen sind `mqtt-broker`, `el-servador` (NICHT mosquitto, god-kaiser-server).

---

## 13. Wokwi Quick-Reference

- **Build:** `pio run -e wokwi_simulation`
- **Config:** `El Trabajante/wokwi.toml`, Serial: `rfc2217://localhost:4000`
- **Szenarien:** 163 YAML in 13 Kategorien (`El Trabajante/tests/wokwi/scenarios/`)

---

## 14. Referenzen

| Wann | Datei | Zweck |
|------|-------|-------|
| Bei Error-Codes | `.claude/reference/errors/ERROR_CODES.md` | Code-Interpretation |
| Bei MQTT-Topics | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Schema |
| Bei Boot/Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Boot-Sequenzen |
| Bei Firmware-Details | `.claude/skills/esp32-development/SKILL.md` | Code-Locations |
| Bei System-Ops | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Docker, Commands |
| Bei Architektur | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | Abhaengigkeiten |
