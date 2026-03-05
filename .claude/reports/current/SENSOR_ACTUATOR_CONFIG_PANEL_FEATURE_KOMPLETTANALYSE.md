# SensorConfigPanel / ActuatorConfigPanel — Feature-Komplettanalyse & Dopplungs-Matrix

**Ziel-Repo:** auto-one (El Frontend + El Servador)  
**Erstellt:** 2026-03-05  
**Basis:** Auftrag Initiales Config Panel Subzone, SensorConfigPanel Vollcheck  
**Priorität:** HOCH  
**Typ:** Analyse (Ergebnis = strukturierter Bericht + Dopplungs-Matrix)  
**Aufwand:** ~4–6h

---

## Teil 1: Feature-Inventar (pro Panel)

### 1.1 AddSensorModal (Initiales Panel)

| # | Sektion | Feld | Typ | API-Feld | Backend | Anmerkung |
|---|---------|------|-----|----------|---------|-----------|
| 1 | — | sensor_type | select | sensor_type | SensorConfigCreate | Dropdown aus getSensorTypeOptions() |
| 2 | — | gpio | GpioPicker | gpio | SensorConfigCreate | Nur bei GPIO-Sensoren (nicht I2C/OneWire) |
| 3 | OneWire | oneWireScanPin | select | — | — | GPIO für Bus-Scan; gpio wird daraus |
| 4 | OneWire | rom_code (multi-select) | checkbox | onewire_address | SensorConfigCreate | Pro ROM ein Sensor; addMultipleOneWireSensors |
| 5 | I2C | selectedI2CAddress | select | i2c_address | SensorConfigCreate | interface_type='I2C', gpio=0 |
| 6 | — | operating_mode | select | operating_mode | SensorConfigCreate | continuous, on_demand, scheduled, paused |
| 7 | — | timeout_seconds | number | timeout_seconds | SensorConfigCreate | Nur bei continuous; 0=kein Timeout |
| 8 | — | name | text | name | SensorConfigCreate | Optional |
| 9 | — | subzone_id | text | subzone_id | SensorConfigCreate | Freitext; optional |
| 10 | — | raw_value | number | — | — | Startwert (Mock); Real-ESP ignoriert |
| 11 | — | unit | text (readonly) | — | — | Aus SENSOR_TYPE_CONFIG; nicht an API |

**Übergabe an addSensor():** `espStore.addSensor(espId, sensorData)` — Real-ESP: esp_id, gpio, sensor_type, name, subzone_id, interface_type, i2c_address (I2C), onewire_address (OneWire), operating_mode, timeout_seconds, raw_mode, metadata.created_via.

---

### 1.2 AddActuatorModal (Initiales Panel)

| # | Sektion | Feld | Typ | API-Feld | Backend | Anmerkung |
|---|---------|------|-----|----------|---------|-----------|
| 1 | — | gpio | GpioPicker | gpio | ActuatorConfigCreate | |
| 2 | — | actuator_type | select | actuator_type | ActuatorConfigCreate | relay, pump, fan, lamp, heater, valve |
| 3 | — | name | text | name | ActuatorConfigCreate | Optional |
| 4 | — | subzone_id | text | subzone_id | ActuatorConfigCreate | Freitext; optional |
| 5 | Aux | aux_gpio | GpioPicker | aux_gpio | ActuatorConfigCreate | Nur valve (H-Bridge); 255=nicht verwendet |
| 6 | PWM | pwm_value | range | — | — | Initial-Wert; nicht persistiert |
| 7 | Pump | max_runtime_seconds | number | max_runtime_seconds | ActuatorConfigCreate | 0=kein Limit |
| 8 | Pump | cooldown_seconds | number | cooldown_seconds | ActuatorConfigCreate | |
| 9 | Relay | inverted_logic | checkbox | inverted_logic | ActuatorConfigCreate | LOW=ON |

**Übergabe an addActuator():** `espStore.addActuator(espId, newActuator.value)` — Real-ESP: esp_id, gpio, actuator_type, name, subzone_id, aux_gpio, inverted_logic, max_runtime_seconds, cooldown_seconds, metadata.created_via.

---

### 1.3 SensorConfigPanel (bestehender Sensor)

| # | Sektion | Feld | Typ | API-Feld | Backend | Anmerkung |
|---|---------|------|-----|----------|---------|-----------|
| 1 | Grundeinstellungen | name | text | name | sensorsApi.createOrUpdate | |
| 2 | Grundeinstellungen | description | text | description | createOrUpdate | configExt |
| 3 | Grundeinstellungen | unitValue | text | unit | createOrUpdate | |
| 4 | Grundeinstellungen | sensorType | readonly | — | — | Props |
| 5 | Grundeinstellungen | enabled | toggle | enabled | createOrUpdate | |
| 6 | Grundeinstellungen | subzoneId | SubzoneAssignmentSection | subzone_id | createOrUpdate | Dropdown + „Neue Subzone“ |
| 7 | Schwellwerte | alarmLow, warnLow, warnHigh, alarmHigh | RangeSlider + inputs | threshold_min, warning_min, warning_max, threshold_max | createOrUpdate | |
| 8 | Kalibrierung | calibration | useCalibration | calibration | createOrUpdate | pH/EC/Moisture |
| 9 | Hardware | gpioPin | select | gpio | createOrUpdate | ANALOG: adc1Pins; OneWire/Digital: [4,5,13,…] |
| 10 | Hardware | i2cAddress | select | i2c_address | createOrUpdate | I2C |
| 11 | Hardware | i2cBus | select | i2c_bus | createOrUpdate | I2C |
| 12 | Hardware | measureRangeMin/Max | number | measure_range_min/max | createOrUpdate | ANALOG |
| 13 | Hardware | pulsesPerLiter | number | pulses_per_liter | createOrUpdate | Digital (flow) |
| 14 | Live-Vorschau | — | LiveDataPreview | — | — | Read-only |
| 15 | AlertConfigSection | alerts_enabled, suppression_*, custom_thresholds, severity_override | — | sensorsApi.updateAlertConfig | PATCH /sensors/{id}/alert-config | Eigener Save |
| 16 | RuntimeMaintenanceSection | last_maintenance, maintenance_log | — | sensorsApi.updateRuntime | PATCH /sensors/{id}/runtime | Eigener Save |
| 17 | DeviceMetadataSection | manufacturer, model, datasheet_url, serial_number, installation_date, last_maintenance, maintenance_interval_days, notes | metadata | createOrUpdate (config.metadata) | mergeDeviceMetadata |
| 18 | LinkedRulesSection | — | — | — | logicStore.connections | Read-only |

---

### 1.4 ActuatorConfigPanel (bestehender Aktor)

| # | Sektion | Feld | Typ | API-Feld | Backend | Anmerkung |
|---|---------|------|-----|----------|---------|-----------|
| 1 | Steuerung | ON/OFF/PWM | toggle/slider | — | espStore.sendActuatorCommand | Live-Befehl, nicht Config |
| 2 | Steuerung | Emergency-Stop | button | — | actuatorsApi.emergencyStop | |
| 3 | Grundeinstellungen | name | text | name | createOrUpdate | |
| 4 | Grundeinstellungen | description | text | description | createOrUpdate | |
| 5 | Grundeinstellungen | enabled | toggle | enabled | createOrUpdate | |
| 6 | Grundeinstellungen | subzoneId | SubzoneAssignmentSection | subzone_id | createOrUpdate | |
| 7 | Typ-Einstellungen | gpio | select (disabled) | — | — | Read-only nach Erstellung |
| 8 | Pump | maxRuntime | number | max_runtime_seconds | createOrUpdate | Backend: seconds |
| 9 | Pump | minPause | number | cooldown_seconds | createOrUpdate | |
| 10 | Valve | maxOpenTime | number | max_open_time_seconds | createOrUpdate | |
| 11 | Valve/Relay | isNormalClosed | toggle | active_high | createOrUpdate | active_high = !isNormalClosed |
| 12 | PWM | pwmFrequency | number | frequency | createOrUpdate | Hz |
| 13 | PWM | powerLimit | number | duty_max | createOrUpdate | % |
| 14 | Relay | switchDelay | number | switch_delay_ms | createOrUpdate | Anti-Prellen |
| 15 | AlertConfigSection | alerts_enabled, suppression_*, custom_thresholds, severity_override | — | actuatorsApi.updateAlertConfig | PATCH /actuators/{id}/alert-config | Eigener Save |
| 16 | RuntimeMaintenanceSection | last_maintenance, maintenance_log | — | actuatorsApi.updateRuntime | PATCH /actuators/{id}/runtime | Eigener Save |
| 17 | DeviceMetadataSection | manufacturer, model, … | metadata | createOrUpdate (config.metadata) | |
| 18 | LinkedRulesSection | — | — | — | logicStore.connections | Read-only |

---

## Teil 2: Dopplungs-Matrix

| Feld | AddSensorModal | AddActuatorModal | SensorConfigPanel | ActuatorConfigPanel | Sonstige | Dopplung? | Empfehlung |
|------|----------------|------------------|-------------------|---------------------|----------|-----------|-------------|
| **name** | ✓ | ✓ | ✓ | ✓ | — | JA | Initial: Kurz (optional). Config: vollständig. Autoritativ: ConfigPanel. |
| **subzone_id** | ✓ (SubzoneAssignmentSection) | ✓ (SubzoneAssignmentSection) | ✓ (SubzoneAssignmentSection) | ✓ (SubzoneAssignmentSection) | — | JA | Initial + Config: Einheitlich SubzoneAssignmentSection (Dropdown + Create). Autoritativ: ConfigPanel. |
| **gpio** | ✓ | ✓ | ✓ (Hardware, teilw. disabled) | ✓ (disabled) | — | JA | Initial: Auswahl. Config: Read-only (GPIO nach Erstellung nicht änderbar). |
| **sensor_type / actuator_type** | ✓ | ✓ | ✓ (readonly) | ✓ (readonly) | — | JA | Initial: Auswahl. Config: Anzeige. Keine Dopplung (verschiedene Kontexte). |
| **operating_mode** | ✓ | — | — | — | — | NEIN | Nur AddSensorModal. Lücke: SensorConfigPanel hat kein operating_mode. |
| **timeout_seconds** | ✓ | — | — | — | — | NEIN | Nur AddSensorModal. Lücke: SensorConfigPanel hat kein timeout_seconds. |
| **max_runtime_seconds / max_on_duration** | — | ✓ | — | ✓ | — | JA | AddActuatorModal: nur Pump. ActuatorConfigPanel: Pump. Autoritativ: ConfigPanel. |
| **cooldown_seconds** | — | ✓ | — | ✓ (minPause) | — | JA | AddActuatorModal: Pump. ActuatorConfigPanel: Pump (min_pause_seconds). Autoritativ: ConfigPanel. |
| **inverted_logic / active_high** | — | ✓ | — | ✓ | — | JA | AddActuatorModal: Relay. ActuatorConfigPanel: Valve + Relay. Autoritativ: ConfigPanel. |
| **aux_gpio** | — | ✓ | — | — | — | NEIN | Nur AddActuatorModal. Lücke: ActuatorConfigPanel hat kein aux_gpio. |
| **description** | — | — | ✓ | ✓ | — | NEIN | Nur Config-Panels. |
| **enabled** | — | — | ✓ | ✓ | — | NEIN | Nur Config-Panels. |
| **threshold_min/max, warning_min/max** | — | — | ✓ | — | AlertConfigSection (custom) | Teilweise | SensorConfigPanel: Haupt-Schwellen. AlertConfigSection: Override für Alerts. Verschiedene Zwecke. |
| **unit** | ✓ (readonly) | — | ✓ | — | — | JA | AddSensorModal: readonly. SensorConfigPanel: editierbar. Autoritativ: ConfigPanel. |
| **metadata** | — | — | ✓ (DeviceMetadataSection) | ✓ (DeviceMetadataSection) | — | NEIN | Nur Config-Panels. |
| **i2c_address** | ✓ (selectedI2CAddress) | — | ✓ | — | — | JA | Initial: Auswahl. Config: Hardware-Sektion. Autoritativ: ConfigPanel. |
| **raw_value** | ✓ | — | — | — | — | NEIN | Nur AddSensorModal (Mock-Startwert). |

---

## Teil 3: Falsche Platzierung

| Feld | Aktuell | Soll | Begründung |
|------|---------|-----|------------|
| **operating_mode** | Nur AddSensorModal | Auch SensorConfigPanel (Zone 2) | Nachträgliche Änderung des Betriebsmodus (continuous/on_demand/scheduled/paused) muss möglich sein. |
| **timeout_seconds** | Nur AddSensorModal | Auch SensorConfigPanel (Zone 2) | Timeout für Stale-Erkennung sollte nachträglich änderbar sein. |
| **aux_gpio** | Nur AddActuatorModal | Auch ActuatorConfigPanel (Typ-Einstellungen, Valve) | Ventile mit H-Bridge: Direction-Pin sollte im Config-Panel änderbar sein. |
| **subzone_id (Initial)** | Freitext-Input | SubzoneAssignmentSection | ✅ Erledigt (Auftrag 3, 2026-03-05): Beide Modals nutzen SubzoneAssignmentSection. |
| **Schwellwerte (Sensor)** | SensorConfigPanel + AlertConfigSection (custom_thresholds) | Klar trennen | SensorConfigPanel: Haupt-Schwellen (threshold_min/max, warning_min/max). AlertConfigSection: Override nur für Alert-Severity. Risiko: Verwechslung. Dokumentation/UX klären. |

---

## Teil 4: Lücken / Fehlende Felder

| Feld | Erwartet in | Fehlt | Priorität |
|------|-------------|-------|-----------|
| operating_mode | SensorConfigPanel | ✓ | HOCH |
| timeout_seconds | SensorConfigPanel | ✓ | HOCH |
| aux_gpio | ActuatorConfigPanel | ✓ | MITTEL |
| schedule_config | SensorConfigPanel (bei operating_mode=scheduled) | ✓ | MITTEL |
| interval_ms | SensorConfigPanel | ✓ | NIEDRIG (Backend hat es; Frontend nutzt default) |
| pwm_value (Initial) | AddActuatorModal | Teilweise | NIEDRIG (Slider vorhanden, wird nicht persistiert — OK für Initial) |

---

## Teil 5: Sektionen-Übersicht

| Sektion | Panel | Zweck | Eigene API? |
|---------|-------|-------|-------------|
| Grundeinstellungen | Sensor, Aktor | name, description, unit (Sensor), enabled, subzone | Nein (createOrUpdate) |
| SubzoneAssignmentSection | Sensor, Aktor | subzone_id | assignSubzone bei „Neue Subzone“; sonst createOrUpdate |
| Schwellwerte & Alarme | Sensor | threshold_min/max, warning_min/max | Nein |
| Kalibrierung | Sensor | calibration (pH/EC/Moisture) | Nein |
| Hardware & Interface | Sensor | gpio, i2c_address, i2c_bus, measure_range, pulses_per_liter | Nein |
| Live-Vorschau | Sensor | — | Nein (read-only) |
| Typ-Einstellungen | Aktor | max_runtime, min_pause, max_open_time, active_high, frequency, duty_max, switch_delay | Nein |
| Safety-Status | Aktor | — | Nein (read-only) |
| AlertConfigSection | Sensor, Aktor | alerts_enabled, suppression_*, custom_thresholds, severity_override | Ja: updateAlertConfig |
| RuntimeMaintenanceSection | Sensor, Aktor | last_maintenance, maintenance_log | Ja: updateRuntime |
| DeviceMetadataSection | Sensor, Aktor | manufacturer, model, … | Nein (config.metadata) |
| LinkedRulesSection | Sensor, Aktor | — | Nein (read-only, logicStore) |

---

## Teil 6: Priorisierte Konsolidierungs-Liste

### KRITISCH

| # | Maßnahme | Begründung |
|---|----------|------------|
| 1 | **description + unit Backend-Persistenz** | Frontend sendet, Backend-Schema ignoriert (Pydantic). Entweder SensorConfigCreate erweitern ODER in metadata einbetten. |
| 2 | **operating_mode + timeout_seconds in SensorConfigPanel** | Nutzer können Betriebsmodus/Timeout nach Erstellung nicht ändern. DB hat die Felder bereits. |
| 3 | **Subzone Initial-Panel: Freitext → SubzoneAssignmentSection** | ✅ Erledigt (Auftrag 3, 2026-03-05). |

### HOCH

| # | Maßnahme | Begründung |
|---|----------|------------|
| 4 | **ActuatorConfigPanel Load: Feldnamen anpassen** | Panel liest max_on_duration_ms, min_pause_seconds — Backend liefert max_runtime_seconds, cooldown_seconds. |
| 5 | **aux_gpio in ActuatorConfigPanel** | Ventile mit H-Bridge: Direction-Pin nachträglich nicht änderbar. Backend: actuator_metadata.aux_gpio. |
| 6 | **Dokumentation: Schwellwerte vs. Alert custom_thresholds** | Zwei Stellen für Schwellen (SensorConfigPanel + AlertConfigSection) — klare Trennung dokumentieren. |
| 7 | **schedule_config in SensorConfigPanel** | Bei operating_mode=scheduled fehlt Konfiguration. DB hat schedule_config. |

### MITTEL

| # | Maßnahme | Begründung |
|---|----------|------------|
| 8 | **AddSensorModal: subzone_id als Dropdown** | ✅ Erledigt (Auftrag 3, 2026-03-05). |
| 9 | **AddActuatorModal: subzone_id als Dropdown** | ✅ Erledigt (Auftrag 3, 2026-03-05). |
| 10 | **Einheitliche Feld-Reihenfolge** | Initial-Panels und Config-Panels: gleiche logische Reihenfolge (z.B. name vor subzone). |

### NIEDRIG

| # | Maßnahme | Begründung |
|---|----------|------------|
| 11 | **interval_ms in SensorConfigPanel** | Backend unterstützt; optional in Zone 2. |
| 12 | **Design-Review: Eine Stelle pro Einstellung** | Prüfen ob weitere Felder doppelt sind und konsolidiert werden können. |

---

## Anhang: API-Feld-Mapping (Backend)

### SensorConfigCreate (Frontend → Backend)

| Frontend | Backend | Quelle |
|----------|---------|--------|
| name | name | AddSensorModal, SensorConfigPanel |
| subzone_id | subzone_id | Beide |
| gpio | gpio | Beide |
| sensor_type | sensor_type | AddSensorModal |
| operating_mode | operating_mode | AddSensorModal (fehlt Config) |
| timeout_seconds | timeout_seconds | AddSensorModal (fehlt Config) |
| threshold_min/max | threshold_min/max | SensorConfigPanel |
| warning_min/max | warning_min/max | SensorConfigPanel |
| i2c_address | i2c_address | Beide |
| onewire_address | onewire_address | AddSensorModal (OneWire) |
| metadata | metadata | SensorConfigPanel (DeviceMetadataSection) |
| calibration | calibration | SensorConfigPanel |

### ActuatorConfigCreate (Frontend → Backend)

| Frontend | Backend | Quelle |
|----------|---------|--------|
| name | name | Beide |
| subzone_id | subzone_id | Beide |
| gpio | gpio | AddActuatorModal |
| actuator_type | actuator_type | AddActuatorModal |
| aux_gpio | aux_gpio | AddActuatorModal (fehlt Config) |
| inverted_logic | inverted_logic / active_high | Beide |
| max_runtime_seconds | max_runtime_seconds / max_on_duration_ms | Beide (Backend ms in Response) |
| cooldown_seconds | cooldown_seconds / min_pause_seconds | Beide |
| metadata | metadata | ActuatorConfigPanel |

---

## Teil 7: Server & DB Reality-Check (Ergänzung durch server-development + db-inspector)

### 7.1 Datenbank-Architektur (subzone_configs)

| Aspekt | Realität | Auswirkung |
|--------|----------|------------|
| **sensor_configs** | Keine `subzone_id`-Spalte | Subzone-Zuordnung über `subzone_configs.assigned_gpios` (GPIO-Array) |
| **actuator_configs** | Keine `subzone_id`-Spalte | Analog: SubzoneService.assign_subzone() schreibt in subzone_configs |
| **API subzone_id** | Request-Schema akzeptiert subzone_id | API ruft SubzoneService.assign_subzone(esp_id, subzone_id, assigned_gpios=[gpio]) auf |
| **GET subzone_id** | SubzoneRepository.get_subzone_by_gpio() | Response subzone_id wird per GPIO-Lookup aus subzone_configs ermittelt |

**Quelle:** `subzone_service.py`, `sensors.py` create_or_update, `actuators.py` create_or_update

### 7.2 Sensor DB-Model vs. Schema

| DB-Model (sensor_configs) | API-Schema | Mapping |
|---------------------------|------------|---------|
| sensor_name | name | Direkt |
| sample_interval_ms | interval_ms | Direkt |
| thresholds (JSON: min, max, warning_min, warning_max) | threshold_min/max, warning_min/max | Extraktion aus Dict |
| calibration_data | calibration | Direkt |
| sensor_metadata | metadata | Direkt |
| operating_mode | operating_mode | **In DB vorhanden** (Phase 2A) |
| timeout_seconds | timeout_seconds | **In DB vorhanden** |
| timeout_warning_enabled | timeout_warning_enabled | **In DB vorhanden** |
| schedule_config | schedule_config | **In DB vorhanden** |
| **description** | — | **NICHT im SensorConfigCreate-Schema** → wird verworfen |
| **unit** | — | **NICHT im SensorConfigCreate-Schema** → wird verworfen |

**Kritisch:** Frontend sendet `description` und `unit` als Top-Level; Backend-Schema hat diese Felder nicht. Pydantic ignoriert unbekannte Felder → **description und unit werden nicht persistiert**. Sollten in `metadata` (sensor_metadata) landen.

### 7.3 Actuator DB-Model vs. Schema

| DB/API | Speicherort | Felder |
|--------|-------------|--------|
| ActuatorConfigCreate | Top-Level | max_runtime_seconds, cooldown_seconds, pwm_frequency, servo_min_pulse, servo_max_pulse, metadata, subzone_id |
| safety_constraints (JSON) | actuator_configs | max_runtime, cooldown_period (API mappt) |
| actuator_metadata (JSON) | actuator_configs | pwm_frequency, servo_min_pulse, servo_max_pulse, **aux_gpio**, **inverted_logic** (ConfigBuilder extrahiert für ESP32) |
| **aux_gpio, inverted_logic** | Nicht in ActuatorConfigCreate | Nur in metadata; ConfigBuilder liest actuator_metadata.aux_gpio, .inverted_logic |

**ActuatorConfigPanel-Feld-Mismatch:** Panel erwartet `max_on_duration_ms`, `min_pause_seconds`, `max_open_time_seconds`, `active_high`, `frequency`, `duty_max`, `switch_delay_ms`. Backend liefert: `max_runtime_seconds`, `cooldown_seconds`, `pwm_frequency`. Valve/Relay-spezifische Felder (max_open_time, active_high, switch_delay, duty_max) sind **nicht im ActuatorConfigResponse-Schema** — vermutlich in actuator_metadata; Frontend-Load-Logik prüfen.

### 7.4 Sensor Unique Constraint

```sql
UNIQUE(esp_id, gpio, sensor_type, onewire_address, i2c_address)
```

Ermöglicht: Mehrere DS18B20 auf gleichem GPIO (onewire_address), SHT31 Temp+Humidity (sensor_type), I2C an verschiedenen Adressen.

### 7.5 Alert/Runtime Endpoints

| Endpoint | Entity-ID | Tabelle |
|----------|-----------|---------|
| PATCH /sensors/{sensor_id}/alert-config | sensor_configs.id (UUID) | sensor_configs.alert_config (JSONB) |
| PATCH /sensors/{sensor_id}/runtime | sensor_configs.id | sensor_configs.runtime_stats (JSONB) |
| PATCH /actuators/{actuator_id}/alert-config | actuator_configs.id | actuator_configs.alert_config (JSONB) |
| PATCH /actuators/{actuator_id}/runtime | actuator_configs.id | actuator_configs.runtime_stats (JSONB) |

**Hinweis:** sensorDbId/actuatorDbId müssen nach erstem createOrUpdate verfügbar sein (Response enthält id).

### 7.6 ConfigBuilder → ESP32

- sensor_metadata.subzone_id → subzone_id (für ESP32-Payload)
- actuator_metadata.subzone_id, aux_gpio, inverted_logic → ESP32-Config

---

## Teil 8: Zusätzliche Lücken (aus Server/DB-Check)

| Lücke | Schwere | Detail |
|-------|---------|--------|
| **description, unit** | KRITISCH | Frontend sendet, Backend-Schema ignoriert. Entweder: Schema erweitern ODER in metadata.merge() einbetten. |
| **ActuatorConfigPanel Load** | HOCH | Panel liest max_on_duration_ms, min_pause_seconds — Backend liefert max_runtime_seconds, cooldown_seconds. Feldnamen-Anpassung nötig. |
| **Valve/Relay-spezifische Felder** | MITTEL | max_open_time, active_high, switch_delay, duty_max: Backend speichert in actuator_metadata; API-Schema könnte erweitert werden. |

---

## Hinweis: Potenzielle Backend-Feld-Mismatches (ActuatorConfigPanel)

Das ActuatorConfigPanel liest beim Laden u.a. `max_on_duration_ms`, `min_pause_seconds`, `max_open_time_seconds`, `active_high`, `frequency`, `duty_max`, `switch_delay_ms`. Das Backend-Schema (ActuatorConfigResponse) liefert `max_runtime_seconds`, `cooldown_seconds`, `pwm_frequency`. Weitere Felder (max_open_time, active_high, duty_max, switch_delay) liegen in `actuator_metadata` (JSON). Frontend-Load-Logik muss Backend-Response-Struktur abbilden.

---

*Bericht erstellt: 2026-03-05. Ergänzt durch server-development + db-inspector Reality-Check. Keine Implementierung — nur Analyse.*
