# VERIFY-PLAN-REPORT — konzept-alertcenter-06-firmware-hw-2026-04-10

**Gate:** `/verify-plan` gegen `TASK-PACKAGES.md` (STEUER 06) + Repo-IST  
**Datum:** 2026-04-10

---

## /verify-plan Ergebnis

**Plan:** Firmware-IST-Audit Error/Alert-MQTT-Pfad, optional String-Refactor, HW-Checkliste; Verify `pio run -e seeed_xiao_esp32c3`.

**Geprüft:** 8+ Pfade, 1 Dev-Rolle (esp32-dev), 1 MQTT-Topic-Pattern, 1 Build-Env

### Bestätigt

- `El Trabajante/platformio.ini` enthält Environment **`[env:seeed_xiao_esp32c3]`** — Steuer-Verify-Befehl gültig.
- `TopicBuilder::buildSystemErrorTopic()` erzeugt `kaiser/{kaiser_id}/esp/{esp_id}/system/error` — konsistent mit `.claude/reference/api/MQTT_TOPICS.md` und Server-`TopicBuilder.parse_system_error_topic`.
- `ErrorTracker::publishErrorToMqtt` nutzt TopicBuilder (kein manueller Topic-String im Publish-Pfad).
- `main.cpp` registriert `errorTracker.setMqttPublishCallback(errorTrackerMqttCallback, g_system_config.esp_id)` nach MQTT-Connect — Korrelation `esp_id` im Payload unter `context.esp_id`.
- **`pio run -e seeed_xiao_esp32c3`:** Exit-Code **0** (lokal ausgeführt, ~10,8 s).
- Server-Handler-Pfad existiert: `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py`.

### Korrekturen nötig (Plan/Doku vs. System)

**Payload-Feld `timestamp` vs. `ts`**

- Plan/Konzept nennt teils „Server-kompatibles“ JSON; Server-Docstring in `error_handler.py` zeigt `"timestamp"`.
- **IST Firmware:** JSON endet mit **`"ts"`** (Unix), nicht `timestamp`.
- **IST Server:** `payload.get("timestamp")` für Audit `esp_timestamp` und WS `serialize_error_event(..., timestamp=...)`.
- **Empfehlung:** Außerhalb STEUER 06 — serverseitig additiv `payload.get("timestamp", payload.get("ts"))` oder Firmware sendet zusätzlich `timestamp` (Breaking-Risiko gering wenn additiv). **Nicht** Teil dieses STEUER-Scopes.

**QoS system/error**

- Referenz: QoS **1** für `system/error`.
- **IST:** `errorTrackerMqttCallback` publiziert mit **QoS 0** (`main.cpp`).
- **Empfehlung:** Eigene Aufgabe (Firmware oder Konfiguration Publish-API), Abgleich mit MQTT-Dev; nicht Blocker für Build-Verifikation.

**Arduino `String` in `error_tracker.cpp`**

- Regelwerk: keine neuen Arduino-`String`-Patterns; **IST** weiterhin stark `String`-basiert.
- **Empfehlung:** PKG-02 optional / technische Schuld; kein automatischer Blocker für „Build grün“.

### Fehlende Vorbedingungen

- [ ] Referenz-Hardware mit notierter `esp_id` für Abnahmeprotokoll (Konzept §7.4 / Roadmap Phase 5).
- [ ] Optional: Broker + Server laufend für End-to-End-MQTT-Trace (für HW-Protokoll).

### Ergänzungen

- Throttle: Slot = `error_code % 32` — unterschiedliche Codes können denselben Slot teilen (seltene Drossel-Kollision).
- `error_event`-Kette (WS) ≠ NotificationRouter/Inbox — im Lagebild nicht vermischen (Konzept 5.3).

### Zusammenfassung für TM

Der Plan ist **ausführbar** für Audit und Firmware-Build. **Hardware-Abnahme** ist in dieser Session **nicht** erbracht → BLOCKER mit Nachbedingung. Cross-Layer-Timestamp-Thema sollte einem **Server-/Kontrakt-STEUER** (02–05) zugeordnet werden, nicht hier implementiert werden.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Kein Pfadwechsel. Test: Leseverifikation + obiger Payload-/QoS-Abgleich. HW-Gate: keine. |
| PKG-02 | Nur bei TM-Auftrag; Verify bleibt `pio run -e seeed_xiao_esp32c3`. Risiko: mittel. Keine SafetyController-Änderungen. |
| PKG-03 | HW-Gate: BLOCKER „kein Referenz-ESP in Session“ — Nachbedingung: `HW-PROTOKOLL.md` mit esp_id + MQTT-Trace wenn Hardware verfügbar. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-01 | esp32-dev (Audit); optional server-dev nur **lesend** zur Bestätigung `ts`/`timestamp` |
| PKG-02 | esp32-dev |
| PKG-03 | Operator / Robin (Hardware), nicht automatisierbar |

### Cross-PKG-Abhängigkeiten

- PKG-02 → PKG-01: Audit sollte vor größeren Refactors abgeschlossen sein.
- Timestamp-/QoS-Fix an Server/MQTT → **blockiert nicht** PKG-01/02, aber sollte vor „Observability fertig“ mit STEUER 05 abgestimmt werden.

### BLOCKER

- **HW-Abnahme:** Kein dokumentierter Hardware-Lauf in dieser Orchestrator-Session — messbare Nachbedingung: Wenn `AUTOONE_HW_TEST_ESP_ID` gesetzt und Stack läuft, einmal `system/error`-Publish triggern und Server-Log/WS-Eintrag mit passendem `esp_id` + Zeitfenster archivieren (`HW-PROTOKOLL.md` im Run-Ordner).

---

*Konsistent mit Chat-Block „OUTPUT FÜR ORCHESTRATOR (auto-debugger)“.*
