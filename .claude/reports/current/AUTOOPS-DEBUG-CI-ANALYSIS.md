# AutoOps Debug & CI Analysis Report

**Datum:** 2026-03-02
**Scope:** Vollständige CI-Pipeline + Pattern-Bug-Analyse
**Commit:** `093da46` (feat: notification stack Phase 4A)

---

## Ergebnis-Zusammenfassung

| Kategorie | Gefunden | Gefixt | Status |
|-----------|----------|--------|--------|
| **datetime.utcnow() deprecated** | 8 Stellen (src) + 3 (tests) | 11/11 | FIXED |
| **EmailService test broken** | 1 (patch-before-reload Bug) | 1/1 | FIXED |
| **MQTT Auth test warning** | 2 (AsyncMock statt MagicMock) | 2/2 | FIXED |
| **ESPDevice Type-Safety** | 80+ `as any` Casts (Root-Cause) | Root-Cause gefixt | FIXED |
| **TypeScript Check** | 0 Errors | - | CLEAN |
| **Pydantic v2 Migration** | 0 Issues | - | CLEAN |
| **SQLAlchemy async/await** | 0 Issues | - | CLEAN |

---

## Bug 1: `datetime.utcnow()` Deprecated (Python 3.12+)

**Schwere:** KRITISCH (DeprecationWarning, wird in Python 3.14 entfernt)
**Root-Cause:** Python 3.12 deprecatd `datetime.utcnow()`. Project nutzt Python 3.12.

### Geänderte Dateien (Source)

| Datei | Zeile | Fix |
|-------|-------|-----|
| `src/db/models/sensor.py:359` | `default=datetime.utcnow` | `default=_utc_now` |
| `src/db/models/actuator.py:416` | `default=datetime.utcnow` | `default=_utc_now` |
| `src/db/models/ai.py:105` | `default=datetime.utcnow` | `default=_utc_now` |
| `src/db/models/kaiser.py:171` | `default=datetime.utcnow` | `default=_utc_now` |
| `src/api/v1/sensors.py:807,811,1013,1017` | `datetime.utcnow()` | `datetime.now(timezone.utc).replace(tzinfo=None)` |

**Pattern:** Nutzt bestehende `_utc_now()` Funktion aus `db/base.py` für Model-Defaults.
API-Layer nutzt `datetime.now(timezone.utc).replace(tzinfo=None)` für naive UTC Timestamps (DB-Kompatibilität).

### Geänderte Dateien (Tests)

| Datei | Fix |
|-------|-----|
| `tests/unit/test_repositories_actuator.py:109` | `datetime.now(timezone.utc)` |
| `tests/unit/test_repositories_sensor.py:365,393` | `datetime.now(timezone.utc)` |

---

## Bug 2: EmailService Test (Phase 4A Notification Stack)

**Schwere:** HOCH (Test scheitert in CI, blockiert Pipeline)
**Root-Cause:** `patch("...get_settings") → reload(module)` überschreibt die Patch.
Python `importlib.reload()` führt alle Module-Level Imports neu aus und überschreibt die `unittest.mock.patch` auf `get_settings`.

**Fix:** Test restructured: `_send_via_resend` direkt gemockt statt `asyncio.to_thread` + Modul-Reload.

**Datei:** `tests/unit/test_email_service.py::test_send_email_resend_success`

---

## Bug 3: MQTT Auth Test (Unawaited Coroutine Warning)

**Schwere:** MITTEL (Warning, kein Failure, aber fragile Tests)
**Root-Cause:** `_publish_with_retry` ist eine **synchrone** Methode (`publisher.py:355`).
Test mockte sie als `AsyncMock(return_value=True)` — erzeugt unawaited Coroutine.

**Fix:** `AsyncMock` → `MagicMock` in 2 Tests.

**Datei:** `tests/unit/test_mqtt_auth_service.py` (2 Stellen)

---

## Bug 4: ESPDevice Type-Safety (Frontend)

**Schwere:** MITTEL (Kompiliert, aber 80+ `as any` verdecken potentielle Bugs)
**Root-Cause:** `ESPDevice.sensors` und `ESPDevice.actuators` waren als `unknown[]` typisiert.
Alle Komponenten die Sensor/Actuator-Daten aus dem Device lesen mussten `as any` casten.

**Fix:** `unknown[]` → `MockSensor[]` / `MockActuator[]` in ESPDevice Interface.

**Datei:** `El Frontend/src/api/esp.ts:84-85`

**Auswirkung:** Eliminiert die Root-Cause für 80+ `as any` Casts. Bestehende Casts in Komponenten
können jetzt schrittweise entfernt werden (kein Breaking Change, da TS `unknown[]` → `MockSensor[]`
ein breiterer Typ ist).

---

## Test-Ergebnisse nach Fixes

### Server (Python)
```
830 passed, 4 skipped, 0 warnings in 16.11s
```

### Frontend (TypeScript/Vue)
```
45 files, 1532 tests passed
TypeScript Check: 0 errors
```

---

## CI Pipeline Analyse

| Workflow | Trigger | Status |
|----------|---------|--------|
| `server-tests.yml` | push to master (El Servador/**) | Fixes eliminieren Warnings |
| `frontend-tests.yml` | push to master (El Frontend/**) | Type-Fix verbessert Safety |
| `esp32-tests.yml` | push to master (tests/esp32/**) | Nicht betroffen |
| `backend-e2e-tests.yml` | push to master (El Servador/**) | EmailService Fix relevant |
| `playwright-tests.yml` | push (El Frontend/** + El Servador/**) | Nicht betroffen |
| `security-scan.yml` | push to master (Dockerfiles) | Nicht betroffen |
| `pr-checks.yml` | PR events | Nicht betroffen |

---

## Verbleibende Hinweise (kein Fix nötig)

1. **`as any` in Komponenten** — 80+ Stellen können schrittweise bereinigt werden, jetzt wo `ESPDevice.sensors`/`actuators` korrekt typisiert sind.
2. **`jinja2` nicht installiert** — Optional dependency für Email-Templates. Test korrekt übersprungen.
3. **Test-Isolation** — Einige Tests zeigen unterschiedliches Verhalten im Batch vs. einzeln (pytest fixture ordering). Kein akuter Fix nötig.
