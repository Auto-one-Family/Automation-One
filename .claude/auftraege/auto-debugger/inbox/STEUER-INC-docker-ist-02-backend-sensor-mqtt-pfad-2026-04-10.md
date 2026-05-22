---
run_mode: artefact_improvement
incident_id: ""
run_id: docker-ist-folge-02-backend-sensor-pfad
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/reference/api/REST_ENDPOINTS.md
  - .claude/reports/current/incidents/INC-2026-04-09-docker-ist/CORRELATION-MAP.md
scope: |
  Backend-Pfad zur IST-Stichprobe absichern: Soll-Datenfluss MQTT → SensorDataHandler → DB wie in
  CORRELATION-MAP (MOCK_* Topics unter kaiser/…/esp/…/sensor/…/data, „Sensor data saved“).
  Code-Pattern: El Servador src/mqtt/handlers/sensor_handler.py (SensorDataHandler, resilient_session),
  SimulationScheduler-Initialisierung in src/main.py, ESP-ID-Validierung MOCK_* in src/core/validators.py
  / schemas/esp.py. Aufgabe: Referenz und ggf. Tests/E2E-Hinweise alignen — keine neue parallele
  Sensor-Pipeline. Bei echten Code-Änderungen auto-debugger-Workflow mit TASK-PACKAGES und verify-plan.
forbidden: |
  Keine zweite Sensor-Verarbeitung neben SensorDataHandler. Keine Breaking Changes an MQTT-Topic-Schema
  oder REST ohne separates Gate. Keine Secrets. Branch nur auto-debugger/work bei Commits.
done_criteria: |
  REST_ENDPOINTS.md oder zugehörige Architektur-Notiz beschreibt Health unter /api/v1/health/* konsistent
  zum Instrumentator (main.py). Optional: Verweis von CORRELATION-MAP-Soll auf konkrete Module/Tests
  (z. B. tests/e2e/test_sensor_workflow.py). Bei Code: pytest für betroffene Module grün; VERIFY-PLAN-REPORT
  nach Gate geschlossen.
---

# STEUER 02 — Backend: Sensor-/MQTT-Datenpfad (Folge INC-2026-04-09-docker-ist)

**Closest implementations (Pflicht vor Änderung):**

| Thema | Pfad |
|-------|------|
| Sensor-MQTT | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| App-Lifecycle / Mock-Simulation | `El Servador/god_kaiser_server/src/main.py` (SimulationScheduler) |
| ESP-ID MOCK_* | `El Servador/god_kaiser_server/src/core/validators.py`, `src/schemas/esp.py` |

**Schrittweise Umsetzung**

1. **Trace lesen:** Im Incident `CORRELATION-MAP.md` — Soll-Kette MQTT → sensor_handler → INSERT sensor_data.
2. **Abgleich Code:** `handle_sensor_data` / `SensorDataHandler.handle_sensor_data` — `DataSource`, `resilient_session`, keine Duplikat-Logik einführen.
3. **Doku:** REST_ENDPOINTS.md — Health-Endpunkte `/api/v1/health/live`, `/api/v1/health/metrics` (Prometheus-Text) mit main.py abgleichen.
4. **Tests:** Bei Anpassungen mindestens bestehende Sensor-/Handler-Tests oder E2E-Sensor-Workflow erweitern — Pattern aus `tests/e2e/test_sensor_workflow.py` wiederverwenden.

**Verify:** `cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --timeout=120` (oder fokussierter Pfad nach Änderung); zusätzlich `poetry run ruff check src/` bei Python-Änderungen.

**Rolle:** server-dev; bei MQTT-Protokoll mqtt-dev konsultieren.
