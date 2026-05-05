---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i07-grafana-panels-mqtt-ws-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - El Servador/god_kaiser_server/src/core/metrics.py
  - docker/grafana/provisioning/dashboards/system-health.json
scope: |
  Grafana: Zwei Panels — (1) `rate(god_kaiser_mqtt_errors_total[5m])` (oder aktueller exakter Metrikname aus **metrics.py**),
  (2) Serie zu **WS_CONTRACT_MISMATCH_TOTAL** bzw. korrektem Prometheus-Namen aus Code.

  Akzeptanz:
  (1)(2) Panels funktionieren gegen laufenden Prometheus mit God-Kaiser-Scrape.
  (3) Änderungen am Dashboard-JSON im Repo unter `docker/grafana/provisioning/dashboards/` (kein manuelles „nur in Grafana UI“ ohne Export).

  verify-plan: Metriknamen und Labels **exakt** aus `metrics.py` / bestehenden Rules abgleichen.
forbidden: |
  Keine Secrets in Dashboard-JSON; keine Dashboards außerhalb Repo-Provisioning ohne Nachziehen in Git.
  Commits nur auf auto-debugger/work.
done_criteria: |
  JSON unter provisioning gültig; Grafana lädt Dashboard ohne Fehler (manuell oder CI); Prometheus-Queries zeigen Daten bei
  laufendem Stack oder „No data“ ist erklärbar (Scrape/Profil).
---

# STEUER — I07 Grafana Panels MQTT / WS Contract

**IST-Referenz:** § I Punkt 7.

## Schritte

1. **verify-plan**: Exakte Metrikstrings aus `metrics.py` und bestehende Dashboards.
2. **server-dev** (Metriknamen verifizieren) + JSON-Edit in `system-health.json` oder dediziertem Dashboard — **Pattern: bestehendes JSON** erweitern.
3. Optional Grafana UI → Export → Datei ersetzen (sauberer Diff).
4. Kein Backend-Code zwingend — nur wenn Metrik fehlt (dann separates PKG).

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Metrik-Verifikation | **server-dev** (read metrics.py) |
| Dashboard JSON | **server-dev** oder **frontend-dev** (nur JSON-Technik) — inhaltlich **server-dev** wegen PromQL |
| Prometheus-Stack | **system-control** |
| Bei falschen Queries | **server-debug** |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I07-grafana-panels-mqtt-ws-metrics-2026-04-09.md
verify-plan Metriknamen aus metrics.py; dann Grafana-Dashboard JSON im Repo um zwei Panels erweitern.
```
