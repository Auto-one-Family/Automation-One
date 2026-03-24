# Backend-DB-Endpunkt-Inventur — Bericht

> **Erstellt:** 2026-03-24
> **Repo:** AutomationOne (El Servador)
> **Typ:** Reine Analyse — kein Code geaendert

---

## Zusammenfassung

| Metrik | Wert |
|--------|------|
| DB-Tabellen total | **31** (nicht 19 wie angenommen) |
| REST-Endpoints total | **262** |
| WebSocket-Endpoints | **1** |
| MQTT-Handler mit DB-Interaktion | **13** (12 aktiv + 1 Stub) |
| Background-Services mit DB-Zugriff | **5** (LogicEngine, LogicScheduler, MaintenanceService, SensorScheduler, SimulationScheduler) |
| Router-Dateien | **31** |
| Auth-Tiers | **4** (keine, ActiveUser/JWT, OperatorUser, AdminUser) + **1** API-Key |
| Debug-Endpoints (AdminUser) | **58** |
| Deprecated/Stub-Endpoints | ~5 (DiscoveryHandler, library.py leer, KaiserHandler Stub) |

### Neu identifizierte Tabellen (12 zusaetzlich zu den bekannten 19)

| # | Tabelle | Zweck |
|---|---------|-------|
| 1 | `zone_contexts` | Grow-Cycle-Kontext pro Zone (Pflanze, Substrat, Phase) |
| 2 | `device_active_context` | Aktiver Zone/Subzone-Kontext fuer multi_zone Devices |
| 3 | `device_zone_changes` | Audit-Trail fuer Zone-Wechsel |
| 4 | `logic_execution_history` | Logic-Engine Ausfuehrungshistorie |
| 5 | `token_blacklist` | JWT Token Blacklist (Logout/Security) |
| 6 | `notification_preferences` | User-Benachrichtigungseinstellungen |
| 7 | `audit_logs` | Vollstaendiges Audit-Log (Events, Errors, Commands) |
| 8 | `diagnostic_reports` | Diagnostik-Report-Historie |
| 9 | `library_metadata` | Sensor-Library-Verwaltung |
| 10 | `sensor_type_defaults` | Default-Konfiguration pro Sensortyp |
| 11 | `system_config` | Key-Value System-Konfiguration |
| 12 | `email_log` | E-Mail-Versand-Protokoll |

**Hinweis:** Die Tabelle `users` heisst tatsaechlich `user_accounts`. Die Tabelle `heartbeat_logs` heisst `esp_heartbeat_logs`. Die Tabelle `logic_rules` heisst `cross_esp_logic`. Die Tabelle `dashboards` stimmt. `plugin_configs` und `plugin_executions` waren nicht in der urspruenglichen Liste.

---

## DB-Schema Uebersicht

### Tabellen-Kategorien

| Kategorie | Tabellen |
|-----------|----------|
| Geraete | `esp_devices`, `kaiser_registry`, `esp_ownership` |
| Sensoren | `sensor_configs`, `sensor_data`, `sensor_type_defaults` |
| Aktoren | `actuator_configs`, `actuator_states`, `actuator_history` |
| Zonen | `zones`, `subzone_configs`, `zone_contexts`, `device_active_context`, `device_zone_changes` |
| Logik | `cross_esp_logic`, `logic_execution_history` |
| Benutzer & Auth | `user_accounts`, `token_blacklist` |
| Benachrichtigungen | `notifications`, `notification_preferences`, `email_log` |
| Audit & System | `audit_logs`, `system_config`, `library_metadata` |
| Diagnose | `diagnostic_reports`, `esp_heartbeat_logs` |
| KI | `ai_predictions` |
| Dashboard | `dashboards` |
| Plugins | `plugin_configs`, `plugin_executions` |

### Soft-Delete Pattern

Nur 2 Tabellen verwenden Soft-Delete:
- `esp_devices` — `deleted_at` + `deleted_by`
- `zones` — `deleted_at` + `deleted_by` + `status='deleted'`

Alle anderen verwenden entweder `SET NULL`-FKs (Datenerhaltung nach Geraeteloeschung) oder Hard-Delete.

### TimestampMixin

Die meisten Tabellen erben `created_at` + `updated_at` (UTC, timezone-aware). Ausnahmen ohne Mixin:
- `actuator_states` (Performance — haeufige Updates)
- `diagnostic_reports` (eigene `started_at`/`finished_at`)
- `esp_heartbeat_logs` (eigener `timestamp`)
- `plugin_executions` (eigene `started_at`/`finished_at`)

---

## Vollstaendiges Spalten-Schema aller 31 Tabellen

### 1. `esp_devices`

**Model:** `ESPDevice` — `src/db/models/esp.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| device_id | VARCHAR(50) | NOT NULL | — | UNIQUE, INDEX |
| name | VARCHAR(100) | NULL | — | |
| zone_id | VARCHAR(50) | NULL | — | FK → zones.zone_id (SET NULL), INDEX |
| zone_name | VARCHAR(100) | NULL | — | Denormalisiert |
| master_zone_id | VARCHAR(50) | NULL | — | INDEX |
| is_zone_master | BOOLEAN | NOT NULL | false | |
| kaiser_id | VARCHAR(50) | NULL | — | INDEX |
| hardware_type | VARCHAR(50) | NOT NULL | — | |
| ip_address | VARCHAR(45) | NULL | — | |
| mac_address | VARCHAR(17) | NULL | — | UNIQUE |
| firmware_version | VARCHAR(20) | NULL | — | |
| capabilities | JSON | NOT NULL | {} | `{max_sensors, max_actuators, features}` |
| status | VARCHAR(20) | NOT NULL | 'offline' | INDEX. online/offline/error/unknown/pending_approval/approved/rejected |
| last_seen | DateTime(tz) | NULL | — | INDEX |
| health_status | VARCHAR(20) | NULL | — | healthy/degraded/unhealthy/critical |
| discovered_at | DateTime(tz) | NULL | — | |
| approved_at | DateTime(tz) | NULL | — | |
| approved_by | VARCHAR(100) | NULL | — | |
| rejection_reason | VARCHAR(500) | NULL | — | |
| last_rejection_at | DateTime(tz) | NULL | — | |
| device_metadata | JSON | NOT NULL | {} | |
| alert_config | JSON | NULL | — | `{alerts_enabled, suppression_reason, suppression_note, suppression_until, propagate_to_children}` |
| deleted_at | DateTime(tz) | NULL | — | Soft-Delete, INDEX |
| deleted_by | VARCHAR(64) | NULL | — | |
| created_at | DateTime(tz) | NOT NULL | utc_now | |
| updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Relationships:** sensors (→ SensorConfig, CASCADE), actuators (→ ActuatorConfig, CASCADE), subzones (→ SubzoneConfig, CASCADE)

---

### 2. `sensor_configs`

**Model:** `SensorConfig` — `src/db/models/sensor.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | UUID | NOT NULL | — | FK → esp_devices.id (CASCADE), INDEX |
| gpio | INTEGER | NULL | — | Nullable fuer I2C/OneWire |
| sensor_type | VARCHAR(50) | NOT NULL | — | INDEX |
| sensor_name | VARCHAR(100) | NOT NULL | — | |
| interface_type | VARCHAR(20) | NOT NULL | 'ANALOG' | I2C/ONEWIRE/ANALOG/DIGITAL |
| i2c_address | INTEGER | NULL | — | INDEX |
| onewire_address | VARCHAR(32) | NULL | — | |
| provides_values | JSON | NULL | — | z.B. `['sht31_temp', 'sht31_humidity']` |
| enabled | BOOLEAN | NOT NULL | true | |
| pi_enhanced | BOOLEAN | NOT NULL | true | |
| sample_interval_ms | INTEGER | NOT NULL | 1000 | |
| calibration_data | JSON | NULL | — | `{offset, scale, ...}` |
| thresholds | JSON | NULL | — | `{min, max, warning, critical}` |
| sensor_metadata | JSON | NOT NULL | {} | |
| alert_config | JSON | NULL | — | |
| runtime_stats | JSON | NULL | — | `{uptime_hours, last_restart, expected_lifetime_hours, maintenance_log[]}` |
| operating_mode | VARCHAR(20) | NULL | — | continuous/on_demand/scheduled/paused |
| timeout_seconds | INTEGER | NULL | — | |
| timeout_warning_enabled | BOOLEAN | NULL | — | |
| schedule_config | JSON | NULL | — | |
| last_manual_request | DateTime(tz) | NULL | — | |
| device_scope | VARCHAR(20) | NOT NULL | 'zone_local' | zone_local/multi_zone/mobile |
| assigned_zones | JSON | NULL | [] | |
| assigned_subzones | JSON | NULL | [] | |
| config_status | VARCHAR(20) | NULL | 'pending' | pending/applied/failed |
| config_error | VARCHAR(50) | NULL | — | z.B. GPIO_CONFLICT |
| config_error_detail | VARCHAR(200) | NULL | — | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Unique:** `unique_esp_gpio_sensor_interface` auf (esp_id, gpio, sensor_type, onewire_address, i2c_address)
**Index:** `idx_sensor_type_enabled` auf (sensor_type, enabled)

---

### 3. `sensor_data`

**Model:** `SensorData` — `src/db/models/sensor.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | UUID | NULL | — | FK → esp_devices.id (SET NULL), INDEX |
| gpio | INTEGER | NOT NULL | — | |
| sensor_type | VARCHAR(50) | NOT NULL | — | |
| raw_value | FLOAT | NOT NULL | — | |
| processed_value | FLOAT | NULL | — | |
| unit | VARCHAR(20) | NULL | — | |
| processing_mode | VARCHAR(20) | NOT NULL | — | pi_enhanced/local/raw |
| quality | VARCHAR(20) | NULL | — | good/fair/poor/error |
| timestamp | DateTime(tz) | NOT NULL | utc_now | INDEX |
| sensor_metadata | JSON | NULL | — | |
| data_source | VARCHAR(20) | NOT NULL | 'production' | INDEX. production/mock/test/simulation |
| zone_id | VARCHAR(50) | NULL | — | INDEX |
| subzone_id | VARCHAR(50) | NULL | — | INDEX |
| device_name | VARCHAR(128) | NULL | — | Snapshot nach Soft-Delete |

**Unique:** `uq_sensor_data_esp_gpio_type_timestamp` auf (esp_id, gpio, sensor_type, timestamp)
**Indices:** `idx_esp_gpio_timestamp`, `idx_sensor_type_timestamp`, `idx_timestamp_desc` (DESC), `idx_data_source_timestamp`

---

### 4. `actuator_configs`

**Model:** `ActuatorConfig` — `src/db/models/actuator.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | UUID | NOT NULL | — | FK → esp_devices.id (CASCADE), INDEX |
| gpio | INTEGER | NOT NULL | — | |
| actuator_type | VARCHAR(50) | NOT NULL | — | INDEX. pump/valve/pwm/relay |
| actuator_name | VARCHAR(100) | NOT NULL | — | |
| enabled | BOOLEAN | NOT NULL | true | |
| min_value / max_value / default_value | FLOAT | NOT NULL | 0.0/1.0/0.0 | |
| timeout_seconds | INTEGER | NULL | — | Auto-shutoff |
| safety_constraints | JSON | NULL | — | `{max_runtime, cooldown_period, emergency_stop_priority}` |
| actuator_metadata | JSON | NOT NULL | {} | |
| alert_config | JSON | NULL | — | |
| runtime_stats | JSON | NULL | — | |
| device_scope | VARCHAR(20) | NOT NULL | 'zone_local' | |
| assigned_zones / assigned_subzones | JSON | NULL | [] | |
| config_status | VARCHAR(20) | NULL | 'pending' | |
| config_error / config_error_detail | VARCHAR | NULL | — | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Unique:** `unique_esp_gpio_actuator` auf (esp_id, gpio)

---

### 5. `actuator_states`

**Model:** `ActuatorState` — `src/db/models/actuator.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | UUID | NULL | — | FK → esp_devices.id (SET NULL), INDEX |
| gpio | INTEGER | NOT NULL | — | |
| actuator_type | VARCHAR(50) | NOT NULL | — | |
| current_value | FLOAT | NOT NULL | — | |
| target_value | FLOAT | NULL | — | |
| state | VARCHAR(20) | NOT NULL | — | idle/active/error/emergency_stop |
| last_command_timestamp | DateTime(tz) | NULL | — | |
| runtime_seconds | INTEGER | NOT NULL | 0 | |
| last_command | VARCHAR(50) | NULL | — | |
| error_message | VARCHAR(500) | NULL | — | |
| state_metadata | JSON | NULL | — | |
| data_source | VARCHAR(20) | NOT NULL | 'production' | |

**Kein TimestampMixin.** Indices: `idx_esp_gpio_state`, `idx_actuator_state`, `idx_esp_state`

---

### 6. `actuator_history`

**Model:** `ActuatorHistory` — `src/db/models/actuator.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | UUID | NULL | — | FK → esp_devices.id (SET NULL), INDEX |
| gpio | INTEGER | NOT NULL | — | |
| actuator_type | VARCHAR(50) | NOT NULL | — | |
| command_type | VARCHAR(50) | NOT NULL | — | set/stop/emergency_stop, INDEX |
| value | FLOAT | NULL | — | None fuer Stop-Commands |
| issued_by | VARCHAR(100) | NULL | — | 'user:123', 'logic:456', 'system' |
| success | BOOLEAN | NOT NULL | — | |
| error_message | VARCHAR(500) | NULL | — | |
| timestamp | DateTime(tz) | NOT NULL | utc_now | INDEX |
| command_metadata | JSON | NULL | — | `{request_id, retry_count}` |
| data_source | VARCHAR(20) | NOT NULL | 'production' | INDEX |

---

### 7. `zones`

**Model:** `Zone` — `src/db/models/zone.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| zone_id | VARCHAR(50) | NOT NULL | — | UNIQUE, INDEX |
| name | VARCHAR(100) | NOT NULL | — | |
| description | VARCHAR(500) | NULL | — | |
| status | VARCHAR(20) | NOT NULL | 'active' | active/archived/deleted |
| deleted_at | DateTime(tz) | NULL | — | Soft-Delete |
| deleted_by | VARCHAR(64) | NULL | — | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 8. `subzone_configs`

**Model:** `SubzoneConfig` — `src/db/models/subzone.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | VARCHAR(50) | NOT NULL | — | FK → esp_devices.device_id (CASCADE), INDEX |
| subzone_id | VARCHAR(50) | NOT NULL | — | INDEX |
| subzone_name | VARCHAR(100) | NULL | — | |
| parent_zone_id | VARCHAR(50) | NOT NULL | — | INDEX |
| assigned_gpios | JSON | NOT NULL | [] | |
| assigned_sensor_config_ids | JSON | NOT NULL | [] | Fuer I2C-Sensoren |
| is_active | BOOLEAN | NOT NULL | true | |
| safe_mode_active | BOOLEAN | NOT NULL | true | |
| sensor_count / actuator_count | INTEGER | NOT NULL | 0 | |
| custom_data | JSONB | NOT NULL | {} | Plant info, Material, Notizen |
| last_ack_at | DateTime(tz) | NULL | — | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Unique:** `uq_esp_subzone` auf (esp_id, subzone_id)

---

### 9. `zone_contexts`

**Model:** `ZoneContext` — `src/db/models/zone_context.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | INTEGER | NOT NULL | auto | PK |
| zone_id | VARCHAR(50) | NOT NULL | — | UNIQUE, INDEX |
| zone_name | VARCHAR(100) | NULL | — | |
| plant_count | INTEGER | NULL | — | |
| variety / substrate | VARCHAR(200) | NULL | — | |
| growth_phase | VARCHAR(50) | NULL | — | z.B. 'vegetative', 'flower_week_5' |
| planted_date / expected_harvest | DATE | NULL | — | |
| responsible_person | VARCHAR(100) | NULL | — | |
| work_hours_weekly | FLOAT | NULL | — | |
| notes | TEXT | NULL | — | |
| custom_data | JSONB | NOT NULL | {} | |
| cycle_history | JSONB | NOT NULL | [] | Archivierte Grow-Zyklen |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 10. `device_active_context`

**Model:** `DeviceActiveContext` — `src/db/models/device_context.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| config_type | VARCHAR(20) | NOT NULL | — | 'sensor' oder 'actuator' |
| config_id | UUID | NOT NULL | — | App-level FK |
| active_zone_id | VARCHAR(50) | NULL | — | |
| active_subzone_id | VARCHAR(50) | NULL | — | |
| context_source | VARCHAR(20) | NOT NULL | 'manual' | manual/sequence/mqtt |
| context_since | DateTime(tz) | NOT NULL | utc_now | |
| updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Unique:** `unique_device_active_context` auf (config_type, config_id)

---

### 11. `device_zone_changes`

**Model:** `DeviceZoneChange` — `src/db/models/device_zone_change.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | VARCHAR(50) | NOT NULL | — | INDEX |
| old_zone_id | VARCHAR(50) | NULL | — | |
| new_zone_id | VARCHAR(50) | NOT NULL | — | |
| subzone_strategy | VARCHAR(20) | NOT NULL | 'transfer' | transfer/copy/reset |
| affected_subzones | JSON | NULL | — | |
| change_type | VARCHAR(20) | NOT NULL | 'zone_switch' | |
| changed_by | VARCHAR(100) | NOT NULL | 'system' | |
| changed_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 12. `cross_esp_logic`

**Model:** `CrossESPLogic` — `src/db/models/logic.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| rule_name | VARCHAR(100) | NOT NULL | — | UNIQUE, INDEX |
| description | TEXT | NULL | — | |
| enabled | BOOLEAN | NOT NULL | true | INDEX |
| trigger_conditions | JSON | NOT NULL | — | Pydantic-validiert |
| logic_operator | VARCHAR(3) | NOT NULL | 'AND' | AND/OR |
| actions | JSON | NOT NULL | — | `[{type, esp_id, gpio, actuator_type, value, duration_seconds}]` |
| priority | INTEGER | NOT NULL | 100 | Niedriger = hoeher |
| cooldown_seconds | INTEGER | NULL | — | |
| max_executions_per_hour | INTEGER | NULL | — | |
| last_triggered | DateTime(tz) | NULL | — | |
| rule_metadata | JSON | NOT NULL | {} | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Index:** `idx_rule_enabled_priority` auf (enabled, priority)

---

### 13. `logic_execution_history`

**Model:** `LogicExecutionHistory` — `src/db/models/logic.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| logic_rule_id | UUID | NOT NULL | — | FK → cross_esp_logic.id (CASCADE), INDEX |
| trigger_data | JSON | NOT NULL | — | Sensor-Snapshot |
| actions_executed | JSON | NOT NULL | — | |
| success | BOOLEAN | NOT NULL | — | |
| error_message | VARCHAR(500) | NULL | — | |
| execution_time_ms | INTEGER | NOT NULL | — | |
| timestamp | DateTime(tz) | NOT NULL | utc_now | INDEX |
| execution_metadata | JSON | NULL | — | |

---

### 14. `kaiser_registry`

**Model:** `KaiserRegistry` — `src/db/models/kaiser.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| kaiser_id | VARCHAR(50) | NOT NULL | — | UNIQUE, INDEX |
| ip_address | VARCHAR(45) | NULL | — | |
| mac_address | VARCHAR(17) | NULL | — | UNIQUE |
| zone_ids | JSON | NOT NULL | [] | |
| status | VARCHAR(20) | NOT NULL | 'offline' | INDEX |
| last_seen | DateTime(tz) | NULL | — | INDEX |
| capabilities | JSON | NOT NULL | {} | |
| kaiser_metadata | JSON | NOT NULL | {} | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 15. `esp_ownership`

**Model:** `ESPOwnership` — `src/db/models/kaiser.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| kaiser_id | UUID | NOT NULL | — | FK → kaiser_registry.id (CASCADE) |
| esp_id | UUID | NOT NULL | — | FK → esp_devices.id (CASCADE) |
| assigned_at | DateTime(tz) | NOT NULL | utc_now | |
| priority | INTEGER | NOT NULL | 100 | |
| ownership_metadata | JSON | NOT NULL | {} | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Unique:** `unique_kaiser_esp_ownership` auf (kaiser_id, esp_id)

---

### 16. `user_accounts`

**Model:** `User` — `src/db/models/user.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | INTEGER | NOT NULL | auto | PK |
| username | VARCHAR(50) | NOT NULL | — | UNIQUE, INDEX |
| email | VARCHAR(100) | NOT NULL | — | UNIQUE, INDEX |
| password_hash | VARCHAR(255) | NOT NULL | — | Bcrypt |
| role | VARCHAR(20) | NOT NULL | 'viewer' | admin/operator/viewer |
| is_active | BOOLEAN | NOT NULL | true | |
| full_name | VARCHAR(100) | NULL | — | |
| token_version | INTEGER | NOT NULL | 0 | Logout-all-devices |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 17. `token_blacklist`

**Model:** `TokenBlacklist` — `src/db/models/auth.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | INTEGER | NOT NULL | auto | PK |
| token_hash | VARCHAR(64) | NOT NULL | — | UNIQUE, SHA256 |
| token_type | VARCHAR(20) | NOT NULL | — | access/refresh |
| user_id | INTEGER | NOT NULL | — | INDEX (kein FK) |
| expires_at | DateTime(tz) | NOT NULL | — | INDEX |
| blacklisted_at | DateTime(tz) | NOT NULL | utc_now | |
| reason | VARCHAR(50) | NULL | — | logout/security/password_change |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 18. `notifications`

**Model:** `Notification` — `src/db/models/notification.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| user_id | INTEGER | NOT NULL | — | FK → user_accounts.id (CASCADE) |
| channel | VARCHAR(20) | NOT NULL | — | websocket/email/webhook |
| severity | VARCHAR(20) | NOT NULL | 'info' | critical/warning/info |
| category | VARCHAR(50) | NOT NULL | 'system' | connectivity/data_quality/infrastructure/lifecycle/maintenance/security/system |
| title | VARCHAR(255) | NOT NULL | — | |
| body | TEXT | NULL | — | |
| extra_data | JSONB | NOT NULL | {} | |
| source | VARCHAR(50) | NOT NULL | — | logic_engine/mqtt_handler/grafana/sensor_threshold/device_event/manual/system |
| is_read | BOOLEAN | NOT NULL | false | |
| is_archived | BOOLEAN | NOT NULL | false | |
| digest_sent | BOOLEAN | NOT NULL | false | |
| parent_notification_id | UUID | NULL | — | FK → self (SET NULL) |
| fingerprint | VARCHAR(64) | NULL | — | Dedup fuer Grafana-Alerts |
| read_at | DateTime(tz) | NULL | — | |
| status | VARCHAR(20) | NOT NULL | 'active' | active/acknowledged/resolved (ISA-18.2) |
| acknowledged_at | DateTime(tz) | NULL | — | |
| acknowledged_by | INTEGER | NULL | — | FK → user_accounts.id (SET NULL) |
| resolved_at | DateTime(tz) | NULL | — | |
| correlation_id | VARCHAR(128) | NULL | — | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

**Indices:** user_unread, created_at, source_category, severity, fingerprint_unique (WHERE NOT NULL), status_severity (WHERE resolved_at IS NULL), correlation (WHERE NOT NULL)

---

### 19. `notification_preferences`

**Model:** `NotificationPreferences` — `src/db/models/notification.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| user_id | INTEGER | NOT NULL | — | PK + FK → user_accounts.id (CASCADE) |
| websocket_enabled | BOOLEAN | NOT NULL | true | |
| email_enabled | BOOLEAN | NOT NULL | false | |
| email_address | VARCHAR(255) | NULL | — | Override |
| email_severities | JSON | NOT NULL | ['critical','warning'] | |
| quiet_hours_enabled | BOOLEAN | NOT NULL | false | |
| quiet_hours_start / end | VARCHAR(5) | NULL | '22:00'/'07:00' | |
| digest_interval_minutes | INTEGER | NOT NULL | 60 | 0 = deaktiviert |
| browser_notifications | BOOLEAN | NOT NULL | false | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 20. `audit_logs`

**Model:** `AuditLog` — `src/db/models/audit_log.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| event_type | VARCHAR(50) | NOT NULL | — | INDEX |
| severity | VARCHAR(20) | NOT NULL | 'info' | INDEX. info/warning/error/critical |
| source_type | VARCHAR(30) | NOT NULL | — | INDEX. esp32/user/system/api/mqtt/scheduler |
| source_id | VARCHAR(100) | NULL | — | INDEX |
| status | VARCHAR(20) | NOT NULL | — | INDEX. success/failed/pending |
| message | TEXT | NULL | — | |
| details | JSON | NOT NULL | {} | |
| error_code | VARCHAR(50) | NULL | — | INDEX |
| error_description | TEXT | NULL | — | |
| ip_address | VARCHAR(45) | NULL | — | |
| user_agent | VARCHAR(500) | NULL | — | |
| correlation_id | VARCHAR(100) | NULL | — | INDEX |
| request_id | VARCHAR(255) | NULL | — | INDEX |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 21. `dashboards`

**Model:** `Dashboard` — `src/db/models/dashboard.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| name | VARCHAR(200) | NOT NULL | — | |
| description | TEXT | NULL | — | |
| owner_id | INTEGER | NOT NULL | — | FK → user_accounts.id (CASCADE) |
| is_shared | BOOLEAN | NOT NULL | false | |
| widgets | JSON | NOT NULL | [] | `[{id, type, x, y, w, h, config}]` |
| scope | VARCHAR(20) | NULL | — | zone/cross-zone/sensor-detail |
| zone_id | VARCHAR(100) | NULL | — | |
| auto_generated | BOOLEAN | NOT NULL | false | |
| sensor_id | VARCHAR(100) | NULL | — | |
| target | JSON | NULL | — | `{view, placement, anchor, panelPosition, panelWidth, order}` |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 22. `diagnostic_reports`

**Model:** `DiagnosticReport` — `src/db/models/diagnostic.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| overall_status | VARCHAR(20) | NOT NULL | — | |
| started_at / finished_at | DateTime(tz) | NOT NULL | utc_now | |
| duration_seconds | FLOAT | NULL | — | |
| checks | JSON | NULL | — | Array der 10 Check-Ergebnisse |
| summary | TEXT | NULL | — | |
| triggered_by | VARCHAR(50) | NOT NULL | 'manual' | |
| triggered_by_user | INTEGER | NULL | — | FK → user_accounts.id (SET NULL) |
| exported_at | DateTime(tz) | NULL | — | |
| export_path | TEXT | NULL | — | |

---

### 23. `esp_heartbeat_logs`

**Model:** `ESPHeartbeatLog` — `src/db/models/esp_heartbeat.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| esp_id | UUID | NULL | — | FK → esp_devices.id (SET NULL) |
| device_id | VARCHAR(50) | NOT NULL | — | INDEX (denormalisiert) |
| timestamp | DateTime(tz) | NOT NULL | — | INDEX |
| heap_free | INTEGER | NOT NULL | — | Bytes |
| wifi_rssi | INTEGER | NOT NULL | — | dBm |
| uptime | INTEGER | NOT NULL | — | Sekunden |
| sensor_count / actuator_count | INTEGER | NOT NULL | 0 | |
| gpio_reserved_count | INTEGER | NULL | 0 | |
| data_source | VARCHAR(20) | NOT NULL | 'production' | INDEX |
| health_status | VARCHAR(20) | NOT NULL | 'healthy' | |

**Retention:** 7 Tage (konfigurierbar)

---

### 24. `library_metadata`

**Model:** `LibraryMetadata` — `src/db/models/library.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| library_name | VARCHAR(100) | NOT NULL | — | UNIQUE |
| library_type | VARCHAR(50) | NOT NULL | — | sensor_library/actuator_library/firmware |
| version | VARCHAR(20) | NOT NULL | — | |
| description | TEXT | NULL | — | |
| file_path | VARCHAR(500) | NOT NULL | — | |
| file_hash | VARCHAR(64) | NOT NULL | — | SHA256 |
| file_size_bytes | INTEGER | NOT NULL | — | |
| compatible_hardware | JSON | NOT NULL | — | |
| dependencies | JSON | NULL | — | |
| enabled | BOOLEAN | NOT NULL | true | |
| library_metadata | JSON | NOT NULL | {} | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 25. `sensor_type_defaults`

**Model:** `SensorTypeDefaults` — `src/db/models/sensor_type_defaults.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| sensor_type | VARCHAR(50) | NOT NULL | — | UNIQUE |
| operating_mode | VARCHAR(20) | NOT NULL | 'continuous' | |
| measurement_interval_seconds | INTEGER | NOT NULL | 30 | |
| timeout_seconds | INTEGER | NOT NULL | 180 | 0 = kein Timeout |
| timeout_warning_enabled | BOOLEAN | NOT NULL | true | |
| supports_on_demand | BOOLEAN | NOT NULL | false | |
| description | TEXT | NULL | — | |
| schedule_config | JSON | NULL | — | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 26. `system_config`

**Model:** `SystemConfig` — `src/db/models/system.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| config_key | VARCHAR(100) | NOT NULL | — | UNIQUE |
| config_value | JSON | NOT NULL | — | |
| config_type | VARCHAR(50) | NOT NULL | — | mqtt/database/api/pi_enhanced/security |
| description | TEXT | NULL | — | |
| is_secret | BOOLEAN | NOT NULL | false | |
| system_metadata | JSON | NOT NULL | {} | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 27. `ai_predictions`

**Model:** `AIPredictions` — `src/db/models/ai.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| prediction_type | VARCHAR(50) | NOT NULL | — | anomaly_detection/resource_optimization/failure_prediction |
| target_esp_id | UUID | NULL | — | FK → esp_devices.id (SET NULL) |
| target_zone_id | VARCHAR(50) | NULL | — | |
| input_data | JSON | NOT NULL | — | |
| prediction_result | JSON | NOT NULL | — | |
| confidence_score | FLOAT | NOT NULL | — | 0.0-1.0 |
| model_version | VARCHAR(20) | NOT NULL | — | |
| timestamp | DateTime(tz) | NOT NULL | utc_now | |
| prediction_metadata | JSON | NULL | — | |

---

### 28. `plugin_configs`

**Model:** `PluginConfig` — `src/db/models/plugin.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| plugin_id | VARCHAR(100) | NOT NULL | — | PK (String) |
| display_name | VARCHAR(255) | NOT NULL | — | |
| description | TEXT | NULL | — | |
| category | VARCHAR(50) | NULL | — | |
| is_enabled | BOOLEAN | NOT NULL | true | |
| config | JSON | NOT NULL | {} | |
| config_schema | JSON | NOT NULL | {} | |
| capabilities | JSON | NULL | — | |
| schedule | VARCHAR(100) | NULL | — | |
| created_by | INTEGER | NULL | — | FK → user_accounts.id (SET NULL) |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 29. `plugin_executions`

**Model:** `PluginExecution` — `src/db/models/plugin.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| plugin_id | VARCHAR(100) | NOT NULL | — | FK → plugin_configs.plugin_id (CASCADE) |
| started_at | DateTime(tz) | NOT NULL | utc_now | |
| finished_at | DateTime(tz) | NULL | — | |
| status | VARCHAR(20) | NOT NULL | 'running' | |
| triggered_by | VARCHAR(50) | NULL | — | |
| triggered_by_user | INTEGER | NULL | — | FK → user_accounts.id (SET NULL) |
| triggered_by_rule | UUID | NULL | — | App-level Referenz |
| result | JSON | NULL | — | |
| error_message | TEXT | NULL | — | |
| duration_seconds | FLOAT | NULL | — | |

---

### 30. `email_log`

**Model:** `EmailLog` — `src/db/models/email_log.py`

| Spalte | Typ | Nullable | Default | Hinweis |
|--------|-----|----------|---------|---------|
| id | UUID | NOT NULL | uuid4 | PK |
| notification_id | UUID | NULL | — | FK → notifications.id (SET NULL) |
| to_address | VARCHAR(255) | NOT NULL | — | |
| subject | VARCHAR(500) | NOT NULL | — | |
| template | VARCHAR(100) | NULL | — | alert_critical/alert_digest/test |
| provider | VARCHAR(50) | NOT NULL | — | resend/smtp |
| status | VARCHAR(50) | NOT NULL | 'pending' | pending/sent/failed/permanently_failed |
| sent_at | DateTime(tz) | NULL | — | |
| error_message | TEXT | NULL | — | |
| retry_count | INTEGER | NOT NULL | 0 | |
| created_at / updated_at | DateTime(tz) | NOT NULL | utc_now | |

---

### 31. Hilfsdateien (keine eigenen Tabellen)

- `src/db/models/logic_validation.py` — Pydantic-Validatoren fuer `cross_esp_logic`
- `src/db/models/enums.py` — `DataSource` Enum (production/mock/test/simulation)

---

## REST-Endpoint-Inventar

### Basis-URL: `http://host:8000/api`

Alle Router unter `api_v1_router` bekommen Prefix `/api`. Einzelne Router bringen eigenen `/v1/...` Prefix mit.

**Anomalie:** `sequences.py` hat Prefix `/sequences` (kein `/v1`). `sensor_processing.py` wird separat eingehangen.

---

### Block 1: Auth (auth.py) — 10 Endpoints

**Prefix:** `/api/v1/auth`

| # | Method | Path | Auth | DB-Tabellen | Besonderheiten |
|---|--------|------|------|-------------|----------------|
| 1 | GET | `/status` | keine | user_accounts | Setup-Check |
| 2 | POST | `/setup` | keine | user_accounts | Erstellt ersten Admin; blockiert wenn User existieren |
| 3 | POST | `/login` | keine + Rate-Limit | user_accounts, audit_logs | Body: `LoginRequest(username, password, remember_me)` |
| 4 | POST | `/login/form` | keine | user_accounts | OAuth2 Form (Swagger UI), `include_in_schema=False` |
| 5 | POST | `/register` | AdminUser | user_accounts | Body: `RegisterRequest` |
| 6 | POST | `/refresh` | keine | token_blacklist, user_accounts | Token Rotation |
| 7 | POST | `/logout` | ActiveUser | token_blacklist, user_accounts | `all_devices=true` → `token_version++` |
| 8 | GET | `/me` | ActiveUser | user_accounts | |
| 9 | POST | `/mqtt/configure` | AdminUser | — (in-memory) | MQTT-Credentials; Broadcast an ESPs |
| 10 | GET | `/mqtt/status` | ActiveUser | — (in-memory) | |

---

### Block 2: Users (users.py) — 7 Endpoints

**Prefix:** `/api/v1/users`

| # | Method | Path | Auth | DB-Tabellen | Besonderheiten |
|---|--------|------|------|-------------|----------------|
| 1 | GET | `/` | AdminUser | user_accounts | |
| 2 | POST | `/` | AdminUser | user_accounts | 201 |
| 3 | GET | `/{user_id}` | AdminUser | user_accounts | |
| 4 | PATCH | `/{user_id}` | AdminUser | user_accounts | Partial update |
| 5 | DELETE | `/{user_id}` | AdminUser | user_accounts | 204; Hard-Delete; Selbst-Loeschung blockiert |
| 6 | POST | `/{user_id}/reset-password` | AdminUser | user_accounts | `token_version++` |
| 7 | PATCH | `/me/password` | ActiveUser | user_accounts | Eigenes Passwort |

---

### Block 3: Health (health.py) — 6 Endpoints

**Prefix:** `/api/v1/health`

| # | Method | Path | Auth | DB-Tabellen | Besonderheiten |
|---|--------|------|------|-------------|----------------|
| 1 | GET | `/` | keine | — | Status, Uptime, Version, MQTT |
| 2 | GET | `/detailed` | ActiveUser | diverse (DB-Check) | DB, MQTT, WS, CPU, Circuit Breakers |
| 3 | GET | `/esp` | ActiveUser | esp_devices, sensor_configs, actuator_configs, audit_logs | Aggregierte ESP-Health |
| 4 | GET | `/metrics` | keine | — | Prometheus Format, `include_in_schema=False` |
| 5 | GET | `/live` | keine | — | Liveness Probe (immer 200) |
| 6 | GET | `/ready` | keine | — (DB+MQTT+Disk Check) | Readiness Probe |

---

### Block 4: ESP-Devices (esp.py) — 17 Endpoints

**Prefix:** `/api/v1/esp`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/devices` | Active | R: esp_devices, sensor_configs, actuator_configs, subzones | QP: zone_id, status, hardware_type, include_deleted, page, page_size |
| 2 | GET | `/devices/pending` | Operator | R: esp_devices | Status pending_approval |
| 3 | GET | `/devices/{esp_id}` | Active | R: esp_devices + Counts | |
| 4 | POST | `/devices` | Operator | W: esp_devices | 201; Body: ESPDeviceCreate |
| 5 | PATCH | `/devices/{esp_id}` | Operator | W: esp_devices | Bei Mock: triggert SimulationScheduler |
| 6 | DELETE | `/devices/{esp_id}` | Operator | W: esp_devices (Soft-Delete) | 204; stoppt Simulation; auto-resolves Alerts |
| 7 | POST | `/devices/{esp_id}/restart` | Operator | — | MQTT REBOOT Command |
| 8 | POST | `/devices/{esp_id}/reset` | Operator | — | MQTT FACTORY_RESET; `confirm=true` required |
| 9 | GET | `/devices/{esp_id}/health` | Active | R: esp_devices.device_metadata | |
| 10 | GET | `/devices/{esp_id}/health/score` | Active | R: esp_devices | Score 0-100 via HealthScoreService |
| 11 | GET | `/devices/{esp_id}/gpio-status` | Active | R: sensor_configs, actuator_configs | Bus-aware GPIO-Verfuegbarkeit |
| 12 | POST | `/devices/{esp_id}/assign_kaiser` | Operator | W: esp_devices.device_metadata | |
| 13 | GET | `/discovery` | Active | — | mDNS/MQTT (aktuell leere Liste) |
| 14 | POST | `/devices/{esp_id}/approve` | Operator | W: esp_devices, audit_logs | WS: device_approved |
| 15 | POST | `/devices/{esp_id}/reject` | Operator | W: esp_devices | WS: device_rejected |
| 16 | PATCH | `/devices/{esp_id}/alert-config` | Operator | W: esp_devices.alert_config | Propagiert auf Kinder-Sensoren |
| 17 | GET | `/devices/{esp_id}/alert-config` | Active | R: esp_devices.alert_config | |

---

### Block 5: Sensoren (sensors.py) — 16 Endpoints

**Prefix:** `/api/v1/sensors`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: sensor_configs + letzte Readings | Paginiert; QP: esp_id, sensor_type, enabled |
| 2 | GET | `/{sensor_id}/alert-config` | Active | R: sensor_configs.alert_config | |
| 3 | GET | `/{sensor_id}/runtime` | Active | R: sensor_configs.runtime_stats | Berechnete Uptime |
| 4 | GET | `/config/{config_id}` | Active | R: sensor_configs | UUID-basiert (Multi-Value) |
| 5 | GET | `/{esp_id}/{gpio}` | Active | R: sensor_configs | QP: sensor_type (required fuer SHT31) |
| 6 | POST | `/{esp_id}/{gpio}` | Operator | W: sensor_configs, esp_devices.device_metadata | MQTT Config-Push; WS: sensor_config_created/updated |
| 7 | DELETE | `/{esp_id}/{config_id}` | Operator | W: sensor_configs, subzone_configs | UUID-basiert; bewahrt sensor_data; MQTT Config-Push |
| 8 | GET | `/data` | Active | R: sensor_data | QP: esp_id, gpio, sensor_type, start/end_time, quality, zone/subzone_id, sensor_config_id, limit |
| 9 | GET | `/data/by-source/{source}` | Active | R: sensor_data | DataSource enum |
| 10 | GET | `/data/stats/by-source` | Active | R: sensor_data | Counts gruppiert nach source |
| 11 | GET | `/{esp_id}/{gpio}/stats` | Active | R: sensor_data | min/max/avg |
| 12 | POST | `/{esp_id}/{gpio}/measure` | Operator | — | MQTT On-Demand Command |
| 13 | POST | `/esp/{esp_id}/onewire/scan` | Operator | — | MQTT onewire/scan; 10s Timeout |
| 14 | GET | `/esp/{esp_id}/onewire` | Active | R: sensor_configs | Konfigurierte OneWire-Sensoren |
| 15 | PATCH | `/{sensor_id}/alert-config` | Operator | W: sensor_configs.alert_config | |
| 16 | PATCH | `/{sensor_id}/runtime` | Operator | W: sensor_configs.runtime_stats | |

---

### Block 6: Sensor Type Defaults (sensor_type_defaults.py) — 6 Endpoints

**Prefix:** `/api/v1/sensors/type-defaults`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: sensor_type_defaults | |
| 2 | GET | `/{sensor_type}` | Active | R: sensor_type_defaults | |
| 3 | POST | `/` | Operator | W: sensor_type_defaults | 201; 409 bei Duplikat |
| 4 | PATCH | `/{sensor_type}` | Operator | W: sensor_type_defaults | |
| 5 | DELETE | `/{sensor_type}` | Operator | W: sensor_type_defaults | 204 |
| 6 | GET | `/{sensor_type}/effective` | Active | R: sensor_type_defaults | Fallback-Chain |

---

### Block 7: Aktoren (actuators.py) — 13 Endpoints

**Prefix:** `/api/v1/actuators`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: actuator_configs | Paginiert |
| 2 | GET | `/{actuator_id}/alert-config` | Active | R: actuator_configs.alert_config | |
| 3 | GET | `/{actuator_id}/runtime` | Active | R: actuator_configs.runtime_stats | |
| 4 | GET | `/{esp_id}/{gpio}` | Active | R: actuator_configs, actuator_states | |
| 5 | POST | `/{esp_id}/{gpio}` | Operator | W: actuator_configs | Nur approved/online; GPIO-Konflikt-Check; MQTT Config-Push |
| 6 | POST | `/{esp_id}/{gpio}/command` | Operator | W: actuator_states, actuator_history, audit_logs | SafetyService; MQTT; 409 bei offline |
| 7 | GET | `/{esp_id}/{gpio}/status` | Active | R: actuator_states | QP: include_config |
| 8 | POST | `/emergency_stop` | Operator | W: actuator_states, audit_logs | Alle Aktoren OFF; MQTT Broadcast; WS: actuator_alert |
| 9 | POST | `/clear_emergency` | Operator | W: — (in-memory SafetyService) | MQTT clear_emergency |
| 10 | DELETE | `/{esp_id}/{gpio}` | Operator | W: actuator_configs | Sendet OFF zuerst; MQTT Config-Push |
| 11 | GET | `/{esp_id}/{gpio}/history` | Active | R: actuator_history | QP: limit (default 20, max 100) |
| 12 | PATCH | `/{actuator_id}/alert-config` | Operator | W: actuator_configs.alert_config | |
| 13 | PATCH | `/{actuator_id}/runtime` | Operator | W: actuator_configs.runtime_stats | |

---

### Block 8: Zonen (zones.py) — 8 Endpoints

**Prefix:** `/api/v1/zones`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/` | Operator | W: zones | 201; 409 bei Duplikat |
| 2 | GET | `/` | Operator | R: zones | QP: status |
| 3 | GET | `/{zone_id}` | Operator | R: zones | |
| 4 | PUT | `/{zone_id}` | Operator | W: zones, esp_devices | Synct zone_name auf Devices |
| 5 | PATCH | `/{zone_id}` | Operator | W: zones, esp_devices | Partial; synct zone_name |
| 6 | POST | `/{zone_id}/archive` | Operator | W: zones, subzone_configs | Blockiert wenn Devices zugewiesen |
| 7 | POST | `/{zone_id}/reactivate` | Operator | W: zones | Nur von archived |
| 8 | DELETE | `/{zone_id}` | Operator | W: zones | Soft-Delete; blockiert wenn Devices zugewiesen |

---

### Block 9: Zone-Zuweisungen (zone.py) — 7 Endpoints

**Prefix:** `/api/v1/zone`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/devices/{esp_id}/assign` | Operator | W: esp_devices, device_zone_changes | MQTT via CommandBridge; subzone_strategy: transfer/copy/reset |
| 2 | DELETE | `/devices/{esp_id}/zone` | Operator | W: esp_devices | MQTT via CommandBridge |
| 3 | GET | `/zones` | Active | R: zones, esp_devices, sensor_configs, actuator_configs | Enriched mit Counts |
| 4 | GET | `/devices/{esp_id}` | Active | R: esp_devices | ZoneInfo |
| 5 | GET | `/{zone_id}/devices` | Active | R: esp_devices | |
| 6 | GET | `/{zone_id}/monitor-data` | Active | R: sensor_configs, actuator_configs, actuator_states, subzones | Via MonitorDataService |
| 7 | GET | `/unassigned` | Active | R: esp_devices | |

---

### Block 10: Zone-Kontext (zone_context.py) — 7 Endpoints

**Prefix:** `/api/v1/zone/context`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: zone_contexts | Paginiert |
| 2 | GET | `/{zone_id}` | Active | R: zone_contexts | |
| 3 | PUT | `/{zone_id}` | Operator | W: zone_contexts | Upsert |
| 4 | PATCH | `/{zone_id}` | Operator | W: zone_contexts | Partial |
| 5 | POST | `/{zone_id}/archive-cycle` | Operator | W: zone_contexts | Archiviert in cycle_history JSON |
| 6 | GET | `/{zone_id}/history` | Active | R: zone_contexts.cycle_history | |
| 7 | GET | `/{zone_id}/kpis` | Active | R: zone_contexts, sensor_data | VPD, DLI, Growth Progress via ZoneKPIService |

---

### Block 11: Subzonen (subzone.py) — 7 Endpoints

**Prefix:** `/api/v1/subzone`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/devices/{esp_id}/subzones/assign` | Operator | W: subzone_configs | MQTT |
| 2 | DELETE | `/devices/{esp_id}/subzones/{subzone_id}` | Operator | W: subzone_configs | MQTT; gibt GPIOs frei |
| 3 | GET | `/devices/{esp_id}/subzones` | keine | R: subzone_configs | **Oeffentlich!** |
| 4 | GET | `/devices/{esp_id}/subzones/{subzone_id}` | keine | R: subzone_configs | **Oeffentlich!** |
| 5 | PATCH | `/devices/{esp_id}/subzones/{subzone_id}/metadata` | Operator | W: subzone_configs.custom_data | |
| 6 | POST | `/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | Operator | W: subzone_configs | MQTT; GPIO auf INPUT_PULLUP |
| 7 | DELETE | `/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | Operator | W: subzone_configs | |

---

### Block 12: Logic Engine (logic.py) — 8 Endpoints

**Prefix:** `/api/v1/logic`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/rules` | Active | R: cross_esp_logic, logic_execution_history | Sorted by priority |
| 2 | GET | `/rules/{rule_id}` | Active | R: cross_esp_logic | Mit execution count |
| 3 | POST | `/rules` | Operator | W: cross_esp_logic | 201; validiert via LogicService |
| 4 | PUT | `/rules/{rule_id}` | Operator | W: cross_esp_logic | Full update |
| 5 | DELETE | `/rules/{rule_id}` | Operator | W: cross_esp_logic | Hard-Delete |
| 6 | POST | `/rules/{rule_id}/toggle` | Operator | W: cross_esp_logic | Bei Deaktivierung: OFF an alle Aktoren |
| 7 | POST | `/rules/{rule_id}/test` | Operator | R: cross_esp_logic, sensor_data | Dry-Run |
| 8 | GET | `/execution_history` | Active | R: logic_execution_history | QP: rule_id, success, start/end_time, limit |

---

### Block 13: Dashboards (dashboards.py) — 5 Endpoints

**Prefix:** `/api/v1/dashboards`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: dashboards | Eigene + geteilte |
| 2 | GET | `/{dashboard_id}` | Active | R: dashboards | |
| 3 | POST | `/` | Active | W: dashboards | 201 |
| 4 | PUT | `/{dashboard_id}` | Active | W: dashboards | Nur Owner/Admin |
| 5 | DELETE | `/{dashboard_id}` | Active | W: dashboards | Nur Owner/Admin |

---

### Block 14: Kaiser (kaiser.py) — 5 Endpoints

**Prefix:** `/api/v1/kaiser`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: kaiser_registry | |
| 2 | GET | `/{kaiser_id}` | Active | R: kaiser_registry | |
| 3 | GET | `/{kaiser_id}/hierarchy` | Active | R: kaiser_registry, zones, subzones, esp_devices | Baumstruktur |
| 4 | POST | `/` | Operator | W: kaiser_registry | 201; 409 bei Duplikat |
| 5 | PUT | `/{kaiser_id}/zones` | Operator | W: kaiser_registry | |

---

### Block 15: Audit (audit.py) — 21 Endpoints

**Prefix:** `/api/v1/audit`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: audit_logs | QP: event_type, severity, source_type, source_id, status, error_code, start/end_time, hours, page, page_size |
| 2 | GET | `/events/aggregated` | Active | R: audit_logs, sensor_data, esp_heartbeat_logs, actuator_states | Cursor-basierte Paginierung; QP: sources, hours, limit_per_source, severity, esp_ids, before_timestamp |
| 3 | GET | `/events/correlated/{correlation_id}` | Active | R: audit_logs | QP: limit |
| 4 | GET | `/errors` | Active | R: audit_logs | QP: hours, limit |
| 5 | GET | `/esp/{esp_id}/config-history` | Active | R: audit_logs | QP: limit |
| 6 | GET | `/statistics` | Active | R: audit_logs | QP: time_range (24h/7d/30d/all) |
| 7 | GET | `/error-rate` | Active | R: audit_logs | QP: hours |
| 8 | GET | `/retention/status` | Active | R: system_config | Auto-Cleanup-Status |
| 9 | GET | `/retention/config` | Active | R: system_config | |
| 10 | PUT | `/retention/config` | Admin | W: system_config | |
| 11 | POST | `/retention/cleanup` | Active/Admin | W: audit_logs | Admin fuer echte Loeschung, Operator fuer dry_run |
| 12 | GET | `/event-types` | keine | — (statisch) | Referenzdaten |
| 13 | GET | `/severities` | keine | — (statisch) | Referenzdaten |
| 14 | GET | `/source-types` | keine | — (statisch) | Referenzdaten |
| 15 | GET | `/backups` | Admin | R: Dateisystem | QP: include_expired |
| 16 | GET | `/backups/{backup_id}` | Admin | R: Dateisystem | |
| 17 | POST | `/backups/{backup_id}/restore` | Admin | W: audit_logs | QP: delete_after_restore; WS Broadcast |
| 18 | DELETE | `/backups/{backup_id}` | Admin | W: Dateisystem | |
| 19 | POST | `/backups/cleanup` | Admin | W: Dateisystem | Loescht abgelaufene Backups |
| 20 | GET | `/backups/retention/config` | Admin | R: system_config | |
| 21 | PUT | `/backups/retention/config` | Admin | W: system_config | |

---

### Block 16: Diagnostics (diagnostics.py) — 6 Endpoints

**Prefix:** `/api/v1/diagnostics`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/run` | Active | W: diagnostic_reports; R: diverse | 10 System-Checks |
| 2 | POST | `/run/{check_name}` | Active | R: diverse | server/database/mqtt/esp_devices/sensors/actuators/monitoring/logic_engine/alerts/plugins |
| 3 | GET | `/history` | Active | R: diagnostic_reports | QP: limit, offset |
| 4 | GET | `/history/{report_id}` | Active | R: diagnostic_reports | |
| 5 | POST | `/export/{report_id}` | Active | W: diagnostic_reports (exported_at) | Markdown-Export |
| 6 | GET | `/checks` | Active | — (statisch) | Verfuegbare Check-Namen |

---

### Block 17: Notifications (notifications.py) — 15 Endpoints

**Prefix:** `/api/v1/notifications`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: notifications | QP: severity, category, source, is_read, page, page_size |
| 2 | GET | `/unread-count` | Active | R: notifications | Badge-Counter + hoechste Severity |
| 3 | GET | `/alerts/active` | Active | R: notifications | QP: severity, category, status, page, page_size |
| 4 | GET | `/alerts/stats` | Active | R: notifications | ISA-18.2 MTTA/MTTR |
| 5 | GET | `/preferences` | Active | R: notification_preferences | Auto-erstellt wenn fehlend |
| 6 | GET | `/email-log` | Admin | R: email_log | QP: status, date_from, date_to, template, page, page_size |
| 7 | GET | `/email-log/stats` | Admin | R: email_log | |
| 8 | GET | `/{notification_id}` | Active | R: notifications | |
| 9 | PATCH | `/{notification_id}/read` | Active | W: notifications | WS: notification_updated + unread_count |
| 10 | PATCH | `/{notification_id}/acknowledge` | Active | W: notifications | ISA-18.2 State Machine; WS |
| 11 | PATCH | `/{notification_id}/resolve` | Active | W: notifications | ISA-18.2 State Machine; WS |
| 12 | PATCH | `/read-all` | Active | W: notifications | WS: unread_count |
| 13 | POST | `/send` | Admin | W: notifications | Broadcast an alle User |
| 14 | PUT | `/preferences` | Active | W: notification_preferences | |
| 15 | POST | `/test-email` | Active | W: email_log | |

---

### Block 18: Plugins (plugins.py) — 8 Endpoints

**Prefix:** `/api/v1/plugins`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: plugin_configs | Via PluginRegistry |
| 2 | GET | `/{plugin_id}` | Active | R: plugin_configs, plugin_executions | |
| 3 | POST | `/{plugin_id}/execute` | Active | W: plugin_executions | 409 wenn disabled |
| 4 | PUT | `/{plugin_id}/config` | Admin | W: plugin_configs | |
| 5 | GET | `/{plugin_id}/history` | Active | R: plugin_executions | QP: limit (max 200) |
| 6 | POST | `/{plugin_id}/enable` | Admin | W: plugin_configs | |
| 7 | POST | `/{plugin_id}/disable` | Admin | W: plugin_configs | |
| 8 | PUT | `/{plugin_id}/schedule` | Admin | W: plugin_configs | Cron-Expression |

---

### Block 19: Sequences (sequences.py) — 4 Endpoints

**Prefix:** `/api/sequences` (ANOMALIE: kein /v1!)

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | R: in-memory (LogicEngine.action_executors) | QP: running_only, limit (max 500) |
| 2 | GET | `/stats` | Active | R: in-memory | |
| 3 | GET | `/{sequence_id}` | Active | R: in-memory | |
| 4 | POST | `/{sequence_id}/cancel` | Active | W: in-memory | QP: reason |

---

### Block 20: Errors (errors.py) — 4 Endpoints

**Prefix:** `/api/v1/errors`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/esp/{esp_id}` | Active | R: audit_logs | QP: severity, category, hours (1-168), page, page_size |
| 2 | GET | `/summary` | Active | R: audit_logs | Aggregiert nach severity/category/ESP/code |
| 3 | GET | `/codes` | Active | — (statisch) | ESP32 (1000-4999) + Server (5000-5999) |
| 4 | GET | `/codes/{error_code}` | Active | — (statisch) | |

---

### Block 21: Frontend Logs (logs.py) — 1 Endpoint

**Prefix:** `/api/v1/logs`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/frontend` | keine | — (Logger) | Rate-Limited 10 req/min per IP; 204 |

---

### Block 22: AI (ai.py) — 1 Endpoint

**Prefix:** `/api/v1/ai`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/query` | Active | R: diverse (NLQ) | Rule-based NLQ Stub (V1) |

---

### Block 23: Backups (backups.py) — 6 Endpoints

**Prefix:** `/api/v1/backups`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/database/create` | Admin | R: alle (pg_dump) | |
| 2 | GET | `/database/list` | Admin | — (Dateisystem) | |
| 3 | GET | `/database/{backup_id}/download` | Admin | — (Dateisystem) | FileResponse (.sql.gz) |
| 4 | DELETE | `/database/{backup_id}` | Admin | — (Dateisystem) | |
| 5 | POST | `/database/{backup_id}/restore` | Admin | W: alle | `confirm=true` required; ersetzt ALLE Daten |
| 6 | POST | `/database/cleanup` | Admin | — (Dateisystem) | Nach Alter/Anzahl |

---

### Block 24: Component Export (component_export.py) — 5 Endpoints

**Prefix:** `/api/v1/export`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/components` | Active | R: sensor_configs, actuator_configs | WoT-TD JSON Format |
| 2 | GET | `/components/{component_id}` | Active | R: sensor_configs oder actuator_configs | Composite ID |
| 3 | GET | `/zones` | Active | R: zones, zone_contexts | |
| 4 | GET | `/zones/{zone_id}` | Active | R: zones, zone_contexts, sensor_configs, actuator_configs | |
| 5 | GET | `/system-description` | Active | R: diverse | WoT-System-Uebersicht |

---

### Block 25: Schema Registry (schema_registry.py) — 3 Endpoints

**Prefix:** `/api/v1/schema-registry`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | GET | `/` | Active | — (statisch) | |
| 2 | GET | `/{device_type}` | Active | — (statisch) | JSON Schema |
| 3 | POST | `/{device_type}/validate` | Active | — | Body validieren gegen Schema |

---

### Block 26: Device Context (device_context.py) — 3 Endpoints

**Prefix:** `/api/v1/device-context`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | PUT | `/{config_type}/{config_id}` | Operator | W: device_active_context | Blockiert fuer zone_local; WS: device_context_changed |
| 2 | GET | `/{config_type}/{config_id}` | Operator | R: device_active_context | |
| 3 | DELETE | `/{config_type}/{config_id}` | Operator | W: device_active_context | WS: device_context_changed |

---

### Block 27: Webhooks (webhooks.py) — 1 Endpoint

**Prefix:** `/api/v1/webhooks`

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/grafana-alerts` | keine | W: notifications | Body: GrafanaWebhookPayload; auto-resolves via correlation_id |

---

### Block 28: Library (library.py) — 0 Endpoints

**Leer.** Geplant fuer OTA-Updates.

---

### Block 29: Sensor Processing (sensor_processing.py) — 4 Endpoints

**Prefix:** `/api/v1/sensors` (separater Router)
**Auth:** X-API-Key Header (kein JWT), Rate-Limited 100 req/min

| # | Method | Path | Auth | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|------|-------------------|----------------|
| 1 | POST | `/process` | API-Key | — (in-memory Library) | <10ms Ziel; 9 Sensortypen |
| 2 | GET | `/types` | API-Key | — (statisch) | |
| 3 | GET | `/health` | API-Key | — | Subsystem Health |
| 4 | POST | `/calibrate` | API-Key | — (in-memory Library) | pH/EC: 2-Punkt; Temp/Pressure/Humidity: 1-Punkt Offset |

---

### Block 30: Debug (debug.py) — 58 Endpoints

**Prefix:** `/api/v1/debug` — **ALLE AdminUser**

#### Mock ESP Management (26 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 1 | POST | `/mock-esp` | W: esp_devices, sensor_configs, actuator_configs | 201; DB-First Architecture |
| 2 | GET | `/mock-esp` | R: esp_devices | |
| 3 | GET | `/mock-esp/{esp_id}` | R: esp_devices | |
| 4 | DELETE | `/mock-esp/{esp_id}` | W: esp_devices | 204; Soft-Delete |
| 5 | POST | `/mock-esp/{esp_id}/simulation/start` | W: esp_devices | Startet Heartbeat-Job |
| 6 | POST | `/mock-esp/{esp_id}/simulation/stop` | W: esp_devices | |
| 7 | POST | `/mock-esp/{esp_id}/heartbeat` | W: esp_heartbeat_logs | Manuell |
| 8 | POST | `/mock-esp/{esp_id}/state` | W: esp_devices | StateTransition via SimulationScheduler |
| 9 | POST | `/mock-esp/{esp_id}/auto-heartbeat` | W: esp_devices | QP: enabled, interval_seconds |
| 10 | POST | `/mock-esp/{esp_id}/sensors` | W: sensor_configs, esp_devices | Body: MockSensorConfig |
| 11 | POST | `/mock-esp/{esp_id}/onewire/scan` | — | Fake DS18B20 Scan |
| 12 | DELETE | `/mock-esp/{esp_id}/sensors/{gpio}` | W: sensor_configs, esp_devices | QP: sensor_type |
| 13 | POST | `/mock-esp/{esp_id}/sensors/{gpio}/value` | W: esp_devices.device_metadata | Manual Override |
| 14 | DELETE | `/mock-esp/{esp_id}/sensors/{gpio}/value` | W: esp_devices.device_metadata | Clear Override |
| 15 | POST | `/mock-esp/{esp_id}/sensors/batch` | W: esp_devices.device_metadata | Batch Values |
| 16 | POST | `/mock-esp/{esp_id}/actuators` | W: actuator_configs, actuator_states | |
| 17 | POST | `/mock-esp/{esp_id}/actuators/{gpio}` | W: actuator_states | |
| 18 | POST | `/mock-esp/{esp_id}/emergency-stop` | W: actuator_states | |
| 19 | POST | `/mock-esp/{esp_id}/clear-emergency` | W: actuator_states | |
| 20 | POST | `/mock-esp/{esp_id}/actuators/{gpio}/command` | W: actuator_states, actuator_history | Simuliert MQTT Flow |
| 21 | POST | `/mock-esp/{esp_id}/actuators/{gpio}/emergency-stop` | W: actuator_states | |
| 22 | POST | `/mock-esp/{esp_id}/clear-emergency-scheduler` | W: actuator_states | |
| 23 | GET | `/mock-esp/{esp_id}/actuator-states` | R: actuator_states | |
| 24 | GET | `/mock-esp/{esp_id}/messages` | R: in-memory | **DEPRECATED** |
| 25 | DELETE | `/mock-esp/{esp_id}/messages` | — | **DEPRECATED** (no-op) |
| 26 | GET | `/mock-esp/sync-status` | R: esp_devices | **DEPRECATED** |

#### Database Explorer (4 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 27 | GET | `/db/tables` | R: alle (Whitelisted) | Schema-Info |
| 28 | GET | `/db/{table_name}/schema` | R: Meta-Schema | |
| 29 | GET | `/db/{table_name}` | R: beliebige Tabelle | Django-style Filter; paginiert |
| 30 | GET | `/db/{table_name}/{record_id}` | R: beliebige Tabelle | PK-Lookup |

#### Log Management (6 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 31 | GET | `/logs/files` | — (Dateisystem) | |
| 32 | GET | `/logs` | — (Dateisystem) | QP: level, module, search, start/end_time, request_id, file, page, page_size |
| 33 | GET | `/logs/statistics` | — (Dateisystem) | |
| 34 | POST | `/logs/cleanup` | — (Dateisystem) | QP: dry_run, files, create_backup |
| 35 | DELETE | `/logs/{filename}` | — (Dateisystem) | Aktive Log nicht loeschbar |
| 36 | GET | `/logs/backup/{backup_id}` | — (Dateisystem) | FileResponse ZIP |

#### System Config (2 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 37 | GET | `/config` | R: system_config | QP: config_type; maskiert Secrets |
| 38 | PATCH | `/config/{config_key}` | W: system_config | |

#### Load Testing (4 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 39 | POST | `/load-test/bulk-create` | W: esp_devices, sensor_configs | Count + prefix |
| 40 | POST | `/load-test/simulate` | W: esp_devices | Startet alle Mock-Heartbeats |
| 41 | POST | `/load-test/stop` | W: esp_devices | Stoppt alle |
| 42 | GET | `/load-test/metrics` | R: diverse | Performance-Metriken |

#### Cleanup (2 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 43 | DELETE | `/cleanup/orphaned-mocks` | W: esp_devices | **DEPRECATED** |
| 44 | DELETE | `/test-data/cleanup` | W: sensor_data, actuator_history | QP: dry_run, include_mock, include_simulation |

#### Sensor Libraries (2 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 45 | POST | `/libraries/reload` | — (in-memory) | Hot-Reload |
| 46 | GET | `/libraries/info` | — (in-memory) | |

#### Data Source (1 Endpoint)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 47 | POST | `/data-source/detect` | — | Detection-Logik Test |

#### Maintenance (3 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 48 | GET | `/maintenance/status` | — (in-memory) | |
| 49 | POST | `/maintenance/trigger/{job_name}` | W: diverse | Manuelles Trigger |
| 50 | GET | `/maintenance/config` | R: system_config | |

#### Resilience / Circuit Breaker (9 Endpoints)

| # | Method | Path | DB-Tabellen (R/W) | Besonderheiten |
|---|--------|------|-------------------|----------------|
| 51 | GET | `/resilience/status` | — (in-memory) | Alle Circuit Breaker |
| 52 | GET | `/resilience/metrics` | — (in-memory) | |
| 53 | GET | `/resilience/circuit-breaker/{name}` | — (in-memory) | |
| 54 | POST | `/resilience/circuit-breaker/{name}/reset` | — (in-memory) | Setzt auf CLOSED |
| 55 | POST | `/resilience/circuit-breaker/{name}/force-open` | — (in-memory) | Nur Tests |
| 56 | POST | `/resilience/reset-all` | — (in-memory) | |
| 57 | GET | `/resilience/offline-buffer` | — (in-memory) | MQTT Offline-Buffer |
| 58 | POST | `/resilience/offline-buffer/flush` | — (in-memory) | Manuelles Flush |
| 59* | DELETE | `/resilience/offline-buffer` | — (in-memory) | **Destruktiv!** |

---

### Block 31: WebSocket (websocket/realtime.py) — 1 Endpoint

| Protokoll | Path | Auth | Besonderheiten |
|-----------|------|------|----------------|
| WebSocket | `/api/v1/ws/realtime/{client_id}` | JWT als QP `?token=<jwt>` | Subscribe/Unsubscribe mit Filtern (types, esp_ids, sensor_types) |

---

## MQTT-Handler mit DB-Interaktion

### Handler-Uebersicht

| # | Handler | Topic | QoS | DB-Reads | DB-Writes | Side Effects |
|---|---------|-------|-----|----------|-----------|--------------|
| 1 | SensorDataHandler | `kaiser/god/esp/+/sensor/+/data` | 1 | esp_devices, sensor_configs, subzones | sensor_data, sensor_configs, esp_devices | WS: sensor_data; MQTT: processed value; LogicEngine trigger; Threshold eval; Prometheus |
| 2 | HeartbeatHandler | `kaiser/god/esp/+/system/heartbeat` | 0 | esp_devices, actuator_configs | esp_devices, esp_heartbeat_logs, audit_logs | WS: esp_discovered/esp_health; MQTT: heartbeat/ack + LWT clear; Full-State-Push bei Reconnect; Prometheus |
| 3 | DiscoveryHandler | `kaiser/god/discovery/esp32_nodes` | 1 | esp_devices | esp_devices | **DEPRECATED** — Nur Rueckwaertskompatibilitaet |
| 4 | ActuatorStatusHandler | `kaiser/god/esp/+/actuator/+/status` | 1 | esp_devices, actuator_configs | actuator_states, actuator_history, audit_logs | WS: actuator_status |
| 5 | ActuatorResponseHandler | `kaiser/god/esp/+/actuator/+/response` | 1 | esp_devices | actuator_history, audit_logs | WS: actuator_response |
| 6 | ActuatorAlertHandler | `kaiser/god/esp/+/actuator/+/alert` | 1 | esp_devices | actuator_history, actuator_states, notifications | WS: actuator_alert; NotificationRouter |
| 7 | ConfigHandler | `kaiser/god/esp/+/config_response` | 2 | esp_devices, sensor_configs, actuator_configs | audit_logs, sensor_configs, actuator_configs | WS: config_response |
| 8 | DiagnosticsHandler | `kaiser/god/esp/+/system/diagnostics` | 0 | esp_devices | esp_devices.device_metadata | WS: esp_diagnostics |
| 9 | ErrorEventHandler | `kaiser/god/esp/+/system/error` | 1 | esp_devices | audit_logs | WS: error_event; Prometheus |
| 10 | LWTHandler | `kaiser/god/esp/+/system/will` | 1 | esp_devices | esp_devices, actuator_states, audit_logs | WS: esp_health; Safety: Actuator-Reset auf "idle" |
| 11 | ZoneAckHandler | `kaiser/god/esp/+/zone/ack` | 1 | esp_devices, zones | esp_devices | WS: zone_assignment; CommandBridge: resolve_ack() |
| 12 | SubzoneAckHandler | `kaiser/god/esp/+/subzone/ack` | 1 | esp_devices | subzone_configs | WS: subzone_assignment; CommandBridge: resolve_ack() |
| 13 | KaiserHandler | `kaiser/{kaiser_id}/status` | — | — | — | **STUB** — Kein Code implementiert |

### Throttling / Debouncing

| Handler | Mechanismus | Wert |
|---------|-------------|------|
| SensorDataHandler | `last_seen` Update-Throttle per ESP | 60s (in-memory Cache) |
| HeartbeatHandler | Reconnect-Threshold | 60s |
| HeartbeatHandler | State-Push-Cooldown | 120s |
| HeartbeatHandler | Config-Push-Cooldown | 120s |
| SensorDataHandler | QoS-1 Dedup | ON CONFLICT DO NOTHING |

### MQTT Publishes (Server → ESP)

| Topic | Trigger | Handler/Service |
|-------|---------|----------------|
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/processed` | Sensor-Data-Verarbeitung | SensorDataHandler |
| `kaiser/god/esp/{esp_id}/system/heartbeat/ack` | Heartbeat empfangen | HeartbeatHandler |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` | Actuator-Command API | ActuatorService |
| `kaiser/god/esp/{esp_id}/config` | Config-Push | MQTTCommandBridge |
| `kaiser/god/esp/{esp_id}/zone/assign` | Zone-Zuweisung | MQTTCommandBridge |
| `kaiser/god/esp/{esp_id}/subzone/assign` | Subzone-Zuweisung | MQTTCommandBridge |
| `kaiser/god/esp/{esp_id}/system/reboot` | Restart API | esp.py |
| `kaiser/god/esp/{esp_id}/system/factory_reset` | Factory-Reset API | esp.py |
| `kaiser/broadcast/emergency` | Emergency-Stop API | actuators.py |
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/command` | On-Demand Messung | sensors.py |
| `kaiser/god/esp/{esp_id}/onewire/scan` | OneWire-Scan API | sensors.py |

---

## Background-Services mit DB-Zugriff

### MaintenanceService — Cleanup-Jobs (APScheduler)

| Job | Schedule | DB-Tabelle | Aktion | Safety |
|-----|----------|-----------|--------|--------|
| `cleanup_sensor_data` | Taeglich 03:00 | sensor_data | DELETE batch | Dry-Run, Safety-Limit, Batch |
| `cleanup_command_history` | Taeglich 03:30 | actuator_history | DELETE batch | Dry-Run, Safety-Limit, Batch |
| `cleanup_heartbeat_logs` | Taeglich 03:15 | esp_heartbeat_logs | DELETE batch | Default: 7 Tage Retention |
| `cleanup_orphaned_mocks` | Stuendlich | esp_devices | UPDATE/Soft-Delete | |
| `health_check_esps` | ~60s | esp_devices | READ last_seen → UPDATE status="offline" | Timeout-basiert |
| `health_check_sensors` | ~60s | sensor_data, sensor_configs | READ | |
| `aggregate_stats` | Alle X min | esp_devices, sensor_configs, actuator_configs | READ (in-memory Cache) | |

### LogicEngine — Event-driven + Background Loop

- **Trigger:** `SensorDataHandler` → `asyncio.create_task(evaluate_sensor_data())`
- **DB-Reads:** `cross_esp_logic`, `sensor_data` (latest readings)
- **DB-Writes:** `logic_execution_history`, `cross_esp_logic.last_triggered`
- **Side Effects:** MQTT actuator commands, WS: logic_execution
- **Safety:** ConflictManager, RateLimiter, Cooldown, Hysteresis

### SensorSchedulerService — APScheduler-Jobs

- **DB-Reads:** `sensor_configs` (operating_mode="scheduled"), `esp_devices`
- **Trigger:** MQTT sensor command
- **Recovery:** Beim Server-Start werden alle Jobs aus DB geladen

---

## Cross-Cutting Concerns

### WebSocket-Broadcasts pro Endpoint-Bereich

| Bereich | Events |
|---------|--------|
| Sensoren | `sensor_data`, `sensor_config_created`, `sensor_config_updated`, `sensor_config_deleted` |
| Aktoren | `actuator_status`, `actuator_response`, `actuator_alert` |
| ESP-Geraete | `esp_discovered`, `esp_health`, `esp_diagnostics`, `device_approved`, `device_rejected` |
| Zonen | `zone_assignment`, `subzone_assignment` |
| Konfiguration | `config_response` |
| Logik | `logic_execution` |
| Notifications | `notification_updated`, `unread_count` |
| Device Context | `device_context_changed` |
| Errors | `error_event` |
| System | `system_event` (MQTT disconnect) |

### Circuit Breaker

Circuit Breaker werden in `ResilienceRegistry` verwaltet und sind ueber Debug-Endpoints (Block 30, #51-59) einsehbar/steuerbar. Verwendet von:
- SensorDataHandler (`resilient_session()`)
- ErrorEventHandler (`resilient_session()`)
- HeartbeatHandler (implizit via `resilient_session()`)

### Rate Limiting

| Bereich | Limit |
|---------|-------|
| Auth Login | `check_auth_rate_limit` (konfigurierbar) |
| Frontend Logs | 10 req/min per IP |
| Sensor Processing | 100 req/min per API Key |
| WebSocket | 10 Nachrichten/Sekunde per Client |
| Logic Engine | `max_executions_per_hour` pro Regel |

### Config-Push (Server → ESP via MQTT)

Getriggert von:
- `POST /sensors/{esp_id}/{gpio}` (Sensor erstellen/aktualisieren)
- `DELETE /sensors/{esp_id}/{config_id}` (Sensor loeschen)
- `POST /actuators/{esp_id}/{gpio}` (Actuator erstellen)
- `DELETE /actuators/{esp_id}/{gpio}` (Actuator loeschen)
- HeartbeatHandler bei Reconnect (> 60s offline) — Full-State-Push
- Zone-Assignment (via CommandBridge)
- Subzone-Assignment (via CommandBridge)

**Cooldown:** 120s zwischen State/Config-Pushes (in-memory Timer im HeartbeatHandler)

---

## Findings + Empfehlungen

### HIGH — Kritische Luecken

| # | Finding | Betroffene Stelle | Empfehlung |
|---|---------|-------------------|------------|
| H1 | **Subzone GET Endpoints sind oeffentlich** (keine Auth) | subzone.py: `list_subzones`, `get_subzone` | Auth hinzufuegen (mindestens ActiveUser) |
| H2 | **Sequences-Prefix-Anomalie** — `/api/sequences` statt `/api/v1/sequences` | sequences.py | Prefix auf `/v1/sequences` aendern fuer Konsistenz |
| H3 | **Sensor-Processing nutzt separates Auth-System** (X-API-Key statt JWT) | sensor_processing.py | Dokumentieren als bewusste Design-Entscheidung oder auf JWT migrieren |
| H4 | **SensorDataHandler — JSON-Mutation ohne flag_modified()** | sensor_handler.py: `sensor_config.sensor_metadata` Update | `flag_modified(sensor_config, 'sensor_metadata')` hinzufuegen |
| H5 | **HeartbeatHandler — Doppel-Commit** bei Heartbeat-Log INSERT | heartbeat_handler.py | In eine Transaktion zusammenfassen oder bewusst dokumentieren |

### MEDIUM — Inkonsistenzen

| # | Finding | Betroffene Stelle | Empfehlung |
|---|---------|-------------------|------------|
| M1 | **library.py ist komplett leer** — 0 Endpoints | api/v1/library.py | Router entfernen oder OTA implementieren |
| M2 | **KaiserHandler ist Stub** — nur Docstring, kein Code | mqtt/handlers/kaiser_handler.py | Implementieren oder entfernen |
| M3 | **3 Deprecated Debug-Endpoints** (`sync-status`, `messages`, `orphaned-mocks`) | debug.py | Entfernen oder mit Deprecation-Header markieren |
| M4 | **DiscoveryHandler ist deprecated** — Discovery laeuft ueber HeartbeatHandler | discovery_handler.py | Entfernen nach Migration aller ESPs |
| M5 | **Doppelte Zone-List-Endpoints** — `GET /zones/` (zones.py) und `GET /zone/zones` (zone.py) | zones.py + zone.py | Einen der beiden entfernen (zone.py hat enriched Version) |
| M6 | **Inkonsistente Auth-Level** bei Zone-CRUD — `list_zones` braucht OperatorUser, `list_zones_enriched` nur ActiveUser | zones.py vs zone.py | Vereinheitlichen auf ActiveUser fuer Read-Ops |
| M7 | **Dashboard hat kein Auto-Generate Endpoint** (im Auftrag erwartet) | dashboards.py | Ist wohl ueber Debug/Load-Test oder manuell |
| M8 | **Audit-Log Backup-Restore und DB-Backup-Restore sind separate Systeme** | audit.py vs backups.py | Dokumentieren als bewusst getrennte Systeme |
| M9 | **ZoneAckHandler — IntegrityError-Check** nutzt String-Matching (`"zone" in str(e).lower()`) | zone_ack_handler.py | Spezifischere Error-Erkennung nutzen |

### LOW — Verbesserungsvorschlaege

| # | Finding | Betroffene Stelle | Empfehlung |
|---|---------|-------------------|------------|
| L1 | **Sensor-Data `aggregation` Parameter fehlt** | sensors.py (GET /data) | War im Auftrag als "toter Code" markiert — tatsaechlich nie implementiert |
| L2 | **Sensor-Data Pagination** — nur `limit`, kein Cursor/Offset | sensors.py | Cursor-basierte Pagination fuer grosse Zeitreihen |
| L3 | **Actuator-History** — kein time_range Filter, nur limit | actuators.py | start_time/end_time Parameter hinzufuegen |
| L4 | **ai_predictions Tabelle wird von keinem Endpoint geschrieben** | ai.py: POST /query ist nur NLQ Stub | Tabelle ist Stub fuer zukuenftige KI-Features |
| L5 | **plugin_configs/plugin_executions** — PluginRegistry in-memory, DB nur als Persistence | plugins.py | Konsistenz zwischen in-memory und DB sicherstellen |
| L6 | **Debug-Endpoint-Anzahl (58)** ist > 22% aller Endpoints | debug.py | Ggf. in Sub-Router aufteilen (mock, db, logs, resilience, maintenance) |

---

## DB-Interaktions-Matrix (Tabelle × Schreiber)

| Tabelle | REST-Endpoints | MQTT-Handler | Background-Services |
|---------|---------------|--------------|---------------------|
| esp_devices | esp.py, zone.py, zones.py, debug.py | HeartbeatHandler, DiscoveryHandler, LWTHandler, ZoneAckHandler, DiagnosticsHandler | MaintenanceService (health_check) |
| sensor_configs | sensors.py, sensor_type_defaults.py, debug.py | SensorDataHandler, ConfigHandler | SensorSchedulerService (READ) |
| sensor_data | sensors.py (READ), debug.py (DELETE) | SensorDataHandler | MaintenanceService (cleanup), LogicEngine (READ) |
| actuator_configs | actuators.py, debug.py | ConfigHandler | — |
| actuator_states | actuators.py, debug.py | ActuatorStatusHandler, ActuatorAlertHandler, LWTHandler | — |
| actuator_history | actuators.py (READ), debug.py (DELETE) | ActuatorStatusHandler, ActuatorResponseHandler, ActuatorAlertHandler | MaintenanceService (cleanup) |
| zones | zones.py, zone.py | ZoneAckHandler (READ) | — |
| subzone_configs | subzone.py | SubzoneAckHandler | — |
| zone_contexts | zone_context.py | — | — |
| device_active_context | device_context.py | — | — |
| device_zone_changes | zone.py | — | — |
| cross_esp_logic | logic.py | — | LogicEngine (READ + UPDATE last_triggered) |
| logic_execution_history | logic.py (READ) | — | LogicEngine (INSERT) |
| user_accounts | auth.py, users.py | — | — |
| token_blacklist | auth.py | — | — |
| notifications | notifications.py, webhooks.py | ActuatorAlertHandler | — |
| notification_preferences | notifications.py | — | — |
| email_log | notifications.py | — | — |
| audit_logs | audit.py (READ), esp.py, actuators.py | HeartbeatHandler, ActuatorStatusHandler, ActuatorResponseHandler, ConfigHandler, ErrorEventHandler, LWTHandler | — |
| dashboards | dashboards.py | — | — |
| diagnostic_reports | diagnostics.py | — | — |
| esp_heartbeat_logs | debug.py (READ), audit.py (READ) | HeartbeatHandler | MaintenanceService (cleanup) |
| kaiser_registry | kaiser.py | — | — |
| esp_ownership | — (via Kaiser) | — | — |
| library_metadata | — (leer) | — | — |
| sensor_type_defaults | sensor_type_defaults.py | — | — |
| system_config | debug.py, audit.py | — | — |
| ai_predictions | — (Stub) | — | — |
| plugin_configs | plugins.py | — | — |
| plugin_executions | plugins.py | — | — |

---

## Auth-Tier-Uebersicht

### Kein Auth (oeffentlich)

- `/v1/auth/status`, `/v1/auth/setup`, `/v1/auth/login`, `/v1/auth/login/form`, `/v1/auth/refresh`
- `/v1/health/`, `/v1/health/metrics`, `/v1/health/live`, `/v1/health/ready`
- `/v1/logs/frontend`
- `/v1/webhooks/grafana-alerts`
- `/v1/audit/event-types`, `/v1/audit/severities`, `/v1/audit/source-types`
- `/v1/subzone/devices/*/subzones` (GET), `/v1/subzone/devices/*/subzones/*` (GET) — **FINDING H1**

### ActiveUser (JWT)

Die meisten GET-Endpoints, WebSocket, eigenes Passwort, Dashboards, Notifications, Plugin-Ausfuehrung, Sequences, Diagnostics, Audit-Logs, AI-Query, Component-Export

### OperatorUser

CRUD fuer ESP, Sensor, Actuator, Zone, Subzone, Logic Rules, Zone-Zuweisung, Sensor-Type-Defaults, Device-Context

### AdminUser

User-Management, MQTT-Konfiguration, Debug-Endpoints (58!), Backups, Audit-Retention-Config, Plugin-Config, Email-Log, Notification-Broadcast

### X-API-Key (separates Auth)

Sensor Processing: `/v1/sensors/process`, `/types`, `/health`, `/calibrate`

---

## Endpoint-Zaehlung nach Router

| Router-Datei | Endpoints | Auth-Minimum |
|-------------|-----------|-------------|
| auth.py | 10 | keine/Active/Admin |
| users.py | 7 | Admin (ausser me/password) |
| health.py | 6 | keine/Active |
| esp.py | 17 | Active/Operator |
| sensors.py | 16 | Active/Operator |
| sensor_type_defaults.py | 6 | Active/Operator |
| actuators.py | 13 | Active/Operator |
| zones.py | 8 | Operator |
| zone.py | 7 | Active/Operator |
| zone_context.py | 7 | Active/Operator |
| subzone.py | 7 | keine/Operator |
| logic.py | 8 | Active/Operator |
| dashboards.py | 5 | Active |
| kaiser.py | 5 | Active/Operator |
| audit.py | 21 | keine/Active/Admin |
| diagnostics.py | 6 | Active |
| notifications.py | 15 | Active/Admin |
| plugins.py | 8 | Active/Admin |
| sequences.py | 4 | Active |
| errors.py | 4 | Active |
| logs.py | 1 | keine |
| ai.py | 1 | Active |
| backups.py | 6 | Admin |
| component_export.py | 5 | Active |
| schema_registry.py | 3 | Active |
| device_context.py | 3 | Operator |
| webhooks.py | 1 | keine |
| library.py | 0 | — (leer) |
| debug.py | 58 | Admin |
| sensor_processing.py | 4 | API-Key |
| websocket/realtime.py | 1 (WS) | JWT |
| **TOTAL** | **263** | |

---

*Bericht erstellt am 2026-03-24. Reine Analyse — kein Code geaendert.*
