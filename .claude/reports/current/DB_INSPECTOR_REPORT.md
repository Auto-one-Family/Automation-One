# DB Inspector Report

<<<<<<< Updated upstream
**Erstellt (UTC):** 2026-04-22  
**Scope:** Vollanalyse aktuelle Branch-Version, DB-Status, Fixes, Docker-Reload  
**Ausfuehrung:** Live auf laufendem Stack (`automationone-postgres`, `automationone-server`)
=======
**Erstellt:** 2026-04-09 (Session)
**Modus:** B (Spezifisch: ESP nach Löschung nicht im Frontend, Wiederverbindung)
**Quellen:** `automationone-postgres` / `esp_devices`, Server-Code `esp_repo.py`, `esp.py` (Soft-Delete), `heartbeat_handler.py`
>>>>>>> Stashed changes

---

## 1. Executive Summary

<<<<<<< Updated upstream
- Docker-Stack wurde mit aktueller Branch-Version neu gebaut und gestartet (`docker compose up -d --build`).
- Datenbank war erreichbar und healthy, aber Alembic hatte einen **inkonsistenten Multi-Row-Stand** in `alembic_version`.
- Fix durchgefuehrt: stale Revision entfernt, Schema-Head vereinheitlicht, final auf `add_critical_degraded (head)` gestempelt.
- Migration-Featurefelder fuer degraded-handling sind in `cross_esp_logic` vorhanden.
- Service-Readiness nach Fix ist gruen (`/api/v1/health/ready`).
=======
Das reale Gerät **`ESP_6B27C8`** war per **Soft-Delete** markiert (`deleted_at` gesetzt, `status = deleted`). Die öffentliche Geräteliste des Servers filtert solche Zeilen aus — das Frontend zeigt das Gerät deshalb nicht. Heartbeats konnten die Zeile intern weiter aktualisieren (`last_seen`), was den Eindruck einer „halb angemeldeten“ Instanz erzeugte. Soft-Delete wurde in der Datenbank aufgehoben; das Gerät ist wieder sichtbar. **Sensor- und Aktor-Konfigurationen fehlen** (CASCADE beim Löschen), sie müssen neu angelegt bzw. vom Server/Firmware erneut ausgerollt werden.
>>>>>>> Stashed changes

---

## 2. Durchgefuehrte Checks

<<<<<<< Updated upstream
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
=======
| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container läuft |
| pg_isready | nicht separat ausgeführt | `psql`-Abfragen erfolgreich |

---

## 3. Befunde

### 3.1 Soft-Delete vs. Frontend

- **Schwere:** Hoch (Gerät unsichtbar in UI)
- **Detail:** `ESPRepository.get_all()` schließt Zeilen mit `deleted_at IS NOT NULL` aus. `GET /api/v1/esp/devices` liefert das Gerät nicht ohne `include_deleted=true`.
- **Evidenz:** Vor Fix: `ESP_6B27C8`, `deleted_at = 2026-04-09 12:39:42+00`, `deleted_by = admin`, `status = deleted`; dennoch `last_seen` aktuell.

### 3.2 Konfiguration nach Löschung

- **Schwere:** Mittel (erwartetes Verhalten nach API-Doku)
- **Detail:** Beim Soft-Delete werden Sensor-/Aktor-Configs per CASCADE entfernt.
- **Evidenz:** `sensor_configs` / `actuator_configs` für diese `esp_id`: jeweils **0** Zeilen.

---

## 4. Extended Checks

| Check | Ergebnis |
|-------|----------|
| Alle nicht-MOCK-ESPs | `ESP_6B27C8` war das einzige kürzlich gelöschte mit frischem `last_seen`; alte `ESP_0000000*` weiterhin soft-deleted |
| UPDATE Restore | `deleted_at/deleted_by` NULL, `status = online`, `zone_id` weiter `zelt_wohnzimmer` |
| Nach Restore `last_seen` | Heartbeat läuft (z. B. 2026-04-09 13:58:06+00) |
>>>>>>> Stashed changes

---

## 3. Kritischer Befund und Fix

<<<<<<< Updated upstream
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
=======
- **Root Cause:** Soft-Delete der Gerätezeile, nicht „verlorene“ MQTT-Registrierung allein.
- **Durchgeführt:** SQL-Restore der Zeile `ESP_6B27C8` (Aufhebung Soft-Delete).
- **Nächste Schritte für dich:** Seite neu laden oder `espStore.fetchAll()`; Sensoren/Aktoren in der Hardware-Ansicht neu konfigurieren. Optional: Langfristig eine Admin-API „Restore device“ erwägen (derzeit blockt `set_device_pending` bei `status=deleted`).
>>>>>>> Stashed changes
