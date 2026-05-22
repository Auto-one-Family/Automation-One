# SPECIALIST-PROMPTS — Nachweis Messkette (Read-only / Operator)

**Run-Ordner:** `.claude/reports/current/auto-debugger-runs/feuchte-wizard-nachweis-messkette-2026-04-10/`  
**Artefakte:** `EVIDENZ-LAGEBILD.md`, `CORRELATION-MAP.md`, `TASK-PACKAGES.md`  

---

## Block A — `server-debug` (PKG-02)

### Scope
Server-JSON-Logs zu manueller Messung: Zeilen `Measurement triggered` und `CalibrationResponseHandler` mit Bezug zur `request_id` aus dem Wizard-Klick.

### IST / SOLL
- IST: Logdatei gemäß `LOG_LOCATIONS.md` (Host `logs/server/god_kaiser.log`).  
- SOLL: Mindestens eine korrelierte Zeile pro Repro-Klick oder begründete Lücke.

### Git (Pflicht)
- Arbeitsbranch für **Folge-Fixes:** **auto-debugger/work**. Dieser Nachweis: **keine** Repo-Schreiboperation durch server-debug erforderlich; wenn doch Code: vor Änderungen `git checkout auto-debugger/work` und `git branch --show-current` verifizieren. Kein Commit auf `master`; kein `git push --force`.

### Pattern-Reuse (Pflicht)
- Logger-Namen und Strings aus `sensor_service.py` und `calibration_response_handler.py` — keine erfundenen Meldungen.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Fokus **Kalibrier-Messkette** (`calibration_measurement_*`), nicht ISA-Inbox. `request_id` nicht mit HTTP `X-Request-ID` verwechseln, außer explizit im selben Logfeld.

### Verify-Befehl (Pflicht)
- Nach Auswertung: `rg "Measurement triggered|CalibrationResponseHandler" "logs/server/god_kaiser.log"` (Repo-Root) oder gleichwertiger Filter auf Docker-Logs `el-servador` — Exit-Code 0 wenn Treffer erwartet.

### Fehler-Register (Pflicht bei Code)
- Nicht anwendbar im reinen Log-Nachweis; bei späterem Fix siehe `FEHLER-REGISTER.md` im Run-Ordner.

---

## Block B — `mqtt-debug` (PKG-03)

### Scope
MQTT command- und response-Payloads für dieselbe Sensor-Messung; `request_id`/`intent_id` sichtbar.

### Git (Pflicht)
- Wie Block A.

### Pattern-Reuse (Pflicht)
- Topic-Baum aus `.claude/reference/api/MQTT_TOPICS.md`; keine manuell erfundenen Topic-Strings.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Broker-Logs ≠ Server-Datei; siehe `LOG_LOCATIONS.md` §6 (docker logs / Loki).

### Verify-Befehl (Pflicht)
- `make mqtt-sub` aus Repo-Root **oder** dokumentiertes `mosquitto_sub` — nach Vorgabe Makefile; erfolgreiche Subscription = Exit 0.

### Fehler-Register (Pflicht bei Code)
- Wie Block A.

---

## Block C — `frontend-debug` (PKG-01, PKG-04)

### Scope
Browser: REST-Response `request_id` vom Measure-Endpoint; WebSocket-Frames `calibration_measurement_received` / `_failed`.

### Git (Pflicht)
- Wie Block A.

### Pattern-Reuse (Pflicht)
- `useCalibrationWizard.ts` — `measurementCorrelationCandidates` / `matchesActiveMeasurementRequest` als Referenz für erwartete IDs.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Wizard nutzt **dediziertes** WS-Subscription (nicht nur globalen esp-Store); keine Vermischung mit generischen `error_event`-Toasts als Root-Cause.

### Verify-Befehl (Pflicht)
- `cd "El Frontend" && npx vue-tsc --noEmit` nur wenn Frontend-Code geändert wurde; im Nachweis: manuelle Checkliste in `CORRELATION-MAP.md` ausgefüllt.

### Fehler-Register (Pflicht bei Code)
- Wie Block A.

---

## Block D — `db-inspector` (PKG-05)

### Scope
Read-only: letzte Einträge `sensor_data` für betroffenes `esp_id`/GPIO.

### Git (Pflicht)
- Wie Block A.

### Pattern-Reuse (Pflicht)
- Model `SensorData` / Repository-Patterns aus bestehenden db-inspector-Workflows.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Nur Datenkonsistenz — keine Alert-Router-Logik.

### Verify-Befehl (Pflicht)
- Query dokumentiert; kein Schema-Drift ohne separates PKG.

### Fehler-Register (Pflicht bei Code)
- Wie Block A.

---

## Reihenfolge
1. PKG-01 (Operator)  
2. PKG-02 / PKG-03 / PKG-04 parallel  
3. PKG-05 optional  

**Blockiert:** nichts zwischen Debug-Blöcken; PKG-05 nur wenn DB erreichbar.
