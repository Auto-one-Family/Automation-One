# SHT31 E2E Pipeline — Diagnose + Fix Report

> **Datum:** 2026-02-26
> **Branch:** `fix/sht31-crc-humidity`
> **Status:** Code-Changes implementiert, BUILD SUCCESS, bereit zum Flash

---

## Phase 1: NVS-Dedup Root Cause — BESTAETIGT

### Config-Push (N1)
- Server-seitige Config-Push wurde nicht live getestet (ESP nicht angeschlossen)
- Server-Code splittet SHT31 korrekt in 2 Configs (sht31_temp + sht31_humidity)
- Config-Push wird nach Flash + Reboot automatisch ausgeloest

### NVS-Key-Schema (N2/N3) — ROOT CAUSE BESTAETIGT

**Datei:** `config_manager.cpp:1607-1621`

**NVS-Key-Format:**
- `sen_count` — Anzahl gespeicherter Sensor-Configs
- `sen_%d_gpio` — GPIO pro Index (z.B. `sen_0_gpio`, `sen_1_gpio`)
- `sen_%d_type` — sensor_type pro Index (z.B. `sen_0_type`, `sen_1_type`)
- Old-Key-Fallback: `sensor_%d_gpio`, `sensor_%d_type` (Migration)

**Bug:** Die Dedup-Loop (Zeile 1607-1621) vergleicht NUR `stored_gpio == config.gpio`:
```cpp
if (stored_gpio == config.gpio) {  // ← NUR GPIO, kein sensor_type!
    existing_index = i;
    break;
}
```

**Effekt:** `sht31_temp` wird bei Index 0 gespeichert (GPIO=0). Dann kommt `sht31_humidity` (GPIO=0) — Dedup findet GPIO=0 bei Index 0 → setzt `existing_index=0` → ueberschreibt sht31_temp mit sht31_humidity.

**Eindeutigkeit:** NEIN — Key-Kollision bei Multi-Value-Sensors auf demselben GPIO.

### Migration-Bugs (N5)
- Keine Hinweise auf Empty-Key-Bugs gefunden
- Old-Key-Fallback-Logik ist korrekt implementiert

### Fazit
**Fix N-A erforderlich:** GPIO + sensor_type Dedup in der for-Loop.

---

## Phase 2: Implementierte Fixes

### Fix 1: NVS-Dedup (config_manager.cpp:1605-1628)

Dedup-Loop erweitert: Vergleicht jetzt `stored_gpio == config.gpio && stored_type == config.sensor_type`.
Old-Key-Fallback fuer Migration beibehalten.
NVS-Key-Schema (`sen_%d_gpio`, `sen_%d_type`) bleibt unveraendert.

### Fix 2: PiEnhancedProcessor entfernt (sensor_manager.cpp + .h)

**Entfernt:**
- `#include "pi_enhanced_processor.h"` (sensor_manager.cpp:2)
- `pi_processor_(nullptr)` aus Constructor
- `pi_processor_ = &PiEnhancedProcessor::getInstance()` aus begin()
- `pi_processor_->begin()` Initialisierung + Error-Handling
- `pi_processor_->sendRawData()` in `performMeasurement()` (Zeile ~864-886)
- `pi_processor_->sendRawData()` in `performMultiValueMeasurement()` (Zeile ~970-1005)
- `class PiEnhancedProcessor* pi_processor_;` Member aus Header

**Hinzugefuegt:**
- `LocalConversion` Struct + `applyLocalConversion()` statische Utility-Funktion
- Direkte lokale Umrechnung in beiden Messfunktionen
- Formeln: SHT31 Temp/Hum, DS18B20, BMP280/BME280 Temp/Pressure/Humidity

**Nicht geaendert:**
- `pi_enhanced_processor.cpp` + `.h` bleiben vorhanden (nicht mehr referenziert)
- Server-Code: 0 Aenderungen
- `raw_mode = true` bleibt Default (Server ist Single Source of Truth)

### Fix 3: Diagnose-Logging (sensor_manager.cpp)

- I2C READ START/COMPLETE: LOG_I → LOG_D
- MQTT PUBLISH START/END: LOG_I → LOG_D
- MULTI-VALUE COMPLETE: LOG_I → LOG_D
- PiEnhancedProcessor START/END: Komplett entfernt (mit Fix 2)

---

## Build-Ergebnis

```
Environment    Status    Duration
esp32_dev      SUCCESS   00:01:46
RAM:   24.9% (81708 / 327680 bytes)
Flash: 90.9% (1191465 / 1310720 bytes)
```

Native Tests: Pre-existing ERRORED (gpio_manager.o, logger.o, topic_builder.o) — nicht durch diese Aenderungen verursacht.

---

## Naechste Schritte (Phase 3: Verifikation — Hardware)

1. **Flash** auf ESP_472204 (`pio run -e esp32_dev -t upload`)
2. **Serial-Log** pruefen (5 Messzyklen, ~2.5 min):
   - `sensor_count=2` (sht31_temp + sht31_humidity)
   - Beide CRC-Checks OK
   - Keine `[PiEnhanced]` oder `[CircuitBreaker] [PiServer]` Logs
   - Lokale Umrechnung korrekt (~20°C, ~44%)
3. **MQTT-Check:** Beide sensor_types im Payload
4. **DB-Check:** sensor_data hat Eintraege fuer beide sensor_types

---

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Trabajante/src/services/config/config_manager.cpp` | NVS-Dedup: GPIO + sensor_type |
| `El Trabajante/src/services/sensor/sensor_manager.cpp` | PiEnhanced entfernt, lokale Umrechnung, Logging cleanup |
| `El Trabajante/src/services/sensor/sensor_manager.h` | PiEnhanced Member + Comment entfernt |
