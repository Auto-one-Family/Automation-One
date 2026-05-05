---
run_mode: both
incident_id: INC-ESP32-SERIAL-LOGGING-2026-04-11
run_id: esp32-serial-logging-nvs-mqtt-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
konsolidierung_step: single
target_docs:
  - .claude/reports/current/incidents/INC-ESP32-SERIAL-LOGGING-2026-04-11/IST-ESP-MQTT-NVS-TRACEPOINTS.md
  - .claude/reports/current/incidents/INC-ESP32-SERIAL-LOGGING-2026-04-11/ESP-SERIAL-LOGGING-SOLL.md
scope: |
  **Ziel:** Serial-Logging auf dem **ESP32 (El Trabajante)** so gezielt verbessern, dass an den **entscheidenden**
  Stellen **nachvollziehbar** ist:
  1. **Was der ESP per MQTT empfängt** (Topic + **begrenzte** Payload-Vorschau, keine Secrets/keine vollen WiFi-Creds),
  2. **was tatsächlich in NVS geschrieben wird** (Namespace, Key-Intent, Erfolg/Fehlergrund — inkl. Mutex/Timeout vs. echter Flash-Fehler),
  3. **wie das Handling** zwischen Pfaden verzahnt ist (Heartbeat-ACK → `setDeviceApproved`, `/config` → Sensor-Sync,
     `StorageManager`-Transaktionen, Core-0 vs. Core-1 wo dokumentiert).

  **Phase 1 — Durchforsten (Pflicht, vor Log-Code):**
  - Vollständige **IST-Inventur** aller Einstiegspunkte: `main.cpp` (MQTT-Callback, Config-Pfade), `storage_manager.*`,
    `config_manager.*`, `sensor_manager.*` / Config-Apply nach MQTT, `ConfigResponseBuilder` / CFGRESP-Publish,
    Heartbeat-ACK-Block, ggf. `communication_task.*` wenn MQTT dort entkoppelt.
  - Ergebnis in **`IST-ESP-MQTT-NVS-TRACEPOINTS.md`**: Tabelle **Pfad | Datei | Funktion/Block | Task/Core | NVS ja/nein | heutige Logs | Lücke**.

  **Phase 2 — SOLL-Logging (konkret):**
  - Kurzes **`ESP-SERIAL-LOGGING-SOLL.md`**: Log-Level-Richtlinie (INFO vs. DEBUG), **Max-Länge** für Payload-Snippets
    (z. B. 128–256 Byte **truncated**, JSON nur wenn `LOG_LEVEL` es erlaubt), **einheitliches Präfix** (z. B. `[CFGIN]`,
    `[NVS]`, `[MQTTIN]`) zur grep-freundlichen Filterung auf dem Monitor.
  - **Implementierung** in Firmware: nur **hochsignalige** zusätzliche `LOG_*` / `esp_log` an den in Phase 1 priorisierten
    Punkten — **Closest:** bestehende `LOG_I`/`LOG_W`/`LOG_E` aus `logger.h`, keine parallele Logger-Infrastruktur.

  **Technische Disziplin (verbindlich):**
  - **Kein** `delay()` in MQTT-/Hot-Path; **keine** neuen großen `Arduino::String`-Ketten — Payload-Vorschau über
    **feste Puffer** (`char buf[N]`, `snprintf`, begrenzte Felder) oder bestehende Logger-Hilfen.
  - Keine Voll-Dumps von Config-JSON in **INFO** (Flash/Serial-Last, Sicherheit).
  - Korrelation: wo `correlation_id` im Payload existiert, **ein** Log-Feld ausgeben (String-Länge begrenzt).

  **Nacharbeit:** Nach Abschluss dieser Steuerdatei den **Implementierungsplan-Steuer** ausführen
  (`STEUER-impl-plan-esp32-logging-nvs-trace-2026-04-11.md`) — dort werden die **finalen** Log-Orte tabellarisch
  festgeschrieben; Abweichungen zwischen STEUER-1-Code und Plan sind im Plan zu begründen.

  **Git:** Nur Branch `auto-debugger/work`; kein Commit auf `master`.
forbidden: |
  Keine Klartext-Secrets (WiFi-Passwort, MQTT-Pass, JWT) in Logs.
  Keine unbegrenzten Payload-Dumps auf Serial (INFO/DEBUG-Limits einhalten).
  Kein Deaktivieren des Watchdogs; kein blockierendes Logging in ISR.
  Keine Änderung am MQTT-Protokoll/Topic-Schema nur für Logging.
  Keine Doku-Flut außerhalb der `target_docs`-Pfade dieser Steuerdatei.
done_criteria: |
  `IST-ESP-MQTT-NVS-TRACEPOINTS.md` und `ESP-SERIAL-LOGGING-SOLL.md` existieren und sind **repo-verifiziert**
  (jede Zeile „heutige Logs / Lücke“ mit mindestens einem `Grep`/`Read`-Beleg).

  Mindestens **5** neue oder verschärfte Log-Stellen in `El Trabajante/src/` (kombiniert), die mindestens eines abdecken:
  (a) MQTT-Eingang vor Dispatch, (b) NVS `beginTransaction`/`beginNamespace` Erfolg/Timeout mit **Dauer** oder **Owner-Hint**,
  (c) Config-Sensor-Schleife pro GPIO/Typ **kurz**, (d) Heartbeat-ACK vor/nach `setDeviceApproved`, (e) ConfigResponse
  **success/fail** mit Zähler.

  `pio run -e esp32_dev` Exit 0 nach Änderungen.

  Verweis im `ESP-SERIAL-LOGGING-SOLL.md` auf den **Folge-Steuer**-Implementierungsplan (Pfad unten).
---

# STEUER — ESP32 Serial-Logging (MQTT-Empfang · NVS · Handling)

**Kurz-ID:** `STEUER-esp32-serial-logging-nvs-mqtt`  
**Datum:** 2026-04-11  
**Bezug:** Operative Nachverfolgbarkeit für NVS-Kontention, Config-Push und Heartbeat; ergänzt
`STEUER-nvs-config-konsistenz-server-esp-frontend-2026-04-11.md` (Firmware-Teil).

## Aktivierung

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-esp32-serial-logging-nvs-mqtt-2026-04-11.md
```

Vorher: `git checkout auto-debugger/work`

## Folge-Steuer (Pflicht für „wo genau die Logs hin“)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-esp32-logging-nvs-trace-2026-04-11.md
```

## Evidence-Ordner

`.claude/reports/current/incidents/INC-ESP32-SERIAL-LOGGING-2026-04-11/` (siehe `target_docs`)

---

*Ende STEUER*
