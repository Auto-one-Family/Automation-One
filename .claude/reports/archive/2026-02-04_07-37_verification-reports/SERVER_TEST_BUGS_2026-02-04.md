# Server Test-Suite Bug Report

**Datum:** 2026-02-04
**Analyst:** Claude Server Test Specialist
**Status:** VOLLSTÄNDIG

---

## Executive Summary

| Kategorie | Total | Passed | Failed | Skipped |
|-----------|-------|--------|--------|---------|
| Unit | 745 | 740 | 2 | 3 |
| Integration | 672 | 663 | 9 | 0 |
| ESP32 | 317 | 313 | 0 | 4 |
| E2E | 23 | 0 | 0 | 23 |
| **Gesamt** | **1757** | **1716** | **11** | **30** |

**Test-Erfolgsrate:** 97.7%

### Kritische Bugs (Blocker für Release)
1. **BUG-INT-001 bis 004:** Heartbeat Handler - Mock-Konfigurationsfehler (4 Tests)

### Wichtige Bugs (Sollten gefixt werden)
1. **BUG-AUTH-001/002:** Fehlende PyJWT Dependency (2 Tests)
2. **BUG-UNIT-001:** DS18B20 Power-On-Reset Design-Konflikt (2 Tests)

### Niedrige Priorität (Test-Fehler, nicht Code-Fehler)
1. **BUG-INT-005:** Actuator API - Test assertion falsch
2. **BUG-GH-001/002:** Greenhouse Scenarios - Test-Logik-Fehler

---

## 1. Infrastruktur-Fixes

### FIX-001: Dateinamenkonflikt behoben
- **Problem:** `test_circuit_breaker.py` existierte in zwei Verzeichnissen
  - `tests/unit/test_circuit_breaker.py` (14 Tests)
  - `tests/integration/test_circuit_breaker.py` (27 Tests)
- **Symptom:** pytest Import-Konflikt blockierte sauberen Testlauf
- **Aktion:** `tests/unit/test_circuit_breaker.py` → `tests/unit/test_circuit_breaker_unit.py`
- **Status:** ✅ Erledigt
- **Verifikation:** Beide Tests laufen unabhängig (14 + 27 = 41 passed)

---

## 2. Unit Test Bugs

### BUG-UNIT-001: DS18B20 Power-On-Reset Handling

**Tests:**
- `test_ds18b20_errors.py::TestDS18B20PowerOnReset::test_raw_1360_is_accepted`
- `test_ds18b20_errors.py::TestDS18B20QualityAssessment::test_quality_mapping_raw_mode[1360-good]`

**Severity:** MEDIUM (Design-Diskrepanz)

**Traceback:**
```
AssertionError: DS18B20 +85°C should be accepted (quality='good' or 'fair'), got 'suspect'
assert 'suspect' in ('good', 'fair')
```

**Root Cause:**
Der Test erwartet, dass RAW 1360 (= 85°C) mit quality='good' verarbeitet wird.
Der Code in `temperature.py:158-173` markiert diesen Wert jedoch explizit als 'suspect' mit:
- `warning_code: 1061` (ERROR_DS18B20_POWER_ON_RESET)
- `requires_verification: True`

**Design-Konflikt:**
- **Test-Argumentation:** ESP32 filtert Power-On-Reset bereits, wenn 85°C beim Server ankommt ist es valide
- **Code-Argumentation:** 85°C ist ein bekannter Power-On-Reset-Wert, Warnung ist sinnvoll

**Betroffene Dateien:**
- `src/sensors/sensor_libraries/active/temperature.py:153-173`
- `tests/unit/test_ds18b20_errors.py:100-112, 140-176`

**Vorgeschlagener Fix:**
Option A: Test anpassen - 'suspect' als akzeptables Verhalten
Option B: Code anpassen - nur bei first_reading=True als suspect markieren
**Empfehlung:** Option A - aktuelle Code-Logik ist defensiv und korrekt

---

## 3. Integration Test Bugs

### BUG-INT-001 bis 004: Heartbeat Handler Mock-Fehler

**Tests (alle 4 mit gleichem Root Cause):**
1. `test_heartbeat_handler.py::TestDeviceStatusTransitions::test_approved_device_goes_online`
2. `test_heartbeat_handler.py::TestDeviceStatusTransitions::test_pending_device_stays_pending`
3. `test_heartbeat_handler.py::TestDeviceDiscovery::test_new_device_triggers_discovery`
4. `test_heartbeat_handler.py::TestOnlineDeviceHeartbeat::test_online_device_updates_last_seen`

**Severity:** HIGH (Test-Infrastruktur-Bug)

**Traceback:**
```
TypeError: object MagicMock can't be used in 'await' expression
File "heartbeat_handler.py", line 218, in handle_heartbeat
    await session.commit()
```

**Root Cause:**
Die Tests mocken `resilient_session` als Context Manager, aber `session.commit()` wird nicht als `AsyncMock` konfiguriert:
```python
mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
# FEHLT: mock_db.commit = AsyncMock()
```

**Betroffene Dateien:**
- `tests/integration/test_heartbeat_handler.py:207-238, 245-268, 280-325, 437-471`

**Vorgeschlagener Fix:**
```python
mock_db = MagicMock()
mock_db.commit = AsyncMock()  # HINZUFÜGEN
mock_db.rollback = AsyncMock()  # Optional für Fehlerbehandlung
mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
```

---

### BUG-AUTH-001/002: Fehlende PyJWT Dependency

**Tests:**
1. `test_api_auth.py::TestLoginFormTokenVersion::test_login_form_includes_token_version`
2. `test_api_auth.py::TestLoginFormTokenVersion::test_login_form_tokens_rejected_after_logout_all`

**Severity:** MEDIUM (Fehlende Test-Dependency)

**Traceback:**
```
ModuleNotFoundError: No module named 'jwt'
tests/integration/test_api_auth.py:334: import jwt
```

**Root Cause:**
Tests importieren `import jwt` (PyJWT), aber dieses Paket ist nicht in den Test-Dependencies installiert.
Das Projekt verwendet vermutlich `python-jose` für JWT-Handling.

**Betroffene Dateien:**
- `tests/integration/test_api_auth.py:334, 356`

**Vorgeschlagener Fix:**
Option A: `poetry add --group dev PyJWT`
Option B: Tests auf `python-jose` umschreiben (konsistent mit Production-Code)
**Empfehlung:** Option B - Konsistenz mit Codebase

---

### BUG-INT-005: Actuator API - Test Assertion Fehler

**Test:**
- `test_api_actuators.py::TestSendCommand::test_command_disabled_actuator`

**Severity:** LOW (Test-Fehler, nicht Code-Fehler)

**Traceback:**
```
AttributeError: 'dict' object has no attribute 'lower'
assert "disabled" in response.json()["detail"].lower()
```

**Root Cause:**
API gibt `detail` als dict zurück, Test erwartet string:
```python
# API Response:
{"detail": {"message": "...", "code": "..."}}  # dict

# Test erwartet:
{"detail": "actuator is disabled"}  # string
```

**Betroffene Dateien:**
- `tests/integration/test_api_actuators.py:231`

**Vorgeschlagener Fix:**
```python
# Alt:
assert "disabled" in response.json()["detail"].lower()

# Neu (Option A - wenn detail dict ist):
detail = response.json()["detail"]
assert "disabled" in detail.get("message", "").lower()

# Neu (Option B - wenn detail string sein soll):
assert "disabled" in str(response.json()["detail"]).lower()
```

---

### BUG-GH-001: Greenhouse Ventilation Off-by-One

**Test:**
- `test_greenhouse_scenarios.py::TestVentilationLogic::test_ventilation_gradual_opening`

**Severity:** LOW (Test-Logik-Fehler)

**Traceback:**
```
AssertionError: Sollte 10 Schritte dauern, waren aber 11
assert 11 == 10
```

**Root Cause:**
Test-Logik zählt inkorrekt:
- Loop: 0.0 → 0.1 → 0.2 → ... → 1.0 = 11 Iterationen
- Erwartung: 10 Schritte (falsche Annahme)

**Betroffene Dateien:**
- `tests/integration/test_greenhouse_scenarios.py:840`

**Vorgeschlagener Fix:**
```python
# Alt:
assert steps_taken == 10

# Neu:
assert steps_taken == 11  # 0.0 zählt als erster Schritt
```

---

### BUG-GH-002: Greenhouse Night Mode min_value Konflikt

**Test:**
- `test_greenhouse_scenarios.py::TestNightModeOperation::test_night_mode_minimum_activity`

**Severity:** LOW (Mock-Konfigurationsproblem)

**Traceback:**
```
AssertionError: Lüftungsmotor sollte nachts aus sein
assert 0.2 == 0
ActuatorState(..., pwm_value=0.2, ..., min_value=0.2, ...)
```

**Root Cause:**
MockESP32Client konfiguriert Fan mit `min_value=0.2`, daher kann PWM nicht auf 0 gesetzt werden.
Der Actuator hält den Minimalwert.

**Betroffene Dateien:**
- `tests/integration/test_greenhouse_scenarios.py:906`
- `tests/esp32/mocks/mock_esp32_client.py` (Actuator-Konfiguration)

**Vorgeschlagener Fix:**
Option A: Test anpassen - `assert fan.pwm_value == fan.min_value`
Option B: Mock mit `min_value=0.0` konfigurieren
**Empfehlung:** Option A - Test soll realistisches Verhalten testen

---

## 4. Skipped Tests Analyse

### Unit Tests (3 skipped)

| Test | Grund | Aktion |
|------|-------|--------|
| Unique constraint test | DB-spezifisch (sqlite vs postgres) | Belassen |
| Unix permission test 1 | Windows nicht unterstützt | Belassen |
| Unix permission test 2 | Windows nicht unterstützt | Belassen |

### ESP32 Tests (4 skipped)

| Test | Grund | Aktion |
|------|-------|--------|
| Hardware I2C test | ESP32_TEST_DEVICE_ID nicht gesetzt | Belassen (Hardware-Test) |
| Hardware GPIO test | ESP32_TEST_DEVICE_ID nicht gesetzt | Belassen (Hardware-Test) |
| Hardware MQTT test | ESP32_TEST_DEVICE_ID nicht gesetzt | Belassen (Hardware-Test) |
| Hardware NVS test | ESP32_TEST_DEVICE_ID nicht gesetzt | Belassen (Hardware-Test) |

### E2E Tests (23 skipped)

**Grund:** Erfordern `--e2e` Flag und laufenden Server
**Aktion:** Separater E2E-Testlauf bei Bedarf mit `poetry run pytest --e2e`

---

## 5. Warnings

### Kritisch (eigener Code - MUSS gefixt werden)

| Warning | Dateien | Fix |
|---------|---------|-----|
| `datetime.utcnow()` deprecated | 10 Stellen (siehe unten) | `datetime.now(timezone.utc)` |

**Betroffene Dateien mit `datetime.utcnow()`:**
```
src/db/repositories/actuator_repo.py:212, 286
src/db/repositories/sensor_repo.py:261, 652
src/db/repositories/system_config_repo.py:200
src/services/logic/safety/rate_limiter.py:56, 67
src/services/logic/safety/conflict_manager.py:123, 236, 244
```

### Test-spezifisch (Mock-Konfiguration)

| Warning | Tests | Fix |
|---------|-------|-----|
| `coroutine 'X' was never awaited` | Heartbeat Handler Tests | Mock als AsyncMock konfigurieren |

### Akzeptiert (externe Libraries)

| Warning | Quelle | Häufigkeit |
|---------|--------|------------|
| PydanticDeprecatedSince20 | Pydantic V1 → V2 Migration | ~400x pro Lauf |
| PytestUnknownMarkWarning | Custom markers | ~20x (temperature, irrigation, ventilation, night_mode) |
| SQLAlchemy DeprecationWarning | datetime.utcnow | ~10x (Library intern) |

**Custom Markers registrieren in `pyproject.toml`:**
```toml
[tool.pytest.ini_options]
markers = [
    "temperature: Temperature management tests",
    "irrigation: Irrigation system tests",
    "ventilation: Ventilation control tests",
    "night_mode: Night mode operation tests",
    "ds18b20: DS18B20 sensor tests",
    "sensor: General sensor tests",
]
```

---

## 6. Empfehlungen

### Vor Release fixen (Priorität: HOCH)
1. **BUG-INT-001-004:** Heartbeat Handler Mock-Konfiguration fixen
   - Aufwand: 30 Minuten
   - Risiko: Niedrig

2. **datetime.utcnow() Migration:**
   - Aufwand: 1 Stunde
   - Risiko: Niedrig

### Nach Release fixen (Priorität: MITTEL)
1. **BUG-AUTH-001/002:** PyJWT vs python-jose konsistent machen
2. **BUG-UNIT-001:** DS18B20 Design-Entscheidung dokumentieren

### Technische Schulden (Priorität: NIEDRIG)
1. Custom pytest markers registrieren
2. Test-Assertions für API-Response-Format standardisieren
3. Pydantic V2 Migration planen

---

## 7. Test-Infrastruktur Verbesserungen

### Empfohlene Änderungen

1. **pytest-timeout installieren:**
   ```bash
   poetry add --group dev pytest-timeout
   ```
   Verhindert hängende Tests.

2. **Mock-Helper erstellen:**
   Zentrale Factory für async database session mocks.

3. **CI Pipeline:**
   Integration Tests mit `--timeout=60` pro Test.

---

## Anhang

### A. Test-Lauf Kommandos
```bash
# Unit Tests
poetry run pytest tests/unit/ -v --tb=short

# Integration Tests (ohne E2E)
poetry run pytest tests/integration/ -v --tb=short

# ESP32 Tests
poetry run pytest tests/esp32/ -v --tb=short

# Vollständig mit E2E
poetry run pytest --e2e -v --tb=short
```

### B. Generierte Output-Dateien
- `integration_output.txt`
- `ds18b20_bugs.txt`
- `heartbeat_bugs.txt`
- `auth_bugs.txt`
- `greenhouse_bugs.txt`
- `actuator_bugs.txt`

---

*Report erstellt am 2026-02-04 von Claude Server Test Specialist*
