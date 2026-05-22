# VERIFY-PLAN-REPORT — I08 failure_class Pilot

**run_id:** `ist-i08-failure-class-pilot-2026-04-09`  
**Branch:** `auto-debugger/work`

## Verify-Plan (Repo-Ist)

- **Zentral:** Strukturierte JSON-Zeilen kommen aus `JSONFormatter` in `El Servador/god_kaiser_server/src/core/logging_config.py`; `request_id`/`traceparent` via `RequestIdFilter`.
- **Vor I08:** Zusatzfelder aus `logger.*(..., extra={...})` landeten nicht zuverlässig im JSON (nur veraltetes `record.extra`-Dict). **Delta:** Allowlist `_STRUCTURED_JSON_FIELDS` mit `failure_class` + dokumentierte Pilot-Werte im Modul-Docstring.

## Umsetzung (drei Call-Sites)

| failure_class | Datei / Kontext |
|---------------|-----------------|
| `mqtt_json_parse` | `mqtt/subscriber.py` — `JSONDecodeError` beim Payload-Parse |
| `mqtt_route` | `mqtt/subscriber.py` — unkontrollierte Exception in `_route_message` |
| `sensor_payload_validation` | `mqtt/handlers/sensor_handler.py` — Payload-Validierung fehlgeschlagen |

## Tests / Checks

- `tests/unit/test_correlation_id.py`: JSON- und Text-Formatter mit `failure_class`
- pytest: `tests/unit/test_correlation_id.py` grün (lokal via `.venv\Scripts\python.exe -m pytest`)

## Doku

- `docs/debugging/logql-queries.md` — Abschnitt „failure_class“
- `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` — P1-Zeile zu `failure_class` aktualisiert

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

- **PKG-01 (server-dev):** Abgeschlossen — `failure_class` + Formatter-Allowlist + 3 Log-Zeilen + Unit-Tests + LogQL + IST-Zeile.
- **BLOCKER:** keine
