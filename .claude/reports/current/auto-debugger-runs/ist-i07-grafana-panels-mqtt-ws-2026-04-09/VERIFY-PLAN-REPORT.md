# VERIFY-PLAN-REPORT — I07 Grafana MQTT / WS contract panels

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-IST-I07-grafana-panels-mqtt-ws-metrics-2026-04-09.md`  
**Branch:** `auto-debugger/work`  
**Datum:** 2026-04-10

## Abgleich Metriknamen (`El Servador/god_kaiser_server/src/core/metrics.py`)

| Anforderung (Steuerung) | Repo-Ist | PromQL im Dashboard |
|-------------------------|----------|---------------------|
| MQTT-Fehlerrate | `MQTT_ERRORS_TOTAL` → **`god_kaiser_mqtt_errors_total`**, Labels `["direction"]` | `sum by (direction) (rate(god_kaiser_mqtt_errors_total[5m]))` |
| WS Contract Mismatch | `WS_CONTRACT_MISMATCH_TOTAL` → **`god_kaiser_ws_contract_mismatch_total`** (keine Labels) | `rate(god_kaiser_ws_contract_mismatch_total[5m])` |

**Hinweis:** Nacktes `rate(god_kaiser_mqtt_errors_total[5m])` ohne `sum by` ist für mehrere Zeilen (received/published) ungeeignet; `sum by (direction)` entspricht dem Label-Schema und bleibt mit der Steuer-Intention vereinbar.

## Dashboard

- **Datei:** `docker/grafana/provisioning/dashboards/system-health.json`
- **Neue Panel-IDs:** 105 (MQTT), 106 (WS contract)
- **Datasource:** `prometheus` (uid wie bestehende God-Kaiser-Panels)

## Laufzeit-Check (Stack, 2026-04-10)

- **docker compose --profile monitoring ps:** prometheus, grafana, el-servador u. a. healthy/up.
- **Prometheus `api/v1/query`:** `god_kaiser_mqtt_errors_total` (received/published, Werte 0), `god_kaiser_ws_contract_mismatch_total` (Wert ≥0); PromQL `sum by (direction) (rate(...[5m]))` und `rate(god_kaiser_ws_contract_mismatch_total[5m])` → `status: success`.
- **Grafana:** Provisioning per Bind-Mount `./docker/grafana/provisioning` — Dashboard-JSON am Host ist Quelle; UI/API-Check optional bei langsamem Endpoint.

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

- **PKG-01:** Abgeschlossen — JSON erweitert, `schemaVersion` unverändert, JSON validiert (`python -c json.load`).
- **Rollen:** server-dev (Metrikabgleich), kein Backend-Code nötig.
- **BLOCKER:** Keine.
- **Docs:** `LOG_LOCATIONS.md` §12.4/12.5, `SYSTEM_OPERATIONS_REFERENCE.md` §8.5 + Pfadtabelle §9 (updatedocs).
