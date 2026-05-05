---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i02-parse-error-correlation-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - El Servador/god_kaiser_server/src/mqtt/subscriber.py
  - El Servador/god_kaiser_server/tests/unit/test_mqtt_correlation.py
scope: |
  Server: Bei `JSONDecodeError` in `subscriber._route_message` muss die Logzeile **Topic** plus eine **synthetische**
  Korrelation enthalten (`parse-fail:`-ID oder Broker-Meta falls verfügbar) — **ohne** Handler-Ausführung vor erfolgreichem
  Parse (IST § I Punkt 2; IST Inkonsistenz #2).

  Akzeptanz:
  (1) Log enthält Topic + synthetische ID/Meta wie spezifiziert.
  (2) `test_mqtt_correlation.py` bzw. subscriber-Tests erweitert (Parse-Fail-Pfad).
  (3) Kein Handler-Lauf vor Parse — unverändert.

  Ablauf: verify-plan → TASK-PACKAGES (optional auto-debugger) → **server-dev** implementiert auf auto-debugger/work.
forbidden: |
  Keine Breaking Changes an MQTT-Verträgen; kein Umgehen des Subscriber-Routing-Grundsatz „Parse first“.
  Keine Secrets. Kein Commit auf master. Kein force-push.
done_criteria: |
  `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/test_mqtt_correlation.py -q` grün (bzw. erweiterter Pfad
  aus VERIFY-PLAN-REPORT); ruff check auf geänderten Dateien; manuelle Log-Zeile bei künstlichem invalid JSON verifizierbar
  (Evidenz im PR-Kommentar oder Kurznotiz).
---

# STEUER — I02 Parse-Error-Correlation (subscriber)

**IST-Referenz:** § I Punkt 2; Inkonsistenz „JSON-Fehler ohne CID“.

## Schritte

1. Branch `auto-debugger/work`.
2. **verify-plan** auf geplante Änderung in `subscriber.py` + Testpfad.
3. Optional: **auto-debugger** mit dieser Datei → SPECIALIST-PROMPTS für server-dev.
4. **server-dev**: Implementierung + Tests.
5. `poetry run pytest` (relevante Tests) + `ruff check`.

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Gate | **verify-plan** |
| Pakete/Prompts | **auto-debugger** (optional) |
| Implementierung | **server-dev** |
| Pattern MQTT | **mqtt-development** (Review-Check) |
| Bei Test-Rot | **test-log-analyst** |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I02-parse-error-correlation-subscriber-2026-04-09.md
verify-plan, dann server-dev: JSONDecodeError-Pfad mit Topic + parse-fail-ID loggen; Tests erweitern.
```
