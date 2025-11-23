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

### Alle Tests ausführen:

```bash
cd "El Trabajante"

# Standard: Alle Tests mit Output-Logging
pio test -e esp32_dev 2>&1 | tee test_output.log
```

**Was passiert:**
- Flash ESP32 mit Test-Firmware
- Führt alle `test_*.cpp` Dateien aus
- Output geht nach STDOUT + `test_output.log`
- Exit Code: 0 = OK, 1 = Fehler

### Einzelne Test-Datei (schneller):

```bash
# Nur Sensor-Tests
pio test -e esp32_dev -f test_sensor_manager

# Nur Actuator-Tests
pio test -e esp32_dev -f test_actuator_manager

# Nur MQTT-Tests
pio test -e esp32_dev -f test_mqtt_client
```

**Wann nutzen:**
- Nach Änderungen in einem spezifischen Service
- Für schnelles Debugging
- Wenn andere Tests zu lange dauern

### Mit Serial-Monitor (Live-Output):

```bash
# Tests ausführen + Live-Monitor
pio test -e esp32_dev && pio device monitor
```

**Wann nutzen:**
- Bei hängenden Tests (Timeout-Debugging)
- Bei Crash/Reboot-Problemen
- Für detaillierte ESP-Logs

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

**KI-Response:**
```
✅ Alle 10 Tests erfolgreich
→ Code kann committed werden
```

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

**KI-Response:**
```
✅ 8 Tests erfolgreich, 2 ignoriert (fehlende Hardware - OK)
→ Code kann committed werden
```

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

**KI-Response:**
```
❌ Test fehlgeschlagen: test_analog_sensor_reading
Datei: test/test_sensor_manager.cpp:345
Fehler: Expected 0 Was 1001

→ Analysiere Test-Code + implementierung
→ Fehler beheben
→ Tests erneut ausführen
```

---

## 5. Test-Patterns (Referenz)

### MockMQTTBroker nutzen

**Zweck:** Simuliert MQTT-Broker lokal (kein Server nötig)

```cpp
#include "helpers/mock_mqtt_broker.h"

namespace {
MockMQTTBroker broker;

void setUp(void) {
    // Hook MQTT-Client an Mock-Broker
    mqttClient.setTestPublishHook([](const String& topic, const String& payload) {
        broker.publish(topic, payload);
    });
}

void tearDown(void) {
    mqttClient.clearTestPublishHook();
    broker.clearPublished();  // Cleanup!
}

void test_sensor_publishes_mqtt(void) {
    // Sensor-Reading triggern
    sensorManager.readSensor(4);

    // Prüfen ob MQTT-Message gesendet wurde
    TEST_ASSERT_TRUE(broker.wasPublished("kaiser/god/esp/test/sensor/4/data"));

    // Payload prüfen
    String payload = broker.getLastPayload("kaiser/god/esp/test/sensor/4/data");
    TEST_ASSERT_NOT_EQUAL(-1, payload.indexOf("\"gpio\":4"));
}
}
```

**Wichtig:**
- `setUp()` installiert Hook
- `tearDown()` räumt auf
- `broker.clearPublished()` verhindert Interference zwischen Tests

### VirtualActuatorDriver nutzen

**Zweck:** Simuliert Hardware-Actuators (Pump, Valve, PWM)

```cpp
#include "helpers/temporary_test_actuator.h"

void test_pump_binary_control(void) {
    uint8_t gpio = findFreeTestGPIO("digital_output");
    if (gpio == 255) {
        TEST_IGNORE_MESSAGE("No free GPIO for actuator test");
        return;
    }

    // RAII: Auto-Cleanup bei Scope-Ende
    TemporaryTestActuator temp(gpio, ActuatorTypeTokens::PUMP);
    VirtualActuatorDriver* driver = temp.getVirtualDriver();

    // Command senden
    actuatorManager.controlActuatorBinary(gpio, true);

    // Prüfen ob Driver Command erhielt
    TEST_ASSERT_TRUE(driver->wasCommandCalled("SET_BINARY:ON"));

    // Prüfen ob State korrekt
    TEST_ASSERT_EQUAL(1, driver->getCurrentBinaryState());
}  // Auto-Cleanup hier!
```

**Wichtig:**
- `TemporaryTestActuator` nutzt RAII → kein manuelles delete
- `getVirtualDriver()` gibt Mock-Driver zurück
- `wasCommandCalled()` prüft ob Command ankam

### Assertions richtig nutzen

**Standard-Assertions:**

```cpp
// Werte vergleichen
TEST_ASSERT_EQUAL(expected, actual);
TEST_ASSERT_NOT_EQUAL(val1, val2);

// Größen-Vergleiche
TEST_ASSERT_GREATER_THAN(threshold, value);
TEST_ASSERT_LESS_THAN(threshold, value);

// Booleans
TEST_ASSERT_TRUE(condition);
TEST_ASSERT_FALSE(condition);

// Strings
TEST_ASSERT_EQUAL_STRING("expected", actual);
TEST_ASSERT_NOT_EQUAL(-1, str.indexOf("substring"));  // Substring-Check

// Floats (mit Toleranz)
TEST_ASSERT_FLOAT_WITHIN(0.01, 25.5, sensor_value);
```

**MQTT-spezifisch:**

```cpp
// Topic wurde gepublisht?
TEST_ASSERT_TRUE(broker.wasPublished(topic));

// Payload korrekt?
String payload = broker.getLastPayload(topic);
TEST_ASSERT_NOT_EQUAL(-1, payload.indexOf("\"gpio\":4"));
TEST_ASSERT_NOT_EQUAL(-1, payload.indexOf("\"value\":"));

// Anzahl Messages
TEST_ASSERT_EQUAL(3, broker.getPublishedCount());
```

---

## 6. Troubleshooting

### Problem: "No free GPIO"

**Output:**
```
test/test_sensor_manager.cpp:234:test_analog_sensor:IGNORE (No free analog GPIO available)
```

**Ursache:**
- Board hat nicht genug freie Pins
- Alle GPIOs bereits von Production-Config belegt

**Lösung:**
- ✅ TEST_IGNORE ist OK - **kein Fehler**!
- Production-System: GPIOs sind belegt (erwartet)
- Alternative: Andere Test-GPIOs in `test_helpers.cpp` konfigurieren

**Nicht tun:**
- ❌ Production-Config ändern (Tests dürfen Config nicht modifizieren!)

### Problem: Timeout beim Flash

**Output:**
```
Error: Timed out waiting for packet header
```

**Ursache:**
- ESP32 nicht verbunden
- Falscher Serial-Port
- ESP im Boot-Loop

**Lösung:**
```bash
# Verfügbare Ports prüfen
pio device list

# Richtigen Port in platformio.ini setzen
[env:esp32_dev]
upload_port = /dev/ttyUSB0  # Linux
upload_port = COM3           # Windows

# ESP neu verbinden (USB-Kabel)
```

### Problem: Tests hängen

**Output:**
```
test/test_wifi_manager.cpp:123:test_wifi_connection:
[keine weitere Ausgabe]
```

**Ursache:**
- Endlos-Loop im Test
- WiFi-Timeout zu lang
- Blocking I/O ohne Timeout

**Lösung:**
```bash
# Serial-Monitor starten (Live-Output)
pio device monitor

# Prüfen wo Test hängt
# → Letzte Log-Message zeigt Stelle

# Timeout-Werte reduzieren:
#define WIFI_CONNECT_TIMEOUT 5000  // 5s statt 30s
```

### Problem: Random Test-Failures

**Output:**
```
# Manchmal PASS, manchmal FAIL
test/test_sensor_manager.cpp:456:test_sensor_reading:FAIL
Expected 25 Was 24
```

**Ursache:**
- Timing-Issues (Race Conditions)
- Shared State zwischen Tests (fehlender tearDown)
- Hardware-Noise (echte Sensoren)

**Lösung:**
```cpp
// 1. setUp/tearDown nutzen
void setUp(void) {
    broker.clearPublished();  // Clean State!
}

void tearDown(void) {
    // Cleanup nach jedem Test
}

// 2. Mock-Hardware nutzen (nicht echte Sensoren)
VirtualActuatorDriver* driver = temp.getVirtualDriver();

// 3. Delays für Timing-kritische Tests
delay(100);  // 100ms warten
```

---

## 7. CI/CD Integration

### GitHub Actions Beispiel

```yaml
name: ESP32 Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install PlatformIO
        run: pip install platformio

      - name: Run Tests
        run: |
          cd "El Trabajante"
          pio test -e esp32_dev 2>&1 | tee test_output.log

      - name: Check for Failures
        run: |
          if grep -q ":FAIL" test_output.log; then
            echo "❌ Tests failed!"
            grep ":FAIL" test_output.log
            exit 1
          else
            echo "✅ All tests passed (IGNORE is OK)"
            exit 0
          fi
```

**Wichtig:**
- IGNORE wird NICHT als Fehler gewertet
- Nur FAIL führt zu Exit 1
- `tee` speichert Output für Analyse

---

## 8. Best Practices für KI-Agenten

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

### KI-Prompt-Template

**Für Cursor/Claude Code:**

```
Führe folgende Schritte aus:

1. Wechsle zu "El Trabajante" Directory
2. Führe `pio test -e esp32_dev 2>&1 | tee test_output.log` aus
3. Prüfe Output mit `grep ":FAIL" test_output.log`
4. Falls Fehler:
   - Zeige fehlerhafte Tests
   - Analysiere Test-Code
   - Schlage Fix vor
5. Falls keine Fehler:
   - Zeige Zusammenfassung (tail -5 test_output.log)
   - Bestätige dass Code OK ist
```

---

## 9. Schnellreferenz

### Ein-Zeilen-Commands

```bash
# Tests ausführen + Fehler anzeigen
pio test -e esp32_dev 2>&1 | tee test_output.log && grep ":FAIL" test_output.log

# Tests ausführen + nur Zusammenfassung
pio test -e esp32_dev 2>&1 | tail -5

# Nur fehlgeschlagene Tests
pio test -e esp32_dev 2>&1 | grep -E ":(FAIL|Expected)"

# Test-Count
pio test -e esp32_dev 2>&1 | grep -E "Tests.*Failures.*Ignored"
```

### Test-Status-Check (ohne Tests auszuführen)

```bash
# Zeige letzte Test-Ergebnisse
tail -20 test_output.log

# Prüfe ob alte Fehler vorhanden
grep ":FAIL" test_output.log && echo "❌ Fehler" || echo "✅ OK"
```

---

**Letzte Aktualisierung:** 2025-11-23
**Version:** 1.0
