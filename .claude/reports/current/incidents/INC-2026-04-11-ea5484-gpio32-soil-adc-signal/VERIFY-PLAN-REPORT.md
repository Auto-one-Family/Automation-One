# VERIFY-PLAN-REPORT — INC-2026-04-11-ea5484-gpio32-soil-adc-signal

**Gate:** Skill `.claude/skills/verify-plan/SKILL.md` gegen `TASK-PACKAGES.md` (Rev. 0 → Rev. 1) und Steuer-/Berichts-Pfade.  
**Datum:** 2026-04-11  
**Gebundener Ordner:** `.claude/reports/current/incidents/INC-2026-04-11-ea5484-gpio32-soil-adc-signal/`

---

## /verify-plan Ergebnis (fachlich)

**Plan:** Incident-Pakete für GPIO-32-Bodenfeuchte (ADC-Rails, Server-Pipeline, HW-Gate).  
**Geprüft:** 8 Pfade, 5 Endpunkte/Module, 0 Docker-Lauf (nicht erforderlich für Pfad-Verify).

### Bestätigt

- `El Trabajante/src/services/sensor/sensor_manager.cpp` enthält `readRawAnalog()` und `validateAdcReading()` mit Log **`ADC rail on GPIO … raw=4095`** und Rückgabe **`suspect`** bei Rail.  
- `El Trabajante/src/services/communication/mqtt_client.cpp` existiert (Bericht §8 Transport).  
- `El Servador/god_kaiser_server/src/mqtt/handlers/calibration_response_handler.py` existiert.  
- `El Servador/god_kaiser_server/src/services/calibration_service.py` existiert.  
- `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py` — `MoistureSensorProcessor._assess_quality()` erklärt **poor** bei `<10 %` oder `>95 %` (passt zu Bericht-Beispielen 0 % / 100 %).  
- Mess-API: `El Servador/god_kaiser_server/src/api/v1/sensors.py` — `POST "/{esp_id}/{gpio}/measure"` unter Router **`prefix="/v1/sensors"`** → **`POST /api/v1/sensors/{esp_id}/{gpio}/measure`**.  
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` vorhanden (Feuchte-Ingest).

### Korrekturen (in TASK-PACKAGES Rev. 1 eingearbeitet)

| Kategorie | Plan sagte / Bericht sagte | System sagt |
|-----------|----------------------------|---------------|
| PlatformIO-Env | `AGENTS.md` nennt vereinfacht `pio run -e seeed` | In `El Trabajante/platformio.ini`: u. a. **`esp32_dev`**, **`seeed_xiao_esp32c3`** — kein Env `seeed`. |
| REST-Referenz | Bericht nennt Mess-API knapp `POST …/sensors/{esp}/{gpio}/measure` | **Korrekt** mit Prefix: **`/api/v1/sensors/{esp_id}/{gpio}/measure`**. |
| REST_ENDPOINTS.md | Implizit vollständig | Tabelle listet u. a. `/sensors/{sensor_id}/trigger`, **nicht** den esp/gpio/measure-Pfad → **PKG-04** (Doku-Lücke). |
| Median-Sampling | Externes IST/SOLL-Dokument erwähnt Median über mehrere Samples | **`sensor_manager.cpp`:** analoger Pfad = **ein** `analogRead` — kein Median-Loop im aktuellen Code. PKG-02 formuliert Mehrfachabtastung als **neue** Option, nicht als bestehende Implementierung. |

### Fehlende Vorbedingungen

- [ ] Roh-Server- und Serial-Logs mit **echten Timestamps** und optional `X-Request-ID` für strikte HTTP↔MQTT-Korrelation.  
- [ ] Multimeter/Oszilloskop am GPIO-32-Pfad für PKG-01.

### Zusammenfassung für TM

Der Incident-Plan ist **ausführbar**. Kritische Korrektur: **Referenz-REST** und externe Doku nicht über „Median schon in Firmware“ irreführen — Repo nutzt **Single-Sample** `analogRead`. HW-Gate PKG-01 bleibt **BLOCKER-Vorprüfung** für sinnvolle Firmware-Glättung.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta

| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Keine Pfadänderung — **HW-Gate** zwingend zuerst; Evidence-Template ergänzt (Messprotokoll). |
| PKG-02 | Test: `cd "El Trabajante" && pio run -e esp32_dev` (oder `seeed_xiao_esp32c3` je Board); **nicht** `-e seeed` (existiert nicht in `platformio.ini`). **Kein** Anspruch auf bereits existierenden Median in `sensor_manager.cpp` — verworfen: Annahme „9 Samples schon live“. |
| PKG-03 | Test: `cd "El Servador/god_kaiser_server" && poetry run pytest` (Zieltests bei Implementierung ergänzen). |
| PKG-04 | Delta: nur `.claude/reference/api/REST_ENDPOINTS.md` — **`POST /api/v1/sensors/{esp_id}/{gpio}/measure`** ergänzen. |
| PKG-05 | Optional `db-inspector`; keine Secrets in SQL-Beispielen. |

### PKG → empfohlene Dev-Rolle

| PKG | Rolle |
|-----|--------|
| PKG-01 | — (Betrieb/HW) |
| PKG-02 | esp32-dev |
| PKG-03 | server-dev |
| PKG-04 | agent-manager oder Robin (Doku) |
| PKG-05 | db-inspector |

### Cross-PKG-Abhängigkeiten

- PKG-02 → PKG-01: Firmware-Glättung erst nach HW-Nachweis oder dokumentiertem BLOCKER.  
- PKG-03 → PKG-01: Rate-Limit ist komplementär, ersetzt keine HW-Behebung.  
- PKG-04 → kein Blocker für Produktfix.

### BLOCKER

- **4095 / offener ADC-Pfad** bleibt bis HW-Nachweis (PKG-01) **Risiko für jedes Software-Glättungs-Paket** — kann nur Symptome mindern.  
- **Keine vollständige Log-CID-Korrelation** im Repo-Input — optional nachziehen mit exportierten Logs.
