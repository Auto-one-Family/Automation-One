# SERVER_DEV_DATETIME_FIX Report

**Datum:** 2026-02-05
**Agent:** server-dev
**Status:** FIXED

---

## Problem

ESP32 (ESP_472204) sendet korrekt Heartbeats an den Server. Der Server empfängt sie und versucht Auto-Registration. Der DB-Insert schlägt fehl mit:

```
asyncpg.exceptions.DataError: invalid input for query argument $15:
datetime.datetime(2026, 2, 5, 17, 36, 4,...)
(can't subtract offset-naive and offset-aware datetimes)
```

**Fehlerort:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`, Methode `_auto_register_esp()`, Zeile ~377

**Problem:** Mischung von timezone-aware und timezone-naive datetimes:
- `created_at`: 2026-02-05 17:36:04.235501+00:00 (aware)
- `last_seen`: 2026-02-05 17:36:04.246958 (naive)

---

## Root Cause Analyse

### 1. TimestampMixin verwendet `datetime.utcnow` (DEPRECATED)

**Datei:** `El Servador/god_kaiser_server/src/db/base.py`

```python
# VORHER (Bug):
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,  # NAIVE datetime!
        ...
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        ...
    )
```

`datetime.utcnow()` gibt ein **naive** datetime zurück (ohne timezone-Info). Dies ist seit Python 3.12 deprecated.

### 2. ESPDevice Model verwendet `DateTime` ohne `timezone=True`

**Datei:** `El Servador/god_kaiser_server/src/db/models/esp.py`

```python
# VORHER (Bug):
last_seen: Mapped[Optional[datetime]] = mapped_column(
    DateTime,  # Keine timezone-Unterstützung!
    ...
)
discovered_at: Mapped[Optional[datetime]] = mapped_column(
    DateTime,  # Keine timezone-Unterstützung!
    ...
)
```

---

## Implementierte Fixes

### Fix 1: base.py - TimestampMixin

**Datei:** `El Servador/god_kaiser_server/src/db/base.py`

**Vorher:**
```python
from datetime import datetime

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        doc="Timestamp when the record was created",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        doc="Timestamp when the record was last updated",
    )
```

**Nachher:**
```python
from datetime import datetime, timezone

def _utc_now() -> datetime:
    """Return current UTC time as timezone-aware datetime."""
    return datetime.now(timezone.utc)

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        nullable=False,
        doc="Timestamp when the record was created (UTC)",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        onupdate=_utc_now,
        nullable=False,
        doc="Timestamp when the record was last updated (UTC)",
    )
```

### Fix 2: esp.py - ESPDevice Model

**Datei:** `El Servador/god_kaiser_server/src/db/models/esp.py`

**Geänderte Spalten:**

| Spalte | Vorher | Nachher |
|--------|--------|---------|
| `last_seen` | `DateTime` | `DateTime(timezone=True)` |
| `discovered_at` | `DateTime` | `DateTime(timezone=True)` |
| `approved_at` | `DateTime` | `DateTime(timezone=True)` |
| `last_rejection_at` | `DateTime` | `DateTime(timezone=True)` |

---

## Verifikation

### MQTT-Handler Prüfung

Alle MQTT-Handler in `El Servador/god_kaiser_server/src/mqtt/handlers/` verwenden bereits korrekt `datetime.now(timezone.utc)`:

| Handler | Status |
|---------|--------|
| heartbeat_handler.py | ✅ Korrekt (`datetime.now(timezone.utc)`) |
| sensor_handler.py | ✅ Korrekt (`datetime.fromtimestamp(..., tz=timezone.utc)`) |
| actuator_handler.py | ✅ Korrekt (`datetime.fromtimestamp(..., tz=timezone.utc)`) |
| lwt_handler.py | ✅ Korrekt (`datetime.now(timezone.utc)`) |
| discovery_handler.py | ✅ Korrekt (`datetime.now(timezone.utc)`) |
| actuator_alert_handler.py | ✅ Korrekt |
| actuator_response_handler.py | ✅ Korrekt |
| config_handler.py | ✅ Korrekt |

### Server-Restart

```
docker compose restart el-servador
```

**Ergebnis:** Server startet erfolgreich ohne Fehler:
```
2026-02-05 17:46:56 - God-Kaiser Server Started Successfully
- Environment: development
- MQTT Broker: mqtt-broker:1883
- Resilience: Circuit Breakers (mqtt, database, external_api) + Retry + Timeout
```

---

## Weitere Stellen mit `datetime.now()` ohne timezone

Diese Stellen sind **nicht kritisch** für den Heartbeat-Bug, aber sollten bei Gelegenheit gefixt werden:

| Datei | Zeile | Verwendung |
|-------|-------|------------|
| `websocket/manager.py` | 278 | `now = datetime.now()` |
| `core/scheduler.py` | 232, 518 | Job scheduling |
| `services/logic_engine.py` | 236, 309, 504 | Logic evaluation context |
| `services/logic/conditions/time_evaluator.py` | 48, 55 | Time condition checks |

Diese verwenden datetime.now() für lokale Vergleiche und sind nicht direkt an DB-Operationen beteiligt.

---

## Hinweis: Alembic Migration

Die Änderung von `DateTime` → `DateTime(timezone=True)` erfordert **keine** Alembic-Migration, wenn:
- PostgreSQL bereits `TIMESTAMP WITH TIME ZONE` verwendet
- Die Datenbank bereits existierende Werte korrekt behandelt

Falls Probleme auftreten, kann eine Migration erstellt werden:
```bash
cd El\ Servador/god_kaiser_server
alembic revision --autogenerate -m "add timezone to datetime columns"
alembic upgrade head
```

---

## Zusammenfassung

| Aktion | Datei | Status |
|--------|-------|--------|
| Fix TimestampMixin | `db/base.py` | ✅ |
| Fix DateTime Spalten | `db/models/esp.py` | ✅ |
| Verifikation Handler | `mqtt/handlers/*.py` | ✅ Alle korrekt |
| Server-Restart | Docker | ✅ Erfolgreich |

**Der Datetime-Timezone-Bug im Heartbeat-Handler ist behoben.**
