# Automation-One Framework

> **Für KI-Agenten:** Fokussierte Dokumentation für industrielle IoT-Entwicklung

---

## 1. Schnellstart

### El Trabajante (ESP32 Firmware)

```bash
cd "El Trabajante"

# Build für XIAO ESP32-C3
pio run -e seeed_xiao_esp32c3

# Build für ESP32 Dev Board
pio run -e esp32_dev

# Tests ausführen (KEIN Server nötig!)
pio test -e esp32_dev

# Flash auf Device
pio run -e esp32_dev -t upload

# Serial Monitor
pio device monitor
```

### El Servador (God-Kaiser Server)

```bash
cd "El Servador"

# Dependencies installieren
poetry install

# Tests ausführen
poetry run pytest -v --cov

# Server starten
poetry run uvicorn god_kaiser_server.src.main:app --reload
```

---

## 2. Architektur

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: God (Raspberry Pi 5)                               │
│ Rolle: KI/Analytics, Predictions, Model Training            │
└─────────────────────────────────────────────────────────────┘
                          ↕ HTTP REST
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: God-Kaiser (Raspberry Pi 5)                        │
│ Rolle: Control Hub, MQTT Broker, Database, Logic Engine     │
└─────────────────────────────────────────────────────────────┘
                          ↕ MQTT (TLS)
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Kaiser (Raspberry Pi Zero) - OPTIONAL              │
│ Rolle: Relay Node für Skalierung (100+ ESPs)                │
└─────────────────────────────────────────────────────────────┘
                          ↕ MQTT
┌─────────────────────────────────────────────────────────────┐
│ LAYER 4: ESP32-Agenten (WROOM/XIAO C3)                     │
│ Rolle: Sensor-Auslesung, Aktor-Steuerung                    │
└─────────────────────────────────────────────────────────────┘
```

**Kern-Konzept: Pi-Enhanced Mode (Standard)**
- ESP32 sendet RAW-Werte (analogRead/digitalRead)
- God-Kaiser verarbeitet mit Python Sensor-Libraries
- ESP32 empfängt verarbeitete Werte zurück
- **Vorteil:** Sofort einsatzbereit, keine ESP-Code-Änderung nötig

---

## 3. Test-Philosophie

### 3.1 Server-unabhängige Tests

**Alle ESP32-Tests laufen OHNE Server dank:**

- **MockMQTTBroker** - Simuliert MQTT lokal im Test
- **VirtualActuatorDriver** - Simuliert Hardware (Pump, Valve, PWM)
- **TEST_IGNORE** - Graceful Degradation bei fehlenden GPIOs

**Warum wichtig:**
- Server-Entwickler können ESP-Code testen ohne Hardware
- CI/CD läuft ohne physische ESPs
- Schneller Feedback-Loop (keine MQTT-Broker-Setup nötig)

### 3.2 Dual-Mode-Pattern (PFLICHT für jeden Test!)

**Jeder Test muss Production-safe sein:**

```cpp
// MODE 1: Suche existierende Ressource (Production-System)
uint8_t gpio = findExistingSensor("analog");

// MODE 2: Falls nicht vorhanden → Erstelle temporäre (New System)
if (gpio == 255) {
    gpio = findFreeTestGPIO("analog");
    TemporaryTestSensor temp(gpio, "TestAnalogSensor");

    // Test-Logik hier...
    int value = sensorManager.readSensor(gpio);
    TEST_ASSERT_GREATER_THAN(0, value);

}  // Auto-Cleanup durch RAII - kein manuelles delete!
```

**Warum:**
- **Production:** Nutzt vorhandene Konfiguration, ändert nichts
- **New System:** Erstellt temporäre Config, räumt automatisch auf
- **Kein Config-Chaos:** Tests hinterlassen keine Artefakte

### 3.3 RAII-Cleanup (NIEMALS manuelles delete!)

**RICHTIG - Auto-Cleanup durch RAII:**

```cpp
// Temporärer Sensor - Cleanup bei Scope-Ende
TemporaryTestSensor temp(gpio, "TempSensor");

// Smart Pointer für Actuators
std::unique_ptr<TemporaryTestActuator> act =
    std::make_unique<TemporaryTestActuator>(gpio, ActuatorTypeTokens::PUMP);

// Destruktor räumt automatisch auf!
```

**FALSCH - Manuelles Memory-Management:**

```cpp
// ❌ VERBOTEN - Memory-Leak-Gefahr!
SensorConfig* cfg = new SensorConfig();
delete cfg;  // Vergessen? → Memory Leak!

// ❌ VERBOTEN - Exception-unsafe!
ActuatorConfig* act = new ActuatorConfig();
// Exception hier? → Memory Leak!
delete act;
```

**Regel:** Wenn du `new`/`delete` schreibst, machst du etwas falsch!

### 3.4 Test-Output-Format (Unity)

```
test/test_sensor_manager.cpp:365:test_analog_sensor_raw_reading:PASS
test/test_sensor_manager.cpp:457:test_digital_sensor_plausibility:PASS
test/test_actuator_manager.cpp:123:test_pump_control:IGNORE
-----------------------
3 Tests 0 Failures 1 Ignored
OK
```

**Format:** `<datei>:<zeile>:<test_name>:<status>`

**Status-Codes:**
- `PASS` - Test erfolgreich, alles OK
- `FAIL` - Test fehlgeschlagen, Code ist kaputt!
- `IGNORE` - Ressource fehlt (GPIO, Hardware), aber OK

---

## 4. MQTT-Protokoll (Kurzreferenz)

### Topic-Schema

**ESP → God-Kaiser:**
```
kaiser/god/esp/{esp_id}/sensor/{gpio}/data
kaiser/god/esp/{esp_id}/actuator/{gpio}/status
kaiser/god/esp/{esp_id}/health/status
```

**God-Kaiser → ESP:**
```
kaiser/god/esp/{esp_id}/actuator/{gpio}/command
kaiser/god/esp/{esp_id}/config/sensor/{gpio}
kaiser/god/esp/{esp_id}/system/command
```

**Details:** Siehe `El Trabajante/docs/Mqtt_Protocoll.md`

---

## 5. Safety-Constraints

### 5.1 Aktor-Sicherheit

**KRITISCHE Regeln - NIEMALS ignorieren:**

1. **Emergency-Stop hat IMMER Priorität**
   ```cpp
   if (emergencyStop) {
       actuatorManager.shutdownAll();
       return;  // Keine weiteren Commands!
   }
   ```

2. **PWM-Limits: 0.0 - 1.0**
   ```cpp
   // Wird intern auf 0-255 gemappt
   actuatorManager.controlActuatorPWM(gpio, 0.75);  // 75% Power
   ```

3. **Timeout-Protection**
   - Aktoren schalten nach `MAX_RUNTIME` Sekunden automatisch ab
   - Verhindert Überhitzung, Überlauf, etc.

4. **Safety-Controller prüft IMMER:**
   ```cpp
   // In actuator_manager.cpp:
   if (!safetyController.checkConstraints(gpio, value)) {
       return false;  // Command rejected!
   }
   ```

### 5.2 GPIO-Konflikte

**NIEMALS gleichen GPIO für Sensor UND Aktor:**

```cpp
// VOR jeder GPIO-Nutzung:
if (!gpioManager.isPinAvailable(gpio)) {
    return ERROR_GPIO_CONFLICT;
}

// Sensor reserviert Pin:
gpioManager.reservePin(gpio, PinMode::ANALOG_INPUT);

// Aktor kann diesen Pin NICHT mehr nutzen!
```

**Konflikt-Resolution:**
- ConfigManager prüft bei jedem `addSensor`/`addActuator`
- Safe-Mode verhindert Mehrfachnutzung
- Factory-Pattern wirft Exception bei Konflikt

---

## 6. Fehlercode-Referenz

**Wichtigste Error-Codes:**

### Hardware (1000-1999)
```cpp
ERROR_GPIO_CONFLICT         1002   // GPIO bereits belegt
ERROR_GPIO_INIT_FAILED      1003   // Hardware-Init fehlgeschlagen
ERROR_SENSOR_READ_FAILED    1040   // Sensor antwortet nicht
ERROR_ACTUATOR_SET_FAILED   1050   // Aktor-Command fehlgeschlagen
```

### Service (2000-2999)
```cpp
ERROR_CONFIG_INVALID        2001   // Ungültige Konfiguration
ERROR_CONFIG_STORAGE_FULL   2002   // NVS voll
ERROR_SENSOR_NOT_CONFIGURED 2010   // Sensor nicht konfiguriert
```

### Communication (3000-3999)
```cpp
ERROR_MQTT_NOT_CONNECTED    3001   // MQTT-Verbindung fehlt
ERROR_MQTT_PUBLISH_FAILED   3002   // Publish fehlgeschlagen
ERROR_WIFI_NOT_CONNECTED    3010   // WiFi offline
```

**Vollständige Liste:** `El Trabajante/src/models/error_codes.h`

---

## 7. Cursor/KI-Test-Integration

### Tests starten (ohne Server)

```bash
cd "El Trabajante"

# Alle Tests
pio test -e esp32_dev 2>&1 | tee test_output.log

# Einzelne Test-Datei
pio test -e esp32_dev -f test_sensor_manager

# Mit Serial-Monitor (Live-Output)
pio test -e esp32_dev && pio device monitor
```

### Output-Parsing für KI

**Erfolgreich:**
```
:PASS → Test erfolgreich
```

**Fehler analysieren:**
```
:FAIL → Code ist kaputt, analysiere Fehlermeldung
```

**Ressource fehlt (OK):**
```
:IGNORE → GPIO/Hardware fehlt, aber graceful degradation
```

### Automatisierte Auswertung

```bash
# Nur Fehler anzeigen
grep ":FAIL" test_output.log

# Zusammenfassung
tail -5 test_output.log

# Ignorierte Tests (optional prüfen)
grep ":IGNORE" test_output.log
```

**Workflow:**
1. Test-Command ausführen
2. Output nach `:FAIL` greppen
3. Falls FAIL: Zeile + Fehlermeldung analysieren
4. Falls nur IGNORE/PASS: Code ist OK

**Details:** Siehe `TEST_WORKFLOW.md`

---

## 8. Projektstruktur (Kurzübersicht)

```
El Trabajante/                    # ESP32 Firmware
├── src/
│   ├── core/                     # Application, MainLoop, SystemController
│   ├── services/
│   │   ├── sensor/               # SensorManager, Pi-Enhanced, Drivers
│   │   ├── actuator/             # ActuatorManager, SafetyController
│   │   ├── communication/        # MQTT, HTTP, WiFi
│   │   └── config/               # ConfigManager, StorageManager
│   ├── models/                   # Types, Error Codes, MQTT Messages
│   └── error_handling/           # HealthMonitor, CircuitBreaker
├── test/                         # Unit Tests (MockMQTT, VirtualDrivers)
└── docs/                         # System Flows, API Reference

El Servador/                      # God-Kaiser Server
└── god_kaiser_server/
    ├── src/
    │   ├── api/v1/               # REST Endpoints
    │   ├── mqtt/                 # MQTT Handlers
    │   ├── sensors/              # Python Sensor Libraries
    │   └── db/                   # SQLAlchemy Models
    └── tests/                    # pytest Tests
```

---

## 9. Wichtige Dokumentation

### ESP32 Development:
- **Test-Patterns:** `El Trabajante/test/README.md` (31K Tokens - sehr detailliert!)
- **System Flows:** `El Trabajante/docs/system-flows/`
- **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`
- **API Reference:** `El Trabajante/docs/API_REFERENCE.md`

### Server Development:
- **Architecture:** `El Servador/god_kaiser_server/docs/ARCHITECTURE.md`
- **API Docs:** `El Servador/god_kaiser_server/docs/API.md`
- **Testing:** `El Servador/god_kaiser_server/docs/TESTING.md`

### Provisioning & Zones:
- **Design:** `El Trabajante/docs/Dynamic Zones and Provisioning/PROVISIONING_DESIGN.md`
- **Implementation:** `El Trabajante/docs/Dynamic Zones and Provisioning/DYNAMIC_ZONES_IMPLEMENTATION.md`

---

## 10. Feature Flags (Build-Konfiguration)

**Wichtige Flags in `platformio.ini`:**

```ini
-DDYNAMIC_LIBRARY_SUPPORT=1     # OTA Library Support
-DHIERARCHICAL_ZONES=1          # Zone-System
-DOTA_LIBRARY_ENABLED=1         # OTA Updates
-DSAFE_MODE_PROTECTION=1        # GPIO Safe-Mode
-DZONE_MASTER_ENABLED=1         # Zone-Master
-DCONFIG_ENABLE_THREAD_SAFETY   # Mutex-Schutz (Phase 6+)
```

**Environment-spezifisch:**
- `XIAO_ESP32C3_MODE=1` - MAX_SENSORS=10, MAX_ACTUATORS=6
- `ESP32_DEV_MODE=1` - MAX_SENSORS=20, MAX_ACTUATORS=12

---

## 11. Best Practices für KI-Agenten

### Bei neuen Features:

1. **Sensor hinzufügen:**
   - Pi-Enhanced: `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`
   - **Keine ESP-Änderung nötig!**

2. **Aktor hinzufügen:**
   - ESP Driver: `El Trabajante/src/services/actuator/actuator_drivers/`
   - Factory-Pattern nutzen
   - Safety-Constraints definieren

3. **Tests schreiben:**
   - Dual-Mode-Pattern verwenden
   - RAII-Cleanup nutzen
   - MockMQTTBroker für MQTT-Tests

### Vor jedem Commit:

```bash
# Tests laufen lassen
pio test -e esp32_dev

# Nur committen wenn:
# - Keine :FAIL im Output
# - :IGNORE ist OK (fehlende Hardware)
```

---

**Letzte Aktualisierung:** 2025-11-23
**Version:** 2.0 (Fokussiert auf Test-Integration)
