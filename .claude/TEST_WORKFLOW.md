# Test-Workflow für KI-Agenten (Cursor, Claude Code)

> **Zweck:** Automatisierte Test-Auswertung ohne manuelles Monitoring

---

## 1. Voraussetzungen

**Hardware:**
- ESP32 via USB verbunden (optional - Tests laufen auch ohne!)
- Serial Port verfügbar (für Live-Output)

**Software:**
- PlatformIO installiert (`pio --version`)
- **KEIN Server nötig** - MockMQTTBroker simuliert alles lokal

**Warum Server-unabhängig:**
- CI/CD läuft ohne physische Infrastruktur
- Server-Entwickler können ESP-Code testen
- Schneller Feedback-Loop (keine MQTT-Broker-Setup)

---

## 2. Test-Ausführung

### Von Root-Verzeichnis (empfohlen für KI-Agenten)

```bash
# Alle Tests mit Output-Logging
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | tee test_output.log

# Einzelne Test-Datei
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev -f test_sensor_manager

# Mit Serial-Monitor (Live-Output)
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev && ~/.platformio/penv/Scripts/platformio.exe device monitor
```

**Was passiert:**
- Flash ESP32 mit Test-Firmware
- Führt alle `test_*.cpp` Dateien aus
- Output geht nach STDOUT + `test_output.log`
- Exit Code: 0 = OK, 1 = Fehler

### Innerhalb El Trabajante Ordner

```bash
cd "El Trabajante"

# Alle Tests
pio test -e esp32_dev 2>&1 | tee test_output.log

# Einzelne Test-Datei
pio test -e esp32_dev -f test_sensor_manager
```

---

## 3. Output-Analyse

### Unity-Format verstehen

**Standard-Format:**
```
<datei>:<zeile>:<test_name>:<status>
```

**Beispiel-Output:**
```
test/test_sensor_manager.cpp:365:test_analog_sensor_raw_reading:PASS
test/test_sensor_manager.cpp:457:test_digital_sensor_plausibility:PASS
test/test_actuator_manager.cpp:123:test_pump_control:IGNORE (No free actuator GPIO available)
-----------------------
3 Tests 0 Failures 1 Ignored
OK
```

### Status-Codes

| Status | Bedeutung | Aktion für KI |
|--------|-----------|---------------|
| **PASS** | Test erfolgreich | Keine Aktion nötig |
| **FAIL** | Test fehlgeschlagen | **Fehler analysieren!** |
| **IGNORE** | Ressource fehlt | OK - Graceful Degradation |

**WICHTIG:** IGNORE ist **KEIN Fehler**!
- Production-System: GPIO bereits belegt → IGNORE
- New System: Kein freier GPIO → IGNORE
- CI/CD: Keine Hardware → IGNORE (trotzdem OK)

### Fehler-Analyse (automatisiert)

```bash
# Nur Fehler extrahieren
grep ":FAIL" test_output.log

# Zusammenfassung (letzte 5 Zeilen)
tail -5 test_output.log

# Ignorierte Tests prüfen (optional)
grep ":IGNORE" test_output.log

# Anzahl Fehler zählen
grep -c ":FAIL" test_output.log
```

**KI-Workflow:**
1. `grep ":FAIL"` ausführen
2. Falls Output leer → ✅ Alles OK
3. Falls Output vorhanden → ❌ Fehler analysieren:
   - Datei + Zeile extrahieren
   - Test-Code lesen
   - Fehler-Message analysieren
   - Fix vorschlagen

---

## 4. Typische Szenarien

### Szenario A: Perfekt - Alle Tests PASS

**Output:**
```
-----------------------
10 Tests 0 Failures 0 Ignored
OK
```

**Interpretation:**
- ✅ Code ist produktionsreif
- ✅ Kann committed werden
- ✅ Keine weitere Aktion nötig

### Szenario B: OK - Einige IGNORE

**Output:**
```
test/test_sensor_manager.cpp:234:test_sht31_temperature:IGNORE (No free I2C sensor available)
test/test_actuator_manager.cpp:567:test_pump_runtime:IGNORE (No free actuator GPIO)
-----------------------
8 Tests 0 Failures 2 Ignored
OK
```

**Interpretation:**
- ✅ Code ist OK
- ✅ IGNORE = fehlende GPIOs/Hardware (erwartet!)
- ✅ Kann committed werden

### Szenario C: FEHLER - FAIL vorhanden

**Output:**
```
test/test_sensor_manager.cpp:345:test_analog_sensor_reading:FAIL
Expected 0 Was 1001
-----------------------
7 Tests 1 Failures 2 Ignored
FAIL
```

**Interpretation:**
- ❌ Code ist kaputt!
- ❌ NICHT committen!
- ❌ Fehler analysieren + fixen

---

## 5. Test-Patterns (Kurzreferenz)

**Für detaillierte Code-Beispiele siehe:** `El Trabajante/test/README.md`

### MockMQTTBroker nutzen

**Zweck:** Simuliert MQTT-Broker lokal (kein Server nötig)

- `setUp()` installiert Hook
- `tearDown()` räumt auf
- `broker.clearPublished()` verhindert Interference zwischen Tests

### VirtualActuatorDriver nutzen

**Zweck:** Simuliert Hardware-Actuators (Pump, Valve, PWM)

- `TemporaryTestActuator` nutzt RAII → kein manuelles delete
- `getVirtualDriver()` gibt Mock-Driver zurück
- `wasCommandCalled()` prüft ob Command ankam

### Dual-Mode-Pattern

**PFLICHT für jeden Test:**
1. Zuerst Production-Device finden (read-only Test)
2. Falls nicht vorhanden: Temporäres Virtual Device erstellen
3. RAII-Cleanup garantiert automatische Bereinigung

**Details:** Siehe `El Trabajante/test/README.md` für vollständige Code-Beispiele.

---

## 6. Troubleshooting

### Problem: "No free GPIO"

**Lösung:**
- ✅ TEST_IGNORE ist OK - **kein Fehler**!
- Production-System: GPIOs sind belegt (erwartet)
- **Nicht tun:** ❌ Production-Config ändern (Tests dürfen Config nicht modifizieren!)

### Problem: Timeout beim Flash

**Lösung:**
```bash
# Verfügbare Ports prüfen
pio device list

# ESP neu verbinden (USB-Kabel)
```

### Problem: Tests hängen

**Lösung:**
```bash
# Serial-Monitor starten (Live-Output)
pio device monitor

# Prüfen wo Test hängt
# → Letzte Log-Message zeigt Stelle
```

### Problem: Random Test-Failures

**Lösung:**
- `setUp()`/`tearDown()` nutzen für Clean State
- Mock-Hardware nutzen (nicht echte Sensoren)
- Delays für Timing-kritische Tests

---

## 7. Best Practices für KI-Agenten

### Workflow nach Code-Änderungen

```bash
# 1. Tests ausführen
cd "El Trabajante"
pio test -e esp32_dev 2>&1 | tee test_output.log

# 2. Fehler prüfen
grep ":FAIL" test_output.log

# 3. Entscheidung:
# - Keine Fehler (leer) → Commit OK
# - Fehler vorhanden → Analysieren + Fixen
```

### Test-Analyse automatisieren

```bash
#!/bin/bash
# test_check.sh - Automatische Test-Auswertung

cd "El Trabajante"
pio test -e esp32_dev 2>&1 | tee test_output.log

FAILURES=$(grep -c ":FAIL" test_output.log || echo "0")

if [ "$FAILURES" -gt 0 ]; then
    echo "❌ $FAILURES Test(s) fehlgeschlagen:"
    grep ":FAIL" test_output.log
    exit 1
else
    echo "✅ Alle Tests erfolgreich (IGNORE ist OK)"
    tail -5 test_output.log
    exit 0
fi
```

---

## 8. Schnellreferenz

### Ein-Zeilen-Commands

```bash
# Tests ausführen + Fehler anzeigen
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | tee test_output.log && grep ":FAIL" test_output.log

# Tests ausführen + nur Zusammenfassung
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | tail -5

# Nur fehlgeschlagene Tests
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | grep -E ":(FAIL|Expected)"
```

---

**Letzte Aktualisierung:** 2025-11-24
**Version:** 2.0 (Gekürzt, fokussiert auf KI-Agenten-Workflow)

