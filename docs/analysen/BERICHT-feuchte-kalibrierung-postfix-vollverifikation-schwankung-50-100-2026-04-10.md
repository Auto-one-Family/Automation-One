# Post-Fix-Vollverifikation: Bodenfeuchte-Kalibrierung — Symptom-Schwankung **50–100 %**

**Incident-ID:** `INC-2026-04-10-feuchte-schwankung-50-100-postfix`  
**Run-ID:** `feuchte-postfix-vollverifikation-2026-04-10`  
**Git:** Branch `auto-debugger/work`, Commit **`4e6daff`** (Stand dieser Verifikation)  
**Datum:** 2026-04-10  
**Art:** Repo- und optional DB-verifizierte Analyse — **keine** Produktcode-Änderungen in diesem Lauf.

---

## 1. Executive Summary

Die **Finalize-/Persistenz-Kette** und mehrere zuvor kritisierte **Live-Pfade** (Backend-Fallback, Frontend-Korrelation, Firmware-Mutex) sind im aktuellen Tree **weitgehend mit den erwarteten Invarianten vereinbar**; eine **PostgreSQL-Stichprobe** zeigt für das reale Gerät **`moisture_2point`** mit **`dry_value`/`wet_value`** in `derived`. Das beobachtete Band **50–100 %** lässt sich **quantitativ** als Arbeitspunkt auf der **kalibrierten Kennlinie inkl. `invert`** deuten (Schwankung der Roh-ADC zwischen „mittel“ und „trocken“), **ohne** dass damit Hardware-Rauschen oder verbleibende Randfälle ausgeschlossen sind.

---

## 2. Problem von vorn (Pipeline A / B / C)

**Ziel für den Betrieb:** Zwei Kalibrierpunkte (trocken/nass) liefern Roh-ADC-Grenzen; der Server rechnet daraus eine **stabile** Feuchte-Anzeige in **%**.

| Pfad | Was passiert (vereinfacht) |
|------|----------------------------|
| **(A) Persistenz nach Finalize** | Session wird finalisiert (`finalize` → berechnetes `derived`) und bei `apply` in **`sensor_configs.calibration_data`** (kanonisch: `method`, `points`, `derived`, `metadata`) geschrieben. |
| **(B) Wizard „Messung starten“** | `POST` Measure → MQTT-Befehl → ESP → Antwort auf `…/sensor/{gpio}/response` → **`CalibrationResponseHandler`** → WebSocket `calibration_measurement_*` → Wizard zeigt **Roh-ADC** für die Punktaufnahme. |
| **(C) Dauerbetrieb** | Periodische Messungen (z. B. Intervall) → MQTT-Datenpfad → **`MoistureSensorProcessor`** mit Kalibrierung aus der DB — **gleiche** mathematische Kurve wie (A), aber **anderer Zeitpunkt** und ggf. **andere** Rohwertquelle als (B), wenn Physik oder Mutex/Races nicht sauber getrennt sind. |

**Kernrisiko (konzeptionell):** Wenn (A), (B) oder (C) **verschiedene** Rohwerte, **verschiedene** Kalibrier-Snapshots oder **verschiedene** Verarbeitungszweige nutzen, wirkt das wie „falsche“ oder springende Anzeige — auch wenn ein Teil der Kette korrekt ist.

---

## 3. Symptom-Update: Schwankung **50–100 %** (kurz klassifiziert)

| Mögliche Ursachenklasse | Einordnung |
|-------------------------|------------|
| **Clamping** nahe 100 % | Roh-ADC liegt oft **nasser** als der kalibrierte „wet“-Punkt → lineare Formel liefert **>100 %**, Anzeige klemmt bei 100 %; Rest als moderate Schwankung darunter. |
| **Invert / trocken–nass** vertauscht | Würde eher **systematische** Verschiebung zeigen; mit korrektem `invert` in `derived` ist das **über die Formel prüfbar** (siehe §5E). |
| **Zu schmale / verschobene Spanne** `dry_value`–`wet_value` | Kleine Spanne → **hohe Prozent-Empfindlichkeit** pro ADC-Schritt. |
| **Falsche Zuordnung** Messung ↔ Session/Request | Kann noch **Teil** der Varianz erklären, wenn IDs fehlen oder mehrere Events konkurrieren. |
| **Wechsel** kalibrierte Kurve vs. **Default 3200/1500** | Tritt auf, wenn `resolve_calibration_for_processor` **kein** `dry_value`/`wet_value` liefert — in der DB-Stichprobe **nicht** der Fall für das betrachtete Gerät nach Neu-Kalibrierung. |

---

## 4. Prüf-Matrix A–E (Status + Evidence + Gap)

### A) Persistenz / Processor (Finalize-Kette)

| Prüfpunkt | Status | Evidence | Gap |
|-----------|--------|----------|-----|
| `finalize` für Feuchte: `derived` mit **`dry_value`/`wet_value`**, Typ **`moisture_2point`** (bzw. `linear_2point`+moisture → gleiche `_compute_moisture_from_role_points`) | **OK** | `CalibrationService._compute_moisture_from_role_points` setzt `type`, `dry_value`, `wet_value`, `invert` (`calibration_service.py`); `finalize` schreibt kanonisches Resultat (`build_canonical_calibration_result`). | — |
| Kein „isoliertes“ linear_2point-**Slope/Offset**-Derived für Feuchte **beim aktuellen** Finalize-Pfad | **OK** (Codepfad) | Bei `linear_2point` **und** Sensor `moisture` wird `_compute_moisture_from_role_points` verwendet, nicht `_compute_linear_2point` (`calibration_service.py`, Verzweigung in `_compute_calibration`). | **Alte DB-Zeilen** aus früheren Finalizes können noch `linear_2point`-`derived` ohne dry/wet enthalten — dann **TEILWEISE** bis zur nächsten Kalibrierung. |
| `resolve_calibration_for_processor` → `MoistureSensorProcessor`: kein stiller Default **wenn** gültige dry/wet in `derived` | **OK** | `resolve_calibration_for_processor` gibt bei nicht-leerem `derived` **`dict(derived)`** zurück (`calibration_payloads.py`); Processor nutzt Kalibrierung nur bei vorhandenen **`dry_value` und `wet_value`** (`moisture.py`, `process`). | Wenn `derived` nur `slope`/`offset` (Legacy): Processor fällt auf Default zurück — **nicht** aktueller Pfad für neue `moisture_2point`-Sessions. |
| DB-Stichprobe `sensor_configs.calibration_data` | **OK** (Live-DB) | Read-only: Gerät `63f776d4-d0fc-4191-b4e3-58c1d77ebb4d`, GPIO 32 — `method: moisture_2point`, `derived.type: moisture_2point`, **`dry_value`/`wet_value`** gesetzt, `calibrated_at` 2026-04-10. | Zweites Gerät in Stichprobe: `calibration_data` **leer** — erwartungskonform kein Processor-Mapping aus Session. |

### B) Wizard Live-Messung („Messung starten“)

| Prüfpunkt | Status | Evidence | Gap |
|-----------|--------|----------|-----|
| Abgleich **`measurementRequestId`** mit **`intent_id` / `correlation_id` / `request_id`** (inkl. Top-Level-WS-`correlation_id`) | **OK** | `measurementCorrelationCandidates` + `matchesActiveMeasurementRequest`; Events ohne passende ID werden verworfen (`useCalibrationWizard.ts`). | — |
| Kein **reiner** esp/gpio-Filter ohne ID-Match für die **Wertübernahme** | **OK** | Zuerst esp/gpio/session-Filter; **danach** `measurementRequestId` gesetzt und **`matchesActiveMeasurementRequest`** erforderlich (`useCalibrationWizard.ts`). | Wenn **keine** IDs in der Payload: Integration-Issue-Pfad (`terminal_integration_issue`). |
| Zeit-Guard gegen **veraltete** Payloads nach neuem Klick | **TEILWEISE** | Neuer Klick setzt **`measurementRequestId`** auf die neue `request_id` vom API-Trigger — **alte** Responses mit alter ID matchen **nicht** mehr (impliziter „stale“-Schutz). Expliziter Timestamp-Vergleich (Triggerzeit vs. Event) **fehlt**; `Date.now()` wird nur für `lastMeasurementAt` genutzt. | **UNKLAR + Grund:** Doppeltes Event mit **derselben** `request_id` (Retry/Duplikat) wird nicht dedupliziert — geringes Restrisiko. |

### C) Backend `CalibrationResponseHandler`

| Prüfpunkt | Status | Evidence | Gap |
|-----------|--------|----------|-----|
| Strategie wenn `raw`/`raw_value` fehlt | **OK** (kein DB-Blind-Fallback) | Kein `get_latest_reading`: bei fehlendem Rohwert **Warnung**, Broadcast **`calibration_measurement_failed`** mit erklärendem Text (`calibration_response_handler.py`). | — |

*Hinweis:* Der ältere Analysebericht *„Wizard Messung starten“* beschrieb noch einen **DB-Fallback** — der **aktuelle Code** entspricht **nicht** mehr dieser Beschreibung (**Regression dokumentiert** im Sinne von „ältere Doku/älterer IST“).

### D) Firmware: `triggerManualMeasurement` vs. `performAllMeasurements`

| Prüfpunkt | Status | Evidence | Gap |
|-----------|--------|----------|-----|
| Serialisierung **über dasselbe GPIO** / Sensor-Array | **OK** | `SensorArrayMutexLock` mit **`g_sensor_mutex`** (bounded wait `kManualSensorMutexWaitMs`), Kommentar „serialize manual vs autonomous“ (`sensor_manager.cpp`). | Bei Timeout **`MUTEX_TIMEOUT`** kann manuelle Messung ausfallen — Betreiber sieht dann Fehlerpfad auf ESP/Server, nicht still falsche Rohwerte. |
| `operating_mode` / Intervall (H12) | **WEITER RELEVANT** | `performAllMeasurements` überspringt u. a. `on_demand`/`scheduled`; Intervall pro Sensor (`sensor_manager.cpp`). | Ohne Geräte-Config-Export im Lauf: **kein** Gerät-spezifischer Nachweis, ob parallel **kontinuierlicher** Pfad denselben ADC **zeitlich überlappt** (nur noch über Mutex entschärft). |

### E) Mathematik **50–100 %** (quantitativ)

| Prüfpunkt | Status | Evidence | Gap |
|-----------|--------|----------|-----|
| Rechnung anhand **realer** DB-Kalibrierung | **OK** (Beispiel) | Stichprobe: `dry_value = 2490`, `wet_value = 1002`, **`invert: true`** in `derived`. Linearer Roh-Anteil: `m_lin = (adc - dry) / (wet - dry) * 100` (`moisture.py`, `_adc_to_moisture_calibrated`); danach `m = 100 - m_lin` bei `invert`. Für **adc = 1746** (Mitte zwischen trocken und nass): `m_lin = 50` → **`m = 50 %`**. Für **adc → 2490**: `m_lin → 0` → **`m → 100 %`**. Schwankt die Physik (Roh-ADC) zwischen **Mitte und trocken**, liegt die **Anzeige** rechnerisch im Band **ca. 50–100 %** — **ohne** Clamping, passend zum gemeldeten Symptomwechsel gegenüber breitem 0–60 %-Band. | Ein **Einzelpfad** ohne Live-Roh-Zeitreihe: keine Aussage über **Anteil** Rauschen vs. Zuordnungsfehler. |
| Clamping als Erklärung für „kleben“ bei 100 % | **TEILWEISE** | `process` klemmt auf [0,100] **nach** Invert (`moisture.py`). Rohwerte jenseits von wet/dry erzeugen **Clamping** — für das Band 50–100 % reicht aber bereits **Variation innerhalb** [wet…dry] bei gesetztem `invert`. | — |

---

## 5. Abgleich mit früheren Berichten

| Quelle | Was als **gelöst** im aktuellen Code/DB gilt | Was **offen** bleibt |
|--------|-----------------------------------------------|----------------------|
| `BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md` (H1–H12) | **H2** (kein `latest_reading`-Fallback mehr), **H3** (Mutex im manuellen Pfad), **H1/H11** (Request-Korrelation im Wizard), **H6** (Zeit-Logik durch ID-Match weitgehend ersetzt). | **H12** (Modus/Intervall), **H5/H10** (Netz/Hardware-Rauschen), Duplikat-Events, Multi-ESP-Verwechslung. |
| `BERICHT-bodenfeuchte-live-verify-SEN0193-codebase-2026-04-10.md` | Schema-Mismatch **`linear_2point`-Derived ohne dry/wet** ist für **neu** finalisierte Sessions im Code **behoben**; DB-Stichprobe zeigt **`moisture_2point`** mit dry/wet (2026-04-10). | Legacy-Zeilen bis zur **Re-Kalibrierung**; Hardware **4095**/„offen“ aus älterem Bericht separat. |

---

## 6. Hypothesen H1–H12 — **weiter** relevant nach vermutetem Fix

| ID | Relevanz nach Stand 4e6daff |
|----|-----------------------------|
| H1, H11 | **Gering bis mittel** — ID-Match aktiv; Rest: Duplikate / Edge Cases. |
| H2 | **Gering** — kein DB-Fallback bei fehlendem `raw`. |
| H3 | **Gering** — Mutex im manuellen Pfad. |
| H4, H8 | **Unverändert** (Kontext/Vergleich mit Dashboard). |
| H5 | **Mittel** — ohne MQTT-Trace nicht verifiziert. |
| H6 | **Gering** — expliziter Timestamp-Guard fehlt, aber Request-ID dominiert. |
| H7 | **Mittel**, falls Symptom **Prozent** betrifft — `invert`/Semantik prüfen (siehe §4E). |
| H9 | **Mittel** — `session_id`-Filter weiter im Wizard. |
| H10 | **Hoch** — physikalisches Rauschen / Kontakt. |
| H12 | **Hoch** — Betriebsmodus und Intervall je Sensor. |

---

## 7. Empfehlung: ein nächster Mini-Schwerpunkt **oder** Messprotokoll

**Empfehlung (ein Schwerpunkt):** Kurzes **Messprotokoll** zur Laufzeit: für **eine** Kalibrier-Session **seriell** „Messung starten“ (ohne Doppelklick), parallel **MQTT-Trace** (`…/response` mit `raw`, `request_id`) und **Server-Log** — Abgleich, ob die **Roh-ADC-Schwankung** allein die 50–100 %-Bandbreite erklärt. Wenn Roh stabil ist und Prozent dennoch springt, dann erneut **Processor + `invert` + gespeicherte `derived`** prüfen.

**Alternativ (Implementierung, nicht Teil dieses Laufs):** optionale **Dedupe** gleicher `request_id` im WS-Handler/Frontend und **ein** klares **Feld** `triggered_at`/`sequence` in der Response — nur falls MQTT-Duplikate nachgewiesen werden.

---

*Ende Bericht.*
