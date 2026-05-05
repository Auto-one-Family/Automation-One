# TASK-PACKAGES — I07 Grafana MQTT / WS metrics

**run_id:** `ist-i07-grafana-panels-mqtt-ws-2026-04-09`  
**Akzeptanz (Steuerdatei):** Zwei Prometheus-Panels im Repo-Provisioning; Metrikstrings exakt aus `metrics.py`.

## PKG-01 — Grafana `system-health.json` (erfüllt 2026-04-10)

- **Owner:** server-dev (Prometheus/Grafana-Kontext)
- **Änderung:** Zwei `timeseries`-Panels (id 105, 106) in `docker/grafana/provisioning/dashboards/system-health.json`; Abschnitte Database / Logs & Errors nach unten verschoben (Grid-y angepasst).
- **Verify:** `python -c "import json; json.load(open('docker/grafana/provisioning/dashboards/system-health.json'))"`
- **Akzeptanz:** Commits nur auf Branch `auto-debugger/work`; keine Secrets im JSON.
