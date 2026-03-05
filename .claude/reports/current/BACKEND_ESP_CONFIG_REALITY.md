# Backend-Realität ESP-Konfiguration — Analyse & IST-SOLL

> **Erstellt:** 2026-03-05  
> **Auftrag:** Backend-Realität ESP-Konfiguration analysieren, Konfig-Panels an Backend anpassen (voll funktional vs. informativ)  
> **Nur Analyse, keine Code-Änderungen.**

---

## 1) Backend vollständig erfasst

### 1.1 REST-Endpoints für Device-/Sensor-/Aktor-Konfiguration

| Bereich | Endpoint | Method | Request-Body (Konfig-relevant) | Response |
|--------|----------|--------|---------------------------------|----------|
| **ESP Device** | `/api/v1/esp/devices/{esp_id}` | PATCH | `ESPDeviceUpdate`: name, zone_id, zone_name, is_zone_master, capabilities, metadata | ESPDeviceResponse |
| **Sensor** | `/api/v1/sensors/{esp_id}/{gpio}` | POST (Create/Update) | `SensorConfigCreate`: esp_id, gpio, sensor_type, name, enabled, interval_ms, processing_mode, interface_type, i2c_address, onewire_address, provides_values, calibration, threshold_min/max, warning_min/max, metadata, operating_mode, timeout_seconds, timeout_warning_enabled, schedule_config, **subzone_id** | SensorConfigResponse |
| **Sensor** | `/api/v1/sensors/{esp_id}/{gpio}` | GET | — (Query: sensor_type für Multi-Value) | SensorConfigResponse |
| **Sensor** | `/api/v1/sensors/{esp_id}/{gpio}` | DELETE | — | SensorConfigResponse |
| **Actuator** | `/api/v1/actuators/{esp_id}/{gpio}` | POST (Create/Update) | `ActuatorConfigCreate`: esp_id, gpio, actuator_type, name, enabled, max_runtime_seconds, cooldown_seconds, pwm_frequency, servo_min/max_pulse, metadata, **subzone_id** | ActuatorConfigResponse |
| **Actuator** | `/api/v1/actuators/{esp_id}/{gpio}` | GET | — | ActuatorConfigResponse |
| **Actuator** | `/api/v1/actuators/{esp_id}/{gpio}` | DELETE | — | ActuatorConfigResponse |

**Wichtig:** Es gibt keinen separaten „Config-Push“-Endpoint. Config wird nach jedem Sensor-/Aktor-Create/Update automatisch per MQTT an den ESP gesendet (`config_builder.build_combined_config` → `esp_service.send_config` → Topic `kaiser/{kaiser_id}/esp/{esp_id}/config`).

### 1.2 DB-Modelle: mutierbar vs. read-only

#### ESPDevice (`esp_devices`)

| Spalte | Mutierbar via API | Hinweis |
|--------|--------------------|---------|
| id | nein | PK, read-only |
| device_id | nein | Unique, bei Registrierung gesetzt |
| name | ja | PATCH |
| zone_id, zone_name, master_zone_id | ja | PATCH (Zone-Zuweisung) |
| is_zone_master | ja | PATCH |
| kaiser_id | ja | assign_kaiser |
| hardware_type | nein | Bei Registrierung/Firmware |
| ip_address, mac_address, firmware_version | nein | Von ESP/Heartbeat |
| capabilities | ja | PATCH (selten) |
| status, last_seen, health_status | nein | Runtime/Heartbeat |
| discovered_at, approved_at, approved_by, rejection_reason, last_rejection_at | nein | Approval-Flow |
| device_metadata | ja | PATCH (metadata) |
| alert_config | ja | PATCH /alert-config |

#### SensorConfig (`sensor_configs`)

| Spalte | Mutierbar via API | Hinweis |
|--------|--------------------|---------|
| id, esp_id | nein | PK/FK |
| gpio | nur bei Create | Unique mit sensor_type/onewire/i2c |
| sensor_type | nur bei Create | Teil des Uniqueness |
| sensor_name | ja | Schema: name |
| interface_type, i2c_address, onewire_address, provides_values | ja | Create/Update |
| enabled | ja | |
| pi_enhanced | ja | Schema: processing_mode |
| sample_interval_ms | ja | Schema: interval_ms |
| calibration_data, thresholds | ja | Schema: calibration, threshold_* |
| sensor_metadata | ja | Schema: metadata |
| alert_config, runtime_stats | ja | Eigene Endpoints (PATCH alert-config, PATCH runtime) |
| operating_mode, timeout_seconds, timeout_warning_enabled, schedule_config | ja | Create/Update |
| last_manual_request | nein | Server-seitig bei Trigger |
| config_status, config_error, config_error_detail | nein | Von ESP config_response |

**Subzone:** Sensor hat **keine** Spalte `subzone_id`. Zugehörigkeit zur Subzone ergibt sich aus `subzone_configs.assigned_gpios` (welcher GPIO in welcher Subzone ist). API nimmt `subzone_id` im Request entgegen und schreibt über SubzoneService (assign_subzone/remove_gpio_from_all_subzones).

#### ActuatorConfig (`actuator_configs`)

| Spalte | Mutierbar via API | Hinweis |
|--------|--------------------|---------|
| id, esp_id | nein | PK/FK |
| gpio | nur bei Create | Unique pro ESP |
| actuator_type, actuator_name | ja | |
| enabled | ja | |
| min_value, max_value, default_value | ja | Aus Schema/Defaults |
| timeout_seconds | ja | Direkt |
| safety_constraints | ja | Schema: max_runtime_seconds → max_runtime, cooldown_seconds → cooldown_period |
| actuator_metadata | ja | Schema: metadata + pwm_frequency, servo_* |
| alert_config, runtime_stats | ja | Eigene Endpoints |
| config_status, config_error, config_error_detail | nein | Von ESP config_response |

**Subzone:** Wie bei Sensor – keine eigene Spalte; Zuordnung über `subzone_configs.assigned_gpios`.

### 1.3 MQTT: Was wird an den ESP gesendet?

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config` (QoS 2)

**Quelle:** `ConfigPayloadBuilder.build_combined_config()` → `ConfigMappingEngine.apply_sensor_mapping` / `apply_actuator_mapping` (DEFAULT_SENSOR_MAPPINGS / DEFAULT_ACTUATOR_MAPPINGS in `core/config_mapping.py`).

**Sensor-Payload (pro Eintrag in `config.sensors`):**  
gpio, sensor_type, sensor_name, subzone_id (aus sensor_metadata.subzone_id), active (enabled), sample_interval_ms, raw_mode=true, operating_mode, measurement_interval_seconds, interface_type, onewire_address, i2c_address.

**Aktor-Payload (pro Eintrag in `config.actuators`):**  
gpio, actuator_type (Server "digital" → "relay"), actuator_name, subzone_id (aus actuator_metadata.subzone_id), active, aux_gpio, critical, inverted_logic, default_state, default_pwm (aus actuator_metadata).

**Server-only (werden nicht an ESP gesendet):**  
Zum Beispiel: calibration_data, thresholds, alert_config, runtime_stats, config_status, config_error, pi_enhanced (ESP sendet immer raw_mode), SensorTypeDefaults-Logik (operating_mode etc. werden als Override gesendet).

### 1.4 Subzonen: API & DB

- **DB:** `subzone_configs`: esp_id (FK auf esp_devices.device_id), subzone_id, subzone_name, parent_zone_id, assigned_gpios (JSON Array), safe_mode_active, etc.
- **Sensor/Aktor:** Kein eigenes `subzone_id`-Feld in sensor_configs/actuator_configs. Subzone-Zuordnung = „GPIO in assigned_gpios einer Subzone“.
- **API:**  
  - Sensor: `SensorConfigCreate.subzone_id` → SubzoneService.assign_subzone(esp_id, subzone_id, assigned_gpios=[gpio]) bzw. remove_gpio_from_all_subzones.  
  - Actuator: `ActuatorConfigCreate.subzone_id` → gleicher Flow.  
  - Subzone-Endpoints: POST/GET/DELETE `/api/v1/subzone/devices/{esp_id}/subzones`, GET/DELETE `/api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}`, Safe-Mode POST/DELETE.

---

## 2) Pro Einheit: API-Felder kategorisiert

### 2.1 Device (ESP)

| API-Feld (Request/Response) | Kategorie | Begründung |
|----------------------------|-----------|------------|
| name | konfigurierbar | PATCH, in DB mutierbar |
| zone_id, zone_name, is_zone_master | konfigurierbar | PATCH / Zone-Assignment |
| device_id, hardware_type | nur lesen | Identität/Firmware |
| ip_address, mac_address, firmware_version | nur lesen | Von Device/Heartbeat |
| capabilities | konfigurierbar | PATCH (selten) |
| status, last_seen, health_status | nur lesen | Runtime |
| device_metadata | konfigurierbar | PATCH |
| alert_config | konfigurierbar | PATCH /alert-config |

### 2.2 Sensor

| API-Feld | Kategorie | Begründung |
|----------|-----------|------------|
| id, esp_id, esp_device_id | nur lesen | Identität |
| gpio, sensor_type | konfigurierbar (nur bei Create) | Danach Teil des Uniqueness |
| name (sensor_name) | konfigurierbar | |
| enabled, interval_ms, processing_mode | konfigurierbar | |
| interface_type, i2c_address, onewire_address, provides_values | konfigurierbar | |
| calibration, threshold_min/max, warning_min/max | konfigurierbar | Server + Anzeige |
| metadata | konfigurierbar | sensor_metadata (inkl. subzone_id für MQTT-Mapping) |
| operating_mode, timeout_seconds, timeout_warning_enabled, schedule_config | konfigurierbar | |
| subzone_id | konfigurierbar | Über SubzoneService, nicht DB-Spalte Sensor |
| config_status, config_error, config_error_detail | nur lesen | Von ESP config_response |
| latest_value, latest_quality, latest_timestamp | nur lesen | Live-Daten |
| description, unit | unklar | Nicht in SensorConfigCreate; Frontend sendet sie – landen nur wenn in metadata abgelegt |

### 2.3 Actuator

| API-Feld | Kategorie | Begründung |
|----------|-----------|------------|
| id, esp_id, esp_device_id | nur lesen | Identität |
| gpio, actuator_type | konfigurierbar (gpio/type bei Create) | |
| name | konfigurierbar | |
| enabled | konfigurierbar | |
| max_runtime_seconds, cooldown_seconds | konfigurierbar | → safety_constraints |
| pwm_frequency, servo_min_pulse, servo_max_pulse | konfigurierbar | → actuator_metadata |
| metadata | konfigurierbar | actuator_metadata |
| subzone_id | konfigurierbar | Über SubzoneService |
| config_status, config_error, config_error_detail | nur lesen | Von ESP |
| max_on_duration_ms, min_pause_seconds, max_open_time_seconds, active_high, frequency, duty_max, switch_delay_ms | unklar | Backend-Schema nutzt max_runtime_seconds, cooldown_seconds und metadata; Frontend sendet teils andere Namen/Einheiten (siehe IST-SOLL) |

---

## 3) Frontend-Abgleich: Panels vs. Backend

### 3.1 ESPSettingsSheet / Device

| Feld im UI | Editierbar? | Backend-Realität | IST-SOLL |
|------------|-------------|------------------|----------|
| Name | ja (Inline-Edit) | PATCH name | ✅ Funktional |
| Zone | ja (ZoneAssignmentPanel) | PATCH zone_id/zone_name, ggf. Zone-API | ✅ Funktional |
| Gerätetyp, device_id, Status, last_seen | nein | read-only | ✅ Nur informativ |
| Heartbeat (Mock) | ja (Trigger) | Debug/Mock-API | ✅ Funktional |
| Löschen | ja | DELETE Device | ✅ Funktional |
| Sensoren/Aktoren-Listen | Klick → Config-Panel | — | ✅ Navigation |

**Empfehlung:** Keine Änderung nötig. Device-Name und Zone sind korrekt an PATCH angebunden.

### 3.2 SensorConfigPanel

| Feld im UI | Editierbar? | Backend (API/DB) | IST-SOLL |
|------------|-------------|------------------|----------|
| Name | ja | name → sensor_name | ✅ Funktional |
| Beschreibung | ja | Nicht in SensorConfigCreate; nur in metadata persistierbar | ⚠️ Nur informativ / in metadata speichern |
| Einheit | ja | Nicht in Schema; kommt aus SensorTypeDefaults/Anzeige; nur in metadata persistierbar | ⚠️ Nur informativ / in metadata speichern |
| Sensor-Typ | nein (disabled) | Read-only nach Create | ✅ Korrekt |
| Aktiv (enabled) | ja | enabled | ✅ Funktional |
| Subzone | ja | subzone_id im Request → SubzoneService | ✅ Funktional |
| Schwellwerte (Alarm/Warn min/max) | ja | threshold_min/max, warning_min/max | ✅ Funktional |
| Interface/I2C/OneWire, GPIO | ja (je nach Typ) | interface_type, i2c_address, onewire_address, gpio | ✅ Funktional |
| Kalibrierung | ja | calibration | ✅ Funktional |
| operating_mode, interval, schedule | im Panel (Accordion) | operating_mode, interval_ms, schedule_config | ✅ Funktional (wenn gesendet) |
| config_status, config_error | Anzeige | read-only | ✅ Nur informativ |
| Live-Preview, Alert/Runtime/Metadaten-Sections | teils editierbar | alert_config, runtime_stats, metadata eigene Endpoints/Request | ✅ Konsistent möglich |

**Empfehlung:**  
- Beschreibung und Einheit: Entweder als „nur informativ“ kennzeichnen oder im Frontend in `metadata` (z. B. description, unit) ablegen und so persistieren; Backend speichert sie in sensor_metadata.  
- Prüfen, ob operating_mode, interval_ms, schedule_config im Save-Payload mitgeschickt werden; falls nicht, hinzufügen für volle Konfigurierbarkeit.

### 3.3 ActuatorConfigPanel

| Feld im UI | Editierbar? | Backend (API/DB) | IST-SOLL |
|------------|-------------|------------------|----------|
| Name | ja | name → actuator_name | ✅ Funktional |
| Beschreibung | ja | In metadata (actuator_metadata) | ✅ Über metadata |
| Aktiv | ja | enabled | ✅ Funktional |
| Subzone | ja | subzone_id | ✅ Funktional |
| max_on_duration_ms (Pump) | ja | Backend erwartet **max_runtime_seconds** (Sekunden) | ❌ Fehlende Anpassung: Frontend sendet max_on_duration_ms → Backend ignoriert; Umstellung auf max_runtime_seconds (Sekunden) nötig |
| min_pause_seconds (Pump) | ja | Backend: **cooldown_seconds** | ✅ Semantik gleich, Feldname prüfen (cooldown_seconds) |
| max_open_time_seconds (Valve) | ja | In actuator_metadata/safety_constraints möglich | ⚠️ Prüfen ob im Schema/Repo gemappt |
| active_high (Valve/Relay) | ja | actuator_metadata | ✅ Über metadata |
| frequency, duty_max (PWM) | ja | pwm_frequency in metadata, duty_max ggf. metadata | ⚠️ Schema: pwm_frequency; duty_max prüfen |
| switch_delay_ms (Relay) | ja | metadata | ⚠️ In metadata persistieren |
| config_status / Fehler | Anzeige | read-only | ✅ Nur informativ |

**Empfehlung:**  
- **Kritisch:** Actuator-Create/Update-Payload an Backend-Schema anpassen: **max_runtime_seconds** (in Sekunden) statt max_on_duration_ms senden; **cooldown_seconds** explizit senden.  
- Valve/PWM/Relay-spezifische Felder (max_open_time_seconds, active_high, frequency, duty_max, switch_delay_ms) in ActuatorConfigCreate/Update abdecken oder einheitlich in metadata mappen und in _schema_to_model_fields aus metadata in safety_constraints/actuator_metadata übernehmen.

---

## 4) Kurzfassung Subzonen

- **API:** subzone_id bei Sensor und Actuator im Create/Update-Body → SubzoneService ordnet den GPIO der Subzone zu (subzone_configs.assigned_gpios).  
- **DB:** Keine subzone_id-Spalte in sensor_configs/actuator_configs; Zuordnung nur über subzone_configs.  
- **MQTT:** subzone_id für ESP aus sensor_metadata.subzone_id bzw. actuator_metadata.subzone_id (ConfigMappingEngine liest aus Metadata).  
- **Frontend:** SubzoneAssignmentSection in beiden Panels; subzone_id wird mitgeschickt → Backend-Realität stimmig.

---

## 5) Priorisierte Umsetzungsschritte (optional)

1. **Hoch – Actuator-Payload:** Frontend ActuatorConfigPanel und API-Client so anpassen, dass **max_runtime_seconds** (Sekunden) und **cooldown_seconds** gesendet werden; prüfen ob alle typ-spezifischen Felder (Valve, PWM, Relay) im Backend-Schema oder über metadata sauber gemappt sind.  
2. **Mittel – Sensor description/unit:** Entweder in SensorConfigCreate/Response als offizielle Felder aufnehmen oder im Frontend konsequent in metadata (description, unit) speichern und in der Anzeige daraus lesen.  
3. **Mittel – Sensor operating_mode/interval/schedule:** Sicherstellen, dass diese Felder im SensorConfigPanel-Save-Payload enthalten sind und das Backend sie persistiert und an den ESP sendet.  
4. **Niedrig – Dokumentation:** In Frontend (oder Wissensdatenbank) festhalten, welche Felder „nur informativ“ sind (z. B. config_status, device_id, last_seen) und welche echte Konfiguration sind.

---

---

## Anhang: Endpoint-Übersicht Konfiguration

| Aktion | Endpoint | Method | Body (Konfig) |
|--------|----------|--------|----------------|
| Device aktualisieren | `/api/v1/esp/devices/{esp_id}` | PATCH | name, zone_id, zone_name, is_zone_master, capabilities, metadata |
| Sensor lesen | `/api/v1/sensors/{esp_id}/{gpio}` | GET | — |
| Sensor anlegen/aktualisieren | `/api/v1/sensors/{esp_id}/{gpio}` | POST | SensorConfigCreate (inkl. subzone_id) |
| Sensor löschen | `/api/v1/sensors/{esp_id}/{gpio}` | DELETE | — |
| Actuator lesen | `/api/v1/actuators/{esp_id}/{gpio}` | GET | — |
| Actuator anlegen/aktualisieren | `/api/v1/actuators/{esp_id}/{gpio}` | POST | ActuatorConfigCreate (inkl. subzone_id, max_runtime_seconds, cooldown_seconds) |
| Actuator löschen | `/api/v1/actuators/{esp_id}/{gpio}` | DELETE | — |
| Config an ESP | automatisch nach Sensor/Actor Create/Update | MQTT | kaiser/{kaiser_id}/esp/{esp_id}/config (sensors[], actuators[]) |

---

**Ende des Berichts.** Alle Angaben basieren auf Code-Analyse (El Servador, El Frontend, config_mapping, REST, DB-Modelle, MQTT). Keine Code-Änderungen vorgenommen.
