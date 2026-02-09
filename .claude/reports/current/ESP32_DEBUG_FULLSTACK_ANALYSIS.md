# ESP32 Debug Agent – Full-Stack Analysis Report

**Erstellt:** 2026-02-08
**Zweck:** Vollstaendige Bestandsaufnahme des ESP32-Debug-Stacks fuer Agent-Neuerstellung
**Methode:** Automatisierte Codebase-Exploration ueber 4 parallele Agenten

---

## 1. Ist-Zustand des aktuellen Agenten + Skills

### 1.1 Agent-Datei (`.claude/agents/esp32-debug.md`)

| Aspekt | Wert |
|--------|------|
| **Tools** | Read, Grep, Glob, Bash |
| **Model** | sonnet |
| **Primaerquelle** | `logs/current/esp32_serial.log` |
| **Report-Output** | `.claude/reports/current/ESP32_DEBUG_REPORT.md` |
| **Modi** | A (Allgemeine Analyse), B (Spezifisches Problem) |
| **SESSION_BRIEFING** | Optional (nutzt wenn vorhanden) |
| **STATUS.md** | Optional |

**Kernbereich:**
- ESP32 Serial-Output (Boot, WiFi, MQTT, Sensoren, Aktoren)
- Firmware-Verhalten (16-Schritt Boot-Sequenz)
- Error-Codes 1000-4999
- Hardware-Probleme (GPIO, I2C, OneWire, PWM)
- SafeMode-Trigger (5 Ausloeser)
- Circuit Breaker (MQTT: 5 failures → OPEN, WiFi: 10 → 60s)
- Watchdog-Events (4070-4072)
- NVS-Persistenz (5 Namespaces)

**Erweiterte Faehigkeiten (Eigenanalyse):**
- MQTT-Traffic pruefen via `mosquitto_sub`
- Server-Health via `curl`
- Docker-Status via `docker compose ps`
- DB-Device-Check via `docker exec psql`
- Server-Log scannen via Grep

**Sicherheitsregeln:**
- `mosquitto_sub` IMMER mit `-C N` UND `-W N`
- `docker compose logs` IMMER mit `--tail=N`
- Kein Container starten/stoppen
- `pio run -t erase` und `pio run -t upload` nur mit Bestaetigung

### 1.2 Skill-Datei (`.claude/skills/esp32-debug/SKILL.md`)

- 413 Zeilen, kompakte Wissensdatenbank
- Quick Reference mit Grep-Patterns
- Boot-Sequenz (16 Schritte mit Code-Locations)
- SafeMode-Trigger (5 mit Zeilen-Referenzen)
- Datenfluss Sensor → Server
- Error-Code Vollreferenz (1000-4999)
- Error-Meldung an Server (MQTT-Topic + Payload)
- Circuit Breaker Details (MQTT + WiFi)
- Log-Location & Analyse (Primaer + Sekundaer)
- Grep-Patterns fuer 8 Kategorien
- 4 Diagnose-Workflows
- Cross-Layer Eigenanalyse (8 Szenarien)
- Report-Format Template

### 1.3 Geplante Aenderungen (Agentplan.md)

| Aspekt | IST | SOLL |
|--------|-----|------|
| Tools | Read, Grep, Glob | Read, Grep, Glob, **Bash** |
| TM-Abhaengigkeit | Flexibel | Bleibt flexibel |
| SESSION_BRIEFING | Optional | Bleibt optional |
| Delegation | Eigenstaendig | Bleibt eigenstaendig |
| Report-Name | ESP32_DEBUG_REPORT.md | Bleibt |
| Modi | A/B automatisch | Bleibt |

**Hinweis:** Der Agent hat bereits Bash-Tool und die meisten SOLL-Anforderungen implementiert. Die Agentplan.md beschreibt den Zustand VOR der letzten Ueberarbeitung. Der aktuelle Agent ist bereits auf dem SOLL-Stand.

**Offene Luecken laut Agentplan Phase 4:**
- L1: Wokwi-Simulation nicht erwähnt (Mittel) → bereits in Agent Section 3 ergaenzt
- L2: NVS-Persistenz-Check fehlt (Niedrig)
- L3: Circuit-Breaker-Status nicht aktiv pruefbar (Niedrig) → Grep-Patterns existieren

---

## 2. Vollstaendige Stack-Map

### 2.1 Docker-Services

| Service | Container-Name | Image | Ports | Health-Check |
|---------|---------------|-------|-------|--------------|
| `postgres` | automationone-postgres | postgres:16-alpine | 5432:5432 | `pg_isready` (10s/5s/5) |
| `mqtt-broker` | automationone-mqtt | eclipse-mosquitto:2 | 1883:1883, 9001:9001 | `mosquitto_sub $SYS` (30s/10s/3) |
| `el-servador` | automationone-server | Custom (Dockerfile) | 8000:8000 | `curl /health/live` (30s/10s/3, start: 30s) |
| `el-frontend` | automationone-frontend | Custom (Dockerfile) | 5173:5173 | `node fetch` (30s/10s/3, start: 30s) |

**Netzwerk:** `automationone-net` (bridge)
**Volumes:** `postgres_data`, `mosquitto_data` (named), diverse Bind-Mounts fuer Logs

**KRITISCH fuer Debug-Agent:**
- Service-Name ist `mqtt-broker` (NICHT `mosquitto`)
- Service-Name ist `el-servador` (NICHT `god-kaiser-server`)
- Container-Name ist `automationone-postgres` (fuer `docker exec`)

### 2.2 Log-Verzeichnisse

| Pfad | Inhalt | Erstellt durch | Format |
|------|--------|----------------|--------|
| `logs/current/esp32_serial.log` | ESP32 Serial-Output | User (manuell) | Text `[timestamp] [LEVEL] message` |
| `logs/current/god_kaiser.log` | Server-Log (Symlink) | start_session.sh | JSON (eine Zeile pro Event) |
| `logs/current/mqtt_traffic.log` | MQTT-Traffic Capture | start_session.sh | `[ISO-timestamp] topic payload` |
| `logs/current/STATUS.md` | Session-Kontext | start_session.sh | Markdown |
| `logs/current/.session_info` | Session-Metadata | start_session.sh | Bash-Variablen |
| `logs/server/god_kaiser.log` | Server-Log (persistent) | el-servador Container | JSON |
| `logs/mqtt/mosquitto.log` | Broker-Log (persistent) | mqtt-broker Container | Text |
| `logs/wokwi/*.log` | Wokwi-Szenario-Logs | Wokwi-CLI | Text mit Prefix-Tags |
| `logs/backend/` | Docker JSON-Logs | Docker Logging Driver | JSON |
| `logs/frontend/` | Docker JSON-Logs | Docker Logging Driver | JSON |
| `logs/postgres/` | PostgreSQL-Logs | postgres Container | Text/Binary |
| `logs/archive/` | Archivierte Sessions | start_session.sh | Kopien aller Logs |

### 2.3 MQTT-Topics (ESP32-relevant)

#### ESP32 publiziert (ESP → Server)

| Topic | QoS | Zweck | Payload-Felder |
|-------|-----|-------|----------------|
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` | 1 | Sensor-Rohdaten | raw_value, processed_value, unit, quality, timestamp |
| `kaiser/god/esp/{esp_id}/sensor/batch` | 1 | Batch-Sensor-Daten | sensors[], timestamp |
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/response` | 1 | Sensor-Command-Antwort | gpio, sensor_type, status, message |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/status` | 1 | Actuator-Status | gpio, state, value, duration, timestamp |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/response` | 1 | Command-Bestaetigung | gpio, command, status, message |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert` | 1 | Safety-Alert | gpio, alert_type, message, severity |
| `kaiser/god/esp/{esp_id}/system/heartbeat` | 0 | Online-Status | uptime, heap_free, wifi_rssi, timestamp |
| `kaiser/god/esp/{esp_id}/system/error` | 1 | Error-Meldung | error_code, message, context, timestamp |
| `kaiser/god/esp/{esp_id}/system/will` | 1 | LWT (Offline) | status, reason, timestamp |
| `kaiser/god/esp/{esp_id}/system/diagnostics` | 0 | Diagnose-Daten | sensors_count, actuators_count, uptime, heap |
| `kaiser/god/esp/{esp_id}/config_response` | 2 | Config-ACK | config_type, status, message |
| `kaiser/god/esp/{esp_id}/zone/ack` | 1 | Zone-Bestaetigung | zone_id, status |
| `kaiser/god/esp/{esp_id}/subzone/ack` | 1 | Subzone-Bestaetigung | subzone_id, status |
| `kaiser/god/esp/{esp_id}/safe_mode` | 1 | SafeMode-Status | mode, reason |
| `kaiser/god/esp/{esp_id}/mqtt/auth_status` | 1 | Auth-Status | auth_status |
| `kaiser/god/esp/{esp_id}/status` | 1 | Online-Status | online_status |

#### ESP32 abonniert (Server → ESP)

| Topic | QoS | Zweck |
|-------|-----|-------|
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/command` | 2 | Sensor-Messung ausloesen |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` | 2 | Actuator-Steuerung (ON/OFF/PWM/TOGGLE) |
| `kaiser/god/esp/{esp_id}/actuator/emergency` | 1 | ESP-spezifischer Emergency-Stop |
| `kaiser/god/esp/{esp_id}/system/command` | 2 | System-Befehle (restart, reset) |
| `kaiser/god/esp/{esp_id}/system/heartbeat/ack` | 0 | Heartbeat-Bestaetigung |
| `kaiser/god/esp/{esp_id}/config` | 2 | Konfigurations-Push |
| `kaiser/god/esp/{esp_id}/zone/assign` | 1 | Zone zuweisen |
| `kaiser/god/esp/{esp_id}/subzone/assign` | 1 | Subzone zuweisen |
| `kaiser/god/esp/{esp_id}/subzone/remove` | 1 | Subzone entfernen |
| `kaiser/god/esp/{esp_id}/subzone/safe` | 1 | Subzone SafeMode |
| `kaiser/god/esp/{esp_id}/mqtt/auth_update` | 1 | MQTT-Credentials update |
| `kaiser/broadcast/emergency` | 2 | Globaler Emergency-Stop (alle ESPs) |

### 2.4 Health-Endpoints

| Endpoint | Methode | Auth | Zweck |
|----------|---------|------|-------|
| `/api/v1/health/live` | GET | Keine | Liveness-Probe (Kubernetes) |
| `/api/v1/health/ready` | GET | Keine | Readiness-Probe |
| `/api/v1/health/` | GET | Keine | Basis-Health |
| `/api/v1/health/detailed` | GET | JWT | Vollstaendiger Health-Check (DB, MQTT, WS, CPU, RAM) |
| `/api/v1/health/esp` | GET | JWT | ESP-Device-Zusammenfassung |
| `/api/v1/health/metrics` | GET | JWT | Prometheus-Metriken |

**Fuer Debug-Agent relevant:**
- `/health/live` → Schnelltest ohne Auth
- `/health/detailed` → Vollstaendige Systeminfo (DB-Status, MQTT-Status, WebSocket-Connections, ESP-Health)

### 2.5 Wokwi-Simulation

**Konfiguration:** `El Trabajante/wokwi.toml`
- Firmware: `.pio/build/wokwi_simulation/firmware.bin`
- Serial-Port: rfc2217://localhost:4000
- Network Gateway: true (Zugriff auf Host-MQTT via `host.wokwi.internal`)
- Baud: 115200

**Build-Environment:** `[env:wokwi_simulation]` in platformio.ini
- Erbt von `env:esp32_dev`
- Zusaetzliche Flags: `WOKWI_SIMULATION=1`, `WOKWI_WIFI_SSID="Wokwi-GUEST"`, `WOKWI_ESP_ID="ESP_00000001"`

**Szenarien:** 163 YAML-Dateien in 13 Kategorien
| Kategorie | Anzahl | Fokus |
|-----------|--------|-------|
| Boot | 2 | Startup, SafeMode |
| Sensor | 5 | DS18B20, Analog, DHT22, Calibration |
| Actuator | 7 | LED, PWM, Relay, Emergency, Sequence, Timeout |
| Zone | 2 | Zone/Subzone Assignment |
| Emergency | 3 | Broadcast, ESP-spezifisch, Recovery |
| Configuration | 2 | Sensor/Actuator Config Push |
| Combined | 2 | Boot-to-Sensor, Boot-to-Actuator |
| I2C | 20 | Bus-Init, Device-Detection, Sensors |
| OneWire | 29 | DS18B20, Protocol, CRC, Multiple Devices |
| Hardware | 9 | Board-Detection, Pin-Mapping |
| PWM | 18 | Duty Cycle, Frequency, Resolution |
| NVS | 40 | Read/Write, Persistence, Corruption |
| GPIO | 24 | Safety, Conflicts, Interrupts |

---

## 3. Alle Code-Locations mit exakten Pfaden

### 3.1 ESP32 Firmware (El Trabajante)

**Basis-Pfad:** `El Trabajante/src/`
**Gesamt:** 98 Source-Dateien (.cpp + .h)

#### Core System

| Datei | Pfad | Klasse/Zweck |
|-------|------|--------------|
| main.cpp | `src/main.cpp` | Entry-Point, setup()/loop(), 16-Schritt Boot |
| application.cpp/h | `src/core/application.cpp` | Application Lifecycle |
| main_loop.cpp/h | `src/core/main_loop.cpp` | Event-Loop, Task-Scheduling |
| system_controller.cpp/h | `src/core/system_controller.cpp` | System-Steuerung |

#### Drivers (Hardware-Abstraktion)

| Datei | Pfad | Klasse | Key Methods |
|-------|------|--------|-------------|
| gpio_manager.cpp/h | `src/drivers/gpio_manager.cpp` | GPIOManager (Singleton) | `initializeAllPinsToSafeMode()`, `requestPin()`, `releasePin()`, `isReserved()` |
| i2c_bus.cpp/h | `src/drivers/i2c_bus.cpp` | I2CBus (Singleton) | `begin()`, `scan()`, `readRegister()`, `writeRegister()` |
| i2c_sensor_protocol.cpp/h | `src/drivers/i2c_sensor_protocol.cpp` | I2C Sensor-Protokoll | I2C-Level Kommunikation |
| onewire_bus.cpp/h | `src/drivers/onewire_bus.cpp` | OneWireBus (Singleton) | `begin()`, `search()`, `readTemperature()` |
| pwm_controller.cpp/h | `src/drivers/pwm_controller.cpp` | PWMController (Singleton) | `attachPin()`, `setDutyCycle()`, `setFrequency()` |

#### Communication Services

| Datei | Pfad | Klasse | Key Methods |
|-------|------|--------|-------------|
| mqtt_client.cpp/h | `src/services/communication/mqtt_client.cpp` | MQTTClient (Singleton) | `connect()`, `publish()`, `safePublish()`, `subscribe()`, `reconnect()` |
| wifi_manager.cpp/h | `src/services/communication/wifi_manager.cpp` | WiFiManager (Singleton) | `connect()`, `isConnected()`, `getSignalStrength()` |
| http_client.cpp/h | `src/services/communication/http_client.cpp` | HTTPClient | HTTP-Requests |
| network_discovery.cpp/h | `src/services/communication/network_discovery.cpp` | NetworkDiscovery | mDNS |
| webserver.cpp/h | `src/services/communication/webserver.cpp` | WebServer | Provisioning-Portal |

#### Config Services

| Datei | Pfad | Klasse | Key Methods |
|-------|------|--------|-------------|
| storage_manager.cpp/h | `src/services/config/storage_manager.cpp` | StorageManager (Singleton) | `begin()`, `putString()`, `getString()`, `putInt()`, `getInt()` |
| config_manager.cpp/h | `src/services/config/config_manager.cpp` | ConfigManager (Singleton) | `loadSystemConfig()`, `saveSystemConfig()`, `applyConfig()` |
| config_response.cpp/h | `src/services/config/config_response.cpp` | ConfigResponse | Config-ACK Builder |
| library_manager.cpp/h | `src/services/config/library_manager.cpp` | LibraryManager | Sensor-Library-Management |
| wifi_config.cpp/h | `src/services/config/wifi_config.cpp` | WiFiConfig | WiFi-Konfiguration |

#### Sensor Services

| Datei | Pfad | Klasse | Key Methods |
|-------|------|--------|-------------|
| sensor_manager.cpp/h | `src/services/sensor/sensor_manager.cpp` | SensorManager (Singleton) | `addSensor()`, `removeSensor()`, `getSensorReadings()`, `loop()` |
| sensor_factory.cpp/h | `src/services/sensor/sensor_factory.cpp` | SensorFactory | `createSensorDriver()` (Factory Pattern) |
| pi_enhanced_processor.cpp/h | `src/services/sensor/pi_enhanced_processor.cpp` | PiEnhancedProcessor | Raw-Daten-Kompensation |

#### Sensor-Treiber

| Datei | Pfad | Sensor-Typ |
|-------|------|------------|
| isensor_driver.h | `src/services/sensor/sensor_drivers/isensor_driver.h` | Interface (Abstract) |
| temp_sensor_ds18b20.cpp/h | `src/services/sensor/sensor_drivers/temp_sensor_ds18b20.cpp` | DS18B20 (OneWire) |
| temp_sensor_sht31.cpp/h | `src/services/sensor/sensor_drivers/temp_sensor_sht31.cpp` | SHT31 (I2C) |
| ph_sensor.cpp/h | `src/services/sensor/sensor_drivers/ph_sensor.cpp` | pH-Sensor (Analog) |
| i2c_sensor_generic.cpp/h | `src/services/sensor/sensor_drivers/i2c_sensor_generic.cpp` | Generischer I2C-Sensor |

#### Actuator Services

| Datei | Pfad | Klasse | Key Methods |
|-------|------|--------|-------------|
| actuator_manager.cpp/h | `src/services/actuator/actuator_manager.cpp` | ActuatorManager (Singleton) | `addActuator()`, `setValue()`, `setBinary()`, `loop()` |
| safety_controller.cpp/h | `src/services/actuator/safety_controller.cpp` | SafetyController (Singleton) | `emergencyStopAll()`, `clearEmergencyStop()`, `isolateSubzone()` |

#### Actuator-Treiber

| Datei | Pfad | Typ |
|-------|------|-----|
| iactuator_driver.h | `src/services/actuator/actuator_drivers/iactuator_driver.h` | Interface (Abstract) |
| pump_actuator.cpp/h | `src/services/actuator/actuator_drivers/pump_actuator.cpp` | Pump (GPIO/PWM) |
| valve_actuator.cpp/h | `src/services/actuator/actuator_drivers/valve_actuator.cpp` | Valve (GPIO) |
| pwm_actuator.cpp/h | `src/services/actuator/actuator_drivers/pwm_actuator.cpp` | PWM-Actuator |

#### Error Handling

| Datei | Pfad | Klasse | Key Methods |
|-------|------|--------|-------------|
| error_tracker.cpp/h | `src/error_handling/error_tracker.cpp` | ErrorTracker (Singleton) | `reportError()`, `reportWarning()`, `reportCritical()` |
| health_monitor.cpp/h | `src/error_handling/health_monitor.cpp` | HealthMonitor (Singleton) | `captureSnapshot()`, `isHealthy()` |
| circuit_breaker.cpp/h | `src/error_handling/circuit_breaker.cpp` | CircuitBreaker | `attempt()`, State: CLOSED/OPEN/HALF_OPEN |

#### Utilities

| Datei | Pfad | Klasse | Key Methods |
|-------|------|--------|-------------|
| topic_builder.cpp/h | `src/utils/topic_builder.cpp` | TopicBuilder | `buildSensorDataTopic()`, `buildActuatorCommandTopic()`, `buildHeartbeatTopic()` |
| logger.cpp/h | `src/utils/logger.cpp` | Logger (Singleton) | `info()`, `warning()`, `error()`, `logError()` |
| data_buffer.cpp/h | `src/utils/data_buffer.cpp` | DataBuffer | Circular Buffer |
| time_manager.cpp/h | `src/utils/time_manager.cpp` | TimeManager | NTP-Synchronisation |
| json_helpers.h | `src/utils/json_helpers.h` | JSON-Utilities | ArduinoJson Helpers |
| string_helpers.cpp/h | `src/utils/string_helpers.cpp` | String-Utilities | String-Manipulation |
| onewire_utils.cpp/h | `src/utils/onewire_utils.cpp` | OneWire-Utilities | ROM-Code-Handling |

#### Models (Datenstrukturen)

| Datei | Pfad | Inhalt |
|-------|------|--------|
| error_codes.h | `src/models/error_codes.h` | Alle Error-Codes 1000-4999 |
| sensor_types.h | `src/models/sensor_types.h` | SensorConfig, SensorReading |
| actuator_types.h | `src/models/actuator_types.h` | ActuatorConfig, ActuatorStatus, EmergencyState |
| mqtt_messages.h | `src/models/mqtt_messages.h` | MQTTMessage-Struktur |
| system_state.h | `src/models/system_state.h` | SystemState-Enum (BOOT, RUNNING, SAFE_MODE, ERROR, EMERGENCY) |
| system_types.h | `src/models/system_types.h` | KaiserZone, SystemConfig |
| config_types.h | `src/models/config_types.h` | Konfigurations-Typen |
| watchdog_types.h | `src/models/watchdog_types.h` | Watchdog-Strukturen |
| sensor_registry.cpp/h | `src/models/sensor_registry.cpp` | Sensor-Registry |

#### Konfiguration

| Datei | Pfad | Inhalt |
|-------|------|--------|
| feature_flags.h | `src/config/feature_flags.h` | Feature-Toggles |
| system_config.h | `src/config/system_config.h` | System-Konfiguration |
| esp32_dev.h | `src/config/hardware/esp32_dev.h` | ESP32 Dev Pin-Mapping |
| xiao_esp32c3.h | `src/config/hardware/xiao_esp32c3.h` | Xiao ESP32C3 Pin-Mapping |

### 3.2 Server MQTT-Handler

**Basis-Pfad:** `El Servador/god_kaiser_server/src/mqtt/handlers/`

| Handler | Datei | Subscribe-Topic | DB-Write | WebSocket-Event |
|---------|-------|-----------------|----------|-----------------|
| SensorDataHandler | `sensor_handler.py` | `kaiser/god/esp/+/sensor/+/data` | SensorData | `sensor_data` |
| ActuatorStatusHandler | `actuator_handler.py` (status) | `kaiser/god/esp/+/actuator/+/status` | ActuatorState | `actuator_status` |
| HeartbeatHandler | `heartbeat_handler.py` | `kaiser/god/esp/+/system/heartbeat` | ESPDevice, ESPHeartbeat | `esp_health`, `device_discovered` |
| ErrorEventHandler | `error_handler.py` | `kaiser/god/esp/+/system/error` | AuditLog | `error_event` |
| ConfigHandler | `config_handler.py` | `kaiser/god/esp/+/config_response` | AuditLog | `config_response` |
| ActuatorResponseHandler | `actuator_response_handler.py` | `kaiser/+/esp/+/actuator/+/response` | CommandHistory | `actuator_response` |
| ActuatorAlertHandler | `actuator_alert_handler.py` | `kaiser/+/esp/+/actuator/+/alert` | ActuatorState, AuditLog | `actuator_alert` |
| LWTHandler | `lwt_handler.py` | `kaiser/+/esp/+/system/will` | ESPDevice (status=offline) | `esp_health` |
| ZoneAckHandler | `zone_ack_handler.py` | `kaiser/+/esp/+/zone/ack` | ESPDevice (zone fields) | `zone_assignment` |
| SubzoneAckHandler | `subzone_ack_handler.py` | `kaiser/+/esp/+/subzone/ack` | Subzone-Service | `subzone_assignment` |
| DiscoveryHandler | `discovery_handler.py` | `kaiser/god/discovery/esp32_nodes` | - | - (DEPRECATED) |

**MQTT-Client:** `El Servador/god_kaiser_server/src/mqtt/client.py`
**Publisher:** `El Servador/god_kaiser_server/src/mqtt/publisher.py`
**TopicBuilder:** `El Servador/god_kaiser_server/src/mqtt/topics.py`

### 3.3 Server Services

**Basis-Pfad:** `El Servador/god_kaiser_server/src/services/`

| Service | Datei | ESP32-Relevanz |
|---------|-------|---------------|
| ESPService | `esp_service.py` | **HOCH** - Device Lifecycle, Approval, Config-Push |
| ActuatorService | `actuator_service.py` | **HOCH** - Command-Dispatch mit Safety |
| SensorService | `sensor_service.py` | **HOCH** - Sensor-Daten, Readings |
| SafetyService | `safety_service.py` | **HOCH** - Actuator-Validierung |
| LogicEngine | `logic_engine.py` | MITTEL - Automation Rules |
| LogicScheduler | `logic_scheduler.py` | MITTEL - Timer-basierte Rules |
| GpioValidationService | `gpio_validation_service.py` | **HOCH** - GPIO-Konflikt-Pruefung |
| ConfigBuilder | `config_builder.py` | **HOCH** - Config-Assembly fuer ESP |
| EventAggregatorService | `event_aggregator_service.py` | MITTEL - Event-Konsolidierung |
| ZoneService | `zone_service.py` | MITTEL - Zone-Management |
| SubzoneService | `subzone_service.py` | MITTEL - Subzone-Lifecycle |

### 3.4 DB-Models

**Basis-Pfad:** `El Servador/god_kaiser_server/src/db/models/`

| Model | Tabelle | ESP32-Relevanz | Schluessel-Felder |
|-------|---------|---------------|-------------------|
| ESPDevice | `esp_devices` | **HOCH** | device_id, status, last_seen, zone_id, hardware_type, capabilities |
| SensorConfig | `sensor_configs` | **HOCH** | esp_id (FK), gpio, sensor_type, interface_type, i2c_address, onewire_address, pi_enhanced |
| SensorData | `sensor_data` | **HOCH** | esp_id, gpio, raw_value, processed_value, unit, quality, timestamp |
| ActuatorConfig | `actuator_configs` | **HOCH** | esp_id (FK), gpio, actuator_type, min_value, max_value, timeout_seconds |
| ActuatorState | `actuator_states` | **HOCH** | esp_id, gpio, state, current_value, last_command |
| ActuatorHistory | `actuator_command_history` | MITTEL | esp_id, gpio, command_type, value, success |
| ESPHeartbeat | `esp_heartbeats` | **HOCH** | esp_uuid (FK), device_id, payload (JSON), data_source |
| AuditLog | `audit_logs` | MITTEL | source_id, event_type, status, severity, details (JSON) |

### 3.5 Repositories

**Basis-Pfad:** `El Servador/god_kaiser_server/src/db/repositories/`

| Repository | Datei | Custom Methods |
|------------|-------|---------------|
| ESPRepository | `esp_repo.py` | `get_by_device_id()`, `update_status()`, `get_pending_devices()`, `get_online_devices()` |
| SensorRepository | `sensor_repo.py` | `get_by_esp_gpio_and_type()`, `save_data()`, `get_recent_data()` |
| ActuatorRepository | `actuator_repo.py` | `get_by_esp_and_gpio()`, `update_state()`, `log_command()` |
| ESPHeartbeatRepository | `heartbeat_repo.py` | `log_heartbeat()`, `get_recent_heartbeats()` |
| AuditLogRepository | `audit_repo.py` | `log_device_event()`, `log_mqtt_error()` |

### 3.6 Relevante Tests

**Basis-Pfad:** `El Servador/god_kaiser_server/tests/`

#### ESP32-Tests (19 Dateien)

| Test | Pfad | Fokus |
|------|------|-------|
| test_sensor.py | `tests/esp32/test_sensor.py` | Sensor-Readings, Calibration |
| test_actuator.py | `tests/esp32/test_actuator.py` | Actuator-Commands, GPIO |
| test_communication.py | `tests/esp32/test_communication.py` | MQTT-Messaging |
| test_boot_loop.py | `tests/esp32/test_boot_loop.py` | Boot-Loop Detection |
| test_gpio_conflict.py | `tests/esp32/test_gpio_conflict.py` | GPIO-Konflikte |
| test_gpio_emergency.py | `tests/esp32/test_gpio_emergency.py` | Emergency-Stop |
| test_i2c_bus.py | `tests/esp32/test_i2c_bus.py` | I2C-Protokoll |
| test_mqtt_last_will.py | `tests/esp32/test_mqtt_last_will.py` | LWT-Erkennung |
| test_mqtt_fallback.py | `tests/esp32/test_mqtt_fallback.py` | MQTT-Fallback |
| test_subzone_management.py | `tests/esp32/test_subzone_management.py` | Subzone-Lifecycle |

#### Integration-Tests (ESP32-relevant, Auswahl)

| Test | Pfad | Fokus |
|------|------|-------|
| test_heartbeat_handler.py | `tests/integration/test_heartbeat_handler.py` | Heartbeat-Verarbeitung |
| test_config_handler.py | `tests/integration/test_config_handler.py` | Config-Push-Flow |
| test_emergency_stop.py | `tests/integration/test_emergency_stop.py` | Emergency-Broadcast |
| test_lwt_handler.py | `tests/integration/test_lwt_handler.py` | LWT-Offline-Erkennung |
| test_mqtt_flow.py | `tests/integration/test_mqtt_flow.py` | MQTT-Message-Chain |
| test_server_esp32_integration.py | `tests/integration/test_server_esp32_integration.py` | Full ESP32-Server Flow |

#### Mock-Infrastruktur

| Datei | Pfad | Zweck |
|-------|------|-------|
| mock_esp32_client.py | `tests/esp32/mocks/mock_esp32_client.py` | Simuliertes ESP32-Verhalten |
| in_memory_mqtt_client.py | `tests/esp32/mocks/in_memory_mqtt_client.py` | Schneller MQTT-Mock |
| real_esp32_client.py | `tests/esp32/mocks/real_esp32_client.py` | Echte Hardware (Fallback) |

---

## 4. Architektur-Abhaengigkeiten und Datenfluesse

### 4.1 Sensor-Data-Flow

```
ESP32 Sensor Hardware (ADC/I2C/OneWire)
  ↓ analogRead() / I2CBus.readRegister() / OneWireBus.readTemperature()
SensorManager.loop() → Liest Sensoren im konfigurierten Intervall
  ↓ SensorConfig.measurement_interval_ms (default: 30000ms)
MQTTClient.safePublish() → QoS 1
  ↓ Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
  ↓ Payload: {raw_value, timestamp, raw_mode: true}
MQTT Broker (mosquitto)
  ↓
SensorDataHandler.handle_sensor_data()
  ├─ TopicBuilder.parse_sensor_data_topic() → esp_id, gpio
  ├─ Validate Payload
  ├─ resilient_session() → Circuit Breaker DB-Zugang
  ├─ ESPRepository.get_by_device_id()
  ├─ SensorRepository.get_by_esp_gpio_and_type()
  ├─ IF pi_enhanced: Process raw → calibrated value
  ├─ SensorRepository.save_data() → INSERT sensor_data
  ├─ session.commit()
  ├─ WebSocketManager.broadcast("sensor_data", {...})
  └─ LogicEngine.evaluate_sensor_data() → Automation Rules
```

**Timing:** 50-230ms End-to-End
**Kein lokaler Buffer:** Wenn MQTT offline → Daten gehen verloren

### 4.2 Heartbeat-Flow

```
ESP32 HealthMonitor.loop() → Alle ~5 Sekunden
  ↓
MQTTClient.publish() → QoS 0
  ↓ Topic: kaiser/god/esp/{esp_id}/system/heartbeat
  ↓ Payload: {esp_id, ts, uptime, heap_free, wifi_rssi}
MQTT Broker
  ↓
HeartbeatHandler.handle_message()
  ├─ Parse Topic → esp_id
  ├─ Lookup ESPDevice in DB
  ├─ IF NOT EXISTS:
  │    ├─ Create ESPDevice (status="pending_approval")
  │    ├─ WebSocket broadcast("device_discovered")
  │    └─ Publish heartbeat_ack (status="pending_approval")
  ├─ IF EXISTS + approved:
  │    ├─ Update status="online", last_seen
  │    ├─ Log ESPHeartbeat (time-series)
  │    └─ WebSocket broadcast("esp_health")
  └─ Publish heartbeat_ack
       ↓ Topic: kaiser/god/esp/{esp_id}/system/heartbeat/ack
ESP32 empfaengt ACK
```

### 4.3 Registration-Flow

```
ESP32 bootet → main.cpp setup()
  ↓ 16 Schritte (GPIO Safe → Storage → Config → WiFi → MQTT)
Erster Heartbeat
  ↓
HeartbeatHandler → Neues Device entdeckt
  ├─ ESPDevice erstellt (status="pending_approval")
  └─ Heartbeat-ACK mit status="pending_approval"
ESP32 arbeitet im eingeschraenkten Modus
  ↓
Admin approved via REST API: POST /esp/{esp_id}/approve
  ↓
ESPService.approve_device()
  ├─ Status → "online"
  ├─ Config-Push (Sensoren, Aktoren, Zone)
  └─ Naechster Heartbeat → normaler Betrieb
```

### 4.4 Actuator-Command-Flow

```
User/Logic-Engine → REST API oder Logic-Action
  ↓
ActuatorService.send_command()
  ├─ SafetyService.validate() → min/max/timeout Check
  ├─ Publisher.publish_actuator_command()
  │    ↓ Topic: kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command
  │    ↓ Payload: {gpio, command, value, duration, correlation_id}
  │    ↓ QoS 2 (exactly once)
MQTT Broker
  ↓
ESP32 empfaengt Command
  ├─ ActuatorManager → GPIO/PWM setzen
  ├─ Publish Status: actuator/{gpio}/status
  └─ Publish Response: actuator/{gpio}/response
  ↓
Server empfaengt Status + Response
  ├─ ActuatorStatusHandler → DB ActuatorState update
  ├─ ActuatorResponseHandler → CommandHistory log
  └─ WebSocket broadcast("actuator_status", "actuator_response")
```

**Timing:** 100-290ms End-to-End

### 4.5 Emergency-Stop-Flow

```
User/Safety-Trigger → POST /actuators/emergency-stop
  ↓
Publisher.publish() → kaiser/broadcast/emergency (QoS 2)
  ↓
ALLE ESPs empfangen gleichzeitig
  ├─ SafetyController.emergencyStopAll()
  ├─ Alle Outputs auf INPUT (de-energize)
  ├─ Publish status="emergency"
  └─ Log critical event
```

**Timing:** < 100ms (kritischer Pfad)

### 4.6 ESP32 Initialisierungs-Reihenfolge

| Phase | Schritt | Modul | Abhaengigkeit |
|-------|---------|-------|---------------|
| 1 | Serial + Boot-Banner | Serial | Keine |
| 2 | Boot-Button Check | GPIO 0 | Keine |
| 3 | GPIO Safe-Mode | GPIOManager | Keine (MUSS ZUERST) |
| 4 | Logger | Logger | Serial |
| 5 | Storage/NVS | StorageManager | Logger |
| 6 | Config Load | ConfigManager | StorageManager |
| 7 | Defensive Repair | ConfigManager | StorageManager |
| 8 | Boot-Loop Detection | ConfigManager | StorageManager (boot_count) |
| 9 | Watchdog Init | System | ConfigManager |
| 10 | Provisioning Check | ProvisionManager | ConfigManager |
| 11 | Error Tracker | ErrorTracker | Logger, TopicBuilder |
| 12 | WiFi | WiFiManager | ConfigManager (SSID/PW) |
| 13 | MQTT | MQTTClient | WiFiManager |
| 14 | Sensor Manager | SensorManager | GPIOManager, I2C/OneWire, MQTT |
| 15 | Actuator Manager | ActuatorManager | GPIOManager, MQTT, SafetyController |
| 16 | Health Monitor | HealthMonitor | Alle Manager |

---

## 5. Error-Code Map (ESP32: 1000-4999, Server: 5000-5699)

### ESP32 Error-Codes

| Range | Kategorie | Haeufigste Codes |
|-------|-----------|-----------------|
| 1000-1009 | GPIO | 1001 (RESERVED), 1002 (CONFLICT), 1003 (INIT_FAILED) |
| 1010-1018 | I2C | 1010 (INIT_FAILED), 1011 (DEVICE_NOT_FOUND), 1014 (TIMEOUT), 1015 (RECOVERY_FAILED) |
| 1019-1029 | OneWire | 1021 (NO_DEVICES), 1022 (CRC_ERROR), 1024 (CONVERSION_TIMEOUT) |
| 1030-1035 | Sensor | 1031 (READ_FAILED), 1032 (OUT_OF_RANGE), 1034 (INVALID_CONFIG) |
| 1060-1063 | DS18B20 | 1060 (NO_DEVICE), 1061 (DISCONNECTED), 1063 (OUT_OF_RANGE) |
| 1070-1075 | Actuator | 1070 (GPIO_FAILED), 1071 (PWM_FAILED), 1072 (LOCKED) |
| 2000-2007 | NVS | 2000 (INIT_FAILED), 2002 (WRITE_FAILED), 2005 (FULL) |
| 2010-2014 | Config | 2010 (LOAD_FAILED), 2012 (INVALID_FORMAT), 2013 (MISSING_FIELD) |
| 2040-2042 | Subzone | 2040 (ASSIGN_FAILED), 2042 (SAFE_MODE_ACTIVE) |
| 3000-3009 | WiFi | 3002 (CONNECT_TIMEOUT), 3005 (CONNECTION_LOST), 3009 (RSSI_WEAK) |
| 3010-3019 | MQTT | 3011 (CONNECT_FAILED), 3014 (PUBLISH_FAILED), 3015 (DISCONNECT) |
| 4000-4003 | State | 4000 (INVALID_TRANSITION), 4003 (PERSISTENCE_FAILED) |
| 4060-4063 | Memory | 4060 (ALLOCATION_FAILED), 4061 (HEAP_CRITICAL) |
| 4070-4074 | Watchdog/Task | 4070 (WDT_TIMEOUT), 4071 (TASK_CREATION_FAILED) |
| 4090-4092 | Boot | 4090 (INVALID_CONFIG), 4092 (SAFE_MODE_REQUIRED) |

### Server Error-Codes (ESP32-relevant)

| Range | Kategorie | Haeufigste |
|-------|-----------|-----------|
| 5001-5003 | Device | ESP_DEVICE_NOT_FOUND (5001), ESP_DEVICE_OFFLINE (5002) |
| 5010-5013 | Entity | SENSOR_NOT_FOUND (5010), ACTUATOR_NOT_FOUND (5011) |
| 5020-5022 | Validation | INVALID_PAYLOAD (5020), VALIDATION_ERROR (5021) |
| 5100-5110 | MQTT | BROKER_DOWN (5100), PUBLISH_FAILED (5101) |
| 5200-5211 | Database | CONNECTION_FAILED (5200), SENSOR_DATA_INSERT_FAILED (5210) |
| 5600-5602 | Internal | CIRCUIT_BREAKER_OPEN (5601), TIMEOUT (5602) |

---

## 6. Modus A – Allgemeine ESP32-Analyse (Schritt fuer Schritt)

### Schritt 1: ESP32 Serial-Log lesen

**Befehl:** `Read logs/current/esp32_serial.log`
**Fallback:** Wenn nicht vorhanden → melde: "ESP32 Serial-Log fehlt. Bitte ESP32 starten."

**Worauf achten:**

| Pruefpunkt | Grep-Pattern | Erwartung | Problem wenn... |
|------------|-------------|-----------|-----------------|
| Boot-Banner | `grep "ESP32 Sensor Network"` | Muss vorhanden sein | Kein Output → Flash korrupt |
| WiFi-Connect | `grep -i "WiFi connected"` | IP-Adresse sichtbar | Timeout → SSID/PW falsch |
| WiFi-RSSI | `grep "RSSI"` | > -70 dBm | < -80 dBm → Zu weit vom Router |
| MQTT-Connect | `grep "MQTT connected"` | Muss vorhanden sein | "rc=" → Broker-Problem |
| Initial Heartbeat | `grep "Initial heartbeat"` | Muss vorhanden sein | Fehlt → MQTT-Publish Problem |
| Subscriptions | `grep "Subscribed to"` | System + Actuator + Zone | Fehlt → MQTT-Problem |
| Alle ERRORs | `grep "\[ERROR"` | Keine | Jeder ERROR dokumentieren |
| Alle CRITICALs | `grep "\[CRITICAL"` | Keine | Sofort eskalieren |
| Alle WARNINGs | `grep "\[WARNING"` | Wenige akzeptabel | Dokumentieren |
| SafeMode | `grep -i "safe.mode\|boot.loop"` | Nicht vorhanden | SafeMode → Ursache finden |
| Circuit Breaker | `grep -i "circuit\|breaker"` | CLOSED | OPEN → Connectivity-Problem |
| Watchdog | `grep -i "watchdog\|wdt\|4070"` | Nicht vorhanden | WDT → System haengt |
| Error-Codes | `grep -E "[0-9]{4}"` | Keine 4-stelligen Codes | Code nachschlagen in ERROR_CODES.md |

### Schritt 2: MQTT-Traffic pruefen

**Befehl:** `mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 10`
**Alternativ:** `Read logs/current/mqtt_traffic.log`

**Worauf achten:**
- Heartbeat-Messages (alle ~5s)
- Sensor-Data (im konfigurierten Intervall)
- Heartbeat-ACK (Server antwortet?)
- Unbekannte Topics
- Fehlende erwartete Topics

### Schritt 3: Server-Handler-Logs pruefen

**Befehl:** `Grep "heartbeat_handler\|sensor_handler\|actuator_handler" logs/server/god_kaiser.log`

**Indikatoren fuer Probleme:**
- `ValidationErrorCode` → Payload-Format falsch
- `ESP_DEVICE_NOT_FOUND` → Device nicht registriert
- `Circuit Breaker OPEN` → DB-Verbindungsproblem
- Stack-Traces/Exceptions → Handler-Fehler

### Schritt 4: DB-Konsistenz pruefen

**Befehle:**
```bash
# Device-Status
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT device_id, status, last_seen FROM esp_devices ORDER BY last_seen DESC LIMIT 5"

# Letzte Sensor-Daten
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT sd.gpio, sd.sensor_type, sd.raw_value, sd.timestamp FROM sensor_data sd ORDER BY sd.created_at DESC LIMIT 10"

# Heartbeat-Timestamps
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT device_id, payload->>'uptime' as uptime, timestamp FROM esp_heartbeats ORDER BY timestamp DESC LIMIT 5"
```

### Schritt 5: Erweiterungsentscheidung

| Finding in Schritt 1-4 | Erweiterung |
|-------------------------|-------------|
| MQTT-Timeout im Serial | → Schritt 2: Live MQTT-Traffic pruefen |
| Server antwortet nicht | → `curl -s http://localhost:8000/api/v1/health/live` |
| Container-Problem vermutet | → `docker compose ps` |
| "Device unknown" | → DB-Check Schritt 4 |
| Server-Errors zu ESP | → Grep in `logs/server/god_kaiser.log` |
| Alles OK | → Report schreiben |

---

## 7. Modus B – Spezifische Problem-Szenarien

### Szenario 1: "ESP32 sendet keine Sensor-Daten"

**Untersuchungskette:**

| Schritt | Was pruefen | Befehl | Erwartetes Ergebnis | Problem-Indikator |
|---------|------------|--------|--------------------|--------------------|
| 1 | Sensor-Init im Serial-Log | `grep -i "sensor\|DS18B20\|SHT31\|1030\|1031\|1040" logs/current/esp32_serial.log` | "Sensor initialized", "Found X devices" | Error 1030-1035, "READ_FAILED", "NO_DEVICES" |
| 2 | GPIO-Konflikt | `grep -i "gpio.*conflict\|1001\|1002\|reserved" logs/current/esp32_serial.log` | Keine Konflikte | "GPIO X already reserved", Error 1001/1002 |
| 3 | MQTT-Publish | `grep -i "sensor.*data\|publish.*failed\|3014" logs/current/esp32_serial.log` | "Published sensor data" | "PUBLISH_FAILED", Error 3014 |
| 4 | Circuit Breaker | `grep -i "circuit\|breaker" logs/current/esp32_serial.log` | CLOSED | OPEN → MQTT-Verbindung instabil |
| 5 | MQTT-Traffic | `mosquitto_sub -t "kaiser/god/esp/+/sensor/+/data" -v -C 5 -W 15` | Sensor-Messages sichtbar | Keine Messages → ESP sendet nicht |
| 6 | Broker-Status | `docker compose ps mqtt-broker` | running (healthy) | Nicht healthy → Broker-Problem |
| 7 | Server-Handler | `grep "sensor_handler\|SensorDataHandler" logs/server/god_kaiser.log \| tail -20` | "Sensor data saved" | Error/Exception → Handler-Problem |
| 8 | DB-Insert | `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT COUNT(*) FROM sensor_data WHERE created_at > NOW() - INTERVAL '5 minutes'"` | > 0 Eintraege | 0 → Daten kommen nicht an |
| 9 | WebSocket | `grep "sensor_data.*broadcast\|ws_event" logs/server/god_kaiser.log \| tail -10` | Broadcast-Events | Fehlt → WS-Problem (Frontend betroffen) |

**Bruchstellen-Identifikation:**
- Schritt 1-4 scheitern → Problem auf ESP32 (Hardware/Config)
- Schritt 5 scheitert → Problem bei MQTT-Publish (ESP→Broker)
- Schritt 6 scheitert → Broker-Problem
- Schritt 7-8 scheitern → Server-Handler/DB-Problem
- Schritt 9 scheitert → WebSocket-Problem (Frontend betroffen)

### Szenario 2: "ESP32 bootet in Reboot-Loop"

**Untersuchungskette:**

| Schritt | Was pruefen | Befehl | Erwartetes Ergebnis | Problem-Indikator |
|---------|------------|--------|--------------------|--------------------|
| 1 | Serial-Output vorhanden? | `Read logs/current/esp32_serial.log` (erste 50 Zeilen) | Boot-Banner sichtbar | Kein Output → Flash korrupt, USB-Problem |
| 2 | Boot-Banner wiederholt? | `grep -c "ESP32 Sensor Network" logs/current/esp32_serial.log` | 1x | > 3x → Reboot-Loop bestaetigt |
| 3 | Wo stoppt Boot? | Boot-Sequenz-Schritte einzeln pruefen (1-16) | Letzter sichtbarer Schritt | Identifiziert Phase des Absturzes |
| 4 | Watchdog-Trigger | `grep -i "watchdog\|wdt\|4070\|4071" logs/current/esp32_serial.log` | Nicht vorhanden | WDT_TIMEOUT → Task blockiert, Stack Overflow |
| 5 | Stack-Trace | `grep -i "guru meditation\|backtrace\|panic\|assert" logs/current/esp32_serial.log` | Nicht vorhanden | Guru Meditation → Firmware-Crash |
| 6 | NVS-Korruption | `grep -i "nvs\|2000\|2001\|2005\|2006" logs/current/esp32_serial.log` | Nicht vorhanden | NVS-Fehler → `pio run -t erase` (MIT BESTAETIGUNG) |
| 7 | WiFi-Timeout | `grep -i "wifi.*timeout\|3002\|wifi.*failed" logs/current/esp32_serial.log` | Connected | Timeout → SSID nicht erreichbar |
| 8 | MQTT-Timeout | `grep -i "mqtt.*timeout\|3011\|mqtt.*failed" logs/current/esp32_serial.log` | Connected | Timeout → Broker nicht erreichbar |
| 9 | SafeMode-Trigger | `grep -i "safe.mode\|boot.loop\|boot.count" logs/current/esp32_serial.log` | Nicht vorhanden | SafeMode → 5x reboot in < 60s |
| 10 | Memory-Problem | `grep -i "heap\|memory\|4060\|4061\|4062" logs/current/esp32_serial.log` | heap_free > 10KB | < 10KB → Out of Memory |
| 11 | Docker-Stack | `docker compose ps` | Alle healthy | Container down → Infrastruktur fehlt |

**Recovery-Empfehlungen nach Root-Cause:**
- WDT → Firmware-Debug noetig (esp32-dev Agent)
- NVS-Korruption → `pio run -t erase` + Neustart (Bestaetigung!)
- WiFi-Timeout → Router pruefen, SSID/PW in NVS pruefen
- MQTT-Timeout → Broker-Status, Firewall, Port 1883
- Memory → Firmware-Optimierung (esp32-dev Agent)

### Szenario 3: "ESP32 ist beim Server als offline gelistet obwohl es laeuft"

**Untersuchungskette:**

| Schritt | Was pruefen | Befehl | Erwartetes Ergebnis | Problem-Indikator |
|---------|------------|--------|--------------------|--------------------|
| 1 | ESP32 sendet Heartbeats? | `grep "heartbeat\|system/heartbeat" logs/current/esp32_serial.log` | Regelmaessige Heartbeats | Keine → HealthMonitor.loop() blockiert |
| 2 | MQTT-Connect stabil? | `grep -i "mqtt.*connected\|mqtt.*disconnect\|circuit.*breaker" logs/current/esp32_serial.log` | Stabil connected | Disconnect/Reconnect-Zyklus |
| 3 | Heartbeats im MQTT? | `mosquitto_sub -t "kaiser/god/esp/+/system/heartbeat" -v -C 5 -W 15` | Messages alle ~5s | Keine → ESP publiziert nicht |
| 4 | Heartbeat-ACK? | `mosquitto_sub -t "kaiser/god/esp/+/system/heartbeat/ack" -v -C 3 -W 15` | ACK nach jedem Heartbeat | Kein ACK → Server verarbeitet nicht |
| 5 | Server-Handler | `grep "heartbeat_handler" logs/server/god_kaiser.log \| tail -20` | "Device online" Updates | Errors → Handler-Problem |
| 6 | LWT ausgeloest? | `grep "lwt\|will\|LWTHandler" logs/server/god_kaiser.log \| tail -10` | Kein LWT | LWT → Broker hat Disconnect erkannt |
| 7 | DB Device-Status | `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT device_id, status, last_seen, NOW() - last_seen as age FROM esp_devices WHERE device_id LIKE 'ESP_%'"` | status="online", age < 30s | status="offline", age > 60s |
| 8 | Timeout-Konfiguration | Server-Config pruefen: wann gilt Device als offline? | Konfigurierbar (default: 60s ohne Heartbeat) | Zu kurzer Timeout bei instabilem WiFi |
| 9 | Broker-Connectivity | `docker compose ps mqtt-broker` + `docker compose logs --tail=20 mqtt-broker` | Healthy, keine Client-Disconnects | Disconnect-Logs → Netzwerk-Problem |

**Haeufigste Root-Causes:**
1. **WiFi instabil** → RSSI < -80 dBm, regelmaessige Disconnects
2. **MQTT Circuit Breaker OPEN** → 5 Failures → 30s Blockade → Heartbeats fehlen
3. **LWT zu aggressiv** → Broker erkennt Disconnect bevor ESP reconnected
4. **Server-Timeout zu kurz** → Device wird als offline markiert waehrend reconnect
5. **Broker-Overload** → Zu viele Clients, Messages gehen verloren

---

## 8. Empfehlungen fuer den neuen Agenten

### 8.1 Was der neue Agent WISSEN muss

1. **ESP32 Firmware-Architektur:** 98 Source-Dateien, Singleton-Pattern, 16-Schritt Boot-Sequenz
2. **Error-Code-System:** 1000-4999 (ESP32), 5000-5699 (Server), exakte Code-Bedeutungen
3. **MQTT-Topic-Schema:** 18 Publishing-Topics, 12 Subscribe-Topics, QoS-Level pro Topic
4. **Server-Handler-Zuordnung:** 11 Handler, welcher Topic zu welchem Handler, was passiert mit der Message
5. **DB-Modell:** 8 relevante Tabellen, Beziehungen (ESPDevice → SensorConfig → SensorData)
6. **Docker-Service-Namen:** `postgres`, `mqtt-broker`, `el-servador`, `el-frontend` (NICHT mosquitto, god-kaiser-server)
7. **Container-Namen:** `automationone-postgres`, `automationone-mqtt`, `automationone-server`
8. **Log-Pfade:** 6 Log-Verzeichnisse mit unterschiedlichen Formaten
9. **Wokwi-Simulation:** 163 Szenarien, `pio run -e wokwi_simulation`, `wokwi-cli`
10. **Circuit Breaker:** MQTT (5 failures → 30s OPEN), WiFi (10 failures → 60s)

### 8.2 Was der neue Agent KOENNEN muss

1. **Serial-Log parsen:** Prefix-Tags, Log-Level, Timestamps, Error-Codes extrahieren
2. **Cross-Layer pruefen:** ESP→MQTT→Server→DB→WebSocket Kette verfolgen
3. **Docker-Status abfragen:** `docker compose ps`, `docker compose logs --tail=N`
4. **MQTT-Traffic testen:** `mosquitto_sub -t "..." -v -C N -W N` (IMMER mit Timeout!)
5. **Server-Health pruefen:** `curl -s http://localhost:8000/api/v1/health/live`
6. **DB-Queries ausfuehren:** `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT ..."`
7. **Zwei Modi automatisch erkennen:** A (allgemein) vs B (spezifisch)
8. **Report schreiben:** Standardisiertes Format nach `.claude/reports/current/ESP32_DEBUG_REPORT.md`

### 8.3 Was der neue Agent HABEN muss

1. **Tools:** Read, Grep, Glob, Bash
2. **Model:** sonnet
3. **Sicherheitsregeln:**
   - `mosquitto_sub` IMMER mit `-C N` UND `-W N` (sonst blockiert Agent)
   - `docker compose logs` IMMER mit `--tail=N`
   - `curl` nur GET (kein POST/PUT/DELETE)
   - SQL nur SELECT (kein DELETE/UPDATE/DROP)
   - Kein Container starten/stoppen (system-control Domaene)
   - `pio run -t erase` und `pio run -t upload` nur mit Bestaetigung
4. **Referenz-Dokumente:**
   - `.claude/reference/errors/ERROR_CODES.md` (bei unbekannten Codes)
   - `.claude/reference/api/MQTT_TOPICS.md` (bei Topic-Fragen)
   - `.claude/reference/patterns/COMMUNICATION_FLOWS.md` (bei Flow-Analyse)
   - `.claude/skills/esp32-development/SKILL.md` (bei Firmware-Detail-Fragen)
5. **Eigenstaendigkeit:** Kein SESSION_BRIEFING oder STATUS.md erforderlich (optional nutzen)
6. **Keine Delegation:** Selbst Cross-Layer pruefen statt an andere Agents verweisen

### 8.4 Strukturempfehlung fuer Agent-Datei

```
1. Frontmatter (name, description mit MUST BE USED/NOT FOR, tools, model)
2. Identitaet & Aktivierung (eigenstaendig, zwei Modi, Modus-Erkennung)
3. Kernbereich (Serial-Log, Boot-Sequenz, Error-Codes 1000-4999)
4. Erweiterte Faehigkeiten (MQTT, Docker, Health, DB - mit exakten Commands)
5. Arbeitsreihenfolge Modus A (5 Schritte mit Erweiterungsentscheidung)
6. Arbeitsreihenfolge Modus B (Problem-fokussiert, sofort Cross-Layer)
7. Log-Format (Prefix-Tags, Level, Timestamps)
8. Error-Code Quick-Reference (wichtigste Codes pro Kategorie)
9. Report-Format (ESP32_DEBUG_REPORT.md Template)
10. Quick-Commands (docker, curl, mosquitto_sub, psql - mit korrekten Service-Namen)
11. Sicherheitsregeln (was erlaubt, was verboten)
12. Referenzen (welche Datei wann laden)
```

### 8.5 Strukturempfehlung fuer Skill-Datei

```
1. Debug-Fokus & Abgrenzung (Kernbereich + NOT FOR)
2. Boot-Sequenz (16 Schritte mit Code-Locations aus main.cpp)
3. SafeMode-Trigger (5 Ausloeser mit Zeilen-Referenzen)
4. Datenfluss Sensor→Server (vollstaendige Kette)
5. Error-Code Vollreferenz (alle Ranges 1000-4999)
6. Error-Meldung an Server (Topic + Payload-Schema)
7. Circuit Breaker (MQTT + WiFi mit Thresholds)
8. Log-Location & Analyse (Primaer + Sekundaer + Grep-Patterns)
9. Diagnose-Workflows (4 Standard-Szenarien)
10. Erweiterte Eigenanalyse (Cross-Layer Commands)
11. Referenz-Dokumente (wann welche Datei laden)
12. Report-Format Template
```

---

*Bericht erstellt durch automatisierte 4-Agenten Codebase-Exploration. Alle Pfade verifiziert gegen echte Dateien.*
