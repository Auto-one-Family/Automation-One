# TASK-PACKAGES — STEUER 03 Server additive Logging

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-konzept-alertcenter-03-server-additive-logging-2026-04-10.md`  
**Git:** Branch `auto-debugger/work` (Stand Lauf).  
**Post-Verify:** Pfade und Befehle mit Repo-Ist abgeglichen; Umsetzung für PKG-02 in dieser Session durchgeführt.

---

## PKG-01 — Zielstellen (IST)

| Datei | Funktion / Stelle | Felder | Nutzen |
|------|-------------------|--------|--------|
| `src/core/logging_config.py` | `JSONFormatter` / `TextFormatter`, `_STRUCTURED_JSON_FIELDS` | `notification_id`, `alert_status`, `ws_event_type` | JSON- und Konsolen-Logs tragen dieselben strukturierten Keys wie `failure_class` (Allowlist). |
| `src/services/notification_router.py` | `route()` nach Persistenz; `_broadcast_websocket`; `broadcast_notification_updated` | id + Status; WS-Event-Name | Korrelation Persistenz → WS-Fan-out ohne Semantik von `request_id` zu vermischen. |
| `src/api/v1/notifications.py` | `acknowledge_alert`, `resolve_alert` | `notification_id`, `alert_status` | HTTP-`request_id` (Middleware) + Notification-ID in derselben Logzeile bei Lifecycle-REST. |

**Pattern-Anker (nicht geändert):** `request_id` bleibt über `RequestIdFilter` / ContextVar; MQTT-CID bleibt separat (STEUER 05).

---

## PKG-02 — Implementierung (erledigt)

- Allowlist um drei Keys erweitert; Text-Ausgabe ergänzt.
- `NotificationRouter`: strukturierte `logger.info`-Aufrufe mit `extra=`.
- REST: zwei Info-Zeilen bei Ack/Resolve.

**Akzeptanz:** Keine Response-Schema-Änderung; keine PII in `extra`; keine Umbenennung von `request_id`.

---

## PKG-03 — Verify

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
.venv\Scripts\python.exe -m pytest tests/integration/test_alert_lifecycle.py --tb=short -q
```

Optional vollständiger Lint (wenn `poetry`/`ruff` im PATH): `poetry run ruff check src/`

**Ergebnis Lauf:** `test_alert_lifecycle.py` — 27 passed (Windows, venv-Python).

---

## Akzeptanz (Steuerdatei)

- [x] Mindestens ein zusätzlicher nachvollziehbarer Kontext-Key auf dem Notification-/Alert-Pfad in Logs.
- [x] `tests/integration/test_alert_lifecycle.py` grün.
- [x] Geänderte Dateien ohne neue Linter-Diagnosen (IDE).

Commits nur auf Branch `auto-debugger/work`; Merge nach `master` durch Robin.
