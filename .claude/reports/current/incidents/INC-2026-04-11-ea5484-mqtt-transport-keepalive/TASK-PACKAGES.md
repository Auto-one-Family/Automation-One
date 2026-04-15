# TASK-PACKAGES — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Stand:** nach `verify-plan`-Gate (2026-04-11), Delta eingearbeitet.  
**Git:** Umsetzung nur auf Branch **`auto-debugger/work`** (von `master`); keine Commits auf `master`.

---

## PKG-01 — Firmware: Transport, Schreibpfad, Keepalive-Interaktion (ESP-IDF)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Mittel (MQTT/Safety-Nachbarschaft); keine Safety-Aktor-Logik ohne Review. |
| **Scope** | `El Trabajante/src/services/communication/mqtt_client.cpp` (Event-Pfad, Publishes, `mqtt_cfg.*`); `El Trabajante/src/tasks/communication_task.cpp` / `publish_queue.*` (M3-Drain vs. Blockaden); Abgleich mit ESP-IDF `esp_mqtt` Outbox/Socket-Timeouts (nur wo im Tree konfigurierbar — **keine** Magic-Delays in Hotpaths). |
| **Zielbild** | Messbar: entweder **konkrete** Konfig-/Queue-Anpassung mit Begründung **oder** dokumentiertes „kein sicherer Repo-Fix ohne HW-Repro“ + Telemetrie-Hooks (serielle Marken). |
| **Tests / Verifikation** | `cd "El Trabajante" && pio run -e esp32_dev` (Exit 0). Zielhardware ESP32-Dev wie EA5484. |
| **Akzeptanz** | Änderungen mit Kommentar-Verweis auf Incident-ID; kein Regressions-Wechsel des LWT-Payload-Contracts; Throttle/3014 unverändert legal. |
| **Abhängigkeiten** | Optional: Parallel **PKG-02** (Infra-Evidence) zur RC-Einordnung — kein Blocker für Code-Analyse. |

---

## PKG-02 — Broker / Transport-Beobachtung (Keepalive, Inflight, NAT)

| Feld | Inhalt |
|------|--------|
| **Owner** | `mqtt-debug` (+ Robin Ops) |
| **Risiko** | — (primär Beobachtung/Doku) |
| **Scope** | `docker/mosquitto/mosquitto.conf` (`max_inflight_messages`, `max_keepalive`); pragmatische Logs: `docker logs automationone-mqtt --since …`; Korrelation UTC; **keine** Secrets in Artefakten. |
| **Tests / Verifikation** | Manuell: `make mqtt-sub` / `mosquitto_sub` laut Makefile; optional Lastvergleich mit/ohne Kalibrier-Burst. |
| **Akzeptanz** | Entweder **B-NET-01** entlastet mit Log-Auszug **oder** BLOCKER explizit offen mit nächstem Messfenster. |
| **Abhängigkeiten** | Keine harte Kante zu PKG-03. |

---

## PKG-03 — Server: Kalibrier-Mess-Burst entschärfen (optional, getrennt von Transport-RC)

| Feld | Inhalt |
|------|--------|
| **Owner** | `server-dev` |
| **Risiko** | Niedrig bis mittel (API-Verhalten / UX); kein Ersatz für Transport-Fix. |
| **Scope** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` (Route `/{esp_id}/{gpio}/measure` um Zeile **1650**); ggf. Service-Layer Rate-Limit / Queue pro Gerät+GPIO — **nur** nach TM-Priorität. |
| **Tests / Verifikation** | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --timeout=120` (fokussiert erweitern falls neuer Limiter). |
| **Akzeptanz** | Keine Regression für legitime Einzelmessung; Verhalten dokumentiert (kurz im PR). |
| **Abhängigkeiten** | **Weich:** Unterstützt H2 (Verstärker), beweist H1 nicht. |

---

## Verify-Einarbeitung (Delta-Log)

| Quelle | Änderung am Paketplan |
|--------|------------------------|
| `verify-plan` | Build-Ziel für **ESP32 Dev/WROOM** (EA5484): **`pio run -e esp32_dev`** — nicht `seeed_xiao_esp32c3` (PubSubClient-Pfad). |
| `verify-plan` | Agent-Referenzen: flache Pfade `.claude/agents/esp32-dev.md`, `.claude/agents/mqtt-debug.md`, `.claude/agents/server-dev.md`. |
| `verify-plan` | Container-Namen: **`automationone-mqtt`**, **`automationone-server`** (Compose-IST). |
