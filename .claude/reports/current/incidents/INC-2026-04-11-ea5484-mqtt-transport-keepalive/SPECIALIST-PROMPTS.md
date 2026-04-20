# SPECIALIST-PROMPTS — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Artefakte:** `INCIDENT-LAGEBILD.md`, `CORRELATION-MAP.md`, `TASK-PACKAGES.md`, `VERIFY-PLAN-REPORT.md`.

**Post-Verify Reihenfolge (verbindlich):**
1. `esp32-dev`: **PKG-04 → PKG-01 → PKG-15** (ACK-Callsite, dann Transportpfad, dann Counter-Konsistenz)  
2. parallel `mqtt-debug`: **PKG-02** (Broker/Alloy-Evidence)  
3. optional nach TM-Go `server-dev`: **PKG-03** (H2-Verstärker, kein RC-Ersatz)

---

## Rolle: esp32-dev — Agent `.claude/agents/esp32-dev.md`

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

**KONTEXT:** Incident INC-2026-04-11-ea5484-mqtt-transport-keepalive. Gerät **ESP_EA5484** (ESP32 Dev). Berichtskette: Schreib-Timeout (IDF) → Disconnect → 3014 → Broker `exceeded timeout`. **3014** ist korrekt (Nachfolge von INC-2026-04-10 PKG-01).

**AUFTRAG:** **PKG-04 + PKG-01 + PKG-15** — zuerst ACK-Persistenz-Semantik reparieren, dann Transport-Loop diagnostisch schärfen:
- PKG-04: Fix an der **Callsite** in `main.cpp` (nicht primär in `ConfigManager`): `online`-ACK darf ohne Statewechsel keine NVS-Dauerschreibserie erzeugen.
- PKG-01: Konfiguration (`keepalive`, Buffer, Task-Prio), Zusammenspiel **Communication-Task** / **Publish-Queue** (M3), parallele Last (Sensor + MQTT).  
- PKG-15: Counter-Konsistenz herstellen: Write-Timeout-Evidence (`errno=119`) muss in Reconnect-/Counter-Telemetrie sichtbar sein (oder explizit begründete Ausnahme loggen).
Keine `delay()` in MQTT-Hotpaths. LWT-Payload-Contract unverändert lassen.

**DATEIEN (Pflicht-Start):**

- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/services/communication/mqtt_client.h`
- `El Trabajante/src/tasks/communication_task.cpp`
- `El Trabajante/src/tasks/publish_queue.cpp` / `publish_queue.h`
- `El Trabajante/src/main.cpp` (Heartbeat-ACK Branch)
- `El Trabajante/src/services/config/config_manager.cpp` / `config_manager.h` (nur zur Verifikation der vorhandenen Dedup-Logik)

**TESTS:**

```text
cd "El Trabajante" && pio run -e esp32_dev
```

Zusätzlich Runtime-Verifikation:

```text
# über mehrere Heartbeats prüfen:
# kein wiederholtes "Device approval saved (approved=true, ts=...)" solange Approval-State unverändert bleibt
# bei reproduziertem Timeout-Fenster: write_timeout/tls_timeout Counter plausibel zur Fehlerursache
```

**OUTPUT:** Commit auf `auto-debugger/work`; Message mit Incident-ID.

**BLOCKER:** **B-SERIAL-01** / **B-NET-01** für RC-H1, **B-ERRTRAK-01** für 3014-Sichtbarkeit im Export.

---

## Rolle: mqtt-debug — Agent `.claude/agents/mqtt-debug.md`

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

**KONTEXT:** Mosquitto meldet `exceeded timeout` für `ESP_EA5484`; Keepalive-Clientseite 60 s laut Firmware-Config. Zusätzlich Monitoring-Pfad prüfen (`alloy` Profil), damit Zeitfenster/Korrelation nicht an Log-Ingestion scheitern.

**AUFTRAG:** **PKG-02** — `docker logs automationone-mqtt --since …` (UTC mit Host abgleichen), Einordnung `max_inflight_messages` / Broker-CPU / Docker-NAT (`172.19.0.1` im Bericht). Optional `make mqtt-sub`. Zusätzlich Alloy-Pfad plausibilisieren (Profile `monitoring`, Container `automationone-alloy`, Promtail/Log-Pipeline-Fehler). **Keine** MQTT-URIs mit Credentials in Reports.

**DATEIEN (Referenz):**

- `docker/mosquitto/mosquitto.conf`
- `docker-compose.yml` (Service `mqtt-broker` → Container-Name prüfen)

**BLOCKER:** **B-NET-01** bis Rohlogs vorliegen; **B-TLS-URI-01** (TLS/Plain-Class am Feldgerät) offen halten.

---

## Rolle: server-dev — Agent `.claude/agents/server-dev.md`

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

**KONTEXT:** Kalibrier-Burst über `POST …/measure` kann H2 **verstärken**, ersetzt aber keinen Transport-RC.

**AUFTRAG:** **PKG-03** nur nach **TM-Go** — Rate-Limit / Entschärfung in `sensors.py` um Route `/{esp_id}/{gpio}/measure` (IST **1650**). Tests mit pytest erweitern.

**DATEIEN:**

- `El Servador/god_kaiser_server/src/api/v1/sensors.py`

**TESTS:**

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --timeout=120
```

**BLOCKER:** Scope-Kollision mit Produkt-Priorität — mit TM abstimmen.

---

## Nachtrag 2026-04-17 — PKG-16 (Null-Safety Defensive + OUTBOX-Bound) — Rolle: `esp32-dev`

> **Anlass:** Neue Ausprägung im Serial-Log nach Aktor-Command-Burst: `OUTBOX: outbox_enqueue(46): Memory exhausted` → `MQTT_CLIENT: Writing failed: errno=12` → drei `[ERRTRAK] <null>` → **Guru Meditation LoadProhibited Core 0** (PC=0x4008c304, EXCVADDR=0x00000000, ELF-SHA `ca6522f1d6c2df4f`). Siehe `INCIDENT-LAGEBILD.md` Abschnitt „Eingebrachte Erkenntnisse" vom 2026-04-17 sowie `TASK-PACKAGES.md` **PKG-16**.
>
> **Skill-Bezug (verbindlich lesen):** `.claude/skills/esp32-development/SKILL.md` (Ordner, Build-Commands, Init-Reihenfolge, MQTT-Patterns — Backend-Variante **ESP-IDF `esp_mqtt_client`**), ergänzend `.claude/skills/mqtt-development/SKILL.md` für Topic-/QoS-Patterns. **`server-development`** ist für dieses Paket **nicht** relevant (kein Server-Code-Pfad betroffen).

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`** (`git branch --show-current` verifizieren).
- Commits nur hier; Message enthält `INC-2026-04-11-ea5484-mqtt-transport-keepalive` + `PKG-16`.

### Auftrag (präzise)
1. **Null-Safety Defensive** in den folgenden Hotspots (jeweils mit klarem Fallback-Literal, nicht stumm verwerfen):
   - `El Trabajante/src/error_handling/error_tracker.cpp` Zeile **256** und **268** — führe lokal `const char* safe_msg = (message != nullptr) ? message : "<oom-fallback>";` ein und nutze `safe_msg` in `strcmp` **und** `strncpy`. Analog den bisherigen Logger-Guard (`utils/logger.cpp:66`).
   - `El Trabajante/src/tasks/publish_queue.cpp` Zeile **65–66** — vor den `strlen`-Aufrufen `if (topic == nullptr || payload == nullptr) { LOG_W(PQ_TAG, "queuePublish: null topic/payload — drop"); return false; }`.
   - `El Trabajante/src/tasks/intent_contract.cpp` Zeile **747** — ersetze `strncpy(entry.reason, reason.c_str(), sizeof(entry.reason) - 1);` durch ein Defensiv-Muster mit Längenprüfung (`reason.length() > 0`) und expliziter Fallback-Konstante bei leerem Reason. Prüfe angrenzende `strncpy` (743, 745, 746) auf gleiche Robustheit — dort ist zwar eine `nullptr`-Prüfung aber keine `length==0`-Prüfung.
   - `El Trabajante/src/services/communication/mqtt_client.cpp` Zeile **610** — Aufruf ändern zu `esp_mqtt_client_publish(mqtt_client_, topic.c_str(), payload.c_str(), payload.length(), qos, 0);` (expliziter `len`). Zeile **632** — `String("ESP-IDF MQTT outbox full: ") + topic` durch `char buf[160]; snprintf(buf, sizeof(buf), "ESP-IDF MQTT outbox full: %s", topic.c_str());` ersetzen und `buf` an `publishIntentOutcome(... reason = String(buf) ...)` übergeben; damit wird die OOM-anfällige String-Concat umgangen.
2. **OUTBOX-Bound (verschärft PKG-05)** in `mqtt_client.cpp` **310–338**:
   - `mqtt_cfg.outbox_limit = <N>` setzen. Dimensionierung: Empirie aus dem Log → bei `out_buffer_size = 8192` und `free_heap_min = 40820` ist eine harte obere Schranke bei ca. **32 KB Outbox** sinnvoll (entspricht ~4 Out-Buffers). Endgültiger Wert: im Commit-Kommentar begründen.
   - Falls das lokale IDF-Tree `outbox_limit` nicht kennt (Compile-Fehler): `#ifdef` / Build-Flag-Fallback mit `#warning "outbox_limit not supported — relying on out_buffer_size only"`.

### Dateien (Pflicht-Start, strikt limitiert)
- `El Trabajante/src/error_handling/error_tracker.cpp`
- `El Trabajante/src/tasks/publish_queue.cpp`
- `El Trabajante/src/tasks/intent_contract.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp`

### Nicht anfassen
- `main.cpp` (außer der bereits dokumentierten PKG-04-Callsite — separater PR).
- LWT-Payload-Contract (`system_event_contract.py` serverseitig), Intent-Outcome-Topic-Struktur.
- SafetyController-/Aktor-Logik. `safety_task.cpp` nur lesen.
- Error-Codes (`models/error_codes.h`). Rate-Limit-Fenster des ErrorTrackers bleibt 60 s.

### Tests (verbindlich)
```text
cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e esp32_dev
~/.platformio/penv/Scripts/pio.exe test -e native -vvv
```

Zusätzlich Runtime-Verifikation am ESP_EA5484:
```text
# Aktor-Burst-Repro: mehrfach ON/OFF auf GPIO 25 im Abstand <2s
# WLAN kurz (10-30 s) blocken, danach restoren
# Erwartet im Serial: kein "Guru Meditation", kein Reboot;
#   stattdessen OFFLINE_ACTIVE oder geordneter Reconnect + Intent-Outcome PUBLISH_OUTBOX_FULL.
# Erwartet in Logs: KEINE "[ERRTRAK] <null>" Zeilen mehr.
```

### Akzeptanz
- Build grün, Native-Tests grün.
- 10-Minuten-Stresslauf: 0 Treffer `Guru Meditation`; `[ERRTRAK] <null>` verschwindet zugunsten lesbarer Fallback-Message.
- MQTT-Payload-/LWT-Contract unverändert (diff-review gegen `.claude/reference/api/MQTT_TOPICS.md`).
- Commit auf `auto-debugger/work` mit Incident-ID + PKG-16.

### BLOCKER
- **B-OUTBOX-LIMIT-API-01** — wenn das eingesetzte IDF-Release `outbox_limit` nicht exponiert: dokumentieren, TM informieren, Alternativ-Strategie (bound auf App-Publish-Queue + aggressivere Shed-Watermark) im Commit begründen.
- **B-NULL-ARDUINO-STRING-01** — Verhalten von `String::c_str()` unter fehlgeschlagenem Concat ist toolchain-abhängig: Wenn es im konkreten Kernel **nie** NULL liefert, sondern ein leeres `""`, bleibt der Crash-Kandidat bestehen (Null-Buffer intern). Defensiv-Guard **trotzdem** einziehen — schadet nicht, schließt das Fenster.

---

## Nachtrag 2026-04-19 — PKG-17 (Heartbeat-Slimming Option 1)

**Post-Verify Reihenfolge (Update):**
1. `esp32-dev`: PKG-17 implementieren (Firmware-Slimming, ein Commit auf `auto-debugger/work`)
2. parallel `server-dev`: Kompatibilitäts-Verify + Regression-Test ohne `gpio_status`
3. parallel `frontend-debug`: Konsumenten-Verify + Build/Typecheck
4. anschließend Live-Verify auf EA5484 (5-Min-Fenster) und Delta-Kommentar auf AUT-68

### Rolle: esp32-dev — PKG-17 Implementierung

#### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

**Auftrag (Repo-IST, Verify 2026-04-19):**
- Funktion ist `MQTTClient::publishHeartbeat(bool force)` (nicht `sendHeartbeat`).
- Entfernen:
  - `mqtt_client.cpp:43` (`g_heartbeat_payload_degraded_count`)
  - `mqtt_client.cpp:49-51` (`g_last_gpio_status_*` Cache-Globals)
  - `mqtt_client.cpp:58-64` (`HB_HEAP_DEGRADE_BYTES`, `HB_ALLOC_DEGRADE_BYTES`)
  - `mqtt_client.cpp:1321-1368` (gpio_status-Assembly + Fallback + Warn-Log)
  - `mqtt_client.cpp:1370-1381` (Payload-Append inkl. `payload_degraded`, `degraded_fields`, `heartbeat_degraded_count`)
- Ändern:
  - `mqtt_client.cpp:1302` `payload.reserve(1900)` → `payload.reserve(640)`
  - `publish_queue.h:21` `PUBLISH_PAYLOAD_MAX_LEN 2048 → 1024` + Kommentar aktualisieren.

**Pflicht-Checks:**
```text
rg "gpio_status|g_last_gpio_status|g_heartbeat_payload_degraded_count|HB_HEAP_DEGRADE_BYTES|HB_ALLOC_DEGRADE_BYTES" "El Trabajante/src"
cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e esp32_dev
```

**DoD Runtime (EA5484, 5 Minuten):**
- `max_alloc >= 46000`
- kein `errno=11`-Disconnect
- kein `MQTT_EVENT_DISCONNECTED` im Normalbetrieb-Fenster
- Heartbeat-Intervall bleibt 60 s (`mqtt_client.h:238`, unverändert)

### Rolle: server-dev — Verify-Block (kompatibel ohne gpio_status)

#### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

**Auftrag:**
- Verify auf vorhandene Toleranz:
  - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:1139-1176`
  - `El Servador/god_kaiser_server/src/schemas/esp.py:444-452`
- Regressionstest ergänzen:
  - `tests/integration/test_heartbeat_handler.py::test_heartbeat_without_gpio_fields_accepted`
- Sicherstellen: Kein Breaking-Change an WS-Event/ESP-Schema.

**Tests:**
```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/integration/test_heartbeat_handler.py -k "not soft_deleted_device" -q
cd "El Servador/god_kaiser_server" && poetry run ruff check src/mqtt/handlers/heartbeat_handler.py
```

### Rolle: frontend-debug — Verify-Block (keine Render-Kopplung)

#### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

**Auftrag:**
- Verify der bekannten Fundstellen:
  - `El Frontend/src/stores/esp.ts`
  - `El Frontend/src/shared/stores/gpio.store.ts`
  - `El Frontend/src/composables/useGpioStatus.ts`
  - `El Frontend/src/domain/esp/espHealth.ts`
  - `El Frontend/src/types/websocket-events.ts`
- HardwareView-Manuallauf nach Reflash: keine Console-Errors, GPIO-Ansicht via REST-Pull stabil.

**Checks:**
```text
cd "El Frontend" && npm run build
cd "El Frontend" && npx vue-tsc --noEmit
```
