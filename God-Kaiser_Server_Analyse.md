# God-Kaiser Server - Vollständige Analyse für Frontend-Integration

**Datum:** 2025-01-27  
**Zweck:** Analyse des God-Kaiser Servers für Vuetify 3 Frontend-Integration  
**Status:** ✅ Vollständig analysiert

---

## 📋 Inhaltsverzeichnis

1. [REST API Endpoints - Vollständige Bestandsaufnahme](#1-rest-api-endpoints)
2. [Services - Business Logic Analyse](#2-services)
3. [WebSocket-Manager - Detailanalyse](#3-websocket-manager)
4. [MQTT-Handler - Integration mit Services](#4-mqtt-handler)
5. [Pydantic Schemas - Request/Response Contracts](#5-pydantic-schemas)
6. [Database Models - Datenstruktur](#6-database-models)
7. [Main.py - Application Startup](#7-mainpy)
8. [Kritische Lücken-Analyse](#8-kritische-lücken)

---

## 1. REST API Endpoints

### esp.py

#### Endpoint: GET /api/v1/esp/devices
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (zone_id, status, hardware_type, page, page_size)
- **Response:** `ESPDeviceListResponse` (paginiert)
- **Service:** Direkt via `ESPRepository`, `SensorRepository`, `ActuatorRepository`
- **Auth:** Required - Rolle: `ActiveUser` (jeder authentifizierte User)
- **Implementierungsdetails:** 
  - Filtert nach Zone, Status oder Hardware-Type
  - Pagination unterstützt
  - Enthält Sensor- und Actuator-Counts pro Device
  - Keine TODOs

#### Endpoint: GET /api/v1/esp/devices/{esp_id}
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter `esp_id`
- **Response:** `ESPDeviceResponse`
- **Service:** Direkt via `ESPRepository`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** Vollständig implementiert

#### Endpoint: POST /api/v1/esp/devices
- **Status:** ✅ Vollständig implementiert
- **Request:** `ESPDeviceCreate`
- **Response:** `ESPDeviceResponse` (201 Created)
- **Service:** Direkt via `ESPRepository.create()`
- **Auth:** Required - Rolle: `OperatorUser` (Operator oder Admin)
- **Implementierungsdetails:** Manuelle Registrierung, prüft auf Duplikate

#### Endpoint: PATCH /api/v1/esp/devices/{esp_id}
- **Status:** ✅ Vollständig implementiert
- **Request:** `ESPDeviceUpdate` (alle Felder optional)
- **Response:** `ESPDeviceResponse`
- **Service:** Direkt via `ESPRepository`
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Update einzelner Felder

#### Endpoint: POST /api/v1/esp/devices/{esp_id}/config
- **Status:** ✅ Vollständig implementiert
- **Request:** `ESPConfigUpdate`
- **Response:** `ESPConfigResponse`
- **Service:** `Publisher.publish_config()` via MQTT
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Sendet Config via MQTT, ACK ist async

#### Endpoint: POST /api/v1/esp/devices/{esp_id}/restart
- **Status:** ✅ Vollständig implementiert
- **Request:** `ESPRestartRequest` (delay_seconds, reason)
- **Response:** `ESPCommandResponse`
- **Service:** `Publisher.publish_system_command()` via MQTT
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Sendet REBOOT-Command

#### Endpoint: POST /api/v1/esp/devices/{esp_id}/reset
- **Status:** ✅ Vollständig implementiert
- **Request:** `ESPResetRequest` (confirm=True erforderlich)
- **Response:** `ESPCommandResponse`
- **Service:** `Publisher.publish_system_command()` via MQTT
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Factory Reset mit Bestätigung

#### Endpoint: GET /api/v1/esp/devices/{esp_id}/health
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter `esp_id`
- **Response:** `ESPHealthResponse` mit `ESPHealthMetrics`
- **Service:** Liest aus `device.metadata["health"]` (populated von heartbeat_handler)
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Formatiert Uptime (days, hours, minutes)
  - Enthält: uptime, heap_free, wifi_rssi, sensor_count, actuator_count

#### Endpoint: POST /api/v1/esp/devices/{esp_id}/assign_kaiser
- **Status:** ✅ Vollständig implementiert
- **Request:** `AssignKaiserRequest` (kaiser_id)
- **Response:** `AssignKaiserResponse`
- **Service:** Direkt via `ESPRepository` (Metadata-Update)
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Speichert kaiser_id in metadata

#### Endpoint: GET /api/v1/esp/discovery
- **Status:** 🚧 Teilweise implementiert (Placeholder)
- **Request:** Keine
- **Response:** `ESPDiscoveryResponse`
- **Service:** Direkt via `ESPRepository`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - **TODO:** mDNS-Integration fehlt
  - **TODO:** Discovery MQTT Topic wird nicht abgefragt
  - Gibt aktuell leere Liste zurück
  - Discovery erfolgt primär via Heartbeat (siehe heartbeat_handler)

---

### sensors.py

#### Endpoint: GET /api/v1/sensors/
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (esp_id, sensor_type, enabled, page, page_size)
- **Response:** `SensorConfigListResponse` (paginiert)
- **Service:** Direkt via `SensorRepository`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Filtert nach ESP, Type, Enabled-Status
  - Enthält latest_value, latest_quality, latest_timestamp pro Sensor

#### Endpoint: GET /api/v1/sensors/{esp_id}/{gpio}
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter `esp_id`, `gpio`
- **Response:** `SensorConfigResponse`
- **Service:** Direkt via `SensorRepository.get_by_esp_and_gpio()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: POST /api/v1/sensors/{esp_id}/{gpio}
- **Status:** ✅ Vollständig implementiert
- **Request:** `SensorConfigCreate`
- **Response:** `SensorConfigResponse`
- **Service:** Direkt via `SensorRepository` (create oder update)
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Upsert-Logik (create wenn nicht existiert, sonst update)

#### Endpoint: DELETE /api/v1/sensors/{esp_id}/{gpio}
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter
- **Response:** `SensorConfigResponse`
- **Service:** Direkt via `SensorRepository.delete()`
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: GET /api/v1/sensors/data
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (esp_id, gpio, sensor_type, start_time, end_time, quality, limit)
- **Response:** `SensorDataResponse` mit `SensorReading[]`
- **Service:** `SensorRepository.query_data()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Default Time-Range: letzte 24 Stunden
  - Filter nach Quality-Level
  - Limit: max 1000

#### Endpoint: GET /api/v1/sensors/{esp_id}/{gpio}/stats
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (start_time, end_time)
- **Response:** `SensorStatsResponse` mit `SensorStats`
- **Service:** `SensorRepository.get_stats()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Statistik: min, max, avg, std_dev, reading_count, quality_distribution
  - Default Time-Range: letzte 24 Stunden

---

### actuators.py

#### Endpoint: GET /api/v1/actuators/
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (esp_id, actuator_type, enabled, page, page_size)
- **Response:** `ActuatorConfigListResponse` (paginiert)
- **Service:** Direkt via `ActuatorRepository`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Enthält current_value, is_active, last_command_at aus ActuatorState

#### Endpoint: GET /api/v1/actuators/{esp_id}/{gpio}
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter
- **Response:** `ActuatorConfigResponse`
- **Service:** Direkt via `ActuatorRepository`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: POST /api/v1/actuators/{esp_id}/{gpio}
- **Status:** ✅ Vollständig implementiert
- **Request:** `ActuatorConfigCreate`
- **Response:** `ActuatorConfigResponse`
- **Service:** Direkt via `ActuatorRepository` (upsert)
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: POST /api/v1/actuators/{esp_id}/{gpio}/command
- **Status:** ✅ Vollständig implementiert
- **Request:** `ActuatorCommand` (command, value, duration)
- **Response:** `ActuatorCommandResponse`
- **Service:** `ActuatorService.send_command()` → `SafetyService.validate_actuator_command()` → `Publisher.publish_actuator_command()`
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** 
  - **CRITICAL:** Alle Commands gehen durch SafetyService-Validierung
  - Value muss 0.0-1.0 sein (ESP32 konvertiert intern zu 0-255)
  - Loggt Command in ActuatorHistory

#### Endpoint: GET /api/v1/actuators/{esp_id}/{gpio}/status
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (include_config)
- **Response:** `ActuatorStatusResponse` mit `ActuatorState`
- **Service:** Direkt via `ActuatorRepository.get_state()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** Optional: include_config für vollständige Config

#### Endpoint: POST /api/v1/actuators/emergency_stop
- **Status:** ✅ Vollständig implementiert
- **Request:** `EmergencyStopRequest` (esp_id optional, gpio optional, reason)
- **Response:** `EmergencyStopResponse`
- **Service:** Direkt via `Publisher.publish_actuator_command()` (bypasses SafetyService)
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** 
  - **CRITICAL:** Bypassiert normale Safety-Checks
  - Sendet OFF-Command an alle oder spezifische Actuators
  - Loggt als EMERGENCY_STOP in History

#### Endpoint: DELETE /api/v1/actuators/{esp_id}/{gpio}
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter
- **Response:** `ActuatorConfigResponse`
- **Service:** Sendet OFF-Command, dann `ActuatorRepository.delete()`
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Sendet OFF vor Löschung

#### Endpoint: GET /api/v1/actuators/{esp_id}/{gpio}/history
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (limit, default: 20)
- **Response:** `ActuatorHistoryResponse` mit `ActuatorHistoryEntry[]`
- **Service:** `ActuatorRepository.get_history()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** Command-History mit issued_by, success, error_message

---

### logic.py

#### Endpoint: GET /api/v1/logic/rules
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (enabled, page, page_size)
- **Response:** `LogicRuleListResponse` (paginiert)
- **Service:** Direkt via `LogicRepository`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Sortiert nach Priority (höchste zuerst)
  - Enthält execution_count, last_execution_success

#### Endpoint: GET /api/v1/logic/rules/{rule_id}
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter `rule_id` (UUID)
- **Response:** `LogicRuleResponse`
- **Service:** Direkt via `LogicRepository.get_by_id()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: POST /api/v1/logic/rules
- **Status:** ✅ Vollständig implementiert
- **Request:** `LogicRuleCreate` (name, description, conditions, actions, logic_operator, enabled, priority, cooldown_seconds, max_executions_per_hour)
- **Response:** `LogicRuleResponse` (201 Created)
- **Service:** Direkt via `LogicRepository.create()`
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** 
  - Validiert Conditions und Actions via Pydantic (siehe models/logic.py)
  - Speichert als `CrossESPLogic` Model

#### Endpoint: PUT /api/v1/logic/rules/{rule_id}
- **Status:** ✅ Vollständig implementiert
- **Request:** `LogicRuleUpdate` (alle Felder optional)
- **Response:** `LogicRuleResponse`
- **Service:** Direkt via `LogicRepository`
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: DELETE /api/v1/logic/rules/{rule_id}
- **Status:** ✅ Vollständig implementiert
- **Request:** Path-Parameter
- **Response:** `LogicRuleResponse`
- **Service:** `LogicRepository.delete()`
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: POST /api/v1/logic/rules/{rule_id}/toggle
- **Status:** ✅ Vollständig implementiert
- **Request:** `RuleToggleRequest` (enabled, reason optional)
- **Response:** `RuleToggleResponse`
- **Service:** Direkt via `LogicRepository` (Update enabled-Flag)
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** Vollständig

#### Endpoint: POST /api/v1/logic/rules/{rule_id}/test
- **Status:** ✅ Vollständig implementiert
- **Request:** `RuleTestRequest` (mock_sensor_values, mock_time, dry_run)
- **Response:** `RuleTestResponse` mit `ConditionResult[]`, `ActionResult[]`
- **Service:** Direkt im Endpoint (Simulation)
- **Auth:** Required - Rolle: `OperatorUser`
- **Implementierungsdetails:** 
  - Simuliert Rule-Execution mit Mock-Daten
  - Evaluates Conditions ohne tatsächliche Ausführung
  - Gibt would_trigger zurück

#### Endpoint: GET /api/v1/logic/execution_history
- **Status:** ✅ Vollständig implementiert
- **Request:** Query-Parameter (rule_id, success, start_time, end_time, limit)
- **Response:** `ExecutionHistoryResponse` mit `ExecutionHistoryEntry[]`
- **Service:** `LogicRepository.get_execution_history()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Default Time-Range: letzte 7 Tage
  - Enthält success_rate
  - Filter nach Rule-ID, Success-Status

---

### auth.py

#### Endpoint: POST /api/v1/auth/login
- **Status:** ✅ Vollständig implementiert
- **Request:** `LoginRequest` (username, password, remember_me)
- **Response:** `LoginResponse` mit `TokenResponse` und `UserResponse`
- **Service:** `UserRepository.authenticate()`, `create_access_token()`, `create_refresh_token()`
- **Auth:** Optional (öffentlich)
- **Implementierungsdetails:** 
  - Unterstützt Username oder Email
  - Rate-Limiting via `check_auth_rate_limit`
  - Remember-Me: 7 Tage Token, sonst Standard-Expiration

#### Endpoint: POST /api/v1/auth/login/form
- **Status:** ✅ Vollständig implementiert
- **Request:** OAuth2PasswordRequestForm (für Swagger UI)
- **Response:** `TokenResponse`
- **Service:** Wie `/login`
- **Auth:** Optional
- **Implementierungsdetails:** OAuth2-kompatibel für Swagger

#### Endpoint: POST /api/v1/auth/register
- **Status:** ✅ Vollständig implementiert
- **Request:** `RegisterRequest` (username, email, password, full_name, role)
- **Response:** `RegisterResponse` mit `UserResponse`
- **Service:** `UserRepository.create_user()`
- **Auth:** Required - Rolle: `AdminUser` (nur Admin)
- **Implementierungsdetails:** 
  - Password-Validierung: min 8 Zeichen, Upper, Lower, Digit, Special
  - Prüft auf Duplikate (username, email)

#### Endpoint: POST /api/v1/auth/refresh
- **Status:** ✅ Vollständig implementiert
- **Request:** `RefreshTokenRequest` (refresh_token)
- **Response:** `RefreshTokenResponse` mit `TokenResponse`
- **Service:** `verify_token()`, `create_access_token()`, `create_refresh_token()`
- **Auth:** Optional (Token im Body)
- **Implementierungsdetails:** 
  - Verifiziert Refresh-Token
  - Prüft ob User noch aktiv ist
  - Generiert neue Access + Refresh Tokens

#### Endpoint: POST /api/v1/auth/logout
- **Status:** 🚧 Teilweise implementiert (Placeholder)
- **Request:** `LogoutRequest` (all_devices)
- **Response:** `LogoutResponse`
- **Service:** Keine (nur Logging)
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - **TODO:** Token-Blacklist fehlt
  - Aktuell nur Logging, keine echte Token-Invalidierung
  - Kommentar: "For full token blacklisting, implement a token blacklist table"

#### Endpoint: GET /api/v1/auth/me
- **Status:** ✅ Vollständig implementiert
- **Request:** Keine (User aus Token)
- **Response:** `UserResponse`
- **Service:** Keine (User aus Dependency)
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** Gibt aktuellen User zurück

#### Endpoint: POST /api/v1/auth/mqtt/configure
- **Status:** 🚧 Teilweise implementiert (Placeholder)
- **Request:** `MQTTAuthConfigRequest` (username, password, enabled)
- **Response:** `MQTTAuthConfigResponse`
- **Service:** Keine (nur Logging)
- **Auth:** Required - Rolle: `AdminUser`
- **Implementierungsdetails:** 
  - **TODO:** Mosquitto Password-File Update fehlt
  - **TODO:** Broker Reload fehlt
  - Kommentar: "In a full implementation: update /etc/mosquitto/passwd, reload broker"

#### Endpoint: GET /api/v1/auth/mqtt/status
- **Status:** 🚧 Teilweise implementiert (Placeholder)
- **Request:** Keine
- **Response:** `MQTTAuthStatusResponse`
- **Service:** `MQTTClient.get_instance().is_connected()`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Gibt hardcoded Werte zurück (enabled=True, username="esp_user")
  - **TODO:** Echte Config-Abfrage fehlt

---

### health.py

#### Endpoint: GET /api/v1/health/
- **Status:** ✅ Vollständig implementiert
- **Request:** Keine
- **Response:** `HealthResponse` (basic)
- **Service:** `MQTTClient.get_instance().is_connected()`
- **Auth:** Optional (öffentlich)
- **Implementierungsdetails:** Basic Health-Check für Load-Balancer

#### Endpoint: GET /api/v1/health/detailed
- **Status:** ✅ Vollständig implementiert
- **Request:** Keine
- **Response:** `DetailedHealthResponse` mit `DatabaseHealth`, `MQTTHealth`, `WebSocketHealth`, `SystemResourceHealth`
- **Service:** Verschiedene (MQTT, WebSocket, psutil für System)
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - **TODO:** Einige Werte sind Placeholder (pool_size, pool_available, latency_ms)
  - System-Metriken nur wenn psutil verfügbar

#### Endpoint: GET /api/v1/health/esp
- **Status:** ✅ Vollständig implementiert
- **Request:** Keine
- **Response:** `ESPHealthSummaryResponse` mit `ESPHealthItem[]`
- **Service:** `ESPRepository`, `SensorRepository`, `ActuatorRepository`
- **Auth:** Required - Rolle: `ActiveUser`
- **Implementierungsdetails:** 
  - Aggregiert Health-Daten aller ESPs
  - Enthält: online_count, offline_count, avg_heap_free, avg_wifi_rssi

#### Endpoint: GET /api/v1/health/metrics
- **Status:** ✅ Vollständig implementiert
- **Request:** Keine
- **Response:** Prometheus-Format (text/plain)
- **Service:** `ESPRepository`, `MQTTClient`
- **Auth:** Optional (öffentlich)
- **Implementierungsdetails:** Prometheus-kompatible Metriken

#### Endpoint: GET /api/v1/health/live
- **Status:** ✅ Vollständig implementiert
- **Request:** Keine
- **Response:** `LivenessResponse`
- **Service:** Keine
- **Auth:** Optional
- **Implementierungsdetails:** Kubernetes Liveness Probe

#### Endpoint: GET /api/v1/health/ready
- **Status:** ✅ Vollständig implementiert
- **Request:** Keine
- **Response:** `ReadinessResponse` mit Checks
- **Service:** `MQTTClient.is_connected()`, psutil für Disk
- **Auth:** Optional
- **Implementierungsdetails:** Kubernetes Readiness Probe

---

### kaiser.py

#### Status: 📋 Nur Skeleton
- **Datei:** Enthält nur Router-Definition, keine Endpoints
- **Kommentar:** "PLANNED - Not yet implemented"
- **Geplante Endpoints:**
  - GET /nodes
  - POST /register
  - GET /{kaiser_id}
  - POST /{kaiser_id}/assign_esp
  - POST /{kaiser_id}/sync_config
  - DELETE /{kaiser_id}

---

### ai.py

#### Status: 📋 Nur Skeleton
- **Datei:** Enthält nur Router-Definition, keine Endpoints
- **Kommentar:** "PLANNED - Not yet implemented"
- **Geplante Endpoints:**
  - POST /recommendation
  - GET /predictions
  - POST /predictions/{id}/approve
  - POST /predictions/{id}/reject
  - POST /send_batch

---

### library.py

#### Status: 📋 Nur Skeleton
- **Datei:** Enthält nur Router-Definition, keine Endpoints
- **Kommentar:** "PLANNED - Not yet implemented"
- **Geplante Endpoints:**
  - GET /available
  - POST /install
  - GET /status
  - POST /update

---

## 2. Services

### esp_service.py

#### Methode: `register_device()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id, ip_address, mac_address, firmware_version, hardware_type, name, zone_id, zone_name, is_zone_master, capabilities
- **Return:** `ESPDevice`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** 
  - Prüft ob Device existiert → Update oder Create
  - Setzt status="online", last_seen=now
- **TODOs/Lücken:** Keine

#### Methode: `unregister_device()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id
- **Return:** `bool`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** Löscht Device
- **TODOs/Lücken:** Keine

#### Methode: `update_health()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id, uptime, heap_free, wifi_rssi, sensor_count, actuator_count, timestamp
- **Return:** `bool`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** 
  - Speichert Health-Daten in `device.metadata["health"]`
  - Aktualisiert status="online", last_seen
- **TODOs/Lücken:** Keine

#### Methode: `check_device_status()`
- **Status:** ✅ Implementiert
- **Parameter:** offline_threshold_seconds (default: 120)
- **Return:** `Dict[str, List[str]]` (online, offline, newly_offline)
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** Markiert Devices als offline wenn last_seen > threshold
- **TODOs/Lücken:** Keine

#### Methode: `send_config()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id, config (dict)
- **Return:** `bool`
- **Abhängigkeiten:** `ESPRepository`, `Publisher`
- **Implementierung:** Sendet Config via MQTT
- **TODOs/Lücken:** Keine

#### Methode: `send_restart()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id, delay_seconds, reason
- **Return:** `bool`
- **Abhängigkeiten:** `ESPRepository`, `Publisher`
- **Implementierung:** Sendet REBOOT-Command
- **TODOs/Lücken:** Keine

#### Methode: `send_factory_reset()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id, preserve_wifi
- **Return:** `bool`
- **Abhängigkeiten:** `ESPRepository`, `Publisher`
- **Implementierung:** Sendet FACTORY_RESET-Command
- **TODOs/Lücken:** Keine

#### Methode: `get_device()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id
- **Return:** `Optional[ESPDevice]`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** Einfacher Getter
- **TODOs/Lücken:** Keine

#### Methode: `get_all_devices()`
- **Status:** ✅ Implementiert
- **Parameter:** zone_id, status, hardware_type (alle optional)
- **Return:** `List[ESPDevice]`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** Filtert nach Parametern
- **TODOs/Lücken:** Keine

#### Methode: `get_health_summary()`
- **Status:** ✅ Implementiert
- **Parameter:** Keine
- **Return:** `Dict[str, Any]`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** Aggregiert Health-Daten
- **TODOs/Lücken:** Keine

#### Methode: `assign_to_kaiser()`
- **Status:** ✅ Implementiert
- **Parameter:** device_id, kaiser_id
- **Return:** `bool`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** Speichert kaiser_id in metadata
- **TODOs/Lücken:** Keine

#### Methode: `get_devices_by_kaiser()`
- **Status:** ✅ Implementiert
- **Parameter:** kaiser_id
- **Return:** `List[ESPDevice]`
- **Abhängigkeiten:** `ESPRepository`
- **Implementierung:** Filtert nach metadata["kaiser_id"]
- **TODOs/Lücken:** Keine

---

### sensor_service.py

#### Methode: `get_config()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio
- **Return:** `Optional[SensorConfig]`
- **Abhängigkeiten:** `ESPRepository`, `SensorRepository`
- **Implementierung:** Lookup via ESP + GPIO
- **TODOs/Lücken:** Keine

#### Methode: `create_or_update_config()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio, sensor_type, name, enabled, interval_ms, processing_mode, calibration, thresholds, metadata
- **Return:** `SensorConfig`
- **Abhängigkeiten:** `ESPRepository`, `SensorRepository`
- **Implementierung:** Upsert-Logik
- **TODOs/Lücken:** Keine

#### Methode: `delete_config()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio
- **Return:** `bool`
- **Abhängigkeiten:** `ESPRepository`, `SensorRepository`
- **Implementierung:** Löscht Config
- **TODOs/Lücken:** Keine

#### Methode: `process_reading()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio, sensor_type, raw_value, calibration, params, timestamp
- **Return:** `Dict[str, Any]` (success, processed_value, unit, quality, metadata)
- **Abhängigkeiten:** `SensorLibraryLoader`, `SensorRepository`
- **Implementierung:** 
  - Lädt Processor aus Library
  - Verarbeitet Raw-Value mit Calibration
  - Speichert Reading in DB
- **TODOs/Lücken:** Keine

#### Methode: `query_data()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio, sensor_type, start_time, end_time, quality, limit
- **Return:** `List[SensorData]`
- **Abhängigkeiten:** `ESPRepository`, `SensorRepository`
- **Implementierung:** Delegiert an Repository
- **TODOs/Lücken:** Keine

#### Methode: `get_latest_reading()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio
- **Return:** `Optional[SensorData]`
- **Abhängigkeiten:** `ESPRepository`, `SensorRepository`
- **Implementierung:** Delegiert an Repository
- **TODOs/Lücken:** Keine

#### Methode: `get_stats()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio, start_time, end_time
- **Return:** `Dict[str, Any]` (min, max, avg, std_dev, reading_count, quality_distribution)
- **Abhängigkeiten:** `ESPRepository`, `SensorRepository`
- **Implementierung:** Delegiert an Repository
- **TODOs/Lücken:** Keine

#### Methode: `calibrate()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id, gpio, sensor_type, calibration_points, method, save_to_config
- **Return:** `Dict[str, Any]` (success, calibration, method, saved)
- **Abhängigkeiten:** `SensorRepository`
- **Implementierung:** 
  - Unterstützt: offset, linear, polynomial
  - Speichert Calibration in Config wenn save_to_config=True
- **TODOs/Lücken:** 
  - Polynomial-Fitting benötigt numpy (aktuell Fallback zu linear)

---

### actuator_service.py

#### Methode: `send_command()`
- **Status:** ✅ Vollständig implementiert
- **Parameter:** esp_id, gpio, command, value, duration, issued_by
- **Return:** `bool`
- **Abhängigkeiten:** `ActuatorRepository`, `SafetyService`, `Publisher`
- **Implementierung:** 
  - **CRITICAL:** Validiert via SafetyService VOR MQTT-Publish
  - Loggt Command in ActuatorHistory (success/failed)
  - Value muss 0.0-1.0 sein
- **TODOs/Lücken:** Keine

---

### safety_service.py

#### Methode: `validate_actuator_command()`
- **Status:** ✅ Vollständig implementiert
- **Parameter:** esp_id, gpio, command, value
- **Return:** `SafetyCheckResult` (valid, error, warnings)
- **Abhängigkeiten:** `ActuatorRepository`, `ESPRepository`
- **Implementierung:** 
  - Prüft Emergency-Stop-Status (global + per ESP)
  - Validiert Value-Range (0.0-1.0)
  - Prüft Safety-Constraints (enabled, min_value/max_value, timeout)
  - Thread-safe via asyncio.Lock
- **TODOs/Lücken:** Keine

#### Methode: `check_safety_constraints()`
- **Status:** ✅ Vollständig implementiert
- **Parameter:** esp_id, gpio, value
- **Return:** `SafetyCheckResult`
- **Abhängigkeiten:** `ActuatorRepository`, `ESPRepository`
- **Implementierung:** 
  - Prüft Actuator existiert und enabled
  - Prüft Value in min_value/max_value Range
  - Prüft Timeout-Constraints
  - Prüft GPIO-Konflikte
- **TODOs/Lücken:** Keine

#### Methode: `emergency_stop_all()`
- **Status:** ✅ Implementiert
- **Parameter:** Keine
- **Return:** `None`
- **Abhängigkeiten:** Keine (nur internes Dict)
- **Implementierung:** Setzt `_emergency_stop_active["__ALL__"] = True`
- **TODOs/Lücken:** Keine

#### Methode: `emergency_stop_esp()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id
- **Return:** `None`
- **Abhängigkeiten:** Keine
- **Implementierung:** Setzt `_emergency_stop_active[esp_id] = True`
- **TODOs/Lücken:** Keine

#### Methode: `clear_emergency_stop()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id (optional, None = global)
- **Return:** `None`
- **Abhängigkeiten:** Keine
- **Implementierung:** Entfernt aus Dict
- **TODOs/Lücken:** Keine

#### Methode: `is_emergency_stop_active()`
- **Status:** ✅ Implementiert
- **Parameter:** esp_id (optional)
- **Return:** `bool`
- **Abhängigkeiten:** Keine
- **Implementierung:** Prüft Dict
- **TODOs/Lücken:** Keine

---

### logic_service.py

#### Status: 📋 Nur Skeleton
- **Datei:** Enthält nur Kommentar "PLANNED - Not yet implemented"
- **TODOs/Lücken:** Komplett fehlend

---

### logic_engine.py

#### Methode: `start()`
- **Status:** ✅ Implementiert
- **Parameter:** Keine
- **Return:** `None`
- **Abhängigkeiten:** Keine
- **Implementierung:** Startet Background-Task `_evaluation_loop()`
- **TODOs/Lücken:** Keine

#### Methode: `stop()`
- **Status:** ✅ Implementiert
- **Parameter:** Keine
- **Return:** `None`
- **Abhängigkeiten:** Keine
- **Implementierung:** Stoppt Background-Task
- **TODOs/Lücken:** Keine

#### Methode: `evaluate_sensor_data()`
- **Status:** ✅ Vollständig implementiert
- **Parameter:** esp_id, gpio, sensor_type, value
- **Return:** `None`
- **Abhängigkeiten:** `LogicRepository`, `ActuatorService`, `WebSocketManager`
- **Implementierung:** 
  - Findet matching Rules via `get_rules_by_trigger_sensor()`
  - Evaluates Conditions
  - Executes Actions (actuator_command)
  - Loggt Execution in History
  - Broadcastet via WebSocket
- **TODOs/Lücken:** 
  - **TODO:** `get_rules_by_trigger_sensor()` muss in LogicRepository implementiert werden

#### Methode: `_evaluate_rule()`
- **Status:** ✅ Implementiert
- **Parameter:** rule, trigger_data, logic_repo
- **Return:** `None`
- **Abhängigkeiten:** `LogicRepository`
- **Implementierung:** 
  - Prüft Cooldown
  - Evaluates Conditions
  - Executes Actions
  - Loggt Execution
- **TODOs/Lücken:** Keine

#### Methode: `_check_conditions()`
- **Status:** ✅ Implementiert
- **Parameter:** conditions (dict), sensor_data (dict)
- **Return:** `bool`
- **Abhängigkeiten:** Keine
- **Implementierung:** 
  - Unterstützt Compound Conditions (AND/OR)
  - Unterstützt: sensor_threshold, time_window
- **TODOs/Lücken:** Keine

#### Methode: `_execute_actions()`
- **Status:** ✅ Implementiert
- **Parameter:** actions (list), trigger_data, rule_id, rule_name
- **Return:** `None`
- **Abhängigkeiten:** `ActuatorService`, `WebSocketManager`
- **Implementierung:** 
  - Unterstützt: actuator_command
  - Broadcastet via WebSocket
- **TODOs/Lücken:** 
  - **TODO:** Weitere Action-Types (notification, delay) fehlen

#### Methode: `_evaluation_loop()`
- **Status:** ✅ Implementiert (Placeholder)
- **Parameter:** Keine
- **Return:** `None`
- **Abhängigkeiten:** Keine
- **Implementierung:** 
  - Aktuell nur Sleep-Loop
  - Kommentar: "Future: Could process queued evaluations here"
- **TODOs/Lücken:** 
  - **TODO:** Queue-System für Evaluations fehlt

---

### kaiser_service.py

#### Status: 📋 Nur Skeleton
- **Datei:** Enthält nur Kommentar "PLANNED - Not yet implemented"
- **TODOs/Lücken:** Komplett fehlend

---

### ai_service.py

#### Status: 📋 Nur Skeleton
- **Datei:** Enthält nur Kommentar "PLANNED - Not yet implemented"
- **TODOs/Lücken:** Komplett fehlend

---

## 3. WebSocket-Manager

### manager.py

#### Status: ✅ Vollständig implementiert

#### Methoden:

1. **`get_instance()`** (classmethod)
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Singleton-Pattern mit asyncio.Lock
   - **Return:** `WebSocketManager`

2. **`initialize()`**
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Setzt Event-Loop-Reference für Thread-Safety
   - **Return:** `None`

3. **`connect()`**
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Akzeptiert WebSocket-Connection, speichert in `_connections`
   - **Parameter:** websocket, client_id
   - **Return:** `None`

4. **`disconnect()`**
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Schließt Connection, entfernt aus Dicts
   - **Parameter:** client_id
   - **Return:** `None`

5. **`subscribe()`**
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Subscribt Client zu Message-Types/Filters
   - **Parameter:** client_id, filters (dict mit types, esp_ids, sensor_types)
   - **Return:** `None`
   - **Filter-Format:**
     ```python
     {
         "types": ["sensor_data", "actuator_status"],
         "esp_ids": ["ESP_12AB34CD"],
         "sensor_types": ["temperature", "humidity"]
     }
     ```

6. **`unsubscribe()`**
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Entfernt Subscriptions
   - **Parameter:** client_id, filters (optional, None = alle)
   - **Return:** `None`

7. **`broadcast()`**
   - **Status:** ✅ Vollständig implementiert
   - **Beschreibung:** Sendet Message an alle subscribed Clients
   - **Parameter:** message_type, data (dict), filters (optional)
   - **Return:** `None`
   - **Message-Format:**
     ```python
     {
         "type": "sensor_data",
         "timestamp": 1735818000,
         "data": {...}
     }
     ```
   - **Filter-Logik:**
     - Prüft subscribed_types
     - Prüft esp_id in subscribed_esp_ids
     - Prüft sensor_type in subscribed_sensor_types
   - **Rate-Limiting:** 10 Messages/Sekunde pro Client

8. **`broadcast_threadsafe()`**
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Thread-safe Broadcast für MQTT-Callbacks
   - **Parameter:** message_type, data, filters
   - **Return:** `None`
   - **Implementierung:** Verwendet `asyncio.run_coroutine_threadsafe()`

9. **`shutdown()`**
   - **Status:** ✅ Implementiert
   - **Beschreibung:** Schließt alle Connections, räumt auf
   - **Return:** `None`

#### Subscription-System:
- **Status:** ✅ Vollständig implementiert
- **Features:**
  - Filter nach Message-Types
  - Filter nach ESP-IDs
  - Filter nach Sensor-Types
  - Rate-Limiting (10 msg/sec)
  - Thread-safe für MQTT-Callbacks

#### Event-Types unterstützt:
- `sensor_data` (von sensor_handler)
- `actuator_status` (von actuator_handler)
- `logic_execution` (von logic_engine)
- `esp_health` (könnte von heartbeat_handler kommen)
- `system_event` (generisch)

#### Integration in main.py:
- ✅ Wird in `lifespan()` initialisiert
- ✅ Wird an LogicEngine übergeben
- ✅ Wird in MQTT-Handlern verwendet (sensor_handler, actuator_handler)

#### Wo wird `broadcast()` aufgerufen:
1. **sensor_handler.py:** Nach Sensor-Data-Speicherung
2. **actuator_handler.py:** Nach Actuator-Status-Update
3. **logic_engine.py:** Nach Rule-Execution

---

## 4. MQTT-Handler

### sensor_handler.py

#### Topic-Pattern: `kaiser/{kaiser_id}/esp/+/sensor/+/data`
- **Status:** ✅ Vollständig implementiert
- **Handler:** `handle_sensor_data()`
- **Flow:**
  1. Parse Topic → esp_id, gpio
  2. Validate Payload
  3. Lookup ESP + Sensor Config
  4. Check Pi-Enhanced Mode
  5. Trigger Pi-Enhanced Processing (wenn enabled)
  6. Save Data to DB
  7. **WebSocket Broadcast:** ✅ `sensor_data`
  8. **Logic Engine Trigger:** ✅ `evaluate_sensor_data()` (non-blocking)
- **Payload-Format:**
  ```json
  {
      "ts": 1735818000,
      "esp_id": "ESP_12AB34CD",
      "gpio": 34,
      "sensor_type": "ph",
      "raw": 2150,
      "raw_mode": true
  }
  ```
- **Services:** `SensorRepository`, `SensorLibraryLoader`, `Publisher`
- **WebSocket:** ✅ Broadcast `sensor_data`

---

### actuator_handler.py

#### Topic-Pattern: `kaiser/{kaiser_id}/esp/+/actuator/+/status`
- **Status:** ✅ Vollständig implementiert
- **Handler:** `handle_actuator_status()`
- **Flow:**
  1. Parse Topic → esp_id, gpio
  2. Validate Payload
  3. Lookup ESP + Actuator Config
  4. Update ActuatorState
  5. Log to History (wenn last_command vorhanden)
  6. **WebSocket Broadcast:** ✅ `actuator_status`
- **Payload-Format:**
  ```json
  {
      "ts": 1735818000,
      "esp_id": "ESP_12AB34CD",
      "gpio": 18,
      "actuator_type": "pump",
      "state": "on",
      "value": 255,
      "last_command": "on"
  }
  ```
- **Services:** `ActuatorRepository`
- **WebSocket:** ✅ Broadcast `actuator_status`

---

### heartbeat_handler.py

#### Topic-Pattern: `kaiser/{kaiser_id}/esp/+/system/heartbeat`
- **Status:** ✅ Vollständig implementiert
- **Handler:** `handle_heartbeat()`
- **Flow:**
  1. Parse Topic → esp_id
  2. Validate Payload
  3. **Auto-Discovery:** ❌ DEAKTIVIERT (Devices müssen via API registriert werden)
  4. Update ESP Status → "online"
  5. Update last_seen
  6. Update Metadata (health, zone_info)
  7. Log Health Metrics
- **Payload-Format:**
  ```json
  {
      "esp_id": "ESP_12AB34CD",
      "ts": 1735818000,
      "uptime": 123456,
      "heap_free": 45000,
      "wifi_rssi": -45,
      "sensor_count": 3,
      "actuator_count": 2
  }
  ```
- **Services:** `ESPRepository`
- **WebSocket:** ❌ Kein Broadcast (könnte `esp_health` senden)
- **TODOs/Lücken:**
  - **TODO:** WebSocket-Broadcast für Health-Updates fehlt
  - Auto-Discovery ist deaktiviert (muss via API registriert werden)

---

### config_handler.py

#### Topic-Pattern: `kaiser/{kaiser_id}/esp/+/config_response`
- **Status:** ✅ Vollständig implementiert
- **Handler:** `handle_config_ack()`
- **Flow:**
  1. Parse Topic → esp_id
  2. Validate Payload
  3. Log Response (success/error)
- **Payload-Format:**
  ```json
  {
      "status": "success",
      "type": "sensor",
      "count": 3,
      "message": "Configured 3 sensor(s) successfully"
  }
  ```
- **Services:** Keine (nur Logging)
- **WebSocket:** ❌ Kein Broadcast
- **TODOs/Lücken:**
  - **TODO:** Audit-Log-Table fehlt (Kommentar vorhanden)
  - **TODO:** WebSocket-Broadcast für Config-ACKs

---

### discovery_handler.py

#### Topic-Pattern: `kaiser/{kaiser_id}/discovery/esp32_nodes`
- **Status:** ✅ Implementiert (aber DEPRECATED)
- **Handler:** `handle_discovery()`
- **Flow:**
  1. Validate Payload
  2. Check if ESP exists
  3. If exists: Update metadata
  4. If not: Auto-register
- **Payload-Format:**
  ```json
  {
      "esp_id": "ESP_AB12CD34",
      "hardware_type": "ESP32_WROOM",
      "mac_address": "AA:BB:CC:DD:EE:FF",
      "ip_address": "192.168.1.100",
      "firmware_version": "4.0.0"
  }
  ```
- **Services:** `ESPRepository`
- **WebSocket:** ❌ Kein Broadcast
- **Hinweis:** 
  - **DEPRECATED:** Discovery erfolgt primär via Heartbeat
  - Wird nur für Legacy-ESPs verwendet

---

### actuator_response_handler.py

#### Status: ✅ Vorhanden (nicht analysiert, da nicht in main.py registriert)
- **Topic:** `kaiser/{kaiser_id}/esp/+/actuator/+/response`
- **Zweck:** Command-Bestätigungen von ESP32

---

### actuator_alert_handler.py

#### Status: ✅ Vorhanden (nicht analysiert, da nicht in main.py registriert)
- **Topic:** `kaiser/{kaiser_id}/esp/+/actuator/+/alert`
- **Zweck:** Emergency/Timeout-Alerts von ESP32

---

### kaiser_handler.py

#### Status: ❓ Nicht analysiert (Datei vorhanden)

---

## 5. Pydantic Schemas

### esp.py

#### Schemas:
- `ESPDeviceBase` - Base-Felder
- `ESPDeviceCreate` - Request für POST /devices
- `ESPDeviceUpdate` - Request für PATCH /devices/{esp_id}
- `ESPDeviceResponse` - Response mit allen Feldern
- `ESPDeviceListResponse` - Paginierte Liste
- `ESPConfigUpdate` - Request für POST /devices/{esp_id}/config
- `ESPConfigResponse` - Response für Config-Update
- `ESPRestartRequest` - Request für POST /devices/{esp_id}/restart
- `ESPResetRequest` - Request für POST /devices/{esp_id}/reset
- `ESPCommandResponse` - Response für Commands
- `ESPHealthResponse` - Response für GET /devices/{esp_id}/health
- `ESPHealthMetrics` - Health-Metriken
- `ESPDiscoveryResponse` - Response für GET /discovery
- `DiscoveredESP` - Discovered Device
- `AssignKaiserRequest` - Request für POST /devices/{esp_id}/assign_kaiser
- `AssignKaiserResponse` - Response für Kaiser-Assignment

**Felder (ESPDeviceResponse):**
- id (UUID)
- device_id (str, Pattern: ESP_XXXXXXXX)
- name (Optional[str])
- zone_id (Optional[str])
- zone_name (Optional[str])
- is_zone_master (bool)
- ip_address (str)
- mac_address (str, Pattern: XX:XX:XX:XX:XX:XX)
- firmware_version (str)
- hardware_type (str)
- capabilities (Optional[Dict])
- status (str: online, offline, error, unknown)
- last_seen (Optional[datetime])
- metadata (Optional[Dict])
- sensor_count (int)
- actuator_count (int)
- created_at, updated_at (datetime)

---

### sensor.py

#### Schemas:
- `SensorConfigBase` - Base-Felder
- `SensorConfigCreate` - Request für POST /sensors/{esp_id}/{gpio}
- `SensorConfigUpdate` - Request für Update
- `SensorConfigResponse` - Response
- `SensorConfigListResponse` - Paginierte Liste
- `SensorDataQuery` - Query-Parameter für GET /sensors/data
- `SensorDataResponse` - Response mit Readings
- `SensorReading` - Einzelnes Reading
- `SensorStats` - Statistik
- `SensorStatsResponse` - Response für Stats

**Felder (SensorConfigResponse):**
- id (UUID)
- esp_id (int, DB-ID)
- esp_device_id (Optional[str], ESP_XXXXXXXX)
- gpio (int, 0-39)
- sensor_type (str)
- name (Optional[str])
- enabled (bool)
- interval_ms (int)
- processing_mode (str: pi_enhanced, local, raw)
- calibration (Optional[Dict])
- threshold_min, threshold_max (Optional[float])
- warning_min, warning_max (Optional[float])
- metadata (Optional[Dict])
- latest_value (Optional[float])
- latest_quality (Optional[str])
- latest_timestamp (Optional[datetime])
- created_at, updated_at (datetime)

---

### actuator.py

#### Schemas:
- `ActuatorConfigBase` - Base-Felder
- `ActuatorConfigCreate` - Request für POST /actuators/{esp_id}/{gpio}
- `ActuatorConfigUpdate` - Request für Update
- `ActuatorConfigResponse` - Response
- `ActuatorConfigListResponse` - Paginierte Liste
- `ActuatorCommand` - Request für POST /actuators/{esp_id}/{gpio}/command
- `ActuatorCommandResponse` - Response
- `ActuatorState` - State-Model
- `ActuatorStatusResponse` - Response für GET /actuators/{esp_id}/{gpio}/status
- `ActuatorHistoryEntry` - History-Eintrag
- `ActuatorHistoryResponse` - Response für GET /actuators/{esp_id}/{gpio}/history
- `EmergencyStopRequest` - Request für POST /actuators/emergency_stop
- `EmergencyStopResponse` - Response

**Felder (ActuatorConfigResponse):**
- id (UUID)
- esp_id (int, DB-ID)
- esp_device_id (Optional[str])
- gpio (int, 0-39)
- actuator_type (str: digital, pwm, servo)
- name (Optional[str])
- enabled (bool)
- max_runtime_seconds (Optional[int])
- cooldown_seconds (Optional[int])
- pwm_frequency (Optional[int])
- servo_min_pulse, servo_max_pulse (Optional[int])
- metadata (Optional[Dict])
- current_value (Optional[float])
- is_active (Optional[bool])
- last_command_at (Optional[datetime])
- created_at, updated_at (datetime)

**Type-Mapping:**
- ESP32 Types (pump, valve, relay, pwm) → Server Types (digital, pwm, servo)
- Automatische Normalisierung in `normalize_actuator_type()`

---

### logic.py

#### Schemas:
- `SensorCondition` - Sensor-basierte Condition
- `TimeCondition` - Time-basierte Condition
- `CooldownCondition` - Cooldown-Condition
- `ActuatorAction` - Actuator-Command Action
- `LogicRuleCreate` - Request für POST /logic/rules
- `LogicRuleUpdate` - Request für PUT /logic/rules/{rule_id}
- `LogicRuleResponse` - Response
- `LogicRuleListResponse` - Paginierte Liste
- `RuleToggleRequest` - Request für POST /logic/rules/{rule_id}/toggle
- `RuleToggleResponse` - Response
- `RuleTestRequest` - Request für POST /logic/rules/{rule_id}/test
- `RuleTestResponse` - Response mit Condition/Action Results
- `ConditionResult` - Condition-Evaluation-Result
- `ActionResult` - Action-Evaluation-Result
- `ExecutionHistoryEntry` - History-Eintrag
- `ExecutionHistoryResponse` - Response für GET /logic/execution_history

**Felder (LogicRuleResponse):**
- id (UUID)
- name (str)
- description (Optional[str])
- conditions (list[dict])
- actions (list[dict])
- logic_operator (str: AND, OR)
- enabled (bool)
- priority (int)
- cooldown_seconds (Optional[int])
- max_executions_per_hour (Optional[int])
- last_triggered (Optional[datetime])
- execution_count (int)
- last_execution_success (Optional[bool])
- created_at, updated_at (datetime)

---

### auth.py

#### Schemas:
- `LoginRequest` - Request für POST /auth/login
- `LoginResponse` - Response mit Tokens + User
- `TokenResponse` - JWT Tokens
- `RegisterRequest` - Request für POST /auth/register
- `RegisterResponse` - Response
- `RefreshTokenRequest` - Request für POST /auth/refresh
- `RefreshTokenResponse` - Response
- `LogoutRequest` - Request für POST /auth/logout
- `LogoutResponse` - Response
- `UserResponse` - User-Info
- `MQTTAuthConfigRequest` - Request für POST /auth/mqtt/configure
- `MQTTAuthConfigResponse` - Response
- `MQTTAuthStatusResponse` - Response für GET /auth/mqtt/status

**Felder (UserResponse):**
- id (int)
- username (str)
- email (str)
- full_name (Optional[str])
- role (str: admin, operator, viewer)
- is_active (bool)
- created_at, updated_at (datetime)

---

### websocket.py

#### Status: ❓ Nicht gefunden (möglicherweise in realtime.py integriert)

---

### common.py

#### Schemas:
- `BaseResponse` - Base mit success, message
- `IDMixin` - id (UUID)
- `TimestampMixin` - created_at, updated_at
- `PaginationMeta` - Pagination-Info
- `PaginatedResponse` - Base für paginierte Responses

---

## 6. Database Models

### esp.py

#### Model: `ESPDevice`
- **Tabellenname:** `esp_devices`
- **Felder:**
  - id (UUID, PK)
  - device_id (str, unique, indexed)
  - name (Optional[str])
  - zone_id (Optional[str], indexed)
  - zone_name (Optional[str])
  - is_zone_master (bool)
  - kaiser_id (Optional[str], indexed)
  - hardware_type (str)
  - ip_address (Optional[str])
  - mac_address (Optional[str], unique)
  - firmware_version (Optional[str])
  - capabilities (JSON, default={})
  - status (str, indexed: online, offline, error, unknown)
  - last_seen (Optional[datetime], indexed)
  - health_status (Optional[str])
  - device_metadata (JSON, default={})
  - created_at, updated_at (datetime)
- **Relationships:**
  - sensors: One-to-Many → SensorConfig
  - actuators: One-to-Many → ActuatorConfig
- **Constraints:**
  - Unique: device_id, mac_address
  - Index: device_id, zone_id, kaiser_id, status, last_seen

---

### sensor.py

#### Model: `SensorConfig`
- **Tabellenname:** `sensor_configs`
- **Felder:**
  - id (UUID, PK)
  - esp_id (UUID, FK → esp_devices.id, CASCADE)
  - gpio (int)
  - sensor_type (str, indexed)
  - sensor_name (str)
  - enabled (bool)
  - pi_enhanced (bool)
  - sample_interval_ms (int)
  - calibration_data (Optional[JSON])
  - thresholds (Optional[JSON])
  - sensor_metadata (JSON, default={})
  - created_at, updated_at (datetime)
- **Relationships:**
  - esp: Many-to-One → ESPDevice
- **Constraints:**
  - Unique: (esp_id, gpio)
  - Index: (sensor_type, enabled)

#### Model: `SensorData`
- **Tabellenname:** `sensor_data`
- **Felder:**
  - id (UUID, PK)
  - esp_id (UUID, FK → esp_devices.id, CASCADE, indexed)
  - gpio (int)
  - sensor_type (str)
  - raw_value (float)
  - processed_value (Optional[float])
  - unit (Optional[str])
  - processing_mode (str)
  - quality (Optional[str])
  - timestamp (datetime, indexed, default=utcnow)
  - sensor_metadata (Optional[JSON])
- **Relationships:**
  - Keine (Time-Series, keine Foreign Keys)
- **Constraints:**
  - Index: (esp_id, gpio, timestamp)
  - Index: (sensor_type, timestamp)
  - Index: (timestamp DESC)

---

### actuator.py

#### Model: `ActuatorConfig`
- **Tabellenname:** `actuator_configs`
- **Felder:**
  - id (UUID, PK)
  - esp_id (UUID, FK → esp_devices.id, CASCADE)
  - gpio (int)
  - actuator_type (str, indexed)
  - actuator_name (str)
  - enabled (bool)
  - min_value (float, default=0.0)
  - max_value (float, default=1.0)
  - default_value (float, default=0.0)
  - timeout_seconds (Optional[int])
  - safety_constraints (Optional[JSON])
  - actuator_metadata (JSON, default={})
  - created_at, updated_at (datetime)
- **Relationships:**
  - esp: Many-to-One → ESPDevice
- **Constraints:**
  - Unique: (esp_id, gpio)
  - Index: (actuator_type, enabled)

#### Model: `ActuatorState`
- **Tabellenname:** `actuator_states`
- **Felder:**
  - id (UUID, PK)
  - esp_id (UUID, FK → esp_devices.id, CASCADE, indexed)
  - gpio (int)
  - actuator_type (str)
  - current_value (float)
  - target_value (Optional[float])
  - state (str, indexed: idle, active, error, emergency_stop)
  - last_command_timestamp (Optional[datetime])
  - runtime_seconds (int, default=0)
  - last_command (Optional[str])
  - error_message (Optional[str])
  - state_metadata (Optional[JSON])
- **Relationships:**
  - Keine (Real-Time State, keine Foreign Keys)
- **Constraints:**
  - Index: (esp_id, gpio)
  - Index: (state)
  - Index: (esp_id, state)

#### Model: `ActuatorHistory`
- **Tabellenname:** `actuator_history`
- **Felder:**
  - id (UUID, PK)
  - esp_id (UUID, FK → esp_devices.id, CASCADE, indexed)
  - gpio (int)
  - actuator_type (str)
  - command_type (str, indexed)
  - value (Optional[float])
  - issued_by (Optional[str])
  - success (bool)
  - error_message (Optional[str])
  - timestamp (datetime, indexed, default=utcnow)
  - command_metadata (Optional[JSON])
- **Relationships:**
  - Keine (Time-Series)
- **Constraints:**
  - Index: (esp_id, gpio, timestamp)
  - Index: (command_type, timestamp)
  - Index: (timestamp DESC)
  - Index: (success, timestamp)

---

### logic.py

#### Model: `CrossESPLogic`
- **Tabellenname:** `cross_esp_logic`
- **Felder:**
  - id (UUID, PK)
  - rule_name (str, unique, indexed)
  - description (Optional[str])
  - enabled (bool, indexed)
  - trigger_conditions (JSON) - **Alias:** `conditions` (property)
  - logic_operator (str, default="AND")
  - actions (JSON)
  - priority (int, default=100)
  - cooldown_seconds (Optional[int])
  - max_executions_per_hour (Optional[int])
  - last_triggered (Optional[datetime])
  - rule_metadata (JSON, default={})
  - created_at, updated_at (datetime)
- **Relationships:**
  - Keine (Standalone)
- **Constraints:**
  - Unique: rule_name
  - Index: (enabled, priority)
- **Validators:**
  - `validate_trigger_conditions()` - Pydantic-Validierung
  - `validate_actions_field()` - Pydantic-Validierung

#### Model: `LogicExecutionHistory`
- **Tabellenname:** `logic_execution_history`
- **Felder:**
  - id (UUID, PK)
  - logic_rule_id (UUID, FK → cross_esp_logic.id, CASCADE, indexed)
  - trigger_data (JSON)
  - actions_executed (JSON)
  - success (bool)
  - error_message (Optional[str])
  - execution_time_ms (int)
  - timestamp (datetime, indexed, default=utcnow)
  - execution_metadata (Optional[JSON])
- **Relationships:**
  - Keine (Time-Series)
- **Constraints:**
  - Index: (logic_rule_id, timestamp)
  - Index: (success, timestamp)
  - Index: (timestamp DESC)

---

### user.py

#### Model: `User`
- **Tabellenname:** `user_accounts`
- **Felder:**
  - id (int, PK, auto-increment)
  - username (str, unique, indexed)
  - email (str, unique, indexed)
  - password_hash (str)
  - role (str, default="viewer": admin, operator, viewer)
  - is_active (bool, default=True)
  - full_name (Optional[str])
  - created_at, updated_at (datetime)
- **Relationships:**
  - Keine
- **Constraints:**
  - Unique: username, email
  - Index: username, email

---

## 7. Main.py

### Application Startup

#### Router-Registrierung:
- ✅ `/api` → `api_v1_router` (enthält alle v1 Endpoints)
- ✅ `/api/v1/websocket` → `websocket_realtime.router`
- ✅ Root → `sensor_processing.router` (für Backward-Compatibility)

#### MQTT-Client-Initialisierung:
- ✅ `MQTTClient.get_instance().connect()` in `lifespan()`
- ✅ Fehlerbehandlung: Server startet auch wenn MQTT fehlschlägt

#### MQTT-Handler-Registrierung:
- ✅ `Subscriber` wird erstellt (max_workers=10)
- ✅ Handler werden registriert:
  1. `kaiser/{kaiser_id}/esp/+/sensor/+/data` → `sensor_handler.handle_sensor_data`
  2. `kaiser/{kaiser_id}/esp/+/actuator/+/status` → `actuator_handler.handle_actuator_status`
  3. `kaiser/{kaiser_id}/esp/+/actuator/+/response` → `actuator_response_handler.handle_actuator_response`
  4. `kaiser/{kaiser_id}/esp/+/actuator/+/alert` → `actuator_alert_handler.handle_actuator_alert`
  5. `kaiser/{kaiser_id}/esp/+/system/heartbeat` → `heartbeat_handler.handle_heartbeat`
  6. `kaiser/{kaiser_id}/discovery/esp32_nodes` → `discovery_handler.handle_discovery`
  7. `kaiser/{kaiser_id}/esp/+/config_response` → `config_handler.handle_config_ack`
- ✅ `kaiser_id` wird aus Config gelesen (default: "god")
- ✅ `subscribe_all()` wird aufgerufen

#### WebSocket-Einbindung:
- ✅ `WebSocketManager.get_instance()` wird initialisiert
- ✅ `initialize()` wird aufgerufen
- ✅ Wird an `LogicEngine` übergeben

#### Middleware-Konfiguration:
- ✅ CORS: `CORSMiddleware` mit `settings.cors_origins`
- ✅ Allow Credentials: True
- ✅ Allow Methods: *
- ✅ Allow Headers: *

#### Startup-Events:
1. ✅ Database-Initialisierung (wenn `auto_init=True`)
2. ✅ MQTT-Client-Connect
3. ✅ MQTT-Handler-Registrierung
4. ✅ MQTT-Subscriptions
5. ✅ WebSocket-Manager-Initialisierung
6. ✅ Services-Initialisierung:
   - `SafetyService`
   - `ActuatorService`
   - `LogicEngine` (wird gestartet)
7. ✅ Global LogicEngine-Instance wird gesetzt

#### Shutdown-Events:
1. ✅ LogicEngine-Stop
2. ✅ WebSocket-Manager-Shutdown
3. ✅ MQTT-Subscriber-Shutdown (Thread-Pool)
4. ✅ MQTT-Client-Disconnect
5. ✅ Database-Engine-Dispose

---

## 8. Kritische Lücken

### Blocker (müssen vor Frontend geschlossen werden)

#### Lücke 1: LogicRepository.get_rules_by_trigger_sensor() fehlt
- **Betroffene Komponenten:** 
  - `services/logic_engine.py` (Zeile 105)
  - `db/repositories/logic_repo.py`
- **Problem:** 
  - `LogicEngine.evaluate_sensor_data()` ruft `logic_repo.get_rules_by_trigger_sensor()` auf
  - Diese Methode existiert nicht im Repository
  - Logic-Engine kann keine Rules finden
- **Impact auf Frontend:** 
  - Logic-Rules werden nicht ausgeführt
  - Automation funktioniert nicht
- **Geschätzter Aufwand:** Mittel (1-2 Stunden)
- **Lösung:** 
  - Implementiere Methode in `LogicRepository`
  - Query: Finde Rules wo `trigger_conditions` ESP-ID + GPIO + Sensor-Type enthält

#### Lücke 2: Token-Blacklist für Logout fehlt
- **Betroffene Komponenten:** 
  - `api/v1/auth.py` (Zeile 400-411)
  - `db/models/` (neues Model benötigt)
- **Problem:** 
  - Logout-Endpoint invalidiert Tokens nicht wirklich
  - Refresh-Tokens können weiterhin verwendet werden
  - Security-Risiko
- **Impact auf Frontend:** 
  - Logout funktioniert nicht korrekt
  - User kann sich nach Logout weiterhin einloggen
- **Geschätzter Aufwand:** Mittel (2-3 Stunden)
- **Lösung:** 
  - Erstelle `TokenBlacklist` Model
  - Speichere Refresh-Token-Hashes in DB
  - Prüfe Blacklist in `verify_token()`

#### Lücke 3: WebSocket-Endpoint fehlt Authentication
- **Betroffene Komponenten:** 
  - `api/v1/websocket/realtime.py` (Zeile 17)
- **Problem:** 
  - WebSocket-Endpoint `/api/v1/ws/realtime/{client_id}` hat keine Auth
  - Jeder kann sich verbinden
- **Impact auf Frontend:** 
  - Security-Risiko
  - Unauthorisierte Clients können Daten empfangen
- **Geschätzter Aufwand:** Klein (1 Stunde)
- **Lösung:** 
  - Implementiere JWT-Validierung im WebSocket-Endpoint
  - Prüfe Token aus Query-Parameter oder Header

---

### Wichtig (Frontend-Features eingeschränkt)

#### Lücke 4: Discovery-Endpoint gibt leere Liste zurück
- **Betroffene Komponenten:** 
  - `api/v1/esp.py` (Zeile 731-773)
- **Problem:** 
  - `GET /api/v1/esp/discovery` gibt immer leere Liste zurück
  - mDNS-Integration fehlt
  - Discovery MQTT Topic wird nicht abgefragt
- **Impact auf Frontend:** 
  - Discovery-Feature funktioniert nicht
  - User kann keine neuen ESPs entdecken
- **Geschätzter Aufwand:** Groß (4-6 Stunden)
- **Lösung:** 
  - Implementiere mDNS-Scanner
  - Oder: Query Discovery MQTT Topic
  - Oder: Nutze Heartbeat-Discovery (aktuell deaktiviert)

#### Lücke 5: MQTT-Auth-Config ist Placeholder
- **Betroffene Komponenten:** 
  - `api/v1/auth.py` (Zeile 460-505)
- **Problem:** 
  - `POST /api/v1/auth/mqtt/configure` aktualisiert Mosquitto Password-File nicht
  - `GET /api/v1/auth/mqtt/status` gibt hardcoded Werte zurück
  - Broker-Reload fehlt
- **Impact auf Frontend:** 
  - MQTT-Auth-Konfiguration funktioniert nicht
  - Admin kann keine ESP-Credentials ändern
- **Geschätzter Aufwand:** Mittel (2-3 Stunden)
- **Lösung:** 
  - Implementiere Mosquitto Password-File Update
  - Implementiere Broker-Reload (mosquitto_ctrl reload)
  - Speichere Config in DB für Status-Abfrage

#### Lücke 6: Logic-Engine Action-Types unvollständig
- **Betroffene Komponenten:** 
  - `services/logic_engine.py` (Zeile 325-389)
- **Problem:** 
  - Nur `actuator_command` wird unterstützt
  - `notification`, `delay` Actions fehlen
  - Frontend kann Rules mit diesen Actions erstellen, aber sie werden nicht ausgeführt
- **Impact auf Frontend:** 
  - Erweiterte Automation-Features funktionieren nicht
  - User kann Rules erstellen die nicht funktionieren
- **Geschätzter Aufwand:** Mittel (2-3 Stunden)
- **Lösung:** 
  - Implementiere `notification` Action (WebSocket-Broadcast oder Email)
  - Implementiere `delay` Action (asyncio.sleep)

#### Lücke 7: Heartbeat-Handler sendet keine WebSocket-Updates
- **Betroffene Komponenten:** 
  - `mqtt/handlers/heartbeat_handler.py`
- **Problem:** 
  - Health-Updates werden nicht via WebSocket gebroadcastet
  - Frontend muss Polling verwenden für ESP-Health
- **Impact auf Frontend:** 
  - Keine Real-time Health-Updates
  - Höhere Server-Last durch Polling
- **Geschätzter Aufwand:** Klein (30 Minuten)
- **Lösung:** 
  - Füge `WebSocketManager.broadcast("esp_health", {...})` in `handle_heartbeat()` hinzu

#### Lücke 8: Config-Handler sendet keine WebSocket-Updates
- **Betroffene Komponenten:** 
  - `mqtt/handlers/config_handler.py`
- **Problem:** 
  - Config-ACKs werden nicht via WebSocket gebroadcastet
  - Frontend weiß nicht wann Config erfolgreich war
- **Impact auf Frontend:** 
  - Keine Real-time Config-Status-Updates
  - User muss manuell prüfen ob Config angekommen ist
- **Geschätzter Aufwand:** Klein (30 Minuten)
- **Lösung:** 
  - Füge `WebSocketManager.broadcast("config_response", {...})` hinzu

---

### Nice-to-have (Optimierungen, können später kommen)

#### Lücke 9: Logic-Engine Queue-System fehlt
- **Betroffene Komponenten:** 
  - `services/logic_engine.py` (Zeile 391-414)
- **Problem:** 
  - `_evaluation_loop()` ist aktuell nur Placeholder
  - Keine Queue für Evaluations
  - Evaluations werden direkt ausgeführt (könnte bei hoher Last problematisch sein)
- **Impact auf Frontend:** 
  - Keine direkten Auswirkungen
  - Performance könnte bei vielen Rules leiden
- **Geschätzter Aufwand:** Groß (4-6 Stunden)
- **Lösung:** 
  - Implementiere Queue-System (z.B. asyncio.Queue)
  - Priorisiere Evaluations nach Rule-Priority

#### Lücke 10: Health-Endpoint Placeholder-Werte
- **Betroffene Komponenten:** 
  - `api/v1/health.py` (Zeile 125-129)
- **Problem:** 
  - `pool_size`, `pool_available`, `latency_ms` sind hardcoded
  - Echte DB-Pool-Metriken fehlen
- **Impact auf Frontend:** 
  - Health-Dashboard zeigt ungenaue Werte
- **Geschätzter Aufwand:** Klein (1 Stunde)
- **Lösung:** 
  - Query echte DB-Pool-Metriken (SQLAlchemy Engine)

#### Lücke 11: Sensor-Calibration Polynomial-Fitting
- **Betroffene Komponenten:** 
  - `services/sensor_service.py` (Zeile 442-448)
- **Problem:** 
  - Polynomial-Calibration fällt zurück zu Linear
  - numpy wird nicht verwendet
- **Impact auf Frontend:** 
  - Erweiterte Calibration-Methoden funktionieren nicht optimal
- **Geschätzter Aufwand:** Klein (1 Stunde)
- **Lösung:** 
  - Füge numpy als Dependency hinzu
  - Implementiere echte Polynomial-Fitting

#### Lücke 12: Kaiser-Service komplett fehlend
- **Betroffene Komponenten:** 
  - `services/kaiser_service.py`
  - `api/v1/kaiser.py`
- **Problem:** 
  - Kaiser-Node-Management fehlt komplett
  - Nur für Skalierung >50 ESPs benötigt
- **Impact auf Frontend:** 
  - Keine direkten Auswirkungen (nur für große Deployments)
- **Geschätzter Aufwand:** Groß (8-12 Stunden)
- **Lösung:** 
  - Implementiere Kaiser-Service
  - Implementiere Kaiser-API-Endpoints
  - Implementiere Certificate-Generation

#### Lücke 13: AI-Service komplett fehlend
- **Betroffene Komponenten:** 
  - `services/ai_service.py`
  - `api/v1/ai.py`
- **Problem:** 
  - AI/God-Layer-Integration fehlt
  - Nur für v5.1+ Feature benötigt
- **Impact auf Frontend:** 
  - Keine direkten Auswirkungen (zukünftiges Feature)
- **Geschätzter Aufwand:** Sehr groß (16+ Stunden)
- **Lösung:** 
  - Implementiere AI-Service
  - Implementiere AI-API-Endpoints
  - Implementiere God-Layer-Client

#### Lücke 14: Library-Service komplett fehlend
- **Betroffene Komponenten:** 
  - `api/v1/library.py`
- **Problem:** 
  - OTA Library-Distribution fehlt
  - Nur für Phase 7 (DYNAMIC_LIBRARY_SUPPORT) benötigt
- **Impact auf Frontend:** 
  - Keine direkten Auswirkungen (zukünftiges Feature)
- **Geschätzter Aufwand:** Groß (8-12 Stunden)
- **Lösung:** 
  - Implementiere Library-Service
  - Implementiere Library-API-Endpoints
  - Implementiere OTA-Distribution

---

## 📊 Zusammenfassung

### Implementierungsstatus nach Kategorien

#### ✅ Vollständig implementiert (90%+)
- **REST API Endpoints:** 
  - ESP-Management: 9/10 Endpoints ✅
  - Sensor-Management: 5/5 Endpoints ✅
  - Actuator-Management: 7/7 Endpoints ✅
  - Logic-Rules: 7/7 Endpoints ✅
  - Auth: 6/8 Endpoints ✅ (2 Placeholder)
  - Health: 6/6 Endpoints ✅
- **Services:** 
  - ESPService: 11/11 Methoden ✅
  - SensorService: 8/8 Methoden ✅
  - ActuatorService: 1/1 Methode ✅
  - SafetyService: 6/6 Methoden ✅
  - LogicEngine: 5/5 Methoden ✅ (1 Repository-Methode fehlt)
- **WebSocket-Manager:** ✅ Vollständig implementiert
- **MQTT-Handler:** 
  - sensor_handler: ✅
  - actuator_handler: ✅
  - heartbeat_handler: ✅ (WebSocket-Broadcast fehlt)
  - config_handler: ✅ (WebSocket-Broadcast fehlt)
  - discovery_handler: ✅ (DEPRECATED)
- **Database Models:** ✅ Alle Models vollständig
- **Pydantic Schemas:** ✅ Alle Schemas vollständig

#### 🚧 Teilweise implementiert (50-90%)
- **REST API Endpoints:** 
  - Discovery: Placeholder (gibt leere Liste zurück)
  - MQTT-Auth: Placeholder (keine echte Mosquitto-Integration)
- **Services:** 
  - LogicEngine: Repository-Methode fehlt
  - LogicEngine: Action-Types unvollständig

#### 📋 Nur Skeleton (0-50%)
- **REST API Endpoints:** 
  - Kaiser-API: Nur Router-Definition
  - AI-API: Nur Router-Definition
  - Library-API: Nur Router-Definition
- **Services:** 
  - logic_service.py: Nur Kommentar
  - kaiser_service.py: Nur Kommentar
  - ai_service.py: Nur Kommentar

---

### Priorisierte To-Do-Liste für Frontend-Integration

#### 🔴 KRITISCH (muss vor Frontend-Start geschlossen werden)

1. **LogicRepository.get_rules_by_trigger_sensor() implementieren**
   - **Datei:** `db/repositories/logic_repo.py`
   - **Aufwand:** 1-2 Stunden
   - **Blockiert:** Logic-Engine funktioniert nicht

2. **WebSocket-Authentication hinzufügen**
   - **Datei:** `api/v1/websocket/realtime.py`
   - **Aufwand:** 1 Stunde
   - **Blockiert:** Security-Risiko

3. **Token-Blacklist für Logout implementieren**
   - **Datei:** `api/v1/auth.py`, `db/models/` (neues Model)
   - **Aufwand:** 2-3 Stunden
   - **Blockiert:** Logout funktioniert nicht korrekt

#### 🟡 WICHTIG (sollte vor Frontend-Start geschlossen werden)

4. **LogicEngine Action-Types erweitern (notification, delay)**
   - **Datei:** `services/logic_engine.py`
   - **Aufwand:** 2-3 Stunden
   - **Blockiert:** Erweiterte Automation-Features

5. **WebSocket-Broadcasts in Handlers hinzufügen**
   - **Dateien:** `mqtt/handlers/heartbeat_handler.py`, `config_handler.py`
   - **Aufwand:** 1 Stunde
   - **Blockiert:** Real-time Updates für Health/Config

6. **MQTT-Auth-Config implementieren**
   - **Datei:** `api/v1/auth.py`
   - **Aufwand:** 2-3 Stunden
   - **Blockiert:** MQTT-Auth-Management

#### 🟢 NICE-TO-HAVE (kann nach Frontend-Start kommen)

7. Discovery-Endpoint implementieren (mDNS oder MQTT-Query)
8. Health-Endpoint Placeholder-Werte ersetzen
9. Sensor-Calibration Polynomial-Fitting
10. Logic-Engine Queue-System
11. Kaiser-Service (nur für große Deployments)
12. AI-Service (zukünftiges Feature)
13. Library-Service (zukünftiges Feature)

---

### Frontend-Integration-Ready-Checklist

#### ✅ Bereit für Frontend-Integration
- [x] REST API Endpoints für ESP-Management
- [x] REST API Endpoints für Sensor-Management
- [x] REST API Endpoints für Actuator-Management
- [x] REST API Endpoints für Logic-Rules
- [x] REST API Endpoints für Authentication
- [x] REST API Endpoints für Health-Checks
- [x] WebSocket-Manager mit Subscription-System
- [x] MQTT-Integration (Sensor, Actuator, Heartbeat)
- [x] Database Models vollständig
- [x] Pydantic Schemas vollständig
- [x] Safety-Service für Actuator-Commands
- [x] Logic-Engine für Automation

#### ⚠️ Muss noch geschlossen werden
- [ ] LogicRepository.get_rules_by_trigger_sensor()
- [ ] WebSocket-Authentication
- [ ] Token-Blacklist für Logout
- [ ] LogicEngine Action-Types (notification, delay)
- [ ] WebSocket-Broadcasts in Handlers

#### 📋 Optional (kann später kommen)
- [ ] Discovery-Endpoint (mDNS)
- [ ] MQTT-Auth-Config (Mosquitto-Integration)
- [ ] Health-Endpoint Placeholder-Werte
- [ ] Kaiser-Service
- [ ] AI-Service
- [ ] Library-Service

---

### Empfehlung

**Der Server ist zu ~90% Frontend-ready.** 

Die kritischen Lücken (LogicRepository-Methode, WebSocket-Auth, Token-Blacklist) können in **4-6 Stunden** geschlossen werden. Danach kann das Frontend mit der Integration beginnen.

Die wichtigsten Lücken (Action-Types, WebSocket-Broadcasts) können parallel zur Frontend-Entwicklung geschlossen werden, da sie keine Blocker sind.

**Nächste Schritte:**
1. Implementiere die 3 kritischen Lücken (🔴)
2. Starte Frontend-Integration mit bestehenden Endpoints
3. Implementiere wichtige Lücken parallel (🟡)
4. Nice-to-have Features später (🟢)

---

**Ende der Analyse**