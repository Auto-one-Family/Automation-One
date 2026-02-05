# ESP32 Watchdog-Timeout und NVS-Persistenz Fix

**Agent:** esp32-dev
**Datum:** 2026-02-05
**Build Status:** SUCCESS

---

## Problem-Zusammenfassung

| Symptom | Root Cause |
|---------|------------|
| Watchdog-Timeout nach ~90s | Blocking `delay()` und `Wire.requestFrom()` ohne `yield()` |
| `sensor_count: 0` nach Reboot | NVS-Persistenz funktioniert (platformio.ini korrekt) |

---

## WOKWI_SIMULATION Status

**ERGEBNIS: platformio.ini ist KORREKT konfiguriert!**

| Environment | WOKWI_SIMULATION |
|-------------|------------------|
| `esp32_dev` | **NICHT definiert** (korrekt) |
| `wokwi_simulation` | Definiert (Zeile 140) |

**Wichtig:** Wenn `sensor_count: 0` nach Reboot auftritt, prüfen:
1. Wird mit dem richtigen Environment gebaut? (`-e esp32_dev`)
2. Erscheint im Serial-Log `"WOKWI_SIMULATION mode"`?

---

## Implementierte Fixes

### Fix 1: yield() nach I2C conversion delay

**Datei:** `El Trabajante/src/drivers/i2c_bus.cpp`
**Zeile:** ~805 (nach delay)

```cpp
// Step 2: Wait for conversion
if (protocol->conversion_time_ms > 0) {
    delay(protocol->conversion_time_ms);
    yield();  // Feed watchdog after blocking delay
}
```

**Grund:** Der 16ms `delay()` für SHT31-Conversion blockierte ohne Watchdog-Feed.

---

### Fix 2: Wire.setTimeOut() in begin()

**Datei:** `El Trabajante/src/drivers/i2c_bus.cpp`
**Zeile:** ~109 (nach Wire.begin())

```cpp
// Set Wire timeout to prevent indefinite blocking on unresponsive sensors
Wire.setTimeOut(100);  // 100ms timeout for Wire operations
```

**Grund:** `Wire.requestFrom()` konnte unbegrenzt blockieren wenn Sensor nicht antwortet.

---

### Fix 3: yield() zwischen Sensor-Messungen

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.cpp`
**Funktion:** `performAllMeasurements()`
**Zeile:** ~1053 (am Ende der for-Loop)

```cpp
        // Feed watchdog between sensor measurements to prevent timeout
        yield();
    }

    // Update global timestamp for compatibility
    last_measurement_time_ = now;
}
```

**Grund:** Bei mehreren Sensoren akkumulierte sich die Blockierungszeit ohne Watchdog-Feed.

---

## Build-Ergebnis

```
Environment    Status    Duration
-------------  --------  ------------
esp32_dev      SUCCESS   00:00:41.460

RAM:   [==        ]  22.4% (used 73268 bytes from 327680 bytes)
Flash: [========= ]  89.5% (used 1173673 bytes from 1310720 bytes)
```

---

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `src/drivers/i2c_bus.cpp` | `yield()` nach delay(), `Wire.setTimeOut(100)` in begin() |
| `src/services/sensor/sensor_manager.cpp` | `yield()` zwischen Sensor-Messungen |

---

## Verifizierungs-Schritte

1. **Upload auf ESP32:**
   ```bash
   cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev -t upload
   ```

2. **Sensor via MQTT konfigurieren** (SHT31 auf GPIO 21, Adresse 0x44)

3. **ESP manuell rebooten** (Reset-Button)

4. **Heartbeat prüfen:**
   - `sensor_count` sollte > 0 sein (wenn NVS korrekt funktioniert)
   - Kein Watchdog-Timeout nach 90+ Sekunden

5. **Sensor-Daten prüfen:**
   - MQTT-Topic `kaiser/god/esp/ESP_XXXXXX/sensor/21/data` sollte Readings zeigen

---

## Nächste Schritte bei weiterem Debugging

Falls `sensor_count: 0` nach Reboot weiterhin auftritt:

1. **Serial-Log auf WOKWI-Meldungen prüfen:**
   ```
   "ConfigManager: WOKWI_SIMULATION mode - using compile-time credentials"
   ```
   Wenn diese Meldung erscheint → falsches Build-Environment!

2. **NVS direkt prüfen:**
   - `loadSensorConfig()` Log-Output analysieren
   - "Loading Sensor configurations..." sollte erscheinen

3. **Hardware I2C verifizieren:**
   - SHT31 auf Adresse 0x44?
   - Pull-ups (4.7kΩ) auf SDA/SCL?
