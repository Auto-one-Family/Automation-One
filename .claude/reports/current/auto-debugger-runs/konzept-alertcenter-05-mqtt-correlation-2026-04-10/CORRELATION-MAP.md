# CORRELATION-MAP — MQTT-Ingress → Notification (STEUER 05)

**Hinweis:** Feld-bewusst — HTTP `X-Request-ID` / Log-`request_id` ≠ MQTT-Ingress-CID (gleicher ContextVar-Mechanismus, andere Semantik).

| Schicht | Feld / Mechanismus | Beispiel / Quelle |
|---------|-------------------|-------------------|
| MQTT Subscriber | `generate_mqtt_correlation_id` → `set_request_id` im Handler | `src/mqtt/subscriber.py` |
| Handler-Kontext | `get_request_id()` | `src/core/request_context.py` |
| Notification DB | `notifications.correlation_id` (Spalte) | `NotificationRouter.route` |
| Notification DB | `extra_data` (JSONB) aus `NotificationCreate.metadata` | `notification_router.py` |
| Actuator-Alert-Pfad | vor PKG-02: **keine** Spiegelung Ingress-CID | `actuator_alert_handler.py` |
| Schwellenwert-Pfad | synthetisch `threshold_{esp}_{sensor_type}` | `sensor_handler.py` |

**Run-Artefakte:** `TASK-PACKAGES.md`, `VERIFY-PLAN-REPORT.md`
