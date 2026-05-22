# VERIFY-PLAN-REPORT — STEUER 05

**Datum:** 2026-04-10  
**run_id:** `konzept-alertcenter-05-mqtt-correlation-2026-04-10`

## Geprüfte Planelemente (TASK-PACKAGES / Steuerdatei)

| Referenz | Status | Befund |
|----------|--------|--------|
| `El Servador/god_kaiser_server/src/services/notification_router.py` | OK | Existiert; `metadata` → `extra_data`, `correlation_id` → Spalte. |
| `src/mqtt/handlers/sensor_handler.py` | OK | `NotificationRouter` in `_evaluate_thresholds_and_notify`; synthetische `threshold_*` CID. |
| `src/mqtt/handlers/actuator_alert_handler.py` | OK | `NotificationCreate` ohne `correlation_id` — bestätigt Lücke. |
| `src/core/request_context.py` — `generate_mqtt_correlation_id` | OK | Dokumentiert; nicht mit HTTP-UUID verwechseln. |
| `src/mqtt/subscriber.py` — CID + `_run_handler_with_cid` | OK | Setzt ContextVar für Handler; Basis für PKG-02. |
| Verify: `poetry run pytest tests/mqtt/handlers/` | **BLOCKER / Korrektur** | **`tests/mqtt/handlers/` existiert nicht** (0 Dateien). Ersatz: siehe TASK-PACKAGES PKG-03. |
| `.claude/reference/api/MQTT_TOPICS.md` | OK | Referenzdatei vorhanden (nicht erneut vollständig eingelesen; Pfad gültig). |

## Breaking-Change-Risiko

- Keine Topic-/QoS-Änderung in PKG-02 vorgesehen — **niedrig**, solange nur additive Felder / `correlation_id`-Befüllung.

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

```text
PKG-01: OK — Matrix mit Repo-Evidenz bestätigt; keine Pfadkorrektur nötig.
PKG-02: Delta — Owner server-dev; Fix in actuator_alert_handler.py; Pattern-Reuse: get_request_id() wie Subscriber-Kontext; optional payload correlation_id später.
PKG-03: Delta — pytest-Zielpfad STEUER falsch; ersetzen durch tests/unit/mqtt/test_actuator_alert_notification_correlation.py (neu) + tests/integration/test_threshold_notification_pipeline.py; ruff unverändert src/mqtt/handlers/.
Rollen: server-dev für PKG-02+03; mqtt-dev optional Doku MQTT_TOPICS Payload.
Abhängigkeiten: PKG-03 nach PKG-02 oder Unit-Test mit Mock parallel zu Implementierung.
BLOCKER: keiner für Analyse; STEUER-Verify-Befehl wäre leer/fehlgeschlagen bis Pfad korrigiert.
```
