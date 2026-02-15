# E2E Bug Report - Vollstaendige Test-Analyse

**Datum:** 2026-01-30
**Tester:** E2E-Test-Spezialist (Claude Agent)
**System-Status bei Test:**
- Server: Healthy (Port 8000, MQTT connected, Uptime: 1472s)
- MQTT Broker: OK (Port 1883)
- Dependencies: OK

---

## ZUSAMMENFASSUNG

| Test-Suite | Passed | Failed | Skipped | Errors | Warnings |
|------------|--------|--------|---------|--------|----------|
| E2E-Tests | 0 | 1 | 12 | 6 | 9 |
| Integration (Sample) | 25 | 0 | 0 | 0 | 68 |
| ESP32-Tests | 48 | 0 | 4 | 0 | 7 |
| Unit-Tests | 725 | 2 | 2 | 0 | 392 |
| **TOTAL** | **798** | **3** | **18** | **6** | **476** |

---

## KRITISCHE BUGS (Failures)

### BUG-E2E-001: Falscher Health-Endpoint in E2E-Tests

- **Datei:** `tests/e2e/conftest.py:194`
- **Test:** `server_health_check` fixture
- **Severity:** KRITISCH (blockiert alle E2E-Tests)
- **Beschreibung:**
  E2E-Tests verwenden `/health` statt `/api/v1/health/`. Der Server gibt 404 zurueck.

- **Root Cause:**
  ```python
  # In tests/e2e/conftest.py:194
  health_url = f"{e2e_config.server_url}/health"  # FALSCH
  # Sollte sein:
  health_url = f"{e2e_config.server_url}/api/v1/health/"  # KORREKT
  ```

- **Stack-Trace:**
  ```
  E   Failed: Server not reachable at http://localhost:8000.
  tests\e2e\conftest.py:194: Failed
  ```

- **Reproduktion:**
  ```bash
  poetry run pytest tests/e2e/test_real_server_scenarios.py -v --e2e
  ```

- **Fix erforderlich in:**
  - `tests/e2e/conftest.py:194` - Health URL aendern
  - `tests/e2e/test_real_server_scenarios.py:1108` - Health endpoint URL aendern

---

### BUG-E2E-002: Health-Endpoint im Test erwartet falschen Pfad

- **Datei:** `tests/e2e/test_real_server_scenarios.py:639`
- **Test:** `TestSystemHealthCheck::test_health_endpoint_returns_status`
- **Severity:** MITTEL
- **Beschreibung:**
  Der Test prueft `/health` statt `/api/v1/health/` und erhaelt 404.

- **Stack-Trace:**
  ```
  E   AssertionError: Health-Endpoint sollte erreichbar sein
  E   assert 404 == 200
  ```

- **Reproduktion:**
  ```bash
  poetry run pytest tests/e2e/test_real_server_scenarios.py::TestSystemHealthCheck -v --e2e
  ```

---

### BUG-UNIT-001: DS18B20 Power-On Reset Quality Mapping

- **Datei:** `tests/unit/test_ds18b20_errors.py:112` und `:176`
- **Tests:**
  - `TestDS18B20PowerOnReset::test_raw_1360_is_accepted`
  - `TestDS18B20QualityAssessment::test_quality_mapping_raw_mode[1360-good]`
- **Severity:** NIEDRIG (Test vs. Implementation Diskrepanz)
- **Beschreibung:**
  Der DS18B20 Sensor-Prozessor gibt `quality='suspect'` fuer den Power-On Reset Wert (85C = RAW 1360) zurueck.
  Die Tests erwarten `quality='good'` oder `'fair'`.

- **Erwartung vs. Realitaet:**
  ```
  Test erwartet: quality='good' fuer 85C (RAW 1360)
  Prozessor gibt: quality='suspect' mit warning_code=1061
  ```

- **Stack-Trace:**
  ```
  E   AssertionError: DS18B20 +85C should be accepted (quality='good' or 'fair'), got 'suspect'
  E   assert 'suspect' in ('good', 'fair')
  ```

- **Analyse:**
  Dies koennte beabsichtigtes Verhalten sein - 85C ist der DS18B20 Power-On Reset Wert und sollte
  als "verdaechtig" markiert werden, da er oft einen Sensor-Fehler anzeigt.

  **Entscheidung erforderlich:**
  - Entweder Test anpassen (wenn 'suspect' korrekt ist)
  - Oder Prozessor anpassen (wenn 'good'/'fair' gewuenscht)

- **Reproduktion:**
  ```bash
  poetry run pytest tests/unit/test_ds18b20_errors.py::TestDS18B20PowerOnReset::test_raw_1360_is_accepted -xvs
  ```

---

## ERRORS (Setup/Collection Failures)

### ERROR-E2E-001 bis ERROR-E2E-006: Server Health Check Failure

- **Ursache:** `server_health_check` fixture schlaegt fehl (siehe BUG-E2E-001)
- **Betroffene Tests:**
  1. `TestDeviceDiscoveryToOnline::test_new_device_registration_and_heartbeat`
  2. `TestDeviceDiscoveryToOnline::test_device_appears_in_device_list`
  3. `TestSensorDataToFrontend::test_temperature_data_reaches_api`
  4. `TestSensorDataToFrontend::test_multiple_sensor_readings`
  5. `TestRuleTriggerCrossESP::test_temperature_triggers_ventilation`
  6. `TestWebSocketRealTimeUpdates::test_sensor_data_via_websocket`

- **Resolution:** Fix BUG-E2E-001 loest alle diese Errors

---

## SKIPPED TESTS

### E2E-Tests (12 skipped)

| Test | Grund |
|------|-------|
| 8x `test_logic_engine_real_server.py` | "Requires running server - use with: pytest -m e2e --run-e2e" |
| 4x `test_real_server_scenarios.py` | "Slow E2E tests require --slow-e2e flag" |

**Hinweis:** Diese benoetigten zusaetzliche Flags `--run-e2e` und `--slow-e2e`.

### ESP32-Tests (4 skipped)

| Test | Grund |
|------|-------|
| 4x `test_communication.py` | Nicht dokumentiert (wahrscheinlich Broker-Konfiguration) |

### Unit-Tests (2 skipped)

| Test | Grund |
|------|-------|
| `test_configure_credentials_calls_all_steps` | "Unix permissions not supported on Windows" |
| `test_configure_credentials_disables_auth` | "Unix permissions not supported on Windows" |

---

## WARNINGS (476 total)

### Kategorie 1: Pydantic Deprecation (7 Dateien)

| Datei | Zeile | Warning |
|-------|-------|---------|
| `src/api/schemas.py` | 15 | PydanticDeprecatedSince20: class-based `config` deprecated |
| `src/api/schemas.py` | 98 | PydanticDeprecatedSince20: class-based `config` deprecated |
| `src/api/schemas.py` | 156 | PydanticDeprecatedSince20: class-based `config` deprecated |
| `src/api/schemas.py` | 204 | PydanticDeprecatedSince20: class-based `config` deprecated |
| `src/api/schemas.py` | 277 | PydanticDeprecatedSince20: class-based `config` deprecated |
| `src/api/v1/audit.py` | 38 | PydanticDeprecatedSince20: class-based `config` deprecated |
| `src/schemas/sequence.py` | 111 | PydanticDeprecatedSince20: class-based `config` deprecated |

**Fix:** Ersetze `class Config:` durch `model_config = ConfigDict(...)` in allen Pydantic-Modellen.

### Kategorie 2: SQLAlchemy utcnow() Deprecation (~360 Warnings)

| Datei | Warning |
|-------|---------|
| `sqlalchemy/sql/schema.py:3624` | datetime.datetime.utcnow() is deprecated |
| `src/db/repositories/system_config_repo.py:200` | datetime.datetime.utcnow() is deprecated |

**Fix:** Ersetze `datetime.utcnow()` durch `datetime.now(datetime.UTC)` in Models und Repositories.

### Kategorie 3: Pytest Unknown Marks (2 Warnings)

| Mark | Datei |
|------|-------|
| `pytest.mark.requires_server` | `test_logic_engine_real_server.py:28` |

**Fix:** Registriere Mark in `pyproject.toml`:
```toml
[tool.pytest.ini_options]
markers = [
    "requires_server: marks tests as requiring a running server",
]
```

### Kategorie 4: PytestCollectionWarning

| Warning | Datei |
|---------|-------|
| `cannot collect test class 'TestESPDevice'` | `tests/e2e/conftest.py:133` |

**Fix:** Benenne `TestESPDevice` um zu `ESPDevice` (ohne "Test" Prefix) da es ein Dataclass ist.

---

## FIX-EMPFEHLUNGEN (Priorisiert)

### Prioritaet 1: E2E-Tests reparieren

1. **Fix Health-Endpoint URLs:**
   ```python
   # tests/e2e/conftest.py:194
   health_url = f"{e2e_config.server_url}/api/v1/health/"

   # tests/e2e/test_real_server_scenarios.py:1108
   async with e2e_http_client.get(
       f"{e2e_config.server_url}/api/v1/health/"
   ) as response:
   ```

2. **Registriere fehlenden pytest Mark:**
   ```toml
   # pyproject.toml
   [tool.pytest.ini_options]
   markers = [
       "requires_server: marks tests as requiring a running server",
       "e2e: End-to-End tests requiring a running server",
       "slow_e2e: Slow E2E tests (>30s)",
   ]
   ```

### Prioritaet 2: DS18B20 Test/Implementation Alignment

Entscheide ob 85C (Power-On Reset) als:
- `'suspect'` (aktuell) - Warnt Benutzer vor moeglichem Sensor-Problem
- `'good'`/`'fair'` (Test-Erwartung) - Akzeptiert als gueltiger Wert

### Prioritaet 3: Pydantic Migration

Migriere alle `class Config:` zu `model_config = ConfigDict()`:
```python
# Vorher
class MyModel(BaseModel):
    class Config:
        from_attributes = True

# Nachher
from pydantic import ConfigDict

class MyModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
```

### Prioritaet 4: utcnow() Deprecation

Ersetze in allen Dateien:
```python
# Vorher
datetime.utcnow()

# Nachher
from datetime import datetime, UTC
datetime.now(UTC)
```

---

## TEST-LOGS

Die folgenden Logs wurden waehrend der Test-Ausfuehrung erstellt:
- `e2e_tests.log` - E2E Test Output
- `e2e_tests_with_flag.log` - E2E Tests mit --e2e Flag

---

## NAECHSTE SCHRITTE

1. [ ] BUG-E2E-001 fixen (Health-Endpoint URL)
2. [ ] BUG-E2E-002 fixen (Health-Test URL)
3. [ ] Entscheidung zu BUG-UNIT-001 (DS18B20 Quality)
4. [ ] Pydantic Migration (7 Dateien)
5. [ ] utcnow() Migration
6. [ ] pytest Marks registrieren
7. [ ] TestESPDevice umbenennen
8. [ ] E2E-Tests mit --run-e2e und --slow-e2e validieren

---

*Report generiert von E2E-Test-Spezialist Agent*
