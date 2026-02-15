# Test Baseline Report

**Erstellt:** 2026-02-11
**Aktualisiert:** 2026-02-13 (systematic-debugging ESP_472204)
**Skill:** test-log-analyst
**Zweck:** Erstmalige Baseline-Messung aller Test-Suites

---

## Zusammenfassung

| Bereich | Tests | Passed | Failed | Skipped | Status |
|---------|-------|--------|--------|---------|--------|
| **Backend Unit** | 759 | 756 | 0 | 3 | GRUEN (1 gefixt) |
| **Backend ESP32-Mock** | 317 | 313 | 0 | 4 | GRUEN |
| **Backend Integration** | ~672 | ~667 | 0 | ~5 | GRUEN (5 gefixt) |
| **ESP32 Native (PIO)** | 2 Suites | 0 | 0 | 2 | BLOCKED (kein gcc) |
| **Frontend Vitest** | 250 | 250 | 0 | 0 | GRUEN |
| **TOTAL** | ~2000 | ~1986 | 0 | ~12 | **GRUEN** |

---

## Fixes durchgefuehrt

### 1. DS18B20 Quality Test (Unit)

**Datei:** `tests/unit/test_ds18b20_errors.py`
**Problem:** Test erwartete `quality="good"` fuer RAW 1360 (+85.0 C)
**Ursache:** RAW 1360 ist DS18B20 Power-On-Reset-Wert, Implementierung gibt korrekt `suspect` zurueck
**Fix:** Erwartungswert im Test von `good` auf `suspect` geaendert

### 2. psutil nicht installiert (Integration, 3+1 Tests)

**Dateien:** `tests/integration/test_api_health.py`, `test_user_workflows.py`
**Problem:** `ModuleNotFoundError: No module named 'psutil'`
**Ursache:** psutil ist in pyproject.toml deklariert aber war nicht im venv installiert
**Fix:** `pip install psutil`

### 3. Prometheus Metrics Test (Integration)

**Datei:** `tests/integration/test_api_health.py`
**Problem:** Test suchte nach `god_kaiser_uptime_seconds` Metrik
**Ursache:** Nach Migration auf prometheus-fastapi-instrumentator existiert diese Custom-Metrik nicht mehr
**Fix:** Erwartung auf `http_request_duration_seconds` aktualisiert (die Instrumentator-Metrik)

### 4. Device Onboarding Flow (Integration)

**Datei:** `tests/integration/test_user_workflows.py`
**Problem:** `403 Forbidden` beim Sensor-POST nach Device-Registration
**Ursache:** Register-API setzte `status="unknown"`, Sensor-API verlangt `approved`/`online`

**Fixes:**
- **Server-Code:** `src/api/v1/esp.py` — Register-Status von `unknown` auf `pending_approval` geaendert (korrekter Device-Lifecycle)
- **Test:** Approve-Step zwischen Registration und Sensor-Config eingefuegt

### 5. ESP32 Native Test Infrastructure

**Datei:** `El Trabajante/platformio.ini` + `test/infra/test_topic_builder.cpp`
**Problem:** PlatformIO native env konnte Tests nicht finden/bauen
**Fixes:**
- Test-File: `main()` fuer NATIVE_TEST, `setup()/loop()` fuer ESP32 (dual-mode)
- platformio.ini: `test_build_src = yes` beibehalten, `test_ignore` korrekt
- **BLOCKER:** gcc/g++ nicht auf System installiert — native Tests koennen nicht kompiliert werden

---

## Bekannte Issues (nicht gefixt)

### WebSocket Manager Teardown Hang

**Datei:** `tests/integration/test_websocket_manager.py`
**Symptom:** Alle 4 Tests passen, aber Prozess haengt beim Teardown (~5min)
**Ursache:** Async-Tasks (SequenceActionExecutor cleanup_loop) werden nicht sauber beendet
**Impact:** Tests bestehen, aber pytest-Prozess terminiert nicht von allein
**Workaround:** timeout-Wrapper um pytest

### PydanticDeprecatedSince20 Warnings (14x)

**Dateien:** `src/api/schemas.py`, `src/api/v1/audit.py`, `src/schemas/sequence.py`
**Problem:** Class-based `config` in Pydantic Models statt `ConfigDict`
**Impact:** Funktioniert noch, wird in Pydantic V3 entfernt

### pytest-asyncio event_loop Deprecation

**Problem:** Custom `event_loop` fixture in `tests/conftest.py:85`
**Impact:** Funktioniert noch, zukuenftig breaking

---

## Environment

- Python 3.13, pytest 8.x, pytest-asyncio
- Node.js, Vitest 3.2.4
- PlatformIO Core 6.1.18 (native: kein gcc/g++)
- Windows 11, Git Bash

---

## 2026-02-13: Systematic Debugging ESP_472204 („Nichts im Frontend“)

**Kontext:** Echter ESP (ESP_472204) sendet laut Serial MQTT-Publishes; Frontend zeigt kein Device/Daten. Root Cause (Phase 1): ESP_472204 ist **nicht in der DB** – der Server verarbeitet keine MQTT-Nachrichten von diesem ESP (siehe `.claude/reports/current/DB_INSPECTOR_REPORT.md`, `SYSTEMATIC_DEBUG_ESP472204.md`).

**Relevante Tests zur Pipeline-Verifikation („Device registriert → Sensor-Daten → API/Frontend“):**

| Befehl (PowerShell, Projektroot) | Zweck |
|----------------------------------|--------|
| `cd "c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one"` | Projektroot |
| `make e2e-up` | E2E-Stack starten (falls noch nicht laeuft) |
| `make e2e-test-backend-smoke` | Backend E2E Smoke (schnell) |
| `make e2e-test-backend` | Backend E2E voll (inkl. test_sensor_workflow: MQTT → sensor_handler → DB → API) |

**Erwartung:** Wenn E2E-Tests gruen sind, funktioniert die Pipeline **sobald** ein Device in der DB existiert und MQTT beim Server ankommt. Das bestaetigt: Problem liegt vor dem Server (MQTT von ESP_472204 erreicht Broker/Server nicht), nicht an Server/Frontend-Code.

**Nach Testlauf:** Logs/Ergebnis hier eintragen oder `test.md` mit Ergebnis aktualisieren (Pass/Fail, evtl. `logs/backend/pytest.log`, `logs/server/e2e-running-results.xml`).
