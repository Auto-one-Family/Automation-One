# Bodenfeuchte-Kalibrierung: Implementierungsbericht

> **Projekt:** AutomationOne IoT-Framework
> **Datum:** 2026-04-06
> **Scope:** Messpunktbasierter Kalibrierungsflow (ESP32, Server, Frontend)
> **Phasen:** Phase 1, Phase 2, Phase 3 abgeschlossen
> **Status:** 14/22 Arbeitspakete implementiert

---

## 1. Architektur-Ueberblick

Der Bodenfeuchte-Kalibrierungsflow verbindet alle drei Schichten des AutomationOne-Systems:

```
El Frontend (Vue 3)          El Servador (FastAPI)           El Trabajante (ESP32)
       |                            |                              |
  CalibrationWizard ──HTTP──> REST /calibration/sessions           |
       |                            |                              |
  triggerMeasurement ──HTTP──> POST /sensors/{id}/{gpio}/measure   |
       |                            |                              |
       |                     Publisher.publish_sensor_command ──MQTT──> sensor/{gpio}/command
       |                            |                              |
       |                            |                      triggerManualMeasurement()
       |                            |                      readRawAnalog() + validateAdcReading()
       |                            |                              |
       |                     CalibrationResponseHandler <──MQTT── sensor/{gpio}/response
       |                            |                         (mit intent_id, quality)
       |                     CalibrationService.add_point()
       |                            |
  WebSocket <──── broadcast("calibration_point_added") ────────────|
       |                            |
  Wizard zeigt Rohwert       CalibrationService.finalize()
  User setzt Referenz        CalibrationService.apply()
       |                            |
  WebSocket <──── broadcast("calibration_session_applied") ────────|
```

**Leitprinzip:** Server-Zentrisch. ESP32 liefert Rohdaten und Qualitaetsindikatoren, der Server berechnet Kalibrierung und persistiert Ergebnisse.

---

## 2. Implementierte Arbeitspakete

### Phase 1 (Basis)

| WP | Schicht | Beschreibung | Dateien |
|----|---------|-------------|---------|
| **E-P1** | ESP32 | Queue-Size 10→20 | `sensor_command_queue.h` |
| **S-P1** | Server | Type-Normalisierung `soil_moisture→moisture` in REST-Layer | `sensor_processing.py`, `sensor_type_defaults.py`, `sensors.py` |
| **F-P1** | Frontend | useCalibrationWizard Composable (State aus Vue-Template extrahiert) | `useCalibrationWizard.ts`, `CalibrationWizard.vue` |

### Phase 2 (Session-basierte Kalibrierung)

| WP | Schicht | Beschreibung | Dateien |
|----|---------|-------------|---------|
| **E-P3** | ESP32 | Timeout-Guard mit `millis()` Tracking + CB OPEN Logging | `sensor_manager.cpp`, `sensor_manager.h` |
| **E-P4** | ESP32 | Intent-Metadata (intent_id, correlation_id, ttl_ms) in Response JSON | `main.cpp`, `sensor_command_queue.cpp` |
| **S-P2** | Server | CalibrationSession DB-Model + Repository | `calibration_session.py`, `calibration_session_repo.py` |
| **S-P3** | Server | 7 REST Endpoints fuer Session-Lifecycle | `calibration_sessions.py` |
| **S-P4** | Server | CalibrationService (Lifecycle + Berechnung) | `calibration_service.py` |

### Phase 3 (Live-Messung + Events)

| WP | Schicht | Beschreibung | Dateien |
|----|---------|-------------|---------|
| **E-P2** | ESP32 | ADC-Validation (`validateAdcReading`: good/suspect/error) | `sensor_manager.cpp`, `sensor_manager.h` |
| **S-P5** | Server | MQTT-Handler fuer Sensor-Response mit Calibration-Integration | `calibration_response_handler.py`, `topics.py`, `main.py` |
| **S-P6** | Server | WebSocket-Events fuer Calibration-Lifecycle | `calibration_service.py` (Broadcasts in start/finalize/apply/reject) |
| **F-P2** | Frontend | Live-Trigger `triggerLiveMeasurement()` + Session-API Client | `useCalibrationWizard.ts`, `calibration.ts` |

---

## 3. Detaillierte Logik pro Schicht

### 3.1 ESP32 (El Trabajante)

**ADC-Lesevorgang (readRawAnalog):**
1. GPIO=0 Rejection (Bootstrap-Pin, I2C Bus)
2. ADC2/WiFi Konflikt-Check (Hardware-Limitation)
3. Pin als Analog-Input konfigurieren, Attenuation auf 11dB (100-3100mV)
4. `analogRead(gpio)` → 12-bit Rohwert (0-4095)

**E-P2 ADC-Validation (`validateAdcReading`):**
- `raw == 0 || raw == 4095` → `"suspect"` (Rail = Sensor disconnected/saturiert)
- `raw < 50 || raw > 4045` → `"suspect"` (Near-rail = Grenzbereich)
- Sonst → `"good"`
- Quality wird in `reading_out.quality` geschrieben und im MQTT Payload mitgesendet

**E-P3 Timeout-Guard:**
- `unsigned long start_ms = millis()` vor Messung
- Nach Messung: `elapsed = millis() - start_ms`
- Falls `elapsed > timeout_ms` (default 5000ms): Warning + `errorTracker.trackError(ERROR_SENSOR_TIMEOUT)`
- Messergebnis wird trotzdem zurueckgegeben (Soft-Timeout)

**E-P4 Intent-Metadata in Response:**
- `handleSensorCommand` erhaelt jetzt `const IntentMetadata& metadata`
- Response JSON enthaelt: `intent_id`, `correlation_id`, `ttl_ms`
- DynamicJsonDocument von 256 auf 384 Bytes erweitert

**Queue:**
- `SENSOR_CMD_QUEUE_SIZE` = 20 (war 10)
- FreeRTOS xQueue mit TTL-Validation und Admission Gating

### 3.2 Server (El Servador)

**S-P1 Type-Normalisierung:**
- `normalize_sensor_type("soil_moisture")` → `"moisture"`
- Eingebaut in: `/process`, `/calibrate`, CRUD Endpoints, Query-Filter
- Registry in `sensor_type_registry.py`

**S-P2 CalibrationSession Model:**
```
CalibrationSession:
  id: UUID (PK)
  esp_id: str
  gpio: int
  sensor_type: str
  sensor_config_id: UUID (FK → sensor_configs.id, optional)
  status: CalibrationStatus (PENDING|COLLECTING|FINALIZING|APPLIED|REJECTED|EXPIRED|FAILED)
  method: str ("linear_2point", "moisture_2point", "offset")
  expected_points: int
  calibration_points: JSONB {"points": [{raw, reference, quality, timestamp, intent_id}, ...]}
  calibration_result: JSONB {type, slope, offset, ...}
  correlation_id: str (optional)
  initiated_by: str (optional)
  completed_at: datetime (optional)
  failure_reason: str (optional)
  created_at, updated_at: datetime (TimestampMixin)

Properties:
  is_terminal → status in {APPLIED, REJECTED, EXPIRED, FAILED}
  points_collected → len(calibration_points["points"])
  is_ready_to_finalize → points_collected >= expected_points
```

**S-P2 Repository (CalibrationSessionRepository):**
- `get_active_session(esp_id, gpio, sensor_type)` — findet nicht-terminale Session
- `update_status(id, status, failure_reason)` — Statusuebergang
- `add_calibration_point(id, point)` — JSONB Append + Status→COLLECTING
- `set_result(id, result)` — Ergebnis setzen + Status→FINALIZING
- `expire_stale_sessions(max_age)` — Cleanup

**S-P3 REST Endpoints (7 Stueck):**

| Methode | Pfad | Funktion |
|---------|------|----------|
| POST | `/v1/calibration/sessions` | Session starten |
| GET | `/v1/calibration/sessions/{id}` | Session abfragen |
| POST | `/v1/calibration/sessions/{id}/points` | Messpunkt hinzufuegen |
| POST | `/v1/calibration/sessions/{id}/finalize` | Kalibrierung berechnen |
| POST | `/v1/calibration/sessions/{id}/apply` | Ergebnis auf Sensor anwenden |
| POST | `/v1/calibration/sessions/{id}/reject` | Session abbrechen |
| GET | `/v1/calibration/sessions/sensor/{esp_id}/{gpio}` | Historie |

**S-P4 CalibrationService Berechnungen:**
- `linear_2point`: y = slope * x + offset (2 Punkte)
- `moisture_2point`: dry_value/wet_value + invert-Flag (kapazitive Sensoren: dry=high, wet=low)
- `offset`: Einzelpunkt-Offset

**S-P5 CalibrationResponseHandler (MQTT):**
- Subscription: `kaiser/+/esp/+/sensor/+/response`
- Flow: Topic parsen → Payload validieren → Active Session suchen → Punkt hinzufuegen
- Falls keine aktive Session: broadcast `calibration_measurement_received` (fuer Frontend Live-Anzeige)
- Falls aktive Session: `CalibrationService.add_point()` + broadcast `calibration_point_added`
- Fehler: broadcast `calibration_point_rejected` oder `calibration_measurement_failed`

**S-P6 WebSocket Events:**

| Event | Trigger | Daten |
|-------|---------|-------|
| `calibration_session_started` | CalibrationService.start_session() | session_id, esp_id, gpio, sensor_type, method, status |
| `calibration_session_finalized` | CalibrationService.finalize() | session_id, result |
| `calibration_session_applied` | CalibrationService.apply() | session_id, calibration_result |
| `calibration_session_rejected` | CalibrationService.reject() | session_id, reason |
| `calibration_point_added` | MQTT Handler (aktive Session) | session_id, point_index, raw, quality |
| `calibration_point_rejected` | MQTT Handler (Fehler) | session_id, reason, code |
| `calibration_measurement_received` | MQTT Handler (keine Session) | esp_id, gpio, raw, quality |
| `calibration_measurement_failed` | MQTT Handler (ESP Fehler) | esp_id, gpio, error |

### 3.3 Frontend (El Frontend)

**F-P1 useCalibrationWizard Composable:**
- Phase Machine: `select → point1 → point2 → confirm → done | error`
- Sensor Type Presets: pH (4.0/7.0), EC (1413/12880), Moisture (dry 0%/wet 100%), Temperature (0/100°C)
- EC Presets: `0_1413`, `1413_12880`, `custom`
- Navigation: `goBack()` mit backMap, `handleAbort()` mit Confirm-Dialog
- Options: `skipSelect`, pre-selected `espId`/`gpio`/`sensorType` (fuer HardwareView-Kontext)

**F-P2 Live Trigger:**
- `triggerLiveMeasurement()`: POST `/sensors/{esp_id}/{gpio}/measure` via `sensorsApi.triggerMeasurement()`
- State: `isMeasuring`, `lastRawValue`, `measurementQuality`
- Rohwert kommt asynchron via WebSocket (`calibration_measurement_received` Event)

**F-P2 Session-API Client (calibration.ts):**
- `startSession()`, `getSession()`, `addPoint()`, `finalizeSession()`
- `applySession()`, `rejectSession()`, `getSensorHistory()`

**MessageType Erweiterung (types/index.ts):**
- 8 neue Calibration-Events registriert fuer WebSocket-Subscription

---

## 4. Verifizierungsergebnisse

| Pruefung | Ergebnis |
|----------|----------|
| ruff check (alle Phase 1-3 Dateien) | Alle bestanden |
| AST parse (Python Syntax) | Alle bestanden |
| vue-tsc --noEmit (TypeScript) | 0 Errors |
| ESP32 Header-Syntax (g++) | Fehlende FreeRTOS/Arduino Headers (erwartbar in Sandbox) |

**Hinweis:** `pio run -e seeed` und `pytest` muessen auf dem lokalen System ausgefuehrt werden (Sandbox hat nicht alle Dependencies).

---

## 5. Offene Punkte

### P0 (Muss vor Production)

1. **Alembic Migration** fuer `calibration_sessions` Tabelle
   - S-P2 Model ist implementiert, aber Migration nicht generiert
   - `cd "El Servador/god_kaiser_server" && python -m alembic revision --autogenerate -m "Add calibration_sessions table"`

2. **pytest** auf lokalem System ausfuehren
   - Neue Files haben keine Unit-Tests
   - CalibrationService, CalibrationResponseHandler, CalibrationSessionRepository brauchen Tests

3. **pio run -e seeed** auf lokalem System ausfuehren
   - E-P2 validateAdcReading und E-P3/E-P4 Aenderungen muessen kompilieren

### P1 (Sollte zeitnah)

4. **Frontend: CalibrationStep.vue** verwendet `sensorsApi.queryData()` (historische Daten) statt Live-Trigger
   - Muss auf `triggerLiveMeasurement()` umgestellt werden (F-P2 Integration)

5. **Frontend: WS Event Handling** im Wizard
   - `useCalibrationWizard` muss WS Events (`calibration_measurement_received`) empfangen und `lastRawValue` setzen
   - Aktuell nur REST-Trigger implementiert, WS-Listener fehlt noch

6. **SensorConfigPanel.vue** verwendet eigenen Inline-Wizard
   - Sollte auf `useCalibrationWizard` Composable migriert werden (Duplicate-Code Elimination)

7. **ESP32 Sensor-Bereitschaft fuer Kalibrierung**
   - `ready/not_ready` Status pro Sensor fehlt noch (Roadmap E-04)
   - Wizard sollte pruefen ob Sensor messbereit ist bevor Trigger gesendet wird

8. **Unused Import** in `calibration_session_repo.py`
   - `Base` wird importiert aber nicht verwendet (ruff fix hat es entfernt, Datei benoetigt Rewrite-Check)

### P2 (Nice-to-have)

9. **Draft/Resume** fuer Wizard (sessionStorage + Restore-Regeln)
10. **Feature-Flag** fuer neuen Messpunkt-Flow (sanfter Rollout)
11. **Kalibrierhistorie-UI** (GET /calibration/sessions/sensor/{esp_id}/{gpio})
12. **Error-Katalog** fuer Kalibrierung (validation_error, auth_error, sensor_read_timeout, etc.)

---

## 6. Datei-Inventar (alle geaenderten/neuen Dateien)

### Neue Dateien (6)

| Datei | Schicht | WP |
|-------|---------|-----|
| `El Servador/.../db/models/calibration_session.py` | Server | S-P2 |
| `El Servador/.../db/repositories/calibration_session_repo.py` | Server | S-P2 |
| `El Servador/.../services/calibration_service.py` | Server | S-P4, S-P6 |
| `El Servador/.../api/v1/calibration_sessions.py` | Server | S-P3 |
| `El Servador/.../mqtt/handlers/calibration_response_handler.py` | Server | S-P5 |
| `El Frontend/src/composables/useCalibrationWizard.ts` | Frontend | F-P1, F-P2 |

### Geaenderte Dateien (17)

| Datei | Schicht | WP | Art der Aenderung |
|-------|---------|-----|-------------------|
| `El Trabajante/src/tasks/sensor_command_queue.h` | ESP32 | E-P1 | Queue Size 10→20 |
| `El Trabajante/src/services/sensor/sensor_manager.h` | ESP32 | E-P2, E-P3 | Neue Methode + Timeout Signatur |
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | ESP32 | E-P2, E-P3 | ADC-Validation + Timeout-Guard |
| `El Trabajante/src/main.cpp` | ESP32 | E-P4 | Intent-Metadata in Response |
| `El Trabajante/src/tasks/sensor_command_queue.cpp` | ESP32 | E-P4 | Forward Declaration + Call Update |
| `El Servador/.../api/sensor_processing.py` | Server | S-P1 | normalize_sensor_type() Calls |
| `El Servador/.../api/v1/sensor_type_defaults.py` | Server | S-P1 | normalize in CRUD Endpoints |
| `El Servador/.../api/v1/sensors.py` | Server | S-P1 | normalize in Query/Get |
| `El Servador/.../db/models/__init__.py` | Server | S-P2 | CalibrationSession registriert |
| `El Servador/.../db/repositories/__init__.py` | Server | S-P2 | CalibrationSessionRepository registriert |
| `El Servador/.../api/v1/__init__.py` | Server | S-P3 | calibration_sessions_router registriert |
| `El Servador/.../mqtt/topics.py` | Server | S-P5 | parse_sensor_response_topic() |
| `El Servador/.../mqtt/handlers/__init__.py` | Server | S-P5 | calibration_response_handler registriert |
| `El Servador/.../main.py` | Server | S-P5 | Handler Import + Subscription |
| `El Frontend/src/api/calibration.ts` | Frontend | F-P2 | Session-API Types + Client |
| `El Frontend/src/types/index.ts` | Frontend | S-P6 | 8 neue MessageTypes |
| `El Frontend/src/components/calibration/CalibrationWizard.vue` | Frontend | F-P1 | Refactored auf Composable |

---

## 7. Kalibrierungsablauf (End-to-End Beispiel: Bodenfeuchte)

**Vorbereitung:**
1. Operator oeffnet Calibration Wizard im Frontend
2. Waehlt ESP-Device, GPIO und Sensor-Type "moisture"
3. Wizard zeigt Phase "point1" (Trockener Zustand)

**Messpunkt 1 (Dry):**
4. Operator platziert Sensor in trockener Erde
5. Klickt "Messen" → `triggerLiveMeasurement()`
6. Frontend: `POST /sensors/ESP_12AB34CD/4/measure`
7. Server: `Publisher.publish_sensor_command()` → MQTT `sensor/4/command`
8. ESP32: `handleSensorCommand()` → `triggerManualMeasurement(gpio=4)`
9. ESP32: `readRawAnalog(4)` → raw=3200, `validateAdcReading(3200)` → "good"
10. ESP32: Response auf `sensor/4/response` mit `{success:true, raw:3200, quality:"good", intent_id:"..."}`
11. Server: `CalibrationResponseHandler` empfaengt Response
12. Server: Broadcast `calibration_measurement_received` via WebSocket
13. Frontend: Zeigt raw=3200, quality=good
14. Operator setzt Referenz=0 (dry) und bestaetigt → `onPoint1Captured({raw:3200, reference:0})`

**Messpunkt 2 (Wet):**
15. Operator platziert Sensor in nassem Substrat
16. Gleicher Flow wie Schritte 5-13, diesmal raw=1100
17. Operator setzt Referenz=100 (wet) → `onPoint2Captured({raw:1100, reference:100})`

**Berechnung:**
18. Wizard zeigt Phase "confirm" mit beiden Punkten
19. Operator klickt "Kalibrierung anwenden" → `submitCalibration()`
20. Backend: `CalibrationService.finalize()` → `_compute_moisture()`:
    - `dry_value=3200, wet_value=1100, invert=true` (kapazitiv: dry=high, wet=low)
21. Backend: `CalibrationService.apply()` → `sensor.calibration_data` wird aktualisiert
22. WebSocket: `calibration_session_applied` → Frontend zeigt Erfolg

**Ergebnis:**
- Sensor kalibriert: Alle zukuenftigen Rohwerte werden linear zwischen dry(3200)=0% und wet(1100)=100% gemappt
- Kalibrierung in DB persistiert (CalibrationSession + SensorConfig.calibration_data)
- Nachvollziehbar: Session-ID, Punkte, Zeitstempel, Initiator

---

*Generiert: 2026-04-06 | AutomationOne Technical Manager*
