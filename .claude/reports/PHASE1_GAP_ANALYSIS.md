# Phase 1 Test-Lücken Analyse: OneWire & I2C Fehlerwert-Handling

**Erstellt:** 2026-01-29
**Analyst:** Claude (Test-Entwickler)
**Status:** KRITISCHE + HOHE LÜCKEN IDENTIFIZIERT
**Priorität:** 🔴 KRITISCH (Pflanzenschäden möglich)

---

## Executive Summary

Die Analyse der Driver-Schicht hat **5 kritische/hohe Firmware-Lücken** identifiziert:

| # | Lücke | Firmware-Status | Wokwi-Testbar | Risiko |
|---|-------|-----------------|---------------|--------|
| 1 | OneWire: -127°C Fehlerwert | ❌ NICHT IMPLEMENTIERT | ❌ Nein | 🔴 KRITISCH |
| 2 | OneWire: 85°C Power-On-Reset | ❌ NICHT IMPLEMENTIERT | ❌ Nein | 🔴 KRITISCH |
| 3 | OneWire: Sensor-Disconnect | ⚠️ TEILWEISE | ❌ Nein | 🔴 KRITISCH |
| 4 | I2C: Auto-Bus-Reset (Error 4/5) | ❌ NICHT IMPLEMENTIERT | ❌ Nein | 🟠 HOCH |
| 5 | I2C: Partieller Sensor-Ausfall | ✅ GUT | ❌ Nein | 🟢 OK |

**Fazit:** OneWire hat kritische Validierungslücken. I2C hat gute Fehlerbehandlung, aber keine Bus-Recovery.

---

## Teil A: OneWire Lücken (KRITISCH)

### A1. DS18B20 liefert -127°C (RAW: -2032)

**Problem:**
DS18B20 liefert -127°C bei Kommunikationsfehlern. Firmware gibt `true` zurück ohne Validierung.

**Datei:** [onewire_bus.cpp](El Trabajante/src/drivers/onewire_bus.cpp) Zeile 281-290
**Konsequenz:** Server aktiviert Emergency-Heizung → Pflanzen sterben

**Empfohlener Fix:**
```cpp
// Nach Zeile 281, VOR return true:
if (raw_value == -2032) {
    LOG_ERROR("DS18B20 fault: -127°C (disconnected/defective)");
    errorTracker.trackError(ERROR_ONEWIRE_DEVICE_DISCONNECTED, ...);
    return false;
}
```

**Test erstellt:** `08-onewire/onewire_error_minus127.yaml`

---

### A2. DS18B20 liefert 85°C (RAW: 1360) nach Power-On

**Problem:**
Factory-Default-Wert 85°C wird nach Power-On geliefert, bevor erste echte Messung.

**Datei:** [onewire_bus.cpp](El Trabajante/src/drivers/onewire_bus.cpp) Zeile 222-291
**Konsequenz:** Server aktiviert Kühlsystem → Energieverschwendung

**Empfohlener Fix:**
```cpp
static bool first_reading_flag = true;
if (first_reading_flag && raw_value == 1360) {
    LOG_WARNING("DS18B20 power-on reset (85°C) - retrying");
    first_reading_flag = false;
    delay(100);
    return readRawTemperature(rom_code, raw_value);
}
first_reading_flag = false;
```

**Test erstellt:** `08-onewire/onewire_error_85c_poweron.yaml`

---

### A3. Sensor verschwindet nach erfolgreicher Discovery

**Problem:**
Sensor funktioniert bei Boot, wird später abgetrennt. Kein automatisches Alert.

**Existiert:** `isDevicePresent()` Funktion ✅
**Fehlt:** State-Tracking, automatisches Alert, proaktive Prüfung

**Test erstellt:** `08-onewire/onewire_sensor_disappears.yaml`

---

## Teil B: I2C Lücken (HOCH)

### B1. Auto-Bus-Reset bei Error 4/5

**Problem:**
I2C-Bus kann "hängen" (Error 4 = Other, Error 5 = Timeout). Aktuell: Bus wird disabled, alle Sensoren fallen aus.

**Datei:** [i2c_bus.cpp](El Trabajante/src/drivers/i2c_bus.cpp) Zeile 103-110

**Aktuelles Verhalten:**
```cpp
if (error == 4) {
    LOG_ERROR("I2C bus error: Bus not functional");
    Wire.end();
    return false;  // PERMANENT FAILURE!
}
```

**Empfohlener Fix:**
```cpp
bool I2CBusManager::recoverBus() {
    LOG_WARNING("I2C bus recovery initiated");
    Wire.end();

    // Clock out stuck data
    pinMode(scl_pin_, OUTPUT);
    pinMode(sda_pin_, INPUT_PULLUP);
    for (int i = 0; i < 9; i++) {
        digitalWrite(scl_pin_, LOW);
        delayMicroseconds(5);
        digitalWrite(scl_pin_, HIGH);
        delayMicroseconds(5);
    }

    // Generate STOP
    pinMode(sda_pin_, OUTPUT);
    digitalWrite(sda_pin_, LOW);
    delayMicroseconds(5);
    digitalWrite(sda_pin_, HIGH);

    return Wire.begin(sda_pin_, scl_pin_, frequency_);
}
```

**Test erstellt:** `08-i2c/i2c_bus_recovery.yaml`

---

### B2. Partieller Sensor-Ausfall (BEREITS GUT IMPLEMENTIERT)

**Status:** ✅ GUT IMPLEMENTIERT

**Was existiert:**
- Error-Codes 2/3 (NACK) korrekt von 4/5 (Bus-Error) unterschieden
- Individuelle Sensor-Fehler crashen nicht den Bus
- `isDevicePresent()` kann spezifische Geräte prüfen

**Test erstellt:** `08-i2c/i2c_partial_sensor_failure.yaml` (Dokumentation)

---

## Wokwi-Testbarkeit

| Szenario | Wokwi-Simulation möglich? | Workaround |
|----------|---------------------------|------------|
| -127°C Fehlerwert | ❌ Nein | Code-Review-Test |
| 85°C Power-On | ❌ Nein | Code-Review-Test |
| Sensor-Disconnect | ❌ Nein | Hardware-Test |
| I2C Bus-Error | ❌ Nein | Hardware-Test |
| I2C Partial Failure | ❌ Nein | Hardware-Test |

**Alle Tests dokumentieren erwartetes Verhalten für Code-Review und Hardware-Tests.**

---

## Erstellte Test-Dateien

### OneWire (3 Tests)
| Datei | Kategorie | Status |
|-------|-----------|--------|
| `onewire_error_minus127.yaml` | CRITICAL-001 | ✅ Erstellt |
| `onewire_error_85c_poweron.yaml` | CRITICAL-002 | ✅ Erstellt |
| `onewire_sensor_disappears.yaml` | CRITICAL-003 | ✅ Erstellt |

### I2C (2 Tests)
| Datei | Kategorie | Status |
|-------|-----------|--------|
| `i2c_bus_recovery.yaml` | HIGH-001 | ✅ Erstellt |
| `i2c_partial_sensor_failure.yaml` | HIGH-002 | ✅ Erstellt |

---

## Nächste Schritte

### Für Product Owner / Firmware-Entwickler

**Priorität 1 - KRITISCH (OneWire):**
1. -127°C Validierung in `readRawTemperature()` hinzufügen
2. 85°C Power-On-Detection implementieren
3. Sensor-Disconnect-Alerting implementieren

**Priorität 2 - HOCH (I2C):**
4. Bus-Recovery-Funktion `recoverBus()` implementieren
5. Automatischen Recovery-Versuch bei Error 4/5 einbauen

### Für Test-Entwickler
1. ✅ Test-YAML-Dateien erstellt (5 Tests)
2. Nach Firmware-Fix: Tests erweitern mit `expect-serial` für Error-Patterns
3. Hardware-Tests planen für physische Validierung

---

## Appendix: Relevante Code-Stellen

### OneWire Error Codes (error_codes.h)
```
ERROR_ONEWIRE_INIT_FAILED       = 1020
ERROR_ONEWIRE_NO_DEVICES        = 1021
ERROR_ONEWIRE_READ_FAILED       = 1022
ERROR_ONEWIRE_DEVICE_NOT_FOUND  = 1025
ERROR_ONEWIRE_READ_TIMEOUT      = 1028
```
**Hinweis:** `ERROR_ONEWIRE_DEVICE_DISCONNECTED` fehlt - sollte hinzugefügt werden.

### I2C Error Codes (error_codes.h)
```
ERROR_I2C_INIT_FAILED       = 1010
ERROR_I2C_DEVICE_NOT_FOUND  = 1011
ERROR_I2C_READ_FAILED       = 1012
ERROR_I2C_WRITE_FAILED      = 1013
ERROR_I2C_BUS_ERROR         = 1014
```

### Wire Library Error Codes
```
0 = Success
1 = Data too long
2 = NACK on address
3 = NACK on data
4 = Other error (bus stuck)
5 = Timeout (ESP32)
```

---

**Dokumentation erstellt von:** Claude (Test-Entwickler)
**Review-Status:** Pending Product Owner Entscheidung
**Letzte Aktualisierung:** 2026-01-29
