# SPECIALIST-PROMPTS — STEUER 03 (Post-Verify)

**Stand:** PKG-02 für additive Logging ist im Repo umgesetzt; bei Folge-Tasks diesen Block als Referenz für Git/Verify nutzen.

---

## server-dev — Notification-Observability (abgeschlossen / Referenz)

### Scope

- `src/core/logging_config.py` — Allowlist + TextFormatter
- `src/services/notification_router.py` — lifecycle + WS-Broadcast-Logs
- `src/api/v1/notifications.py` — Ack/Resolve REST-Logs

### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Strukturierte Keys wie bestehendes `failure_class` über `_STRUCTURED_JSON_FIELDS` und `logger.*(..., extra={})`.
- Keine Vermischung von HTTP-`request_id` mit MQTT-CID in Feldnamen (Kommentar/Doku bei neuen Keys).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Persistierte Alerts über `NotificationRouter`; transiente `error_event`-WS separat lassen.
- `request_id` kommt aus Middleware/ContextVar — nicht in MQTT-Felder schreiben.

### Verify-Befehl (Pflicht)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
.venv\Scripts\python.exe -m pytest tests/integration/test_alert_lifecycle.py --tb=short -q
```

### Fehler-Register (Pflicht bei Code)

- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl erneut.

---

## Rollen-Übergabe

- Kein parallel nötiger `frontend-dev`/`mqtt-dev` für dieses PKG.
- MQTT-CID-Spiegelung: STEUER 05.
