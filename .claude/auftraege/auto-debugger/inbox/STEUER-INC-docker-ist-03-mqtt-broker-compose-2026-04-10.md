---
run_mode: artefact_improvement
incident_id: ""
run_id: docker-ist-folge-03-mqtt-broker
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/reference/api/MQTT_TOPICS.md
  - docker-compose.yml
scope: |
  MQTT-Broker-IST zur Stichprobe INC-2026-04-09-docker-ist: Service mqtt-broker (Container
  automationone-mqtt), Ports 1883/9001, Healthcheck mit mosquitto_sub auf $$SYS/# (siehe docker-compose.yml).
  Topics im grünen Pfad: kaiser/god/esp/MOCK_BEAA9D/sensor/… — Abgleich mit TopicBuilder-Soll in
  El Servador (src/mqtt/topics) und MQTT_TOPICS.md. Additive Doku oder minimale Compose-Klarstellung
  nur bei nachweisbarer Lücke; keine Broker-Config ändern ohne Impact-Review (Clients, TLS, Ports).
forbidden: |
  Keine willkürliche Topic-Schema-Änderung. Keine Secrets in mosquitto.conf. Kein Entfernen des
  Healthchecks ohne Ersatz. Branch nur auto-debugger/work.
done_criteria: |
  MQTT_TOPICS.md (oder README-Abschnitt) verweist konsistent auf kaiser/{…}/esp/{esp_id}/… und den
  Docker-Service-Namen/Container für lokale Diagnose. Optional: ein Verify-Abschnitt „mosquitto_sub
  smoke“ analog SYSTEM_OPERATIONS_REFERENCE §0.4. Bei Config-Änderung: Stack manuell hochfahren und
  Healthcheck grün.
---

# STEUER 03 — MQTT: Broker & Topic-Baseline (Folge INC-2026-04-09-docker-ist)

**Pattern (Repo-Ist):**

- Compose: `docker-compose.yml` — `mqtt-broker`, `container_name: automationone-mqtt`, Volume `docker/mosquitto/mosquitto.conf`.
- Server-Verbindung: `MQTT_BROKER_HOST: mqtt-broker`, Port 1883 (Umgebungsvariablen im Service `el-servador`).

**Schrittweise Umsetzung**

1. **IST-Stichprobe:** Incident-LAGEBILD — healthcheck-Clients, kein Fehlertail in der Stichprobe.
2. **Topic-Pfad:** `Grep` nach `TopicBuilder` / `kaiser/` in `El Servador/god_kaiser_server/src/mqtt/` — Dokumentation MQTT_TOPICS.md aktualisieren, nicht raten.
3. **Diagnose-Befehl:** `mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30` (Windows: SYSTEM_OPERATIONS_REFERENCE §0.4) — als wiederholbaren Smoke dokumentieren.
4. **Änderungen an mosquitto.conf:** nur mit mqtt-dev / mqtt-development Skill-Patterns und Integrationstest-Gate.

**Verify:** Kein Python-Pflichtcheck für reine Doku; bei Server-Änderungen an Subscribern `pytest` wie in STEUER-02.

**Rolle:** mqtt-dev bei Code; reine Doku: auto-debugger artefact_improvement.
