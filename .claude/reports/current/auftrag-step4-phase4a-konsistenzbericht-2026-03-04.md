# Phase 4A Konsistenzbericht — STEP 4 Test-Suite + Observability

> **Datum:** 2026-03-04
> **Referenz:** `auftrag-step4-phase4a-test-suite-und-observability.md`
> **Kontext:** Gewächshaus-Produktion — viele Sensoren/Aktoren sicher verwalten

---

## 1. Zusammenfassung

Die Phase-4A-Implementierung ist **weitgehend vollständig**. Es wurde eine **Threshold-Namensinkonsistenz** behoben, die bei Zone-aware und sensor_formatters zu fehlenden Alerts geführt hätte.

---

## 2. Verifizierte Blöcke

### Block 0: Test-Infrastruktur ✅
- `conftest.py`: `notification` Model-Import vorhanden (Zeile 50)
- Fixtures: `sample_notification`, `sample_preferences`, `mock_email_service`, `mock_ws_manager` implementiert
- `Base.metadata.create_all` erstellt `notifications` und `notification_preferences`

### Block 1: NotificationRouter Tests ✅
- `tests/integration/test_notification_router.py` — 12 Tests
- Pattern: `NotificationRouter(session=db_session, email_service=mock_email_service)`
- Fingerprint-Dedup, Titel-Dedup (60s), Quiet Hours, persist_suppressed, broadcast_unread_count

### Block 2: Notifications REST API Tests ✅
- `tests/integration/test_notifications_api.py` — 10 Tests
- Pagination (`page`/`page_size`), Filter, Admin-only `POST /send`, 403 für Non-Admin

### Block 3: EmailService Tests ✅
- `tests/unit/test_email_service.py` — 8 Tests

### Block 4: AlertSuppressionService Tests ✅
- `tests/integration/test_alert_suppression_service.py` — 6 Tests
- `warning_min`, `warning_max`, `critical_min`, `critical_max` (kanonical)

### Block 5: Webhooks API Tests ✅
- `tests/integration/test_webhooks_api.py` — 5 Tests

### Block 6: Threshold→Notification Pipeline Tests ✅
- `tests/integration/test_threshold_notification_pipeline.py` — 5 Tests

### Block 7: Verbleibende Tests ✅
- `test_alert_suppression_scheduler.py`, `test_digest_service.py`, `test_alert_config_api.py`, `test_runtime_stats_api.py`

### Block 8: Prometheus-Metriken ✅
- 11 Metriken in `src/core/metrics.py` definiert
- `init_metrics()` initialisiert alle Label-Kombinationen
- Helper: `increment_notification_created`, `increment_notification_suppressed`, etc.

### Block 9: Grafana Alert-Regeln ✅
- 5 Regeln in `automationone-notification-pipeline` (Rules 33–37)
- NotificationRateTooHigh, EmailFailureRate, WebhookReceptionStopped, HighSuppressionRatio, DigestBacklog

---

## 3. Behobene Inkonsistenz: Threshold-Namensschema

### Problem
Es existierten **zwei unterschiedliche Namenskonventionen** für Schwellwerte:

| Kontext | Keys | Verwendung |
|---------|------|------------|
| **Kanonisch** (AlertConfig, API, AlertSuppressionService) | `warning_min`, `warning_max`, `critical_min`, `critical_max` | DB, REST, Pipeline |
| **Legacy** (sensor_formatters, zone_aware_thresholds) | `warning_low`, `warning_high`, `critical_low`, `critical_high`, `min`, `max` | Display, Zone-Phasen |

`AlertSuppressionService.get_effective_thresholds()` gab `custom_thresholds` unverändert zurück. Wenn das Frontend oder `zone_aware_thresholds` `warning_high`/`critical_high` lieferte, fand `check_thresholds()` keine Werte → **keine Alerts**.

### Lösung
In `alert_suppression_service.py`:

1. **`_normalize_thresholds(raw)`** — mappt beide Schemas auf kanonisch:
   - `warning_high` → `warning_max`, `warning_low` → `warning_min`
   - `critical_high` → `critical_max`, `critical_low` → `critical_min`
   - `min`/`max` → `warning_min`/`warning_max`

2. **`get_effective_thresholds()`** — normalisiert `custom_thresholds` und `sensor_config.thresholds` vor Rückgabe.

3. **`check_thresholds()`** — normalisiert eingehende `thresholds` vor der Prüfung (für Zone-Merge, der Legacy-Keys hinzufügt).

### Betroffene Dateien
- `El Servador/god_kaiser_server/src/services/alert_suppression_service.py`

---

## 4. Datenfluss-Konsistenz

### Sensor → Notification Pipeline
```
MQTT sensor/data
  → SensorDataHandler
  → _evaluate_thresholds_and_notify()
  → AlertSuppressionService.get_effective_thresholds()  [normalisiert]
  → ZoneAwareThresholdService.get_thresholds() [optional merge, Legacy-Keys]
  → AlertSuppressionService.check_thresholds() [normalisiert]
  → NotificationRouter.route() oder persist_suppressed()
```

### API ↔ Frontend
- `alert_config.custom_thresholds`: Kanonisch (`warning_min`, `warning_max`, …)
- Frontend `AlertConfigSection.vue`: Nutzt `sensorsApi.updateAlertConfig()` mit kanonischen Keys
- `sensor_formatters.determine_sensor_severity`: Legacy für Display; Pipeline nutzt AlertSuppressionService

---

## 5. Empfehlungen

1. **Tests ausführen** (mit Poetry):
   ```bash
   cd "El Servador/god_kaiser_server"
   poetry run pytest tests/integration/test_notification_router.py tests/integration/test_alert_suppression_service.py tests/integration/test_threshold_notification_pipeline.py -v
   ```

2. **sensor_formatters** optional vereinheitlichen: `determine_sensor_severity` könnte intern `_normalize_thresholds` nutzen oder auf kanonische Keys umstellen — aktuell wird sie nur für Display/Quality genutzt, nicht für die Pipeline.

3. **zone_aware_thresholds**: Gibt weiterhin `warning_high`/`critical_high` zurück; die Normalisierung in `AlertSuppressionService` macht das transparent.

---

## 6. Keine Änderung nötig

- **NotificationPreferences**: `email_severities` als JSON-Liste (`["critical","warning"]`) — korrekt
- **Notification Model**: `fingerprint`, `status`, `correlation_id` — Phase 4B-konform
- **Grafana DigestBacklog**: Nutzt `increase(god_kaiser_digest_processed_total[2h]) < 1` (sinnvoller als `time() - counter`)
- **mock_ws_manager**: Patch auf `WebSocketManager.get_instance` — korrekt für async Singleton
