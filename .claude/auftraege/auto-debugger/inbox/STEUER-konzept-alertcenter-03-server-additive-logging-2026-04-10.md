---
run_mode: artefact_improvement
incident_id: ""
run_id: konzept-alertcenter-03-server-logging-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
  - El Servador/god_kaiser_server/src/middleware/request_id.py
  - El Servador/god_kaiser_server/src/core/logging_config.py
scope: |
  Konzept §6.1–6.2 / Roadmap Phase 3 (Observability): Additive JSON-Logfelder an den dokumentierten
  Hotspots — z. B. `notification_id`, `alert_status`, `ws_event_type` wo sinnvoll in
  NotificationRouter-/API-/WS-Pfaden; **keine** Semantikänderung von `request_id` vs. MQTT-CID.
  Vor Implementierung: nächstliegende Logging-Patterns im Server (bestehende `extra=` / structlog-
  Keys) per Grep finden und erweitern.
forbidden: |
  Keine Breaking Changes an öffentlichen Response-Schemas; keine PII in Logs; kein Mischen von
  HTTP-request_id mit MQTT-CID in einem Feldnamen ohne Kommentar/Doku; kein `time.sleep` in async
  Code.
done_criteria: |
  Mindestens ein zusätzlicher nachvollziehbarer Korrelations- oder Kontext-Key in Logs auf dem
  Notification-Lifecycle-Pfad; bestehende Integrationstests (`tests/integration/test_alert_lifecycle.py`)
  grün; `poetry run ruff check` auf geänderten Dateien ohne neue Errors.
---

# STEUER 03 — Server: additive Observability / Logging

## Pattern-Anker

- Request-ID: `El Servador/god_kaiser_server/src/middleware/request_id.py`, `src/core/request_context.py`.
- Logging: `src/core/logging_config.py`, `get_request_id()`.
- Business: `src/services/notification_router.py`, `src/api/v1/notifications.py`, WebSocket-Realtime — **ein** Analogfall wählen und konsistent nachziehen.

## Aufgabenpaket (SOLL für TASK-PACKAGES)

1. **PKG-01:** Zielstellen-Liste (Datei + Funktion) mit einem Satz Nutzen pro Feld.
2. **PKG-02:** Implementierung nur additive Keys; Log-Format wie Nachbarmodule.
3. **PKG-03:** pytest — `tests/integration/test_alert_lifecycle.py` + ggf. gezielter Test auf neue Log-Ausgabe nur wenn stabil erfassbar (sonst manuelle Evidence im VERIFY-Report).

## Verify

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/integration/test_alert_lifecycle.py --tb=short -q
poetry run ruff check src/
```

## Cross-Ref

- MQTT-spezifische CID-Spiegelung: STEUER 05; Operator-Doku zwei Ketten: STEUER 04.

---

*Teil von MASTER `STEUER-konzept-alertcenter-MASTER-2026-04-10.md`*
