# SQLAlchemy-Modelle ↔ PostgreSQL-Tabellen (Kernmatrix)

> **Pflege:** Bei neuen Tabellen Modell-Zeile + Alembic-Rev ergänzen. Keine parallele Schema-Doku — Alembic + `src/db/models/` bleiben maßgeblich.  
> **Evidence:** `__tablename__` per `grep __tablename__ src/db/models/`; Constraints in den jeweiligen `*.py`-Modellen und unter `alembic/versions/`.

| Modellklasse (Datei) | Tabelle | Wichtigste Constraints / Hinweise |
|----------------------|---------|-----------------------------------|
| `ESPDevice` (`esp.py`) | `esp_devices` | `device_id` unique; **`hardware_type` VARCHAR(50) NOT NULL** (`ESP32_WROOM`, `ESP32_S3_DEVKITC1`, `XIAO_ESP32_C3`, ggf. `MOCK_ESP32`); kein `board_type`; `zone_id` → `zones.zone_id` (SET NULL); Soft-Delete u. a. `deleted_at` (Modell `esp.py`); S3-Erweiterung AUT-525 = Applikationscode only, **keine Alembic-Rev** |
| `SensorConfig` (`sensor.py`) | `sensor_configs` | FK `esp_id` → `esp_devices.id` CASCADE; FK `temp_sensor_config_id` → `sensor_configs.id` SET NULL; kein UNIQUE-Constraint (wurde in `fix_null_coalesce_unique` umgebaut); `sensor_kind` CHECK ('continuous','snapshot'); `device_scope` CHECK; `measurement_freshness_hours`, `calibration_interval_days` |
| `SensorData` (`sensor.py`) | `sensor_data` | FK `esp_id` → `esp_devices.id` ON DELETE SET NULL; **UNIQUE** `uq_sensor_data_esp_gpio_type_timestamp` (`esp_id`, `gpio`, `sensor_type`, `timestamp`); `zone_id` / `subzone_id` Messzeitpunkt |
| `ActuatorConfig` (`actuator.py`) | `actuator_configs` | FK → `esp_devices` CASCADE |
| `ActuatorState` (`actuator.py`) | `actuator_states` | Kanonische `state`-Strings laut `ActuatorRepository`: `on`, `off`, `pwm`, `unknown`, `error`, `emergency_stop` |
| `ActuatorHistory` (`actuator.py`) | `actuator_history` | Zeitreihe Befehle/Events |
| `Zone` (`zone.py`) | `zones` | `zone_id` UNIQUE; `status`; `deleted_at` / `deleted_by` Soft-Delete |
| `SubzoneConfig` (`subzone.py`) | `subzone_configs` | **`esp_id` = `esp_devices.device_id` (String)**, nicht UUID-PK; `assigned_gpios` JSON; `UniqueConstraint("esp_id","subzone_id", name="uq_esp_subzone")` |
| `DeviceZoneChange` (`device_zone_change.py`) | `device_zone_changes` | Audit Geräte-Zonenwechsel (T13-R1) |
| `DeviceActiveContext` (`device_context.py`) | `device_active_context` | Aktiver Zone/Subzone-Kontext pro Config |
| `CrossESPLogic` / `LogicExecutionHistory` / `LogicHysteresisState` (`logic.py`) | `cross_esp_logic`, `logic_execution_history`, `logic_hysteresis_states` | Rules + Hysterese-Persistenz |
| `ESPHeartbeatLog` (`esp_heartbeat.py`) | `esp_heartbeat_logs` | Time-Series; mehrere Indizes |
| `AuditLog` (`audit_log.py`) | `audit_logs` | Globales Audit |
| `UserAccount` (`user.py`) | `user_accounts` | Auth |
| `TokenBlacklistEntry` (`auth.py`) | `token_blacklist` | JWT-Blacklist |
| `Notification` / `NotificationPreferences` (`notification.py`) | `notifications`, `notification_preferences` | |
| `PluginConfig` / `PluginExecution` (`plugin.py`) | `plugin_configs`, `plugin_executions` | |
| `Dashboard` (`dashboard.py`) | `dashboards` | FK User CASCADE |
| `DiagnosticReport` (`diagnostic.py`) | `diagnostic_reports` | |
| `EmailLog` (`email_log.py`) | `email_log` | |
| `SystemConfig` (`system.py`) | `system_config` | |
| `SensorTypeDefault` (`sensor_type_defaults.py`) | `sensor_type_defaults` | |
| `KaiserRegistry` / `ESPOwnership` (`kaiser.py`) | `kaiser_registry`, `esp_ownership` | |
| `AIPrediction` (`ai.py`) | `ai_predictions` | |
| `ZoneContext` (`zone_context.py`) | `zone_contexts` | |
| `CommandIntent` / `CommandOutcome` (`command_contract.py`) | `command_intents`, `command_outcomes` | Intent-Dedup ON CONFLICT |
| `LibraryMetadata` (`library.py`) | `library_metadata` | |
| `CalibrationSession` (`calibration_session.py`) | `calibration_sessions` | FK `sensor_config_id` → `sensor_configs.id` ON DELETE SET NULL; `session_metadata` JSON (AUT-299) |
| `ApiKey` (`api_key.py`) | `api_keys` | `key_hash` UNIQUE; `owner_type`/`owner_id`; `scopes` JSON; `revoked_at` nullable |
| `Plant` (`plant.py`) | `plants` | FK `subzone_id` → `subzone_configs.id` SET NULL; `qr_code` UNIQUE; Soft-Delete `deleted_at`; `phase` |
| `PlantCannabisExtension` (`plant.py`) | `plants_cannabis_extension` | FK `plant_id` → `plants.plant_id` RESTRICT; UNIQUE `plant_id`; Erntedaten, Laboranalyse |
| `PlantLifecycleEvent` (`plant.py`) | `plant_lifecycle_events` | FK `plant_id` → `plants.plant_id` RESTRICT; FK `created_by_user` → `user_accounts.id` RESTRICT |

### Alembic HEAD (Repo-Datei, immer live verifizieren)

Aktueller HEAD (verifiziert 2026-05-29): `aut299_cal_session_metadata` — **38** Tabellen (`grep __tablename__ src/db/models/`)  
**Immer** lokal verifizieren: `docker exec automationone-server python -m alembic heads` und abgleichen mit `SELECT version_num FROM alembic_version`.
