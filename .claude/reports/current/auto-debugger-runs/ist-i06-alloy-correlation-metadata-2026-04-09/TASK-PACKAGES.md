# TASK-PACKAGES — I06 Alloy correlation_id Structured Metadata

**Run-ID:** `ist-i06-alloy-correlation-metadata-2026-04-09`  
**Branch (Commits):** `auto-debugger/work`

## PKG-01 — Alloy + Doku (abgeschlossen 2026-04-10)

**Owner:** server-dev / Repo-Edit `docker/alloy/`  
**Risiko:** niedrig — kein REST/MQTT-Schema, nur Collector-Pipeline.

**Umsetzung:**

1. `docker/alloy/config.alloy`: Nach Haupt-`stage.regex` Zusatzparser auf `message` für `\bcorrelation_id=…`; Wert in `stage.structured_metadata` als `correlation_id` (nicht als Label).
2. `docs/debugging/logql-queries.md`: Beispiel-LogQL für `| correlation_id="…"`.
3. `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md`: IST-Zeile Loki/Alloy, Follow-up I.6, Inkonsistenz #4 aktualisieren.

**Akzeptanzkriterien:**

- [x] Alloy syntaktisch gültig (`alloy validate` mit Image `grafana/alloy:v1.13.1`).
- [x] Keine neuen Hochkardinalitäts-**Labels** in Loki.
- [x] Mindestens eine nachvollziehbare LogQL in `logql-queries.md`.
- [x] Server-Tests unverändert (kein Python-Code geändert).

**Verify:**

```bash
docker run --rm -v "${PWD}/docker/alloy/config.alloy:/etc/alloy/config.alloy:ro" grafana/alloy:v1.13.1 validate /etc/alloy/config.alloy
```

(PowerShell: Pfad zum Repo statt `${PWD}` anpassen.)
