# SPECIALIST-PROMPTS — STEUER 05

Nach **VERIFY-PLAN-REPORT** und mutiertem **TASK-PACKAGES.md** gültig.

---

## Rolle: server-dev

### Scope

- **PKG-02:** `actuator_alert_handler.py` — Ingress-Korrelation für `NotificationCreate` (siehe TASK-PACKAGES PKG-02).
- **PKG-03:** Unit-Test unter `tests/unit/mqtt/` (neuer Ordner/Dateiname wie in TASK-PACKAGES); bestehende Integration `test_threshold_notification_pipeline.py` nicht brechen.

### IST / SOLL

- **IST:** Subscriber setzt MQTT-CID in Context (`get_request_id()` im Handler); Actuator-Alert-Notifications ohne diese CID in DB.
- **SOLL:** Mindestens eine persistierte Notification mit nachvollziehbarer Verknüpfung zur Ingress-CID (Spalte und/oder `metadata`).

### Git (Pflicht)

- Arbeitsbranch: **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Vor Code: per `Grep`/`Glob` die **closest existing implementation** im gleichen Layer — hier `sensor_handler._evaluate_thresholds_and_notify` (`NotificationCreate` + `correlation_id`) und `NotificationRouter.route` in `notification_router.py` — **dort** anbinden (keine duplizierte Parallel-Logik).
- `get_request_id()` aus `src/core/request_context.py` — gleiche Semantik wie Subscriber-Kommentar (MQTT-Ingress, nicht HTTP-UUID).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Alerts/Notifications: bestehende `NotificationRouter`-Pfade; ISA-/DB-Inbox vs. WS-transient nicht vermischen. IDs (`correlation_id`, HTTP-`request_id`, MQTT-Ingress-CID) nicht verwechseln — bei Bedarf zusätzlicher Key in `metadata` (`mqtt_ingress_correlation_id`), wenn Spalte `correlation_id` absichtlich anders belegt wird.

### Verify-Befehl (Pflicht)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/unit/mqtt/test_actuator_alert_notification_correlation.py tests/integration/test_threshold_notification_pipeline.py --tb=short -q
poetry run ruff check src/mqtt/handlers/
```

Nach jedem Fix **dieselben** Befehle erneut.

### Fehler-Register (Pflicht bei Code)

- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl erneut; Einträge in `FEHLER-REGISTER.md` im gleichen Run-Ordner.

---

## Rolle: mqtt-dev (optional)

### Scope

- Abgleich **Doku** `.claude/reference/api/MQTT_TOPICS.md` / Actuator-Alert-Payload: optionales zukünftiges Feld `correlation_id` vom Gerät — nur dokumentieren, wenn Firmware/STEUER 06 das vorsieht; keine Breaking Changes.

### Git / Pattern / Verify

- Wie oben; keine Firmware-Änderungen in diesem Paket ohne separates STEUER.

---

*Ende SPECIALIST-PROMPTS*
