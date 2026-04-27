# E6 — Datenbank-Schema und Migrations-Historie

**Modus:** B (Analyse + Dokumentation)
**Basis:** Verifiziert gegen `src/db/models/` (28 Modell-Dateien) und `alembic/versions/` (60 Migrationen)
**Stand:** 2026-04-26

---

## 1. Überblick

| Aspekt | Wert |
|--------|------|
| Datenbank | PostgreSQL 15 (Docker: `postgres`) |
| ORM | SQLAlchemy 2.0 (Mapped, mapped_column, DeclarativeBase) |
| Migrationen | Alembic — 60 Revisionsdateien, 4 Merge-Points |
| Basis-Klassen | `Base(DeclarativeBase)`, `TimestampMixin` (created_at, updated_at) |
| Tatsächliche Tabellen | **34** (aus `__tablename__`-Inventar; siehe Abschnitt 2) |
| Soft-Delete | Nur `esp_devices` und `zones` — alle anderen hard-delete |
| Zeitzonen | Alle `DateTime`-Spalten haben `timezone=True` (Konvention seit Migrationswelle fix_datetime_timezone_naive) |

> [!INKONSISTENZ] Tabellenzahl: E0-Annahme 32, tatsächlich 34
>
> **Beobachtung:** Die Etappe E0 geht von "32 Tabellen" aus. Das `__tablename__`-Inventar der aktuellen Modell-Dateien ergibt 34 verschiedene Tabellennamen. Mögliche Erklärung: Zwei Tabellen (`command_intents`, `command_outcomes`) wurden nach dem E0-Zähldatum hinzugefügt (Migration `add_command_intent_outcome_contract`).
>
> **Korrekte Stelle:** Dieses Dokument, Abschnitt 2
> **Empfehlung:** E0-Basis auf 34 Tabellen korrigieren (oder auf tatsächliche DB prüfen per `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`)
> **Erst-Erkennung:** E6, 2026-04-26

### Alembic-Konfiguration (`alembic/env.py`)

- Async-Modus: `async_engine_from_config` + `asyncpg`
- Session: `pool.NullPool` (keine Verbindungspool-Haltung während Migrationen)
- Bootstrap: Leere DB wird per `target_metadata.create_all()` initialisiert, dann Head gestampt (Legacy-Kompatibilität — keine vollständige Basis-Migration)
- Importierte Modell-Module: `actuator`, `ai`, `auth`, `calibration_session`, `esp`, `kaiser`, `library`, `logic`, `sensor`, `system`, `user` — plus implizit alle referenzierten Module

**Anmerkung:** Die Module `notification`, `dashboard`, `plugin`, `diagnostic`, `device_context`, `device_zone_change`, `subzone`, `zone`, `zone_context`, `command_contract`, `sensor_type_defaults`, `audit_log`, `esp_heartbeat` sind in `env.py` nicht explizit importiert. Sie werden über `__init__.py` oder indirekte Referenzen geladen.

> [!ANNAHME] Die nicht explizit in `env.py` gelisteten Modell-Module werden über `from src.db.models import (...)` in `__init__.py` oder durch SQLAlchemy-Registrierung beim Import geladen. Ohne vollständige `__init__.py`-Analyse ist dies eine Annahme.

---

## 2. Vollständiges Tabellen-Schema

### 2.1 Kern-Tabellen: ESP-Geräte, Sensoren, Aktoren

#### `esp_devices` — Modell: `ESPDevice`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| device_id | String(50) | Nein | UNIQUE, indexed |
| name | String(100) | Ja | |
| zone_id | String(50) | Ja | FK → `zones.zone_id` ON DELETE SET NULL, indexed |
| zone_name | String(100) | Ja | Denormalisiert |
| master_zone_id | String(50) | Ja | indexed |
| is_zone_master | Boolean | Nein | default=False |
| kaiser_id | String(50) | Ja | indexed |
| hardware_type | String(50) | Nein | z.B. ESP32_WROOM |
| ip_address | String(45) | Ja | |
| mac_address | String(17) | Ja | UNIQUE |
| firmware_version | String(20) | Ja | |
| capabilities | JSON | Nein | max_sensors, max_actuators, features |
| status | String(20) | Nein | online/offline/error/pending_approval/approved/rejected |
| last_seen | DateTime(tz) | Ja | indexed |
| health_status | String(20) | Ja | healthy/degraded/unhealthy/critical |
| discovered_at | DateTime(tz) | Ja | |
| approved_at | DateTime(tz) | Ja | |
| approved_by | String(100) | Ja | |
| rejection_reason | String(500) | Ja | |
| last_rejection_at | DateTime(tz) | Ja | |
| device_metadata | JSON | Nein | simulation_config, system_state etc. |
| alert_config | JSON | Ja | alerts_enabled, suppression_reason/until |
| deleted_at | DateTime(tz) | Ja | Soft-Delete, indexed |
| deleted_by | String(64) | Ja | |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Beziehungen:** `sensors` (cascade=all,delete-orphan), `actuators` (cascade=all,delete-orphan), `subzones` (cascade=all,delete-orphan)

#### `sensor_configs` — Modell: `SensorConfig`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | UUID | Nein | FK → `esp_devices.id` ON DELETE CASCADE, indexed |
| gpio | Integer | Ja | Nullable für I2C/OneWire |
| sensor_type | String(50) | Nein | indexed |
| sensor_name | String(100) | Nein | |
| interface_type | String(20) | Nein | ANALOG/I2C/ONEWIRE/DIGITAL/VIRTUAL |
| i2c_address | Integer | Ja | indexed |
| onewire_address | String(32) | Ja | |
| provides_values | JSON | Ja | Multi-Value: ['sht31_temp', 'sht31_humidity'] |
| enabled | Boolean | Nein | |
| pi_enhanced | Boolean | Nein | |
| sample_interval_ms | Integer | Nein | default=1000 |
| calibration_data | JSON | Ja | |
| thresholds | JSON | Ja | |
| sensor_metadata | JSON | Nein | |
| alert_config | JSON | Ja | |
| runtime_stats | JSON | Ja | |
| operating_mode | String(20) | Ja | NULL = Type-Default nutzen |
| timeout_seconds | Integer | Ja | NULL = Type-Default |
| timeout_warning_enabled | Boolean | Ja | NULL = Type-Default |
| schedule_config | JSON | Ja | |
| last_manual_request | DateTime(tz) | Ja | |
| measurement_freshness_hours | Integer | Ja | NULL = Type-Default |
| calibration_interval_days | Integer | Ja | NULL = Type-Default |
| device_scope | String(20) | Nein | zone_local/multi_zone/mobile |
| assigned_zones | JSON | Ja | |
| assigned_subzones | JSON | Ja | |
| config_status | String(20) | Ja | pending/applied/failed |
| config_error | String(50) | Ja | |
| config_error_detail | String(200) | Ja | |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Index:** `idx_sensor_type_enabled` (sensor_type, enabled)
**Unique Constraint:** Expression-Index `unique_esp_gpio_sensor_interface_v2` via `COALESCE(onewire_address, ''), COALESCE(i2c_address::text, '')` — NULL-sicher (V19-F02+F13)

#### `actuator_configs` — Modell: `ActuatorConfig`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | UUID | Nein | FK → `esp_devices.id` ON DELETE CASCADE |
| gpio | Integer | Nein | |
| actuator_type | String(50) | Nein | Server-normalisiert: digital/pwm/servo |
| hardware_type | String(50) | Ja | Original ESP32-Typ: relay/pump/valve/pwm |
| actuator_name | String(100) | Nein | |
| enabled | Boolean | Nein | |
| min_value | Float | Nein | default=0.0 |
| max_value | Float | Nein | default=1.0 |
| default_value | Float | Nein | default=0.0 |
| timeout_seconds | Integer | Ja | Auto-Shutoff |
| safety_constraints | JSON | Ja | max_runtime, cooldown_period |
| actuator_metadata | JSON | Nein | |
| alert_config | JSON | Ja | |
| runtime_stats | JSON | Ja | |
| device_scope | String(20) | Nein | zone_local/multi_zone/mobile |
| assigned_zones | JSON | Ja | |
| assigned_subzones | JSON | Ja | |
| config_status | String(20) | Ja | pending/applied/failed |
| config_error | String(50) | Ja | |
| config_error_detail | String(200) | Ja | |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Unique Constraint:** `unique_esp_gpio_actuator` (esp_id, gpio)

#### `actuator_states` — Modell: `ActuatorState`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | UUID | Ja | FK → `esp_devices.id` ON DELETE SET NULL |
| gpio | Integer | Nein | |
| actuator_type | String(50) | Nein | |
| current_value | Float | Nein | |
| target_value | Float | Ja | |
| state | String(20) | Nein | on/off/pwm/error/emergency_stop/unknown |
| last_command_timestamp | DateTime(tz) | Ja | |
| runtime_seconds | Integer | Nein | default=0 |
| last_command | String(50) | Ja | |
| error_message | String(500) | Ja | |
| state_metadata | JSON | Ja | |
| data_source | String(20) | Nein | production/mock/test/simulation |

**Kein TimestampMixin** (Performance-Entscheidung). **Indexes:** idx_esp_gpio_state, idx_actuator_state, idx_esp_state

#### `actuator_history` — Modell: `ActuatorHistory`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | UUID | Ja | FK → `esp_devices.id` ON DELETE SET NULL |
| gpio | Integer | Nein | |
| actuator_type | String(50) | Nein | |
| command_type | String(50) | Nein | set/stop/emergency_stop |
| value | Float | Ja | |
| issued_by | String(100) | Ja | user:123, logic:456, system |
| success | Boolean | Nein | |
| error_message | String(500) | Ja | |
| timestamp | DateTime(tz) | Nein | indexed |
| command_metadata | JSON | Ja | |
| data_source | String(20) | Nein | |

**Time-Series Indexes:** idx_esp_gpio_timestamp_hist, idx_command_type_timestamp, idx_timestamp_desc_hist, idx_success_timestamp, idx_actuator_data_source_timestamp

---

### 2.2 Zonen und Subzonen

#### `zones` — Modell: `Zone`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| zone_id | String(50) | Nein | UNIQUE, indexed — Single Source of Truth |
| name | String(100) | Nein | |
| description | String(500) | Ja | |
| status | String(20) | Nein | active/archived/deleted, indexed |
| deleted_at | DateTime(tz) | Ja | Soft-Delete |
| deleted_by | String(64) | Ja | |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Kein Cascade:** `zones` hat keine ORM-Relationship zu `subzone_configs` — verwaiste Subzones nach Zone-Soft-Delete sind eine bekannte Inkonsistenz (siehe Abschnitt 8).

#### `subzone_configs` — Modell: `SubzoneConfig`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | String(50) | Nein | FK → `esp_devices.device_id` ON DELETE CASCADE |
| subzone_id | String(50) | Nein | indexed |
| subzone_name | String(100) | Ja | |
| parent_zone_id | String(50) | Nein | indexed (nicht FK — Inkonsistenz, s. Abschnitt 8) |
| assigned_gpios | JSON | Nein | Array of GPIO numbers |
| assigned_sensor_config_ids | JSON | Nein | UUIDs für I2C-Sensoren (gpio=0) |
| is_active | Boolean | Nein | default=True |
| safe_mode_active | Boolean | Nein | default=True |
| sensor_count | Integer | Nein | default=0 |
| actuator_count | Integer | Nein | default=0 |
| custom_data | JSONB | Nein | Pflanzeninfo, Material, Notizen |
| last_ack_at | DateTime(tz) | Ja | |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Unique Constraint:** `uq_esp_subzone` (esp_id, subzone_id)

**Wichtig:** FK auf `esp_devices.device_id` (String-Key), nicht auf `esp_devices.id` (UUID). Dies ist eine bewusste Design-Entscheidung für Lesbarkeit.

#### `zone_contexts` — Modell: `ZoneContext`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | Integer (PK, autoincrement) | Nein | |
| zone_id | String(50) | Nein | UNIQUE, indexed — kein FK |
| zone_name | String(100) | Ja | Cached |
| plant_count | Integer | Ja | |
| variety | String(200) | Ja | |
| substrate | String(200) | Ja | |
| growth_phase | String(50) | Ja | seedling/vegetative/flower_week_N |
| planted_date | Date | Ja | |
| expected_harvest | Date | Ja | |
| responsible_person | String(100) | Ja | |
| work_hours_weekly | Float | Ja | |
| notes | Text | Ja | |
| custom_data | JSONB | Nein | |
| cycle_history | JSONB | Nein | Array archivierter Anbauzyklen |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Hinweis:** `zone_id` ist kein FK zu `zones.zone_id` — Applikations-Level-Konsistenz.

#### `device_zone_changes` — Modell: `DeviceZoneChange`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | String(50) | Nein | indexed — kein FK |
| old_zone_id | String(50) | Ja | |
| new_zone_id | String(50) | Nein | |
| subzone_strategy | String(20) | Nein | transfer/copy/reset |
| affected_subzones | JSON | Ja | [{subzone_id, old_parent, new_parent}] |
| change_type | String(20) | Nein | zone_switch/context_change/scope_change/zones_update |
| changed_by | String(100) | Nein | Username oder 'system' |
| changed_at | DateTime(tz) | Nein | |

**Kein TimestampMixin.** Reine Audit-Tabelle.

#### `device_active_context` — Modell: `DeviceActiveContext`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| config_type | String(20) | Nein | sensor/actuator |
| config_id | UUID | Nein | Applikations-Level FK zu sensor_configs/actuator_configs |
| active_zone_id | String(50) | Ja | |
| active_subzone_id | String(50) | Ja | |
| context_source | String(20) | Nein | manual/sequence/mqtt |
| context_since | DateTime(tz) | Nein | |
| updated_at | DateTime(tz) | Nein | |

**Unique Constraint:** `unique_device_active_context` (config_type, config_id)
**Kein FK** auf sensor_configs/actuator_configs — application-level enforcement.

---

### 2.3 Nutzer und Auth

#### `user_accounts` — Modell: `User`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | Integer (PK, autoincrement) | Nein | |
| username | String(50) | Nein | UNIQUE, indexed |
| email | String(100) | Nein | UNIQUE, indexed |
| password_hash | String(255) | Nein | Bcrypt |
| role | String(20) | Nein | admin/operator/viewer |
| is_active | Boolean | Nein | default=True |
| full_name | String(100) | Ja | |
| token_version | Integer | Nein | default=0, für Logout-All |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

> [!INKONSISTENZ] I3: Tabellenname-Drift user_accounts vs. users
>
> **Beobachtung:** Ältere Dokumentation (E0, allgemeine Beschreibungen) nennt die Tabelle "users". Der tatsächliche `__tablename__` ist `user_accounts`. Weitere betroffene Fälle: `esp_heartbeat_logs` (nicht `heartbeat_logs`). Vollständige Drift-Liste: `user_accounts` statt `users`, `esp_heartbeat_logs` statt `heartbeat_logs`.
>
> **Korrekte Stelle:** `src/db/models/user.py` Z. 30, `src/db/models/esp_heartbeat.py` Z. 59
> **Empfehlung:** Alle Dokumentationsreferenzen auf tatsächliche `__tablename__`-Werte aktualisieren
> **Erst-Erkennung:** E6, 2026-04-26 (Bestätigung vorheriger E0-Beobachtung)

#### `token_blacklist` — Modell: `TokenBlacklist`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | Integer (PK, autoincrement) | Nein | |
| token_hash | String(64) | Nein | UNIQUE, indexed — SHA256 |
| token_type | String(20) | Nein | access/refresh |
| user_id | Integer | Nein | indexed — kein FK (bewusst, für Cleanup) |
| expires_at | DateTime(tz) | Nein | indexed |
| blacklisted_at | DateTime(tz) | Nein | |
| reason | String(50) | Ja | logout/security/password_change |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Composite Index:** idx_blacklist_expires_at_user (expires_at, user_id) — für Cleanup-Jobs.

---

### 2.4 Time-Series: sensor_data und esp_heartbeat_logs

#### `sensor_data` — Modell: `SensorData`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | UUID | Ja | FK → `esp_devices.id` ON DELETE **SET NULL** — Daten bleiben nach Gerätlöschung |
| gpio | Integer | Nein | |
| sensor_type | String(50) | Nein | |
| raw_value | Float | Nein | |
| processed_value | Float | Ja | |
| unit | String(20) | Ja | °C, %, pH, mS/cm, etc. |
| processing_mode | String(20) | Nein | pi_enhanced/local/raw |
| quality | String(20) | Ja | good/fair/poor/error |
| timestamp | DateTime(tz) | Nein | indexed |
| sensor_metadata | JSON | Ja | |
| data_source | String(20) | Nein | production/mock/test/simulation |
| zone_id | String(50) | Ja | indexed — Snapshot bei Messzeitpunkt |
| subzone_id | String(50) | Ja | indexed — Snapshot bei Messzeitpunkt |
| device_name | String(128) | Ja | Denormalisiert, Snapshot |

**Unique Constraint:** `uq_sensor_data_esp_gpio_type_timestamp` (esp_id, gpio, sensor_type, timestamp)
**Hinweis:** NULL-Zeilen (nach Soft-Delete) fallen nicht unter den Unique Constraint (NULL != NULL in UNIQUE).

**Time-Series Indexes:**
- `idx_esp_gpio_timestamp` (esp_id, gpio, timestamp)
- `idx_sensor_type_timestamp` (sensor_type, timestamp)
- `idx_timestamp_desc` (timestamp DESC)
- `idx_data_source_timestamp` (data_source, timestamp)

**Partitionierung:** Keine native PostgreSQL-Partitionierung. Retention via Maintenance-Job `cleanup_sensor_data` (Daily 03:00, konfigurierbar via `SENSOR_DATA_RETENTION_ENABLED`).

#### `esp_heartbeat_logs` — Modell: `ESPHeartbeatLog`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | UUID | Ja | FK → `esp_devices.id` ON DELETE **SET NULL** |
| device_id | String(50) | Nein | Denormalisiert, indexed |
| timestamp | DateTime(tz) | Nein | indexed |
| heap_free | Integer | Nein | Bytes |
| wifi_rssi | Integer | Nein | dBm |
| uptime | Integer | Nein | Sekunden |
| sensor_count | Integer | Nein | default=0 |
| actuator_count | Integer | Nein | default=0 |
| gpio_reserved_count | Integer | Ja | default=0 |
| data_source | String(20) | Nein | production/mock/test |
| health_status | String(20) | Nein | healthy/degraded/critical |
| runtime_telemetry | JSONB | Ja | Firmware-Telemetrie: persistence_degraded, network_degraded, etc. |

**Kein TimestampMixin** (Performance).
**Retention:** Standard 7 Tage via `HeartbeatLogCleanup`-Job.

**Time-Series Indexes:**
- `idx_heartbeat_esp_timestamp` (esp_id, timestamp)
- `idx_heartbeat_device_timestamp` (device_id, timestamp)
- `idx_heartbeat_timestamp_desc` (timestamp btree)
- `idx_heartbeat_data_source_timestamp` (data_source, timestamp)
- `idx_heartbeat_health_status` (health_status, timestamp)

---

### 2.5 Logs und Notifications

#### `notifications` — Modell: `Notification`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| user_id | Integer | Nein | FK → `user_accounts.id` ON DELETE CASCADE |
| channel | String(20) | Nein | websocket/email/webhook |
| severity | String(20) | Nein | critical/warning/info |
| category | String(50) | Nein | connectivity/data_quality/infrastructure/lifecycle/maintenance/security |
| title | String(255) | Nein | |
| body | Text | Ja | |
| extra_data | JSONB | Nein | esp_id, sensor_type, rule_id, etc. |
| source | String(50) | Nein | logic_engine/mqtt_handler/grafana/sensor_threshold/device_event/manual/system |
| is_read | Boolean | Nein | default=False |
| is_archived | Boolean | Nein | default=False |
| digest_sent | Boolean | Nein | default=False |
| parent_notification_id | UUID | Ja | FK → `notifications.id` ON DELETE SET NULL (Selbstreferenz) |
| fingerprint | String(64) | Ja | FIX-07: Grafana-Dedup |
| read_at | DateTime(tz) | Ja | |
| status | String(20) | Nein | active/acknowledged/resolved |
| acknowledged_at | DateTime(tz) | Ja | |
| acknowledged_by | Integer | Ja | FK → `user_accounts.id` ON DELETE SET NULL |
| resolved_at | DateTime(tz) | Ja | |
| correlation_id | String(128) | Ja | Gruppierung verwandter Alerts |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Partial Unique Index:** `ix_notifications_fingerprint_unique` (fingerprint) WHERE fingerprint IS NOT NULL

> [!INKONSISTENZ] E3 (neu): notifications fehlt device_id FK-Spalte
>
> **Beobachtung:** Der E0-Basis-Kontext erwähnt eine Inkonsistenz in `notification_logs` (fehlende `device_id`-Spalte als FK, nur `esp_uuid` als String). Es gibt jedoch **keine** Tabelle `notification_logs` im Codebase — diese Tabelle existiert nicht. Die korrekte Tabelle heißt `notifications`. In `notifications.extra_data` (JSONB) können `esp_id`-Angaben als freier String gespeichert werden, aber es gibt keinen formellen FK zu `esp_devices`. Die E0-Beschreibung beschreibt vermutlich `notifications.extra_data` und nicht eine eigene Spalte.
>
> **Korrekte Stelle:** `src/db/models/notification.py` — `extra_data` (JSONB)
> **Empfehlung:** E0-Inkonsistenz I3 auf `notifications.extra_data` (kein FK zu esp_devices) präzisieren; Tabellenname `notification_logs` in E0 korrigieren zu `notifications`
> **Erst-Erkennung:** E6, 2026-04-26

#### `notification_preferences` — Modell: `NotificationPreferences`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| user_id | Integer (PK) | Nein | FK → `user_accounts.id` ON DELETE CASCADE — 1:1 |
| websocket_enabled | Boolean | Nein | default=True |
| email_enabled | Boolean | Nein | default=False |
| email_address | String(255) | Ja | Override-Email |
| email_severities | JSON | Nein | default=['critical','warning'] |
| quiet_hours_enabled | Boolean | Nein | default=False |
| quiet_hours_start | String(5) | Ja | HH:MM format |
| quiet_hours_end | String(5) | Ja | HH:MM format |
| digest_interval_minutes | Integer | Nein | 0 = disabled |
| browser_notifications | Boolean | Nein | default=False |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `email_log` — Modell: `EmailLog`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| notification_id | UUID | Ja | FK → `notifications.id` ON DELETE SET NULL |
| to_address | String(255) | Nein | |
| subject | String(500) | Nein | |
| template | String(100) | Ja | alert_critical/alert_digest/test |
| provider | String(50) | Nein | resend/smtp |
| status | String(50) | Nein | pending/sent/failed/permanently_failed |
| sent_at | DateTime(tz) | Ja | |
| error_message | Text | Ja | |
| retry_count | Integer | Nein | default=0 |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `audit_logs` — Modell: `AuditLog`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| event_type | String(50) | Nein | indexed |
| severity | String(20) | Nein | info/warning/error/critical, indexed |
| source_type | String(30) | Nein | esp32/user/system/api/mqtt, indexed |
| source_id | String(100) | Ja | indexed |
| status | String(50) | Nein | success/failed/pending/lifecycle-event, indexed |
| message | Text | Ja | |
| details | JSON | Nein | |
| error_code | String(50) | Ja | indexed |
| error_description | Text | Ja | |
| ip_address | String(45) | Ja | |
| user_agent | String(500) | Ja | |
| correlation_id | String(100) | Ja | indexed |
| request_id | String(255) | Ja | indexed — VARCHAR(255) für MQTT-IDs |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Hinweis:** Keine FKs — Audit-Einträge sind immutable, kein Cascade-Delete.

---

### 2.6 Logic Engine

#### `cross_esp_logic` — Modell: `CrossESPLogic`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| rule_name | String(100) | Nein | UNIQUE, indexed |
| description | Text | Ja | |
| enabled | Boolean | Nein | indexed |
| trigger_conditions | JSON | Nein | Liste oder Dict von Bedingungen |
| logic_operator | String(3) | Nein | AND/OR |
| actions | JSON | Nein | Liste von Aktions-Dicts |
| priority | Integer | Nein | default=100, niedriger = höhere Priorität |
| cooldown_seconds | Integer | Ja | |
| max_executions_per_hour | Integer | Ja | |
| last_triggered | DateTime(tz) | Ja | |
| rule_metadata | JSON | Nein | |
| is_critical | Boolean | Nein | default=False — AUT-111 |
| escalation_policy | JSON | Ja | notify, retry_interval_s, max_retries, failover_actions |
| degraded_since | DateTime(tz) | Ja | |
| degraded_reason | String(64) | Ja | z.B. 'target_esp_offline:ESP_AABB' |
| created_at | DateTime(tz) | Nein | TimestampMixin |
| updated_at | DateTime(tz) | Nein | TimestampMixin |

**Partial Index:** `idx_rule_degraded_critical` (is_critical, degraded_since) WHERE degraded_since IS NOT NULL

#### `logic_execution_history` — Modell: `LogicExecutionHistory`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| logic_rule_id | UUID | Nein | FK → `cross_esp_logic.id` ON DELETE CASCADE |
| trigger_data | JSON | Nein | Sensor-Snapshot |
| actions_executed | JSON | Nein | |
| success | Boolean | Nein | |
| error_message | String(500) | Ja | |
| execution_time_ms | Integer | Nein | |
| timestamp | DateTime(tz) | Nein | indexed |
| execution_metadata | JSON | Ja | |

**Kein TimestampMixin.**

#### `logic_hysteresis_states` — Modell: `LogicHysteresisState`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | Integer (PK, autoincrement) | Nein | |
| rule_id | UUID | Nein | FK → `cross_esp_logic.id` ON DELETE CASCADE |
| condition_index | Integer | Nein | default=0 |
| is_active | Boolean | Nein | default=False |
| last_value | Float | Ja | |
| last_activation | DateTime(tz) | Ja | |
| last_deactivation | DateTime(tz) | Ja | |
| updated_at | DateTime(tz) | Nein | |

**Unique Constraint:** `uq_hysteresis_state_rule_cond` (rule_id, condition_index)

---

### 2.7 Weitere Tabellen

#### `sensor_type_defaults` — Modell: `SensorTypeDefaults`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| sensor_type | String(50) | Nein | UNIQUE, indexed |
| operating_mode | String(20) | Nein | continuous/on_demand/scheduled/paused |
| measurement_interval_seconds | Integer | Nein | default=30 |
| timeout_seconds | Integer | Nein | default=180 |
| timeout_warning_enabled | Boolean | Nein | default=True |
| supports_on_demand | Boolean | Nein | default=False |
| description | Text | Ja | |
| schedule_config | JSON | Ja | |
| measurement_freshness_hours | Integer | Ja | |
| calibration_interval_days | Integer | Ja | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `calibration_sessions` — Modell: `CalibrationSession`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| esp_id | String(24) | Nein | Denormalisiert |
| gpio | Integer | Nein | |
| sensor_type | String(50) | Nein | |
| sensor_config_id | UUID | Ja | FK → `sensor_configs.id` ON DELETE SET NULL |
| status | Enum | Nein | PENDING/COLLECTING/FINALIZING/APPLIED/REJECTED/EXPIRED/FAILED |
| method | String(30) | Nein | linear_2point/ph_2point/ec_1point etc. |
| expected_points | Integer | Nein | default=2 |
| calibration_points | JSONB | Ja | [{raw, reference, quality, timestamp, point_role}] |
| calibration_result | JSONB | Ja | {slope, offset, type} |
| correlation_id | String(64) | Ja | MQTT-Tracking |
| initiated_by | String(100) | Ja | |
| completed_at | DateTime(tz) | Ja | |
| failure_reason | Text | Ja | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `plugin_configs` — Modell: `PluginConfig`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| plugin_id | String(100) (PK) | Nein | String-PK |
| display_name | String(255) | Nein | |
| description | Text | Ja | |
| category | String(50) | Ja | |
| is_enabled | Boolean | Nein | server_default=true |
| config | JSON | Nein | |
| config_schema | JSON | Nein | |
| capabilities | JSON | Ja | |
| schedule | String(100) | Ja | Cron-Expression |
| created_by | Integer | Ja | FK → `user_accounts.id` ON DELETE SET NULL |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `plugin_executions` — Modell: `PluginExecution`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| plugin_id | String(100) | Nein | FK → `plugin_configs.plugin_id` ON DELETE CASCADE |
| started_at | DateTime(tz) | Nein | indexed |
| finished_at | DateTime(tz) | Ja | |
| status | String(20) | Nein | server_default=running |
| triggered_by | String(50) | Ja | |
| triggered_by_user | Integer | Ja | FK → `user_accounts.id` ON DELETE SET NULL |
| triggered_by_rule | UUID | Ja | |
| result | JSON | Ja | |
| error_message | Text | Ja | |
| duration_seconds | Float | Ja | |

**Kein TimestampMixin.**

#### `diagnostic_reports` — Modell: `DiagnosticReport`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| overall_status | String(20) | Nein | |
| started_at | DateTime(tz) | Nein | |
| finished_at | DateTime(tz) | Nein | |
| duration_seconds | Float | Ja | |
| checks | JSON | Ja | Nullable (make_diagnostic_checks_nullable Migration) |
| summary | Text | Ja | |
| triggered_by | String(50) | Nein | manual/scheduled |
| triggered_by_user | Integer | Ja | FK → `user_accounts.id` ON DELETE SET NULL |
| exported_at | DateTime(tz) | Ja | |
| export_path | Text | Ja | |

**Kein TimestampMixin.**

#### `dashboards` — Modell: `Dashboard`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| name | String(200) | Nein | |
| description | Text | Ja | |
| owner_id | Integer | Nein | FK → `user_accounts.id` ON DELETE CASCADE |
| is_shared | Boolean | Nein | default=False |
| widgets | JSON | Nein | Array: {id, type, x, y, w, h, config} |
| scope | String(20) | Ja | zone/cross-zone/sensor-detail |
| zone_id | String(100) | Ja | |
| auto_generated | Boolean | Nein | default=False |
| sensor_id | String(100) | Ja | |
| target | JSON | Ja | {view, placement, anchor, panelPosition} |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `ai_predictions` — Modell: `AIPredictions`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| prediction_type | String(50) | Nein | anomaly_detection/resource_optimization/failure_prediction |
| target_esp_id | UUID | Ja | FK → `esp_devices.id` ON DELETE SET NULL |
| target_zone_id | String(50) | Ja | |
| input_data | JSON | Nein | |
| prediction_result | JSON | Nein | |
| confidence_score | Float | Nein | 0.0–1.0 |
| model_version | String(20) | Nein | |
| timestamp | DateTime(tz) | Nein | indexed |
| prediction_metadata | JSON | Ja | |

**Kein TimestampMixin.**

#### `kaiser_registry` — Modell: `KaiserRegistry`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| kaiser_id | String(50) | Nein | UNIQUE, indexed |
| ip_address | String(45) | Ja | |
| mac_address | String(17) | Ja | UNIQUE |
| zone_ids | JSON | Nein | |
| status | String(20) | Nein | online/offline/error/unknown |
| last_seen | DateTime(tz) | Ja | |
| capabilities | JSON | Nein | |
| kaiser_metadata | JSON | Nein | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `esp_ownership` — Modell: `ESPOwnership`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| kaiser_id | UUID | Nein | FK → `kaiser_registry.id` ON DELETE CASCADE |
| esp_id | UUID | Nein | FK → `esp_devices.id` ON DELETE CASCADE |
| assigned_at | DateTime(tz) | Nein | |
| priority | Integer | Nein | default=100 |
| ownership_metadata | JSON | Nein | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

**Unique Constraint:** `unique_kaiser_esp_ownership` (kaiser_id, esp_id)

#### `library_metadata` — Modell: `LibraryMetadata`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| library_name | String(100) | Nein | UNIQUE, indexed |
| library_type | String(50) | Nein | sensor_library/actuator_library/firmware |
| version | String(20) | Nein | |
| description | Text | Ja | |
| file_path | String(500) | Nein | |
| file_hash | String(64) | Nein | SHA256 |
| file_size_bytes | Integer | Nein | |
| compatible_hardware | JSON | Nein | |
| dependencies | JSON | Ja | |
| enabled | Boolean | Nein | |
| library_metadata | JSON | Nein | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `system_config` — Modell: `SystemConfig`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| config_key | String(100) | Nein | UNIQUE, indexed |
| config_value | JSON | Nein | |
| config_type | String(50) | Nein | mqtt/database/api/pi_enhanced/security |
| description | Text | Ja | |
| is_secret | Boolean | Nein | default=False |
| system_metadata | JSON | Nein | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `command_intents` — Modell: `CommandIntent`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| intent_id | String(128) | Nein | UNIQUE Index |
| correlation_id | String(128) | Nein | indexed |
| esp_id | String(64) | Nein | |
| flow | String(32) | Nein | |
| orchestration_state | String(32) | Nein | accepted/sent/ack_pending |
| first_seen_at | DateTime(tz) | Nein | |
| last_seen_at | DateTime(tz) | Nein | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

#### `command_outcomes` — Modell: `CommandOutcome`

| Spalte | Typ | Nullable | Besonderheit |
|--------|-----|----------|--------------|
| id | UUID (PK) | Nein | uuid4 |
| intent_id | String(128) | Nein | UNIQUE Index |
| correlation_id | String(128) | Nein | indexed |
| esp_id | String(64) | Nein | |
| flow | String(32) | Nein | |
| outcome | String(32) | Nein | accepted/rejected/applied/persisted/failed/expired |
| contract_version | Integer | Nein | 1=legacy, 2=target |
| semantic_mode | String(16) | Nein | legacy/dual/target |
| legacy_status | String(32) | Ja | |
| target_status | String(32) | Ja | |
| is_final | Boolean | Nein | default=False |
| code | String(64) | Ja | |
| reason | String(512) | Ja | |
| retryable | Boolean | Nein | default=False |
| generation, seq, epoch, ttl_ms, ts | Integer | Ja | Firmware-Sequenzfelder |
| first_seen_at | DateTime(tz) | Nein | |
| terminal_at | DateTime(tz) | Nein | |
| created_at, updated_at | DateTime(tz) | Nein | TimestampMixin |

---

## 3. Beziehungs-Diagramm

```
user_accounts (1) ─────────────────────────────────────────────────────────────
    │                                                                           │
    ├─► notifications (N) ────────────────────────────────────────────────────────
    │       └─► email_log (N)
    ├─► notification_preferences (1)
    ├─► dashboards (N)
    ├─► plugin_configs (N, created_by, SET NULL)
    ├─► plugin_executions (N, triggered_by_user, SET NULL)
    └─► diagnostic_reports (N, triggered_by_user, SET NULL)

zones (1) ─────────────────────────────────────────────────────────────────────
    │   zone_id (UNIQUE)
    └─► esp_devices (N, zone_id FK → zones.zone_id, SET NULL)
    [!] Kein ORM-Cascade zu subzone_configs

kaiser_registry (1) ──────────────────────────────────────────────────────────
    └─► esp_ownership (N, CASCADE)
            └─► esp_devices (N, CASCADE)

esp_devices (1) ───────────────────────────────────────────────────────────────
    │   id (UUID PK), device_id (UNIQUE String)
    ├─► sensor_configs (N, CASCADE auf id)
    │       └─► sensor_data (N, SET NULL auf id)       — erhält Daten nach Löschung
    │       └─► calibration_sessions (N, SET NULL)
    ├─► actuator_configs (N, CASCADE auf id)
    │       └─► actuator_states (N, SET NULL auf id)   — erhält Zustände nach Löschung
    │       └─► actuator_history (N, SET NULL auf id)  — erhält Historie nach Löschung
    ├─► subzone_configs (N, CASCADE auf device_id)
    ├─► esp_heartbeat_logs (N, SET NULL auf id)        — erhält Heartbeats nach Löschung
    └─► ai_predictions (N, SET NULL auf id)            — erhält Predictions nach Löschung

cross_esp_logic (1) ──────────────────────────────────────────────────────────
    ├─► logic_execution_history (N, CASCADE)
    └─► logic_hysteresis_states (N, CASCADE)

plugin_configs (1) ───────────────────────────────────────────────────────────
    └─► plugin_executions (N, CASCADE)

notifications (1) ────────────────────────────────────────────────────────────
    ├─► notifications (N, self-reference, SET NULL — Cascade-Suppression)
    └─► email_log (N, SET NULL)

Standalone (keine eingehenden FKs):
  audit_logs, system_config, device_zone_changes, device_active_context,
  zone_contexts, token_blacklist, library_metadata, command_intents, command_outcomes
```

---

## 4. Soft-Delete-Analyse

> [!INKONSISTENZ] I6: Inkonsistentes Soft-Delete-Pattern
>
> **Beobachtung:** Nur 2 von 34 Tabellen implementieren Soft-Delete. Die restlichen 32 Tabellen nutzen hard-delete. Dies führt zu asymmetrischem Löschverhalten.
>
> **Korrekte Stelle:** `src/db/models/esp.py` Z. 207–214, `src/db/models/zone.py` Z. 79–88
> **Empfehlung:** Entweder Soft-Delete auf weitere kritische Tabellen ausweiten (cross_esp_logic, sensor_configs) oder explizit in Architektur-Entscheidung festhalten, warum nur diese zwei Tabellen betroffen sind
> **Erst-Erkennung:** E6, 2026-04-26 (Bestätigung vorheriger E0-Beobachtung, vollständige 34-Tabellen-Analyse)

### 4.1 Tabellen MIT Soft-Delete

| Tabelle | Modell | Spalten | Verhalten |
|---------|--------|---------|-----------|
| `esp_devices` | `ESPDevice` | `deleted_at` (DateTime, indexed), `deleted_by` (String) | `deleted_at IS NOT NULL` = gelöscht. Sensordaten, Heartbeats, Actuator-Historie bleiben via `ON DELETE SET NULL`. Migration: `soft_delete_devices_preserve_sensor_data` |
| `zones` | `Zone` | `deleted_at` (DateTime), `deleted_by` (String) | Zusätzlich `status='deleted'`. Subzones werden NICHT automatisch deaktiviert (Cascade fehlt) |

### 4.2 Tabellen mit SET NULL (Daten-Erhalt nach Gerät-Löschung)

Diese Tabellen löschen nicht cascade, sondern setzen den FK auf NULL — dadurch bleiben historische Daten erhalten:

| Tabelle | FK-Spalte | Verhalten |
|---------|-----------|-----------|
| `sensor_data` | `esp_id` | SET NULL nach ESP-Soft-Delete |
| `actuator_states` | `esp_id` | SET NULL |
| `actuator_history` | `esp_id` | SET NULL |
| `esp_heartbeat_logs` | `esp_id` | SET NULL |
| `ai_predictions` | `target_esp_id` | SET NULL |
| `calibration_sessions` | `sensor_config_id` | SET NULL nach Sensor-Delete |
| `email_log` | `notification_id` | SET NULL nach Notification-Delete |
| `notifications` | `acknowledged_by` | SET NULL |
| `notifications` | `parent_notification_id` | SET NULL (Selbstreferenz) |

### 4.3 Tabellen mit CASCADE (hard delete)

Wenn das Parent-Objekt gelöscht wird, werden diese Einträge ebenfalls gelöscht:

| Tabelle | Trigger | Kaskadiert zu |
|---------|---------|---------------|
| `sensor_configs` | ESP-Delete | cascade delete |
| `actuator_configs` | ESP-Delete | cascade delete |
| `subzone_configs` | ESP-Delete | cascade delete |
| `esp_ownership` | Kaiser-Delete ODER ESP-Delete | cascade delete |
| `logic_execution_history` | Rule-Delete | cascade delete |
| `logic_hysteresis_states` | Rule-Delete | cascade delete |
| `plugin_executions` | Plugin-Delete | cascade delete |
| `notifications` | User-Delete | cascade delete |
| `notification_preferences` | User-Delete | cascade delete |
| `dashboards` | User-Delete | cascade delete |

> [!INKONSISTENZ] E2: zones Soft-Delete ohne Cascade zu subzone_configs
>
> **Beobachtung:** `zones` hat `deleted_at` (Soft-Delete), aber `subzone_configs.parent_zone_id` ist ein einfacher String ohne FK-Constraint zu `zones.zone_id`. Nach Zone-Soft-Delete bleiben `subzone_configs` mit dem alten `parent_zone_id` bestehen und sind verwaist. Der Service-Layer deaktiviert zwar `subzone_configs.is_active`, aber es gibt keine DB-Level-Garantie.
>
> **Korrekte Stelle:** `src/db/models/subzone.py` Z. 83–88, `src/services/zone_service.py`
> **Empfehlung:** Entweder FK `subzone_configs.parent_zone_id → zones.zone_id ON DELETE SET NULL` einführen, oder Application-Level-Invariante explizit in Dienst-Kommentar dokumentieren
> **Erst-Erkennung:** E6, 2026-04-26

---

## 5. Cascade-Verhalten: Vollständige Übersicht

```
ESP gelöscht (soft-delete):
  → sensor_configs:       CASCADE DELETE
  → actuator_configs:     CASCADE DELETE
  → subzone_configs:      CASCADE DELETE (via device_id)
  → sensor_data:          SET NULL (esp_id → NULL)
  → actuator_states:      SET NULL
  → actuator_history:     SET NULL
  → esp_heartbeat_logs:   SET NULL
  → ai_predictions:       SET NULL

Zone soft-deleted:
  → esp_devices.zone_id:  SET NULL (FK-Constraint)
  → subzone_configs:      KEIN Cascade (kein FK) — Service-Layer-Verantwortung

User gelöscht (hard delete, unwahrscheinlich):
  → notifications:        CASCADE DELETE
  → notification_prefs:   CASCADE DELETE
  → dashboards:           CASCADE DELETE
  → plugin_configs:       SET NULL (created_by)
  → plugin_executions:    SET NULL (triggered_by_user)
  → diagnostic_reports:   SET NULL (triggered_by_user)
  → notifications.acknowledged_by: SET NULL

Logic Rule gelöscht:
  → logic_execution_history: CASCADE DELETE
  → logic_hysteresis_states: CASCADE DELETE

Kaiser gelöscht:
  → esp_ownership:        CASCADE DELETE

Plugin gelöscht:
  → plugin_executions:    CASCADE DELETE

Notification gelöscht:
  → email_log:            SET NULL
  → child notifications:  SET NULL (parent_notification_id)
```

---

## 6. Alembic-Migrationshistorie

### 6.1 Head-Revision

Aktueller HEAD: **`add_critical_degraded`** (Migration: `add_critical_rule_degraded_fields.py`)

Die Migration fügt zu `cross_esp_logic` hinzu: `is_critical`, `escalation_policy`, `degraded_since`, `degraded_reason` + Partial-Index `idx_rule_degraded_critical`.
Vorgänger: `add_sensor_lifecycle` → ... (lineare Kette bis zum letzten Merge-Point).

### 6.2 Die 4 Merge-Points

| # | Revision ID | Datum | Zusammengeführte Branches | Warum entstanden |
|---|-------------|-------|--------------------------|------------------|
| 1 | `c1906fb38b74` | 2026-01-17 | `001_multi_value` + `add_discovery_approval` | Multi-Value-Sensor-Support und Discovery-Approval parallel entwickelt; beide Branch-Heads mussten zusammengeführt werden |
| 2 | `06ee633a722f` | 2025-12-27 | `add_data_source_field` + `add_subzone_configs` | Data-Source-Tracking und Subzone-Konfiguration liefen parallel; typisches Feature-Branch-Muster |
| 3 | `245078bda463` | 2026-01-27 | `add_esp_heartbeat_logs` + `fix_onewire_constraint` | Heartbeat-Persistierung und OneWire-Constraint-Fix liefen als getrennte Branches |
| 4 | `merge_datetime_null_subzones` | 2026-03-09 | `fix_datetime_timezone_naive` + `fix_null_subzone_names` | Zwei Fix-Branches für Timezone-Naive-Columns und NULL-Subzone-Namen wurden gleichzeitig bearbeitet |

> [!INKONSISTENZ] E4: Merge-Points als DAG-Indikator
>
> **Beobachtung:** 4 Merge-Points bedeuten, dass die Alembic-History kein rein linearer Graph ist, sondern ein DAG (Directed Acyclic Graph). Das ist für `alembic upgrade head` unproblematisch, erhöht aber die Komplexität bei manuellen Rollbacks und bei `--autogenerate` (potentielle Duplikate). Das `env.py` prüft explizit `if len(heads) != 1: raise RuntimeError(...)` — d.h. nach einem Merge muss immer exakt ein Head existieren.
>
> **Korrekte Stelle:** `alembic/env.py` Z. 104–107
> **Empfehlung:** Vor jeder neuen Migration prüfen ob es multiple Heads gibt (`alembic heads`) und ggf. zuerst mergen
> **Erst-Erkennung:** E6, 2026-04-26

### 6.3 Migrationsgeschichte (chronologisch, ausgewählte Meilensteine)

| Phase | Migration (Dateiname) | Inhalt |
|-------|-----------------------|--------|
| Basis | `add_zones_table` | `zones`-Tabelle |
| Basis | `add_subzone_configs_table` | `subzone_configs` |
| Basis | `add_esp_heartbeat_logs` | `esp_heartbeat_logs` |
| Multi-Value | `001_add_multi_value_sensor_support` | provides_values, interface_type, onewire_address |
| Multi-Value | `950ad9ce87bb` | i2c_address zu Unique-Constraint |
| Multi-Value | `fix_sensor_unique_constraint_onewire` | OneWire-Constraint fix |
| Multi-Value | `fix_sensor_unique_constraint_null_coalesce` | Expression-Index COALESCE (V19-F02+F13) |
| Discovery | `add_discovery_approval_fields` | discovered_at, approved_at, approval-Felder |
| Soft-Delete | `soft_delete_devices_preserve_sensor_data` | deleted_at/deleted_by auf esp_devices, SET NULL auf sensor_data |
| Zones | `add_zone_status_and_fk` | zones.status, FK esp_devices → zones |
| Zones | `add_device_zone_changes` | `device_zone_changes` Audit-Tabelle |
| Zones | `add_device_scope_and_context` | `device_active_context`, device_scope in sensor/actuator_configs |
| Notifications | `add_notifications_and_preferences` | `notifications`, `notification_preferences` |
| Notifications | `add_notification_fingerprint` | fingerprint-Spalte (FIX-07) |
| Notifications | `add_alert_lifecycle_columns` | status, acknowledged_at etc. |
| Email | `add_email_log_table` | `email_log` |
| Plugins | `add_plugin_tables` | `plugin_configs`, `plugin_executions` |
| Diagnostics | `add_diagnostic_reports` | `diagnostic_reports` |
| Calibration | `ea85866bc66e` | `calibration_sessions` |
| DateTime-Fix | `fix_datetime_timezone_naive` | Timezone auf alle naive DateTime-Spalten |
| DateTime-Fix | `fix_actuator_datetime_timezone` | actuator-spezifisch |
| Logic | `add_logic_hysteresis_states` | `logic_hysteresis_states` |
| Actuator | `normalize_actuator_type_in_states` | on/off statt idle/active |
| Actuator | `add_hardware_type_to_actuator_configs` | hardware_type-Spalte |
| Intent | `add_command_intent_outcome_contract` | `command_intents`, `command_outcomes` |
| Intent | `add_contract_shadow_fields_to_command_outcomes` | legacy_status, target_status, is_final, retryable |
| Telemetry | `add_esp_heartbeat_runtime_telemetry_jsonb` | runtime_telemetry JSONB auf esp_heartbeat_logs |
| AUT-111 | `add_critical_rule_degraded_fields` | is_critical, escalation_policy, degraded_since, degraded_reason (**HEAD**) |

---

## 7. Indexes und Constraints

### 7.1 Wichtige UNIQUE Constraints

| Tabelle | Constraint | Spalten |
|---------|------------|---------|
| `esp_devices` | (implicit) | device_id |
| `esp_devices` | (implicit) | mac_address |
| `sensor_configs` | `unique_esp_gpio_sensor_interface_v2` | Expression-Index (esp_id, gpio, sensor_type, COALESCE(onewire_address,''), COALESCE(i2c_address::text,'')) |
| `actuator_configs` | `unique_esp_gpio_actuator` | esp_id, gpio |
| `subzone_configs` | `uq_esp_subzone` | esp_id, subzone_id |
| `zones` | (implicit) | zone_id |
| `cross_esp_logic` | (implicit) | rule_name |
| `logic_hysteresis_states` | `uq_hysteresis_state_rule_cond` | rule_id, condition_index |
| `device_active_context` | `unique_device_active_context` | config_type, config_id |
| `user_accounts` | (implicit) | username |
| `user_accounts` | (implicit) | email |
| `token_blacklist` | (implicit) | token_hash |
| `notifications` | `ix_notifications_fingerprint_unique` | fingerprint (partial: WHERE fingerprint IS NOT NULL) |
| `sensor_data` | `uq_sensor_data_esp_gpio_type_timestamp` | esp_id, gpio, sensor_type, timestamp |
| `kaiser_registry` | (implicit) | kaiser_id |
| `kaiser_registry` | (implicit) | mac_address |
| `esp_ownership` | `unique_kaiser_esp_ownership` | kaiser_id, esp_id |
| `library_metadata` | (implicit) | library_name |
| `system_config` | (implicit) | config_key |
| `sensor_type_defaults` | (implicit) | sensor_type |
| `zone_contexts` | (implicit) | zone_id |
| `command_intents` | `idx_command_intents_intent_id` | intent_id (unique index) |
| `command_outcomes` | `idx_command_outcomes_intent_id` | intent_id (unique index) |

### 7.2 Composite Indexes auf Time-Series-Tabellen

**sensor_data:**
```
idx_esp_gpio_timestamp      (esp_id, gpio, timestamp)
idx_sensor_type_timestamp   (sensor_type, timestamp)
idx_timestamp_desc          (timestamp DESC)
idx_data_source_timestamp   (data_source, timestamp)
```

**actuator_history:**
```
idx_esp_gpio_timestamp_hist     (esp_id, gpio, timestamp)
idx_command_type_timestamp      (command_type, timestamp)
idx_timestamp_desc_hist         (timestamp DESC)
idx_success_timestamp           (success, timestamp)
idx_actuator_data_source_timestamp (data_source, timestamp)
```

**esp_heartbeat_logs:**
```
idx_heartbeat_esp_timestamp         (esp_id, timestamp)
idx_heartbeat_device_timestamp      (device_id, timestamp)
idx_heartbeat_timestamp_desc        (timestamp btree)
idx_heartbeat_data_source_timestamp (data_source, timestamp)
idx_heartbeat_health_status         (health_status, timestamp)
```

**audit_logs:**
```
ix_audit_logs_created_at                    (created_at)
ix_audit_logs_severity_created_at           (severity, created_at)
ix_audit_logs_source_created_at             (source_type, source_id, created_at)
```

### 7.3 Partial Indexes

| Index | Tabelle | Bedingung | Zweck |
|-------|---------|-----------|-------|
| `ix_notifications_fingerprint_unique` | notifications | WHERE fingerprint IS NOT NULL | Grafana-Alert-Dedup |
| `ix_notifications_status_severity` | notifications | WHERE resolved_at IS NULL | Aktive-Alert-Filterung |
| `ix_notifications_correlation` | notifications | WHERE correlation_id IS NOT NULL | Korrelations-Lookup |
| `idx_rule_degraded_critical` | cross_esp_logic | WHERE degraded_since IS NOT NULL | Degraded-Rule-Monitoring |

---

## 8. Bekannte Inkonsistenzen (vollständige Liste)

### I3: Tabellenname-Drift (E0-Bestätigung + Erweiterung)

> [!INKONSISTENZ] I3: Dokumentation nennt falsche Tabellennamen
>
> **Beobachtung:** Mindestens 2 Tabellennamen in Dokumentation und Kommentaren weichen von tatsächlichen `__tablename__`-Werten ab:
> - `users` → tatsächlich `user_accounts`
> - `heartbeat_logs` → tatsächlich `esp_heartbeat_logs`
> - `notification_logs` → existiert NICHT; korrekte Tabelle ist `notifications`
>
> **Korrekte Stelle:** `src/db/models/user.py` Z. 30, `src/db/models/esp_heartbeat.py` Z. 59, `src/db/models/notification.py` Z. 55
> **Empfehlung:** Alle Referenzen in Dokumentation, API-Docs und Kommentaren auf tatsächliche `__tablename__`-Werte aktualisieren. Grep auf `"users"`, `"heartbeat_logs"`, `"notification_logs"` in Dokumentationsdateien.
> **Erst-Erkennung:** E0 (users), E6 2026-04-26 (vollständige Überprüfung)

### I6: Soft-Delete nur auf 2 von 34 Tabellen

Siehe Abschnitt 4 — vollständige Analyse.

### E2: zones Soft-Delete ohne DB-Level Cascade zu subzone_configs

Siehe Abschnitt 4, Abschnitt 5 und Inkonsistenz-Block in 4.3.

### E3: notifications.extra_data statt dedizierter device_id FK

Siehe Abschnitt 2.5 (notifications).

### E4: 4 Alembic Merge-Points — DAG statt linearer History

Siehe Abschnitt 6.2.

### E5 (neu): subzone_configs.parent_zone_id ohne FK-Constraint

> [!INKONSISTENZ] E5 (neu): subzone_configs.parent_zone_id ist kein FK
>
> **Beobachtung:** `subzone_configs.parent_zone_id` (String(50)) hat keine FK-Constraint zu `zones.zone_id`. Die Integrität (parent_zone_id muss einer existierenden Zone entsprechen) wird nur auf Applikations-Level durch `SubzoneService` sichergestellt.
>
> **Korrekte Stelle:** `src/db/models/subzone.py` Z. 83–88
> **Empfehlung:** FK `parent_zone_id → zones.zone_id ON DELETE SET NULL` oder `ON DELETE CASCADE` hinzufügen. Alembic-Migration erforderlich.
> **Erst-Erkennung:** E6, 2026-04-26

### E6 (neu): device_zone_changes ohne FK zu esp_devices

> [!INKONSISTENZ] E6 (neu): device_zone_changes.esp_id ohne FK
>
> **Beobachtung:** `device_zone_changes.esp_id` (String(50)) hat keinen FK-Constraint zu `esp_devices.device_id`. Die Tabelle ist eine reine Audit-Tabelle, aber referenzielle Integrität fehlt — nach Gerät-Löschung verbleiben Einträge mit ungültigem esp_id.
>
> **Korrekte Stelle:** `src/db/models/device_zone_change.py` Z. 49–52
> **Empfehlung:** Bewusste Design-Entscheidung (Audit-Log soll auch nach Gerät-Löschung lesbar bleiben) explizit im Modell-Kommentar festhalten; oder FK mit SET NULL falls gewünscht.
> **Erst-Erkennung:** E6, 2026-04-26

---

## 9. Zusammenfassung

| Kategorie | Befund |
|-----------|--------|
| Tabellen | 34 (E0 nannte 32 — 2 neue: command_intents, command_outcomes) |
| Modelle (Python) | 28 Dateien, 34 Klassen mit `__tablename__` |
| Time-Series-Tabellen | sensor_data, esp_heartbeat_logs, actuator_history, logic_execution_history, ai_predictions |
| Soft-Delete | esp_devices, zones — alle anderen hard-delete oder SET NULL |
| Alembic | 60 Revisionen, 4 Merge-Points, HEAD: add_critical_degraded |
| Inkonsistenzen | I3, I6, E2, E3, E4, E5, E6 — 7 dokumentierte Befunde |
| Partitionierung | Keine native PG-Partitionierung — Retention via Maintenance-Jobs |
| JSONB | esp_heartbeat_logs.runtime_telemetry, subzone_configs.custom_data, zone_contexts.{custom_data,cycle_history}, calibration_sessions.{calibration_points,calibration_result}, notifications.extra_data |
