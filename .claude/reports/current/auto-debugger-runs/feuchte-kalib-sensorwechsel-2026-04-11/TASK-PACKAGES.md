# TASK-PACKAGES — ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11

**Nach verify-plan:** siehe `VERIFY-PLAN-REPORT.md` — Pfade und Tests dort gegengeprüft.

**Post-Verify (2026-04-10):** Alle referenzierten Codepfade verifiziert. **Zusatz-Akzeptanz:** Vor **PKG-CAL-01** muss für **ESP_EA5484** das **Ziel-GPIO** (32 vs. 33) produktseitig festgelegt sein — Postgres zeigt **Sessions auf 32**, Telemetrie auf **32+33**, **`sensor_configs` ohne `moisture`**. Vitest-Zeile optional `npx vitest run` statt `--passWithNoTests`, wenn Tests für geänderte Komponenten vorliegen.

---

## PKG-HW-01 — Sensor-Delete und ESP-Config-Konsistenz absichern

**Titel:** DB-Delete → `send_config` → NVS/ESP-Verhalten; keine „toten“ Feuchte-Publisher ohne Config-Zeile

**Scope:** Server-Pipeline und Nachweise, ob nach Delete **alle** GPIOs, die das Gerät noch sendet, in der kombinierten Config fehlen oder ob Firmware weiter misst (NVS/Altlast).

**Pattern-Reuse:** `src/api/v1/sensors.py` `delete_sensor`; `ESPService.send_config`; optional Firmware `Config`-Verarbeiter (`El Trabajante`).

**Abhängigkeiten:** Keine harte Abhängigkeit zu PKG-CAL; Erkenntnis aus EA5484: **Telemetrie ohne moisture-Config** muss erklärt/entschärft werden, bevor Kalibrier-Fixes bewertet werden.

**Akzeptanzkriterien:**

1. Reproduzierbarer Ablauf dokumentiert: Sensor löschen → erwartete MQTT-Topics → DB-Zustand `sensor_configs`.
2. Wenn Gerät weiter Daten sendet: **klar** als Firmware/Operator-Thema oder Server-Gap markiert (kein Vermischen mit Kalibrier-Mathe).
3. Verify: relevante Integrationstests grün nach Änderung; manuell: ein Gerät im Testmodus.

**Verify-Befehle (IST-Repo):**

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/integration/test_calibration_session_routes.py -q --tb=short
cd "El Trabajante" && pio run -e esp32_dev
```

(Firmware-Verify: **ESP32 DevKit / WROOM-32** → `esp32_dev`. Seeed XIAO: `seeed_xiao_esp32c3`.)

---

## PKG-HW-02 — GPIO-Reuse / „PIN belegt“ / Frontend-State

**Titel:** Validierung und Store-Refresh nach `sensor_config_deleted` / neuer Config auf gleichem GPIO mit anderem `sensor_type`

**Scope:** Frontend HardwareView / SensorConfigPanel — kein paralleler „zweiter“ Flow ohne Migration (Pattern-Scan: `ESPConfigPanel.vue` GPIO-Belegung, Sensor-API-Clients).

**Pattern-Reuse:** `src/api/sensors.ts` (bzw. modulares `src/api/sensors`-Modul), Pinia `esp`-Store, WS-Handler für `sensor_config_deleted`.

**Abhängigkeiten:** Nach PKG-HW-01 oder parallel, wenn nur UI — Schnittstelle: REST `GET` Sensoren nach Delete muss GPIO frei zeigen.

**Akzeptanzkriterien:**

1. Kein falscher „PIN belegt“-Zustand nach erfolgreichem Delete (oder klare Fehlermeldung mit Request-ID).
2. `vue-tsc --noEmit` grün für geänderte Dateien.

**Verify:**

```text
cd "El Frontend" && npx vue-tsc --noEmit
cd "El Frontend" && npx vitest run --passWithNoTests
```

---

## PKG-CAL-01 — Feuchte-Kalibrierung: Session → Apply → `calibration_data` → Processor

**Titel:** Konsistenz `moisture_2point` / `derived` / `resolve_calibration_for_processor` für **ein** GPIO pro Gerät im Wizard

**Scope:** Server: Session-Finalize, Schreiben `sensor_configs.calibration_data`, Pi-Enhanced Pfad in `sensor_handler` / `process_reading`.

**Pattern-Reuse:** `services/calibration_payloads.py`; `sensor_service.process_reading`; `tests/integration/test_calibration_session_routes.py`.

**Abhängigkeiten:** Blockiert bis **klar ist**, welches **GPIO** auf EA5484 das „führende“ Feuchte-Gerät ist (32 vs. 33) — sonst Risiko, falsche Kurve zu fixen.

**Akzeptanzkriterien:**

1. Nach Apply enthält `calibration_data` nutzbare `derived`-Keys für MoistureProcessor (gemäß `resolve_calibration_for_processor`).
2. Keine doppelte Anwendung invertierter Kennlinie (Dry/Wet vertauscht) ohne Testabdeckung.

**Verify:**

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/integration/test_calibration_session_routes.py -q
cd "El Servador/god_kaiser_server" && poetry run ruff check src/services/calibration_payloads.py src/mqtt/handlers/sensor_handler.py
```

---

## PKG-CAL-02 — Stabilität: kontinuierlich vs. Wizard / Mutex / Rohwert

**Titel:** Oszillation 50–100 % bzw. extreme STDDEV bei EA5484 vs. 6B27C8 — Root-Cause nach HW-PKG

**Scope:** Abgleich `CalibrationResponseHandler` (kein DB-Fallback für `raw`), Scheduler, ggf. Firmware Messmodus-Mutex (siehe Steuer-Pakete `STEUER-feuchte-esp32-manual-measure-mutex`).

**Pattern-Reuse:** `calibration_response_handler.py`; Baseline-Bericht GPIO32/33; DB-Aggregate STDDEV als Regression-Metrik.

**Abhängigkeiten:** **Nach** PKG-HW-01/02, wenn Ursache „ohne Config“ oder „zwei GPIOs“ ist; sonst gezielte Firmware/Server-Kombi.

**Akzeptanzkriterien:**

1. Für Referenz-ESP: STDDEV(`processed_value`) im definierten Fenster unter Schwellwert ODER dokumentierter BLOCKER (Hardware).
2. Verify: pytest relevante Module; optional Hardware-Soak-Protokoll.

**Verify:**

```text
cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -q --timeout=120 -k "calibration or moisture" --maxfail=3
```

---

## Paketreihenfolge (Empfehlung)

1. **PKG-HW-01** zuerst: ohne klare Config-Telemetrie-Kohärenz ist PKG-CAL nicht verifizierbar.  
2. **PKG-HW-02** parallel möglich (UI), sobald Delete-Pfad stabil.  
3. **PKG-CAL-01** nach GPIO-Klarstellung.  
4. **PKG-CAL-02** als Feinjustierung / Regression.
