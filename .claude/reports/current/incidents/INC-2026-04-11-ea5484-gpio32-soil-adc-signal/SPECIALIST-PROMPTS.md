# SPECIALIST-PROMPTS — INC-2026-04-11-ea5484-gpio32-soil-adc-signal

**Kontext:** GPIO 32 Bodenfeuchte `ESP_EA5484`, ADC-Rails 4095, Rohwert-Sprünge — siehe `INCIDENT-LAGEBILD.md`, `CORRELATION-MAP.md`, `VERIFY-PLAN-REPORT.md`.

---

## Git (Pflicht) — für alle folgenden Blöcke

- Arbeitsbranch: **`auto-debugger/work`**.  
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.  
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

---

## Block A — `esp32-debug` (Read-only)

**KONTEXT:** Serial zeigt `ADC rail on GPIO 32: raw=4095` bei manueller Messung.  
**AUFTRAG:** Querschnitt Firmware-Pfad ADC → MQTT-Payload-Quality; **keine** Codeänderung.  
**DATEIEN:**

- `El Trabajante/src/services/sensor/sensor_manager.cpp` (Zeilenbereich ca. 987–991, 1503–1550)  
- `El Trabajante/src/services/sensor/sensor_manager.h` (Kommentar ADC-Validation)  
- Optional: `El Trabajante/src/services/communication/mqtt_client.cpp` (Disconnect/Timeout-Kontext laut Bericht)

**OUTPUT:** Kurzreport: wann `validateAdcReading` feuert, welche `quality` der ESP mitsendet, Kollision mit `delay()` nur im DS18B20-Pfad (Referenz für Regel-Review).

**REGELN:** Read-only.

---

## Block B — `server-debug` (Read-only)

**KONTEXT:** Server mappt Roh-ADC linear auf %; `quality` poor an Rändern laut `MoistureSensorProcessor`.  
**AUFTRAG:** In `sensor_handler.py` den Pfad für `moisture` + `raw_mode` nachvollziehen; Schnittstelle zu Kalibrierung (`calibration_service` / DB-Config) benennen.  
**DATEIEN:**

- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`  
- `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py`  
- `El Servador/god_kaiser_server/src/mqtt/handlers/calibration_response_handler.py` (nur Einordnung)

**OUTPUT:** 5–10 Zeilen: „Rohinstabilität wird erwartungsgemäß in %-Sprünge übersetzt“ mit Code-Stichworten.

**REGELN:** Read-only.

---

## Block C — `db-inspector` (optional, PKG-05)

**AUFTRAG:** Read-only Stichprobe `sensor_configs` für `ESP_EA5484`, GPIO 32 — `linear_2point`, dry/wet Rohwerte.  
**REGELN:** Keine Secrets in Markdown; keine destruktiven SQL.

---

## Block D — `esp32-dev` (nach PKG-01, PKG-02)

**AUFTRAG:** Falls HW gate „OK“: evaluiere **nicht-blockierende** Mehrfachabtastung für `readRawAnalog`-Pfad (Design-Only oder Implementierung gemäß `TASK-PACKAGES.md`).  
**TESTS:** `cd "El Trabajante" && pio run -e esp32_dev` (oder passendes `[env:…]` aus `platformio.ini`)  
**Schnittstelle:** Nach PKG-01-Ergebnis; blockiert bis HW-Protokoll oder BLOCKER-Dokumentation.

---

## Block E — `server-dev` (nach PKG-01, PKG-03)

**AUFTRAG:** Optional Rate-Limit / Entlastung für `POST /api/v1/sensors/{esp_id}/{gpio}/measure` gemäß `TASK-PACKAGES.md`.  
**TESTS:** `cd "El Servador/god_kaiser_server" && poetry run pytest`  
**Schnittstelle:** Unabhängig von PKG-02, aber **nach** Klärung ob MQTT-Burst akzeptiert wird (Produktentscheid).

---

## Rollen-Reihenfolge (Empfehlung)

1. **Robin:** PKG-01 HW.  
2. Parallel Read-only: **Block A** + **Block B** (falls noch Lücken).  
3. Optional **Block C**.  
4. Wenn PKG-01 grün oder BLOCKER dokumentiert: **Block D** und/oder **Block E** gemäß Priorität.
