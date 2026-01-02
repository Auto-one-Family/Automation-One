# Bugs Found

> **Letzte Aktualisierung:** 2025-12-30
> **Status:** ✅ ALLE KRITISCHEN BUGS GEFIXT

---

## Zusammenfassung

| Kategorie | Status |
|-----------|--------|
| **AsyncIO Event-Loop Bug** | ⚠️ OPEN (Bugs_Found_2.md) |
| **Sensor Config Missing** | 🟡 Low Priority (Bugs_Found_2.md) |
| Deprecation Warnings | 🟡 Non-Critical |
| Sicherheitshinweise | 🔵 Dev Only |

---

## Verbleibende Tasks (Nicht-kritisch)

### 1. Pydantic `class Config` zu `ConfigDict` migrieren

**Status:** 🟡 Non-Critical (wird in Pydantic v3 entfernt)
**Dateien:**
- `El Servador/god_kaiser_server/src/api/schemas.py:15, 98, 156, 204, 277`
- `El Servador/god_kaiser_server/src/api/v1/audit.py:37`

```python
# Von:
class MyModel(BaseModel):
    class Config:
        from_attributes = True

# Nach:
from pydantic import ConfigDict

class MyModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
```

---

### 2. `datetime.utcnow()` zu `datetime.now(UTC)` migrieren

**Status:** 🟡 Non-Critical (deprecated in Python 3.12+)
**Dateien:**
- `src/db/repositories/actuator_repo.py:212`
- `src/db/repositories/sensor_repo.py:214`
- `src/db/repositories/system_config_repo.py:200`
- `tests/unit/test_repositories_actuator.py:115`
- `tests/unit/test_repositories_sensor.py:230, 260`

```python
# Von:
from datetime import datetime
timestamp = datetime.utcnow()

# Nach:
from datetime import datetime, UTC
timestamp = datetime.now(UTC)
```

---

### 3. Coverage-Konfiguration

**Status:** 🔵 Low Priority

```bash
poetry run pytest tests/ --cov=src --cov-report=term-missing
```

---

## Sicherheitshinweise (Development Only)

**Status:** ℹ️ INFO (nur Development)

### A) Default JWT Secret Key
```
SECURITY: Using default JWT secret key (OK for development only).
```
**Aktion für Production:** `.env` mit `JWT_SECRET_KEY=<secure-random-key>` erstellen

### B) MQTT TLS deaktiviert
```
MQTT TLS is disabled.
```
**Aktion für Production:** `MQTT_USE_TLS=true` in `.env` setzen

---

## Übersprungene Tests (6 Tests)

**Status:** ℹ️ INFO (erwartet)

| Test | Grund |
|------|-------|
| `test_communication.py` (4x) | Real ESP32 / `ESP32_TEST_DEVICE_ID` not set |
| `test_mqtt_auth_service.py` (2x) | Unix permissions not supported on Windows |

---

## Abgeschlossene Bugs (Archiv)

Alle kritischen Bugs wurden behoben. Siehe Git-History für Details:

- ✅ Bug I: Circular Import (2025-12-27)
- ✅ Bug J: Test Import Bugs (2025-12-27)
- ✅ Bug K: Test Implementation Bugs (2025-12-27)
- ✅ Bug G: Database Schema (2025-12-27)
- ✅ Bug H: Alembic Multiple Heads (2025-12-27)
- ✅ Bug E: Graceful Shutdown (bereits korrekt)
- ✅ Bug F: MQTT Connection Leak (bereits korrekt)
- ✅ Bug D: MQTT Reconnect (2025-12-27)
- ✅ Bug A: Token Blacklist (2025-12-26)
- ✅ Bug B: ThreadPoolExecutor (2025-12-26)
- ✅ Bug C: MQTT Log-Spam (2025-12-26)
- ✅ Bug L: Maintenance Import (verifiziert 2025-12-30)
- ✅ Bug M: SimulationSchedulerDep (verifiziert 2025-12-30)
- ✅ Zone-ACK WebSocket Bug (2025-12-30)

---

## Aktive Bugs → Bugs_Found_2.md

Die noch offenen Bugs befinden sich in `Bugs_Found_2.md`:
- **Bug O:** AsyncIO Event-Loop Bug (CRITICAL)
- **Bug P:** Sensor Config Missing (MEDIUM)
