# Automation-One Framework

> **Für KI-Agenten:** Fokussierte Dokumentation für industrielle IoT-Entwicklung

---

## 0. Quick Decision Tree - Welche Doku lesen?

### 🔧 "Ich will Code ändern"
1. **Welches Modul?** → [Section 9: Modul-Dokumentation Navigation](#9-modul-dokumentation-navigation)
2. **Workflow folgen** → [Section 10: KI-Agenten Workflow](#10-ki-agenten-workflow)
3. **Tests schreiben** → `El Trabajante/test/README.md`
4. **Pattern-Beispiele** → `.claude/WORKFLOW_PATTERNS.md`

### 🐛 "Ich habe einen Fehler"
1. **Build-Fehler?** → `.claude/commands/esp-build.md` + `platformio.ini` prüfen
2. **Test-Fehler?** → `.claude/TEST_WORKFLOW.md` Section 6: Troubleshooting
3. **Runtime-Fehler?** → [Section 6: Fehlercode-Referenz](#6-fehlercode-referenz) + `El Trabajante/src/models/error_codes.h`
4. **MQTT-Problem?** → `El Trabajante/docs/Mqtt_Protocoll.md`
5. **GPIO-Konflikt?** → [Section 5.2: GPIO-Konflikte](#52-gpio-konflikte)

### 📖 "Ich will verstehen wie X funktioniert"
1. **System-Flow?** → `El Trabajante/docs/system-flows/` (Boot, Sensor-Reading, Actuator-Command)
2. **MQTT-Protokoll?** → `El Trabajante/docs/Mqtt_Protocoll.md`
3. **API einer Klasse?** → `El Trabajante/docs/API_REFERENCE.md`
4. **Test-Infrastruktur?** → `El Trabajante/test/README.md`
5. **Modul-Abhängigkeiten?** → `.claude/ARCHITECTURE_DEPENDENCIES.md`

### ➕ "Ich will neues Feature hinzufügen"
1. **Sensor?** → Pi-Enhanced: Server-side Library ([Section 12](#12-best-practices-für-ki-agenten))
2. **Aktor?** → ESP Driver + Safety-Constraints (`.claude/WORKFLOW_PATTERNS.md`)
3. **MQTT-Topic?** → MQTT-Protokoll aktualisieren ([Section 10, Schritt 6](#schritt-6-dokumentation-aktualisieren))
4. **Error-Code?** → `El Trabajante/src/models/error_codes.h` erweitern + dokumentieren
5. **Test?** → Dual-Mode-Pattern ([Section 3.2](#32-dual-mode-pattern-pflicht-für-jeden-test))

---

## 1. Schnellstart

### El Trabajante (ESP32 Firmware)

**WICHTIG:** PlatformIO-Commands funktionieren auf zwei Arten:

#### Option A: Von Root-Verzeichnis (Auto-one) aus arbeiten
```bash
# Build für ESP32 Dev Board
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev

# Build für XIAO ESP32-C3
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e seeed_xiao_esp32c3

# Tests ausführen (KEIN Server nötig!)
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev

# Flash auf Device
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev -t upload
```

#### Option B: Innerhalb El Trabajante Ordner (nur wenn NUR dieser Ordner in VSCode geöffnet ist)
```bash
cd "El Trabajante"

# Build für ESP32 Dev Board
pio run -e esp32_dev

# Build für XIAO ESP32-C3
pio run -e seeed_xiao_esp32c3

# Tests ausführen
pio test -e esp32_dev

# Flash auf Device
pio run -e esp32_dev -t upload

# Serial Monitor
pio device monitor
```

**Empfehlung für KI-Agenten:** Nutze Option A mit vollständigem Pfad - funktioniert immer!

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

**Details:** Siehe `El Trabajante/test/README.md` für vollständige Code-Beispiele und API-Referenz.

### 3.2 Dual-Mode-Pattern (PFLICHT für jeden Test!)

**Jeder Test muss Production-safe sein:**

- **Production-System:** Nutzt vorhandene Config, ändert NICHTS (read-only)
- **New/Empty System:** Erstellt temporäre Config, räumt automatisch auf
- **Kein Config-Chaos:** Tests hinterlassen keine Artefakte in NVS
- **CI/CD-Ready:** Gleicher Test funktioniert auf deployed ESP32 UND leerer Hardware

**Kern-Prinzipien:**
1. Zuerst versuchen Production-Device zu finden (read-only Test)
2. Falls nicht vorhanden: Temporäres Virtual Device erstellen
3. RAII-Cleanup garantiert automatische Bereinigung
4. `TEST_IGNORE` statt Failure bei fehlenden Ressourcen

**Details:** Vollständige Code-Beispiele, Templates und Helper-Funktionen in `El Trabajante/test/README.md`.

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

**Details:** Siehe `El Trabajante/docs/Mqtt_Protocoll.md` für vollständige Topic-Spezifikation, Payload-Strukturen und QoS-Level.

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
ERROR_WIFI_CONNECT_FAILED   3003   // WiFi-Verbindung fehlgeschlagen
ERROR_MQTT_CONNECT_FAILED   3011   // MQTT-Verbindung fehlgeschlagen
ERROR_MQTT_PUBLISH_FAILED   3012   // Publish fehlgeschlagen
ERROR_MQTT_SUBSCRIBE_FAILED 3013   // Subscribe fehlgeschlagen
```

**Vollständige Liste:** Siehe `El Trabajante/src/models/error_codes.h` für alle Error-Codes mit Beschreibungen und Severity-Levels.

---

## 7. Test-Ausführung und Workflow

### ✅ NEUE TEST-ARCHITEKTUR: Server-orchestrierte Tests (2025-11-26)

**ESP32-Tests laufen jetzt auf God-Kaiser Server via MQTT!**

**Schnellstart:**
```bash
cd "El Servador"
poetry install
poetry run pytest god_kaiser_server/tests/esp32/ -v
```

**Was ist neu:**
- ✅ **~140 pytest Tests** (Communication, Infrastructure, Actuator, Sensor, Integration)
- ✅ **MockESP32Client** - Simuliert ESP32 ohne Hardware
- ✅ **CI/CD-ready** - Keine ESP32-Hardware nötig
- ✅ **Schneller Feedback-Loop** - Keine PlatformIO Build-Wartezeit

**Dokumentation:**
- **ESP32 Testing Guide:** `El Servador/docs/ESP32_TESTING.md` (vollständige Test-Dokumentation)
- **MQTT Test Protocol:** `El Servador/docs/MQTT_TEST_PROTOCOL.md` (Command-Spezifikation)
- **Test Workflow:** `.claude/TEST_WORKFLOW.md` (Migration-Status)

**Legacy ESP32 Tests:**
- Verschoben nach `El Trabajante/test/_archive/`
- Als Referenz behalten (enthält wertvolle Test-Logik)
- Siehe `El Trabajante/test/_archive/README.md`

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

## 9. Modul-Dokumentation Navigation

### Wann welche Dokumentation konsultieren?

| Aufgabe | Primäre Dokumentation | Zusätzliche Ressourcen | Code-Location | Verantwortlichkeit |
|---------|----------------------|------------------------|---------------|-------------------|
| **Tests schreiben/ausführen** | `El Trabajante/test/README.md` | `.claude/TEST_WORKFLOW.md` | `El Trabajante/test/` | Test-Patterns, MockMQTTBroker, Templates |
| **MQTT-Protokoll verstehen** | `El Trabajante/docs/Mqtt_Protocoll.md` | `El Trabajante/docs/MQTT_CLIENT_API.md` | `El Trabajante/src/services/communication/mqtt_client.*` | Topics, Payloads, QoS, Wildcards |
| **API-Referenz benötigt** | `El Trabajante/docs/API_REFERENCE.md` | `El Trabajante/src/services/[modul]/` | `El Trabajante/src/services/` | Methoden, Parameter, Return-Werte |
| **System-Flow verstehen** | `El Trabajante/docs/system-flows/` | `El Trabajante/docs/System_Overview.md` | `El Trabajante/src/core/` | Boot-Sequence, Sensor-Reading, Actuator-Command |
| **Sensor-System** | `El Trabajante/docs/API_REFERENCE.md` (SensorManager) | `El Trabajante/src/services/sensor/` | `El Trabajante/src/services/sensor/` | SensorManager, PiEnhancedProcessor, Sensor Drivers |
| **Actuator-System** | `El Trabajante/docs/API_REFERENCE.md` (ActuatorManager) | `El Trabajante/src/services/actuator/` | `El Trabajante/src/services/actuator/` | ActuatorManager, SafetyController, Actuator Drivers |
| **Config-System** | `El Trabajante/docs/NVS_KEYS.md` | `El Trabajante/docs/API_REFERENCE.md` (ConfigManager) | `El Trabajante/src/services/config/` | ConfigManager, StorageManager, WiFiConfig |
| **Zone-Management** | `El Trabajante/docs/Dynamic Zones and Provisioning/` | `El Trabajante/src/services/provisioning/` | `El Trabajante/src/services/provisioning/` | ProvisionManager, Zone Assignment |
| **Error-Handling** | `El Trabajante/src/models/error_codes.h` | `El Trabajante/src/error_handling/` | `El Trabajante/src/error_handling/` | Error Codes, ErrorTracker, CircuitBreaker, Recovery |
| **Communication (WiFi/HTTP)** | `El Trabajante/docs/API_REFERENCE.md` | `El Trabajante/src/services/communication/` | `El Trabajante/src/services/communication/` | WiFiManager, HTTPClient, NetworkDiscovery |

### Service-Module Übersicht

#### Config (`El Trabajante/src/services/config/`)
- **ConfigManager:** Konfiguration laden/speichern (WiFi, Zone, System, Sensor, Actuator)
- **StorageManager:** NVS-Abstraktion (Namespaces, Key-Value Storage)
- **WiFiConfig:** WiFi-Konfigurationsstrukturen
- **Dokumentation:** `El Trabajante/docs/API_REFERENCE.md` (ConfigManager, StorageManager), `El Trabajante/docs/NVS_KEYS.md`

#### Sensor (`El Trabajante/src/services/sensor/`)
- **SensorManager:** Sensor-Orchestrierung, RAW-Daten-Akquisition
- **PiEnhancedProcessor:** Server-Centric Processing (RAW → Server → Processed)
- **Sensor Drivers:** I2C, OneWire, Analog, Digital Sensoren
- **SensorFactory:** Factory-Pattern für Sensor-Erstellung
- **Dokumentation:** `El Trabajante/docs/API_REFERENCE.md` (SensorManager), `El Trabajante/docs/system-flows/02-sensor-reading-flow.md`

#### Actuator (`El Trabajante/src/services/actuator/`)
- **ActuatorManager:** Actuator-Control, Registry-Management, MQTT-Integration
- **SafetyController:** Emergency-Stop, Safety-Constraints, Timeout-Protection
- **Actuator Drivers:** Pump, Valve, PWM Actuators
- **Dokumentation:** `El Trabajante/docs/API_REFERENCE.md` (ActuatorManager), `El Trabajante/docs/system-flows/03-actuator-command-flow.md`

#### Communication (`El Trabajante/src/services/communication/`)
- **MQTTClient:** MQTT-Broker-Verbindung, Publish/Subscribe, Topic-Building
- **WiFiManager:** WiFi-Verbindungsmanagement, Reconnect-Logic
- **HTTPClient:** HTTP-Requests für Pi-Enhanced Processing
- **WebServer:** Provisioning-Webserver (optional)
- **Dokumentation:** `El Trabajante/docs/Mqtt_Protocoll.md`, `El Trabajante/docs/MQTT_CLIENT_API.md`, `El Trabajante/docs/API_REFERENCE.md`

#### Provisioning (`El Trabajante/src/services/provisioning/`)
- **ProvisionManager:** Zone-Assignment, Dynamic Provisioning
- **Dokumentation:** `El Trabajante/docs/Dynamic Zones and Provisioning/`

---

## 10. KI-Agenten Workflow

### Schritt-für-Schritt Anleitung für Code-Änderungen

**SCHRITT 1: Aufgabe identifizieren**
- Was soll geändert/implementiert werden?
- Welches Modul ist betroffen? (siehe Abschnitt 9: Modul-Dokumentation Navigation)
- Ist es ein Bug-Fix, Feature oder Refactoring?

**SCHRITT 2: Richtige Dokumentation konsultieren**
- Nutze die Tabelle in Abschnitt 9, um die passende Dokumentation zu finden
- **Immer zuerst lesen:** Relevante Dokumentation vollständig durcharbeiten
- Verstehe bestehende Patterns und Constraints

**SCHRITT 3: Code-Location finden**
- Nutze Code-Location aus Abschnitt 9 oder durchsuche `El Trabajante/src/`
- Verstehe Abhängigkeiten zwischen Modulen
- Prüfe bestehende Implementierungen ähnlicher Features

**SCHRITT 4: Änderungen implementieren**
- **Regeln befolgen:**
  - Test-Patterns: Dual-Mode, RAII-Cleanup (siehe Abschnitt 3.2)
  - MQTT-Contracts nicht brechen (siehe Abschnitt 4)
  - NVS-Keys konsistent nutzen (siehe `El Trabajante/docs/NVS_KEYS.md`)
  - Error-Codes korrekt verwenden (siehe Abschnitt 6)
  - Safety-Constraints beachten (siehe Abschnitt 5)
- **Code-Stil:** Konsistent mit bestehendem Code
- **Kommentare:** Wichtig für komplexe Logik

**SCHRITT 5: Tests ausführen**
- Tests schreiben für neue Features (siehe Abschnitt 3, `El Trabajante/test/README.md`)
- Bestehende Tests ausführen: `cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev`
- Output analysieren: `grep ":FAIL" test_output.log`
- **Nur committen wenn:** Keine `:FAIL` im Output (`:IGNORE` ist OK)

**SCHRITT 6: Dokumentation aktualisieren**
- API-Referenz aktualisieren falls nötig (`El Trabajante/docs/API_REFERENCE.md`)
- System-Flows aktualisieren falls Verhalten geändert (`El Trabajante/docs/system-flows/`)
- MQTT-Protokoll aktualisieren falls Topics/Payloads geändert (`El Trabajante/docs/Mqtt_Protocoll.md`)
- NVS-Keys dokumentieren falls neue Keys hinzugefügt (`El Trabajante/docs/NVS_KEYS.md`)

### Regeln für Code-Änderungen

**NIEMALS:**
- ❌ Production-Config in Tests ändern (nur read-only!)
- ❌ MQTT-Topic-Schema ohne Dokumentation ändern
- ❌ NVS-Keys ohne Dokumentation hinzufügen
- ❌ Error-Codes ohne Definition verwenden
- ❌ Safety-Constraints umgehen
- ❌ `new`/`delete` verwenden (RAII-Pattern!)

**IMMER:**
- ✅ Dual-Mode-Pattern in Tests verwenden
- ✅ RAII für Ressourcen-Management
- ✅ MockMQTTBroker für MQTT-Tests
- ✅ Error-Codes aus `error_codes.h` verwenden
- ✅ Safety-Controller prüfen lassen
- ✅ Dokumentation konsultieren BEVOR Code-Änderung

---

## 11. Feature Flags (Build-Konfiguration)

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

## 12. Best Practices für KI-Agenten

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
# Tests laufen lassen (von Root aus)
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev

# Nur committen wenn:
# - Keine :FAIL im Output
# - :IGNORE ist OK (fehlende Hardware)
```

### Build-Commands für KI-Agenten:

**IMMER vollständigen Pfad nutzen** wenn vom Root-Verzeichnis aus gearbeitet wird:

```bash
# Clean Build
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev -t clean
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev

# Nur Fehler-Output anzeigen
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev 2>&1 | grep -E "(error:|FAILED)"

# Build-Status prüfen
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev 2>&1 | grep -E "(SUCCESS|FAILED)"
```

---

**Letzte Aktualisierung:** 2025-11-24
**Version:** 3.0 (Master-Dokument für KI-Agenten: Modul-Navigation, KI-Workflow, strukturierte Verweise)
