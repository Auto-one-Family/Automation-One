# GPIO & Config Flow - Vollständige Server-Analyse

**Analysiert am:** 2026-01-11
**Analysiert von:** Claude (Entwickler-Rolle)
**Auftraggeber:** Robin (Manager)
**Status:** VOLLSTÄNDIG

---

## Zusammenfassung

Diese Analyse dokumentiert den vollständigen Sensor/Actuator-Konfigurationsflow von Frontend → Server → ESP32. Der Server (God-Kaiser) fungiert als zentrales "Gehirn" des Systems und führt GPIO-Validierung, Konfigurationspersistierung und MQTT-basierte Kommunikation mit den ESP32-Geräten durch.

**Kern-Erkenntnisse:**
- ✅ Server-seitige GPIO-Validierung ist vollständig implementiert (GpioValidationService)
- ✅ Config-Dispatch erfolgt automatisch nach Create/Update/Delete
- ✅ ESP32 bestätigt Config-Empfang via config_response Topic
- ✅ Multi-Value-Sensoren werden unterstützt (UNIQUE auf esp_id+gpio+sensor_type)
- ✅ Phase 4: Config-Status-Tracking (pending/applied/failed) in DB

---

## 1. REST API Endpoints

### 1.1 Sensor-Endpoints (`api/v1/sensors.py`)

| Methode | Endpoint | Beschreibung | Auth-Level | GPIO-Validierung |
|---------|----------|--------------|------------|------------------|
| GET | `/` | Liste aller Sensoren (paginiert) | ActiveUser | ❌ |
| GET | `/{esp_id}/{gpio}` | Einzelner Sensor | ActiveUser | ❌ |
| **POST** | `/{esp_id}/{gpio}` | **Create/Update (Upsert)** | OperatorUser | ✅ GpioValidationService |
| **DELETE** | `/{esp_id}/{gpio}` | Sensor löschen + MQTT-Update | OperatorUser | ❌ |
| GET | `/data` | Sensor-Daten abfragen (Zeit-Range) | ActiveUser | ❌ |
| GET | `/data/by-source/{source}` | Daten nach Quelle (mock/prod/test) | ActiveUser | ❌ |
| GET | `/data/stats/by-source` | Count nach Quelle | ActiveUser | ❌ |
| GET | `/{esp_id}/{gpio}/stats` | Statistiken (min/max/avg) | ActiveUser | ❌ |
| **POST** | `/{esp_id}/{gpio}/measure` | On-Demand Messung triggern | OperatorUser | ❌ (ESP-Prüfung) |

**Code-Referenzen:**
- Create/Update: `sensors.py:285-436`
- GPIO-Validierung: `sensors.py:319-351`
- MQTT-Dispatch: `sensors.py:419-433`
- Delete mit MQTT-Update: `sensors.py:444-523`

### 1.2 Actuator-Endpoints (`api/v1/actuators.py`)

| Methode | Endpoint | Beschreibung | Auth-Level | GPIO-Validierung |
|---------|----------|--------------|------------|------------------|
| GET | `/` | Liste aller Aktoren (paginiert) | ActiveUser | ❌ |
| GET | `/{esp_id}/{gpio}` | Einzelner Aktor | ActiveUser | ❌ |
| **POST** | `/{esp_id}/{gpio}` | **Create/Update (Upsert)** | OperatorUser | ✅ GpioValidationService |
| **POST** | `/{esp_id}/{gpio}/command` | Command senden (via SafetyService) | OperatorUser | ❌ (SafetyService validiert) |
| GET | `/{esp_id}/{gpio}/status` | Aktueller Status | ActiveUser | ❌ |
| **POST** | `/emergency_stop` | **CRITICAL: Alle Aktoren stoppen** | OperatorUser | ❌ |
| **DELETE** | `/{esp_id}/{gpio}` | Aktor löschen + OFF-Command + MQTT-Update | OperatorUser | ❌ |
| GET | `/{esp_id}/{gpio}/history` | Command-Historie | ActiveUser | ❌ |

**Code-Referenzen:**
- Create/Update: `actuators.py:271-386`
- GPIO-Validierung: `actuators.py:315-347`
- Command mit SafetyService: `actuators.py:394-483`
- Emergency Stop: `actuators.py:570-703`
- Delete mit OFF-Command: `actuators.py:711-790`

### 1.3 ESP-Endpoints (`api/v1/esp.py`)

| Methode | Endpoint | Beschreibung | Auth-Level |
|---------|----------|--------------|------------|
| GET | `/devices` | Liste aller ESPs (paginiert) | ActiveUser |
| GET | `/devices/{esp_id}` | ESP-Details mit Sensor/Actuator-Count | ActiveUser |
| POST | `/devices` | Neues ESP registrieren | OperatorUser |
| PATCH | `/devices/{esp_id}` | ESP-Daten aktualisieren | OperatorUser |
| DELETE | `/devices/{esp_id}` | ESP löschen (inkl. Sensoren/Aktoren!) | OperatorUser |
| POST | `/devices/{esp_id}/config` | Config-Update via MQTT senden | OperatorUser |
| POST | `/devices/{esp_id}/restart` | Restart-Command | OperatorUser |
| POST | `/devices/{esp_id}/reset` | Factory Reset (confirm=true erforderlich) | OperatorUser |
| GET | `/devices/{esp_id}/health` | Health-Metriken aus device_metadata | ActiveUser |
| **GET** | `/devices/{esp_id}/gpio-status` | **GPIO-Verfügbarkeit (Phase 2)** | ActiveUser |
| POST | `/devices/{esp_id}/assign_kaiser` | Kaiser-Zuweisung | OperatorUser |
| GET | `/discovery` | Discovery-Ergebnisse | ActiveUser |

**Code-Referenzen:**
- GPIO-Status Endpoint: `esp.py:808-894`
- Device Delete (cascaded): `esp.py:463-519`

---

## 2. GPIO-Validierung (Server-Seite)

### 2.1 GpioValidationService (`gpio_validation_service.py`)

**Prüfreihenfolge:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SYSTEM-PIN CHECK (Statisch, keine DB-Query)                  │
│    SYSTEM_RESERVED_PINS = {0, 1, 2, 3, 6, 7, 8, 9, 10, 11}     │
│    → Boot-Strapping, UART, Flash SPI                            │
│    ERGEBNIS: GpioConflictType.SYSTEM                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Pass
┌─────────────────────────────────────────────────────────────────┐
│ 2. SENSOR-CHECK IN DB                                           │
│    sensor_repo.get_by_esp_and_gpio(esp_db_id, gpio)            │
│    → Prüft ob Sensor auf diesem GPIO existiert                  │
│    → exclude_sensor_id für Update-Operationen                   │
│    ERGEBNIS: GpioConflictType.SENSOR                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Pass
┌─────────────────────────────────────────────────────────────────┐
│ 3. ACTUATOR-CHECK IN DB                                         │
│    actuator_repo.get_by_esp_and_gpio(esp_db_id, gpio)          │
│    → Prüft ob Actuator auf diesem GPIO existiert                │
│    → exclude_actuator_id für Update-Operationen                 │
│    ERGEBNIS: GpioConflictType.ACTUATOR                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Pass
┌─────────────────────────────────────────────────────────────────┐
│ 4. ESP-GEMELDETEN STATUS PRÜFEN (Phase 1 Daten)                 │
│    Liest aus esp.device_metadata.gpio_status                    │
│    → owner="system" → GpioConflictType.SYSTEM                   │
│    → owner="sensor"/"actuator" ohne DB-Eintrag → WARNING        │
│    ERGEBNIS: GpioConflictType.ESP_RESERVED oder WARNING         │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Pass
┌─────────────────────────────────────────────────────────────────┐
│ ✅ GPIO VERFÜGBAR                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Code-Referenz:** `gpio_validation_service.py:114-208`

### 2.2 System-reservierte Pins

```python
SYSTEM_RESERVED_PINS: Set[int] = {
    0,   # Boot-Strapping (muss HIGH sein beim Boot)
    1,   # TX0 (UART)
    2,   # Boot-Strapping (muss LOW sein beim Boot für Flash)
    3,   # RX0 (UART)
    6,   # Flash SPI CLK
    7,   # Flash SPI D0
    8,   # Flash SPI D1
    9,   # Flash SPI D2
    10,  # Flash SPI D3
    11,  # Flash SPI CMD
}
```

**Code-Referenz:** `gpio_validation_service.py:57-68`

### 2.3 Validierung-Response bei Konflikt

Bei GPIO-Konflikt wirft der Server HTTP 409 CONFLICT:

```json
{
    "error": "GPIO_CONFLICT",
    "gpio": 32,
    "conflict_type": "sensor",
    "conflict_component": "ds18b20_temperature",
    "conflict_id": "550e8400-e29b-41d4-a716-446655440000",
    "message": "GPIO 32 ist bereits von Sensor 'Temp Sensor 1' belegt"
}
```

**Code-Referenz:** `sensors.py:341-351`, `actuators.py:337-347`

---

## 3. MQTT Communication Flow

### 3.1 Topic-Schema

**Server → ESP (Publish):**

| Topic | Zweck | QoS |
|-------|-------|-----|
| `kaiser/{kaiser_id}/esp/{esp_id}/config` | Combined Sensor/Actuator Config | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/config/sensor/{gpio}` | Individual Sensor Config | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/config/actuator/{gpio}` | Individual Actuator Config | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | Actuator Command | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` | Sensor Command (Measure) | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed` | Pi-Enhanced Response | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | System Command (Reboot, Reset) | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | Zone Assignment | 2 |

**ESP → Server (Subscribe/Handler):**

| Topic Pattern | Handler | Zweck |
|---------------|---------|-------|
| `kaiser/+/esp/+/sensor/+/data` | SensorDataHandler | Sensor-Messwerte |
| `kaiser/+/esp/+/actuator/+/status` | ActuatorHandler | Actuator-Status |
| `kaiser/+/esp/+/actuator/+/response` | ActuatorResponseHandler | Command-Bestätigung |
| `kaiser/+/esp/+/actuator/+/alert` | ActuatorAlertHandler | Alerts (Timeout, Error) |
| `kaiser/+/esp/+/config_response` | ConfigHandler | Config ACK |
| `kaiser/+/esp/+/system/heartbeat` | HeartbeatHandler | Health-Status |
| `kaiser/+/esp/+/zone/ack` | ZoneAckHandler | Zone-Bestätigung |

**Code-Referenzen:**
- TopicBuilder: `mqtt/topics.py:21-938`
- Publisher: `mqtt/publisher.py:29-424`

### 3.2 Config-Dispatch Flow (Server → ESP)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. API: POST /v1/sensors/{esp_id}/{gpio}                         │
│    oder POST /v1/actuators/{esp_id}/{gpio}                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. GPIO-Validierung via GpioValidationService                    │
│    → Bei Konflikt: HTTP 409 CONFLICT, ABBRUCH                    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. DB-Save: Create/Update SensorConfig oder ActuatorConfig      │
│    → db.commit()                                                 │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 4. ConfigPayloadBuilder.build_combined_config(esp_id, db)       │
│    → Lädt ALLE aktiven Sensoren/Aktoren für diesen ESP          │
│    → Baut ESP32-kompatibles Payload                             │
│    → Prüft GPIO-Konflikte erneut (Defense-in-Depth)             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 5. ESPService.send_config(esp_id, combined_config)              │
│    → Prüft offline_behavior ("warn", "skip", "fail")            │
│    → Default: "warn" - sendet auch wenn ESP offline             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 6. Publisher.publish_config(esp_id, config)                     │
│    → Topic: kaiser/{kaiser_id}/esp/{esp_id}/config              │
│    → QoS 2 (Exactly Once)                                       │
│    → Retry mit Exponential Backoff                              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 7. ESP32 empfängt Config via MQTT                               │
│    → Parsed JSON                                                 │
│    → Reserviert GPIOs via GPIOManager                           │
│    → Initialisiert Sensoren/Aktoren                             │
│    → Speichert in NVS                                           │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 8. ESP32 sendet config_response                                  │
│    → Topic: kaiser/{kaiser_id}/esp/{esp_id}/config_response     │
│    → Status: "success" | "partial_success" | "error"            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 9. ConfigHandler verarbeitet Response                            │
│    → Loggt Ergebnis (✅ / ⚠️ / ❌)                                │
│    → Speichert in audit_log                                     │
│    → Bei Fehler: Update config_status="failed" in DB            │
│    → WebSocket Broadcast für Frontend                           │
└──────────────────────────────────────────────────────────────────┘
```

**Code-Referenzen:**
- API Create/Update: `sensors.py:285-436`, `actuators.py:271-386`
- ConfigPayloadBuilder: `config_builder.py:48-229`
- ESPService.send_config: `esp_service.py:268-367`
- Publisher.publish_config: `publisher.py:207-267`
- ConfigHandler: `config_handler.py:65-367`

### 3.3 Config-Payload Schema (Server → ESP)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config`

```json
{
    "sensors": [
        {
            "gpio": 32,
            "sensor_type": "ph_sensor",
            "sensor_name": "Pool pH",
            "active": true,
            "sample_interval_ms": 30000,
            "raw_mode": true,
            "subzone_id": null
        },
        {
            "gpio": 33,
            "sensor_type": "ds18b20_temperature",
            "sensor_name": "Wassertemperatur",
            "active": true,
            "sample_interval_ms": 10000,
            "raw_mode": true,
            "subzone_id": "heizung_zone"
        }
    ],
    "actuators": [
        {
            "gpio": 25,
            "actuator_type": "pump",
            "actuator_name": "Hauptpumpe",
            "active": true,
            "aux_gpio": 255,
            "critical": false,
            "inverted_logic": false,
            "default_state": false,
            "default_pwm": 0,
            "subzone_id": null
        }
    ],
    "timestamp": 1736553600
}
```

**Feld-Mapping (DB → ESP):**

| DB-Model Feld | ESP-Payload Feld | Transformation |
|---------------|------------------|----------------|
| sensor_name | sensor_name | Direct |
| sensor_type | sensor_type | Direct |
| gpio | gpio | Direct |
| enabled | active | Boolean mapping |
| sample_interval_ms | sample_interval_ms | Direct |
| sensor_metadata.subzone_id | subzone_id | Extracted from metadata |
| (always) | raw_mode | Always `true` |

**Code-Referenz:** `config_builder.py:91-136`

### 3.4 Config-Response Payload (ESP → Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`

**Success:**
```json
{
    "status": "success",
    "type": "sensor",
    "count": 2,
    "message": "2 sensors configured"
}
```

**Partial Success (Phase 4):**
```json
{
    "status": "partial_success",
    "type": "sensor",
    "count": 2,
    "failed_count": 1,
    "message": "2 configured, 1 failed",
    "failures": [
        {
            "type": "sensor",
            "gpio": 5,
            "error_code": 1002,
            "error": "GPIO_CONFLICT",
            "detail": "GPIO 5 reserved by actuator (pump_1)"
        }
    ]
}
```

**Error:**
```json
{
    "status": "error",
    "type": "sensor",
    "count": 0,
    "message": "Configuration failed",
    "error_code": "NVS_WRITE_FAILED",
    "failed_item": {
        "gpio": 32,
        "sensor_type": "ph_sensor"
    }
}
```

**ESP32 Error-Codes:**
| Code | Bedeutung |
|------|-----------|
| NONE | Success |
| JSON_PARSE_ERROR | Invalid JSON received |
| VALIDATION_FAILED | Config validation failed |
| GPIO_CONFLICT | GPIO already in use |
| NVS_WRITE_FAILED | NVS storage full/corrupted |
| TYPE_MISMATCH | Wrong data type |
| MISSING_FIELD | Required field missing |
| OUT_OF_RANGE | Value out of valid range |
| UNKNOWN_ERROR | Unexpected error |

**Code-Referenz:** `config_handler.py:52-62`, `config_handler.py:76-233`

### 3.5 Sensor-Data Flow (ESP → Server)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`

**Payload:**
```json
{
    "ts": 1736553600,
    "esp_id": "ESP_12AB34CD",
    "gpio": 32,
    "sensor_type": "ph_sensor",
    "raw": 2150,
    "value": 0.0,
    "unit": "",
    "quality": "stale",
    "raw_mode": true
}
```

**Required Fields:**
- `ts` oder `timestamp` (Unix Timestamp)
- `esp_id` (String)
- `gpio` (Integer)
- `sensor_type` (String)
- `raw` oder `raw_value` (Float)
- `raw_mode` (Boolean) - **KRITISCH: Muss true sein!**

**Handler-Flow:**
1. Topic parsen → esp_id, gpio extrahieren
2. Payload validieren (required fields, types)
3. ESP-Device in DB nachschlagen
4. Sensor-Config nachschlagen (Multi-Value Support!)
5. Data-Source erkennen (mock/test/production/simulation)
6. Pi-Enhanced Processing wenn `sensor_config.pi_enhanced == true`
7. Daten in DB speichern
8. WebSocket Broadcast
9. Logic-Engine triggern (non-blocking!)

**Code-Referenz:** `sensor_handler.py:47-617`

### 3.6 Actuator-Command Flow

**Server → ESP:**

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`

**Payload:**
```json
{
    "command": "ON",
    "value": 1.0,
    "duration": 0,
    "timestamp": 1736553600
}
```

**Commands:**
| Command | Value | Beschreibung |
|---------|-------|--------------|
| ON | 1.0 | Aktivieren (Binary) |
| OFF | 0.0 | Deaktivieren |
| PWM | 0.0-1.0 | PWM-Wert setzen |
| TOGGLE | - | Status wechseln |

**Flow:**
```
┌──────────────────────────────────────────────────────────────────┐
│ 1. API: POST /v1/actuators/{esp_id}/{gpio}/command               │
│    Body: { "command": "ON", "value": 1.0 }                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. SafetyService.validate_actuator_command()                     │
│    → Emergency Stop aktiv? → REJECT                              │
│    → Value in Range [0.0, 1.0]? → REJECT wenn nicht              │
│    → Actuator existiert und enabled? → REJECT wenn nicht         │
│    → Value in [min_value, max_value]? → REJECT wenn nicht        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. ActuatorService.send_command()                                │
│    → Safety-Result prüfen                                        │
│    → Publisher.publish_actuator_command()                        │
│    → Command in actuator_history loggen                          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 4. ESP32 empfängt Command                                        │
│    → ActuatorManager.controlActuator()                           │
│    → Lokale Safety-Checks (Defense-in-Depth)                     │
│    → GPIO steuern                                                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 5. ESP32 sendet Response                                         │
│    → Topic: kaiser/.../actuator/{gpio}/response                  │
│    → Payload: { "status": "success", "command": "ON", ... }      │
└──────────────────────────────────────────────────────────────────┘
```

**Code-Referenzen:**
- API Endpoint: `actuators.py:394-483`
- SafetyService: `safety_service.py:49-264`
- ActuatorService.send_command: `actuator_service.py:44-192`
- Publisher.publish_actuator_command: `publisher.py:64-98`

---

## 4. Database Models

### 4.1 SensorConfig Model

**Table:** `sensor_configs`

**Wichtige Felder:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| id | UUID | Primary Key |
| esp_id | UUID (FK) | Foreign Key zu esp_devices |
| gpio | Integer | GPIO-Pin Nummer |
| sensor_type | String(50) | Sensor-Typ (ph, temperature, etc.) |
| sensor_name | String(100) | Menschenlesbarer Name |
| enabled | Boolean | Aktiv/Inaktiv |
| pi_enhanced | Boolean | Pi-Enhanced Processing aktiviert |
| sample_interval_ms | Integer | Messintervall in ms |
| calibration_data | JSON | Kalibrierungsdaten |
| thresholds | JSON | Alert-Schwellwerte |
| sensor_metadata | JSON | Zusätzliche Metadaten |
| operating_mode | String(20) | continuous/on_demand/scheduled/paused |
| timeout_seconds | Integer | Timeout für Messung |
| schedule_config | JSON | Zeitplan-Konfiguration |
| **config_status** | String(20) | pending/applied/failed |
| **config_error** | String(50) | Error-Code bei failure |
| **config_error_detail** | String(200) | Error-Details |

**Constraints:**
```sql
UNIQUE (esp_id, gpio, sensor_type)  -- Multi-Value Support!
```

**Code-Referenz:** `db/models/sensor.py:19-201`

### 4.2 ActuatorConfig Model

**Table:** `actuator_configs`

**Wichtige Felder:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| id | UUID | Primary Key |
| esp_id | UUID (FK) | Foreign Key zu esp_devices |
| gpio | Integer | GPIO-Pin Nummer |
| actuator_type | String(50) | Actuator-Typ (pump, valve, pwm, relay) |
| actuator_name | String(100) | Menschenlesbarer Name |
| enabled | Boolean | Aktiv/Inaktiv |
| min_value | Float | Minimum erlaubter Wert (default 0.0) |
| max_value | Float | Maximum erlaubter Wert (default 1.0) |
| default_value | Float | Default-Wert bei Aktivierung |
| timeout_seconds | Integer | Auto-Shutoff Timeout |
| safety_constraints | JSON | Safety-Parameter (max_runtime, cooldown) |
| actuator_metadata | JSON | Zusätzliche Metadaten |
| **config_status** | String(20) | pending/applied/failed |
| **config_error** | String(50) | Error-Code bei failure |
| **config_error_detail** | String(200) | Error-Details |

**Constraints:**
```sql
UNIQUE (esp_id, gpio)  -- Keine Multi-Value für Aktoren
```

**Code-Referenz:** `db/models/actuator.py:17-169`

### 4.3 Unterschied: Multi-Value Support

| Modell | Constraint | Multi-Value? | Beispiel |
|--------|------------|--------------|----------|
| SensorConfig | `UNIQUE(esp_id, gpio, sensor_type)` | ✅ JA | SHT31 auf GPIO 21: sht31_temp + sht31_humidity |
| ActuatorConfig | `UNIQUE(esp_id, gpio)` | ❌ NEIN | Nur ein Actuator pro GPIO |

**Auswirkung:**
- Server kann für einen GPIO mehrere Sensoren mit unterschiedlichen `sensor_type` speichern
- SensorRepository.get_by_esp_gpio_and_type() für präzise Lookup
- ESP32-Seite muss mehrere sensor_types pro GPIO unterstützen

---

## 5. Safety-System

### 5.1 SafetyService (`safety_service.py`)

**Validierungs-Checks:**

1. **Emergency Stop (Absolute Priorität)**
   - Global: `_emergency_stop_active["__ALL__"]`
   - Per-ESP: `_emergency_stop_active[esp_id]`

2. **Value Range Check**
   - PWM-Werte MÜSSEN 0.0-1.0 sein
   - ESP32 konvertiert intern zu 0-255

3. **Actuator Existence & Enabled**
   - Config muss in DB existieren
   - `actuator_config.enabled == True`

4. **Value Min/Max Range**
   - `value >= min_value AND value <= max_value`

5. **Runtime Warning**
   - Warnung wenn Actuator bereits aktiv

**Code-Referenz:** `safety_service.py:84-213`

### 5.2 Defense-in-Depth

**Server-Seite:**
- GpioValidationService vor DB-Save
- SafetyService vor MQTT-Publish
- ConfigPayloadBuilder GPIO-Konflikt-Check

**ESP32-Seite:**
- GPIOManager.requestPin() bei Config-Empfang
- ActuatorManager.hasSensorOnGPIO() Check
- Emergency-Stop Flag in Actuator-Struct

---

## 6. Fehlerbehandlung

### 6.1 Was passiert wenn...

| Szenario | Server-Verhalten | ESP-Verhalten |
|----------|------------------|---------------|
| GPIO bereits belegt (Server-seitig) | HTTP 409 CONFLICT, kein MQTT | - |
| GPIO bereits belegt (ESP-seitig) | DB-Save erfolgreich, MQTT gesendet | config_response mit GPIO_CONFLICT, Server updated config_status="failed" |
| ESP offline | Default: Config trotzdem publiziert (MQTT queued), Warning log | - |
| Config-Parse-Fehler | - | config_response mit JSON_PARSE_ERROR |
| NVS voll | - | config_response mit NVS_WRITE_FAILED |
| Value out of range | HTTP 400 von SafetyService | - |
| Emergency-Stop aktiv | HTTP 400 "Emergency stop is active" | Commands werden lokal abgelehnt |
| MQTT-Publish fehlgeschlagen | Retry mit Exponential Backoff, dann Fehler-Log | - |
| DB-Session Fehler | Circuit-Breaker (resilient_session), dann Ablehnung | - |

### 6.2 Error-Code-System

**Server Error Ranges:**

| Range | Kategorie |
|-------|-----------|
| 4000-4099 | Config Errors (ESP_DEVICE_NOT_FOUND, CONFIG_PUBLISH_FAILED) |
| 4100-4199 | MQTT Errors (MQTT_CONNECT_FAILED, MQTT_PUBLISH_FAILED) |
| 4200-4299 | Validation Errors (MISSING_REQUIRED_FIELD, INVALID_GPIO) |
| 4300-4399 | Database Errors (DB_CONNECTION_FAILED) |
| 4400-4499 | Service Errors (OPERATION_TIMEOUT) |
| 4500-4599 | Audit Errors |

**Code-Referenz:** `core/error_codes.py` (nicht analysiert in dieser Datei, aber referenziert)

---

## 7. Offene Fragen / Unklarheiten

### 7.1 UNKLAR: I2C-Sensor GPIO-Handling

**Frage:** Wie behandelt der Server I2C-Sensoren (die GPIO 21/22 für SDA/SCL verwenden)?

**Beobachtung:**
- ESP32-seitig werden I2C-Sensoren OHNE GPIO-Reservierung hinzugefügt (`sensor_manager.cpp:231-324`)
- Server-seitig prüft GpioValidationService auf GPIO-Konflikte auch für I2C-Sensoren
- GPIO 21/22 sind nicht in SYSTEM_RESERVED_PINS

**Potentielles Problem:**
- User könnte GPIO 21 als Sensor-GPIO angeben
- Server würde akzeptieren (nicht in SYSTEM_RESERVED_PINS)
- ESP32 würde ablehnen (I2C bereits reserviert beim Boot)
- → config_response mit GPIO_CONFLICT

**Empfehlung:** I2C-Pins (21, 22) zu SYSTEM_RESERVED_PINS hinzufügen oder spezielle Logik für I2C-Sensoren implementieren.

### 7.2 UNKLAR: Config-Recovery nach ESP-Reboot

**Frage:** Was passiert wenn ESP nach Reboot nicht die gleiche Config aus NVS lädt?

**Beobachtung:**
- ESP speichert Config in NVS
- Server hat Config in PostgreSQL
- Bei Heartbeat wird keine Config-Sync getriggert

**Potentielles Problem:**
- ESP verliert Config (NVS-Korruption)
- Server denkt Config ist angewendet
- Keine automatische Re-Sync

**Empfehlung:** Heartbeat-Handler sollte Config-Hash vergleichen und bei Mismatch Re-Sync triggern.

### 7.3 UNKLAR: Concurrent Config-Updates

**Frage:** Was passiert bei gleichzeitigen Config-Updates für denselben ESP?

**Beobachtung:**
- API-Endpoints sind nicht explizit gelockt
- build_combined_config lädt ALLE aktiven Sensoren/Aktoren
- Zwei parallele Updates könnten sich überschreiben

**Empfehlung:** Optimistic Locking mit Version-Feld oder Mutex pro ESP-ID implementieren.

---

## 8. Potenzielle Schwachstellen

### 8.1 Risiko: GPIO 21/22 nicht geschützt

**Beschreibung:**
SYSTEM_RESERVED_PINS schützt Flash/UART-Pins, aber nicht I2C-Standard-Pins (21 SDA, 22 SCL).

**Auswirkung:**
User kann Sensor/Actuator auf GPIO 21/22 konfigurieren, ESP32 lehnt ab.

**Empfehlung:**
```python
SYSTEM_RESERVED_PINS = {
    0, 1, 2, 3, 6, 7, 8, 9, 10, 11,  # Flash, UART, Boot
    21, 22,  # I2C (wenn Hardware I2C nutzt)
}
```

### 8.2 Risiko: Input-Only Pins nicht validiert

**Beschreibung:**
GPIO 34, 35, 36, 39 sind Input-Only auf ESP32-WROOM. Server validiert dies nicht für Actuators.

**Auswirkung:**
User kann Actuator auf GPIO 34 konfigurieren, ESP32 kann nicht ausgeben.

**Empfehlung:**
GpioValidationService erweitern um Hardware-Capabilities-Check:
```python
INPUT_ONLY_PINS = {34, 35, 36, 39}

if is_actuator and gpio in INPUT_ONLY_PINS:
    return GpioValidationResult(
        available=False,
        conflict_type=GpioConflictType.HARDWARE,
        message=f"GPIO {gpio} is input-only and cannot be used for actuators"
    )
```

### 8.3 Risiko: ADC-Pins nicht validiert

**Beschreibung:**
Analog-Sensoren benötigen ADC-fähige Pins. Server validiert dies nicht.

**ADC-fähige Pins:** GPIO 32-39 (ADC1), GPIO 0, 2, 4, 12-15, 25-27 (ADC2)

**Auswirkung:**
User kann Analog-Sensor auf GPIO 5 konfigurieren, ESP32 kann nicht messen.

**Empfehlung:**
Sensor-Type-spezifische GPIO-Validierung implementieren.

### 8.4 Risiko: Race Condition bei Multi-User

**Beschreibung:**
Zwei Benutzer können gleichzeitig denselben GPIO für verschiedene Komponenten konfigurieren.

**Szenario:**
1. User A: POST /sensors/ESP_123/32 (ph_sensor)
2. User B: POST /actuators/ESP_123/32 (pump)
3. Beide GpioValidationService-Checks passieren (DB noch nicht committed)
4. Beide DB-Saves erfolgreich
5. Config-Conflict erst beim ESP-seitigen Apply

**Empfehlung:**
Row-Level Locking oder Application-Level Mutex pro ESP+GPIO.

### 8.5 Verbesserung: WebSocket-Feedback für Config-Status

**Beschreibung:**
config_status-Updates werden nicht aktiv ans Frontend gepusht.

**Auswirkung:**
Frontend muss pollen um config_status="failed" zu erkennen.

**Empfehlung:**
ConfigHandler.handle_config_ack() sollte bei status != "success" ein WebSocket-Event mit dem Fehler senden.

**Bereits implementiert:** `config_handler.py:199-227` - WebSocket Broadcast ist vorhanden, aber Frontend-Handling unklar.

---

## 9. Diagramme

### 9.1 Sensor-Create Flow

```
┌──────────┐    POST /sensors/ESP_123/32    ┌──────────┐
│ Frontend │ ──────────────────────────────> │  Server  │
└──────────┘                                 └────┬─────┘
                                                  │
     ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
     │                                            ↓                                            │
     │  ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐              │
     │  │ GpioValidation     │   │ SensorConfig       │   │ ConfigPayload      │              │
     │  │ Service            │──>│ (DB Save)          │──>│ Builder            │              │
     │  └────────────────────┘   └────────────────────┘   └─────────┬──────────┘              │
     │          │                                                   │                          │
     │          │ GPIO Conflict?                                    │                          │
     │          ↓                                                   ↓                          │
     │  HTTP 409 CONFLICT                          ┌────────────────────────┐                 │
     │                                             │ ESPService.send_config │                 │
     │                                             └───────────┬────────────┘                 │
     │                                                         │                               │
     │                                                         ↓                               │
     │                                             ┌────────────────────────┐                 │
     │                                             │ Publisher.publish_     │                 │
     │                                             │ config()               │                 │
     │                                             └───────────┬────────────┘                 │
     └─────────────────────────────────────────────────────────┼───────────────────────────────┘
                                                               │
                                              MQTT QoS 2       │
                                                               ↓
     ┌──────────────────────────────────────────────────────────────────────────────────────────┐
     │                                        ESP32                                             │
     │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
     │  │ MQTT Client  │──>│ ConfigParser │──>│ GPIOManager  │──>│ SensorManager.addSensor │ │
     │  │ (Receive)    │   │              │   │ (requestPin) │   │ (NVS Save)               │ │
     │  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┬───────────┘ │
     │                                                                           │             │
     │                                                                           ↓             │
     │                                                           ┌──────────────────────────┐ │
     │                                                           │ config_response          │ │
     │                                                           │ (success/partial/error)  │ │
     │                                                           └────────────┬─────────────┘ │
     └─────────────────────────────────────────────────────────────────────────┼───────────────┘
                                                                               │
                                              MQTT QoS 2                       │
                                                                               ↓
     ┌──────────────────────────────────────────────────────────────────────────────────────────┐
     │                                        Server                                            │
     │  ┌──────────────────────┐   ┌──────────────────────┐   ┌───────────────────────────────┐│
     │  │ ConfigHandler        │──>│ AuditLogRepo.log     │──>│ WebSocketManager.broadcast   ││
     │  │ .handle_config_ack   │   │                      │   │ ("config_response", {...})   ││
     │  └──────────────────────┘   └──────────────────────┘   └───────────────────────────────┘│
     │          │                                                                               │
     │          │ status != "success"?                                                          │
     │          ↓                                                                               │
     │  ┌──────────────────────┐                                                               │
     │  │ sensor_repo.update   │                                                               │
     │  │ (config_status=      │                                                               │
     │  │  "failed")           │                                                               │
     │  └──────────────────────┘                                                               │
     └──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Actuator-Command Flow

```
┌──────────┐  POST /actuators/ESP_123/25/command  ┌──────────┐
│ Frontend │ ────────────────────────────────────>│  Server  │
└──────────┘  { "command": "ON", "value": 1.0 }   └────┬─────┘
                                                       │
              ┌────────────────────────────────────────┼────────────────────────────────┐
              │                                        ↓                                │
              │  ┌──────────────────────────────────────────────────────────────────┐  │
              │  │                      SafetyService                               │  │
              │  │  ┌─────────────────────────────────────────────────────────────┐ │  │
              │  │  │ 1. Emergency Stop aktiv?           → REJECT (HTTP 400)      │ │  │
              │  │  │ 2. Value in [0.0, 1.0]?            → REJECT (HTTP 400)      │ │  │
              │  │  │ 3. Actuator existiert & enabled?   → REJECT (HTTP 404/400)  │ │  │
              │  │  │ 4. Value in [min_value, max_value]? → REJECT (HTTP 400)     │ │  │
              │  │  │ 5. Runtime Warning?                 → WARNING (continue)     │ │  │
              │  │  └─────────────────────────────────────────────────────────────┘ │  │
              │  └──────────────────────────────────────────────────────────────────┘  │
              │                                        │                                │
              │                                        ↓ PASS                           │
              │  ┌──────────────────────┐   ┌───────────────────────┐                  │
              │  │ ActuatorService      │──>│ Publisher.publish_    │                  │
              │  │ .send_command        │   │ actuator_command      │                  │
              │  └──────────────────────┘   └───────────┬───────────┘                  │
              │                                         │                               │
              │                                         ↓                               │
              │  ┌──────────────────────┐                                              │
              │  │ actuator_repo.       │                                              │
              │  │ log_command          │                                              │
              │  └──────────────────────┘                                              │
              └─────────────────────────────────────────────────────────────────────────┘
                                                        │
                                       MQTT QoS 2       │
                                                        ↓
              ┌─────────────────────────────────────────────────────────────────────────┐
              │                               ESP32                                     │
              │  ┌──────────────┐   ┌──────────────────────┐   ┌──────────────────────┐│
              │  │ MQTT Client  │──>│ ActuatorManager.     │──>│ Actuator Driver      ││
              │  │ (Receive)    │   │ controlActuator      │   │ (GPIO Write)         ││
              │  └──────────────┘   └──────────────────────┘   └──────────────────────┘│
              │                              │                                          │
              │                              ↓                                          │
              │                     ┌──────────────────────┐                           │
              │                     │ actuator/{gpio}/     │                           │
              │                     │ response             │                           │
              │                     └──────────┬───────────┘                           │
              └────────────────────────────────┼────────────────────────────────────────┘
                                               │
                              MQTT QoS 1       │
                                               ↓
              ┌─────────────────────────────────────────────────────────────────────────┐
              │                               Server                                    │
              │  ┌──────────────────────────┐   ┌───────────────────────────────────┐  │
              │  │ ActuatorResponseHandler  │──>│ actuator_repo.update_state        │  │
              │  └──────────────────────────┘   └───────────────────────────────────┘  │
              │                                         │                               │
              │                                         ↓                               │
              │                             ┌───────────────────────────────────┐      │
              │                             │ WebSocketManager.broadcast        │      │
              │                             │ ("actuator_status", {...})        │      │
              │                             └───────────────────────────────────┘      │
              └─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Fazit

### 10.1 Stärken des Systems

1. **Vollständige GPIO-Validierung:** Server prüft vor DB-Save, ESP prüft nochmal (Defense-in-Depth)
2. **Automatisches Config-Dispatch:** Nach jedem Create/Update/Delete wird sofort MQTT-Config gesendet
3. **Phase 4 Config-Tracking:** config_status-Feld ermöglicht UI-Feedback bei ESP-Fehlern
4. **Multi-Value Sensor Support:** Ein GPIO kann mehrere sensor_types haben (z.B. SHT31)
5. **Safety-First:** Alle Actuator-Commands durchlaufen SafetyService

### 10.2 Empfohlene Verbesserungen

| Priorität | Verbesserung | Aufwand |
|-----------|--------------|---------|
| 🔴 HOCH | I2C-Pins (21, 22) zu SYSTEM_RESERVED_PINS hinzufügen | 5 Min |
| 🔴 HOCH | Input-Only Pins (34, 35, 36, 39) für Actuators blockieren | 30 Min |
| 🟡 MITTEL | ADC-Validierung für Analog-Sensoren | 2 Std |
| 🟡 MITTEL | Config-Sync nach ESP-Reboot (Heartbeat-based) | 4 Std |
| 🟢 NIEDRIG | Concurrent-Update-Protection (Mutex/Locking) | 2 Std |

---

**Analyse abgeschlossen am 2026-01-11**

*Dokumentiert von Claude (Entwickler-Rolle) im Auftrag von Robin (Manager)*
