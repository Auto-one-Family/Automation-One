# Test-Workflow für KI-Agenten

> **Zweck:** Test-Ausführung und Auswertung für AutoOne-Projekt  
> **Themengebiet:** Test-Workflows (ESP32 + Server)  
> **Verwandte Dokumente:** `El Servador/docs/ESP32_TESTING.md`, `El Trabajante/test/_archive/README.md`

---

## Übersicht: Zwei Test-Systeme

**AutoOne hat zwei getrennte Test-Systeme:**

### 1. Server-Orchestrierte Tests (EMPFOHLEN)
- **Location:** `El Servador/god_kaiser_server/tests/esp32/`
- **Framework:** pytest (Python)
- **Zweck:** ESP32-Funktionalität via MQTT testen
- **Vorteile:** Hardware-unabhängig, CI/CD-ready, schnell
- **Dokumentation:** `El Servador/docs/ESP32_TESTING.md` 👈 **VOLLSTÄNDIGE TEST-DOKU HIER**

### 2. Legacy PlatformIO Tests (ARCHIVIERT)
- **Location:** `El Trabajante/test/_archive/`
- **Framework:** Unity (C++)
- **Status:** Archiviert (PlatformIO-Linker-Probleme)
- **Dokumentation:** `El Trabajante/test/_archive/README.md`

**Dieser Workflow fokussiert auf PlatformIO Test-Management und verweist für Server-Tests auf `ESP32_TESTING.md`.**

---

## 1. Server-Tests (pytest) - Empfohlen

**Vollständige Dokumentation:** `El Servador/docs/ESP32_TESTING.md`

**Schnellstart:**
```bash
cd "El Servador"
poetry install
poetry run pytest god_kaiser_server/tests/esp32/ -v
```

**Test-Kategorien:**
- Communication Tests (~20)
- Infrastructure Tests (~30)
- Actuator Tests (~40)
- Sensor Tests (~30)
- Integration Tests (~20)

**GESAMT: ~140 Tests**

Siehe: `El Servador/docs/ESP32_TESTING.md` für Details zu Fixtures, MockESP32Client API, Best Practices.

---

## 2. Legacy PlatformIO Tests - Archiviert

### Voraussetzungen

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

## 3. Test-Kategorien (Dynamic File Management)

### Problem: Multiple-Definition-Errors

**Fundamentales PlatformIO-Limit:**
- PlatformIO kompiliert ALLE `.cpp` Dateien im `test/` Ordner zusammen in EINE Firmware
- Jeder Test hat eigene `setup()`/`loop()` Funktionen → Multiple-Definition-Error
- `--filter` Parameter filtert nur AUSFÜHRUNG, nicht BUILD
- `test_ignore` Parameter funktioniert NICHT (verhindert nur Test-Discovery, nicht Kompilierung)

**Konsequenz:** Alle Tests gleichzeitig im `test/` Ordner funktioniert NICHT.

### Lösung: Option C - Dynamic File Management Script

**Konzept:** PowerShell-Script verschiebt Tests temporär in/aus dem `test/` Verzeichnis.

**Workflow:**
1. Script archiviert alle Tests nach `test/_archive/`
2. Kopiert nur gewünschte Kategorie zurück nach `test/`
3. Führt Tests aus mit `pio test -e esp32_dev`
4. Räumt auf - alle Tests zurück ins Archiv
5. Zeigt klare PASS/FAIL/IGNORE Zusammenfassung

**Tests sind prefix-kategorisiert:**
- `actuator_*.cpp` - Actuator-System (6 Tests)
- `sensor_*.cpp` - Sensor-System (5 Tests)
- `comm_*.cpp` - Communication (3 Tests)
- `infra_*.cpp` - Infrastructure (5 Tests)
- `integration_*.cpp` - Integration (2 Tests)

### Test-Ausführung mit Script (EMPFOHLEN)

**Via Slash-Command (einfachste Methode für KI-Agenten):**

```bash
/esp-test-category infra
/esp-test-category actuator
/esp-test-category sensor
/esp-test-category comm
/esp-test-category integration
/esp-test-category all
```

**Direkter Script-Aufruf:**

```powershell
cd "El Trabajante"

# Infrastructure-Tests (Error-Tracking, Config, Storage, Logger, Topics)
.\scripts\run-test-category.ps1 -Category infra

# Actuator-Tests (Manager, Safety, PWM, Integration)
.\scripts\run-test-category.ps1 -Category actuator

# Sensor-Tests (Manager, Pi-Enhanced, I2C, OneWire, Integration)
.\scripts\run-test-category.ps1 -Category sensor

# Communication-Tests (MQTT, WiFi, HTTP)
.\scripts\run-test-category.ps1 -Category comm

# Integration-Tests (Full-System, Phase2)
.\scripts\run-test-category.ps1 -Category integration

# ALLE Kategorien sequentiell
.\scripts\run-test-category.ps1 -Category all
```

### Was das Script macht

```
┌─────────────────────────────────────────┐
│ 1. Initialize Archive                   │
│    test/_archive/ erstellen             │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 2. Move all *.cpp to _archive/          │
│    (helpers/ bleibt unberührt)          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 3. Copy category tests back             │
│    z.B. infra_*.cpp → test/             │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 4. Run PlatformIO tests                 │
│    pio test -e esp32_dev                │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 5. Cleanup - Move back to archive       │
│    test/*.cpp → _archive/               │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 6. Report Results                        │
│    PASS/FAIL/IGNORE Summary             │
└─────────────────────────────────────────┘
```

### Script-Features

- ✅ **Automatische Cleanup**: Tests werden IMMER zurück ins Archiv verschoben
- ✅ **Fehler-Handling**: Emergency-Cleanup bei Script-Abbruch
- ✅ **Colored Output**: Grün=PASS, Rot=FAIL, Gelb=IGNORE
- ✅ **Logging**: Output geht nach `test/test_output.log`
- ✅ **Summary**: Klare Zusammenfassung am Ende
- ✅ **Exit Codes**: 0=Success, 1=Failure (CI/CD-ready)

### Test-Mapping (Referenz für KI)

| Kategorie | Slash-Command | Script Parameter | Test-Dateien |
|-----------|---------------|------------------|--------------|
| **Infrastructure** | `/esp-test-category infra` | `-Category infra` | `infra_config_manager.cpp`, `infra_storage_manager.cpp`, `infra_error_tracker.cpp`, `infra_logger.cpp`, `infra_topic_builder.cpp` |
| **Actuator** | `/esp-test-category actuator` | `-Category actuator` | `actuator_config.cpp`, `actuator_manager.cpp`, `actuator_integration.cpp`, `actuator_models.cpp`, `actuator_safety_controller.cpp`, `actuator_pwm_controller.cpp` |
| **Sensor** | `/esp-test-category sensor` | `-Category sensor` | `sensor_manager.cpp`, `sensor_integration.cpp`, `sensor_pi_enhanced.cpp`, `sensor_i2c_bus.cpp`, `sensor_onewire_bus.cpp` |
| **Communication** | `/esp-test-category comm` | `-Category comm` | `comm_mqtt_client.cpp`, `comm_wifi_manager.cpp`, `comm_http_client.cpp` |
| **Integration** | `/esp-test-category integration` | `-Category integration` | `integration_full.cpp`, `integration_phase2.cpp` |
| **Alle** | `/esp-test-category all` | `-Category all` | Alle Kategorien sequentiell |

### WICHTIG für KI-Agenten

1. **IMMER Script nutzen** - Nicht direkt `pio test` ohne File-Management
2. **Slash-Command bevorzugen** - Einfachster Workflow
3. **ONE FILE AT A TIME** - Script läuft jeden Test einzeln (verhindert multiple-definition errors)
4. **Archive-State prüfen** - Bei Problemen: `ls test/_archive/*.cpp` sollte alle Tests enthalten
5. **IGNORE ist OK** - Fehlende Hardware ist graceful degradation, kein Fehler

### Server-Tests Status ✅

**Status:** ✅ Produktionsreif - Vollständig dokumentiert in `El Servador/docs/ESP32_TESTING.md`

**Für Server-Test-Details siehe:**
- 📄 `El Servador/docs/ESP32_TESTING.md` - Vollständige Test-Dokumentation
- 📄 `El Servador/docs/MQTT_TEST_PROTOCOL.md` - MQTT Command-Spezifikation
- 📄 `El Trabajante/test/_archive/README.md` - Legacy Test Migration-Mapping

---

## 4. Output-Analyse

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

## 5. Test-Pattern Referenzen

**Server-Tests (pytest):**
- 📄 `El Servador/docs/ESP32_TESTING.md` - MockESP32Client API, Fixtures, Best Practices

**Legacy Unity-Tests (archiviert):**
- 📄 `El Trabajante/test/_archive/README.md` - Historische Test-Patterns, Migration-Mapping

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

---

## Dokumentations-Hierarchie

**Dieser Workflow beschreibt:** PlatformIO Test-Ausführung und -Management

**Für detaillierte Test-Dokumentation siehe:**
1. 📄 `El Servador/docs/ESP32_TESTING.md` - **Server-Tests (VOLLSTÄNDIG)**
   - MockESP32Client API
   - Test-Kategorien (140+ Tests)
   - Fixtures, Best Practices
   - pytest Kommandos

2. 📄 `El Trabajante/test/_archive/README.md` - Legacy Tests
   - Migrations-Mapping
   - Warum archiviert
   - Historische Test-Patterns

---

**Letzte Aktualisierung:** 2025-11-26
**Version:** 2.1 (Fokussiert auf PlatformIO, verweist auf Server-Test-Doku)

