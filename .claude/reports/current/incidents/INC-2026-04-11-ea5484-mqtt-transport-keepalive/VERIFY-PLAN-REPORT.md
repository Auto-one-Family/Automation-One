# VERIFY-PLAN-REPORT — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Gebundener Ordner:** `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/`  
**Datum:** 2026-04-17 (Stresstest-Revalidate)  
**Geprüft gegen:** `TASK-PACKAGES.md` (post-verify Mutation), Steuerdatei, frische Evidence `El Trabajante/logs/device-monitor-260417-133604.log`, Repo-IST

---

## /verify-plan Ergebnis (kurz)

**Plan:** PKG-01 Firmware-Transport, PKG-02 Broker/Observation, PKG-03 optional Server-Throttle, PKG-04 ACK-Callsite-Dedup, **PKG-15 Counter-Konsistenz**  
**Geprüft:** 9 Kern-Pfade, 3 Agent-Referenzen, 3 Docker-Container-Namen, 1 REST-Pfad-Segment, 1 frische 5-Min-Serial-Evidence-Datei

### Bestätigt

- `El Trabajante/src/services/communication/mqtt_client.cpp` — `mqtt_cfg.keepalive = config.keepalive` (**225**), `MQTT_EVENT_DISCONNECTED` + `logCommunicationError(ERROR_MQTT_DISCONNECT, …)` (**1159–1179**), `MQTT_EVENT_ERROR` TCP/TLS-Log (**1249–1261**).
- `El Trabajante/src/main.cpp` — `mqtt_config.keepalive = 60` (**2913**).
- `El Trabajante/platformio.ini` — `[env:esp32_dev]` mit `-DMQTT_KEEPALIVE=60`, **ohne** `-DMQTT_USE_PUBSUBCLIENT=1` → ESP-IDF `esp_mqtt` (passt zu EA5484/WROOM-Berichtskontext).
- `docker/mosquitto/mosquitto.conf` — `max_keepalive 65535`, `max_inflight_messages 20` (**62–69**).
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` — Route-Segment `"/{esp_id}/{gpio}/measure"` (**1650**).
- `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` — existiert; `unexpected_disconnect` über Payload/Contract konsistent mit Bericht.
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` — ACK sendet pro Heartbeat `status` + `server_time` (`_send_heartbeat_ack()`).
- `El Trabajante/src/main.cpp` + `El Trabajante/src/services/config/config_manager.cpp` — ACK-Branch ruft weiterhin `setDeviceApproved(true, approval_ts)` auf jedem `online/approved` ACK; Setter dedupliziert bereits, aber `approval_ts`-Wechsel kann Persistenz weiter triggern.
- Frische Log-Evidence bestätigt 5-Min-Fenster ohne WDT/Guru, dafür TLS-/Disconnect-Loop (`errno=119`, `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`, `MQTT_EVENT_DISCONNECTED`, `SafePublish failed after retry`, später `OFFLINE_ACTIVE`).

### Korrekturen (in TASK-PACKAGES eingearbeitet)

| Kategorie | Plan sagte / Annahme | System sagt | Empfehlung |
|-----------|----------------------|-------------|------------|
| Build-ENV | Generischer „seeed“- oder Xiao-Pfad | EA5484 = **ESP32 Dev** → **`pio run -e esp32_dev`** | Verify-Delta in TASK-PACKAGES §Verify-Einarbeitung. |
| Agent-Pfade | Unterordner `esp32/esp32-dev-agent.md` (Verify-Anhang-Beispiel) | IST: **`.claude/agents/esp32-dev.md`** (flach) | SPECIALIST-PROMPTS auf flache Pfade. |
| Docker | Generisch „mqtt“ | Compose-IST: Container **`automationone-mqtt`**, Server **`automationone-server`** | CORRELATION-MAP / Prompts: diese Namen für `docker logs`. |
| State/Persistenz | Heartbeat-ACK behandelt wie einmalige Approval-Entscheidung | Dedup im Setter existiert, aber ACK-Callsite liefert fortlaufend neue `approval_ts`-Werte | **PKG-04** auf Callsite/Timestamp-Semantik fokussieren (nicht neuen Setter erfinden). |
| Transport-Telemetrie | Write- und TLS-Timeout seien bereits sauber getrennt | Stresstest zeigt `errno=119`, aber Reconnect-Status bleibt bei `write_timeouts=0` und steigenden `tls_timeouts` | **PKG-15** ergänzen: Counter-/Reason-Konsistenz im MQTT-Ereignispfad. |

### Fehlende Vorbedingungen

- [ ] Roh-Broker-Log `automationone-mqtt` im UTC-Fenster parallel zu Serial (**B-NET-01**).
- [ ] Produktive MQTT-URI-Klasse am Gerät (plain vs TLS) ohne Credentials (**B-TLS-URI-01**).
- [ ] Vollständiger Export inkl. ERRTRAK-Lines (im 5-Min-Export keine explizite `ERRTRAK [3014]`-Zeile) (**B-ERRTRAK-01**).

### Ergänzungen

- Meldung **„Writing didn't complete … errno=119“** stammt aus dem **ESP-IDF-MQTT-Stack**, nicht aus einer expliziten App-String-Quelle in `mqtt_client.cpp` — PKG-01 sollte **Stack/Config/Parallelität** prüfen, nicht nach einer nicht existierenden `grep`-Zeile suchen.
- **PubSubClient-Pfad** (`MQTT_USE_PUBSUBCLIENT`) ist für dieses Incident-**Zielgerät** nicht der Default — Xiao/Wokwi-Pakete nicht als primärer Verify-Pfad für EA5484 verwenden.
- Alloy/Monitoring: Für saubere UTC-Korrelation parallel Monitoring-Profil prüfen (`automationone-alloy`), damit Broker/Server-Zeiten nicht nur aus Einzelquellen gezogen werden.

---

## Zusammenfassung für TM

Die **TASK-PACKAGES** sind gegen die Codebasis **ausführbar**; kritische Korrekturen: Build-/Laufprofil **`esp32_dev`**, PKG-04 auf **ACK-Callsite** fokussiert und neues Diagnosepaket **PKG-15**. Transport-RC bleibt **hypothesenbasiert** (H1/H2/H5) bis **B-NET-01** / **B-TLS-URI-01** geschlossen sind. PKG-03 bleibt bewusst **entkoppelt** (Lastreduktion, kein Ersatz für Broker-Timeout-Analyse).

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Testbefehl **`pio run -e esp32_dev`** (statt seeed/xiao); Scope: `mqtt_client.cpp` + Comm-/Publish-Queue; HW-Gate: ESP32-Dev; ergänzt um Ziel „diagnostisch präziser 5-Min-TLS-Loop“. |
| PKG-02 | Log-Befehl mit Container **`automationone-mqtt`**; `docker/mosquitto/mosquitto.conf` bestätigt; kein Code-Zwang. |
| PKG-03 | Pfad `sensors.py` **1650** bestätigt; pytest nach Änderung; optional / TM-Entscheid. |
| PKG-04 | Fokus korrigiert: **Callsite in `main.cpp`** für `online/approved` ACK; `config_manager.cpp/.h` nur Verify-Read; Runtime-Check: kein persistenter Dauer-Write bei reinem Liveness-ACK. |
| PKG-15 | Neu: `mqtt_client.cpp` Counter-/Reason-Konsistenz für Write-vs-TLS-Timeout (`errno=119` darf nicht mit `write_timeouts=0` blind bleiben). |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-01 | `esp32-dev` |
| PKG-02 | `mqtt-debug` (+ Robin Ops) |
| PKG-03 | `server-dev` |
| PKG-04 | `esp32-dev` |
| PKG-15 | `esp32-dev` |

### Cross-PKG-Abhängigkeiten

- PKG-02 → PKG-01: weiche Evidence-Kante (Infra-Ergebnis priorisiert RC-H1 vs. reine Firmware).  
- PKG-03 → PKG-01: **keine** harte Abhängigkeit; PKG-03 adressiert nur H2-Verstärker.
- PKG-04 ↔ PKG-01: gemeinsame Firmware-Review-Kante (gleiches Device-/ACK-Subsystem, gemeinsam testen).
- PKG-15 ↔ PKG-01: gleiche Transportdiagnostik; Änderungen zusammen reviewen, damit Counter- und Reconnect-Gründe konsistent bleiben.

### BLOCKER

- **B-NET-01:** Broker-/NAT-Logs im exakten UTC-Fenster fehlen im Repo.  
- **B-TLS-URI-01:** TLS vs. Plain am Feldgerät nicht aus dem Bericht allein beweisbar.  
- **B-SERIAL-01:** Monotone Zeitbasis Serial ↔ Broker für Sub-Minuten-Lage.
- **B-ALLOY-01:** Monitoring/Alloy-Pfad im selben Fenster noch nicht verifiziert (Ingestion-/Noise-Einfluss offen).
- **B-ERRTRAK-01:** `ERRTRAK [3014]` im aktuellen 5-Min-Export nicht explizit sichtbar (Format/Level/Filter prüfen).
- **B-OUTBOX-LIMIT-API-01** *(neu 2026-04-17)*: `mqtt_cfg.outbox_limit` muss gegen das in `El Trabajante` gebundene ESP-IDF-Release verifiziert werden (Symbol/Feld-Verfügbarkeit); Fallback-Strategie ist in PKG-16 dokumentiert.
- **B-NULL-ARDUINO-STRING-01** *(neu 2026-04-17)*: Das konkrete Arduino-Core-Release muss daraufhin geprüft werden, ob `String::c_str()` unter fehlgeschlagenem Concat NULL oder einen leeren Buffer liefert. Defensiv-Guards in PKG-16 sind in beiden Fällen wirksam.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — Delta 2026-04-17 (Post-Log-Revalidate)

**Anlass:** Neue Log-Evidenz (Aktor-Command-Burst → OUTBOX ENOMEM → 3x `[ERRTRAK] <null>` → Guru Meditation LoadProhibited Core 0). Diese Ausprägung fehlte im bisherigen Lagebild (§3 sagte „kein Crash-Muster im Fenster" — galt nur für den TLS-Reconnect-Loop-Test).

### Mutationen an TASK-PACKAGES

| PKG | Delta | Rolle | Abhängigkeit | BLOCKER |
|-----|-------|-------|--------------|---------|
| **PKG-05** | *Verschärft:* zusätzlich `mqtt_cfg.outbox_limit` verbindlich setzen (bislang nur `out_buffer_size` / `buffer_size`). | `esp32-dev` | — | **B-OUTBOX-LIMIT-API-01** |
| **PKG-16 (neu)** | Null-Safety Defensive an 5 identifizierten Hotspots (`error_tracker.cpp:256/268`, `publish_queue.cpp:65-66`, `intent_contract.cpp:747`, `mqtt_client.cpp:610/632`) + OUTBOX-Bound. Ziel: kein Reboot unter OUTBOX-Erschöpfung. | `esp32-dev` | verschärft PKG-05; parallel zu PKG-01/PKG-15 lieferbar | **B-OUTBOX-LIMIT-API-01**, **B-NULL-ARDUINO-STRING-01** |
| PKG-01 | Unverändert, aber Review-Kontext teilen mit PKG-16 (gleiche Datei `mqtt_client.cpp`). | `esp32-dev` | Review-nahe zu PKG-16 | — |
| PKG-04/PKG-15 | Unverändert. | `esp32-dev` | — | — |

### Post-Verify Reihenfolge (aktualisiert)

1. `esp32-dev`: **PKG-16 → PKG-04 → PKG-01 → PKG-15** — PKG-16 zuerst, weil Crash-Pfad; dann restliche Transport-/Callsite-Pakete.
2. parallel `mqtt-debug`: **PKG-02** unverändert.
3. optional `server-dev`: **PKG-03** unverändert (kein RC-Ersatz).

### Keine Änderung an

- MQTT-Payload-/LWT-Contract, Topic-Struktur (`system/intent_outcome`).
- Error-Codes `ERROR_MQTT_*` (3000-Band) und deren 60-s-Rate-Limit im ErrorTracker.
- Serverseitige Handler (`lwt_handler.py`, `heartbeat_handler.py`, `intent_outcome_handler.py`).

### Produkt-Implementierung

Weiterhin **nicht** durch den Orchestrator. Start erst nach Handover an `esp32-dev` auf `auto-debugger/work`.

---

## Delta 2026-04-19 — PKG-17 Heartbeat-Slimming Option 1

**Durchlauf:** `/verify-plan` gegen Repo-IST (2026-04-19)  
**Quelle:** `.claude/auftraege/auto-debugger/inbox/STEUER-heartbeat-slimming-option1-ea5484-2026-04-17.md`  
**Gate-Ergebnis:** **GO** (keine offenen Blocker)

### Geprüfte Pfade

- `El Trabajante/src/services/communication/mqtt_client.cpp` (`43`, `49-51`, `58-64`, `1267`, `1302`, `1321-1368`, `1370-1381`)
- `El Trabajante/src/tasks/publish_queue.h` (`21`)
- `El Trabajante/src/services/communication/mqtt_client.h` (`238`)
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (`1139-1176`)
- `El Servador/god_kaiser_server/src/schemas/esp.py` (`444-452`)
- `El Servador/god_kaiser_server/src/api/v1/esp.py` (`979-1099`)
- `El Frontend/src/stores/esp.ts` (`1181-1183`)
- `El Frontend/src/shared/stores/gpio.store.ts` (`192-239`)
- `El Frontend/src/composables/useGpioStatus.ts`
- `El Frontend/src/domain/esp/espHealth.ts` (`41`)
- `El Frontend/src/types/websocket-events.ts` (`97`)

### Verify-Befund

- Funktionsname korrigiert: Heartbeat-Builder ist `MQTTClient::publishHeartbeat(bool force)`.
- Server ist tolerant gegen fehlendes `gpio_status` (Guard-basierte Verarbeitung + Defaults im Schema).
- Frontend hat kein hartes Render-Coupling an `gpio_status` im Heartbeat-Pfad (defensive Guards/Pull-Fallbacks).
- `AUT-68` existiert bereits und wird nicht neu angelegt; stattdessen Delta-Kommentar mit den Mutationen.

## OUTPUT FÜR ORCHESTRATOR (auto-debugger) — Delta 2026-04-19 (PKG-17)

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-17 | Neuer Firmware-Slimming-Block mit exakten Repo-IST-Zeilen: `mqtt_client.cpp` (`43`, `49-51`, `58-64`, `1302`, `1321-1368`, `1370-1381`) + `publish_queue.h:21` (`2048 -> 1024`). |
| PKG-17 | Zusätzlicher Pflicht-Grep-Sweep auf tote `gpio_status`/Degrade-Referenzen im gesamten `El Trabajante/src`. |
| PKG-17 | Build-Gate: `cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e esp32_dev`. |
| PKG-17 | Runtime-DoD: `max_alloc >= 46000`, kein `errno=11`-Disconnect im 5-Min-Fenster, Heartbeat-Intervall unverändert 60s. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-17 | `esp32-dev` (Implementierung) |
| PKG-17 Verify | `server-dev` (Kompatibilität + Regressionstest) |
| PKG-17 Verify | `frontend-debug` (Konsumenten-Check + Build/Typecheck) |

### Cross-PKG-Abhängigkeiten

- PKG-17 kann parallel zu PKG-16-Review laufen, betrifft aber einen klar abgegrenzten Heartbeat-Pfad.
- Server-/Frontend-Verify blockieren den Firmware-Commit nicht, sind jedoch Pflicht für formale Abnahme.

### BLOCKER

- Keine offenen Blocker (`[]`).

### Linear-Delta (AUT-68)

- Ziel-Issue: `AUT-68`
- URL: `https://linear.app/autoone/issue/AUT-68/ea-15-heartbeat-slimming-and-heap-budget-reduktion-h6-root-cause-mqtt`
- Aktion: Kommentar mit Verify-Mutationen A1-A9 (Funktionsname, exakte Zeilen, entfernte AUT-58-Restreferenzen, 60s-Klarstellung, Follow-up-Hinweis `AUT-69 [EA-16]`).
- Label-Wunsch additiv: `ESP32`, `Improvement` (neben vorhandenem `Bug`).
