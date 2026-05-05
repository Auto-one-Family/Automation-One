---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i08-failure-class-pilot-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - El Servador/god_kaiser_server/src/core/logging_config.py
scope: |
  Pilot: **failure_class** (oder gleichwertiges Feld) in strukturierten JSON-Logs für **genau drei** Handler/Call-Sites —
  konsistentes kleines Enum/String-Set; keine PII.

  Akzeptanz:
  (1) Drei markierte Stellen im Code mit dokumentiertem Feld.
  (2) Beispiel-LogQL in `docs/debugging/logql-queries.md` oder Playbook.
  (3) Review gegen PII (keine Nutzerstrings im Feld).

  Vorher: verify-plan wo Logging gebündelt wird (logging_config / Handler-Pattern).
forbidden: |
  Keine Breaking Changes für Log-Consumer; kein Riesen-Refactor; keine Secrets.
  Commits nur auf auto-debugger/work.
done_criteria: |
  pytest grün für betroffene Module; ruff grün; Beispielquery dokumentiert; drei Stellen im Code nachweisbar (PR-Beschreibung).
---

# STEUER — I08 failure_class Pilot (Server-Logging)

**IST-Referenz:** § I Punkt 8; IST „failure_class fehlt“.

## Schritte

1. **verify-plan**: Wo strukturierte Logs entstehen; drei sinnvolle Handler (z. B. MQTT-Handler mit unterschiedlichen Fehlerarten).
2. **server-dev**: Feld ergänzen + Tests falls nötig.
3. Doku-Zeile + LogQL-Beispiel.

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Gate | **verify-plan** |
| Implementierung | **server-dev** |
| Log-Pipeline | **server-debug** (Validierung in Loki optional) |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I08-failure-class-pilot-2026-04-09.md
verify-plan, dann server-dev: failure_class an 3 Handler pilotieren; LogQL-Beispiel; kein PII.
```
