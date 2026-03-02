# Dead-Code Analyse — ESP32 Error Codes

> **Version:** 1.0 | **Analysiert:** 2026-03-01
> **Methode:** Grep nach `#define ERROR_*` Makro-Nutzung in `El Trabajante/src/**/*.cpp`
> **Scope:** Nur ESP32-Codes (1000-4999). Server-Codes (5000-5999) in separater Analyse.

---

## 1. Zusammenfassung

| Range | Definiert | USED | UNUSED | Nutzung |
|-------|-----------|------|--------|---------|
| **HARDWARE (1000-1999)** | 43 | 33 | 10 | 77% |
| **SERVICE (2000-2999)** | 22 | 5 | 17 | 23% |
| **COMMUNICATION (3000-3999)** | 19 | 16 | 3 | 84% |
| **APPLICATION (4000-4999)** | 27 | 7 | 20 | 26% |
| **Gesamt** | 111 | 61 | 50 | 55% |

> **Hinweis:** SERVICE und APPLICATION haben viele generische Platzhalter-Codes
> die auf ESP32 (noch) nicht implementiert sind. Diese sind als RESERVED markiert.

---

## 2. UNUSED Codes — Kategorisiert

### 2a. RESERVED — Behalten (geplante Nutzung oder architektonisch wichtig)

| Code | Makro | Grund |
|------|-------|-------|
| 1003 | `ERROR_GPIO_INIT_FAILED` | Wird bei GPIO-Error-Handling-Ausbau benötigt |
| 1005 | `ERROR_GPIO_READ_FAILED` | Wird bei GPIO-Error-Handling-Ausbau benötigt |
| 1006 | `ERROR_GPIO_WRITE_FAILED` | Wird bei GPIO-Error-Handling-Ausbau benötigt |
| 1015 | `ERROR_I2C_BUS_STUCK` | i2c_bus.cpp nutzt 1016-1018 (Recovery), 1015 als Vorstufe geplant |
| 1026 | `ERROR_ONEWIRE_DEVICE_NOT_FOUND` | Komplementär zu 1021 (NO_DEVICES), Einzelgerät-Erkennung |
| 1040 | `ERROR_SENSOR_READ_FAILED` | Generischer Sensor-Read-Fehler, Basis für Spezifizierung |
| 1042 | `ERROR_SENSOR_NOT_FOUND` | Sensor-Discovery-Fehler |
| 1043 | `ERROR_SENSOR_TIMEOUT` | Sensor-Timeout, komplementär zu 1028 (OneWire-spezifisch) |
| 1053 | `ERROR_ACTUATOR_CONFLICT` | Actuator-GPIO-Konflikte, komplementär zu 1002 |
| 1063 | `ERROR_DS18B20_DISCONNECTED_RUNTIME` | Runtime-Disconnect-Erkennung, geplant für OneWire-Monitoring |
| 2001 | `ERROR_NVS_INIT_FAILED` | NVS-Initialisierung (aktuell implicit) |
| 2002 | `ERROR_NVS_READ_FAILED` | NVS-Read-Fehler (aktuell nur WRITE tracked) |
| 2004 | `ERROR_NVS_NAMESPACE_FAILED` | NVS-Namespace-Fehler |
| 2005 | `ERROR_NVS_CLEAR_FAILED` | NVS-Clear-Fehler |
| 2012 | `ERROR_CONFIG_LOAD_FAILED` | Config-Load aus NVS |
| 2013 | `ERROR_CONFIG_SAVE_FAILED` | Config-Save in NVS (generisch, 2003 ist NVS-spezifisch) |
| 2014 | `ERROR_CONFIG_VALIDATION` | Config-Validierung (generisch) |
| 2500 | `ERROR_SUBZONE_INVALID_ID` | **SUBZONE — NIEMALS ENTFERNEN** |
| 2501 | `ERROR_SUBZONE_GPIO_CONFLICT` | **SUBZONE — NIEMALS ENTFERNEN** |
| 2502 | `ERROR_SUBZONE_PARENT_MISMATCH` | **SUBZONE — NIEMALS ENTFERNEN** |
| 2503 | `ERROR_SUBZONE_NOT_FOUND` | **SUBZONE — NIEMALS ENTFERNEN** |
| 2504 | `ERROR_SUBZONE_GPIO_INVALID` | **SUBZONE — NIEMALS ENTFERNEN** |
| 3003 | `ERROR_WIFI_CONNECT_FAILED` | WiFi-Fehler, aktuell nur TIMEOUT und DISCONNECT genutzt |
| 3030 | `ERROR_NETWORK_UNREACHABLE` | Netzwerk-Erreichbarkeit |
| 3031 | `ERROR_DNS_FAILED` | DNS-Auflösung |
| 4001 | `ERROR_STATE_INVALID` | State-Machine-Fehler, geplant für Provisioning v2 |
| 4002 | `ERROR_STATE_TRANSITION` | State-Machine-Fehler |
| 4003 | `ERROR_STATE_MACHINE_STUCK` | State-Machine-Fehler |
| 4010 | `ERROR_OPERATION_TIMEOUT` | Generischer Timeout |
| 4011 | `ERROR_OPERATION_FAILED` | Generischer Fehler |
| 4012 | `ERROR_OPERATION_CANCELLED` | Generische Abbruch |
| 4021 | `ERROR_COMMAND_PARSE_FAILED` | Command-Parsing (4020 ist USED) |
| 4022 | `ERROR_COMMAND_EXEC_FAILED` | Command-Ausführung |
| 4030 | `ERROR_PAYLOAD_INVALID` | Payload-Validierung |
| 4031 | `ERROR_PAYLOAD_TOO_LARGE` | Payload-Größe |
| 4032 | `ERROR_PAYLOAD_PARSE_FAILED` | Payload-Parsing |
| 4040 | `ERROR_MEMORY_FULL` | Memory-Management |
| 4041 | `ERROR_MEMORY_ALLOCATION` | Memory-Allokation |
| 4042 | `ERROR_MEMORY_LEAK` | Memory-Leak-Erkennung |
| 4051 | `ERROR_SYSTEM_RESTART` | System-Restart (4050, 4052 sind USED) |
| 4060 | `ERROR_TASK_FAILED` | FreeRTOS-Task-Fehler |
| 4061 | `ERROR_TASK_TIMEOUT` | FreeRTOS-Task-Timeout |
| 4062 | `ERROR_TASK_QUEUE_FULL` | FreeRTOS-Task-Queue |
| 4201 | `ERROR_APPROVAL_TIMEOUT` | Approval-Timeout (4200 DEVICE_REJECTED ist USED) |
| 4202 | `ERROR_APPROVAL_REVOKED` | Approval-Widerruf |

### 2b. Sichere Entfernungskandidaten

| Code | Makro | Grund |
|------|-------|-------|
| 2020 | `ERROR_LOGGER_INIT_FAILED` | Kein Logger-Subsystem auf ESP32 implementiert |
| 2021 | `ERROR_LOGGER_BUFFER_FULL` | Kein Logger-Subsystem auf ESP32 implementiert |
| 2030 | `ERROR_STORAGE_INIT_FAILED` | Storage-Subsystem existiert nicht (NVS wird direkt genutzt) |
| 2031 | `ERROR_STORAGE_READ_FAILED` | Storage-Subsystem existiert nicht |
| 2032 | `ERROR_STORAGE_WRITE_FAILED` | Storage-Subsystem existiert nicht |

> **Empfehlung:** Diese 5 Codes können sicher entfernt werden.
> Logger und Storage sind abstrakte Konzepte die auf ESP32 nie implementiert wurden.
> NVS-spezifische Codes (2001-2005) decken die Storage-Funktionalität ab.

---

## 3. USED Codes — Referenz

### HARDWARE (1000-1999) — 33 USED

| Code | Makro | Hauptverwendung |
|------|-------|-----------------|
| 1001 | `ERROR_GPIO_RESERVED` | sensor_manager, valve_actuator, pump_actuator |
| 1002 | `ERROR_GPIO_CONFLICT` | main, sensor_manager, actuator_manager |
| 1004 | `ERROR_GPIO_INVALID_MODE` | valve_actuator, pump_actuator |
| 1007 | `ERROR_I2C_TIMEOUT` | i2c_bus |
| 1009 | `ERROR_I2C_CRC_FAILED` | i2c_bus |
| 1010 | `ERROR_I2C_INIT_FAILED` | main, sensor_manager, i2c_bus |
| 1011 | `ERROR_I2C_DEVICE_NOT_FOUND` | sensor_manager, i2c_bus |
| 1012 | `ERROR_I2C_READ_FAILED` | i2c_bus |
| 1013 | `ERROR_I2C_WRITE_FAILED` | i2c_bus |
| 1014 | `ERROR_I2C_BUS_ERROR` | i2c_bus |
| 1016 | `ERROR_I2C_BUS_RECOVERY_STARTED` | i2c_bus |
| 1017 | `ERROR_I2C_BUS_RECOVERY_FAILED` | i2c_bus |
| 1018 | `ERROR_I2C_BUS_RECOVERED` | i2c_bus |
| 1019 | `ERROR_I2C_PROTOCOL_UNSUPPORTED` | i2c_bus |
| 1020 | `ERROR_ONEWIRE_INIT_FAILED` | onewire_bus, sensor_manager |
| 1021 | `ERROR_ONEWIRE_NO_DEVICES` | onewire_bus, sensor_manager |
| 1022 | `ERROR_ONEWIRE_READ_FAILED` | onewire_bus |
| 1023 | `ERROR_ONEWIRE_INVALID_ROM_LENGTH` | sensor_manager, config_manager |
| 1024 | `ERROR_ONEWIRE_INVALID_ROM_FORMAT` | sensor_manager, config_manager |
| 1025 | `ERROR_ONEWIRE_INVALID_ROM_CRC` | sensor_manager, config_manager |
| 1027 | `ERROR_ONEWIRE_BUS_NOT_INITIALIZED` | sensor_manager |
| 1028 | `ERROR_ONEWIRE_READ_TIMEOUT` | sensor_manager |
| 1029 | `ERROR_ONEWIRE_DUPLICATE_ROM` | sensor_manager |
| 1030 | `ERROR_PWM_INIT_FAILED` | main |
| 1031 | `ERROR_PWM_CHANNEL_FULL` | pwm_controller |
| 1032 | `ERROR_PWM_SET_FAILED` | pwm_controller, pwm_actuator |
| 1041 | `ERROR_SENSOR_INIT_FAILED` | main, sensor_manager |
| 1050 | `ERROR_ACTUATOR_SET_FAILED` | pump_actuator |
| 1051 | `ERROR_ACTUATOR_INIT_FAILED` | main, actuator_manager |
| 1052 | `ERROR_ACTUATOR_NOT_FOUND` | actuator_manager |
| 1060 | `ERROR_DS18B20_SENSOR_FAULT` | sensor_manager |
| 1061 | `ERROR_DS18B20_POWER_ON_RESET` | sensor_manager |
| 1062 | `ERROR_DS18B20_OUT_OF_RANGE` | sensor_manager |

### SUBZONE (2500-2506) — 2 USED, 5 RESERVED

| Code | Makro | Status |
|------|-------|--------|
| 2505 | `ERROR_SUBZONE_SAFE_MODE_FAILED` | USED (safety_controller) |
| 2506 | `ERROR_SUBZONE_CONFIG_SAVE_FAILED` | USED (main) |
| 2500-2504 | Validierung/Conflict/NotFound | RESERVED — Server-Side validiert aktuell |

### SERVICE (2000-2032) — 3 USED

| Code | Makro | Hauptverwendung |
|------|-------|-----------------|
| 2003 | `ERROR_NVS_WRITE_FAILED` | main, config_manager |
| 2010 | `ERROR_CONFIG_INVALID` | main (config apply) |
| 2011 | `ERROR_CONFIG_MISSING` | main (config apply) |

### COMMUNICATION (3000-3032) — 16 USED

| Code | Makro | Hauptverwendung |
|------|-------|-----------------|
| 3001 | `ERROR_WIFI_INIT_FAILED` | wifi_manager, provision_manager |
| 3002 | `ERROR_WIFI_CONNECT_TIMEOUT` | wifi_manager |
| 3004 | `ERROR_WIFI_DISCONNECT` | wifi_manager, http_client |
| 3005 | `ERROR_WIFI_NO_SSID` | wifi_manager |
| 3010 | `ERROR_MQTT_INIT_FAILED` | mqtt_client |
| 3011 | `ERROR_MQTT_CONNECT_FAILED` | mqtt_client |
| 3012 | `ERROR_MQTT_PUBLISH_FAILED` | health_monitor, sensor_manager, mqtt_client |
| 3013 | `ERROR_MQTT_SUBSCRIBE_FAILED` | mqtt_client |
| 3014 | `ERROR_MQTT_DISCONNECT` | mqtt_client |
| 3015 | `ERROR_MQTT_BUFFER_FULL` | mqtt_client |
| 3016 | `ERROR_MQTT_PAYLOAD_INVALID` | mqtt_client |
| 3020 | `ERROR_HTTP_INIT_FAILED` | http_client, pi_enhanced_processor |
| 3021 | `ERROR_HTTP_REQUEST_FAILED` | http_client |
| 3022 | `ERROR_HTTP_RESPONSE_INVALID` | http_client |
| 3023 | `ERROR_HTTP_TIMEOUT` | http_client |
| 3032 | `ERROR_CONNECTION_LOST` | http_client |

### APPLICATION (4000-4202) — 7 USED

| Code | Makro | Hauptverwendung |
|------|-------|-----------------|
| 4020 | `ERROR_COMMAND_INVALID` | actuator_manager, pwm_actuator |
| 4050 | `ERROR_SYSTEM_INIT_FAILED` | main, provision_manager |
| 4052 | `ERROR_SYSTEM_SAFE_MODE` | provision_manager |
| 4070 | `ERROR_WATCHDOG_TIMEOUT` | main |
| 4071 | `ERROR_WATCHDOG_FEED_BLOCKED` | main |
| 4072 | `ERROR_WATCHDOG_FEED_BLOCKED_CRITICAL` | main |
| 4200 | `ERROR_DEVICE_REJECTED` | main |

---

## 4. Entscheidungsmatrix

| Aktion | Codes | Anzahl |
|--------|-------|--------|
| **USED** — Keine Aktion | Siehe Sektion 3 | 61 |
| **RESERVED** — Behalten, als RESERVED markieren | Sektion 2a | 45 |
| **Sicher entfernbar** — Kein Subsystem vorhanden | 2020, 2021, 2030, 2031, 2032 | 5 |
| **NIEMALS entfernen** — Subzone-System | 2500-2506 | 7 |

---

*Nächste Analyse: Server Error Codes (5000-5999) nach Bedarf.*
