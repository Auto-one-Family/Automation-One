# ✅ Bugs GEFIXT - Integration-Tests

Diese Bugs wurden beim Testen der MQTT-Handler mit realistischen ESP32-Payloads entdeckt und **sind jetzt behoben**.

---

## ✅ BUG #1: ActuatorHandler - `last_command` Feld (GEFIXT)

**Problem:** Handler übergibt `last_command` aber `ActuatorState` hatte das Feld nicht.

**Fix (2024-12-03):**
- Neue Felder zu `ActuatorState` in `src/db/models/actuator.py` hinzugefügt:
  - `last_command: Mapped[Optional[str]]`
  - `error_message: Mapped[Optional[str]]`

---

## ✅ BUG #2: SensorHandler - Falscher Feldname (GEFIXT)

**Problem:** Handler nutzte `sensor_config.metadata` statt `sensor_config.sensor_metadata`.

**Fix (2024-12-03):**
- Zeile 302-303 in `src/mqtt/handlers/sensor_handler.py` korrigiert:
  ```python
  if sensor_config and sensor_config.sensor_metadata:
      processing_params = sensor_config.sensor_metadata.get("processing_params")
  ```

---

## 📊 Aktuelle Test-Ergebnisse

```
34 passed, 0 xfailed ✅
```

Alle vorher als xfail markierten Tests sind jetzt grün:
- ✅ `test_handle_actuator_status_success`
- ✅ `test_handle_actuator_status_with_error`
- ✅ `test_actuator_command_response_flow`
- ✅ `test_pi_enhanced_triggers_for_raw_mode_sensor`

---

## ⚠️ Migration benötigt (falls Produktions-DB)

Falls `ActuatorState` bereits in einer Produktionsdatenbank existiert, muss eine Alembic-Migration erstellt werden:

```bash
cd "El Servador/god_kaiser_server"
poetry run alembic revision --autogenerate -m "Add last_command and error_message to ActuatorState"
poetry run alembic upgrade head
```

---

*Gefixt am: 2024-12-03*
