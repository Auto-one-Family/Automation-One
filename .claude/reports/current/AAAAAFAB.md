# STEP 4 Execution Report: Phase 4A Test-Suite + Notification-Observability

> **Datum:** 2026-03-03
> **Status:** ABGESCHLOSSEN
> **Ergebnis:** 62/63 Tests bestanden (1 skip: jinja2), 1889/1890 Regressionstests bestanden
> **Plan:** auftrag-step4-phase4a-test-suite-und-observability.md

---

## Zusammenfassung

Alle 10 Test-Dateien mit 63 Tests (Blocks 0-7) sind implementiert und bestanden.
Alle 11 Prometheus-Metriken (Block 8) sind definiert und instrumentiert.
Alle 5 Grafana-Alerts (Block 9) sind konfiguriert mit Contact Points und Policies.

**7 Bugs gefunden und gefixt** — davon 4 Production Bugs im Source Code.

---

## Production Bugs gefixt

### Bug 1: FastAPI Route Collision — sensors.py (CRITICAL)
**Datei:** `src/api/v1/sensors.py`
**Problem:** GET `/{esp_id}/{gpio}` war vor GET `/{sensor_id}/alert-config` und `/{sensor_id}/runtime` definiert. FastAPI matcht `/{esp_id}/{gpio}` zuerst, parsed "alert-config" als int → 422.
**Fix:** GET-Routen `/{sensor_id}/alert-config` und `/{sensor_id}/runtime` VOR `/{esp_id}/{gpio}` verschoben.

### Bug 2: FastAPI Route Collision — actuators.py (CRITICAL)
**Datei:** `src/api/v1/actuators.py`
**Problem:** Identisches Problem wie sensors.py — GET `/{actuator_id}/alert-config` und `/{actuator_id}/runtime` nach `/{esp_id}/{gpio}`.
**Fix:** Spezifische GET-Routen VOR den generischen `/{esp_id}/{gpio}` platziert + alte Duplikate entfernt.

### Bug 3: SQLAlchemy JSON Mutation — alert_suppression_scheduler.py (HIGH)
**Datei:** `src/services/alert_suppression_scheduler.py`
**Problem:** `cfg = sensor.alert_config or {}` holt Referenz auf SA's committed state Dict. In-Place-Mutation (`cfg["alerts_enabled"] = True`) aendert BEIDE — committed state UND aktuellen Wert. `sensor.alert_config = dict(cfg)` sieht keine Aenderung → kein SQL UPDATE → Suppression laeuft nie ab!
**Fix:** `cfg = dict(sensor.alert_config or {})` — Kopie erstellen BEVOR modifiziert wird. Fuer alle 3 Entity-Typen (Sensor, Actuator, Device).

### Bug 4: SQLAlchemy JSON Mutation — actuators.py PATCH runtime (MEDIUM)
**Datei:** `src/api/v1/actuators.py`
**Problem:** `existing = actuator.runtime_stats or {}` — gleiche Dict-Referenz. `existing.update(update_data)` + `actuator.runtime_stats = existing` → SA erkennt keine Aenderung.
**Fix:** `existing = dict(actuator.runtime_stats or {})` — Kopie erstellen.

### Bug 5: Unguarded Import — main.py (MEDIUM)
**Datei:** `src/main.py`
**Problem:** `from prometheus_fastapi_instrumentator import Instrumentator` — ImportError wenn Paket nicht installiert, blockierte ALLE Integration-Tests.
**Fix:** try/except mit Warning-Log.

### Bug 6: Alert Categorization — webhooks.py (LOW)
**Datei:** `src/api/v1/webhooks.py`
**Problem:** Keyword "ec" in `data_quality` matchte Substring in "disconnected" → MQTT-Alerts wurden als `data_quality` statt `connectivity` kategorisiert.
**Fix:** `connectivity` Keywords vor `data_quality` definiert + "ec" durch spezifischere Keywords ersetzt ("ec_", "ec-", "ecvalue", "electrical").

---

## Test-Fixes

### Fix 7: Mock-Path — test_threshold_notification_pipeline.py
`src.mqtt.handlers.sensor_handler.NotificationRouter` → `src.services.notification_router.NotificationRouter` (NotificationRouter wird innerhalb der Funktion importiert, nicht auf Modul-Ebene).

### Fix 8: Session-Mock — test_alert_suppression_scheduler.py
MagicMock-basierter Session-Mock → `asynccontextmanager` + `expire_all()` + Fresh SELECT Query statt `refresh()` auf gecachtem Fixture-Objekt.

---

## Block-Status

| Block | Inhalt | Tests | Status |
|-------|--------|-------|--------|
| 0 | Test-Infrastruktur (conftest.py) | — | Schon vorhanden |
| 1 | NotificationRouter Tests | 12 | 12/12 passed |
| 2 | Notifications REST API | 10 | 10/10 passed |
| 3 | EmailService Tests | 8 | 7/7 passed, 1 skip (jinja2) |
| 4 | AlertSuppressionService | 6 | 6/6 passed |
| 5 | Webhooks API | 5 | 5/5 passed |
| 6 | Threshold→Notification Pipeline | 5 | 5/5 passed |
| 7a | Scheduler Tasks | 3 | 3/3 passed |
| 7b | Alert Config API | 5 | 5/5 passed |
| 7c | Digest Service | 5 | 5/5 passed |
| 7d | Runtime Stats API | 4 | 4/4 passed |
| 8 | Prometheus Notification Metrics | 11 | 11/11 definiert + instrumentiert |
| 9 | Grafana Notification Alerts | 5 | 5/5 konfiguriert |

---

## Prometheus Metriken (Block 8)

| # | Metrik | Typ | Labels | Instrumentiert in |
|---|--------|-----|--------|-------------------|
| 1 | `god_kaiser_notifications_total` | Counter | severity, category, source | notification_router.py |
| 2 | `god_kaiser_notifications_read_total` | Counter | — | notifications.py (NEU) |
| 3 | `god_kaiser_email_sent_total` | Counter | provider, status | email_service.py |
| 4 | `god_kaiser_email_errors_total` | Counter | provider, error_type | email_service.py (NEU) |
| 5 | `god_kaiser_webhook_received_total` | Counter | source, status | webhooks.py |
| 6 | `god_kaiser_alert_suppression_active` | Gauge | entity_type | alert_suppression_scheduler.py |
| 7 | `god_kaiser_alert_suppression_expired_total` | Counter | — | alert_suppression_scheduler.py |
| 8 | `god_kaiser_notifications_deduplicated_total` | Counter | — | notification_router.py |
| 9 | `god_kaiser_notifications_suppressed_total` | Counter | reason | notification_router.py |
| 10 | `god_kaiser_digest_processed_total` | Counter | — | digest_service.py |
| 11 | `god_kaiser_ws_notification_broadcast_total` | Counter | event_type | notification_router.py |

---

## Grafana Alerts (Block 9)

| Alert | UID | PromQL | Threshold |
|-------|-----|--------|-----------|
| HighNotificationRate | `ao-notification-rate-high` | `rate(god_kaiser_notifications_total[5m])` | >10/5min |
| EmailDeliveryFailures | `ao-email-failure-rate` | `rate(god_kaiser_email_sent_total{status="failure"}[15m])` | >50% |
| WebhookReceptionStopped | `ao-webhook-reception-stopped` | `increase(god_kaiser_webhook_received_total[1h])` | <1 |
| HighSuppressionRatio | `ao-high-suppression-ratio` | Suppressed/Total Ratio | >80% |
| DigestBacklog | `ao-digest-backlog` | `increase(god_kaiser_digest_processed_total[2h])` | <1 |

Contact Point: `automationone-webhook` → `http://el-servador:8000/api/v1/webhooks/grafana-alerts`
Notification Policy: Alle Alerts → automationone-webhook, Group By [grafana_folder, alertname]

---

## Regression

**Full Suite:** 1889 passed, 67 skipped, 0 Regressionen von unseren Aenderungen
(1 flaky test `test_prometheus_metrics` in `test_api_health.py` — besteht einzeln, scheitert manchmal im Full-Suite wegen Test-Isolation — nicht von uns verursacht)

---

## Geaenderte Dateien

### Source Code (Production Bugs)
- `src/main.py` — prometheus_fastapi_instrumentator optional import
- `src/api/v1/sensors.py` — Route-Reihenfolge (GET alert-config/runtime vor /{esp_id}/{gpio})
- `src/api/v1/actuators.py` — Route-Reihenfolge + dict copy fuer PATCH runtime
- `src/api/v1/webhooks.py` — categorize_alert keyword ordering
- `src/api/v1/notifications.py` — notifications_read_total metric call
- `src/services/alert_suppression_scheduler.py` — dict copy fuer JSON mutation
- `src/services/email_service.py` — email_errors_total metric call
- `src/core/metrics.py` — 2 neue Metriken (notifications_read_total, email_errors_total)

### Test Code
- `tests/integration/test_alert_suppression_scheduler.py` — asynccontextmanager mock + expire_all
- `tests/integration/test_threshold_notification_pipeline.py` — mock path korrigiert
