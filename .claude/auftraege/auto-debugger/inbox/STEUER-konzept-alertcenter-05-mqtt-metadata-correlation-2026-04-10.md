---
run_mode: artefact_improvement
incident_id: ""
run_id: konzept-alertcenter-05-mqtt-correlation-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
  - .claude/reference/api/MQTT_TOPICS.md
  - El Servador/god_kaiser_server/src/services/notification_router.py
scope: |
  Konzept §5.2 / Lückenliste P1: Wo fehlt noch eine konsistente Spiegelung von `correlation_id` (oder
  äquivalentem Kanon) von MQTT-Ingress zu `Notification.extra_data` / Metadaten, sodass
  Operator und Logs dieselbe ID über MQTT→DB→REST nachvollziehen können? Vorgehen: mqtt-development-
  Skill-Patterns — **bestehende** Handler (sensor_handler, actuator_alert_handler, …) als Analogfall;
  nur additive Payload-/Metadaten-Felder; keine Änderung des Dedup-Algorithmus ohne Review.
  Abstimmung mit IST-Observability: HTTP-`request_id` ≠ MQTT-CID semantisch trennen.
forbidden: |
  Keine Breaking Changes an MQTT-Topic-Namen oder QoS ohne Review; keine Secrets; keine stillen
  Umbenennungen in Firmware-Protokollen — bei ESP-Pflicht siehe STEUER 06 oder separates MQTT+
  Firmware-Paket.
done_criteria: |
  Mindestens ein nachvollziehbarer End-to-End-Pfad dokumentiert (Topic → Handler → Notification-
  Create) mit sichtbarer `correlation_id` in DB-Metadaten **oder** dokumentierter BLOCKER (Gerät/
  Alt-Payload); Server-Tests für den geänderten Handler grün (bestehende Handler-Test-Muster).
---

# STEUER 05 — MQTT → Notification: Korrelation in Metadaten

## Pattern-Anker

- `src/services/notification_router.py` — `route`, Dedup, Metriken.
- MQTT-Handler mit NotificationRouter: `src/mqtt/handlers/sensor_handler.py`, `actuator_alert_handler.py` — **closest implementation** per Grep.
- Kontext: `src/core/request_context.py` — `generate_mqtt_correlation_id` (nicht mit HTTP verwechseln).

## Aufgabenpaket (SOLL für TASK-PACKAGES)

1. **PKG-01:** Matrix „Quelle → aktuell gesetzte correlation/metadata → Lücke“.
2. **PKG-02:** Minimalfix an **einer** Quelle als Referenz (weitere in Folge-PKGs).
3. **PKG-03:** pytest — Handler-Tests nach Muster `tests/mqtt/handlers/` (konkrete Datei im verify-plan Gate festlegen).

## Verify

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/mqtt/handlers/ --tb=short -q
poetry run ruff check src/mqtt/handlers/
```

## Cross-Ref

- Bereits laufender Contract-Lauf: `STEUER-config-response-correlation-contract-2026-04-10.md` — Config-Pfad nicht vermischen; nur bei gemeinsamen Hilfsfunktionen auf `device_response_contract` / Playbook verweisen.

---

*Teil von MASTER `STEUER-konzept-alertcenter-MASTER-2026-04-10.md`*
