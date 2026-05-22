# VERIFY-PLAN-REPORT — feuchte-esp32-manual-measure-mutex-2026-04-10

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-esp32-manual-measure-mutex-2026-04-10.md`  
**Datum:** 2026-04-10  

## Umsetzung (PKG-ESP-01)

- **Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`
- **Änderung:** Vor manueller Messung (`performMultiValueMeasurement` / `performMeasurement`) wird `g_sensor_mutex` mit **Timeout** `kManualSensorMutexWaitMs` (10 s) genommen; Freigabe per RAII (`SensorArrayMutexLock`). Bei Timeout: `reason_code = "MUTEX_TIMEOUT"`, Log WARN.

## Deadlock-Risiko (kurz)

- **Kein verschachteltes Lock:** `performMeasurement`, `performMeasurementForConfig` und `performMultiValueMeasurement` rufen **kein** `xSemaphoreTake(g_sensor_mutex, …)` auf (nur `configureSensor` und `performAllMeasurements`). Manuelle Messung hält daher genau **ein** Mal das Mutex — kein Reentrancy-Deadlock.
- **Reihenfolge mit autonomem Pfad:** `performAllMeasurements` und `triggerManualMeasurement` konkurrieren um **dieselbe** binäre Semaphore; es serialisiert ADC-/Messzugriffe gegeneinander. Lang laufender autonomer Zyklus kann die manuelle Messung bis zum Timeout verzögern (erwartetes Verhalten, kein Deadlock).

## Verify

| Befehl | Ergebnis |
|--------|----------|
| `cd El Trabajante && pio run -e seeed_xiao_esp32c3` | Exit 0 (2026-04-10) |

**Server / Frontend:** Keine Änderungen (STEUER-Abgrenzung). Optional: UI/API kann `MUTEX_TIMEOUT` anzeigen, falls noch nicht abgebildet.

**HW-Test:** Nicht durch Agent ausgeführt (optional Robin).
