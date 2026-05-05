# Analysebericht: Wizard „Messung starten“ — Inkonsistenz trotz `moisture_2point`-Fix

**Incident-ID:** `INC-2026-04-10-feuchte-wizard-messwert-streuung`  
**Run-ID:** `feuchte-messmodus-wizard-on-demand-analyse-2026-04-10`  
**Repo-HEAD (Analyse):** `4e6daff`  
**Datum:** 2026-04-10  
**Art:** IST-Analyse, keine Produktcode-Änderung in diesem Lauf.

---

## 1. Executive Summary

**Dominante Hypothese-Schicht:** Die Symptome passen am ehesten zu einer **Kombination aus Frontend-Orchestrierung** (fehlende Zuordnung eingehender Mess-Events zur jeweils ausgelösten `request_id`) und **Backend-Fallback-Logik** im `CalibrationResponseHandler`, wenn die Sensor-**Response** keinen Rohwert trägt — dann wird `get_latest_reading` aus der DB gelesen, was **zeitlich mit dem 30s-Kontinuierlichkeitspfad kollidieren** kann. **Firmware** liefert zusätzlich ein reales Risiko **paralleler Messpfade** (periodischer Loop vs. manueller Trigger), weil der manuelle Pfad **nicht** dieselbe `g_sensor_mutex`-Absicherung wie `performAllMeasurements()` nutzt.

**Kurz:** Der abgeschlossene `moisture_2point`-/Derived-Fix betrifft **Persistenz und Verarbeitung nach Finalize** — die **Live-Messanzeige im Wizard** läuft über **POST measure → MQTT command → ESP → …/response → WS `calibration_measurement_*`**. Dort gibt es **mehrere** plausible Fehlzuordnungsmechanismen, die **unabhängig** von der Korrektheit der Finalize-Kette sind.

---

## 2. Symptom & Repro (für Robin)

1. Kalibrierungswizard öffnen, Bodenfeuchte-Sensor wählen, Phase Punkt 1 oder 2.
2. Mehrfach **„Messung starten“** klicken (auch mit Sekunden Abstand).
3. **Erwartung:** Rohwert-Anzeige („Aktueller Rohwert (ADC)“) folgt stabil der jeweils letzten Anforderung.
4. **Beobachtung:** Erster Lauf oft plausibel; Folge-Klicks liefern stark schwankende Rohwerte; subjektiv trocken/nass vertauscht; nur vereinzelt plausibel.

**Hinweis zur Anzeige:** Die UI zeigt explizit **Roh-ADC**, keine Prozent-Anzeige im Wizard-Schritt — Verwechslung „Prozent vs. Roh“ ist hier **nicht** die primäre UI-Spalte; das Problem ist **Rohwert-Streuung / Zuordnung**.

---

## 3. IST-Kette: Wizard-Klick → Netz → Server → MQTT → ESP → zurück

| Schritt | IST (verifiziert im Code) | Lücke / Risiko |
|--------|---------------------------|----------------|
| 1 | Klick ruft `triggerLiveMeasurement` auf → optional `startSession`, dann `sensorsApi.triggerMeasurement(esp, gpio)` (`useCalibrationWizard.ts`). | Session wird angelegt; **kein** Abgleich späterer Events mit `request_id` im WS-Handler. |
| 2 | Backend `SensorService.trigger_measurement` publiziert MQTT `measure` mit `request_id`/`intent_id`/`correlation_id` (`sensor_service.py`, `publisher.py`). | `correlation_id`-Parameter ist `None` — Publisher erzeugt **UUID** pro Aufruf. |
| 3 | ESP `handleSensorCommand` → `SensorManager::triggerManualMeasurement` → `performMeasurement` → `publishSensorReading` + MQTT **Response** auf `…/sensor/{gpio}/response` (`main.cpp`, `sensor_manager.cpp`). | **Kein** `g_sensor_mutex` am Einstieg von `triggerManualMeasurement`; parallele ADC-Nutzung zu `performAllMeasurements()` möglich (siehe §5). |
| 4 | Server `CalibrationResponseHandler.handle_sensor_response` parst Topic, holt optional **aktive Kalibrier-Session**, broadcastet `calibration_measurement_received` (WebSocket). | Wenn `raw` in der Response fehlt: **DB-Fallback** `get_latest_reading` mit Retry — „latest“ kann **letzter Intervall-Messwert** sein, nicht der manuelle Trigger. |
| 5 | Frontend `useCalibrationWizard`: WS-Filter nur `calibration_measurement_received` / `_failed`; setzt `lastRawValue` bei passendem `esp_id`/`gpio`/Session. | **Kein** Abgleich `data.intent_id`/`correlation_id` mit `measurementRequestId`; Zeit-Guard `eventReceivedAt < triggeredAt` ist praktisch wirkungslos (siehe Matrix H6). |

**BLOCKER für Laufzeit-Beweis:** In diesem Lauf wurden **keine** echten MQTT-Traces, Serial-Logs oder DB-Stichproben erhoben — empfohlene Messpunkte in §8.

---

## 4. Hypothesenmatrix H1–H12

| ID | Hypothese | Schicht | Status (Evidence) |
|----|-----------|---------|-------------------|
| H1 | **Späte Antwort** einer **älteren** `request_id` überschreibt die Anzeige, weil der WS-Handler **`intent_id` nicht mit `measurementRequestId` vergleicht**. | Frontend | **Stützbar** (`useCalibrationWizard.ts`: Filter nur esp/gpio/session, kein ID-Match). |
| H2 | **`CalibrationResponseHandler`** nutzt bei fehlendem `raw` in der Response **`get_latest_reading`** — der neueste DB-Eintrag kann vom **30s-Intervall** stammen, nicht vom manuellen Kommando. | Backend | **Stützbar** (`calibration_response_handler.py`: Retry-Schleife + latest). |
| H3 | **Parallele Messung:** `performAllMeasurements()` hält `g_sensor_mutex` für den gesamten Loop; **`triggerManualMeasurement`** nimmt das Mutex **nicht** vor `performMeasurement` — ADC-/Zustandsrace möglich. | Firmware | **Stützbar** (Mutex nur in `performAllMeasurements`, nicht in `triggerManualMeasurement`). |
| H4 | Doppelpfad **Telemetrie** (`sensor/.../data`) vs. **Command-Response** (`…/response`): Operator sieht verwandte Werte an anderer Stelle (Dashboard) und vergleicht mit Wizard — **Wahrnehmungs-/Kontext-Bias**. | UX/Prozess | Möglich; Wizard isoliert nur Kalibrier-WS. |
| H5 | MQTT **QoS / Reihenfolge**: Antworten kommen **out-of-order**; ohne Korrelation wirkt das wie „falsche“ Werte. | Netz | Plausibel; ohne Trace nicht bewiesen. |
| H6 | Frontend-Zeitcheck `Date.now() < measurementTriggerAt` trifft auf **`eventReceivedAt = Date.now()`** zu — schützt **nicht** vor veralteten Payloads nach neuem Trigger. | Frontend | **Stützbar** (Logik in `useCalibrationWizard.ts`). |
| H7 | **Invert/Mapping** nur in einem Verarbeitungspfad — hier wird **Roh-ADC** angezeigt; weniger wahrscheinlich als H1/H2/H3, sofern Symptom wirklich Rohwert ist. | Backend/UI | Geringer ohne Nachweis falscher Umrechnung im Wizard. |
| H8 | Falsches **Gerät/GPIO** im Store — unwahrscheinlich bei striktem esp/gpio-Filter, aber möglich bei Multi-Sensor-GPIO. | Frontend | Niedrig bis mittel. |
| H9 | **`session_id`-Filter** verwirft Events oder alter Session-State — kann zu „kein Wert“ oder verwirrendem Leeren führen; hier eher Randfall. | Frontend | Mittel. |
| H10 | **Hardware:** kapazitiver Sensor **einschwingt** — erster Wert ≠ Folgewerte; physikalisch, von Software zu trennen. | HW | Plausibel als Überlagerung. |
| H11 | **Mehrfach-Klicks** erzeugen mehrere In-Flight-Requests; ohne Request-Zuordnung **überlagern** sich Ergebnisse. | Frontend | **Stützbar** (keine Queue/Kein Latest-Request-Wins). |
| H12 | **`operating_mode`:** Im **Intervall-Modus** (`continuous`) läuft der 30s-Pfad parallel; im **On-Demand-Modus** wird der Sensor im Autonom-Loop **übersprungen** — gemischte Konfigurationen beeinflussen, **welche** Werte in der DB als „latest“ landen. | Firmware/Config | **Stützbar** (`performAllMeasurements`: `on_demand` → `continue`). |

---

## 5. Code-Evidence-Tabelle

| Datei | Symbol / Stelle | IST-Verhalten |
|-------|-------------------|---------------|
| `El Frontend/src/composables/useCalibrationWizard.ts` | `triggerLiveMeasurement`, WS-Handler `calibration_measurement_received` | POST `/sensors/{esp}/{gpio}/measure`; speichert `measurementRequestId`; WS akzeptiert Events mit `intent_id` **oder** `correlation_id`, **ohne** Gleichheit zu `measurementRequestId`; Roh aus `raw_value`/`raw`. |
| `El Frontend/src/components/calibration/CalibrationStep.vue` | `requestMeasurement`, Template | Emittiert `request-measurement`; Anzeige **„Aktueller Rohwert (ADC)“**; Timeout-Hinweis nach 3s ohne Wert. |
| `El Servador/god_kaiser_server/src/services/sensor_service.py` | `trigger_measurement` | Online-Check, MQTT `publish_sensor_command` mit `measure`, Rückgabe `request_id`. |
| `El Servador/god_kaiser_server/src/mqtt/publisher.py` | `publish_sensor_command` | Erzeugt `request_id` (UUID), setzt `request_id`/`correlation_id`/`intent_id` im Payload. |
| `El Servador/god_kaiser_server/src/mqtt/handlers/calibration_response_handler.py` | `handle_sensor_response` | Bei fehlendem `raw`: bis zu 3× Retry, `sensor_repo.get_latest_reading` — Risiko **Fremd-Messung** (z. B. Intervall). Broadcast `calibration_measurement_received` mit `session_id` bei aktiver Session. |
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | `performAllMeasurements` | `on_demand`/`scheduled`/`paused` werden im Autonom-Loop übersprungen; **continuous** mit per-Sensor-Intervall (Default-Kontext 30s). |
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | `triggerManualMeasurement`, `readRawAnalog` | Manueller Pfad: `performMeasurement` → bei Analog u. a. **Warmup-Reads** + Median; **kein** Mutex-Einstieg analog `performAllMeasurements`. |
| `El Trabajante/src/main.cpp` | `handleSensorCommand` (`measure`) | Response-JSON inkl. `raw`, `intent_id`/`correlation_id` aus `IntentMetadata`, wenn gesetzt. |

---

## 6. Abgrenzung zum bereits gefixten `moisture_2point`-Pfad

**Abgeschlossener Fix-Stand (Referenz aus Steuerdatei / Debugger-Kontext):**

- Backend: Finalisierung über **`moisture_2point`**, `derived` mit **dry_value/wet_value** für `MoistureSensorProcessor`; Tests (u. a. `test_moisture_finalize_apply_persists_moisture_2point_derived`) und Regression **grün**.
- Frontend: `calibration.ts` / Wizard wählen **`moisture_2point`** für Bodenfeuchte; Normalisierung `soil_moisture` → `moisture`.

**Warum das Symptom im Wizard trotzdem auftreten kann:**

1. **Unterschiedliche Pipeline:** Der Fix wirkt auf **Session finalize/apply** und serverseitige **Kalibrier-Anwendung**. Die **Live-Rohwert-Anzeige** beim „Messung starten“ kommt aus **Command-Response + WS**, nicht aus der finalize-Kette.
2. **Roh vor Kalibrier-Anwendung:** Angezeigt wird **Roh-ADC** für die manuelle Punktaufnahme — **kein** bereits mit `moisture_2point` skaliertes Prozent aus `derived` in diesem Schritt.
3. **Fehlerort:** Inkonsistenz hier deutet auf **Mess-/Korrelations-/Fallback-Logik** (H1, H2, H3, H6, H11, H12), nicht auf fehlerhafte **Persistenz der Zwei-Punkt-Kurve** nach erfolgreichem Apply.

---

## 7. Empfehlungen: Analyse-Follow-up vs. Implementierungs-STEUER

**Analyse-Follow-up (kein Code in diesem Lauf):**

- E2E-Trace mit Korrelation: **eine** ESP-ID/GPIO, **serialisierte** Klicks, Logs auf Server (`CalibrationResponseHandler`), MQTT-Client-Trace (Request-ID pro Klick), optional DB-Zeile zu `sensor_data` unmittelbar vor/nach Klick.
- Prüfen, ob Responses **immer** `raw` liefern; wenn nicht, **ob** DB-Fallback zeitlich mit Intervall-Messungen kollidiert.

**Vorschlag Implementierungs-STEUER (Titel, keine Umsetzung hier):**

- `STEUER-feuchte-kalibrierung-wizard-measurement-correlation-2026-04-10.md` — Umfang: **strict match** `intent_id`/`correlation_id` ↔ `measurementRequestId` im `useCalibrationWizard`; optional „ignore stale“ nach neuem Trigger; Backend: Fallback-Strategie bei fehlendem `raw` überarbeiten (z. B. Request-scoped Cache statt blind `latest`); Firmware: **Mutex-Alignment** manueller vs. periodischer Messpfad für dasselbe GPIO.

---

## 8. Offene Messpunkte (Logs, Serial, kurzer E2E mit Korrelation)

1. **Pro Klick:** Server-Log-Zeile zu `Measurement triggered … (request_id: …)` und ESP-Log zu `Manual measurement requested` / Response-Payload (ob `raw` gesetzt).
2. **MQTT:** Reihenfolge `…/command` → `…/data` (Telemetrie) vs. `…/response` für dieselbe `request_id`.
3. **WebSocket:** Payload von `calibration_measurement_received` — `intent_id`, `raw`, `session_id` — **zeitlich** zum Klick.
4. **DB:** `sensor_data` letzte Zeilen für GPIO — Timestamp vs. manueller Trigger (nur wenn DB erreichbar).
5. **Firmware:** Konfiguration `operating_mode` und `measurement_interval_ms` für den betroffenen Sensor (continuous vs. on_demand).
6. **Hardware:** Sensor **einmalig** eingesteckt — erste vs. Folgewerte (H10) dokumentieren.

---

## 9. Errata (Repo nach Analyse-HEAD)

- **2026-04-10 — Firmware:** `SensorManager::triggerManualMeasurement` serialisiert die Messphase mit `g_sensor_mutex` (bounded wait, `reason_code` `MUTEX_TIMEOUT` bei Warte-Timeout). Die Formulierungen in §1, §3 (Zeile zur fehlenden Mutex-Absicherung), H3 und der Pfad-Tabelle zu **fehlendem** Mutex am manuellen Einstieg beziehen sich auf den **IST-Stand zum genannten Repo-HEAD**; für den parallelen ADC-/Mess-Race (H3) nach diesem Fix siehe `VERIFY-PLAN-REPORT` im Run `feuchte-esp32-manual-measure-mutex-2026-04-10`. **H12** (`operating_mode` / Intervall vs. on_demand) und die übrigen Hypothesen bleiben separat prüfbar.

---

*Ende Bericht.*
