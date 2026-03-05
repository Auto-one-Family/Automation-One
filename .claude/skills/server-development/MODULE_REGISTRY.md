---
name: server-module-registry
description: Vollständige API-Referenz für God-Kaiser Server Module
---

# God-Kaiser Server - Module Registry

> **Vollständige API-Referenz für alle Server-Module**
> **Codebase:** `El Servador/god_kaiser_server/src/` (~60,604 Zeilen Python)

---

## 1. Services API

### 1.1 LogicEngine

**Datei:** `src/services/logic_engine.py` (833 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `start()` | - | `None` | Startet Engine + Scheduler |
| `stop()` | - | `None` | Stoppt Engine graceful |
| `evaluate_sensor_data()` | `esp_id: str, gpio: int, value: float, sensor_type: str` | `None` | Evaluiert Rules für Sensor-Event |
| `evaluate_timer_triggered_rules()` | - | `None` | Evaluiert time_window Rules (periodisch) |
| `_evaluate_rule()` | `rule, trigger_data, logic_repo` | `None` | Einzelne Rule evaluieren + ausführen |
| `_check_conditions()` | `conditions, context` | `bool` | Conditions prüfen (modulare Evaluatoren) |
| `_execute_actions()` | `actions, trigger_data, rule_id, rule_name` | `None` | Actions ausführen (mit WS-Broadcast) |

**Condition Evaluators:**

| Evaluator | Typ | Parameter |
|-----------|-----|-----------|
| SensorConditionEvaluator | `sensor` / `sensor_threshold` | `esp_id`, `gpio`, `sensor_type`, `operator`, `value` |
| TimeConditionEvaluator | `time_window` / `time` | `start_time` (HH:MM), `end_time` (HH:MM), `days_of_week` |
| HysteresisConditionEvaluator | `hysteresis` | `esp_id`, `gpio`, `sensor_type`, `activate_above`, `deactivate_below`, `activate_below?`, `deactivate_above?` |
| CompoundConditionEvaluator | `compound` | `logic` (AND/OR), `conditions[]` |

**Action Executors:**

| Executor | Typ | Parameter |
|----------|-----|-----------|
| ActuatorActionExecutor | `actuator` / `actuator_command` | `esp_id`, `gpio`, `command`, `value?`, `duration?` |
| DelayActionExecutor | `delay` | `seconds` (1-3600) |
| NotificationActionExecutor | `notification` | `channel`, `target`, `message_template` |
| SequenceActionExecutor | `sequence` | `description?`, `abort_on_failure?`, `steps[]` (name, action, delay_seconds?) |

---

### 1.2 SafetyService

**Datei:** `src/services/safety_service.py` (264 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `validate_actuator_command()` | `esp_id, gpio, command, value` | `ValidationResult` | **CRITICAL PATH** - VOR jedem Command |
| `emergency_stop_all()` | `reason: str` | `int` | Stoppt ALLE Actuators, returns count |
| `emergency_stop_esp()` | `esp_id: str, reason: str` | `int` | Stoppt ESP-Actuators |
| `emergency_stop_subzone()` | `esp_id, subzone_id, reason` | `int` | Stoppt Subzone-Actuators |
| `clear_emergency()` | `esp_id: str` | `bool` | Hebt Emergency auf |
| `is_emergency_active()` | `esp_id: str` | `bool` | Prüft Emergency-Status |
| `get_safety_status()` | - | `SafetyStatus` | Globaler Safety-Status |

**ValidationResult:**
```python
@dataclass
class ValidationResult:
    valid: bool
    reason: Optional[str] = None
    error_code: Optional[int] = None
```

---

### 1.3 SensorService

**Datei:** `src/services/sensor_service.py` (545 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `process_reading()` | `esp_id, gpio, raw_value, sensor_type, **kwargs` | `SensorData` | Verarbeitet + speichert Sensor-Daten |
| `trigger_measurement()` | `esp_id, gpio` | `bool` | Triggert On-Demand Messung via MQTT |
| `get_latest()` | `sensor_id: int` | `Optional[SensorData]` | Letzter Sensorwert |
| `get_history()` | `sensor_id, start, end, limit` | `List[SensorData]` | Zeitbereich |
| `create_config()` | `esp_id, config: SensorConfigCreate` | `SensorConfig` | Neue Sensor-Config |
| `update_config()` | `sensor_id, config: SensorConfigUpdate` | `SensorConfig` | Config aktualisieren |
| `delete_config()` | `sensor_id: int` | `bool` | Config löschen |
| `get_by_esp()` | `esp_id: str` | `List[SensorConfig]` | Alle Sensoren eines ESP |

---

### 1.4 ActuatorService

**Datei:** `src/services/actuator_service.py` (279 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `send_command()` | `esp_id, gpio, command, value, duration` | `CommandResult` | Sendet Actuator-Command |
| `get_state()` | `esp_id, gpio` | `Optional[ActuatorState]` | Aktueller Actuator-Status |
| `update_state()` | `esp_id, gpio, state: dict` | `ActuatorState` | State aus MQTT-Status |
| `create_config()` | `esp_id, config: ActuatorConfigCreate` | `ActuatorConfig` | Neue Actuator-Config |
| `update_config()` | `actuator_id, config: ActuatorConfigUpdate` | `ActuatorConfig` | Config aktualisieren |
| `delete_config()` | `actuator_id: int` | `bool` | Config löschen |
| `log_command()` | `esp_id, gpio, command, response` | `ActuatorHistory` | Command in History loggen |

---

### 1.5 ESPService

**Datei:** `src/services/esp_service.py` (944 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `register()` | `device_id: str, **metadata` | `ESPDevice` | Neues ESP registrieren |
| `approve()` | `device_id: str` | `ESPDevice` | Pending ESP genehmigen |
| `reject()` | `device_id: str, reason: str` | `bool` | Pending ESP ablehnen |
| `get_by_id()` | `device_id: str` | `Optional[ESPDevice]` | ESP nach ID |
| `get_all()` | `include_offline: bool` | `List[ESPDevice]` | Alle ESPs |
| `get_online()` | - | `List[ESPDevice]` | Nur online ESPs |
| `get_pending()` | - | `List[ESPDevice]` | Pending Approvals |
| `update_status()` | `device_id, is_online, metadata` | `ESPDevice` | Status aktualisieren |
| `delete()` | `device_id: str` | `bool` | ESP löschen |
| `push_config()` | `device_id: str` | `bool` | Config via MQTT pushen |
| `reboot()` | `device_id: str` | `bool` | Reboot-Command senden |

---

### 1.6 ZoneService

**Datei:** `src/services/zone_service.py` (430 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `assign_zone()` | `esp_id, zone_id, zone_name` | `bool` | Zone zu ESP zuweisen |
| `unassign_zone()` | `esp_id: str` | `bool` | Zone entfernen |
| `get_zone_devices()` | `zone_id: str` | `List[ESPDevice]` | Alle ESPs einer Zone |
| `get_zone_sensors()` | `zone_id: str` | `List[SensorConfig]` | Alle Sensoren einer Zone |
| `get_zone_actuators()` | `zone_id: str` | `List[ActuatorConfig]` | Alle Actuators einer Zone |

---

### 1.7 SubzoneService

**Datei:** `src/services/subzone_service.py` (595 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `assign_subzone()` | `esp_id, subzone_id, gpio_pins[]` | `SubzoneConfig` | Subzone zuweisen |
| `remove_subzone()` | `esp_id, subzone_id` | `bool` | Subzone entfernen |
| `set_safe_mode()` | `esp_id, subzone_id, active, reason` | `bool` | Safe-Mode aktivieren |
| `get_subzones()` | `esp_id: str` | `List[SubzoneConfig]` | Alle Subzones eines ESP |
| `get_subzone_status()` | `esp_id, subzone_id` | `SubzoneStatus` | Subzone-Status |

---

### 1.8 ConfigBuilder

**Datei:** `src/services/config_builder.py` (249 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `build_esp_config()` | `esp_id: str` | `dict` | Vollständige ESP-Config |
| `build_sensor_config()` | `sensor: SensorConfig` | `dict` | Einzelne Sensor-Config |
| `build_actuator_config()` | `actuator: ActuatorConfig` | `dict` | Einzelne Actuator-Config |
| `build_zone_assignment()` | `esp_id, zone_id, zone_name` | `dict` | Zone-Assignment Payload |

---

### 1.9 GpioValidationService

**Datei:** `src/services/gpio_validation_service.py` (497 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `validate_gpio_conflict()` | `esp_id, gpio, component_type` | `ValidationResult` | GPIO-Konflikt prüfen |
| `get_gpio_usage()` | `esp_id: str` | `Dict[int, GpioUsage]` | GPIO-Belegung eines ESP |
| `is_gpio_available()` | `esp_id, gpio` | `bool` | GPIO verfügbar? |

---

### 1.10 MaintenanceService

**Datei:** `src/services/maintenance/service.py` (260 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `start()` | - | `None` | Service starten, Jobs registrieren |
| `stop()` | - | `None` | Service stoppen |
| `register_jobs()` | - | `None` | Alle Maintenance-Jobs registrieren |
| `run_cleanup_now()` | `job_name: str` | `int` | Manueller Cleanup-Trigger |

---

### 1.11 SimulationScheduler

**Datei:** `src/services/simulation/scheduler.py` (802 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `start_mock()` | `esp_id: str` | `bool` | Mock-ESP starten |
| `stop_mock()` | `esp_id: str` | `bool` | Mock-ESP stoppen |
| `stop_all_mocks()` | - | `int` | Alle Mocks stoppen |
| `recover_mocks()` | - | `int` | Mocks aus DB wiederherstellen |
| `get_running_mocks()` | - | `List[str]` | Liste aktiver Mock-ESP IDs |
| `is_mock_running()` | `esp_id: str` | `bool` | Prüft Mock-Status |

---

### 1.12 AuditRetentionService

**Datei:** `src/services/audit_retention_service.py` (894 Zeilen)

| Methode | Parameter | Return | Beschreibung |
|---------|-----------|--------|--------------|
| `apply_retention_policy()` | - | `RetentionResult` | Retention Policy ausführen |
| `cleanup_old_logs()` | `retention_days: int` | `int` | Alte Logs löschen |
| `get_statistics()` | - | `AuditStats` | Audit-Log Statistiken |
| `export_csv()` | `start, end, path` | `str` | Export als CSV |

---

## 2. MQTT Topics & Payloads

### 2.1 Subscribed Topics (Server empfängt)

| Topic Pattern | QoS | Handler | Payload-Felder (Required) |
|---------------|-----|---------|---------------------------|
| `kaiser/{id}/esp/+/sensor/+/data` | 1 | SensorDataHandler | `ts`, `esp_id`, `gpio`, `sensor_type`, `raw`, `raw_mode` |
| `kaiser/{id}/esp/+/system/heartbeat` | 0 | HeartbeatHandler | `ts`, `uptime`, `heap_free`, `wifi_rssi` |
| `kaiser/{id}/esp/+/actuator/+/status` | 1 | ActuatorStatusHandler | `ts`, `gpio`, `state`, `value` |
| `kaiser/{id}/esp/+/actuator/+/response` | 1 | ActuatorResponseHandler | `gpio`, `command`, `success`, `message` |
| `kaiser/{id}/esp/+/actuator/+/alert` | 1 | ActuatorAlertHandler | `gpio`, `type`, `message` |
| `kaiser/{id}/esp/+/config_response` | 2 | ConfigHandler | `esp_id`, `config_id`, `config_applied` |
| `kaiser/{id}/esp/+/zone/ack` | 1 | ZoneAckHandler | `esp_id`, `zone_id`, `success` |
| `kaiser/{id}/esp/+/subzone/ack` | 1 | SubzoneAckHandler | `esp_id`, `subzone_id`, `action`, `success` |
| `kaiser/{id}/esp/+/system/will` | 1 | LWTHandler | `esp_id`, `status`, `reason` |
| `kaiser/{id}/esp/+/system/error` | 1 | ErrorEventHandler | `esp_id`, `error_code`, `severity`, `message` |

### 2.2 Published Topics (Server sendet)

| Topic Pattern | QoS | Publisher-Methode | Payload-Felder |
|---------------|-----|-------------------|----------------|
| `.../actuator/{gpio}/command` | 2 | `publish_actuator_command()` | `command`, `value`, `duration`, `timestamp` |
| `.../sensor/{gpio}/command` | 2 | `publish_sensor_command()` | `command`, `request_id` |
| `.../config/sensor/{gpio}` | 2 | `publish_sensor_config()` | Vollständige SensorConfig |
| `.../config/actuator/{gpio}` | 2 | `publish_actuator_config()` | Vollständige ActuatorConfig |
| `.../config` | 2 | `publish_config()` | Kombinierte ESP-Config |
| `.../system/command` | 2 | `publish_system_command()` | `command`, `params` |
| `.../zone/assign` | 1 | `publish_zone_assignment()` | `zone_id`, `zone_name` |
| `.../subzone/assign` | 1 | `publish_subzone_assignment()` | `subzone_id`, `gpio_pins[]` |
| `.../sensor/{gpio}/processed` | 1 | `publish_pi_enhanced_response()` | `processed_value`, `unit`, `quality` |
| `kaiser/broadcast/emergency` | 2 | `publish_emergency_broadcast()` | `action`, `reason` |

---

## 3. REST Endpoints (170 total)

### 3.1 Auth Router (`/v1/auth`) - 10 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/status` | - | - | `SystemStatus` |
| POST | `/setup` | - | `SetupRequest` | `User` |
| POST | `/login` | - | `LoginRequest` | `TokenResponse` |
| POST | `/refresh` | - | `RefreshRequest` | `TokenResponse` |
| POST | `/logout` | Active | - | `SuccessResponse` |
| GET | `/me` | Active | - | `UserResponse` |
| PUT | `/me` | Active | `UserUpdate` | `UserResponse` |
| POST | `/change-password` | Active | `PasswordChange` | `SuccessResponse` |
| POST | `/verify-token` | - | `TokenVerify` | `TokenStatus` |
| POST | `/revoke-all` | Admin | - | `SuccessResponse` |

### 3.2 ESP Router (`/v1/esp`) - 14 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/devices` | Active | - | `List[ESPDevice]` |
| GET | `/devices/{esp_id}` | Active | - | `ESPDevice` |
| POST | `/register` | Operator | `ESPRegister` | `ESPDevice` |
| DELETE | `/devices/{esp_id}` | Operator | - | `SuccessResponse` |
| POST | `/approval/approve` | Operator | `ApprovalRequest` | `ESPDevice` |
| POST | `/approval/reject` | Operator | `RejectRequest` | `SuccessResponse` |
| GET | `/pending` | Operator | - | `List[ESPDevice]` |
| POST | `/devices/{esp_id}/config/push` | Operator | - | `SuccessResponse` |
| POST | `/devices/{esp_id}/reboot` | Operator | - | `SuccessResponse` |
| GET | `/devices/{esp_id}/gpio-status` | Active | - | `GpioStatus` |
| GET | `/online` | Active | - | `List[ESPDevice]` |
| GET | `/offline` | Active | - | `List[ESPDevice]` |
| GET | `/devices/{esp_id}/health` | Active | - | `ESPHealth` |
| PUT | `/devices/{esp_id}` | Operator | `ESPUpdate` | `ESPDevice` |

### 3.3 Sensors Router (`/v1/sensors`) - 11 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/` | Active | - | `List[SensorConfig]` |
| GET | `/{sensor_id}` | Active | - | `SensorConfig` |
| POST | `/` | Operator | `SensorConfigCreate` | `SensorConfig` |
| PUT | `/{sensor_id}` | Operator | `SensorConfigUpdate` | `SensorConfig` |
| DELETE | `/{sensor_id}` | Operator | - | `SuccessResponse` |
| GET | `/{sensor_id}/data` | Active | `start`, `end`, `limit` | `List[SensorData]` |
| GET | `/{sensor_id}/latest` | Active | - | `SensorData` |
| POST | `/{sensor_id}/trigger` | Operator | - | `SuccessResponse` |
| GET | `/esp/{esp_id}` | Active | - | `List[SensorConfig]` |
| GET | `/types` | Active | - | `List[SensorType]` |
| POST | `/esp/{esp_id}/i2c/scan` | Operator | `gpio` | `List[I2CDevice]` |

### 3.4 Actuators Router (`/v1/actuators`) - 8 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/` | Active | - | `List[ActuatorConfig]` |
| GET | `/{actuator_id}` | Active | - | `ActuatorConfig` |
| POST | `/` | Operator | `ActuatorConfigCreate` | `ActuatorConfig` |
| PUT | `/{actuator_id}` | Operator | `ActuatorConfigUpdate` | `ActuatorConfig` |
| DELETE | `/{actuator_id}` | Operator | - | `SuccessResponse` |
| POST | `/{esp_id}/{gpio}/command` | Operator | `ActuatorCommand` | `CommandResult` |
| POST | `/emergency_stop` | Operator | `EmergencyStopRequest` | `SuccessResponse` |
| GET | `/esp/{esp_id}` | Active | - | `List[ActuatorConfig]` |

### 3.5 Logic Router (`/v1/logic`) - 8 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/rules` | Active | - | `LogicRuleListResponse` |
| GET | `/rules/{rule_id}` | Active | - | `LogicRuleResponse` |
| POST | `/rules` | Operator | `LogicRuleCreate` | `LogicRuleResponse` |
| PUT | `/rules/{rule_id}` | Operator | `LogicRuleUpdate` | `LogicRuleResponse` |
| DELETE | `/rules/{rule_id}` | Operator | - | `LogicRuleResponse` |
| POST | `/rules/{rule_id}/toggle` | Operator | `RuleToggleRequest` | `RuleToggleResponse` |
| POST | `/rules/{rule_id}/test` | Operator | `RuleTestRequest` | `RuleTestResponse` |
| GET | `/execution_history` | Active | - | `ExecutionHistoryResponse` |

### 3.6 Health Router (`/v1/health`) - 6 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/` | - | - | `HealthStatus` |
| GET | `/live` | - | - | `{"status": "ok"}` |
| GET | `/ready` | - | - | `ReadyStatus` |
| GET | `/detailed` | Active | - | `DetailedHealth` |
| GET | `/metrics` | Active | - | `Metrics` |
| GET | `/database` | Admin | - | `DatabaseHealth` |

### 3.7 Zone Router (`/v1/zone`) - 5 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/` | Active | - | `List[Zone]` |
| POST | `/assign` | Operator | `ZoneAssign` | `SuccessResponse` |
| POST | `/unassign` | Operator | `ZoneUnassign` | `SuccessResponse` |
| GET | `/{zone_id}/devices` | Active | - | `List[ESPDevice]` |
| GET | `/{zone_id}/status` | Active | - | `ZoneStatus` |

### 3.8 Subzone Router (`/v1/subzone`) - 6 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/` | Active | - | `List[SubzoneConfig]` |
| POST | `/assign` | Operator | `SubzoneAssign` | `SubzoneConfig` |
| POST | `/remove` | Operator | `SubzoneRemove` | `SuccessResponse` |
| GET | `/esp/{esp_id}` | Active | - | `List[SubzoneConfig]` |
| POST | `/safe-mode` | Operator | `SafeModeRequest` | `SuccessResponse` |
| GET | `/{esp_id}/{subzone_id}/status` | Active | - | `SubzoneStatus` |

### 3.9 Audit Router (`/v1/audit`) - 21 Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/logs` | Active | `filters` | `List[AuditLog]` |
| GET | `/logs/{log_id}` | Active | - | `AuditLog` |
| GET | `/stats` | Admin | `period` | `AuditStats` |
| GET | `/event-types` | Active | - | `List[EventType]` |
| POST | `/search` | Active | `SearchQuery` | `SearchResult` |
| GET | `/retention/policy` | Admin | - | `RetentionPolicy` |
| PUT | `/retention/policy` | Admin | `RetentionPolicy` | `RetentionPolicy` |
| POST | `/retention/run` | Admin | - | `RetentionResult` |
| GET | `/export/csv` | Admin | `start`, `end` | `FileResponse` |
| GET | `/export/json` | Admin | `start`, `end` | `FileResponse` |

### 3.10 Debug Router (`/v1/debug`) - 59 Endpoints (Admin only)

Wichtige Endpoints:

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/mock-esp/start` | `MockESPConfig` | `SuccessResponse` |
| POST | `/mock-esp/stop` | `esp_id` | `SuccessResponse` |
| GET | `/mock-esp/list` | - | `List[MockESP]` |
| GET | `/db/tables` | - | `List[TableInfo]` |
| GET | `/db/table/{name}` | `limit`, `offset` | `TableData` |
| POST | `/db/query` | `SQLQuery` | `QueryResult` |
| GET | `/mqtt/status` | - | `MQTTStatus` |
| POST | `/mqtt/publish` | `MQTTMessage` | `SuccessResponse` |
| GET | `/scheduler/jobs` | - | `List[SchedulerJob]` |

### 3.11 Additional Routers

| Router | Prefix | Endpoints | Auth | Beschreibung |
|--------|--------|-----------|------|--------------|
| users | /v1/users | 7 | Admin | User CRUD, Role Management |
| errors | /v1/errors | 4 | Active | Error Code Lookup |
| sensor_type_defaults | /v1/sensor-type-defaults | 6 | Operator+ | Sensor-Type Defaults CRUD |
| sequences | /v1/sequences | 4 | Operator+ | Actuator Sequence Management |

---

## 4. Database Models (18 Models)

### 4.1 Core Models

| Model | Tabelle | Felder | Relationships |
|-------|---------|--------|---------------|
| **ESPDevice** | `esps` | `esp_id (PK)`, `name`, `zone_id`, `master_zone_id`, `is_online`, `is_mock`, `status`, `last_heartbeat`, `metadata (JSON)`, `created_at` | → SensorConfig, ActuatorConfig, SubzoneConfig |
| **SensorConfig** | `sensor_configs` | `id (PK)`, `esp_id (FK)`, `gpio`, `sensor_type`, `sensor_name`, `subzone_id`, `active`, `raw_mode`, `operating_mode`, `measurement_interval_ms`, `i2c_address`, `onewire_address`, `calibration (JSON)` | → SensorData |
| **ActuatorConfig** | `actuator_configs` | `id (PK)`, `esp_id (FK)`, `gpio`, `actuator_type`, `name`, `subzone_id`, `active`, `critical`, `inverted`, `default_state`, `default_pwm` | → ActuatorState, ActuatorHistory |
| **SensorData** | `sensor_data` | `id (PK)`, `sensor_id (FK)`, `raw_value`, `processed_value`, `unit`, `quality`, `timestamp` | - |
| **ActuatorState** | `actuator_states` | `id (PK)`, `actuator_id (FK)`, `state`, `value`, `pwm`, `runtime_ms`, `emergency`, `last_command`, `error_message`, `updated_at` | - |
| **ActuatorHistory** | `actuator_history` | `id (PK)`, `actuator_id (FK)`, `command`, `value`, `success`, `response`, `timestamp` | - |

### 4.2 Logic Models

| Model | Tabelle | Felder |
|-------|---------|--------|
| **CrossESPLogic** | `cross_esp_logic` | `id (PK UUID)`, `rule_name (UNIQUE)`, `description`, `enabled`, `trigger_conditions (JSON)`, `logic_operator`, `actions (JSON)`, `priority`, `cooldown_seconds`, `max_executions_per_hour`, `last_triggered`, `metadata (JSON)` |
| **LogicExecutionHistory** | `logic_execution_history` | `id (PK UUID)`, `logic_rule_id (FK)`, `trigger_data (JSON)`, `actions_executed (JSON)`, `success`, `error_message`, `execution_time_ms`, `timestamp`, `metadata (JSON)` |

### 4.3 System Models

| Model | Tabelle | Felder |
|-------|---------|--------|
| **User** | `users` | `id (PK)`, `username`, `email`, `password_hash`, `role`, `is_active`, `last_login`, `created_at` |
| **TokenBlacklist** | `token_blacklist` | `id (PK)`, `jti`, `expires_at`, `created_at` |
| **AuditLog** | `audit_logs` | `id (PK)`, `event_type`, `severity`, `source_type`, `source_id`, `user_id`, `message`, `details (JSON)`, `correlation_id`, `created_at` |
| **SubzoneConfig** | `subzone_configs` | `id (PK)`, `esp_id (FK)`, `subzone_id`, `subzone_name`, `assigned_gpios (JSON)`, `safe_mode_active`, `custom_data (JSONB)`, `created_at` |
| **ZoneContext** | `zone_contexts` | `id (PK)`, `zone_id (UNIQUE)`, `zone_name`, `variety`, `substrate`, `growth_phase`, `planted_date`, `expected_harvest`, `cycle_history (JSONB)`, `custom_data (JSONB)`, `created_at`, `updated_at` |
| **ESPHeartbeatLog** | `esp_heartbeat_logs` | `id (PK)`, `esp_id (FK)`, `uptime`, `heap_free`, `wifi_rssi`, `sensor_count`, `actuator_count`, `timestamp` |
| **SensorTypeDefaults** | `sensor_type_defaults` | `id (PK)`, `sensor_type`, `operating_mode`, `measurement_interval_ms`, `timeout_multiplier` |
| **SystemConfig** | `system_config` | `id (PK)`, `config_key`, `config_value`, `updated_at` |
| **LibraryMetadata** | `library_metadata` | `id (PK)`, `sensor_type`, `library_path`, `version`, `loaded_at` |

### 4.4 Unique Constraints

| Model | Constraint Name | Felder |
|-------|----------------|--------|
| SensorConfig | `uq_sensor_config` | `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` |
| ActuatorConfig | `uq_actuator_config` | `(esp_id, gpio)` |
| SubzoneConfig | `uq_subzone_esp` | `(esp_id, subzone_id)` |
| User | `uq_username` | `(username)` |
| User | `uq_email` | `(email)` |

---

## 5. Pydantic Schemas (70+)

### 5.1 Kritische Validierungen

| Schema | Feld | Validierung | Regex/Range |
|--------|------|-------------|-------------|
| `ESPDeviceCreate` | `device_id` | Pattern | `^(ESP_[A-F0-9]{6,8}\|MOCK_[A-Z0-9]+)$` |
| `SensorConfigCreate` | `gpio` | Range | `0-39` |
| `SensorConfigCreate` | `interval_ms` | Range | `1000-300000` |
| `ActuatorConfigCreate` | `gpio` | Range | `0-39` |
| `ActuatorConfigCreate` | `value` | Range | `0.0-1.0` |
| `LogicRuleCreate` | `priority` | Range | `1-100` |
| `LogicRuleCreate` | `conditions` | Min length | `>= 1` |
| `LoginRequest` | `password` | Min length | `>= 8` |
| `RegisterRequest` | `password` | Complexity | Uppercase + Lowercase + Digit + Special |
| `RegisterRequest` | `email` | Email | Valid email format |

### 5.2 Common Schemas

```python
class SuccessResponse(BaseModel):
    status: Literal["success"] = "success"
    message: Optional[str] = None
    data: Optional[Any] = None

class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    error_code: int
    message: str
    details: Optional[dict] = None

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    pages: int
```

---

## 6. Config-Klassen (19 Settings)

**Datei:** `src/core/config.py` (837 Zeilen)

| Klasse | Env-Prefix | Wichtige Felder |
|--------|------------|-----------------|
| `DatabaseSettings` | `DATABASE_` | `url`, `pool_size=5`, `max_overflow=10`, `echo=False` |
| `MQTTSettings` | `MQTT_` | `host`, `port=1883`, `username`, `password`, `tls_enabled=False` |
| `SecuritySettings` | `SECURITY_` | `secret_key`, `algorithm=HS256`, `access_token_expire_minutes=30` |
| `HierarchySettings` | `HIERARCHY_` | `kaiser_id="god"` |
| `PerformanceSettings` | `PERFORMANCE_` | `max_workers=10`, `request_timeout=30` |
| `ESP32Settings` | `ESP32_` | `heartbeat_interval=60`, `offline_threshold=180` |
| `SensorSettings` | `SENSOR_` | `default_interval=30000`, `max_interval=300000` |
| `ActuatorSettings` | `ACTUATOR_` | `default_timeout=10`, `max_runtime=3600` |
| `WebSocketSettings` | `WEBSOCKET_` | `heartbeat_interval=30`, `max_connections=100` |
| `MaintenanceSettings` | - | `SENSOR_DATA_RETENTION_ENABLED=False`, `RETENTION_DAYS=30` |
| `ResilienceSettings` | `CIRCUIT_BREAKER_` | `failure_threshold=5`, `recovery_timeout=30` |

### Environment Variables (Beispiele)

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/automationone
DATABASE_POOL_SIZE=10

# MQTT
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USERNAME=server
MQTT_PASSWORD=secret

# Security
SECURITY_SECRET_KEY=your-secret-key-here
SECURITY_ACCESS_TOKEN_EXPIRE_MINUTES=60

# Maintenance
SENSOR_DATA_RETENTION_ENABLED=true
SENSOR_DATA_RETENTION_DAYS=30
AUDIT_LOG_RETENTION_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=90

# Circuit Breaker
CIRCUIT_BREAKER_MQTT_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_MQTT_RECOVERY_TIMEOUT=30
```

---

## 7. Handler-Dateien (14 Handler)

| Handler | Datei | Zeilen | Topic | Funktion |
|---------|-------|--------|-------|----------|
| SensorDataHandler | sensor_handler.py | 731 | `+/sensor/+/data` | Sensor-Daten verarbeiten |
| HeartbeatHandler | heartbeat_handler.py | 1,112 | `+/system/heartbeat` | Heartbeat + Auto-Discovery |
| ActuatorStatusHandler | actuator_handler.py | 457 | `+/actuator/+/status` | Actuator-Status |
| ActuatorResponseHandler | actuator_response_handler.py | 279 | `+/actuator/+/response` | Command-Response |
| ActuatorAlertHandler | actuator_alert_handler.py | 320 | `+/actuator/+/alert` | Alerts + E-Stop |
| ConfigHandler | config_handler.py | 396 | `+/config_response` | Config ACK |
| ZoneAckHandler | zone_ack_handler.py | 288 | `+/zone/ack` | Zone Assignment ACK |
| SubzoneAckHandler | subzone_ack_handler.py | 173 | `+/subzone/ack` | Subzone ACK |
| LWTHandler | lwt_handler.py | 210 | `+/system/will` | Instant Offline |
| ErrorEventHandler | error_handler.py | 329 | `+/system/error` | Error Processing |
| DiscoveryHandler | discovery_handler.py | 214 | `discovery/esp32_nodes` | ESP Discovery |
| BaseHandler | base_handler.py | 583 | - | Abstract Base |
| MockActuatorHandler | simulation/actuator_handler.py | varies | `+/actuator/+/command` | Mock-ESP |

---

## 8. Repository Pattern (16 Repositories)

| Repository | Model | Spezial-Queries |
|-----------|-------|-----------------|
| ESPRepository | ESPDevice | `get_by_device_id()`, `get_running_mocks()`, `get_online()` |
| SensorRepository | SensorConfig | `get_by_esp_gpio_and_type()`, `get_by_esp_gpio_type_and_i2c()`, `get_by_esp_gpio_type_and_onewire()` |
| ActuatorRepository | ActuatorConfig | `get_by_esp_and_gpio()`, `get_state()`, `log_command()` |
| LogicRepository | CrossESPLogic | `get_rules_by_trigger_sensor()`, `get_enabled_rules()` |
| AuditLogRepository | AuditLog | `search()`, `get_stats()`, `cleanup_old()` |
| UserRepository | User | `get_by_username()`, `get_by_email()`, `authenticate()` |
| SubzoneRepository | SubzoneConfig | `get_by_esp_and_subzone()`, `get_by_esp()` |
| ESPHeartbeatRepository | ESPHeartbeatLog | `get_latest()`, `get_history()`, `cleanup_old()` |
| SystemConfigRepository | SystemConfig | `get_value()`, `set_value()` |
| SensorTypeDefaultsRepository | SensorTypeDefaults | `get_by_sensor_type()`, `get_all()` |
| TokenBlacklistRepository | TokenBlacklist | `is_blacklisted()`, `add()`, `cleanup_expired()` |
| SensorDataRepository | SensorData | `get_latest()`, `get_range()`, `cleanup_old()` |

---

## 9. Sensor Libraries

**Verzeichnis:** `src/sensors/sensor_libraries/active/`

| Library | Datei | SENSOR_TYPE | UNIT | Beschreibung |
|---------|-------|-------------|------|--------------|
| PHProcessor | ph_sensor.py | `ph` | `pH` | pH-Wert 0-14 |
| ECProcessor | ec_sensor.py | `ec` | `mS/cm` | Leitfähigkeit |
| TemperatureProcessor | temperature.py | `temperature` | `°C` | Temperatur |
| HumidityProcessor | humidity.py | `humidity` | `%` | Luftfeuchtigkeit |
| MoistureProcessor | moisture.py | `moisture` | `%` | Bodenfeuchtigkeit |
| PressureProcessor | pressure.py | `hPa` | `hPa` | Luftdruck |
| LightProcessor | light.py | `light` | `lux` | Lichtstärke |
| FlowProcessor | flow.py | `flow` | `L/min` | Durchfluss |
| CO2Processor | co2.py | `co2` | `ppm` | CO2-Konzentration |
| SHT31TempProcessor | sht31.py | `sht31_temp` | `°C` | SHT31 Temperatur |
| SHT31HumidityProcessor | sht31.py | `sht31_humidity` | `%` | SHT31 Feuchtigkeit |
| DS18B20Processor | ds18b20.py | `ds18b20` | `°C` | DS18B20 Temperatur |

### Library Interface

```python
class BaseSensorProcessor(ABC):
    SENSOR_TYPE: str
    UNIT: str
    MIN_VALUE: Optional[float] = None
    MAX_VALUE: Optional[float] = None

    @abstractmethod
    def process(self, raw_value: float, calibration: dict = None) -> dict:
        """
        Returns:
            {
                "processed_value": float,
                "unit": str,
                "quality": str  # excellent|good|fair|poor|bad
            }
        """
        pass
```

---

## 10. Error Codes (Server: 5000-5999)

| Range | Kategorie | Beispiele |
|-------|-----------|-----------|
| 5000-5099 | CONFIG_ERROR | 5001 ESP_DEVICE_NOT_FOUND, 5007 ESP_OFFLINE |
| 5100-5199 | MQTT_ERROR | 5101 PUBLISH_FAILED, 5104 CONNECTION_LOST |
| 5200-5299 | VALIDATION_ERROR | 5201 INVALID_ESP_ID, 5202 INVALID_GPIO |
| 5300-5399 | DATABASE_ERROR | 5301 QUERY_FAILED, 5305 INTEGRITY_ERROR |
| 5400-5499 | SERVICE_ERROR | 5401 SERVICE_INIT_FAILED, 5404 RATE_LIMIT_EXCEEDED |
| 5500-5599 | AUDIT_ERROR | 5501 AUDIT_LOG_FAILED, 5502 RETENTION_CLEANUP_FAILED |
| 5600-5699 | SEQUENCE_ERROR | 5610 SEQ_ALREADY_RUNNING, 5640 SEQ_ACTUATOR_LOCKED |

**Vollständige Referenz:** `.claude/reference/errors/ERROR_CODES.md`

---

*Vollständige API-Referenz für God-Kaiser Server Module. Kompakter Skill in SKILL.md*
