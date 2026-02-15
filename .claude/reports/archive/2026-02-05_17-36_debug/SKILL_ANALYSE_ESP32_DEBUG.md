# Skill-Analyse: esp32-debug

**Datum:** 2026-02-05 21:00 UTC
**Skill:** `esp32-debug`
**Fragen:** 11-13
**Status:** VOLLSTÄNDIG

---

## 11. Boot-Sequenz

**Datei:** `El Trabajante/src/main.cpp:127-800`

| Schritt | Zeile | Modul | Beschreibung |
|---------|-------|-------|--------------|
| 1 | 131-142 | Serial | UART Init (115200 bps), Wokwi +500ms delay |
| 2 | 147-152 | Boot Banner | Chip Model, CPU Freq, Free Heap |
| 3 | 155-167 | Watchdog Config | WDT-Mode bestimmt (DISABLED in Wokwi) |
| 4 | 170-242 | Boot-Button Check | GPIO 0 long-press (10s) = Factory Reset |
| 5 | **245-248** | **GPIO Safe-Mode** | `gpioManager.initializeAllPinsToSafeMode()` **KRITISCH, ZUERST!** |
| 6 | 251-255 | Logger System | `logger.begin()`, Level = LOG_INFO |
| 7 | 258-263 | Storage Manager | NVS-Access Layer |
| 8 | 266-278 | Config Manager | `loadAllConfigs()` + WiFi/Zone/System |
| 9 | 280-308 | Defensive Repair | Inconsistent state detection |
| 10 | 311-330 | Boot-Loop Detection | 3x reboot in <60s = safe-mode |
| 11 | 330-370 | Provisioning Check | Wenn keine Config: AP-Mode |
| 12 | 520-545 | Hardware Safe-Mode | LED blink 4× bei AP-Mode-Fehler → infinite loop |
| 13 | 552-562 | Provisioning Skip | Skip WiFi/MQTT wenn STATE_SAFE_MODE_PROVISIONING |
| 14 | 567-591 | Error Tracker | `errorTracker.begin()`, `TopicBuilder::setEspId()` |
| 15 | 600-650 | WiFi Manager | Circuit Breaker: 10 failures → 60s timeout |
| 16 | 700+ | MQTT Client | Circuit Breaker: 5 failures → 30s timeout |

### Boot-Phasen

```
PHASE 1: Hardware Init (Zeile 131-263)
├─ Serial Init
├─ Boot Banner
├─ Watchdog Config
├─ Boot-Button Check
├─ GPIO Safe-Mode ← KRITISCH
├─ Logger
└─ Storage Manager

PHASE 2: Config Load (Zeile 266-370)
├─ Config Manager
├─ Defensive Repair
├─ Boot-Loop Detection
└─ Provisioning Check

PHASE 3: Communication (Zeile 520-800)
├─ Hardware Safe-Mode (bei Fehler)
├─ Provisioning Skip (bei Safe-Mode)
├─ Error Tracker
├─ WiFi Manager
└─ MQTT Client
```

### SafeMode-Auslöser

| Trigger | Zeile | Beschreibung | Aktion |
|---------|-------|--------------|--------|
| Boot-Button 10s | 180 | GPIO 0 gedrückt | NVS löschen, Neustart |
| Boot-Loop | 314 | 3× reboot in <60s | STATE_SAFE_MODE_PROVISIONING |
| Inconsistent State | 292-308 | provisioning-safe-mode + valid config | State repair |
| WiFi Failure | 615 | Keine Verbindung | Provisioning Portal |
| AP-Mode Failure | 518 | AP kann nicht starten | LED blink 4× → infinite loop |

### SafeMode-States

```cpp
enum SystemState {
    STATE_UNINITIALIZED,
    STATE_PROVISIONING,           // AP-Mode für Config
    STATE_SAFE_MODE_PROVISIONING, // Safe-Mode + AP
    STATE_OPERATIONAL,            // Normal betrieb
    STATE_ERROR                   // Kritischer Fehler
};
```

---

## 12. Buffer und Persistenz

### Sensor-Daten Buffer

**Befund:** KEIN lokaler Ring-Buffer implementiert

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.h`

| Aspekt | Detail |
|--------|--------|
| Architektur | **Server-zentrisch** |
| Lokales Caching | **NEIN** |
| Datenfluss | Sensor-Read → JSON → MQTT Publish (QoS 1) |
| Buffer-Typ | Nur MQTT Offline-Buffer (256 Messages) |

### Warum kein lokaler Buffer?

1. **Server-zentrische Architektur** - ESP32 = dummer Agent
2. **RAM-Limitierung** - ESP32 hat nur ~320KB RAM
3. **QoS 1** - MQTT garantiert At-Least-Once Delivery
4. **Offline-Buffer** - MQTT Client hat eigenen Puffer

### MQTT Offline-Buffer

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp`

| Parameter | Wert |
|-----------|------|
| Buffer-Größe | 256 Messages |
| Overflow-Handling | Älteste Message wird verworfen |
| Error-Code | 3015 (MQTT_BUFFER_FULL) |

### NVS Persistenz

**Datei:** `El Trabajante/src/services/config/config_manager.cpp`

| Namespace | Inhalt | Persistenz |
|-----------|--------|------------|
| `wifi_config` | SSID, Password | Permanent |
| `zone_config` | Zone-Zuordnung | Permanent |
| `system_config` | ESP-ID, Kaiser-ID | Permanent |
| `sensors_config` | Sensor-Definitionen | Permanent |
| `actuators_config` | Actuator-Definitionen | Permanent |

### NVS-Fehlerbehandlung

| Error-Code | Name | Beschreibung |
|------------|------|--------------|
| 2001 | NVS_INIT_FAILED | Failed to initialize NVS |
| 2002 | NVS_READ_FAILED | Failed to read from NVS |
| 2003 | NVS_WRITE_FAILED | Failed to write to NVS |
| 2004 | NVS_NAMESPACE_FAILED | Failed to open NVS namespace |
| 2005 | NVS_CLEAR_FAILED | Failed to clear NVS namespace |

---

## 13. Error-Code Mapping

**Datei:** `El Trabajante/src/models/error_codes.h` (396 Zeilen)

### Hardware Errors (1000-1999)

#### GPIO (1001-1006)
| Code | Name | Beschreibung |
|------|------|--------------|
| 1001 | ERROR_GPIO_RESERVED | GPIO reserved by system |
| 1002 | ERROR_GPIO_CONFLICT | GPIO already in use |
| 1003 | ERROR_GPIO_INIT_FAILED | Failed to initialize GPIO |
| 1004 | ERROR_GPIO_INVALID_MODE | Invalid GPIO pin mode |
| 1005 | ERROR_GPIO_READ_FAILED | Failed to read GPIO |
| 1006 | ERROR_GPIO_WRITE_FAILED | Failed to write GPIO |

#### I2C Bus (1007-1019)
| Code | Name | Beschreibung |
|------|------|--------------|
| 1007 | ERROR_I2C_TIMEOUT | I2C operation timed out |
| 1008 | ERROR_I2C_NACK | I2C NACK received |
| 1009 | ERROR_I2C_CRC_FAILED | CRC validation failed |
| 1010 | ERROR_I2C_INIT_FAILED | Failed to initialize I2C bus |
| 1011 | ERROR_I2C_DEVICE_NOT_FOUND | I2C device not found |
| 1012 | ERROR_I2C_READ_FAILED | I2C read operation failed |
| 1013 | ERROR_I2C_WRITE_FAILED | I2C write operation failed |
| 1014 | ERROR_I2C_BUS_ERROR | I2C bus error |
| 1015 | ERROR_I2C_BUS_STUCK | I2C bus stuck (SDA/SCL low) |
| 1016 | ERROR_I2C_BUS_RECOVERY_FAILED | Bus recovery failed |
| 1017 | ERROR_I2C_BUS_RECOVERY_SUCCESS | Bus recovery succeeded |
| 1018 | ERROR_I2C_BUS_BUSY | I2C bus busy |
| 1019 | ERROR_I2C_PROTOCOL_UNSUPPORTED | Sensor type not registered |

#### OneWire (1020-1029)
| Code | Name | Beschreibung |
|------|------|--------------|
| 1020 | ERROR_ONEWIRE_INIT_FAILED | OneWire init failed |
| 1021 | ERROR_ONEWIRE_NO_DEVICES | No devices on bus |
| 1022 | ERROR_ONEWIRE_READ_FAILED | Read operation failed |
| 1023 | ERROR_ONEWIRE_ROM_INVALID_LENGTH | ROM address wrong length |
| 1024 | ERROR_ONEWIRE_ROM_INVALID_FORMAT | ROM address wrong format |
| 1025 | ERROR_ONEWIRE_ROM_CRC_FAILED | ROM CRC validation failed |
| 1026 | ERROR_ONEWIRE_DEVICE_NOT_PRESENT | Device not responding |
| 1027 | ERROR_ONEWIRE_BUS_NOT_IDLE | Bus not in idle state |
| 1028 | ERROR_ONEWIRE_RESET_FAILED | Reset pulse failed |
| 1029 | ERROR_ONEWIRE_TIMEOUT | Operation timed out |

#### Sensor (1040-1043)
| Code | Name | Beschreibung |
|------|------|--------------|
| 1040 | ERROR_SENSOR_READ_FAILED | Sensor read failed |
| 1041 | ERROR_SENSOR_INIT_FAILED | Sensor init failed |
| 1042 | ERROR_SENSOR_NOT_FOUND | Sensor not found |
| 1043 | ERROR_SENSOR_TIMEOUT | Sensor timeout |

#### Actuator (1050-1053)
| Code | Name | Beschreibung |
|------|------|--------------|
| 1050 | ERROR_ACTUATOR_SET_FAILED | Actuator set failed |
| 1051 | ERROR_ACTUATOR_INIT_FAILED | Actuator init failed |
| 1052 | ERROR_ACTUATOR_NOT_FOUND | Actuator not found |
| 1053 | ERROR_ACTUATOR_CONFLICT | Actuator conflict |

#### DS18B20 (1060-1063)
| Code | Name | Beschreibung |
|------|------|--------------|
| 1060 | ERROR_DS18B20_SENSOR_FAULT | Sensor fault detected |
| 1061 | ERROR_DS18B20_POWER_ON_RESET | Power-on reset value |
| 1062 | ERROR_DS18B20_OUT_OF_RANGE | Temperature out of range |
| 1063 | ERROR_DS18B20_DISCONNECTED | Sensor disconnected |

### Service Errors (2000-2999)

#### NVS Storage (2001-2005)
| Code | Name | Beschreibung |
|------|------|--------------|
| 2001 | ERROR_NVS_INIT_FAILED | NVS init failed |
| 2002 | ERROR_NVS_READ_FAILED | NVS read failed |
| 2003 | ERROR_NVS_WRITE_FAILED | NVS write failed |
| 2004 | ERROR_NVS_NAMESPACE_FAILED | NVS namespace failed |
| 2005 | ERROR_NVS_CLEAR_FAILED | NVS clear failed |

#### Config (2010-2014)
| Code | Name | Beschreibung |
|------|------|--------------|
| 2010 | ERROR_CONFIG_INVALID | Config invalid |
| 2011 | ERROR_CONFIG_MISSING | Config missing |
| 2012 | ERROR_CONFIG_LOAD_FAILED | Config load failed |
| 2013 | ERROR_CONFIG_SAVE_FAILED | Config save failed |
| 2014 | ERROR_CONFIG_VALIDATION_FAILED | Config validation failed |

#### Subzone Management (2500-2506)
| Code | Name | Beschreibung |
|------|------|--------------|
| 2500 | ERROR_SUBZONE_INVALID_ID | Invalid subzone ID |
| 2501 | ERROR_SUBZONE_GPIO_CONFLICT | GPIO already in subzone |
| 2502 | ERROR_SUBZONE_PARENT_MISMATCH | Parent zone mismatch |
| 2503 | ERROR_SUBZONE_NOT_FOUND | Subzone not found |
| 2504 | ERROR_SUBZONE_GPIO_INVALID | Invalid GPIO for subzone |
| 2505 | ERROR_SUBZONE_SAFE_MODE_FAILED | Safe-mode transition failed |
| 2506 | ERROR_SUBZONE_CONFIG_SAVE_FAILED | Subzone config save failed |

### Communication Errors (3000-3999)

#### WiFi (3001-3005)
| Code | Name | Beschreibung |
|------|------|--------------|
| 3001 | ERROR_WIFI_INIT_FAILED | WiFi init failed |
| 3002 | ERROR_WIFI_CONNECT_TIMEOUT | WiFi connect timeout |
| 3003 | ERROR_WIFI_CONNECT_FAILED | WiFi connect failed |
| 3004 | ERROR_WIFI_DISCONNECT | WiFi disconnected |
| 3005 | ERROR_WIFI_SSID_NOT_FOUND | SSID not found |

#### MQTT (3010-3016)
| Code | Name | Beschreibung |
|------|------|--------------|
| 3010 | ERROR_MQTT_INIT_FAILED | MQTT init failed |
| 3011 | ERROR_MQTT_CONNECT_FAILED | MQTT connect failed |
| 3012 | ERROR_MQTT_PUBLISH_FAILED | MQTT publish failed |
| 3013 | ERROR_MQTT_SUBSCRIBE_FAILED | MQTT subscribe failed |
| 3014 | ERROR_MQTT_DISCONNECT | MQTT disconnected |
| 3015 | ERROR_MQTT_BUFFER_FULL | Offline buffer full |
| 3016 | ERROR_MQTT_PAYLOAD_INVALID | Payload invalid |

#### HTTP (3020-3023)
| Code | Name | Beschreibung |
|------|------|--------------|
| 3020 | ERROR_HTTP_INIT_FAILED | HTTP init failed |
| 3021 | ERROR_HTTP_REQUEST_FAILED | HTTP request failed |
| 3022 | ERROR_HTTP_RESPONSE_INVALID | HTTP response invalid |
| 3023 | ERROR_HTTP_TIMEOUT | HTTP timeout |

### Application Errors (4000-4999)

#### State Machine (4001-4003)
| Code | Name | Beschreibung |
|------|------|--------------|
| 4001 | ERROR_STATE_INVALID | Invalid state |
| 4002 | ERROR_STATE_TRANSITION_INVALID | Invalid transition |
| 4003 | ERROR_STATE_MACHINE_STUCK | State machine stuck |

#### Watchdog (4070-4072)
| Code | Name | Beschreibung |
|------|------|--------------|
| 4070 | ERROR_WATCHDOG_TIMEOUT | Watchdog timeout |
| 4071 | ERROR_WATCHDOG_FEED_BLOCKED | Feed blocked (CB open) |
| 4072 | ERROR_WATCHDOG_FEED_BLOCKED_CRITICAL | Critical errors active |

#### Device Approval (4200-4202)
| Code | Name | Beschreibung |
|------|------|--------------|
| 4200 | ERROR_DEVICE_REJECTED | Device rejected |
| 4201 | ERROR_DEVICE_APPROVAL_TIMEOUT | Approval timeout |
| 4202 | ERROR_DEVICE_APPROVAL_REVOKED | Approval revoked |

---

## MQTT-Meldung von Errors

### Topic

`kaiser/{kaiser_id}/esp/{esp_id}/system/error`

### Payload-Format

```json
{
  "error_code": 1002,
  "severity": "error",
  "message": "GPIO 21 conflict",
  "timestamp": 1707158400
}
```

### Severity-Levels

| Level | Codes | Beschreibung |
|-------|-------|--------------|
| `critical` | 4070-4072 | Watchdog, System-Crash |
| `error` | 1xxx, 3xxx | Hardware, Communication |
| `warning` | 2xxx | Service, Config |
| `info` | - | Nur Logging |

---

## Kritische Dateien für esp32-debug

| Datei | Zweck |
|-------|-------|
| `El Trabajante/src/main.cpp` | Boot-Sequenz, Setup |
| `El Trabajante/src/models/error_codes.h` | Alle Error-Codes |
| `El Trabajante/src/error_handling/error_tracker.h` | Error Tracking |
| `El Trabajante/src/services/config/config_manager.cpp` | NVS Persistenz |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | MQTT + Offline-Buffer |
| `El Trabajante/src/services/gpio/gpio_manager.cpp` | GPIO Safe-Mode |
| `El Trabajante/src/utils/topic_builder.cpp` | Error-Topic Builder |

---

## Debug-Checkliste

### Bei Boot-Problemen

1. **Serial-Output prüfen** (115200 bps)
2. **Boot-Phase identifizieren** (welcher Schritt?)
3. **Safe-Mode-Trigger prüfen** (Boot-Loop? WiFi?)
4. **NVS-Zustand prüfen** (Factory Reset nötig?)

### Bei Sensor-Problemen

1. **Error-Code identifizieren** (1040-1043, 1007-1019)
2. **GPIO-Konflikt prüfen** (1002)
3. **I2C-Bus-Status prüfen** (1015 = Bus stuck)
4. **OneWire-ROM prüfen** (1023-1025)

### Bei Communication-Problemen

1. **WiFi-Status prüfen** (3001-3005)
2. **MQTT-Status prüfen** (3010-3016)
3. **Circuit-Breaker-Status prüfen** (OPEN/HALF_OPEN/CLOSED)
4. **Offline-Buffer-Status prüfen** (3015 = voll)
