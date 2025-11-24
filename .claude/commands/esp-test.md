---
description: Führe ESP32 Tests aus und analysiere Ergebnisse
---

# ESP32 Test Suite

Führe die komplette Test-Suite für El Trabajante ESP32 Firmware aus und analysiere die Ergebnisse automatisch.

## Aufgabe

1. **Tests ausführen:**
   ```bash
   cd "El Trabajante"
   ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev 2>&1 | tee test_output.log
   ```

2. **Output analysieren:**
   ```bash
   # Nur Fehler anzeigen
   grep ":FAIL" test_output.log
   
   # Zusammenfassung
   tail -5 test_output.log
   ```

3. **Ergebnisse interpretieren:**
   - **Keine FAIL:** ✅ Code ist OK, kann committed werden
   - **FAIL vorhanden:** ❌ Fehler analysieren und fixen
   - **IGNORE:** ✅ OK - Graceful Degradation (fehlende Hardware)

## Test-Status-Codes

| Status | Bedeutung | Aktion |
|--------|-----------|--------|
| **PASS** | Test erfolgreich | Keine Aktion nötig |
| **FAIL** | Test fehlgeschlagen | **Fehler analysieren!** |
| **IGNORE** | Ressource fehlt | OK - Graceful Degradation |

**WICHTIG:** IGNORE ist **KEIN Fehler**! Tests können auf Production-Systemen GPIOs nicht finden, das ist erwartet.

## Output-Format

Unity-Test-Format:
```
test/test_sensor_manager.cpp:365:test_analog_sensor_raw_reading:PASS
test/test_actuator_manager.cpp:123:test_pump_control:IGNORE
-----------------------
3 Tests 0 Failures 1 Ignored
OK
```

## Verfügbare Optionen

### Einzelne Test-Datei ausführen:
```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev -f test_sensor_manager
```

### Mit Serial-Monitor (Live-Output):
```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev && ~/.platformio/penv/Scripts/platformio.exe device monitor
```

### Nur bestimmte Tests (Name-Filter):
```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev --filter "*mqtt*"
```

## Bei Fehlern

1. **Fehler analysieren:**
   - Zeige fehlerhafte Tests mit `grep ":FAIL" test_output.log`
   - Analysiere Test-Code in der angegebenen Datei/Zeile
   - Prüfe Fehler-Message

2. **Häufige Probleme:**
   - Build-Fehler: Prüfe Includes, Dependencies
   - Test-Failures: Prüfe Test-Logik, MockMQTTBroker Setup
   - Timeout: Prüfe Serial-Port, ESP32-Verbindung

3. **Details konsultieren:**
   - **Test-Patterns:** `El Trabajante/test/README.md`
   - **Test-Workflow:** `.claude/TEST_WORKFLOW.md`
   - **Test-Philosophie:** `CLAUDE.md` Abschnitt 3

## Server-unabhängige Tests

**Alle Tests laufen OHNE Server dank:**
- MockMQTTBroker - Simuliert MQTT lokal
- VirtualActuatorDriver - Simuliert Hardware
- TEST_IGNORE - Graceful Degradation

Siehe `CLAUDE.md` Abschnitt 3.1 für Details.

## Empfohlene Nutzung

**Vor jedem Commit:**
```bash
/esp-test
# Bei PASS/IGNORE: Commit OK
# Bei FAIL: Fixen und erneut testen
```

**Nach Code-Änderungen:**
```bash
/esp-test
# Prüfe ob bestehende Tests noch funktionieren
```

