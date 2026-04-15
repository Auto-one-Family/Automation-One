# VERIFY-PLAN-REPORT — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Gebundener Ordner:** `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/`  
**Datum:** 2026-04-11  
**Geprüft gegen:** `TASK-PACKAGES.md` (Vorentwurf) + Steuerdatei + Repo-IST (`mqtt-development` / `esp32-development` / `server-development` Evidence-Pfade)

---

## /verify-plan Ergebnis (kurz)

**Plan:** PKG-01 Firmware-Transport, PKG-02 Broker/Observation, PKG-03 optional Server-Throttle für Kalibrier-Burst  
**Geprüft:** 6 Kern-Pfade, 3 Agent-Referenzen, 2 Docker-Container-Namen, 1 REST-Pfad-Segment

### Bestätigt

- `El Trabajante/src/services/communication/mqtt_client.cpp` — `mqtt_cfg.keepalive = config.keepalive` (**225**), `MQTT_EVENT_DISCONNECTED` + `logCommunicationError(ERROR_MQTT_DISCONNECT, …)` (**1159–1179**), `MQTT_EVENT_ERROR` TCP/TLS-Log (**1249–1261**).
- `El Trabajante/src/main.cpp` — `mqtt_config.keepalive = 60` (**2913**).
- `El Trabajante/platformio.ini` — `[env:esp32_dev]` mit `-DMQTT_KEEPALIVE=60`, **ohne** `-DMQTT_USE_PUBSUBCLIENT=1` → ESP-IDF `esp_mqtt` (passt zu EA5484/WROOM-Berichtskontext).
- `docker/mosquitto/mosquitto.conf` — `max_keepalive 65535`, `max_inflight_messages 20` (**62–69**).
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` — Route-Segment `"/{esp_id}/{gpio}/measure"` (**1650**).
- `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` — existiert; `unexpected_disconnect` über Payload/Contract konsistent mit Bericht.

### Korrekturen (in TASK-PACKAGES eingearbeitet)

| Kategorie | Plan sagte / Annahme | System sagt | Empfehlung |
|-----------|----------------------|-------------|------------|
| Build-ENV | Generischer „seeed“- oder Xiao-Pfad | EA5484 = **ESP32 Dev** → **`pio run -e esp32_dev`** | Verify-Delta in TASK-PACKAGES §Verify-Einarbeitung. |
| Agent-Pfade | Unterordner `esp32/esp32-dev-agent.md` (Verify-Anhang-Beispiel) | IST: **`.claude/agents/esp32-dev.md`** (flach) | SPECIALIST-PROMPTS auf flache Pfade. |
| Docker | Generisch „mqtt“ | Compose-IST: Container **`automationone-mqtt`**, Server **`automationone-server`** | CORRELATION-MAP / Prompts: diese Namen für `docker logs`. |

### Fehlende Vorbedingungen

- [ ] Roh-Broker-Log `automationone-mqtt` im UTC-Fenster parallel zu Serial (**B-NET-01**).
- [ ] Produktive MQTT-URI-Klasse am Gerät (plain vs TLS) ohne Credentials (**B-TLS-URI-01**).

### Ergänzungen

- Meldung **„Writing didn't complete … errno=119“** stammt aus dem **ESP-IDF-MQTT-Stack**, nicht aus einer expliziten App-String-Quelle in `mqtt_client.cpp` — PKG-01 sollte **Stack/Config/Parallelität** prüfen, nicht nach einer nicht existierenden `grep`-Zeile suchen.
- **PubSubClient-Pfad** (`MQTT_USE_PUBSUBCLIENT`) ist für dieses Incident-**Zielgerät** nicht der Default — Xiao/Wokwi-Pakete nicht als primärer Verify-Pfad für EA5484 verwenden.

---

## Zusammenfassung für TM

Die **TASK-PACKAGES** sind gegen die Codebasis **ausführbar**; kritische Korrektur: Build- und Laufprofil **`esp32_dev`** für den berichteten ESP32-Dev-Cluster. Transport-RC bleibt **hypothesenbasiert** (H1/H2) bis **B-NET-01** / **B-TLS-URI-01** geschlossen sind. PKG-03 ist bewusst **entkoppelt** (Lastreduktion, kein Ersatz für Broker-Timeout-Analyse).

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — Archivkopie

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Testbefehl **`pio run -e esp32_dev`** (statt seeed/xiao); Scope: `mqtt_client.cpp` + Comm-/Publish-Queue; HW-Gate: ESP32-Dev; verworfen: Suche nach App-String „Writing didn't complete“ als Pflichtfundstelle. |
| PKG-02 | Log-Befehl mit Container **`automationone-mqtt`**; `docker/mosquitto/mosquitto.conf` bestätigt; kein Code-Zwang. |
| PKG-03 | Pfad `sensors.py` **1650** bestätigt; pytest nach Änderung; optional / TM-Entscheid. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-01 | `esp32-dev` |
| PKG-02 | `mqtt-debug` (+ Robin Ops) |
| PKG-03 | `server-dev` |

### Cross-PKG-Abhängigkeiten

- PKG-02 → PKG-01: weiche Evidence-Kante (Infra-Ergebnis priorisiert RC-H1 vs. reine Firmware).  
- PKG-03 → PKG-01: **keine** harte Abhängigkeit; PKG-03 adressiert nur H2-Verstärker.

### BLOCKER

- **B-NET-01:** Broker-/NAT-Logs im exakten UTC-Fenster fehlen im Repo.  
- **B-TLS-URI-01:** TLS vs. Plain am Feldgerät nicht aus dem Bericht allein beweisbar.  
- **B-SERIAL-01:** Monotone Zeitbasis Serial ↔ Broker für Sub-Minuten-Lage.
