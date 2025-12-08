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

---

## ✅ BUG #3: MockESP32Client clampte PWM-Werte nicht (GEFIXT)

**Problem:** `actuator_set` akzeptierte PWM-Werte außerhalb 0.0–1.0, obwohl die
Safety-Constraints diese Range erzwingen. Die Testengine spiegelte damit das
Produktionsverhalten nicht korrekt wider.

**Fix (2025-12-08):**
- `tests/esp32/mocks/mock_esp32_client.py` begrenzt PWM jetzt auf
  `min_value`/`max_value` (Default 0.0–1.0).
- Tests angepasst/erweitert: `test_actuator.py::test_pwm_range_clamping` und
  neuer Limit-Test `test_pwm_respects_configured_limits`.

**Nutzen:** Simulationen respektieren jetzt Safety-Constraints, wodurch
Vorab-Logikprüfungen realitätsnäher und sicherer sind.

---

## ✅ BUG #4: API Logic Tests - Model Mismatch (GEFIXT)

**Problem:** API-Endpoints in `src/api/v1/logic.py` verwendeten veraltete Model-Namen und Integer-IDs statt UUIDs.

**Fix (2025-12-08):**
1. **Model-Alignment:** `LogicRule` → `CrossESPLogic` mit korrekten Feldnamen:
   - `name` → `rule_name`
   - `conditions` → `trigger_conditions`
2. **UUID Support:** `rule_id: int` → `rule_id: uuid.UUID` in allen Endpoints
3. **Repository Methods:** Neue Methoden in `LogicRepository`:
   - `get_execution_count(rule_id: UUID) -> int`
   - `get_execution_history(...) -> List[LogicExecutionHistory]`
4. **Test Isolation:** Neues `integration_session` Fixture ohne Transaction-Block
5. **Condition Types:** `"type": "sensor"` statt `"sensor_threshold"` (ESP32-kompatibel)

---

## 📊 Aktuelle Test-Ergebnisse

**ESP32 Tests:**
```
34 passed, 0 xfailed ✅
```

**API Logic Tests:**
```
13 passed ✅
```

Alle vorher als xfail markierten Tests sind jetzt grün:
- ✅ `test_handle_actuator_status_success`
- ✅ `test_handle_actuator_status_with_error`
- ✅ `test_actuator_command_response_flow`
- ✅ `test_pi_enhanced_triggers_for_raw_mode_sensor`

API Logic Tests:
- ✅ `test_list_rules`
- ✅ `test_get_rule`
- ✅ `test_get_rule_not_found`
- ✅ `test_create_rule`
- ✅ `test_update_rule`
- ✅ `test_toggle_rule_disable`
- ✅ `test_toggle_rule_enable`
- ✅ `test_simulate_rule`
- ✅ `test_simulate_rule_not_trigger`
- ✅ `test_get_execution_history`
- ✅ `test_get_execution_history_with_filter`
- ✅ `test_delete_rule`
- ✅ `test_delete_rule_not_found`

---

## ⚠️ Migration benötigt (falls Produktions-DB)

Falls `ActuatorState` bereits in einer Produktionsdatenbank existiert, muss eine Alembic-Migration erstellt werden:

```bash
cd "El Servador/god_kaiser_server"
poetry run alembic revision --autogenerate -m "Add last_command and error_message to ActuatorState"
poetry run alembic upgrade head
```

---

---

## 📝 Zusammenfassung

| Bug | Status | Datum |
|-----|--------|-------|
| #1 ActuatorHandler `last_command` | ✅ GEFIXT | 2024-12-03 |
| #2 SensorHandler Feldname | ✅ GEFIXT | 2024-12-03 |
| #3 MockESP32Client PWM-Clamping | ✅ GEFIXT | 2025-12-08 |
| #4 API Logic Model-Mismatch | ✅ GEFIXT | 2025-12-08 |

---

*Letztes Update: 2025-12-08*
