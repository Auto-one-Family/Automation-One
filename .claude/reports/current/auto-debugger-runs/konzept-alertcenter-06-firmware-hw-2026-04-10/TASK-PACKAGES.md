# TASK-PACKAGES — STEUER 06 Firmware Alert/Error-Pfad & HW-Abnahme

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-konzept-alertcenter-06-firmware-alert-hw-2026-04-10.md`  
**run_id:** `konzept-alertcenter-06-firmware-hw-2026-04-10`  
**Modus:** `artefact_improvement`  
**Aktueller Git-Branch:** `auto-debugger/work` (Soll: `auto-debugger/work`) — Stand Orchestrator-Lauf 2026-04-10.

---

## Pattern-Scan (Pflicht, repo-verifiziert)

| Schicht | Nächstliegende Implementation | Symbole / Pfade |
|--------|-------------------------------|-----------------|
| Firmware | Error-Publish | `ErrorTracker::publishErrorToMqtt` → `TopicBuilder::buildSystemErrorTopic()` → `errorTrackerMqttCallback` in `main.cpp` |
| Firmware | Topic | `El Trabajante/src/utils/topic_builder.cpp` — `kaiser/{kaiser_id}/esp/{esp_id}/system/error` |
| Server | Ingest | `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py` — `ErrorEventHandler.handle_error_event`; Wildcard in `main.py`: `kaiser/+/esp/+/system/error` |
| Referenz | Topics | `.claude/reference/api/MQTT_TOPICS.md` — `system/error` QoS **1** (Doku) |

**Abgrenzung (Steuerdatei):** Keine Server-/Frontend-Implementierung in diesem Run — nur Lesen/Verweise. Timestamp-/Korrelations-Follow-ups → STEUER 02–05.

---

## PKG-01 — IST-Audit (String, Buffer, Server-Handler)

- **Owner:** esp32-dev (Lesen + Dokumentation); Querverifikation Server nur lesend.
- **Risiko:** niedrig (kein Code-Zwang).
- **IST (nach Repo-Lektüre):**
  - `error_tracker.cpp`: umfangreiche Nutzung von Arduino `String` (u. a. Throttle-Log, Payload-JSON, `getErrorHistory`). Projektregel `.cursor/rules/firmware.mdc`: kein Arduino `String` in **neuem/angepasstem** Code — hier **technische Schuld**, kein Build-Fehler.
  - `publishErrorToMqtt`: Topic über `TopicBuilder::buildSystemErrorTopic()`; Payload enthält `error_code`, `severity`, `category`, `message` (escaped), `context.esp_id`, `context.uptime_ms`, **`ts`** (Unix).
  - **Server-Kontrakt:** `error_handler.py` Docstring nennt `timestamp`; Laufzeit nutzt `payload.get("timestamp")` für Audit/WS — Firmware sendet **`ts`**, nicht `timestamp` → `esp_timestamp`/WS-`timestamp` können leer/0 sein (Observability-Lücke; Fix **nicht** in STEUER 06).
  - **QoS:** `errorTrackerMqttCallback` ruft `mqttClient.publish(..., 0)` auf — Referenz `MQTT_TOPICS.md` nennt QoS **1** für `system/error` (Abweichung Dokumentation ↔ Implementierung).
  - **Rate-Limit:** `shouldPublishError` nutzt `error_code % THROTTLE_SLOTS` (32 Slots) — Hash-Kollisionen möglich (selten, dokumentiert).
- **SOLL:** Audit-Bericht im Team; keine Dublette der Server-Logik im Firmware-Repo.
- **Akzeptanzkriterien:**
  - [ ] Befunde oben im Verify-Report und ggf. Konzept §5.4 querverlinkt.
  - [ ] Änderungen/Commits nur auf Branch `auto-debugger/work`.

---

## PKG-02 — Optionale minimale Firmware-Anpassung (nur bei Auftrag)

- **Owner:** esp32-dev
- **Risiko:** mittel (Heap/JSON-Payload, keine SafetyController-Änderungen).
- **SOLL:** Wenn TM Priorität setzt: Arduino-`String` in den für MQTT-Publish relevanten Pfaden reduzieren (z. B. feste Buffer + `snprintf`/`ArduinoJson`), **ohne** SafetyController; Tests/Mocks unter `test/mocks/` falls vorhanden.
- **Akzeptanzkriterien:**
  - [ ] `pio run -e seeed_xiao_esp32c3` Exit-Code 0 (verifiziert 2026-04-10 — bei erneuten Änderungen wiederholen).
  - [ ] Kein `delay()` in der Haupt-Loop; Watchdog unverändert.
  - [ ] Commits nur auf `auto-debugger/work`.

---

## PKG-03 — Hardware-Checkliste (Konzept §7.4)

- **Owner:** Robin / Hardware (Agent liefert nur Vorlage + BLOCKER-Text).
- **Risiko:** niedrig.
- **Vorlage (aus Konzept):**
  1. Testgerät: feste `esp_id` notieren (`AUTOONE_HW_TEST_ESP_ID` o. ä., kein Secret).
  2. Schritte: Flash/Build, MQTT-Connect, Fehler/Alert reproduzieren, Server-Log/WS mit `esp_id` + Zeitfenster prüfen.
  3. Abbruch: kein MQTT-ACK, Reboot-Loop, Safety greift nicht ein → **Stop**.
- **Akzeptanzkriterien (Steuerdatei done_criteria):**
  - [ ] **Entweder:** Kurzes HW-Protokoll im Run-Ordner (`HW-PROTOKOLL.md` o. ä.) mit `esp_id`, Schritten, MQTT-/Server-Trace — **oder**
  - [ ] **BLOCKER:** „HW nicht verfügbar“ im `VERIFY-PLAN-REPORT.md` mit messbarer Nachbedingung für spätere Abnahme.

**IST (Orchestrator):** Kein Referenz-ESP in dieser Session — **BLOCKER HW** siehe `VERIFY-PLAN-REPORT.md`.

---

## Verify-Befehl (Steuerdatei)

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
pio run -e seeed_xiao_esp32c3
```

**Ergebnis 2026-04-10:** SUCCESS (10,79 s).

---

## Nach Verify angepasst (Delta aus VERIFY-PLAN-REPORT)

- Env-Name `seeed_xiao_esp32c3` bestätigt (`platformio.ini` Zeile 1).
- Vollständige Pfade `error_handler.py` und `canonicalize_error_event` für Abgleich Dokumentation/Code dokumentiert.
- Cross-Layer `ts` vs. `timestamp` als Follow-up außerhalb STEUER-06 markiert.
