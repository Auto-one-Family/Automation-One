# Server Dev Report: 500-Fehler GET sensors + GET zone monitor-data

## Modus: B (Implementierung / Bugfix)

## Auftrag

Analysiere die genauen Ursachen der 500-Fehler bei:
1. `GET /api/v1/sensors/{esp_id}/{gpio}` (z.B. MOCK_3D6C5444/0)
2. `GET /api/v1/zone/{zone_id}/monitor-data` (z.B. zone_id=test)

Minimale Fixes vorschlagen (try/except, None-Checks, Typ-Anpassungen). Kein Refactoring.

---

## 1) GET /api/v1/sensors/{esp_id}/{gpio}

### Codebase-Analyse

- **Endpoint:** `src/api/v1/sensors.py` → `get_sensor()`
- **Ablauf:** `esp_repo.get_by_device_id(esp_id)` → `sensor_repo.get_by_esp_gpio_and_type()` oder `get_all_by_esp_and_gpio()` → `sensor_repo.get_latest_reading()` → `subzone_repo.get_subzone_by_gpio(esp_id, gpio)` → `_model_to_response(sensor, esp_id, subzone_id=...)` → Response-Serialisierung

### Gefundene Fehlerquellen

| Stelle | Risiko | Erklärung |
|--------|--------|-----------|
| **SensorConfig.gpio** | **Ursache 500** | DB-Model `SensorConfig.gpio` ist `Optional[int]` (nullable für I2C/OneWire). Schema `SensorConfigResponse` erbt von `SensorConfigBase` mit `gpio: int` (required). Wenn `sensor.gpio is None`, baut `_model_to_response(..., gpio=sensor.gpio)` ein Objekt mit `gpio=None` → Pydantic ValidationError bei Response-Serialisierung → 500. |
| get_by_device_id | unkritisch | Gibt `None` zurück → ESPNotFoundError (404). |
| get_all_by_esp_and_gpio | unkritisch | Gibt Liste zurück; leere Liste → SensorNotFoundException (404). |
| get_latest_reading | unkritisch | Gibt `Optional[SensorData]`; Aufrufer prüft `if latest` und setzt `latest_value`/`latest_quality`/`latest_timestamp` nur bei Vorhandensein. |
| get_subzone_by_gpio(esp_id, gpio) | unkritisch | `esp_id` = Path-String, `SubzoneRepository` erwartet `str`; `SubzoneConfig.esp_id` ist `str` (FK auf `esp_devices.device_id`). Kein Typ-Mix. |
| _model_to_response esp_id | unkritisch | `sensor.esp_id` ist UUID (FK `esp_devices.id`), Schema `SensorConfigResponse.esp_id` ist `uuid.UUID`; `esp_device_id` wird explizit als String übergeben. Kein Serialisierungsfehler. |

### Umgesetzter Fix

- **Datei:** `src/api/v1/sensors.py`
- **Änderung:** In `_model_to_response()` bei der Erstellung von `SensorConfigResponse`:
  - **Vorher:** `gpio=sensor.gpio`
  - **Nachher:** `gpio=sensor.gpio if sensor.gpio is not None else 0`
- **Begründung:** Schema verlangt `int`; Fallback 0 ist gültig (ge=0, le=39). Eine Signatur-Erweiterung von `_model_to_response` wurde bewusst vermieden, damit alle Aufrufer (get_sensor, list_sensors, list_onewire_sensors, create_or_update_sensor, delete_sensor) automatisch abgedeckt sind.

---

## 2) GET /api/v1/zone/{zone_id}/monitor-data

### Codebase-Analyse

- **Service:** `src/services/monitor_data_service.py` → `get_zone_monitor_data(zone_id)`
- **Ablauf:** ESPs in Zone laden → SubzoneConfigs (parent_zone_id == zone_id) → gpio_to_subzone Map → Sensor-/Actuator-Configs → `get_latest_readings_batch_by_config(sensor_keys)` → ActuatorState laden → Einträge bauen (Sensor/Actuator) → SubzoneGroups → ZoneMonitorData

### Gefundene Fehlerquellen

| Stelle | Risiko | Erklärung |
|--------|--------|-----------|
| **reading.processed_value / raw_value** | **Ursache 500** | Wenn `reading` existiert, aber sowohl `processed_value` als auch `raw_value` `None` sind, wird `float(None)` aufgerufen → **TypeError** → 500. |
| SubzoneConfig.parent_zone_id vs. ESPDevice.zone_id | unkritisch | Beide sind string; Abfrage nutzt `parent_zone_id == zone_id` und ESPs mit `zone_id == zone_id`. Kein Typ-Mix. |
| get_latest_readings_batch_by_config(sensor_keys) | unkritisch | Bei leerer Liste gibt die Methode `{}` zurück; Keys sind `(uuid.UUID, int, str)` wie erwartet. Keine Exception. |
| state_map Lookup (ac.esp_id, gpio) | unkritisch | `ActuatorState.esp_id` und `ActuatorConfig.esp_id` sind UUID; Lookup ist konsistent. |
| reading.timestamp | unkritisch | Es wird `reading.timestamp.isoformat() if reading.timestamp else None` verwendet; kein Zugriff auf None. |
| sc.gpio None | unkritisch | Es gibt `if sc.gpio is None: continue` vor der weiteren Verarbeitung. |
| ac.gpio | unkritisch | `ActuatorConfig.gpio` ist `Mapped[int]`, nicht optional. |

### Umgesetzter Fix

- **Datei:** `src/services/monitor_data_service.py`
- **Änderung:** Beim Setzen von `raw_value` aus einem vorhandenen `reading`:
  - **Vorher:**  
    `raw_value = float(reading.processed_value if reading.processed_value is not None else reading.raw_value)`  
    → Wenn beide None sind: `float(None)` → TypeError.
  - **Nachher:**  
    Zuerst `val = reading.processed_value if ... else reading.raw_value`, dann  
    `raw_value = float(val) if val is not None else None`.
- **Begründung:** Nur wenn ein Wert vorhanden ist, wird konvertiert; sonst bleibt `raw_value=None`. Schema `SubzoneSensorEntry.raw_value` ist `Optional[float]`.

---

## Qualitätsprüfung (8-Dimensionen)

| # | Dimension | Prüfung |
|---|-----------|--------|
| 1 | Struktur & Einbindung | Nur bestehende Module geändert, keine neuen Imports. |
| 2 | Namenskonvention | Unverändert. |
| 3 | Rückwärtskompatibilität | Response-Formate unverändert; Sensor-Response liefert bei gpio=None nun 0 statt fehlzuschlagen. |
| 4 | Wiederverwendbarkeit | Keine neuen Patterns, nur defensive Checks. |
| 5 | Speicher & Ressourcen | Keine Änderung. |
| 6 | Fehlertoleranz | Explizite None-Checks verhindern ValidationError und TypeError. |
| 7 | Seiteneffekte | Keine anderen Handler oder Shared State betroffen. |
| 8 | Industrielles Niveau | Minimale, zielgerichtete Bugfixes. |

---

## Cross-Layer Impact

- **Frontend:** Keine Anpassung nötig. GET sensors liefert weiterhin ein Objekt mit `gpio` (nun 0 statt Abbruch bei DB-gpio=None). Monitor-Daten: `raw_value` kann weiterhin `null` sein.
- **ESP32 / MQTT:** Nicht betroffen.

---

## Verifikation

- Linter: `ruff` für geänderte Dateien ohne neue Meldungen.
- Empfohlene manuelle Checks:
  - `GET /api/v1/sensors/MOCK_3D6C5444/0` mit Sensor, dessen `gpio` in der DB NULL ist (falls testweise vorhanden).
  - `GET /api/v1/zone/test/monitor-data` mit Zone, in der ein Sensor-Latest-Reading existiert, aber sowohl `processed_value` als auch `raw_value` NULL sind.

---

## Ergebnis

- **sensors.py:** Ein Fix in `_model_to_response()`: `gpio` bei None mit 0 belegt, damit die Response-Serialisierung nicht mit ValidationError scheitert.
- **monitor_data_service.py:** Ein Fix beim Aufbau von `raw_value`: `float()` nur aufrufen, wenn ein Wert vorhanden ist; sonst `raw_value=None`.

Beide Änderungen sind minimale Defensiv-Checks ohne Refactoring.
