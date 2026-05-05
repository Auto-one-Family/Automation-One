---
run_mode: artefact_improvement
incident_id: ""
run_id: feuchte-esp32-manual-measure-mutex-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md
scope: |
  **Schicht:** El Trabajante (ESP32) — SensorManager manuelle Messung vs. autonomer Loop.

  **Root-Cause-Cluster (aus BERICHT):** H3, H12 — `performAllMeasurements()` hält `g_sensor_mutex`
  für den gesamten Durchlauf; `triggerManualMeasurement()` tritt **ohne** dasselbe Mutex-Muster auf
  dem gleichen Codepfad ein (Messung + ADC). Parallel können periodische Messungen (continuous +
  Intervall) und manuelle Trigger kollidieren; `operating_mode`/`on_demand` steuert, ob der
  Autonom-Loop den Sensor überhaupt anfasst (BERICHT H12).

  **IST (repo-verifiziert):** `sensor_manager.cpp`: `performAllMeasurements` Zeile ~1233
  `xSemaphoreTake(g_sensor_mutex, ...)`, Ende ~1403 `xSemaphoreGive`. `triggerManualMeasurement`
  ab ~1417: kein `g_sensor_mutex` vor `performMeasurement`/`performMultiValueMeasurement`.

  **SOLL:** Manuelle Messung und iterierender Autonom-Pfad **serialisieren** den Zugriff auf dieselbe
  Sensor-/ADC-Logik wo nötig — gemäß Firmware-Regeln **ohne** blockierendes `delay()` in der Hauptloop;
  Mutex-Take mit Timeout oder gleiches Muster wie Nachbarcode. **Keine** Geschäftslogik auf dem ESP
  hinzufügen — nur sichere Ausführung der bestehenden Messfunktionen.

  **Safety:** Kein Deaktivieren des Watchdogs; Mutex in ISRs vermeiden; Stack-Größen unverändert oder
  explizit begründet.

  **Abgrenzung:** Keine Server-Logik; keine MQTT-Topic-Änderung ohne mqtt-development-Review.
forbidden: |
  Kein Arduino `String` in neuen Pfaden (Projektregel). Kein `delay()` in der Haupt-Loop — hier Mutex
  in Messfunktionen, keine Busy-Wait-Loops.
  GPIO nur über GPIOManager/HAL laut Projekt — bestehende Messpfade nicht umgehen.
  Branch auto-debugger/work für Firmware-Commits. Hardware-Tests nicht als „bestanden“ ohne
  Checkliste in VERIFY-PLAN-REPORT wenn Agent kein HW hat.
done_criteria: |
  - `pio run -e seeed_xiao_esp32c3` (oder anderes `[env:…]` aus `El Trabajante/platformio.ini`) Exit 0.
  - Dokumentiertes Risiko/Review: kein Deadlock zwischen `performAllMeasurements` und
    `triggerManualMeasurement` (kurze Begründung im VERIFY-PLAN-REPORT oder Kommentar im Code).
  - Artefakte unter `.claude/reports/current/auto-debugger-runs/feuchte-esp32-manual-measure-mutex-2026-04-10/`.
no_chat_questions: true
allow_user_escalation: false
---

# STEUER — Feuchte/Manual-Measure: ESP32 Mutex-Alignment

**Bezugs-Analyse:** `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md` (§5, H3/H12)  
**Incident-Referenz:** `INC-2026-04-10-feuchte-wizard-messwert-streuung`  
**Orchestrierung:** `auto-debugger` → `esp32-dev`  
**Modus:** `artefact_improvement`

---

## 1. Problem-Lagebild

Parallele ADC-/Messzugriffe durch **manuellen** Pfad (Kalibrier-Kommando) und **periodischen** Loop
können Race Conditions erzeugen — unabhängig von Server/Frontend. Der Bericht nennt explizit fehlende
`g_sensor_mutex`-Absicherung am Einstieg von `triggerManualMeasurement`.

---

## 2. Pattern-Scan (Pflicht)

- **Closest implementation:** `SensorManager::performAllMeasurements` — gleiches Mutex-Idiom auf den
  manuellen Pfad übertragen, ohne doppeltes Lock innerhalb bereits mutex-geschützter Aufrufe
  (Reentrancy prüfen: `performMeasurementForConfig` vs. `performMeasurement`).
- **Tests:** `test/mocks/mock_gpio_hal.h` / Wokwi falls vorhanden — verify-plan prüft.

---

## 3. Arbeitspakete (Vorschlag)

### PKG-ESP-01 — Mutex-Strategie

**Owner:** esp32-dev  
**Dateien:**

- `El Trabajante/src/services/sensor/sensor_manager.cpp` (`triggerManualMeasurement`, ggf. Hilfsfunktionen)
- bei Bedarf Header mit Mutex-Deklaration

**Inhalt:**

1. Vor manueller Messung: `xSemaphoreTake(g_sensor_mutex, …)` mit projektüblichem Timeout (nicht
   unendlich blockieren ohne Konzept — verify-plan entscheidet mit Referenzcode).
2. Sicherstellen, dass **jeder** Return-Pfad `xSemaphoreGive` ausführt (goto/RAII-Pattern wie im
   restlichen File-Stil).
3. Prüfen, ob `performMeasurement` intern nochmals lockt — **kein** Deadlock.

**Verify:**

```text
cd "El Trabajante" && pio run -e seeed_xiao_esp32c3
```

(Alternatives `env` aus `platformio.ini` im VERIFY-PLAN-REPORT festhalten.)

### PKG-ESP-02 — Optional: Logging / Reason-Codes

Nur wenn nötig: eindeutiges Log bei Mutex-Timeout (`reason_code` analog bestehende
`ManualMeasurementResult`).

---

## 4. Schnittstellen

- **Backend H2:** Wenn `raw` in der Response zuverlässig gefüllt wird, entlastet das den DB-Fallback —
  ggf. ESP-Response-JSON in `main.cpp` / Publish-Pfad mit Abgleich (nur lesen in Server-STEUER).
- **Frontend:** Unveränderte Korrelation bleibt trotzdem sinnvoll.

---

## 5. Akzeptanz

- Build grün; keine neuen Warnings-Kategorien unkommentiert.
- HW: Optional Robin — manuelle Messung während laufendem Intervall ohne offensichtliche Wert-Sprünge
  (subjektiv + Log), dokumentiert im Run-Ordner oder als BLOCKER.
