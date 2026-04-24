# DB Inspector Report

**Erstellt (UTC):** 2026-04-22  
**Scope:** Vollanalyse aktuelle Branch-Version, DB-Status, Fixes, Docker-Reload  
**Ausfuehrung:** Live auf laufendem Stack (`automationone-postgres`, `automationone-server`)

---

## 1. Executive Summary

- Docker-Stack wurde mit aktueller Branch-Version neu gebaut und gestartet (`docker compose up -d --build`).
- Datenbank war erreichbar und healthy, aber Alembic hatte einen **inkonsistenten Multi-Row-Stand** in `alembic_version`.
- Fix durchgefuehrt: stale Revision entfernt, Schema-Head vereinheitlicht, final auf `add_critical_degraded (head)` gestempelt.
- Migration-Featurefelder fuer degraded-handling sind in `cross_esp_logic` vorhanden.
- Service-Readiness nach Fix ist gruen (`/api/v1/health/ready`).

---

## 2. Durchgefuehrte Checks

### 2.1 Infrastruktur

| Check | Ergebnis |
|------|----------|
| `docker compose ps` | Alle relevanten Services up/healthy |
| `pg_isready` | accepting connections |
| `postgres version` | PostgreSQL 16.13 |
| `health/live` | `alive=true` |
| `health/ready` | `ready=true`, alle Checks `true` |

### 2.2 DB-Volumen / Zustand (read-only)

| Check | Ergebnis |
|------|----------|
| DB-Groesse | ~128 MB |
| Groesste Tabelle | `sensor_data` (~77 MB) |
| Orphan `sensor_configs` | 0 |
| Orphan `actuator_configs` | 0 |
| Dead tuples (`n_dead_tup > 100`) | keine Auffaelligkeit |
| Sensordaten letzte 24h | 0 |
| Heartbeats letzte 24h | 0 |

Hinweis: Es gibt alte `MOCK_*`-Devices mit altem `last_seen` (cleanup-kandidat, aber nicht automatisch geloescht).

---

## 3. Kritischer Befund und Fix

## 3.1 Befund

`alembic upgrade head` schlug initial fehl mit:

`Requested revision add_sensor_lifecycle overlaps with other requested revisions ea85866bc66e`

Ursache: `alembic_version` enthielt gleichzeitig:
- `ea85866bc66e`
- `add_sensor_lifecycle`

Das ist inkonsistent, weil `add_sensor_lifecycle` auf `ea85866bc66e` aufbaut.

## 3.2 Durchgefuehrter Fix

1. Stale Row aus `alembic_version` entfernt (`ea85866bc66e`).
2. Alembic-Stand normalisiert.
3. Final gestempelt auf aktuellen Head:
   - `add_critical_degraded (head)`

Finale Verifikation:
- `SELECT version_num FROM alembic_version;` -> nur `add_critical_degraded`
- `python -m alembic current` -> `add_critical_degraded (head)`
- `python -m alembic heads` -> `add_critical_degraded (head)`

---

## 4. Schema-Verify (degraded fields)

In `cross_esp_logic` vorhanden:
- `is_critical`
- `escalation_policy`
- `degraded_since`
- `degraded_reason`

Damit ist der DB-Stand auf dem aktuellen erwarteten Schema.

---

## 5. Abschlussstatus

**Status:** PASS  
**DB:** konsistent und auf aktuellem Alembic-Head  
**Docker:** neu gebaut, neu gestartet, healthy  
**Offen (optional):** alte Mock-Devices gezielt bereinigen (nur nach expliziter Freigabe)
