# Implementierungsplan PKG-CAL-02 — Stabilität (kontinuierlich vs. Wizard), Mutex, Rohwert-Kette

**Datum:** 2026-04-11  
**Bezug:** Paket **PKG-CAL-02** aus `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/TASK-PACKAGES.md` (und Spiegel unter `auto-debugger-runs/feuchte-kalib-sensorwechsel-2026-04-11/`).  
**Arbeitsbranch (normativ):** `auto-debugger/work` — keine Commits auf `master`.  
**Quellenberichte:** `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`, `docs/analysen/BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md`.

---

## 1. Vorbedingung (PKG-HW-01 / PKG-HW-02)

**Soll:** PKG-HW-01 und PKG-HW-02 sind **abgeschlossen** (Config-Telemetrie-Kohärenz nach Delete/Sync; GPIO-/Pin-Store konsistent), damit STDDEV-Regression nicht „Konfig-Drift“ misst.

**Ausnahme (dokumentieren, falls zutreffend):**

- **„Nur Server“:** Wenn die Evidenz zeigt, dass **kein** ESP-Firmware-Change nötig ist (reine Scheduler-/Session-Koexistenz, reine Ingest-Flags), explizit im PR/VERIFY-PLAN-REPORT begründen; Firmware-Schritte entfallen, `pio run` nur bei Touch.
- **„Nur Firmware“:** Wenn nach HW-PKG die DB/MQTT-Kette stabil ist und verbleibende Varianz **nur** Mess-Race (Mutex) ist, Server-Schritte auf Monitoring/Logs beschränken; trotzdem mindestens `pytest -k "calibration or moisture"` zur Nicht-Regression.

Ohne erfüllte Vorbedingung bleibt PKG-CAL-02 ein **BLOCKER** („nicht verifizierbar“), siehe Evidenz EA5484 ohne `moisture`-Config bei laufendem Ingest in den Berichten.

---

## 2. Hypothesen-Liste (je eine messbare Verifikation)

| ID | Hypothese | Messbare Verifikation (keine erfundenen Logs) |
|----|------------|--------------------------------------------------|
| **H-A** | Extreme STDDEV auf **EA5484 / GPIO 32** entsteht überwiegend aus **Ingest ohne `sensor_configs`-Zeile** (`processing_mode` ≠ `pi_enhanced`, Roh-ADC als Anzeige/DB-Wert) — nicht aus Wizard-Kalibrier-Mathematik. | **SQL:** Für festes `(esp_id, gpio, sensor_type='moisture')` über 2 h `STDDEV(processed_value)` **und** Stichprobe `processing_mode` aus `sensor_data` / Metadaten; **nach** HW-01: genau **ein** Kanal mit Config, STDDEV vergleichbar mit Referenz **oder** dokumentierter HW-BLOCKER. |
| **H-B** | **Zweitkanal** (z. B. parallel **32** und **33** auf demselben ESP) verwischt die Aussage „eine ruhige Kurve“, weil Server und Operator unterschiedliche Pfade mischen (Warnpfad 32 vs. Pi-Enhanced 33 laut Baseline-Bericht). | **SQL + Operativ:** Nach Entfernen/Deaktivieren des **nicht** konfigurierten Kanals (HW/UI/Firmware-Registry laut PKG-HW): erneutes STDDEV nur auf dem **konfigurierten** GPIO; erwartbar keine parallele `Sensor config not found`-Warnung für denselben `sensor_type` auf zweitem GPIO. |
| **H-C** | **Firmware:** Periodischer Messloop und **manuelle** Kalibrier-Messung (`sensor/.../response`) kollidieren am ADC — erhöht Streuung / falsche Rohwerte im Wizard. | **Serial-Trace** (Robin): Korrelation `intent_id` / Messkommando vs. autonomer Zyklus ohne Überlappung; **oder** nach Mutex-Alignment (siehe Referenz-STEUER) **Wiederhol-SQL** auf Session-Punkten / Live-Roh: Varianz sinkt messbar. **Kein** Ersatz für SQL, wenn nur FW verändert wird — mindestens Build-Verify. |
| **H-D** | **Server:** `SensorSchedulerService` (APScheduler, `El Servador/god_kaiser_server/src/services/sensor_scheduler_service.py`) triggert MQTT-Messungen **während** aktiver Kalibrier-Session am **gleichen** GPIO und verfälscht Kontext (nicht Roh-Substitution — die ist bereits verhindert, siehe H-E). | **Code-Review + optional Log-Marker:** Prüfen, ob Jobs während `CalibrationSessionRepository.get_active_session` coexistieren; falls ja, **messbar:** gezielter Integrationstest oder dokumentiertes Soak-Protokoll (Zeitfenster Session vs. Cron-Fire). |
| **H-E** | **Rohwert-Kette (IST, repo-verifiziert):** `CalibrationResponseHandler` substituiert **keinen** `raw` aus der DB, wenn Payload ohne `raw`/`raw_value` — verhindert Verwechslung mit **Intervall-Sampling** (Docstring Zeilen 27–29, Logik ab `raw_value is None` in `calibration_response_handler.py`). | **pytest:** bestehende/ergänzte Tests für fehlendes `raw` → `calibration_measurement_failed` ohne DB-Lookup; **Regression:** keine Wieder-Einführung eines DB-Fallbacks ohne separates Design-PKG. |

---

## 3. Schritte (nummeriert, Server vs. Firmware getrennt)

### Teilpfad A — Server (`server-dev`)

1. **IST-Aufnahme `sensor_handler.py`:** Pfad `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` — dokumentieren: `pi_enhanced` + `raw_mode`, Fallback `processed_value = raw_value` ohne Processor (Zeilenblock um `processing_mode = "raw"` / `pi_enhanced`), Plausibilitätsprüfung nur bei `pi_enhanced`. **Ziel:** Keine Änderung „aus Bequemlichkeit“, die Roh-ADC als % interpretiert; nur falls PKG-HW-01 Konfig erzwingt und Varianz dann noch falsch ist, gezielte Anpassung (z. B. Qualität/Flag statt stillem %).
2. **`CalibrationResponseHandler`:** Datei `…/mqtt/handlers/calibration_response_handler.py` — bestätigen: kein DB-Fallback für `raw` (bereits implementiert); falls Wizard dennoch unstabil: **WS-Events** und Session-State logisch prüfen, nicht Rohwert-Substitution lockern.
3. **`SensorSchedulerService` + `CentralScheduler`:** Dateien `…/services/sensor_scheduler_service.py`, `…/core/scheduler.py` — analysieren, ob Messjobs für `(esp_id, gpio)` während **aktiver** Kalibrier-Session pausiert oder zurückgestellt werden müssen (Design: keine Doppel-Trigger ohne Review; Pattern-Reuse: bestehende Job-API erweitern).
4. **Tests:** Module `tests/` mit Fokus Feuchte/Kalibrierung — mindestens die in Abschnitt 6 genannte pytest-Selektion; bei Scheduler-Änderung gezielte neue Tests unter `tests/unit/` oder `tests/integration/` (Fixtures ohne DB-Leak laut Backend-Regeln).

### Teilpfad B — Firmware (`esp32-dev`)

5. **Mutex / Messpfad:** Referenz **ohne Doppelimplementierung:** `.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-esp32-manual-measure-mutex-2026-04-10.md` — closest pattern: `El Trabajante/src/services/sensor/sensor_manager.cpp` (`performAllMeasurements` mit `g_sensor_mutex` vs. `triggerManualMeasurement`). **Leitplanken:** `.cursor/rules/firmware.mdc` — kein `delay()` in der Hauptloop, kein Arduino-`String`, GPIO nur über GPIOManager/HAL, Watchdog nicht deaktivieren.
6. **Build:** `cd "El Trabajante"; pio run -e esp32_dev` (ESP32 DevKit / WROOM-32) **oder** `pio run -e seeed_xiao_esp32c3` (Seeed XIAO). Env `-e seeed` existiert in `platformio.ini` **nicht**.

### Teilpfad C — Reihenfolge Cross-Layer

7. **Empfohlene Umsetzungsreihenfolge:** Zuerst **Vorbedingung HW-PKG** → dann **IST** STDDEV/Baseline-SQL erneut messen → bei verbleibender Firmware-Evidenz **B vor A** nur, wenn Server-IST unverändert korrekt und nur Race verbleibt; sonst **A (Scheduler/Ingest-Klarheit) vor B (Mutex)**. Im PR kurz begründen.

---

## 4. Regression-Metrik (STDDEV)

**Referenz (Evidence aus Analysebericht, 2 h Fenster):**

- **ESP_6B27C8 / GPIO 33:** `STDDEV(processed_value) ≈ 3,37` (Referenz „ruhig“).
- **ESP_EA5484 / GPIO 32:** `STDDEV ≈ 283` (Ist-Störfall); **GPIO 33:** `STDDEV ≈ 82`.

**Schwellwert-Vorschlag (vom TM final festzulegen, falls numerisch gewünscht):**

- Für das **Zielgerät** am **kanonischen** `moisture`-GPIO nach Abschluss HW+CAL-Pfad: `STDDEV(processed_value)` im **gleichen** SQL-Fenster (z. B. 2 h) **≤ 15** (Einheit wie DB: % laut Kontext) **oder** **≤ 5×** der Referenz-STDDEV (~17), sofern Substrat vergleichbar.
- **BLOCKER:** Wenn trotz kohärenter Config und Mutex weiterhin physikalisch unmögliche Roh-ADC bei „trocken stabil“ (siehe Baseline-Bericht L3) — **kein** Server-Tuning als Pseudo-Fix; HW dokumentieren.

---

## 5. Verify

Wie TASK-PACKAGES PKG-CAL-02 (übernommen):

```text
cd "El Servador/god_kaiser_server"
poetry run pytest tests/ -q --timeout=120 -k "calibration or moisture" --maxfail=3
```

**Firmware (nur bei Teilpfad B):**

```text
cd "El Trabajante"
pio run -e seeed_xiao_esp32c3
```

(Alternativ `esp32_dev`, sofern das Zielboard dem Env entspricht.)

**Optional (Evidenz, nicht als CI-Ersatz):** Soak-Protokoll: SQL-Query + Zeitfenster + `esp_id`/`gpio` im Run-Ordner dokumentieren (analog zu Berichtstabellen).

---

## 6. Abgrenzung PKG-CAL-01 (`derived`)

**Keine** erneute Änderung am **`derived`-Schema** oder an `resolve_calibration_for_processor`-Verträgen, sofern **PKG-CAL-01** (Steuer/Plan: `.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-PKG-CAL-01-session-apply-derived-2026-04-11.md` bzw. das daraus erzeugte Umsetzungs-Artefakt) `calibration_data` → Processor-Pfad bereits abschließend adressiert. PKG-CAL-02 baut **darauf** auf und adressiert **Stabilität, Mutex, Rohwert-Kollisionen**, nicht die erneute Schema-Diskussion.

---

## 7. Gate: verify-plan vor Delegation

Vor Beauftragung von `server-dev` / `esp32-dev`: Skill **`verify-plan`** (`.claude/skills/verify-plan/SKILL.md`) auf **diesen Plan** und die dann aktuelle Codebasis anwenden; Ergebnis in `.claude/reports/current/auto-debugger-runs/<run_id>/VERIFY-PLAN-REPORT.md` oder im Incident-Ordner `ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/` gemäß Orchestrierung festhalten. Pfade in diesem Plan wurden gegen Repo geprüft (`calibration_response_handler.py`, `sensor_handler.py`, `sensor_scheduler_service.py`, `sensor_manager.cpp`-Referenz aus STEUER).

---

## 8. Pattern-Verweise (repo-verifiziert)

| Thema | Pfad |
|--------|------|
| Kalibrier-Response, kein DB-Fallback `raw` | `El Servador/god_kaiser_server/src/mqtt/handlers/calibration_response_handler.py` |
| Pi-Enhanced vs. Roh-Speicherpfad | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| Geplante Sensor-Jobs (Server) | `El Servador/god_kaiser_server/src/services/sensor_scheduler_service.py`, `…/core/scheduler.py` |
| Manuelle vs. periodische Messung (FW) | `El Trabajante/src/services/sensor/sensor_manager.cpp` (siehe Mutex-STEUER) |

---

*Ende Implementierungsplan PKG-CAL-02.*
