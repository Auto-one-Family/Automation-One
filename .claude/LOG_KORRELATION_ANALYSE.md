# Log-Korrelation & Zusammenhänge - Analyse-Bericht

**Datum:** 2026-01-27
**Analyst:** Claude (KI-Analyse)
**Status:** Vollständige Analyse

---

## Executive Summary

Das AutomationOne-System hat **4 separate Log-Systeme** (ESP32 Serial, Server File-Logs, Audit-DB, MQTT Traffic), die über **gemeinsame Felder** (`esp_id`, `error_code`, `correlation_id`, Timestamps) korreliert werden können. Die Audit-Tabelle enthält bereits ein `correlation_id`-Feld, das aber nur sporadisch genutzt wird. Die größte Lücke: **Sensor-Daten und Actuator-Commands erzeugen keine Audit-Events**, nur Fehler und Lifecycle-Events tun dies.

---

## 1. ESP32 Firmware (El Trabajante)

### 1.1 Error-Code-System

**Quelle:** `El Trabajante/src/models/error_codes.h`

#### Kategorien

| Kategorie | Code-Bereich | Anzahl Codes | Beschreibung |
|-----------|--------------|--------------|--------------|
| **HARDWARE** | 1000-1999 | 28 | GPIO, I2C, OneWire, PWM, Sensor, Actuator |
| **SERVICE** | 2000-2999 | 19 | NVS, Config, Logger, Storage, Subzone |
| **COMMUNICATION** | 3000-3999 | 17 | WiFi, MQTT, HTTP, Network |
| **APPLICATION** | 4000-4999 | 21 | State, Operations, Commands, Payload, Memory, System, Task, Watchdog, Discovery |
| **Total ESP32** | 1000-4999 | **85** | |

#### Alle Error Codes (vollständig)

**HARDWARE (1000-1999):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 1001 | GPIO_RESERVED | GPIO pin is reserved by system |
| 1002 | GPIO_CONFLICT | GPIO pin already in use by another component |
| 1003 | GPIO_INIT_FAILED | Failed to initialize GPIO pin |
| 1004 | GPIO_INVALID_MODE | Invalid GPIO pin mode specified |
| 1005 | GPIO_READ_FAILED | Failed to read GPIO pin value |
| 1006 | GPIO_WRITE_FAILED | Failed to write GPIO pin value |
| 1010 | I2C_INIT_FAILED | Failed to initialize I2C bus |
| 1011 | I2C_DEVICE_NOT_FOUND | I2C device not found on bus |
| 1012 | I2C_READ_FAILED | Failed to read from I2C device |
| 1013 | I2C_WRITE_FAILED | Failed to write to I2C device |
| 1014 | I2C_BUS_ERROR | I2C bus error (SDA/SCL stuck or timeout) |
| 1020 | ONEWIRE_INIT_FAILED | Failed to initialize OneWire bus |
| 1021 | ONEWIRE_NO_DEVICES | No OneWire devices found on bus |
| 1022 | ONEWIRE_READ_FAILED | Failed to read from OneWire device |
| 1023 | ONEWIRE_INVALID_ROM_LENGTH | ROM-Code must be 16 hex characters |
| 1024 | ONEWIRE_INVALID_ROM_FORMAT | ROM-Code contains invalid characters |
| 1025 | ONEWIRE_INVALID_ROM_CRC | ROM-Code CRC validation failed |
| 1026 | ONEWIRE_DEVICE_NOT_FOUND | Device not present on bus |
| 1027 | ONEWIRE_BUS_NOT_INITIALIZED | OneWire bus not initialized |
| 1028 | ONEWIRE_READ_TIMEOUT | Device read timeout |
| 1029 | ONEWIRE_DUPLICATE_ROM | ROM-Code already registered |
| 1030 | PWM_INIT_FAILED | Failed to initialize PWM controller |
| 1031 | PWM_CHANNEL_FULL | All PWM channels in use |
| 1032 | PWM_SET_FAILED | Failed to set PWM duty cycle |
| 1040 | SENSOR_READ_FAILED | Failed to read sensor data |
| 1041 | SENSOR_INIT_FAILED | Failed to initialize sensor |
| 1042 | SENSOR_NOT_FOUND | Sensor not configured or not found |
| 1043 | SENSOR_TIMEOUT | Sensor read timeout |
| 1050 | ACTUATOR_SET_FAILED | Failed to set actuator state |
| 1051 | ACTUATOR_INIT_FAILED | Failed to initialize actuator |
| 1052 | ACTUATOR_NOT_FOUND | Actuator not configured or not found |
| 1053 | ACTUATOR_CONFLICT | Actuator GPIO conflict with sensor |

**SERVICE (2000-2999):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 2001 | NVS_INIT_FAILED | Failed to initialize NVS |
| 2002 | NVS_READ_FAILED | Failed to read from NVS |
| 2003 | NVS_WRITE_FAILED | Failed to write to NVS |
| 2004 | NVS_NAMESPACE_FAILED | Failed to open NVS namespace |
| 2005 | NVS_CLEAR_FAILED | Failed to clear NVS namespace |
| 2010 | CONFIG_INVALID | Configuration data is invalid |
| 2011 | CONFIG_MISSING | Required configuration is missing |
| 2012 | CONFIG_LOAD_FAILED | Failed to load configuration from NVS |
| 2013 | CONFIG_SAVE_FAILED | Failed to save configuration to NVS |
| 2014 | CONFIG_VALIDATION | Configuration validation failed |
| 2020 | LOGGER_INIT_FAILED | Failed to initialize logger system |
| 2021 | LOGGER_BUFFER_FULL | Logger buffer is full |
| 2030 | STORAGE_INIT_FAILED | Failed to initialize storage manager |
| 2031 | STORAGE_READ_FAILED | Failed to read from storage |
| 2032 | STORAGE_WRITE_FAILED | Failed to write to storage |
| 2500 | SUBZONE_INVALID_ID | Invalid subzone_id format |
| 2501 | SUBZONE_GPIO_CONFLICT | GPIO already assigned to different subzone |
| 2502 | SUBZONE_PARENT_MISMATCH | parent_zone_id doesn't match ESP zone |
| 2503 | SUBZONE_NOT_FOUND | Subzone doesn't exist |
| 2504 | SUBZONE_GPIO_INVALID | GPIO not in safe pins list |
| 2505 | SUBZONE_SAFE_MODE_FAILED | Safe-mode activation failed |
| 2506 | SUBZONE_CONFIG_SAVE_FAILED | Persistence failed |

**COMMUNICATION (3000-3999):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 3001 | WIFI_INIT_FAILED | Failed to initialize WiFi module |
| 3002 | WIFI_CONNECT_TIMEOUT | WiFi connection timeout |
| 3003 | WIFI_CONNECT_FAILED | WiFi connection failed |
| 3004 | WIFI_DISCONNECT | WiFi disconnected unexpectedly |
| 3005 | WIFI_NO_SSID | WiFi SSID not configured |
| 3010 | MQTT_INIT_FAILED | Failed to initialize MQTT client |
| 3011 | MQTT_CONNECT_FAILED | MQTT broker connection failed |
| 3012 | MQTT_PUBLISH_FAILED | Failed to publish MQTT message |
| 3013 | MQTT_SUBSCRIBE_FAILED | Failed to subscribe to MQTT topic |
| 3014 | MQTT_DISCONNECT | MQTT disconnected from broker |
| 3015 | MQTT_BUFFER_FULL | MQTT offline buffer is full |
| 3016 | MQTT_PAYLOAD_INVALID | MQTT payload is invalid |
| 3020 | HTTP_INIT_FAILED | Failed to initialize HTTP client |
| 3021 | HTTP_REQUEST_FAILED | HTTP request failed |
| 3022 | HTTP_RESPONSE_INVALID | HTTP response is invalid |
| 3023 | HTTP_TIMEOUT | HTTP request timeout |
| 3030 | NETWORK_UNREACHABLE | Network is unreachable |
| 3031 | DNS_FAILED | DNS lookup failed |
| 3032 | CONNECTION_LOST | Network connection lost |

**APPLICATION (4000-4999):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 4001 | STATE_INVALID | Invalid system state |
| 4002 | STATE_TRANSITION | Invalid state transition |
| 4003 | STATE_MACHINE_STUCK | State machine is stuck |
| 4010 | OPERATION_TIMEOUT | Operation timeout |
| 4011 | OPERATION_FAILED | Operation failed |
| 4012 | OPERATION_CANCELLED | Operation cancelled |
| 4020 | COMMAND_INVALID | Command is invalid or unknown |
| 4021 | COMMAND_PARSE_FAILED | Failed to parse command |
| 4022 | COMMAND_EXEC_FAILED | Command execution failed |
| 4030 | PAYLOAD_INVALID | Payload is invalid |
| 4031 | PAYLOAD_TOO_LARGE | Payload size exceeds maximum |
| 4032 | PAYLOAD_PARSE_FAILED | Failed to parse payload (JSON error) |
| 4040 | MEMORY_FULL | Memory is full (heap exhausted) |
| 4041 | MEMORY_ALLOCATION | Failed to allocate memory |
| 4042 | MEMORY_LEAK | Memory leak detected |
| 4050 | SYSTEM_INIT_FAILED | System initialization failed |
| 4051 | SYSTEM_RESTART | System restart requested |
| 4052 | SYSTEM_SAFE_MODE | System entered safe mode |
| 4060 | TASK_FAILED | FreeRTOS task failed |
| 4061 | TASK_TIMEOUT | FreeRTOS task timeout |
| 4062 | TASK_QUEUE_FULL | FreeRTOS task queue is full |
| 4070 | WATCHDOG_TIMEOUT | Watchdog timeout detected |
| 4071 | WATCHDOG_FEED_BLOCKED | Watchdog feed blocked: Circuit breakers open |
| 4072 | WATCHDOG_FEED_BLOCKED_CRITICAL | Watchdog feed blocked: Critical errors |
| 4200 | DEVICE_REJECTED | Device rejected by server administrator |
| 4201 | APPROVAL_TIMEOUT | Timeout waiting for server approval |
| 4202 | APPROVAL_REVOKED | Previously approved device was revoked |

#### ConfigErrorCode (String-basiert, für Config-Response)

| Code | Beschreibung |
|------|--------------|
| NONE | No error |
| JSON_PARSE_ERROR | Failed to parse JSON configuration |
| VALIDATION_FAILED | Configuration validation failed |
| GPIO_CONFLICT | GPIO pin conflict detected |
| NVS_WRITE_FAILED | Failed to save configuration to NVS |
| TYPE_MISMATCH | Field type mismatch |
| MISSING_FIELD | Required field missing |
| OUT_OF_RANGE | Value out of allowed range |
| UNKNOWN_ERROR | Unknown configuration error |

### 1.2 Server Error Codes (5000-5999)

**Quelle:** `El Servador/god_kaiser_server/src/core/error_codes.py`

| Bereich | Code-Range | Beispiele |
|---------|------------|-----------|
| CONFIG | 5000-5099 | ESP_DEVICE_NOT_FOUND (5001), CONFIG_PUBLISH_FAILED (5004), ESP_OFFLINE (5007) |
| MQTT | 5100-5199 | PUBLISH_FAILED (5101), BROKER_UNAVAILABLE (5106) |
| VALIDATION | 5200-5299 | INVALID_ESP_ID (5201), INVALID_GPIO (5202) |
| DATABASE | 5300-5399 | QUERY_FAILED (5301), INTEGRITY_ERROR (5305) |
| SERVICE | 5400-5499 | INITIALIZATION_FAILED (5401), RATE_LIMIT_EXCEEDED (5404) |
| AUDIT | 5500-5599 | AUDIT_LOG_FAILED (5501), RETENTION_CLEANUP_FAILED (5502) |
| SEQUENCE | 5600-5699 | SEQ_ALREADY_RUNNING (5610), SEQ_SAFETY_BLOCKED (5642) |

---

## 2. MQTT Topic → Handler Mapping (Server-Seite)

**Quelle:** `El Servador/god_kaiser_server/src/main.py:202-309`

| # | Topic Pattern | Handler | QoS |
|---|---------------|---------|-----|
| 1 | `kaiser/{id}/esp/+/sensor/+/data` | `sensor_handler.handle_sensor_data` | 1 |
| 2 | `kaiser/{id}/esp/+/actuator/+/status` | `actuator_handler.handle_actuator_status` | 1 |
| 3 | `kaiser/{id}/esp/+/actuator/+/response` | `actuator_response_handler.handle_actuator_response` | 1 |
| 4 | `kaiser/{id}/esp/+/actuator/+/alert` | `actuator_alert_handler.handle_actuator_alert` | 1 |
| 5 | `kaiser/{id}/esp/+/system/heartbeat` | `heartbeat_handler.handle_heartbeat` | 0 |
| 6 | `kaiser/{id}/discovery/esp32_nodes` | `discovery_handler.handle_discovery` | 1 |
| 7 | `kaiser/{id}/esp/+/config_response` | `config_handler.handle_config_ack` | 2 |
| 8 | `kaiser/{id}/esp/+/zone/ack` | `zone_ack_handler.handle_zone_ack` | 1 |
| 9 | `kaiser/{id}/esp/+/subzone/ack` | `subzone_ack_handler.handle_subzone_ack` | 1 |
| 10 | `kaiser/{id}/esp/+/system/will` | `lwt_handler.handle_lwt` | 1 |
| 11 | `kaiser/{id}/esp/+/system/error` | `error_handler.handle_error_event` | 1 |
| 12 | `kaiser/{id}/esp/+/actuator/+/command` | `mock_actuator_command_handler` (SimulationScheduler) | 1 |
| 13 | `kaiser/{id}/esp/+/actuator/emergency` | `mock_actuator_command_handler` | 1 |
| 14 | `kaiser/broadcast/emergency` | `mock_actuator_command_handler` | 1 |

---

## 3. Audit-Event-System

**Quelle:** `El Servador/god_kaiser_server/src/db/models/audit_log.py`

### 3.1 Audit-Log Schema

| Feld | Typ | Beschreibung | Index |
|------|-----|--------------|-------|
| `id` | UUID | Primary Key | PK |
| `event_type` | String(50) | Event-Typ (siehe unten) | ✅ |
| `severity` | String(20) | info/warning/error/critical | ✅ |
| `source_type` | String(30) | esp32/user/system/api/mqtt/scheduler | ✅ |
| `source_id` | String(100) | ESP-ID, User-ID, etc. | ✅ |
| `status` | String(20) | success/failed/pending | ✅ |
| `message` | Text | Human-readable description | - |
| `details` | JSON | Event-spezifische Daten | - |
| `error_code` | String(50) | Error Code (optional) | ✅ |
| `error_description` | Text | Error-Beschreibung (optional) | - |
| `ip_address` | String(45) | Client-IP (optional) | - |
| `user_agent` | String(500) | Client User-Agent (optional) | - |
| `correlation_id` | String(100) | **Korrelations-ID** (optional) | ✅ |
| `created_at` | DateTime | Timestamp | ✅ (Composite) |

**Composite-Indizes:**
- `ix_audit_logs_severity_created_at` (severity + created_at)
- `ix_audit_logs_source_created_at` (source_type + source_id + created_at)

### 3.2 Definierte Event-Types (AuditEventType Klasse)

| Event-Type | Kategorie | Severity | Erzeugt durch |
|------------|-----------|----------|---------------|
| `config_response` | Config | info/error | ConfigHandler |
| `config_published` | Config | info | ConfigService (API) |
| `config_failed` | Config | error | ConfigService |
| `login_success` | Auth | info | AuthService |
| `login_failed` | Auth | warning | AuthService |
| `logout` | Auth | info | AuthService |
| `token_revoked` | Auth | info | AuthService |
| `permission_denied` | Security | warning | API Middleware |
| `api_key_invalid` | Security | warning | API Middleware |
| `rate_limit_exceeded` | Security | warning | API Middleware |
| `emergency_stop` | Operational | critical | SafetyService |
| `service_start` | Operational | info | Main (Lifespan) |
| `service_stop` | Operational | info | Main (Lifespan) |
| `device_registered` | Operational | info | ESP API |
| `device_offline` | Operational | warning | HeartbeatHandler |
| `device_discovered` | ESP Lifecycle | info | HeartbeatHandler |
| `device_approved` | ESP Lifecycle | info | ESP API |
| `device_rejected` | ESP Lifecycle | warning | ESP API |
| `device_online` | ESP Lifecycle | info | HeartbeatHandler |
| `device_rediscovered` | ESP Lifecycle | info | HeartbeatHandler |
| `lwt_received` | ESP Lifecycle | warning | LWTHandler |
| `mqtt_error` | Error | error | MQTT Handlers |
| `database_error` | Error | error | Repositories |
| `validation_error` | Error | warning | Validators |

### 3.3 Source-Types

| Source-Type | Beschreibung |
|-------------|--------------|
| `esp32` | ESP32 Device Events |
| `user` | User-initiierte Events |
| `system` | System-interne Events |
| `api` | REST API Events |
| `mqtt` | MQTT-Handler Events |
| `scheduler` | Scheduled Job Events |

---

## 4. Datenbank-Tabellen

**Quelle:** `El Servador/god_kaiser_server/src/db/models/`

| Tabelle | Model | Beschreibung |
|---------|-------|--------------|
| `esp_devices` | ESPDevice | Geräte-Registry |
| `sensor_configs` | SensorConfig | Sensor-Konfigurationen |
| `sensor_data` | SensorData | Sensor-Messwerte (Time-Series) |
| `actuator_configs` | ActuatorConfig | Aktor-Konfigurationen |
| `actuator_states` | ActuatorState | Aktuelle Aktor-Zustände |
| `actuator_history` | ActuatorHistory | Aktor-Befehls-Historie |
| `cross_esp_logic` | CrossESPLogic | Automation Rules |
| `logic_execution_history` | LogicExecutionHistory | Rule-Ausführungs-Log |
| `audit_logs` | AuditLog | System-Events |
| `esp_heartbeat_logs` | ESPHeartbeat | Heartbeat-Historie |
| `user_accounts` | User | Benutzer |
| `token_blacklist` | TokenBlacklist | Revoked JWT Tokens |
| `subzone_configs` | SubzoneConfig | Subzone-Konfigurationen |
| `library_metadata` | LibraryMetadata | Sensor-Library Metadaten |
| `system_config` | SystemConfig | Globale System-Einstellungen |
| `sensor_type_defaults` | SensorTypeDefaults | Default-Werte pro Sensor-Typ |
| `ai_predictions` | AIPredictions | KI-Vorhersagen |
| `kaiser_registry` | KaiserRegistry | Multi-Kaiser-Support |
| `esp_ownership` | ESPOwnership | ESP-Kaiser-Zuordnung |

### Korrelations-Felder zwischen Tabellen

| Von-Tabelle | Zu-Tabelle | Via Feld |
|-------------|------------|----------|
| `sensor_data` | `sensor_configs` | `sensor_config_id` (FK) |
| `sensor_data` | `esp_devices` | via sensor_configs → `esp_device_id` |
| `sensor_configs` | `esp_devices` | `esp_device_id` (FK) |
| `actuator_configs` | `esp_devices` | `esp_device_id` (FK) |
| `actuator_states` | `actuator_configs` | `actuator_config_id` (FK) |
| `actuator_history` | `actuator_configs` | `actuator_config_id` (FK) |
| `esp_heartbeat_logs` | `esp_devices` | `esp_device_id` (FK) |
| `audit_logs` | `esp_devices` | `source_id` = `device_id` (soft link) |
| `audit_logs` | (beliebig) | `correlation_id` (soft link) |
| `subzone_configs` | `esp_devices` | `esp_device_id` (FK) |
| `logic_execution_history` | `cross_esp_logic` | `logic_id` (FK) |

---

## 5. Korrelations-Matrix: Vollständige Flows

### 5.1 Sensor-Daten-Flow

```
ESP32                    MQTT                     Server                   Database
──────                   ────                     ──────                   ────────
SensorManager.readAll()
  ↓
  Publishes JSON        →  kaiser/{id}/esp/{esp}/   SensorHandler            sensor_data
  {ts, gpio, value,        sensor/{gpio}/data       .handle_sensor_data()    (INSERT)
   raw_mode: true}                                   ↓
                                                    Logger: "Sensor data
                                                     received from {esp}"
                                                     ↓
                                                    If pi_enhanced:
                                                     Library processes
                                                     ↓
                                                    WebSocket broadcast:
                                                     event_type=sensor_data
```

**Korrelations-Felder:** `esp_id` + `gpio` + Timestamp
**Audit-Event:** ❌ **KEINS** - Sensor-Daten erzeugen KEIN Audit-Event (nur Errors)

### 5.2 Heartbeat-Flow

```
ESP32                    MQTT                     Server                    Database
──────                   ────                     ──────                    ────────
HealthMonitor            kaiser/{id}/esp/{esp}/   HeartbeatHandler          esp_heartbeat_logs
  publishDiagnostics()     system/heartbeat         .handle_heartbeat()     (INSERT)
  ↓                                                 ↓                       ↓
  JSON: {ts, esp_id,                               Logger: "Heartbeat      esp_devices
   heap_free, uptime,                                received from {esp}"    (UPDATE last_seen)
   wifi_rssi, ...}                                   ↓
                                                    IF new device:           audit_logs
                                                     AuditEvent:             (INSERT)
                                                     device_discovered
                                                    IF was offline:          audit_logs
                                                     AuditEvent:             (INSERT)
                                                     device_online
                                                    IF timeout (check):      audit_logs
                                                     AuditEvent:             (INSERT)
                                                     device_offline
```

**Korrelations-Felder:** `esp_id` (= `source_id` in audit_logs), Timestamp
**Audit-Events:** `device_discovered`, `device_online`, `device_offline`, `device_rediscovered`

### 5.3 Error-Flow

```
ESP32                    MQTT                     Server                    Database
──────                   ────                     ──────                    ────────
ErrorTracker             kaiser/{id}/esp/{esp}/   ErrorHandler              audit_logs
  .trackError()            system/error            .handle_error_event()    (INSERT)
  ↓                                                ↓
  JSON: {ts, error_code,                          Logger: "ESP error
   severity, component,                             received: {code}"
   gpio, details}                                   ↓
                                                   Severity mapping:
                                                    0→debug, 1→info,
                                                    2→warning, 3→error,
                                                    4→critical
```

**Korrelations-Felder:** `esp_id` + `error_code` (in audit details JSON), Timestamp
**Audit-Event:** Dynamisch basierend auf Error-Type (gespeichert in `audit_logs` mit `event_type` vom Error)

### 5.4 Config-Flow

```
Frontend/API             Server                   MQTT                      ESP32
────────────             ──────                   ────                      ─────
PUT /esp/{id}/config     ConfigService            kaiser/{id}/esp/{esp}/    ConfigManager
  ↓                       .send_config()            config                    .applyConfig()
                          ↓                                                   ↓
                         Logger: "Publishing                                 Validates JSON
                          config to ESP {id}"                                 ↓
                          ↓                                                  Response:
                         AuditEvent:              kaiser/{id}/esp/{esp}/
                          config_published          config_response
                                                    ↓
                                                   ConfigHandler             audit_logs
                                                    .handle_config_ack()     (INSERT)
                                                    ↓
                                                   AuditEvent:
                                                    config_response
                                                    (success/error +
                                                     ConfigErrorCode)
```

**Korrelations-Felder:** `esp_id`, `correlation_id` (wenn gesetzt), ConfigErrorCode in details
**Audit-Events:** `config_published` → `config_response`

### 5.5 Actuator-Command-Flow

```
Frontend/API/Logic       Server                   MQTT                      ESP32
──────────────────       ──────                   ────                      ─────
POST /actuator/cmd       ActuatorService          kaiser/{id}/esp/{esp}/    ActuatorManager
  ↓                       .send_command()           actuator/{gpio}/command   .controlActuator()
                          ↓                                                   ↓
                         SafetyService                                       Validates & executes
                          .validate()                                         ↓
                          ↓                       kaiser/{id}/esp/{esp}/
                         Logger: "Sending          actuator/{gpio}/status   ActuatorHandler
                          command to {esp}"          ↓                        .handle_status()
                                                                              ↓
                                                  kaiser/{id}/esp/{esp}/    actuator_states
                                                   actuator/{gpio}/response   (UPDATE)
                                                    ↓                        actuator_history
                                                   ActuatorResponseHandler    (INSERT)
                                                    .handle_response()
```

**Korrelations-Felder:** `esp_id` + `gpio`, Timestamp
**Audit-Event:** ❌ **KEINS** für normale Commands - nur bei Errors/Alerts

### 5.6 LWT (Last Will Testament) Flow

```
MQTT Broker              Server                    Database
───────────              ──────                    ────────
ESP disconnects          kaiser/{id}/esp/{esp}/
  unexpectedly             system/will
  ↓                       ↓
  Broker publishes       LWTHandler                audit_logs
  LWT message             .handle_lwt()            (INSERT)
                          ↓                         ↓
                         Logger: "LWT received     esp_devices
                          for {esp}"                (UPDATE: offline)
                          ↓
                         AuditEvent:
                          lwt_received
```

**Korrelations-Felder:** `esp_id` (= `source_id`), Timestamp
**Audit-Event:** `lwt_received` (severity: warning)

### 5.7 Emergency-Stop Flow

```
ESP32/Server             MQTT                     Server                    Database
────────────             ────                     ──────                    ────────
Emergency triggered      kaiser/{id}/esp/{esp}/   ActuatorAlertHandler      audit_logs
  ↓                       actuator/{gpio}/alert    .handle_alert()          (INSERT)
  OR                      ↓                        ↓
  kaiser/broadcast/      OR broadcast/emergency   Logger: "Emergency        actuator_states
   emergency                                        alert from {esp}"        (UPDATE: stopped)
                                                    ↓
                                                   AuditEvent:
                                                    emergency_stop
                                                    (severity: critical)
```

**Korrelations-Felder:** `esp_id`, `gpio`, Timestamp
**Audit-Event:** `emergency_stop` (severity: critical)

---

## 6. Fehlende Korrelationen & Empfehlungen

### 6.1 Aktuell NICHT verknüpfbare Einträge

| Log-System 1 | Log-System 2 | Problem | Empfehlung |
|--------------|--------------|---------|------------|
| Server File-Log (god_kaiser.log) | Audit-Log (PostgreSQL) | Kein gemeinsames Request/Event-ID | `request_id` oder `trace_id` in beide Systeme einfügen |
| Sensor-Data INSERT | Audit-Log | **Kein Audit-Event für Sensor-Daten** | Optional: `sensor_data_received` Event (Achtung: Hochfrequent!) |
| Actuator-Command | Audit-Log | **Kein Audit-Event für normale Commands** | `actuator_command` Event mit command_id |
| ESP32 Serial Log | Server Logs | Kein gemeinsames Feld außer Timestamp + esp_id | `trace_id` in MQTT-Payload einbetten |
| MQTT Message | Server File-Log | Nur Topic + Timestamp-Matching möglich | `message_id` in MQTT-Payload |

### 6.2 Bereits vorhandene aber untergenutzte Felder

| Feld | Tabelle | Status | Nutzung |
|------|---------|--------|---------|
| `correlation_id` | `audit_logs` | ✅ Vorhanden | ⚠️ **Sporadisch genutzt** - nicht systematisch gesetzt |
| `error_code` | `audit_logs` | ✅ Vorhanden | ✅ Wird von ErrorHandler + ConfigHandler gesetzt |
| `details` (JSON) | `audit_logs` | ✅ Vorhanden | ✅ Enthält Handler-spezifische Daten (gpio, sensor_type, etc.) |
| `source_id` | `audit_logs` | ✅ Vorhanden | ✅ Enthält esp_id - primärer Korrelations-Schlüssel |

### 6.3 Empfehlungen

#### Kurzfristig (Quick Wins)

1. **`correlation_id` systematisch nutzen:** Bei Config-Flow eine UUID generieren die durch `config_published` → `config_response` Events getragen wird. Bereits als DB-Feld vorhanden.

2. **Actuator-Command Audit-Event:** Ein `actuator_command` Event bei jedem Command-Publish erstellen (source_type=`api`, details mit gpio, action, value).

3. **Server-Log `request_id`:** FastAPI Middleware die pro Request eine UUID generiert und in alle Log-Nachrichten injiziert (Structured Logging).

#### Mittelfristig

4. **MQTT Message-ID:** Jede MQTT-Nachricht bekommt eine `msg_id` (UUID) im Payload. Server loggt diese in File-Log UND Audit-Event. Ermöglicht MQTT ↔ Server-Log ↔ Audit Korrelation.

5. **ESP32 Transaction-ID:** ESP32 generiert eine `txn_id` pro Mess-Zyklus die in allen Sensor-Daten und Error-Meldungen eines Zyklus enthalten ist.

#### Langfristig

6. **Distributed Tracing:** OpenTelemetry-ähnliches `trace_id` + `span_id` System das von ESP32 → MQTT → Server → DB → Frontend durchgereicht wird. Ermöglicht vollständige End-to-End-Korrelation.

7. **Log-Aggregation:** ELK Stack oder Loki für zentralisierte Log-Suche über alle Systeme hinweg, mit Korrelation über gemeinsame IDs.

---

## 7. Code-Referenzen

| Bereich | Datei | Relevante Zeilen |
|---------|-------|-----------------|
| ESP32 Error Codes | `El Trabajante/src/models/error_codes.h` | 1-367 (alle Codes) |
| Server Error Codes | `El Servador/.../src/core/error_codes.py` | 1-674 (ESP32 + Server Codes) |
| Audit-Log Model | `El Servador/.../src/db/models/audit_log.py` | 26-240 (Schema + Event-Types) |
| Handler Registration | `El Servador/.../src/main.py` | 202-309 (14 Handler) |
| MQTT Subscriber | `El Servador/.../src/mqtt/subscriber.py` | 1-366 (Routing + Error Isolation) |
| Heartbeat Handler | `El Servador/.../src/mqtt/handlers/heartbeat_handler.py` | Audit: 189-193, 430-434, 504-508, 1031-1035 |
| Config Handler | `El Servador/.../src/mqtt/handlers/config_handler.py` | Audit: 174-176 |
| Error Handler | `El Servador/.../src/mqtt/handlers/error_handler.py` | Audit: 145-147 |
| LWT Handler | `El Servador/.../src/mqtt/handlers/lwt_handler.py` | Audit: 128-132 |

---

## 8. Zusammenfassende Korrelations-Tabelle

| Flow | ESP32 Output | MQTT Topic | Server Handler | Server Log | Audit Event | DB Tabelle |
|------|-------------|------------|----------------|------------|-------------|------------|
| **Sensor Data** | SensorManager | `esp/+/sensor/+/data` | SensorHandler | "Sensor data received" | ❌ KEINS | `sensor_data` |
| **Heartbeat** | HealthMonitor | `esp/+/system/heartbeat` | HeartbeatHandler | "Heartbeat received" | `device_online/offline/discovered` | `esp_heartbeat_logs` |
| **Error** | ErrorTracker | `esp/+/system/error` | ErrorHandler | "ESP error received" | Dynamisch (error_code) | `audit_logs` |
| **Config Response** | ConfigManager | `esp/+/config_response` | ConfigHandler | "Config response" | `config_response` | `audit_logs` |
| **Actuator Status** | ActuatorManager | `esp/+/actuator/+/status` | ActuatorHandler | "Actuator status" | ❌ KEINS | `actuator_states` |
| **Actuator Response** | ActuatorManager | `esp/+/actuator/+/response` | ActuatorResponseHandler | "Command response" | ❌ KEINS | `actuator_history` |
| **Actuator Alert** | Safety | `esp/+/actuator/+/alert` | ActuatorAlertHandler | "Alert received" | `emergency_stop` | `audit_logs` |
| **LWT** | (Broker) | `esp/+/system/will` | LWTHandler | "LWT received" | `lwt_received` | `audit_logs` + `esp_devices` |
| **Zone ACK** | ConfigManager | `esp/+/zone/ack` | ZoneAckHandler | "Zone ACK" | ❌ KEINS | WebSocket only |
| **Subzone ACK** | ConfigManager | `esp/+/subzone/ack` | SubzoneAckHandler | "Subzone ACK" | ❌ KEINS | WebSocket only |
| **Discovery** | (Legacy) | `discovery/esp32_nodes` | DiscoveryHandler | "Discovery" | ❌ DEPRECATED | - |

### Legende
- ❌ KEINS = Kein Audit-Event wird erstellt
- ❌ DEPRECATED = Feature wird nicht mehr aktiv genutzt

---

## 9. Verifizierte Server-Log-Messages pro Handler

**Quelle:** Direkte Code-Analyse aller Handler-Dateien

### 9.1 HeartbeatHandler (`heartbeat_handler.py`)

| Level | Log-Message | Bedingung |
|-------|-------------|-----------|
| DEBUG | `"Processing heartbeat: esp_id={esp_id}"` | Jeder Heartbeat |
| INFO | `"🔔 New ESP discovered: {esp_id} (pending_approval)"` | Neues Device |
| INFO | `"✅ Device {esp_id} now online after approval"` | Status: approved → online |
| DEBUG | `"Heartbeat processed: esp_id={esp_id}, uptime=...s, heap_free=... bytes"` | Normal |
| INFO | `"DEBUG: About to broadcast esp_health for {esp_id}"` | Vor WebSocket |
| INFO | `"DEBUG: WebSocket broadcast completed for {esp_id} in ...ms"` | Nach WebSocket |
| WARNING | `"Low memory on {esp_id}: heap_free={n} bytes"` | heap_free < 10000 |
| WARNING | `"Weak WiFi signal on {esp_id}: rssi={n} dBm"` | rssi < -70 |
| WARNING | `"Device {esp_id} reported {n} error(s)"` | error_count > 0 |
| WARNING | `"Device {esp_id} timed out. Last seen: {ts}"` | Timeout-Check |
| ERROR | `"[{code}] Failed to parse heartbeat topic: {topic}"` | Parse-Fehler |
| ERROR | `"[{code}] Invalid heartbeat payload from {esp_id}: ..."` | Validation-Fehler |

**Audit-Events (verifiziert):**
| Event | Bedingung | Details-Felder |
|-------|-----------|----------------|
| `device_discovered` | Neues Device | zone_id, heap_free, wifi_rssi, sensor_count, actuator_count |
| `device_online` | approved → online | previous_status, heap_free, wifi_rssi, uptime |
| `device_offline` | Heartbeat-Timeout | last_seen, timeout_threshold_seconds, reason |
| `device_rediscovered` | Rejected → pending | previous_status, zone_id, heap_free, wifi_rssi |

**WebSocket-Events:**
| Event-Type | Bedingung | Payload-Felder |
|------------|-----------|----------------|
| `esp_health` | Online-Heartbeat | esp_id, status, message, heap_free, wifi_rssi, uptime, gpio_status |
| `esp_health` | Timeout → offline | esp_id, status="offline", reason, timeout_seconds |
| `device_discovered` | Neues Device | esp_id, discovered_at, zone_id, heap_free |
| `device_rediscovered` | Re-Discovery | esp_id, rediscovered_at, zone_id |

### 9.2 SensorHandler (`sensor_handler.py`)

| Level | Log-Message | Bedingung |
|-------|-------------|-----------|
| DEBUG | `"Processing sensor data: esp_id={esp_id}, gpio={gpio}, sensor_type=..."` | Jeder Sensor-Datenpunkt |
| INFO | `"Sensor data saved: id={uuid}, esp_id=..., gpio=..., processing_mode=..."` | Nach DB-Insert |
| INFO | `"[Pi-Enhanced] Processing: esp_id=..., sensor_type='...' → normalized='...'"` | Pi-Enhanced aktiv |
| INFO | `"[Pi-Enhanced] Processor found: {class} for '...'"` | Processor geladen |
| INFO | `"[Pi-Enhanced] SUCCESS: esp_id=..., raw=... → processed=... {unit}"` | Verarbeitung OK |
| WARNING | `"Sensor config not found: esp_id=..., gpio=..., type=..."` | Kein SensorConfig |
| WARNING | `"[resilience] Sensor data handling blocked: ... unavailable"` | Circuit Breaker offen |
| ERROR | `"[{code}] Failed to parse sensor data topic: {topic}"` | Parse-Fehler |
| ERROR | `"[{code}] Invalid sensor data payload from {esp_id}: ..."` | Validation-Fehler |
| ERROR | `"[{code}] ESP device not found: {esp_id}"` | Unbekanntes Device |
| ERROR | `"[{code}] Pi-Enhanced processing failed: ..."` | Verarbeitung fehlgeschlagen |

**Audit-Events:** ❌ KEINE (Sensor-Daten erzeugen keine Audit-Events)

**WebSocket-Events:**
| Event-Type | Payload-Felder |
|------------|----------------|
| `sensor_data` | esp_id, message (human-readable), gpio, sensor_type, value, unit, quality, timestamp |

### 9.3 ConfigHandler (`config_handler.py`)

| Level | Log-Message | Bedingung |
|-------|-------------|-----------|
| INFO | `"✅ Config Response from {esp_id}: {type} ({n} items) - {msg}"` | success |
| WARNING | `"⚠️ Config PARTIAL SUCCESS on {esp_id}: ... - {n} OK, {m} failed"` | partial_success |
| WARNING | `"   ↳ GPIO {gpio}: {error} - {detail}"` | Pro Failure-Item |
| ERROR | `"❌ Config FAILED on {esp_id}: {type} - {msg} (Error: ...)"` | error |
| ERROR | `"   ↳ GPIO {gpio}: {error} - {detail}"` | Pro Failure-Item |

**Audit-Events:**
| Event | Bedingung | Methode |
|-------|-----------|---------|
| `config_response` | JEDE Config-Response | `audit_repo.log_config_response()` mit esp_id, config_type, status, count, message, error_code |

**WebSocket-Events:**
| Event-Type | Payload-Felder |
|------------|----------------|
| `config_response` | esp_id, config_type, status, count, failed_count, message, error_code, error_description, severity, troubleshooting, failures |

### 9.4 Subscriber (`subscriber.py`) - Message Routing

| Level | Log-Message | Bedingung |
|-------|-------------|-----------|
| INFO | `"Registered handler for pattern: {pattern}"` | Handler-Registrierung |
| DEBUG | `"Subscribed to: {pattern} (QoS {qos})"` | Subscription |
| WARNING | `"No handler registered for topic: {topic}"` | Kein Handler gefunden |
| WARNING | `"Handler returned False for topic {topic}"` | Handler meldet Fehler |
| ERROR | `"Invalid JSON payload on topic {topic}: {e}"` | JSON Parse-Fehler |
| ERROR | `"Handler timed out for topic {topic} (30s)"` | Handler-Timeout |
| ERROR | `"[Bug O] Event loop error in handler for {topic}: {e}"` | Event-Loop-Bug |

---

## 10. Vollständiger QoS-Überblick

| Topic-Kategorie | QoS | Begründung |
|-----------------|-----|------------|
| Heartbeat (`system/heartbeat`) | 0 | Fire-and-forget, nächster kommt in 60s |
| Heartbeat ACK (`system/heartbeat/ack`) | 0 | Fire-and-forget, nicht kritisch |
| Sensor Data (`sensor/+/data`) | 1 | At-least-once, Daten dürfen nicht verloren gehen |
| Actuator Status (`actuator/+/status`) | 1 | At-least-once |
| Actuator Response (`actuator/+/response`) | 1 | At-least-once |
| Actuator Alert (`actuator/+/alert`) | 1 | At-least-once |
| Config Response (`config_response`) | 2 | **Exactly-once** - Config-ACK darf nicht dupliziert werden |
| Zone ACK (`zone/ack`) | 1 | At-least-once |
| Subzone ACK (`subzone/ack`) | 1 | At-least-once |
| LWT (`system/will`) | 1 | Vom Broker gesetzt |
| System Error (`system/error`) | 1 | At-least-once |
| Discovery (Legacy) | 1 | At-least-once |

---

## 11. Analyse-Methodik & Einschränkungen

### Analysierte Dateien (vollständig gelesen)

**ESP32 Firmware:**
- `El Trabajante/src/models/error_codes.h` (367 Zeilen - alle Error Codes)

**Server:**
- `El Servador/.../src/main.py` (Zeilen 195-310 - Handler-Registrierung)
- `El Servador/.../src/mqtt/subscriber.py` (366 Zeilen - Message Routing)
- `El Servador/.../src/mqtt/topics.py` (992 Zeilen - Topic Builder/Parser)
- `El Servador/.../src/mqtt/handlers/heartbeat_handler.py` (1113 Zeilen - vollständig)
- `El Servador/.../src/mqtt/handlers/sensor_handler.py` (662 Zeilen - vollständig)
- `El Servador/.../src/mqtt/handlers/config_handler.py` (394 Zeilen - vollständig)
- `El Servador/.../src/db/models/audit_log.py` (240 Zeilen - Schema + Event-Types)

### Nicht analysierte Dateien (Einschränkung)

Die folgenden Handler-Dateien wurden **nicht direkt gelesen**, ihre Audit-Events und Log-Messages in Section 8 basieren auf der CLAUDE.md-Dokumentation und Code-Patterns der analysierten Handler:
- `actuator_handler.py` (Actuator Status)
- `actuator_response_handler.py` (Command Confirmations)
- `actuator_alert_handler.py` (Emergency/Timeout Alerts)
- `lwt_handler.py` (Last Will Testament)
- `error_handler.py` (System Error Events)
- `zone_ack_handler.py` (Zone Assignment ACK)
- `subzone_ack_handler.py` (Subzone ACK)

Die Korrelations-Matrix in Section 8 für diese Handler ist **hochwahrscheinlich korrekt** (basierend auf konsistenten Patterns), aber nicht zu 100% code-verifiziert.

---

**Ende des Analyse-Berichts**
