# Server-Verifikation gegen test.md

**Datum:** 2026-02-08  
**Bereich:** server-development (El Servador)  
**Referenz:** `.claude/reports/Testrunner/test.md` Abschnitte 9, 14, 15

---

## 1. MULTI-VALUE-Änderungen (Session 15)

### 1.1 esp_repo.py – `set_manual_sensor_override()`

| test.md | Code (esp_repo.py Z.453-461) | Status |
|---------|-----------------------------|--------|
| Sensor-Check nutzt `str(gpio) in sensors` **oder** `any(k.startswith(f"{gpio}_") for k in sensors)` | `has_gpio = str(gpio) in sensors or any(k == str(gpio) or k.startswith(f"{gpio}_") for k in sensors)` | ✅ **VERIFIZIERT** |

Keys wie `4_temperature` werden korrekt erkannt.

---

### 1.2 debug.py – `POST /mock-esp/{esp_id}/sensors/{gpio}/value`

| test.md | Code (debug.py Z.1111-1118) | Status |
|---------|---------------------------|--------|
| Gleicher MULTI-VALUE-Check: Sensor existiert, wenn Key `gpio` oder `gpio_sensor_type` | `has_gpio = str(gpio) in sensors or any(k == str(gpio) or k.startswith(f"{gpio}_") for k in sensors)` | ✅ **VERIFIZIERT** |

Endpoint prüft vor dem Aufruf von `esp_repo.set_manual_sensor_override()` ob der Sensor existiert.

---

### 1.3 scheduler.py – `set_sensor_value()`

| test.md | Code (scheduler.py Z.1011-1020) | Status |
|---------|-------------------------------|--------|
| Sensor-Config-Lookup: Falls `sensors_config.get(str(gpio))` leer, nach Key `gpio_sensor_type` suchen | `sensor_config = sensors_config.get(str(gpio), {})`; Fallback: `for key, cfg in sensors_config.items(): if key == str(gpio) or key.startswith(f"{gpio}_"): sensor_config = cfg; break` | ✅ **VERIFIZIERT** |

`sensor_type` wird korrekt aus Config geholt (nicht mehr `GENERIC`) → MQTT-Payload enthält korrekten `sensor_type`.

---

## 2. WebSocket-Event-Typen

| test.md | Server sendet | Code-Referenz | Status |
|---------|---------------|---------------|--------|
| `device_discovered` | `device_discovered` | `heartbeat_handler.py:553`, `debug.py:319` | ✅ |
| `actuator_alert` | `actuator_alert` | `actuator_alert_handler.py:189` | ✅ |
| `sensor_data` | `sensor_data` | `sensor_handler.py:314` | ✅ |

**Test.md Empfehlung:** WebSocket-Helper in `websocket.ts` nutzt teilweise falsche Typen (`device.online` statt `device_discovered`). Das ist ein **Frontend-Test-Bug**, nicht Server-Bug.

---

## 3. API-Endpoints für Mock-ESP (Frontend api.ts)

| api.ts Funktion | Endpoint | Server-Implementierung | Status |
|-----------------|----------|------------------------|--------|
| `createMockEspWithSensor` | `POST /api/v1/debug/mock-esp` | debug.py | ✅ |
| | `POST /api/v1/debug/mock-esp/{id}/sensors` | debug.py | ✅ |
| | `POST /api/v1/debug/mock-esp/{id}/simulation/start` | debug.py | ✅ |
| `setMockSensorValue` | `POST /api/v1/debug/mock-esp/{id}/sensors/batch` | debug.py Z.1200-1236 | ✅ |

**Batch-Request:** `BatchSensorValueRequest` mit `values: Dict[int, float]`, `publish: bool = True` – Schema stimmt mit Frontend-Payload überein.

---

## 4. Offener Befund: actuator_alert_handler DataError

**test.md (Abschnitt 13.2):**  
`DataError: can't subtract offset-naive and offset-aware datetimes` beim `INSERT INTO actuator_history` (timestamp $10)

**Analyse:**
- `actuator_alert_handler.py` übergibt `esp32_timestamp` = `datetime.fromtimestamp(..., tz=timezone.utc)` (timezone-aware)
- `ActuatorHistory` Model: `default=datetime.utcnow` (naive!)
- PostgreSQL: Wenn die Spalte `timestamp` als `TIMESTAMPTZ` definiert ist, kann das Mischen von naive/aware zu Fehlern führen

**Status:** **Behoben** (2026-02-08)

**Fix:** `actuator.py` – `default=datetime.utcnow` → `default=lambda: datetime.now(timezone.utc)` (timezone-aware)

---

## 5. Sensor-Pipeline (sensor_data → WebSocket)

| Komponente | Beschreibung | Status |
|------------|--------------|--------|
| `set_batch_sensor_values` | debug.py → scheduler.set_batch_sensor_values | ✅ |
| `scheduler.set_sensor_value` | manual_overrides in DB, dann MQTT publish | ✅ |
| MQTT Publish | TopicBuilder.build_sensor_data_topic, payload mit raw_value, sensor_type | ✅ |
| sensor_handler | Empfängt MQTT, speichert, broadcast "sensor_data" | ✅ |

**Bedingung:** Mock-ESP muss laufen (`simulation/start`), sonst `SimulationNotRunningError`.

---

## 6. Zusammenfassung

| Frage | Antwort |
|-------|---------|
| **Sind die MULTI-VALUE-Fixes im Code?** | **Ja** – esp_repo, debug.py, scheduler alle korrekt implementiert |
| **Stimmen WebSocket-Events?** | **Ja** – Server sendet `device_discovered`, `actuator_alert`, `sensor_data` |
| **Stimmen API-Pfade für Mock-ESP?** | **Ja** – create, sensors, batch, simulation/start vorhanden |
| **actuator_history DataError?** | **Behoben** – default auf `datetime.now(timezone.utc)` |

**Empfehlung:** Server neu starten nach Code-Änderungen (`docker compose restart el-servador`), damit die MULTI-VALUE-Fixes aktiv sind.
