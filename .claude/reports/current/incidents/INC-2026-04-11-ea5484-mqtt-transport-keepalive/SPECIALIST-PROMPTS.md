# SPECIALIST-PROMPTS — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Git-Pflicht:** Arbeit und Commits nur auf Branch **`auto-debugger/work`** (nicht `master`).  
**Artefakte:** `INCIDENT-LAGEBILD.md`, `CORRELATION-MAP.md`, `TASK-PACKAGES.md`, `VERIFY-PLAN-REPORT.md`.

**Startrolle (empfohlen):** zuerst **PKG-02** / `mqtt-debug` parallel zu **PKG-01** Analyse-Oberfläche — RC ohne Broker-Evidence bleibt dünn.

---

## Rolle: esp32-dev — Agent `.claude/agents/esp32-dev.md`

**KONTEXT:** Incident INC-2026-04-11-ea5484-mqtt-transport-keepalive. Gerät **ESP_EA5484** (ESP32 Dev). Berichtskette: Schreib-Timeout (IDF) → Disconnect → 3014 → Broker `exceeded timeout`. **3014** ist korrekt (Nachfolge von INC-2026-04-10 PKG-01).

**AUFTRAG:** **PKG-01** — Transport und Nicht-Blockierung des MQTT-Pfads (ESP-IDF `esp_mqtt`): Konfiguration (`keepalive`, Buffer, Task-Prio), Zusammenspiel **Communication-Task** / **Publish-Queue** (M3), parallele Last (Sensor + MQTT). Keine `delay()` in MQTT-Hotpaths. LWT-Payload-Contract unverändert lassen.

**DATEIEN (Pflicht-Start):**

- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/services/communication/mqtt_client.h`
- `El Trabajante/src/tasks/communication_task.cpp`
- `El Trabajante/src/tasks/publish_queue.cpp` / `publish_queue.h`

**TESTS:**

```text
cd "El Trabajante" && pio run -e esp32_dev
```

**OUTPUT:** Commit auf `auto-debugger/work`; Message mit Incident-ID.

**BLOCKER:** **B-SERIAL-01** / **B-NET-01** für RC-H1 — Analyse trotzdem startbar.

---

## Rolle: mqtt-debug — Agent `.claude/agents/mqtt-debug.md`

**KONTEXT:** Mosquitto meldet `exceeded timeout` für `ESP_EA5484`; Keepalive-Clientseite 60 s laut Firmware-Config.

**AUFTRAG:** **PKG-02** — `docker logs automationone-mqtt --since …` (UTC mit Host abgleichen), Einordnung `max_inflight_messages` / Broker-CPU / Docker-NAT (`172.19.0.1` im Bericht). Optional `make mqtt-sub`. **Keine** MQTT-URIs mit Credentials in Reports.

**DATEIEN (Referenz):**

- `docker/mosquitto/mosquitto.conf`
- `docker-compose.yml` (Service `mqtt-broker` → Container-Name prüfen)

**BLOCKER:** **B-NET-01** bis Rohlogs vorliegen.

---

## Rolle: server-dev — Agent `.claude/agents/server-dev.md`

**KONTEXT:** Kalibrier-Burst über `POST …/measure` kann H2 **verstärken**, ersetzt aber keinen Transport-RC.

**AUFTRAG:** **PKG-03** nur nach **TM-Go** — Rate-Limit / Entschärfung in `sensors.py` um Route `/{esp_id}/{gpio}/measure` (IST **1650**). Tests mit pytest erweitern.

**DATEIEN:**

- `El Servador/god_kaiser_server/src/api/v1/sensors.py`

**TESTS:**

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --timeout=120
```

**BLOCKER:** Scope-Kollision mit Produkt-Priorität — mit TM abstimmen.
