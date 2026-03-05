# Test Baseline Report

**Erstellt:** 2026-02-11
**Aktualisiert:** 2026-03-04 (AutoOps Debug + Full Test Run)
**Skill:** test-log-analyst
**Zweck:** Vollständige Test-Durchlauf-Dokumentation

---

## Zusammenfassung (2026-03-04)

| Bereich | Tests | Passed | Failed | Skipped | Status |
|---------|-------|--------|--------|---------|--------|
| **Backend Unit** | 881 | 877 | 0 | 4 | GRUEN |
| **Backend Integration** | 774 | 774 | 0 | 0 | GRUEN |
| **Backend ESP32-Mock** | 317 | 313 | 0 | 4 | GRUEN |
| **Frontend Vitest** | 1564 | 1564 | 0 | 0 | GRUEN |
| **TOTAL** | 3536 | 3528 | 0 | 8 | **GRUEN** |

---

## AutoOps Debug Scan (2026-03-04)

- **Health Check:** 7/9 passed
- **Debug Fix:** 8 issues gefunden, 3 auto-fixed (Mock ESP Heartbeats)
- **Verbleibend:** 5 (4x Device ohne Sensoren/Aktoren, 1x Sensor-Daten-Stale)

---

## Fixes durchgeführt (2026-03-04)

### 1. JSONB/SQLite-Kompatibilität (Backend Unit)

**Problem:** 131 Unit-Tests mit `AttributeError: 'SQLiteTypeCompiler' object has no attribute 'visit_JSONB'`
**Ursache:** `zone_contexts` und `subzone_configs` nutzen PostgreSQL JSONB; Tests verwenden In-Memory SQLite
**Fix:**
- `src/db/types.py`: Neuer Typ `JSONBCompat` mit `_variant_mapping = {"sqlite": JSON()}`
- `src/db/models/zone_context.py`: `JSONB` → `JSONBCompat` für custom_data, cycle_history
- `src/db/models/subzone.py`: `JSONB` → `JSONBCompat` für custom_data

### 2. jsonschema Lazy-Import (Backend Unit)

**Problem:** `test_sensor_type_registry.py::TestI2CAddressRangeValidation` → `ModuleNotFoundError: No module named 'jsonschema'`
**Ursache:** `schema_registry.py` importiert jsonschema top-level; Import-Kette `api.v1.sensors` → `api.v1` → `schema_registry` triggert Fehler wenn jsonschema fehlt
**Fix:** Lazy-Import in `src/api/v1/schema_registry.py` — jsonschema nur in `validate_metadata()` importieren

### 3. Subzone API Integration Test

**Problem:** `test_assign_subzone_empty_gpios` erwartete 400/422, bekam 404 (ESP nicht gefunden)
**Ursache:** Test nutzte hardcoded `ESP_EE000000` ohne Fixture
**Fix:**
- `test_assign_subzone_empty_gpios`: Fixture `test_esp_with_zone` hinzugefügt
- API erlaubt leere GPIOs (Schema min_length=0, "create subzone only") → Test erwartet jetzt 200
- `test_assign_subzone_invalid_gpio`: Ebenfalls `test_esp_with_zone` für korrekte Validierung

---

## Bekannte Warnings (nicht kritisch)

- **email_log_repo:** RuntimeWarning "coroutine was never awaited" in digest_service Tests
- **test_auth_security_features:** RuntimeWarning in MQTT broadcast test
- **Skipped:** 4 Backend (I2C unique constraint, jinja2, 2x Unix permissions), 4 ESP32 (real hardware)

---

## Nächste Schritte

- ESP32 Native Tests (22): Benötigen MinGW/gcc auf Windows
- E2E Tests: Benötigen laufenden Stack
- Playwright: Benötigen laufenden Stack
