---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i03-traceparent-rest-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - El Servador/god_kaiser_server/src/middleware/request_id.py
scope: |
  Optional: W3C **traceparent** (oder verwandter Header) in REST-Middleware **durchreichen**, wenn gesetzt; strukturierte
  JSON-Logs optional um ein Feld ergänzen — **keine** Pflicht für MQTT (IST § I Punkt 3).

  Akzeptanz:
  (1) Header wird nicht verworfen (Forward/Context je nach bestehendem Pattern).
  (2) Logging optional mit Feld (kein PII).
  (3) MQTT-Pfade unverändert pflichtfrei.

  Vor Implementierung: verify-plan gegen `request_id.py` und Logging-Config.
forbidden: |
  Keine Breaking API-Änderung; keine Secrets in Logs; kein traceparent-Zwang für Firmware/MQTT.
  Commits nur auf auto-debugger/work.
done_criteria: |
  Pytest für Middleware/Logging erweitert oder bestehende Tests grün; ruff grün; kurze Doku-Zeile in Playbook oder
  server-development-naher README nur wenn Projekt das vorsieht (minimal).
---

# STEUER — I03 traceparent REST (optional)

**IST-Referenz:** § I Punkt 3.

## Schritte

1. **verify-plan**: Ist-Stand `request_id.py`, `logging_config` lesen.
2. **server-dev**: Minimale Middleware-/Log-Erweiterung.
3. `poetry run pytest` + `ruff check`.

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Gate | **verify-plan** |
| Implementierung | **server-dev** |
| Observability-Abgleich | **server-debug** (read-only: wie erscheint Feld in Logs) |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I03-traceparent-rest-optional-2026-04-09.md
verify-plan, dann server-dev: traceparent optional durchreichen + optionales Logfeld; keine MQTT-Pflicht.
```
