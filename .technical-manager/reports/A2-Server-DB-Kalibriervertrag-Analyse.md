# Finalanalyse A2: Server- und Datenbankvertrag für Bodenfeuchte-Kalibrierung

**Datum:** 2026-04-06
**Projekt:** AutomationOne IoT-Framework
**Scope:** Server Backend (El Servador) + PostgreSQL Datenbankmodelle
**Status:** IST-Analyse ABGESCHLOSSEN | 6 Pflichtlieferobjekte

---

## Executive Summary

Der AutomationOne-Server verfügt über **teilweise implementierte** Kalibrierungs-Funktionalität, die nicht vollständig vom Messzyklus zum Terminal-Outcome durchgängig ist. Kernfindings:

1. **POST `/api/v1/sensors/calibrate`** existiert; speichert `calibration_data` als JSON in DB
2. **Typnormalisierung ist INKONSISTENT**: Payload akzeptiert `soil_moisture`, `moisture`, ESP sendet lowercase `sensor_type`
3. **Session- und Finalitätsmodell fehlt**: keine Persistierung von Kalibrierungs-Sessions, keine Terminal-Outcomes (akzeptiert/abgelehnt/angewendet)
4. **Measure-Trigger existiert** (`POST /{esp_id}/{gpio}/measure`), aber **keine Rückmeldung über erfolgreiche Persistierung**
5. **Intent/Outcome-Vertrag** existiert für Actuator/Config, **NICHT für Sensor-Kalibrierung**
6. **DB-Struktur erlaubt beliebige `calibration_data`-Forms** — keine Erzwingung kanonischer Struktur

---

## 1. REST/WS/MQTT Vertragsbild

### 1.1 Kalibrierungs-Endpoints (Status quo)

| Endpoint | Method | Auth | Semantik | Rückgabe | Finality |
|----------|--------|------|----------|----------|----------|
| `/api/v1/sensors/calibrate` | POST | API-Key | Berechnet Kalibrier-Parameter | `SensorCalibrateResponse` | **KEINE** (ACK nur) |
| `/api/v1/sensors/{esp_id}/{gpio}` | GET | JWT | Liest `calibration_data` Feld | `SensorConfigResponse` mit `.calibration` | Read-only |
| `/api/v1/sensors/{esp_id}/{gpio}` | POST/PUT | JWT | **Aktualisiert** Sensor-Config | `SensorConfigResponse` | **ACK = Persistierung** (implizit) |

### 1.2 Measure-Trigger Endpoint

```
POST /api/v1/sensors/{esp_id}/{gpio}/measure
Response: TriggerMeasurementResponse
{
  "request_tracking_id": "uuid",
  "scheduled_at": "2026-04-06T12:34:56Z",
  "status": "command_queued"  // Nur ACK, KEINE Warte auf Messergebnis
}
```

**Problem:** Keine Terminal-Rückmeldung über erfolgreiche Messung.

### 1.3 MQTT Datenfluss (Sensor-Messung)

**Publish-Pfad (ESP → Server):**
```
Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
Payload:
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 34,
  "sensor_type": "soil_moisture",  ← Normalisierung SUCCESS (lowercase)
  "raw": 2150,
  "value": 0.0,
  "unit": "%",
  "quality": "good",
  "raw_mode": true,
  "i2c_address": null,
  "onewire_address": null
}
```

**Server-Handler (`src/mqtt/handlers/sensor_handler.py`):**
1. Parse topic → esp_id, gpio
2. Validate payload (required: ts, esp_id, gpio, sensor_type, raw)
3. **Normalize sensor_type** → `sensor_type.lower()`
4. Lookup sensor_config via 3/4-way lookup (esp_id, gpio, sensor_type[, i2c_address|onewire_address])
5. Extract `raw_value`, process if `pi_enhanced=true`
6. Save to `sensor_data` table
7. **NO ACK published back** (unidirektional)

### 1.4 Intent/Outcome Vertrag (Actuator/Config vorhanden)

**Modell:**
- `CANONICAL_OUTCOMES = {accepted, rejected, applied, persisted, failed, expired}`
- `FINAL_OUTCOMES = {persisted, rejected, failed, expired}`
- Terminal-Persistierung in `intent_outcomes` Tabelle

**Status für Sensoren:** **NICHT IMPLEMENTIERT**

---

## 2. Ingestion und Typnormalisierung

### 2.1 Normalisierungspfade

| Quelle | Feld | Format | Normalisierung | Location |
|--------|------|--------|----------------|----------|
| MQTT Payload | `sensor_type` | String | `.lower()` | `sensor_handler.py:197` |
| REST POST `/calibrate` | `sensor_type` | String | **KEINE** (verwendet direkt) | `sensor_processing.py:282` |
| DB-Config | `sensor.sensor_type` | String (50 chars) | Index: `func.lower()` | `sensor_repo.py:164` |
| REST GET `/sensors/{esp_id}/{gpio}` | `sensor_type` (in response) | String | Passthrough | `sensors.py:138` |

### 2.2 Typalisierungen

**Schema (`src/schemas/sensor.py`):**
```python
SENSOR_TYPES = [
    "ph", "temperature", "humidity", "ec",
    "moisture",  # ← Normalisiert (ECS1-R01)
    "pressure", "co2", "light", "flow",
]
```

**Validator:** `validate_sensor_type()` akzeptiert beliebige Typen (mit `.lower().strip()`):
```python
v = v.lower().strip()
if v not in SENSOR_TYPES:
    # Allow custom types but warn
    pass
```

### 2.3 Risiko: Alias-Input aus externen Publishern

**Scenario:** Mobile App sendet `"soil_moisture"`, ESP sendet `"moisture"` für denselben Sensor:

```
Option 1: REST POST /calibrate
{ "sensor_type": "soil_moisture", "calibration_points": [...] }
→ Speichert unter "soil_moisture"

Option 2: MQTT /sensor/{gpio}/data
{ "sensor_type": "moisture", "raw": 2150 }
→ Speichert unter "moisture"

Result: ZWEI verschiedene Einträge in DB für denselben physischen Sensor
```

**Root Cause:** Keine **kanonische Type-Normalisierung vor Lookup** im REST-Endpoint.

---

## 3. Datenbank-Istaufnahme

### 3.1 Relevante Tabellen

| Tabelle | Spalten (relevant) | Zweck | Status |
|---------|-------------------|-------|--------|
| `sensor_configs` | `esp_id (FK), gpio, sensor_type, calibration_data (JSON)` | Sensor-Metadaten + Kalibrierung | Produktiv |
| `sensor_data` | `esp_id, gpio, sensor_type, raw_value, processed_value, timestamp` | Time-Series Messdaten | Produktiv |
| `intent_outcomes` | `flow, outcome, code, reason, is_final, terminal_at` | Actuator/Config Terminal-Events | Actuators/Config nur |
| ~~`calibration_sessions`~~ | **NICHT VORHANDEN** | Würde Sessions tracken | FEHLEND |

### 3.2 `calibration_data` Istformen

**Gefundene Formen in Code + Migrations:**

```javascript
// Form 1: Linear 2-Point (pH, EC, Moisture)
{ "slope": -3.5, "offset": 21.34 }

// Form 2: Offset-only (Temp, Pressure, Humidity)
{ "offset": 2.5 }

// Form 3: NULL (uncalibrated)
null

// Form 4: Empty object (legacy uncalibrated)
{}

// Form 5: Custom processor output (future-proof)
{ "method": "linear", "slope": ..., "offset": ..., "points": [...] }
```

**Keine DB-Constraints:**
- SQLAlchemy Definition: `calibration_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)`
- **Erlaubt:** beliebige JSON-Struktur, Null, leere Objekte

### 3.3 Eindeutigkeits-Sicherheit für Bodenfeuchte

**Lookup-Strategie:**
```python
# Standard Analog Sensor (pH, EC, Moisture)
sensor_config = await sensor_repo.get_by_esp_gpio_and_type(
    esp_device.id, gpio, "soil_moisture"
)
```

**Unique Index (Alembic: `fix_sensor_unique_constraint_null_coalesce.py`):**
```sql
unique_esp_gpio_sensor_interface_v2: COALESCE(esp_id, uuid_nil), COALESCE(gpio, -1),
    COALESCE(sensor_type, ''), COALESCE(onewire_address, ''), COALESCE(i2c_address::text, '')
```

**Sicherheit:**
- ✓ Verhindert Duplikate bei (esp_id, gpio, sensor_type) für Analog-Sensoren
- ✗ Keine Normalisierung in Index → `soil_moisture` ≠ `moisture` trotz Alias-Logik

---

## 4. Zielbild-Kompatibilität: Kanonisches Kalibrierschema

### 4.1 Vorschlag: Kanonische Form

```python
{
  "version": 2,  # Für zukünftige Evolution
  "method": "linear" | "offset",
  "points": [  # Vollständige Kalibrierhistorie
    {
      "raw": 2150,
      "reference": 50.0,
      "quality": "good",
      "timestamp": "2026-04-06T12:00:00Z"
    },
    {
      "raw": 3500,
      "reference": 100.0,
      "quality": "good",
      "timestamp": "2026-04-06T12:05:00Z"
    }
  ],
  "derived": {  # Berechnete Parameter
    "slope": 0.0235,
    "offset": -1.5,
    "r_squared": 0.9998
  },
  "metadata": {
    "calibration_session_id": "uuid",
    "applied_at": "2026-04-06T12:10:00Z",
    "applied_by": "user_id",
    "calibration_buffer": "stock_50_buffer, stock_100_buffer",
    "temperature_during_calibration_c": 22.5,
    "notes": "Performed with fresh buffers"
  }
}
```

### 4.2 Rückwärtskompatibilität

**Migration Strategy:**

1. **Phase 1 (Acceptance):** Beide Formen akzeptieren:
   ```python
   if isinstance(calibration_data, dict):
       if "derived" in calibration_data:
           # Neue Form
           slope = calibration_data["derived"]["slope"]
       elif "slope" in calibration_data:
           # Alte Form
           slope = calibration_data["slope"]
   ```

2. **Phase 2 (Normalisierung):** Bei Update auf neue Form migrieren
   ```python
   async def normalize_calibration_data(sensor_config):
       old = sensor_config.calibration_data
       if old and "derived" not in old:
           new = {
               "version": 2,
               "method": detect_method(old),
               "points": [],
               "derived": old,
               "metadata": {"migrated_at": now()}
           }
           sensor_config.calibration_data = new
   ```

3. **Phase 3 (Deprecation):** Nach 6 Monaten nur noch neue Form annahmen

---

## 5. Finalitätsmodell: Fehlende Zustandsmaschine

### 5.1 Aktuelles Modell (UNVOLLSTÄNDIG)

```
REST POST /calibrate
  ├─ Input: sensor_type, calibration_points
  ├─ Berechnung: slope, offset → ACK mit Ergebnis
  ├─ Save (if save_to_config=true): UPDATE sensor_configs SET calibration_data = ...
  └─ Response: { success: true, calibration: {...}, saved: true/false }

     NO TERMINAL EVENT RECORDED
     NO SESSION ID ISSUED
     NO ASYNC COMPLETION ACK
```

### 5.2 Erforderliches Zielmodell

```
1. CREATE Kalibrierungs-Session
   POST /api/v1/sensors/{esp_id}/{gpio}/calibration/start
   Response: { session_id: uuid, status: "initiated" }

2. ADD Kalibrierungs-Punkte (iterativ)
   POST /api/v1/sensors/{esp_id}/{gpio}/calibration/{session_id}/points
   Body: { raw: 2150, reference: 50.0 }
   Response: { points_collected: 1, status: "collecting" }

3. FINALIZE Kalibrierung
   POST /api/v1/sensors/{esp_id}/{gpio}/calibration/{session_id}/finalize
   Response: { outcome: "accepted", calibration: {...}, session_id }

4. APPLY oder REJECT
   POST /api/v1/sensors/{esp_id}/{gpio}/calibration/{session_id}/apply
   Response: { outcome: "persisted", applied_at, applied_by }

   OR

   POST /api/v1/sensors/{esp_id}/{gpio}/calibration/{session_id}/reject
   Response: { outcome: "rejected", reason, rejected_at }

5. TERMINAL_EVENT persisted in Intent/Outcome
   - intent_outcomes.flow = "calibration"
   - intent_outcomes.outcome = "persisted" | "rejected"
   - intent_outcomes.is_final = true
   - intent_outcomes.terminal_at = timestamp
```

### 5.3 Erforderliche Datenbankänderungen

**Neue Tabelle: `calibration_sessions`**
```sql
CREATE TABLE calibration_sessions (
  id UUID PRIMARY KEY,
  esp_id UUID NOT NULL REFERENCES esp_devices(id),
  gpio INT NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  session_status VARCHAR(20),  -- initiated, collecting, calculated, accepted, applied, rejected

  -- Collected Points
  calibration_points JSONB,  -- [{raw, reference, timestamp}, ...]

  -- Calculated Result
  calculated_calibration JSONB,  -- {method, derived: {slope, offset, ...}}

  -- Terminal Event
  terminal_outcome VARCHAR(20),  -- NULL, "persisted", "rejected", "failed", "expired"
  terminal_at TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);
```

**Update: `intent_outcomes` mit calibration-flow Support**
```sql
ALTER TABLE intent_outcomes ADD CONSTRAINT check_valid_flows
CHECK (flow IN ('command', 'config', 'publish', 'zone', 'calibration', ...));
```

---

## 6. Server-Luecken: Blockierende Faktoren

### Gap P0: BLOCKING

| ID | Lücke | Ursache | Impact | Lösung |
|----|-------|--------|--------|--------|
| **G0-1** | **Keine Session-Persistierung** | Kalibrierungs-Endpoint ist stateless | Kann Multi-Point-Kalibrierungen nicht trackern; User sieht keine Fortschrittsanzeige im Frontend | Calibration-Session-Tabelle + REST-Endpoints für Start/Collect/Finalize |
| **G0-2** | **Keine Terminal-Outcomes** | Intent/Outcome-Modell nur für Actuators | Wizard kann nicht auf "persisted" warten; keine Fehler-Propagation | Integriere calibration in intent_outcomes (flow="calibration") |
| **G0-3** | **Type-Normalisierung nur in MQTT** | REST POST /calibrate normalisiert NICHT | Kann Alias-Eingaben (soil_moisture vs moisture) nicht auflösen | Pre-normalize im REST-Handler: `sensor_type = normalize_sensor_type(sensor_type)` |
| **G0-4** | **Keine Measurement ACK** | trigger_measurement sendet Befehl, wartet NICHT auf Ergebnis | User weiß nicht, ob Messung erfolgreich war | Erweitere trigger_measurement um async/await auf sensor_data Eintrag |

### Gap P1: HIGH

| ID | Lücke | Ursache | Impact | Lösung |
|----|-------|--------|--------|--------|
| **G1-1** | **calibration_data Form-Freiheit** | Keine DB-Constraints auf JSON-Struktur | Legacy + Neue Form im selben System; Verarbeitung kompliziert | Alembic-Migration: normalisiere bestehende Daten; ADD CHECK Constraint |
| **G1-2** | **Multi-Point nicht gespeichert** | Kalibrierungs-Punkte gehen nach Berechnung verloren | Audit-Trail fehlt; kann nicht "Kalibrierung zurückrollen" | Speichere raw calibration_points in session.calibration_points JSONB |
| **G1-3** | **Keine Wizard-Semantik** | REST kennt nur Request/Response, nicht Stateful Wizard | Frontend muss alles selbst managen (Session-ID, State-Machine, Retry) | Backend-seitiges Zustandsmodell (Session + Intent/Outcome) |

### Gap P2: NICE-TO-HAVE

| ID | Lücke | Ursache | Impact | Lösung |
|----|-------|--------|--------|--------|
| **G2-1** | **Keine Kalibrierungs-Validierung** | Server akzeptiert willkürliche Points | Garbage-in-Garbage-out Kalibrierungen | Validiere: Point-Duplikate, Sortierung, Outlier-Detection |
| **G2-2** | **Kein Timeout für Sessions** | Sessions können unbegrenzt offen bleiben | Stale Sessions in DB accumulate | Auto-Expire nach 1h; TTL per Session |
| **G2-3** | **Keine Rollback-Möglichkeit** | User kann fehlerhafte Kalibrierung nicht rückgängig machen | "Manuell in DB reparieren" | Speichere previous_calibration; Add POST `/rollback` endpoint |

---

## 7. Server-Systemmatrix

| Modul | Verantwortung | Eingang | Ausgang | Risiko |
|-------|---------------|---------|---------|--------|
| **API Layer** `sensors.py` | Expose REST Endpoints | HTTP Request (JSON) | HTTP Response | **Keine Type-Normalisierung vor DB-Lookup** |
| **API Layer** `sensor_processing.py` | POST /calibrate Endpoint | `SensorCalibrateRequest` | `SensorCalibrateResponse` | Speichert direkt in DB ohne Session; **Kein Terminal-Event** |
| **MQTT Handler** `sensor_handler.py` | Parse & Ingest Sensor Data | MQTT Topic + Payload | DB Insert + WebSocket Broadcast | **Einseitiger Datenfluss** (kein ACK) |
| **Service** `sensor_service.py` | Business Logic für Sensoren | Service Call | DTO/Domain Object | Inkonsistente Fehlerbehandlung zwischen REST + MQTT |
| **Repository** `sensor_repo.py` | DB CRUD für Sensoren | SQL Query | ORM Objects | Multi-value Lookup kompliziert; OneTooMany-Warnings |
| **Database** `sensor_configs` | Persistierung Config | INSERT/UPDATE | Rows | **calibration_data Form unbegrenzt**; kein Unique-Index auf sensor_type |
| **Database** `intent_outcomes` | Terminal-Event Tracking | INSERT | Rows | **Nur für Actuators/Config; Calibration = Lücke** |

---

## 8. Contract-Matrix: Endpoints & Events

| Endpoint/Event | Pflichtfelder | Ack/Terminal | Fehlerpfade | Owner | Status |
|----------------|-------------|--------------|------------|-------|--------|
| **POST /calibrate** | esp_id, gpio, sensor_type, calibration_points[] | ACK only (keine Terminal-Event) | HTTPException 400/404/500 | `sensor_processing.py` | IMPL, UNVOLLSTÄNDIG |
| **GET /sensors/{esp_id}/{gpio}** | esp_id, gpio, sensor_type(optional) | Sync Response | HTTPException 404 | `sensors.py` | IMPL |
| **MQTT /sensor/{gpio}/data** | esp_id, gpio, sensor_type, raw, ts | Async (published back zu ESP) | Silent Drop (logged) | `sensor_handler.py` | IMPL |
| **POST /trigger_measurement** | esp_id, gpio | ACK (command_queued) | HTTPException 404/503 | `sensors.py` | IMPL, UNVOLLSTÄNDIG |
| **INTENT_OUTCOME (calibration)** | session_id, outcome, terminal_at | Terminal Event (persisted/rejected) | CONTRACT VIOLATION | (fehlend) | **MISSING** |
| **WEBSOCKET /sensor/data** | esp_id, gpio, processed_value, quality | Broadcast (Best-effort) | Silently dropped | `notification_router.py` | IMPL |

---

## 9. Migrations- und Kompatibilitätskonzept

### 9.1 Backward-Compat für bestehende `calibration_data`

**Alembic-Strategie:**

```python
# Migration: normalize_calibration_data_forms.py
def upgrade():
    # 1. Add version column (optional, for future schema evolution)
    op.add_column('sensor_configs', sa.Column('calibration_version', sa.Integer, default=1))

    # 2. Migration-Funktion in Python (läuft 1x auf bestehenden Daten)
    connection = op.get_bind()
    connection.execute("""
    UPDATE sensor_configs
    SET calibration_data = jsonb_build_object(
        'version', 2,
        'method', CASE
            WHEN calibration_data ? 'slope' THEN 'linear'
            WHEN calibration_data ? 'offset' THEN 'offset'
            ELSE 'unknown'
        END,
        'points', '[]'::jsonb,
        'derived', calibration_data,
        'metadata', jsonb_build_object('migrated_at', now())
    )
    WHERE calibration_data IS NOT NULL
      AND NOT (calibration_data ? 'version')
    """)

    # 3. Add CHECK Constraint (optional)
    op.execute("""
    ALTER TABLE sensor_configs
    ADD CONSTRAINT calibration_data_valid CHECK (
        calibration_data IS NULL
        OR calibration_data ? 'version'
    )
    """)
```

### 9.2 Session-Tabelle anlegen

```python
# Migration: add_calibration_sessions_table.py
def upgrade():
    op.create_table(
        'calibration_sessions',
        sa.Column('id', sa.UUID, primary_key=True, default=uuid.uuid4),
        sa.Column('esp_id', sa.UUID, sa.ForeignKey('esp_devices.id'), nullable=False),
        sa.Column('gpio', sa.Integer, nullable=False),
        sa.Column('sensor_type', sa.String(50), nullable=False),
        sa.Column('session_status', sa.String(20), default='initiated'),
        sa.Column('calibration_points', sa.JSON, nullable=True),
        sa.Column('calculated_calibration', sa.JSON, nullable=True),
        sa.Column('terminal_outcome', sa.String(20), nullable=True),
        sa.Column('terminal_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejected_reason', sa.Text, nullable=True),
        sa.Column('created_by', sa.UUID, sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), default=_utc_now),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=_utc_now),
    )
    op.create_index('ix_calibration_sessions_esp_gpio', 'calibration_sessions',
                   ['esp_id', 'gpio'])
    op.create_index('ix_calibration_sessions_status', 'calibration_sessions',
                   ['session_status'])
```

### 9.3 intent_outcomes für calibration erweitern

```python
# Migration: extend_intent_outcomes_for_calibration.py
def upgrade():
    # Keine Tabellen-Änderung nötig (flow ist VARCHAR)
    # Nur Dokumentation: flow IN ('calibration') now supported

    # Optional: seed valid flows table
    op.execute("""
    INSERT INTO intent_outcome_flows (flow_name, is_supported)
    VALUES ('calibration', true)
    ON CONFLICT DO NOTHING
    """)
```

---

## 10. Implementierungsplan Server+DB (10 Pakete)

### Packet 1: Type-Normalisierung (P0, CRITICAL)
**Scope:** `sensors.py`, `sensor_processing.py`
**Ziel:** Alle REST-Endpoints normalisieren sensor_type vor DB-Lookup
**Änderungen:**
- Funktion `normalize_sensor_type(raw: str) -> str` in `src/utils/sensor_helpers.py`
- Apply in POST /calibrate (Line 282)
- Apply in POST /{esp_id}/{gpio} (Line 591)
- Tests: `test_sensor_type_normalization.py`

**Akzeptanz:**
```
✓ POST /calibrate mit "soil_moisture" findet Config mit "moisture"
✓ Type-Mismatch Error schlägt fehl (ValueError)
```

---

### Packet 2: Kalibrierungs-Session-Tabelle (P0, CRITICAL)
**Scope:** Alembic Migration + Models
**Ziel:** Persistiere Kalibrierungs-Sessions mit State-Machine
**Änderungen:**
- Migration: `add_calibration_sessions_table.py`
- Model: `src/db/models/calibration_session.py` (SQLAlchemy)
- Repository: `src/db/repositories/calibration_session_repo.py`
- Enum: `SessionStatus = {initiated, collecting, calculated, accepted, applied, rejected}`

**Akzeptanz:**
```
✓ CREATE Kalibrierungs-Session → session_id
✓ UPDATE mit collected points
✓ Query session by id/status
```

---

### Packet 3: REST Endpoints für Sessions (P0, CRITICAL)
**Scope:** `sensors.py` (new Subrouter)
**Ziel:** Multi-step Wizard-API
**Änderungen:**
- `POST /sensors/{esp_id}/{gpio}/calibration/start` → session_id
- `POST /sensors/{esp_id}/{gpio}/calibration/{session_id}/points` → add point
- `POST /sensors/{esp_id}/{gpio}/calibration/{session_id}/finalize` → calculate + persist
- `POST /sensors/{esp_id}/{gpio}/calibration/{session_id}/apply` → mark as applied
- `POST /sensors/{esp_id}/{gpio}/calibration/{session_id}/reject` → terminal_failure
- Schemas: `CalibrationSessionStartRequest`, `CalibrationPointRequest`, `CalibrationSessionResponse`

**Tests:** `test_calibration_sessions_endpoints.py` (10+ test cases)

---

### Packet 4: Service-Layer für Sessions (P0, CRITICAL)
**Scope:** `src/services/calibration_service.py` (new)
**Ziel:** Business Logic für Session-Lifecycle
**Änderungen:**
- `CalibrationService` mit Methoden:
  - `async start_session(esp_id, gpio, sensor_type) -> session_id`
  - `async collect_point(session_id, raw, reference) -> ValidationResult`
  - `async calculate(session_id) -> calibration_dict`
  - `async apply(session_id, user_id) -> TerminalEvent`
  - `async reject(session_id, reason) -> TerminalEvent`
- Integriere Intent/Outcome Contract

**Akzeptanz:**
```
✓ Session kann mehrere Points accumulate
✓ Berechnung robust gegen Outlier
✓ Terminal Event wird recorded
```

---

### Packet 5: Intent/Outcome für Calibration (P0, CRITICAL)
**Scope:** `intent_outcome_contract.py`, `intent_outcomes` DB
**Ziel:** Kalibrierungs-Outcomes als Terminal-Events tracken
**Änderungen:**
- Update `CANONICAL_FLOWS` → add `'calibration'`
- Update `OUTCOME_ALIASES` → handle calibration-specific outcomes
- DB Insert bei Finalize/Apply/Reject
- REST GET `/sensors/{esp_id}/{gpio}/calibration/{session_id}/outcome`

**Tests:** `test_intent_outcome_calibration.py`

---

### Packet 6: Backward-Compat Migration (P1, HIGH)
**Scope:** Alembic `normalize_calibration_data_forms.py`
**Ziel:** Bestehende calibration_data in neue Form migrieren
**Änderungen:**
- Normalisiere alle existing rows in sensor_configs
- ADD CHECK CONSTRAINT für zukünftige Validierung
- Logging: zeige wie viele Rows migriert wurden

**Akzeptanz:**
```
✓ Alte Form still readable (backward-compat code in Service)
✓ Neue Inserts verwenden kanonische Form
✓ Keine Datenverluste
```

---

### Packet 7: Measurement ACK (P1, HIGH)
**Scope:** `sensor_service.py`, `sensors.py`
**Ziel:** trigger_measurement wartet auf erfolgreiche Persistierung
**Änderungen:**
- trigger_measurement: publish MQTT command
- Wait async für sensor_data INSERT in nächsten 10s
- Return updated `TriggerMeasurementResponse` mit measured_value, quality
- Timeout → HTTPException 504

**Tests:** `test_trigger_measurement_ack.py` (happy path + timeout)

---

### Packet 8: Calibration Data Validation (P1, HIGH)
**Scope:** `calibration_service.py`
**Ziel:** Validiere Point-Qualität vor Persistierung
**Änderungen:**
- Check: Point-Duplikate (gleiche raw-Werte)
- Check: Sortierung (aufsteigende raw-Werte)
- Check: Outlier-Detection (z.score > 3)
- Warn-Level Logs statt Fehler

**Akzeptanz:**
```
✓ Warnt wenn Points nicht sortiert
✓ Akzeptiert aber markiert Outlier in metadata
```

---

### Packet 9: Session Expiry Job (P2, NICE-TO-HAVE)
**Scope:** `src/services/maintenance/jobs/calibration_session_cleanup.py` (new)
**Ziel:** Auto-expire stale Sessions
**Änderungen:**
- Schedulierter Job: alle 1h laufen
- Expire Sessions älter als 24h mit status != {applied, rejected}
- Mark terminal_outcome = "expired"
- Logging

**Tests:** `test_calibration_session_expiry.py`

---

### Packet 10: Integration Tests + Documentation (P1)
**Scope:** Tests + `.claude/reference/patterns/CALIBRATION_FLOW.md` (new)
**Ziel:** End-to-End Szenarios validieren
**Änderungen:**
- `tests/integration/test_calibration_e2e.py`:
  - Scenario 1: Successfull linear calibration
  - Scenario 2: Rejection (invalid points)
  - Scenario 3: Measurement after calibration applies
  - Scenario 4: Session expiry
- Dokumentation: Calibration-Flow-Diagramm + API-Beispiele

**Akzeptanz:**
```
✓ pytest --tb=short -q reports 100% green
```

---

## 11. Test-Strategie

| Packet | Unit Tests | Integration Tests | Load Tests |
|--------|-----------|------------------|-----------|
| 1 (Type-Norm) | `test_normalize_sensor_type.py` (8 cases) | — | — |
| 2 (Sessions DB) | `test_calibration_session_model.py` (12 cases) | `test_sessions_crud.py` | — |
| 3 (Endpoints) | `test_calibration_endpoints_schemas.py` | `test_calibration_endpoints_e2e.py` | `test_calibration_rps.py` (100 req/s) |
| 4 (Service) | `test_calibration_service.py` (20 cases) | — | — |
| 5 (Intent/Outcome) | `test_intent_outcome_calibration.py` (10 cases) | — | — |
| 6 (Migration) | — | `test_migration_forward_backward.py` | — |
| 7 (Measurement ACK) | — | `test_trigger_measurement_ack_e2e.py` | — |
| 8 (Validation) | `test_calibration_validation.py` (15 cases) | — | — |
| 9 (Expiry) | `test_calibration_session_expiry.py` (8 cases) | — | — |
| 10 (Integration) | — | `test_calibration_e2e.py` (4 scenarios) | — |

**Total Test Cases:** ~95
**Coverage Target:** >85% (core logic), >70% (overall)

---

## 12. Verifizierungskriterien (MUSS VOR COMMIT)

Nach jedem Packet:

```bash
# 1. Alle Tests grün
pytest god_kaiser_server/tests/ --tb=short -q

# 2. Type-Checking
mypy src/

# 3. Linting
ruff check src/

# 4. DB-Migration
alembic upgrade head  # Muss ohne Fehler durchlaufen

# 5. Bestehende Integration nicht broken
# Starten Sie dev Docker-Stack:
docker compose up -d
# Wait 10s für Services
sleep 10
pytest tests/integration/ -v -k "sensor"
```

---

## 13. Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|------------------|--------|-----------|
| **Migration zu bestehenden Daten schlägt fehl** | Medium | Datenverlust | Test auf Staging zuerst; Backup vor Migration |
| **Type-Normalisierung bricht Clients** | Low | API Breaking Change | Announce 2 weeks in advance; maintain compat wrapper |
| **Sessions accumulate unbegrenzt** | High | DB bloat | Implement Packet 9 (Expiry) als schnelle Folge |
| **Frontend wartet auf Intent/Outcome das nie kommt** | Medium | UX-Hang | Timeout auf client-side auch (10s); Fallback zu polling |
| **Race condition: Point wird doppelt added** | Low | Daten-Duplikate | Unique Index auf (session_id, raw_value) |

---

## 14. Abhängigkeiten & Sequenzierung

```
Packet 1 (Type-Norm)
    ↓
Packets 2, 3, 4 (Sessions DB + REST + Service) → parallel
    ↓
Packet 5 (Intent/Outcome)
    ↓
Packet 6 (Migration) → **BLOCKING**: muss LETZTE sein (nach DB-Schema-Updates)
    ↓
Packets 7, 8, 9 (Measurement ACK, Validation, Expiry) → parallel
    ↓
Packet 10 (Integration Tests + Docs)
```

**Kritischer Pfad:** 1 → (2+3+4) → 5 → 6 → 10
**Empfohlene Implementierungs-Dauer:** 4 Wochen (5 dev-days pro Packet)

---

## Fazit

Der aktuelle Server-Vertrag für Bodenfeuchte-Kalibrierung ist **funktionsfähig aber UNVOLLSTÄNDIG**:

✓ Endpoints existieren
✓ Daten werden in DB gespeichert
✗ Keine Session-Verwaltung
✗ Keine Terminal-Outcomes
✗ Type-Normalisierung inkonsistent
✗ Measurement-Feedback fehlt

Die **10-Packet-Implementierung** behebt alle P0-Lücken und etabliert ein **robusto, auditierbar, zukunftssicheres Kalibrierungs-Framework** mit vollem Intent/Outcome-Support.

**Nächster Schritt:** Scheduling Packet 1-5 für Sprint T14 (nach aktuellen Deployments).

