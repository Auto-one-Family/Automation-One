---
name: esp32-development
description: |
  ESP32 El Trabajante Firmware-Entwicklung für AutomationOne IoT-Framework.
  Verwenden bei: C++, PlatformIO, ESP32, WROOM, XIAO-C3, Sensoren, Aktoren, 
  MQTT-Client, Wokwi-Simulation, NVS-Speicher, GPIO, I2C, OneWire, PWM,
  SensorManager, ActuatorManager, ConfigManager, ProvisionManager, WiFiManager,
  TopicBuilder, ErrorTracker, HealthMonitor, SafetyController, CircuitBreaker,
  Firmware-Build, Flash, Serial-Monitor, Error-Codes, Safety-Constraints,
  Pi-Enhanced-Processing, Zone-Assignment, Subzone-Management, Watchdog.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# AutomationOne Framework - ESP32 Firmware Dokumentation

> **Für KI-Agenten:** Maßgebliche Referenz für ESP32-Firmware-Entwicklung auf industriellem Niveau
> **Codebase:** `El Trabajante/` (~13.300 Zeilen C++)

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **ESP32 Code ändern** | [Section 8: Workflow](#8-ki-agenten-workflow) | `El Trabajante/src/` |
| **Server Code ändern** | [Section 11.1](#111-el-servador---server-architektur-god-kaiser) + `.claude/skills/server/CLAUDE_SERVER.md` | `El Servador/god_kaiser_server/src/` |
| **Frontend Code ändern** | `.claude/skills/Frontend/CLAUDE_FRONTEND.md` | `El Frontend/src/` |
| **Maintenance Jobs** | `El Frontend/Docs/Next Steps/` | Server: `src/services/maintenance/` |
| **Frontend + Server starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.4 | - |
| **Services stoppen/neu starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.3 | - |
| **Server-Logs prüfen** | [Section 14.3](#143-server-logs-god-kaiser) | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **ESP32 Logs prüfen** | [Section 14.2](#142-esp32-logs) | Serial Monitor: `pio device monitor` |
| **MQTT Traffic debuggen** | [Section 14.4](#144-mqtt-traffic-debugging) | `mosquitto_sub -h localhost -t "kaiser/#" -v` |
| **Debugging Quick Reference** | [Section 14.5](#145-debugging-quick-reference) | ESP32, Server, MQTT Troubleshooting |
| **Frontend Bug debuggen (aktuell)** | `El Frontend/Docs/Bugs_Found_2.md` | Event-Loop Bug, aktuelle Issues |
| **Frontend Bug debuggen (historisch)** | `El Frontend/Docs/Bugs_Found.md` | Production-Ready Bugs |
| **MQTT verstehen** | `.claude/reference/api/MQTT_TOPICS.md` | Vollständige Topic-Referenz mit allen Payloads |
| **ESP32 API verstehen** | `El Trabajante/docs/API_REFERENCE.md` | `src/services/[modul]/` |
| **Server API verstehen** | [Section 11.1](#111-el-servador---server-architektur-god-kaiser) | `El Servador/god_kaiser_server/src/api/v1/` |
| **Tests schreiben** | `El Servador/docs/ESP32_TESTING.md` | `El Servador/god_kaiser_server/tests/` |
| **Error-Code finden** | `.claude/reference/errors/ERROR_CODES.md` | ESP32: 1000-4999, Server: 5000-5999 |
| **ESP32 Build ausführen** | [Section 1](#1-build--commands) | `platformio.ini` |
| **Server starten** | `.claude/skills/server/CLAUDE_SERVER.md` | `El Servador/god_kaiser_server/` |
| **System-Flow verstehen** | `El Trabajante/docs/system-flows/` (9 Flows) | `src/core/` |
| **Kommunikationsmuster** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | ESP↔Server↔Frontend Datenflüsse |
| **Subzone-Management** | `El Trabajante/docs/system-flows/09-subzone-management-flow.md` | Pin-Level Zone-Gruppierung |
| **CI/CD Workflows** | [Section 13](#13-cicd--github-actions) | `.github/workflows/` |
| **Workflow-Logs abrufen** | [Section 13](#github-cli-log-befehle) | `gh run view <id> --log` |
| **Wokwi ESP32 Tests** | [Section 13](#wokwi-esp32-tests-firmware-simulation) | `El Trabajante/tests/wokwi/` |
| **Wokwi Development Workflow** | `El Frontend/Docs/Next Steps/1.Wokwiki.md` Section 14 | KI startet Services, User startet Wokwi |
| **Wokwi-ESP registrieren** | `poetry run python scripts/seed_wokwi_esp.py` | ESP_00000001 in DB |
| **El Trabajante Roadmap** | `El Trabajante/docs/Roadmap.md` | Phasen-Status, Modul-Matrix |
| **El Trabajante CHANGELOG** | `El Trabajante/CHANGELOG.md` | Versionshistorie, Phase 1–9 |
| **Provisioning (ESP)** | `El Trabajante/docs/Dynamic Zones and Provisioning/` | AP-Mode, Zero-Touch |
| **Sensor-Registry** | `El Trabajante/src/models/sensor_registry.h` | ESP32↔Server Sensor-Type-Mapping |
| **Config-Response** | `El Trabajante/src/services/config/config_response.h` | ConfigResponseBuilder, PARTIAL_SUCCESS |
| **Watchdog (ESP32)** | `El Trabajante/src/models/watchdog_types.h` | WatchdogMode, feedWatchdog() |
| **Wokwi Szenarien** | `El Trabajante/tests/wokwi/scenarios/` | 01-boot bis 06-config |

---

## 1. Build & Commands

### PlatformIO (ESP32 Firmware)

**Von Root-Verzeichnis (Auto-one) - EMPFOHLEN:**

```bash
# Build ESP32 Dev Board
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev

# Build XIAO ESP32-C3
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e seeed_xiao_esp32c3

# Flash auf Device
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev -t upload

# Serial Monitor
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe device monitor
```

### Server (God-Kaiser)

```bash
cd "El Servador"

# Dependencies installieren
poetry install

# Tests ausführen
poetry run pytest god_kaiser_server/tests/ -v

# Server starten
poetry run uvicorn god_kaiser_server.src.main:app --reload
```

---

## 2. System-Architektur

### Die 4-Layer-Hierarchie

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: God (Raspberry Pi 5) - OPTIONAL                    │
│ Rolle: KI/Analytics, Predictions, Model Training            │
└─────────────────────────────────────────────────────────────┘
                          ↕ HTTP REST
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: God-Kaiser (Raspberry Pi 5)                        │
│ Rolle: Control Hub, MQTT Broker, Database, Logic Engine     │
│ Code: El Servador/god_kaiser_server/                        │
│ 📖 Server-Doku: .claude/skills/server/CLAUDE_SERVER.md      │
└─────────────────────────────────────────────────────────────┘
                          ↕ MQTT (TLS)
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Kaiser (Raspberry Pi Zero) - OPTIONAL              │
│ Rolle: Relay Node für Skalierung (100+ ESPs)                │
└─────────────────────────────────────────────────────────────┘
                          ↕ MQTT
┌─────────────────────────────────────────────────────────────┐
│ LAYER 4: ESP32-Agenten (WROOM/XIAO C3)                      │
│ Rolle: Sensor-Auslesung, Aktor-Steuerung                    │
│ Code: El Trabajante/                                        │
│ 📖 ESP32-Doku: Diese Datei                                  │
└─────────────────────────────────────────────────────────────┘
```

### Kern-Prinzip: Server-Centric (Pi-Enhanced Mode)

**Standard-Workflow (90% der Anwendungen):**

```
ESP32 → RAW-Daten (analogRead) → MQTT → God-Kaiser
God-Kaiser → Python-Library verarbeitet → speichert in DB
God-Kaiser → Processed-Werte zurück → ESP32 (optional)
```

**Vorteile:**
- ✅ Sofort einsatzbereit - neue Sensoren ohne ESP-Änderung
- ✅ Komplexe Algorithmen möglich (Kalman-Filter, ML)
- ✅ Zentrale Updates - kein ESP-Reflash nötig
- ✅ ESP-Flash bleibt frei für andere Features

---

## 3. El Trabajante - Verzeichnisstruktur

```
El Trabajante/                     # ESP32 Firmware (~13.300 Zeilen)
├── src/
│   ├── core/                      # Application, MainLoop, SystemController (Skeleton)
│   ├── drivers/                   # GPIO, I2C, OneWire, PWM
│   │   ├── gpio_manager.*         # ⭐ GPIO Safe-Mode, Pin-Reservation
│   │   ├── i2c_bus.*              # I2C-Bus-Management
│   │   ├── onewire_bus.*          # OneWire-Bus (DS18B20)
│   │   └── pwm_controller.*       # PWM-Steuerung für Aktoren
│   ├── services/
│   │   ├── sensor/                # ⭐ SensorManager, PiEnhancedProcessor, SensorFactory
│   │   │   └── sensor_drivers/    # DS18B20, SHT31, PH, i2c_sensor_generic, isensor_driver
│   │   ├── actuator/              # ⭐ ActuatorManager, SafetyController
│   │   │   └── actuator_drivers/  # Pump, Valve, PWM, iactuator_driver
│   │   ├── communication/         # ⭐ MQTTClient, WiFiManager, HTTPClient, WebServer, NetworkDiscovery
│   │   ├── config/                # ConfigManager, StorageManager, ConfigResponseBuilder, LibraryManager, WiFiConfig
│   │   └── provisioning/          # ⭐ ProvisionManager (AP-Mode, Zero-Touch, Zone-Assignment)
│   ├── models/                    # ⭐ Types, Error Codes, MQTT Messages
│   │   ├── error_codes.h          # ALLE Error-Codes (1000–4999 + ConfigErrorCode enum)
│   │   ├── config_types.h         # ConfigStatus, ConfigType, ConfigFailureItem, ConfigResponsePayload
│   │   ├── sensor_types.h         # SensorConfig, SensorType
│   │   ├── sensor_registry.*      # SensorCapability, findSensorCapability, Server↔ESP Type-Mapping
│   │   ├── actuator_types.h       # ActuatorConfig, ActuatorType
│   │   ├── system_types.h         # SystemState, ZoneConfig, KaiserZone, MasterZone
│   │   ├── watchdog_types.h       # WatchdogMode, WatchdogConfig, feedWatchdog (main.cpp)
│   │   └── mqtt_messages.h        # MQTT-Payload-Strukturen
│   ├── error_handling/            # ErrorTracker, CircuitBreaker, HealthMonitor
│   ├── utils/                     # Logger, TopicBuilder, TimeManager, data_buffer, json_helpers, onewire_utils, string_helpers
│   └── config/
│       ├── hardware/              # Board-spezifische Configs
│       │   ├── xiao_esp32c3.h     # XIAO-spezifische Pins
│       │   └── esp32_dev.h        # ESP32-Dev-Board Pins
│       ├── feature_flags.h        # (reserviert)
│       └── system_config.h        # (reserviert)
├── docs/                          # ⭐ Technische Dokumentation
│   ├── API_REFERENCE.md           # Modul-API-Referenz (~3.300 Zeilen)
│   ├── Mqtt_Protocoll.md          # MQTT-Spezifikation (~3.600 Zeilen)
│   ├── MQTT_CLIENT_API.md         # MQTT-Client-API (~1.300 Zeilen)
│   ├── NVS_KEYS.md                # NVS-Speicher-Keys (wifi_config, zone_config, subzone_config)
│   ├── Roadmap.md                 # Phasen-Status, Modul-Matrix (~150 Zeilen)
│   ├── System_Overview.md         # Codebase-Analyse (~2.500 Zeilen)
│   ├── Dynamic Zones and Provisioning/  # PROVISIONING.md, DYNAMIC_ZONES_IMPLEMENTATION.md, INTEGRATION_GUIDE
│   └── system-flows/              # 9 Ablauf-Diagramme (inkl. 09-subzone-management-flow)
├── tests/wokwi/                   # Wokwi-Simulation
│   ├── boot_test.yaml, mqtt_connection.yaml
│   ├── scenarios/                 # 01-boot, 02-sensor, 03-actuator, 04-zone, 05-emergency, 06-config
│   └── helpers/mqtt_inject.py
├── platformio.ini                 # esp32_dev, seeed_xiao_esp32c3, wokwi_simulation
├── CHANGELOG.md                   # Versionshistorie (Phase 1–9)
└── wokwi.toml, diagram.json       # Wokwi CLI & Hardware-Config
```

---

## 4. MQTT-Protokoll (Verifiziert)

> **📚 Vollständige Topic-Referenz:** `.claude/reference/api/MQTT_TOPICS.md`
> Enthält alle Topics, Payloads, QoS-Werte und Code-Referenzen

### Topic-Schema

```
kaiser/{kaiser_id}/esp/{esp_id}/{kategorie}/{gpio}/{aktion}
```

- **kaiser_id:** `"god"` (God-Kaiser Server)
- **esp_id:** ESP32 Device ID (z.B. `ESP_12AB34CD`)

### TopicBuilder (ESP32-Seite)

**Code:** `src/utils/topic_builder.h`

| Methode | Topic-Pattern |
|---------|---------------|
| `buildSensorDataTopic(gpio)` | `sensor/{gpio}/data` |
| `buildActuatorStatusTopic(gpio)` | `actuator/{gpio}/status` |
| `buildSystemHeartbeatTopic()` | `system/heartbeat` |
| `buildConfigResponseTopic()` | `config_response` |

**Buffer-Validierung:** `validateTopicBuffer()` verhindert Overflow/Truncation.

### Wichtige Topics (Quick-Reference)

| Topic | Richtung | QoS | Beschreibung |
|-------|----------|-----|--------------|
| `sensor/{gpio}/data` | ESP→Server | 1 | Sensor-Rohdaten |
| `actuator/{gpio}/command` | Server→ESP | 2 | Actuator-Befehle |
| `system/heartbeat` | ESP→Server | 0 | Heartbeat (60s) |
| `broadcast/emergency` | Server→ALL | 2 | Emergency Stop |

**Für vollständige Payload-Schemas und alle Topics:** Siehe `.claude/reference/api/MQTT_TOPICS.md`

---

## 5. Error-Codes (Verifiziert)

> **📚 Vollständige Error-Code Referenz:** `.claude/reference/errors/ERROR_CODES.md`
> Enthält alle Codes mit Beschreibungen, Lösungen und Code-Locations

### Code-Ranges Übersicht

| Range | System | Kategorie |
|-------|--------|-----------|
| **1000-1999** | ESP32 | HARDWARE (GPIO, I2C, OneWire, Sensor, Actuator) |
| **2000-2999** | ESP32 | SERVICE (NVS, Config, Logger, Subzone) |
| **3000-3999** | ESP32 | COMMUNICATION (WiFi, MQTT, HTTP) |
| **4000-4999** | ESP32 | APPLICATION (State, Command, Watchdog) |
| **5000-5999** | Server | CONFIG/MQTT/VALIDATION/DATABASE/SERVICE |

### Häufige ESP32-Fehler (Quick-Reference)

| Code | Name | Lösung |
|------|------|--------|
| 1002 | `GPIO_CONFLICT` | Anderen GPIO wählen |
| 1011 | `I2C_DEVICE_NOT_FOUND` | Verkabelung prüfen |
| 1021 | `ONEWIRE_NO_DEVICES` | DS18B20 Verkabelung prüfen |
| 3011 | `MQTT_CONNECT_FAILED` | Broker prüfen |
| 4070 | `WATCHDOG_TIMEOUT` | Blocking-Code finden |

### Code-Dateien

| Datei | Inhalt |
|-------|--------|
| `src/models/error_codes.h` | ESP32 Error-Codes + `getErrorDescription()` |
| `src/services/config/config_response.h` | `ConfigErrorCode` Enum |

**Für vollständige Liste mit Troubleshooting:** Siehe `.claude/reference/errors/ERROR_CODES.md`

---

## 6. Safety-Constraints (KRITISCH)

### GPIO Safe-Mode

```cpp
// GPIOManager initialisiert ALLE Pins als INPUT_PULLUP
// MUSS als ERSTES in setup() aufgerufen werden!
GPIOManager& gpioManager = GPIOManager::getInstance();
gpioManager.initializeAllPinsToSafeMode();  // Alle Pins safe
```

### Pin-Reservation (vor jeder Nutzung)

```cpp
// Prüfen ob Pin verfügbar
if (!gpioManager.isPinAvailable(gpio)) {
    return ERROR_GPIO_CONFLICT;
}

// Pin reservieren mit Owner und Komponenten-Name
bool success = gpioManager.requestPin(gpio, "sensor", "DS18B20");
```

### Aktor-Sicherheit

```cpp
// ActuatorManager prüft IMMER vor Aktivierung:
// - Emergency-Stop aktiv? (actuator->emergency_stopped)
// - Aktor existiert? (findActuator(gpio))
// - Value in erlaubtem Bereich? (PWM: 0.0-1.0, validateActuatorValue())
// - Runtime Protection wird nach Aktivierung getrackt

// Safety-Checks erfolgen automatisch in controlActuator():
if (actuator->emergency_stopped) {
    return false;  // Command rejected - Emergency-Stop aktiv!
}

// Value-Validierung:
if (isPwmActuatorType(actuator->config.actuator_type)) {
    normalized_value = constrain(value, 0.0f, 1.0f);  // PWM-Limitierung
} else if (!validateActuatorValue(actuator->config.actuator_type, value)) {
    return false;  // Value außerhalb erlaubtem Bereich
}
```

### PWM-Limits

- **Bereich:** 0.0 - 1.0 (wird intern auf 0-255 gemappt)
- **Timeout-Protection:** Aktoren schalten nach `MAX_RUNTIME` automatisch ab

---

## 7. Kritische Module & Dateien

### Singleton-Pattern (Standard für alle Manager)

```cpp
// Alle Manager sind Singletons:
SensorManager& sensorManager = SensorManager::getInstance();
ActuatorManager& actuatorManager = ActuatorManager::getInstance();
ConfigManager& configManager = ConfigManager::getInstance();
GPIOManager& gpioManager = GPIOManager::getInstance();
ProvisionManager& provisionManager = ProvisionManager::getInstance();
```

### Wichtigste Dateien für Code-Änderungen

| Modul | Header | Implementation | Verantwortlichkeit |
|-------|--------|----------------|-------------------|
| **SensorManager** | `services/sensor/sensor_manager.h` | `sensor_manager.cpp` | Sensor-Orchestrierung, RAW-Daten |
| **SensorFactory** | `services/sensor/sensor_factory.h` | `sensor_factory.cpp` | Sensor-Instanzerstellung, Typ-Mapping |
| **SensorRegistry** | `models/sensor_registry.h` | `sensor_registry.cpp` | ESP↔Server Sensor-Type, Multi-Value, I2C-Address |
| **ActuatorManager** | `services/actuator/actuator_manager.h` | `actuator_manager.cpp` | Aktor-Control, Safety |
| **SafetyController** | `services/actuator/safety_controller.h` | `safety_controller.cpp` | Emergency-Stop, Subzone-Isolation |
| **MQTTClient** | `services/communication/mqtt_client.h` | `mqtt_client.cpp` | MQTT Pub/Sub, Heartbeat |
| **ConfigManager** | `services/config/config_manager.h` | `config_manager.cpp` | NVS-Config (WiFi/Zone/Subzone) |
| **ConfigResponseBuilder** | `services/config/config_response.h` | `config_response.cpp` | Config-Response MQTT, PARTIAL_SUCCESS |
| **ProvisionManager** | `services/provisioning/provision_manager.h` | `provision_manager.cpp` | AP-Mode, Zero-Touch, needsProvisioning |
| **GPIOManager** | `drivers/gpio_manager.h` | `gpio_manager.cpp` | Pin-Reservation, Safe-Mode |
| **TopicBuilder** | `utils/topic_builder.h` | `topic_builder.cpp` | MQTT-Topic-Generierung, validateTopicBuffer |
| **ErrorTracker** | `error_handling/error_tracker.h` | `error_tracker.cpp` | Error-Logging, History |
| **HealthMonitor** | `error_handling/health_monitor.h` | `health_monitor.cpp` | Health-Snapshot, MQTT-Diagnostics |
| **TimeManager** | `utils/time_manager.h` | `time_manager.cpp` | NTP, Timestamp-Hilfen (Phase 8) |

### Weitere Utils (konsistent nutzen)

`utils/data_buffer.*`, `utils/json_helpers.h`, `utils/onewire_utils.*`, `utils/string_helpers.*` – bei entsprechender Aufgabe verwenden.

---

## 8. KI-Agenten Workflow

### Bei Code-Änderungen

**SCHRITT 1: Kontext verstehen**

1. Welches Modul? → Section 7 Tabelle
2. Relevante Dokumentation lesen:
   - **MQTT Topics:** `.claude/reference/api/MQTT_TOPICS.md`
   - **Error Codes:** `.claude/reference/errors/ERROR_CODES.md`
   - **Datenflüsse:** `.claude/reference/patterns/COMMUNICATION_FLOWS.md`
   - API Details: `El Trabajante/docs/API_REFERENCE.md`
   - Flow-Diagramme: `El Trabajante/docs/system-flows/`

**SCHRITT 2: Code analysieren**

1. Header-Datei lesen (Interfaces, Methoden-Signaturen)
2. Implementation prüfen (bestehende Patterns)
3. Abhängigkeiten verstehen (welche Manager werden genutzt?)

**SCHRITT 3: Implementieren**

- **Singleton-Pattern beibehalten**
- **Error-Codes aus `error_codes.h` verwenden**
- **Safety-Controller nicht umgehen**
- **RAII-Pattern** (keine `new`/`delete`)

**SCHRITT 4: Verifizieren**

```bash
# Build-Check
cd "El Trabajante" && ~/.platformio/penv/Scripts/platformio.exe run -e esp32_dev

# Server-Tests (wenn MQTT betroffen)
cd "El Servador" && poetry run pytest god_kaiser_server/tests/ -v
```

**SCHRITT 5: Dokumentation aktualisieren**

- `API_REFERENCE.md` bei API-Änderungen
- `Mqtt_Protocoll.md` bei Topic/Payload-Änderungen
- `NVS_KEYS.md` bei neuen NVS-Keys

### NIEMALS

- ❌ MQTT-Topics ohne Dokumentation ändern
- ❌ Safety-Constraints umgehen (Emergency-Stop, Value-Validierung)
- ❌ Error-Codes ohne Definition verwenden
- ❌ `new`/`delete` statt RAII (std::unique_ptr verwenden)
- ❌ Singleton-Pattern brechen
- ❌ GPIO-Pins ohne `gpioManager.requestPin()` verwenden

### IMMER

- ✅ Error-Codes aus `error_codes.h`
- ✅ GPIOManager für Pin-Operationen
- ✅ ActuatorManager für Aktor-Befehle (Safety-Checks automatisch)
- ✅ TopicBuilder für MQTT-Topics (Zone-Topics in main.cpp – Pattern beibehalten)
- ✅ Build-Check vor Commit

---

## 9. Feature Flags (platformio.ini)

```ini
# Kernel-Features (ALLE aktiv in esp32_dev / seeed_xiao_esp32c3)
-DDYNAMIC_LIBRARY_SUPPORT=1     # OTA Library Support
-DHIERARCHICAL_ZONES=1          # Zone-System
-DOTA_LIBRARY_ENABLED=1         # OTA Updates
-DSAFE_MODE_PROTECTION=1        # GPIO Safe-Mode
-DZONE_MASTER_ENABLED=1         # Zone-Master
-DCONFIG_ENABLE_THREAD_SAFETY   # Mutex-Schutz (StorageManager)

# Logging (Serieller Monitor)
-DCORE_DEBUG_LEVEL=2            # Xiao; 3 für esp32_dev
-DCONFIG_ARDUHAL_LOG_COLORS=0   # Keine ANSI-Farben (Kompatibilität)

# Board-spezifisch
-DXIAO_ESP32C3_MODE=1           # MAX_SENSORS=10, MAX_ACTUATORS=6, MAX_LIBRARY_SIZE=32768
-DESP32_DEV_MODE=1              # MAX_SENSORS=20, MAX_ACTUATORS=12, MAX_LIBRARY_SIZE=65536
```

**Wokwi-Simulation** (`[env:wokwi_simulation]`):
`-DWOKWI_SIMULATION=1`, `-DWOKWI_WIFI_SSID`, `-DWOKWI_MQTT_HOST`, `-DWOKWI_ESP_ID` – siehe `platformio.ini`.

---

## 10. Dokumentations-Matrix

| Aufgabe | Primäre Doku | Zusätzlich |
|---------|--------------|------------|
| MQTT verstehen | `.claude/reference/api/MQTT_TOPICS.md` | `El Trabajante/docs/Mqtt_Protocoll.md` |
| TopicBuilder / Zone-Topics | `src/utils/topic_builder.h` | Zone/assign, zone/ack in `main.cpp` |
| Sensor hinzufügen | Server: `El Servador/.../sensors/sensor_libraries/active/` | ESP: `src/services/sensor/sensor_drivers/` |
| Aktor hinzufügen | `docs/API_REFERENCE.md` (ActuatorManager) | `src/services/actuator/actuator_drivers/` |
| NVS-Keys | `El Trabajante/docs/NVS_KEYS.md` | `src/services/config/storage_manager.*` |
| Subzone-Management | `El Trabajante/docs/system-flows/09-subzone-management-flow.md` | TopicBuilder buildSubzone* |
| Provisioning | `El Trabajante/docs/Dynamic Zones and Provisioning/PROVISIONING.md` | `src/services/provisioning/provision_manager.*` |
| Config-Response | `src/models/config_types.h`, `src/services/config/config_response.h` | ConfigStatus, ConfigFailureItem |
| Watchdog | `El Trabajante/src/models/watchdog_types.h` | `main.cpp` (feedWatchdog) |
| System-Flow | `El Trabajante/docs/system-flows/` | `docs/System_Overview.md` |
| Tests schreiben | `.claude/reference/testing/TEST_WORKFLOW.md` (NUR auf Anfrage) | `El Servador/god_kaiser_server/tests/` |
| Error-Codes | `.claude/reference/errors/ERROR_CODES.md` | `src/models/error_codes.h`, ConfigErrorCode |
| Roadmap/CHANGELOG | `El Trabajante/docs/Roadmap.md`, `El Trabajante/CHANGELOG.md` | Phasen-Status |

---

## 11. Server-Integration Ressourcen

### Wichtige Verweise

| Datei | Zweck | Wann konsultieren? |
|-------|-------|-------------------|
| **`.claude/skills/server/CLAUDE_SERVER.md`** | ⭐ **Server-Dokumentation** | Bei Server-Änderungen, MQTT-Handler, API-Endpoints |
| **`.claude/skills/Frontend/CLAUDE_FRONTEND.md`** | ⭐ **Frontend-Dokumentation** | Bei Frontend-Änderungen, Vue Components |
| `.claude/reference/ARCHITECTURE_DEPENDENCIES.md` | Modul-Abhängigkeiten | Bei Architektur-Fragen |
| `.claude/reference/testing/TEST_WORKFLOW.md` | Test-Infrastruktur | Bei Test-Problemen |

**📖 Frontend-Aufgaben?** → Siehe `.claude/skills/Frontend/CLAUDE_FRONTEND.md` + `El Frontend/Docs/`

**📖 Server-Aufgaben?** → Siehe `.claude/skills/server/CLAUDE_SERVER.md`

---

## 11.1 Server-Integration: Verhaltensregeln für ESP32-Code

**KRITISCH:** ESP32-Code muss mit dem God-Kaiser Server kompatibel sein.

### MQTT-Topic-Konventionen

- **Topic-Building:** IMMER `TopicBuilder` verwenden (`El Trabajante/src/utils/topic_builder.cpp`)
- **Kaiser-ID:** Standard ist `"god"`, kann via Config geändert werden
- **Wildcards:** Server subscribed auf `kaiser/{kaiser_id}/esp/+/sensor/+/data`

### Payload-Struktur

- **Sensor-Daten:** MUSS `raw_mode: true` enthalten (Required Field)
- **Heartbeat:** MUSS `heap_free` enthalten (nicht `free_heap`)
- **Timestamps:** Unix-Timestamp in Sekunden (nicht Millisekunden)
- **ESP-ID Format:** `ESP_{6-8 hex chars}` (z.B. `ESP_D0B19C`)

### Device-Registration

- **KRITISCH:** ESPs MÜSSEN zuerst via REST API registriert werden (`POST /api/v1/esp/register`)
- **Auto-Discovery deaktiviert:** Unbekannte Geräte werden abgelehnt

### Safety-Constraints (Server-seitig)

- **Actuator-Commands:** Werden VOR Publishing durch `SafetyService.validate_actuator_command()` geprüft
- **Emergency-Stop:** Wird automatisch geprüft - Commands werden abgelehnt wenn aktiv
- **Value-Validierung:** PWM-Werte müssen 0.0-1.0 sein

### Pi-Enhanced Processing

- **Trigger:** Wird automatisch getriggert wenn `sensor_config.pi_enhanced == True` und `raw_mode == true`
- **Response-Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed`
- **Processing:** Läuft asynchron, ESP32 kann weiterarbeiten

### Logic-Engine Integration

- **Trigger:** Wird automatisch getriggert nach Sensor-Daten-Speicherung
- **Non-blocking:** Evaluation läuft asynchron
- **Cooldown:** Rules haben `cooldown_seconds`

### Zone Naming Konventionen

- **zone_id:** Technische Zone-ID (lowercase, no spaces, z.B. `zelt_1`)
- **zone_name:** Menschenlesbarer Name (z.B. `Zelt 1`)
- **Auto-Generierung:** `"Zelt 1"` → `"zelt_1"`

---

## 12. Aktueller Entwicklungsstand (El Trabajante)

| Phase | Status | Module |
|-------|--------|--------|
| Phase 0–7 | ✅ COMPLETE | GPIO Safe-Mode, Logger, Config, WiFi, MQTT, HTTP, I2C, OneWire, PWM, Sensor, Actuator, Error, HealthMonitor, CircuitBreaker |
| Phase 8 | ⏳ NEXT | Integration & Final Testing, TimeManager (NTP) |
| Phase 9 | ✅ COMPLETE | Subzone-Management, Pin-Level Zone-Gruppierung |

**El Trabajante Kern-Module:** SensorManager, SensorFactory, SensorRegistry, ActuatorManager, SafetyController, ConfigManager, ConfigResponseBuilder, ProvisionManager, MQTTClient, WiFiManager, GPIOManager, TopicBuilder, ErrorTracker, HealthMonitor, TimeManager.

**Models:** error_codes.h (inkl. Subzone, Watchdog, ConfigErrorCode), config_types.h, sensor_registry, watchdog_types.h.

**Code-Qualität:** 5.0/5 (Production-Ready)
**Implementierte Zeilen:** ~13.300 (ESP32)
**Quellen:** `El Trabajante/docs/Roadmap.md`, `El Trabajante/CHANGELOG.md`

---

## 13. CI/CD & GitHub Actions

### Workflow-Übersicht

| Workflow | Datei | Trigger | Beschreibung |
|----------|-------|---------|--------------|
| **Wokwi ESP32 Tests** | `wokwi-tests.yml` | Push/PR zu `El Trabajante/**` | ESP32-Firmware in Wokwi-Simulation |
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR zu `tests/esp32/**` | Mock-ESP32-Tests auf Server-Seite |
| **Server Tests** | `server-tests.yml` | Push/PR zu `El Servador/**` | Unit-, Integration-Tests, Linting |
| **PR Checks** | `pr-checks.yml` | Pull Requests | Label-PR, Large-File-Check |

### Wokwi ESP32 Tests (Firmware-Simulation)

**Voraussetzungen:**
- GitHub Secret `WOKWI_CLI_TOKEN` muss konfiguriert sein
- Token erstellen: https://wokwi.com/dashboard/ci

**Ablauf:**
1. Startet Mosquitto MQTT Broker (Docker)
2. Baut ESP32-Firmware mit PlatformIO (`pio run -e wokwi_simulation`)
3. Installiert Wokwi CLI
4. Führt Boot-Sequence-Test aus (`boot_test.yaml`)
5. Führt MQTT-Connection-Test aus (`mqtt_connection.yaml`)

**Dateien:**

| Datei | Beschreibung |
|-------|--------------|
| `.github/workflows/wokwi-tests.yml` | GitHub Actions Workflow |
| `El Trabajante/tests/wokwi/boot_test.yaml` | Boot-Sequence Szenario |
| `El Trabajante/tests/wokwi/mqtt_connection.yaml` | MQTT-Connection Szenario |
| `El Trabajante/wokwi.toml` | Wokwi CLI Konfiguration |
| `El Trabajante/diagram.json` | Virtuelle Hardware-Konfiguration |

**Wokwi CLI Syntax:**

```bash
# WICHTIG: Projektverzeichnis als ERSTES Argument!
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml

# FALSCH (häufiger Fehler):
wokwi-cli run --timeout 90000 --scenario tests/wokwi/boot_test.yaml  # FALSCH!
```

### GitHub CLI Log-Befehle

```bash
# Alle Workflows auflisten
gh workflow list

# Runs eines spezifischen Workflows auflisten
gh run list --workflow=wokwi-tests.yml

# Run-Details anzeigen
gh run view <run-id>

# Vollständige Logs abrufen
gh run view <run-id> --log

# Nur fehlgeschlagene Logs
gh run view <run-id> --log-failed

# Workflow manuell triggern
gh workflow run wokwi-tests.yml

# Artifacts herunterladen
gh run download <run-id>
```

### Troubleshooting

| Problem | Lösung |
|---------|--------|
| `WOKWI_CLI_TOKEN` fehlt | GitHub Secret konfigurieren |
| `wokwi.toml not found` | Projektverzeichnis als **erstes** CLI-Argument |
| `Invalid scenario step key: timeout` | `timeout:` aus YAML entfernen, nur CLI `--timeout` |
| `Mosquitto failed to start` | `mosquitto_pub` statt `mosquitto_sub` für Health-Check |

### Lokale Test-Ausführung

```bash
# ESP32 Firmware bauen (Wokwi)
cd "El Trabajante"
pio run -e wokwi_simulation

# Server Tests lokal
cd "El Servador/god_kaiser_server"
poetry run pytest tests/unit/ -v
poetry run pytest tests/integration/ -v
poetry run pytest tests/esp32/ -v

# Wokwi-Test lokal (benötigt WOKWI_CLI_TOKEN)
export WOKWI_CLI_TOKEN=your_token
cd "El Trabajante"
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml
```

---

## 14. Logging & Debugging - Vollständige Referenz

### 14.1 Übersicht: Was loggt wo?

| Gerät | Log-Ausgabe | Speicherort | Zugriffsmethode |
|-------|-------------|-------------|-----------------|
| **ESP32** | Serial Console | UART (kein File) | `pio device monitor` |
| **ESP32** | MQTT Diagnostics | Broker → Server | `mosquitto_sub -t "kaiser/god/esp/+/system/diagnostics"` |
| **Server** | JSON Logs | `logs/god_kaiser.log` | `tail -f` / Read Tool |
| **Mosquitto** | MQTT Topic (LIVE) | `$SYS/broker/log/#` | `mosquitto_sub -t "$SYS/broker/log/#" -v` |
| **Frontend** | Browser Console | Browser DevTools | F12 → Console |

### 14.2 ESP32 Logs

#### Serial Monitor (Primär für Entwicklung)

```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/platformio.exe device monitor --baud 115200
```

**Features:**
- Echtzeit-Output mit Farben und Timestamps
- ESP32 Exception-Decoder für Crash-Analyse
- Auto-Save zu `.pio/build/esp32_dev/monitor.log`

**Output-Format:**

```
[      1234] [INFO    ] System initialized
[      5678] [DEBUG   ] Sensor reading: 25.4C
[      8901] [ERROR   ] MQTT publish failed
```

**Log-Level ändern (Code):**

```cpp
Logger& logger = Logger::getInstance();
logger.setLogLevel(LOG_DEBUG);    // DEBUG, INFO, WARNING, ERROR, CRITICAL
```

**Log-Level ändern (platformio.ini):**

```ini
build_flags =
    -DCORE_DEBUG_LEVEL=3      # 0=None, 1=Error, 2=Warn, 3=Info, 4=Debug
```

#### MQTT Diagnostics (Remote Monitoring)

**Topic:** `kaiser/god/esp/{esp_id}/system/diagnostics`

**Payload:**

```json
{
  "ts": 3600,
  "esp_id": "ESP_12AB34CD",
  "heap_free": 98304,
  "heap_fragmentation": 15,
  "uptime_seconds": 3600,
  "error_count": 2,
  "wifi_connected": true,
  "wifi_rssi": -45,
  "mqtt_connected": true,
  "sensor_count": 3,
  "system_state": "OPERATIONAL"
}
```

**Zugriff:**

```bash
mosquitto_sub -h localhost -p 1883 -t "kaiser/god/esp/+/system/diagnostics" -v
```

#### ESP32 Logger-Komponenten

| Komponente | Datei | Funktion |
|------------|-------|----------|
| **Logger** | `src/utils/logger.h/.cpp` | Zentrales Logging, Circular Buffer (50 Einträge) |
| **ErrorTracker** | `src/error_handling/error_tracker.h/.cpp` | Error-History (50 Einträge) |
| **HealthMonitor** | `src/error_handling/health_monitor.h/.cpp` | MQTT Diagnostics Publishing |

### 14.3 Server Logs (God-Kaiser)

**Pfad:** `El Servador/god_kaiser_server/logs/god_kaiser.log`

**Format:** JSON (strukturiert)

```json
{
  "timestamp": "2026-01-11 10:23:45",
  "level": "INFO",
  "logger": "src.mqtt.handlers.sensor_handler",
  "message": "Sensor data received from ESP_12AB34CD"
}
```

#### Zugriffsmethoden

```bash
# Letzte 100 Zeilen
tail -100 "El Servador/god_kaiser_server/logs/god_kaiser.log"

# Live verfolgen
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"

# Nur Fehler zeigen
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log" | grep -i "error\|critical"
```

#### Log-Konfiguration (.env)

```env
LOG_LEVEL=INFO                      # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FORMAT=json                     # json oder text
LOG_FILE_PATH=logs/god_kaiser.log
LOG_FILE_MAX_BYTES=10485760         # 10MB - Rotation
LOG_FILE_BACKUP_COUNT=5             # 5 Backup-Dateien
```

### 14.4 MQTT Traffic Debugging

#### Mosquitto Broker Logs (LIVE via MQTT)

```bash
mosquitto_sub -h localhost -t "$SYS/broker/log/#" -v
```

#### Alle MQTT-Nachrichten sehen

```bash
# ALLE Topics im System
mosquitto_sub -h localhost -t "kaiser/#" -v

# Nur Sensor-Daten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v

# Nur Actuator-Commands
mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/command" -v

# Nur Heartbeats
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v

# Spezifisches ESP Device
mosquitto_sub -h localhost -t "kaiser/god/esp/ESP_12AB34CD/#" -v
```

#### Test-Nachricht senden

```bash
mosquitto_pub -h localhost -t "kaiser/god/esp/TEST_ESP/sensor/34/data" -m '{"ts":1735818000,"gpio":34,"value":25.5,"raw_mode":true}'
```

### 14.5 Debugging Quick Reference

#### Problem: ESP32 sendet keine Daten

1. **Serial Monitor prüfen:**
   ```bash
   pio device monitor
   ```
   → Suche nach `MQTT connected` oder `WiFi connected`

2. **MQTT-Traffic prüfen:**
   ```bash
   mosquitto_sub -h localhost -t "kaiser/#" -v
   ```

3. **Server-Logs prüfen:**
   ```bash
   tail -f logs/god_kaiser.log | grep -i "esp"
   ```

#### Problem: Server empfängt keine MQTT-Nachrichten

1. **Mosquitto läuft?**
   ```bash
   netstat -ano | findstr "1883"
   ```

2. **Server mit Broker verbunden?**
   ```bash
   grep "MQTT connected" logs/god_kaiser.log
   ```

3. **Handler registriert?**
   ```bash
   grep "Registered.*MQTT handlers" logs/god_kaiser.log
   ```

#### Problem: Actuator reagiert nicht

1. **Command im Server-Log?**
   ```bash
   grep "actuator.*command" logs/god_kaiser.log
   ```

2. **Command auf MQTT-Topic?**
   ```bash
   mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/+/command" -v
   ```

3. **ESP32 Serial Monitor:** → Suche nach `actuator` oder `command`

### 14.6 Log-Pattern-Referenz

| Pattern in Logs | Bedeutung | Aktion |
|-----------------|-----------|--------|
| `MQTT connected with result code: 0` | Server verbunden ✅ | OK |
| `Registered X MQTT handlers` | Handler aktiv ✅ | OK |
| `Subscribed to: kaiser/god/esp/+/...` | Subscription aktiv ✅ | OK |
| `Handler returned False` | Handler-Fehler ⚠️ | Payload prüfen |
| `MQTT broker unavailable` | Verbindung verloren ⚠️ | Mosquitto prüfen |
| `Device X timed out` | ESP offline | Normal für inaktive Mocks |

### 14.7 Vollständige Datei-Referenz

| Komponente | Log-Datei | Konfig-Datei |
|------------|-----------|--------------|
| **ESP32 Serial** | `.pio/build/esp32_dev/monitor.log` | `platformio.ini` |
| **Server** | `logs/god_kaiser.log` | `src/core/logging_config.py`, `.env` |
| **Mosquitto** | `C:/Program Files/mosquitto/mosquitto.log` | `mosquitto.conf` |
| **GitHub Actions** | `gh run view <id> --log` | `.github/workflows/*.yml` |

---

## Referenz-Dokumentation

> Diese Referenz-Dateien enthalten detaillierte Informationen und sollten bei Bedarf konsultiert werden:

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | MQTT-Kommunikation implementieren |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | Fehler debuggen |
| **Datenflüsse** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | System-Interaktion verstehen |
| **REST API** | `.claude/reference/api/REST_ENDPOINTS.md` | Server-API aufrufen |
| **WebSocket** | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Real-time Events |
| **Debugging** | `.claude/reference/debugging/LOG_LOCATIONS.md` | Logs analysieren |
| **Tests** | `.claude/reference/testing/TEST_WORKFLOW.md` | Tests ausführen (NUR auf Anfrage) |

---

## Versions-Historie

**Version:** 5.1 (SKILL.md Format)
**Letzte Aktualisierung:** 2026-02-01

### Änderungen in v5.1 (SKILL.md Format Konvertierung)

- YAML Frontmatter mit `name`, `description`, `allowed-tools` hinzugefügt
- Format für Claude Code VS Code Extension optimiert
- Alle Inhalte vollständig erhalten
- Pfade aktualisiert für neue `.claude/skills/` Struktur

### Vorherige Änderungen

- **v5.0:** Logging & Debugging Dokumentation (Section 14)
- **v4.9:** CI/CD & GitHub Actions Dokumentation (Section 13)
- **v4.8:** Paket X & F Integration, Subzone-Management
- **v4.7:** Server-Architektur Dokumentation (Section 11.1)
- **v4.6:** Paket D Maintenance Jobs Integration
- **v4.5:** Zone Naming & Mock ESP Updates
- **v4.4:** Industrial Production Implementation
- **v4.3:** Server-Integration Verhaltensregeln
- **v4.2:** Cross-Referenzen zu CLAUDE_SERVER.md
- **v4.1:** GPIO Safe-Mode, Safety-Constraints Updates
- **v4.0:** Vollständige Verifizierung gegen Codebase