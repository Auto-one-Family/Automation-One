# TASK-PACKAGES — Nachweis Messkette (operativ, kein Produktcode)

**Run-ID:** `feuchte-wizard-nachweis-messkette-2026-04-10`  
**Branch für Folge-Fixes:** `auto-debugger/work` (dieser Lauf nur Evidenz/Doku).  

Alle Pakete sind **manuell** von Robin/Debug-Agenten mit Read-only-Log-Analyse ausführbar. Kein Commit aus diesem Dokument erforderlich.

---

## PKG-01 — Reproduktion (serialisierte Klicks)

- **Owner:** Operator / `frontend-debug` (Beobachtung)  
- **Ziel:** Eine ESP-ID, ein GPIO; Wizard Phase Punkt 1 oder 2; **nacheinander** „Messung starten“ (2–3 Klicks, Pause 2–5 s).  
- **Akzeptanz:** Pro Klick ein `request_id` aus Network-Tab (REST-Response zu `POST …/measure`) notiert; keine parallelen Browser-Tabs auf denselben Wizard.  
- **Verify:** Screenshot/Notiz mit Zeitstempel + `request_id`-Liste.  
- **Abhängigkeiten:** Stack läuft (Backend + MQTT + ESP online).

---

## PKG-02 — Server-Logs (`request_id`, CalibrationResponseHandler)

- **Owner:** `server-debug`  
- **Ziel:** Logzeilen zu `Measurement triggered` und `CalibrationResponseHandler` zur gleichen Zeitfenster wie PKG-01.  
- **Pfade:** Host: `logs/server/god_kaiser.log` (JSON); alternativ `docker compose logs el-servador` / Loki — siehe `.claude/reference/debugging/LOG_LOCATIONS.md` §2.  
- **Suchstrings (repo-verifiziert):**  
  - `Measurement triggered for` + `request_id:` — `sensor_service.py`  
  - `CalibrationResponseHandler:` — `calibration_response_handler.py`  
- **Akzeptanz:** Mindestens eine Zeile pro Klick mit erkennbarer `request_id` oder erklärter Lücke (Log-Level/Format).  
- **Verify (Beispiel, Repo-Root):**  
  `rg "Measurement triggered|CalibrationResponseHandler" "logs/server/god_kaiser.log"`  
  Alternativ: `docker compose logs el-servador` (Zeitfenster filtern) — siehe `VERIFY-PLAN-REPORT.md`.

---

## PKG-03 — MQTT (command vs. response)

- **Owner:** `mqtt-debug`  
- **Ziel:** Für dieselbe `request_id` wie PKG-01/02 Reihenfolge **command** → **response** auf dem Sensor-Topic-Baum.  
- **Hinweis:** Mosquitto hat **keinen** Host-Bind-Mount unter `logs/mqtt/` — Broker-Logs: `docker compose logs mqtt-broker` oder Loki (`compose_service=mqtt-broker`), siehe `LOG_LOCATIONS.md` §6.  
- **Akzeptanz:** Payload-Ausschnitt mit `request_id`/`intent_id` in command **und** response; oder BLOCKER „Broker-Log nicht verfügbar“ mit Nachbedingung (Monitoring-Stack / `make mqtt-sub`).  
- **Verify:** `make mqtt-sub` (Repo-Root) laut Makefile **oder** dokumentierter `mosquitto_sub` mit gleichem Topic-Filter — siehe `.claude/reference/api/MQTT_TOPICS.md`.

---

## PKG-04 — WebSocket (Browser)

- **Owner:** `frontend-debug`  
- **Ziel:** In DevTools → WS: Events `calibration_measurement_received` / `calibration_measurement_failed` mit `data.request_id` / `data.intent_id` / Top-Level `correlation_id` — Abgleich mit PKG-01 `request_id`.  
- **Akzeptanz:** Pro Klick ein Event mit passender ID **oder** dokumentiertes Fehlen (Timeout).  
- **Verify:** Export/Copy der WS-Frames oder kurze Tabelle in `CORRELATION-MAP.md` ergänzt.

---

## PKG-05 — DB optional (`sensor_data`)

- **Owner:** `db-inspector`  
- **Ziel:** Letzte Zeilen zu `esp_id`/GPIO in Tabelle **`sensor_data`** — Timestamp vs. manueller Trigger.  
- **Vorbedingung:** Lokale/dev-DB nur; keine Produktions-DB.  
- **Akzeptanz:** SQL-Abfrage + eine Beispielzeile oder BLOCKER „DB nicht erreichbar“.  
- **Verify:** Read-only Query; keine Schema-Änderung.

---

## Cross-PKG-Reihenfolge

`PKG-01` → `PKG-02`–`PKG-04` parallel möglich nach erstem Klick-Datensatz → `PKG-05` optional.

---

## Nach Verify eingearbeitete Deltas (Kurz)

- Log-Pfad **`logs/server/god_kaiser.log`** (nicht nur `god_kaiser.log` ohne Verzeichnis).  
- Agent-Name **`server-debug`** (nicht „server-debugger“).  
- Backend: **kein** `get_latest_reading`-Fallback bei fehlendem `raw` im aktuellen Handler — Messpunkt BERICHT §8.2 ist **semantisch** an `calibration_measurement_failed` zu knüpfen.  
- Frontend: Korrelation **ist** im Code — Nachweis dient **Regression** und **Deployment-Abgleich**.
