# AutomationOne Framework - KI-Agenten Dokumentation

> **Für KI-Agenten:** Maßgebliche Referenz für ESP32-Firmware-Entwicklung auf industriellem Niveau

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **ESP32 Code ändern** | [Section 8: Workflow](#8-ki-agenten-workflow) | `El Trabajante/src/` |
| **Server Code ändern** | [Section 11.1: Server-Architektur](#111-el-servador---server-architektur-god-kaiser) + `.claude/CLAUDE_SERVER.md` | `El Servador/god_kaiser_server/src/` |
| **Frontend Code ändern** | `.claude/CLAUDE_FRONTEND.md` | `El Frontend/src/` |
| **Maintenance Jobs** | `.claude/PAKET_D_MAINTENANCE_JOBS_IMPROVED.md` | Server: `src/services/maintenance/`<br>Frontend: `El Frontend/src/views/MaintenanceView.vue` |
| **Frontend + Server starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.4 | - |
| **Services stoppen/neu starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.3 | - |
| **Server-Logs prüfen** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0.5 | - |
| **Frontend Bug debuggen (aktuell)** | `El Frontend/Docs/Bugs_Found_2.md` | Event-Loop Bug, aktuelle Issues |
| **Frontend Bug debuggen (historisch)** | `El Frontend/Docs/Bugs_Found.md` | Production-Ready Bugs |
| **MQTT verstehen** | `El Trabajante/docs/Mqtt_Protocoll.md` | ESP: `src/services/communication/mqtt_client.*`<br>Server: `.claude/CLAUDE_SERVER.md` → [Section 4](.claude/CLAUDE_SERVER.md#4-mqtt-topic-referenz-server-perspektive) |
| **ESP32 API verstehen** | `El Trabajante/docs/API_REFERENCE.md` | `src/services/[modul]/` |
| **Server API verstehen** | [Section 11.1: Server-Architektur](#111-el-servador---server-architektur-god-kaiser) → REST API | `El Servador/god_kaiser_server/src/api/v1/` |
| **Tests schreiben** | `.claude/CLAUDE_SERVER.md` → [Section 12](.claude/CLAUDE_SERVER.md#12-modul-dokumentation-navigation) | `El Servador/god_kaiser_server/tests/` |
| **Error-Code finden** | [Section 5](#5-error-codes-verifiziert) | `src/models/error_codes.h` |
| **ESP32 Build ausführen** | [Section 1](#1-build--commands) | `platformio.ini` |
| **Server starten** | `.claude/CLAUDE_SERVER.md` → [Section 7.1](.claude/CLAUDE_SERVER.md#71-server-starten-development) | `El Servador/god_kaiser_server/` |
| **System-Flow verstehen** | `El Trabajante/docs/system-flows/` (9 Flows inkl. Subzone-Management) | `src/core/` |
| **Paket X (Migration)** | `.cursor/plans/paket_x_-_vollständige_migration_zu_industrietauglichem_system_bc5638d4.plan.md` | SimulationScheduler → MockESPManager Migration |
| **Paket F (Live-Updates)** | `.claude/PAKET_F_ANALYSE.md` | WebSocket Live-Updates im Frontend |
| **Subzone-Management** | `El Trabajante/docs/system-flows/09-subzone-management-flow.md` | Pin-Level Zone-Gruppierung mit Safe-Mode |
| **CI/CD Workflows** | [Section 13: CI/CD & GitHub Actions](#13-cicd--github-actions) | `.github/workflows/` |
| **Workflow-Logs abrufen** | [Section 13: GitHub CLI Log-Befehle](#github-cli-log-befehle) | `gh run view <id> --log` |
| **Wokwi ESP32 Tests** | [Section 13: Wokwi Tests](#wokwi-esp32-tests-firmware-simulation) | `El Trabajante/tests/wokwi/` |
| **Wokwi Bug-Dokumentation** | `.claude/Next Steps/Bugs_Found.md` | 4 gefixte Bugs dokumentiert |

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
│ 📖 Server-Doku: `.claude/CLAUDE_SERVER.md`                  │
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
│ 📖 ESP32-Doku: Diese Datei (CLAUDE.md)                      │
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
│   │   ├── sensor/                # ⭐ SensorManager, PiEnhancedProcessor
│   │   │   └── sensor_drivers/    # DS18B20, SHT31, PH, Generic I2C Drivers
│   │   ├── actuator/              # ⭐ ActuatorManager, SafetyController
│   │   │   └── actuator_drivers/  # Pump, Valve, PWM Drivers
│   │   ├── communication/         # ⭐ MQTTClient, WiFiManager, HTTPClient
│   │   ├── config/                # ConfigManager, StorageManager
│   │   └── provisioning/          # Zone-Assignment
│   ├── models/                    # ⭐ Types, Error Codes, MQTT Messages
│   │   ├── error_codes.h          # ALLE Error-Codes definiert
│   │   ├── sensor_types.h         # SensorConfig, SensorType
│   │   ├── actuator_types.h       # ActuatorConfig, ActuatorType
│   │   └── system_types.h         # SystemState, ZoneConfig
│   ├── error_handling/            # ErrorTracker, CircuitBreaker, HealthMonitor
│   ├── utils/                     # Logger, TopicBuilder, TimeManager
│   └── config/hardware/           # Board-spezifische Configs
│       ├── xiao_esp32c3.h         # XIAO-spezifische Pins
│       └── esp32_dev.h            # ESP32-Dev-Board Pins
├── docs/                          # ⭐ Technische Dokumentation
│   ├── API_REFERENCE.md           # Modul-API-Referenz (~3.300 Zeilen)
│   ├── Mqtt_Protocoll.md          # MQTT-Spezifikation (~3.600 Zeilen)
│   ├── MQTT_CLIENT_API.md         # MQTT-Client-API (~1.300 Zeilen)
│   ├── NVS_KEYS.md                # NVS-Speicher-Keys (~300 Zeilen)
│   ├── Roadmap.md                 # Aktueller Status (~150 Zeilen)
│   ├── System_Overview.md         # Codebase-Analyse (~2.500 Zeilen)
│   └── system-flows/              # 9 Ablauf-Diagramme (inkl. Subzone-Management)
└── platformio.ini                 # Build-Konfiguration
```

---

## 4. MQTT-Protokoll (Verifiziert)

### Topic-Schema (aus TopicBuilder)

**ESP → God-Kaiser (Publish):**
```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data       # Sensor-Daten
kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch             # Batch-Daten
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status   # Aktor-Status
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response # Command-Response
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert    # Aktor-Alerts
kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency       # ESP-spezifischer Emergency
kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat         # Heartbeat (alle 60s)
kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics       # Health-Diagnostics
kaiser/{kaiser_id}/esp/{esp_id}/config_response          # Config-Acknowledgment
kaiser/{kaiser_id}/esp/{esp_id}/zone/ack                 # Zone-Assignment-Ack
```

**God-Kaiser → ESP (Subscribe):**
```
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command  # Aktor-Befehle
kaiser/{kaiser_id}/esp/{esp_id}/actuator/+/command       # Wildcard für alle Aktoren
kaiser/{kaiser_id}/esp/{esp_id}/system/command           # System-Befehle
kaiser/{kaiser_id}/esp/{esp_id}/config                   # Config-Updates
kaiser/{kaiser_id}/esp/{esp_id}/zone/assign              # Zone-Assignment
kaiser/broadcast/emergency                               # Emergency-Stop (alle ESPs)
```

**Default kaiser_id:** `god`

**Vollständige Spezifikation:** `El Trabajante/docs/Mqtt_Protocoll.md`

---

## 5. Error-Codes (Verifiziert aus error_codes.h)

### Hardware (1000-1999)
```cpp
ERROR_GPIO_RESERVED         1001   // Pin bereits reserviert
ERROR_GPIO_CONFLICT         1002   // GPIO-Konflikt
ERROR_GPIO_INIT_FAILED      1003   // Hardware-Init fehlgeschlagen
ERROR_I2C_INIT_FAILED       1010   // I2C-Initialisierung fehlgeschlagen
ERROR_I2C_DEVICE_NOT_FOUND  1011   // I2C-Gerät nicht gefunden
ERROR_SENSOR_READ_FAILED    1040   // Sensor antwortet nicht
ERROR_SENSOR_INIT_FAILED    1041   // Sensor-Init fehlgeschlagen
ERROR_ACTUATOR_SET_FAILED   1050   // Aktor-Command fehlgeschlagen
ERROR_ACTUATOR_INIT_FAILED  1051   // Aktor-Init fehlgeschlagen
```

### Service (2000-2999)
```cpp
ERROR_NVS_INIT_FAILED       2001   // NVS-Initialisierung fehlgeschlagen
ERROR_NVS_READ_FAILED       2002   // NVS-Lesen fehlgeschlagen
ERROR_NVS_WRITE_FAILED      2003   // NVS-Schreiben fehlgeschlagen
ERROR_CONFIG_INVALID        2010   // Ungültige Konfiguration
ERROR_CONFIG_MISSING        2011   // Konfiguration fehlt
ERROR_CONFIG_LOAD_FAILED    2012   // Config-Laden fehlgeschlagen
```

### Communication (3000-3999)
```cpp
ERROR_WIFI_INIT_FAILED      3001   // WiFi-Init fehlgeschlagen
ERROR_WIFI_CONNECT_TIMEOUT  3002   // WiFi-Timeout
ERROR_WIFI_CONNECT_FAILED   3003   // WiFi-Verbindung fehlgeschlagen
ERROR_MQTT_INIT_FAILED      3010   // MQTT-Init fehlgeschlagen
ERROR_MQTT_CONNECT_FAILED   3011   // MQTT-Verbindung fehlgeschlagen
ERROR_MQTT_PUBLISH_FAILED   3012   // Publish fehlgeschlagen
ERROR_MQTT_SUBSCRIBE_FAILED 3013   // Subscribe fehlgeschlagen
```

**Vollständige Liste:** `El Trabajante/src/models/error_codes.h`

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
```

### Wichtigste Dateien für Code-Änderungen

| Modul | Header | Implementation | Verantwortlichkeit |
|-------|--------|----------------|-------------------|
| **SensorManager** | `services/sensor/sensor_manager.h` | `sensor_manager.cpp` | Sensor-Orchestrierung, RAW-Daten |
| **ActuatorManager** | `services/actuator/actuator_manager.h` | `actuator_manager.cpp` | Aktor-Control, Safety |
| **MQTTClient** | `services/communication/mqtt_client.h` | `mqtt_client.cpp` | MQTT Pub/Sub, Heartbeat |
| **ConfigManager** | `services/config/config_manager.h` | `config_manager.cpp` | NVS-Config laden/speichern |
| **GPIOManager** | `drivers/gpio_manager.h` | `gpio_manager.cpp` | Pin-Reservation, Safe-Mode |
| **TopicBuilder** | `utils/topic_builder.h` | `topic_builder.cpp` | MQTT-Topic-Generierung |
| **ErrorTracker** | `error_handling/error_tracker.h` | `error_tracker.cpp` | Error-Logging, History |

---

## 8. KI-Agenten Workflow

### Bei Code-Änderungen

**SCHRITT 1: Kontext verstehen**
1. Welches Modul? → Section 7 Tabelle
2. Relevante Dokumentation lesen:
   - API: `El Trabajante/docs/API_REFERENCE.md`
   - MQTT: `El Trabajante/docs/Mqtt_Protocoll.md`
   - Flow: `El Trabajante/docs/system-flows/`

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
- ✅ ActuatorManager für Aktor-Befehle (Safety-Checks automatisch integriert)
- ✅ TopicBuilder für MQTT-Topics
- ✅ Build-Check vor Commit

---

## 9. Feature Flags (platformio.ini)

```ini
# Kernel-Features (ALLE aktiv)
-DDYNAMIC_LIBRARY_SUPPORT=1     # OTA Library Support
-DHIERARCHICAL_ZONES=1          # Zone-System
-DOTA_LIBRARY_ENABLED=1         # OTA Updates
-DSAFE_MODE_PROTECTION=1        # GPIO Safe-Mode
-DZONE_MASTER_ENABLED=1         # Zone-Master
-DCONFIG_ENABLE_THREAD_SAFETY   # Mutex-Schutz

# Board-spezifisch
XIAO_ESP32C3_MODE=1             # MAX_SENSORS=10, MAX_ACTUATORS=6
ESP32_DEV_MODE=1                # MAX_SENSORS=20, MAX_ACTUATORS=12
```

---

## 10. Dokumentations-Matrix

| Aufgabe | Primäre Doku | Zusätzlich |
|---------|--------------|------------|
| MQTT verstehen | `docs/Mqtt_Protocoll.md` | `docs/MQTT_CLIENT_API.md` |
| Sensor hinzufügen | Server: `El Servador/.../sensors/sensor_libraries/active/` | ESP-Driver: `src/services/sensor/sensor_drivers/` |
| Aktor hinzufügen | `docs/API_REFERENCE.md` (ActuatorManager) | `src/services/actuator/actuator_drivers/` |
| NVS-Keys | `docs/NVS_KEYS.md` | `src/services/config/storage_manager.*` |
| System-Flow | `docs/system-flows/` | `docs/System_Overview.md` |
| Tests schreiben | `El Servador/docs/ESP32_TESTING.md` | `.claude/TEST_WORKFLOW.md` |
| Live-Updates verstehen | `.claude/PAKET_F_ANALYSE.md` | `El Frontend/src/services/websocket.ts` |
| Simulation verstehen | `.cursor/plans/paket_x_-_vollständige_migration_zu_industrietauglichem_system_bc5638d4.plan.md` | `El Servador/god_kaiser_server/src/services/simulation/scheduler.py` |
| Error-Handling | `src/models/error_codes.h` | `src/error_handling/` |

---

## 11. Weitere Ressourcen im .claude/ Ordner

| Datei | Zweck | Wann konsultieren? |
|-------|-------|-------------------|
| **`CLAUDE_SERVER.md`** | ⭐ **Server-spezifische KI-Dokumentation** | Bei allen Server-Änderungen, MQTT-Handler, API-Endpoints, Sensor-Libraries |
| **`CLAUDE_FRONTEND.md`** | ⭐ **Frontend-spezifische KI-Dokumentation** | Bei allen Frontend-Änderungen, Vue Components, Auth-Flow, WebSocket |
| `ARCHITECTURE_DEPENDENCIES.md` | Modul-Abhängigkeiten | Bei Architektur-Fragen, Dependency-Analyse |
| `TEST_WORKFLOW.md` | Test-Infrastruktur-Details | Bei Test-Problemen, Test-Setup |
| `WORKFLOW_PATTERNS.md` | Code-Patterns und Beispiele | Bei Unsicherheit über Code-Patterns |

**📖 Frontend-Aufgaben?** → Siehe `.claude/CLAUDE_FRONTEND.md` + `El Frontend/Docs/`:
- Server + Frontend starten → `DEBUG_ARCHITECTURE.md` Section 0
- Bug debuggen → `Bugs_Found.md`
- API verstehen → `APIs.md`
- **Live-Updates verstehen** → `.claude/PAKET_F_ANALYSE.md` (WebSocket Integration)
- **WebSocket Service** → `El Frontend/src/services/websocket.ts` (Singleton-Pattern)

**📖 Server-Aufgaben?** → Siehe `.claude/CLAUDE_SERVER.md`:
- Sensor-Library hinzufügen → [Section 3.1](.claude/CLAUDE_SERVER.md#31-aufgabe-neuen-sensor-typ-hinzufügen)
- API-Endpoint hinzufügen → [Section 3.2](.claude/CLAUDE_SERVER.md#32-aufgabe-rest-api-endpoint-hinzufügen)
- MQTT-Handler implementieren → [Section 3.3](.claude/CLAUDE_SERVER.md#33-aufgabe-mqtt-handler-implementieren)
- Database-Model hinzufügen → [Section 3.4](.claude/CLAUDE_SERVER.md#34-aufgabe-database-model-hinzufügen)
- Automation-Rule implementieren → [Section 3.5](.claude/CLAUDE_SERVER.md#35-aufgabe-cross-esp-automation-rule-implementieren)

---

## 11.1 El Servador - Server-Architektur (God-Kaiser)

### Verzeichnisstruktur

```
El Servador/god_kaiser_server/      # Python FastAPI Server (~15.000+ Zeilen)
├── src/
│   ├── main.py                     # ⭐ FastAPI App Entry Point, Lifespan Management
│   ├── api/
│   │   ├── v1/                     # ⭐ REST API Endpoints (v1)
│   │   │   ├── auth.py            # JWT Authentication
│   │   │   ├── esp.py             # ESP32 Device Management
│   │   │   ├── sensors.py         # Sensor Configuration & Data
│   │   │   ├── actuators.py       # Actuator Control & Commands
│   │   │   ├── logic.py           # Cross-ESP Automation Rules
│   │   │   ├── zone.py            # Zone Assignment & Management
│   │   │   ├── subzone.py         # Subzone Management & Safe-Mode
│   │   │   ├── health.py          # Health Checks & Metrics
│   │   │   ├── audit.py           # Audit Log API
│   │   │   ├── debug.py           # Mock ESP Management
│   │   │   ├── users.py           # User Management
│   │   │   ├── library.py         # Sensor Library Management
│   │   │   └── websocket/         # WebSocket Real-time Updates
│   │   ├── dependencies.py        # FastAPI Dependencies (Auth, DB Session)
│   │   └── sensor_processing.py   # Real-Time HTTP Sensor Processing
│   ├── core/
│   │   ├── config.py              # ⭐ Pydantic Settings (15+ Config-Klassen)
│   │   ├── constants.py          # System Constants
│   │   ├── error_codes.py         # Unified Error Codes (1000-5999)
│   │   ├── exceptions.py          # Custom Exceptions
│   │   ├── logging_config.py     # Structured Logging Setup
│   │   ├── scheduler.py           # Central APScheduler Instance
│   │   ├── security.py            # JWT, Password Hashing
│   │   └── validators.py          # Pydantic Validators
│   ├── db/
│   │   ├── base.py                # SQLAlchemy Base
│   │   ├── session.py            # Async Session Factory
│   │   ├── models/               # ⭐ Database Models (15 Models)
│   │   │   ├── esp.py            # ESPDevice
│   │   │   ├── sensor.py         # SensorConfig, SensorData
│   │   │   ├── actuator.py       # ActuatorConfig, ActuatorState, ActuatorHistory
│   │   │   ├── logic.py          # CrossESPLogic, LogicExecutionHistory
│   │   │   ├── zone.py           # Zone (via ESPDevice.master_zone_id)
│   │   │   ├── subzone.py        # SubzoneConfig
│   │   │   ├── user.py           # User
│   │   │   ├── auth.py           # TokenBlacklist
│   │   │   ├── audit_log.py      # AuditLog
│   │   │   ├── library.py        # LibraryMetadata
│   │   │   ├── ai.py             # AIPredictions
│   │   │   ├── kaiser.py         # KaiserRegistry, ESPOwnership
│   │   │   ├── system.py         # SystemConfig
│   │   │   └── enums.py          # DataSource, etc.
│   │   └── repositories/         # ⭐ Repository Pattern (14 Repositories)
│   │       ├── base_repo.py      # Generic CRUD Base
│   │       ├── esp_repo.py       # ESPDevice Repository
│   │       ├── sensor_repo.py    # Sensor Repository
│   │       ├── actuator_repo.py # Actuator Repository
│   │       ├── logic_repo.py     # Logic Repository
│   │       ├── zone_repo.py      # Zone Repository
│   │       ├── user_repo.py      # User Repository
│   │       └── ...               # Weitere Repositories
│   ├── mqtt/
│   │   ├── client.py             # ⭐ Singleton MQTT Client (Paho-MQTT)
│   │   ├── subscriber.py         # ⭐ Topic Subscription & Handler Routing
│   │   ├── publisher.py          # MQTT Message Publishing
│   │   ├── topics.py             # Topic Builder Utilities
│   │   └── handlers/             # ⭐ MQTT Message Handlers (12 Handler)
│   │       ├── base_handler.py   # Base Handler mit Error-Isolation
│   │       ├── sensor_handler.py # Sensor Data Processing
│   │       ├── actuator_handler.py # Actuator Status Updates
│   │       ├── actuator_response_handler.py # Command Confirmations
│   │       ├── actuator_alert_handler.py # Emergency/Timeout Alerts
│   │       ├── heartbeat_handler.py # ESP Health Monitoring
│   │       ├── config_handler.py # Config Acknowledgment
│   │       ├── zone_ack_handler.py # Zone Assignment ACK
│   │       ├── subzone_ack_handler.py # Subzone Assignment ACK
│   │       ├── discovery_handler.py # Legacy Discovery (DEPRECATED)
│   │       └── kaiser_handler.py # Kaiser Node Status (PLANNED)
│   ├── services/
│   │   ├── esp_service.py        # ⭐ ESP Device Management
│   │   ├── sensor_service.py     # ⭐ Sensor Configuration & Data
│   │   ├── actuator_service.py   # ⭐ Actuator Control & Safety
│   │   ├── safety_service.py     # ⭐ Safety Validation (Emergency-Stop, Value-Checks)
│   │   ├── logic_engine.py       # ⭐ Cross-ESP Automation Engine (Background Task)
│   │   ├── logic_scheduler.py    # Logic Rule Scheduler (Timer-based)
│   │   ├── logic_service.py     # Logic Rule CRUD Operations
│   │   ├── zone_service.py      # Zone Management
│   │   ├── subzone_service.py   # Subzone Management
│   │   ├── config_builder.py    # ESP32 Config Payload Builder
│   │   ├── mock_esp_manager.py  # Mock ESP Simulation Management
│   │   ├── mqtt_auth_service.py  # MQTT Authentication (Mosquitto Passwd)
│   │   ├── health_service.py    # Health Check Aggregation
│   │   ├── audit_retention_service.py # Audit Log Cleanup
│   │   ├── library_service.py   # Sensor Library Management
│   │   ├── god_client.py        # God Layer HTTP Client
│   │   ├── ai_service.py         # AI/God Layer Integration
│   │   ├── kaiser_service.py    # Kaiser Node Management (PLANNED)
│   │   ├── maintenance/         # ⭐ Maintenance Jobs System
│   │   │   ├── service.py       # MaintenanceService (Singleton)
│   │   │   └── jobs/
│   │   │       └── cleanup.py  # Cleanup Jobs (Sensor Data, Command History, Audit Log)
│   │   ├── simulation/          # Mock ESP Simulation
│   │   │   └── scheduler.py    # SimulationScheduler
│   │   └── logic/               # Logic Engine Components
│   │       ├── conditions/     # Condition Evaluators
│   │       │   ├── base.py
│   │       │   ├── sensor_evaluator.py
│   │       │   ├── time_evaluator.py
│   │       │   └── compound_evaluator.py
│   │       └── actions/        # Action Executors
│   │           ├── base.py
│   │           ├── actuator_executor.py
│   │           ├── delay_executor.py
│   │           └── notification_executor.py
│   ├── sensors/
│   │   ├── base_processor.py    # Base Sensor Processor Interface
│   │   ├── library_loader.py    # Dynamic Library Loading
│   │   ├── sensor_type_registry.py # Sensor Type Registry
│   │   └── sensor_libraries/
│   │       └── active/          # ⭐ Active Sensor Libraries (10 Libraries)
│   │           ├── ds18b20.py   # DS18B20 Temperature
│   │           ├── sht31.py     # SHT31 Temperature/Humidity
│   │           ├── ph.py        # PH Sensor
│   │           └── ...          # Weitere Libraries
│   ├── schemas/                 # ⭐ Pydantic Schemas (Request/Response)
│   │   ├── esp.py
│   │   ├── sensor.py
│   │   ├── actuator.py
│   │   ├── logic.py
│   │   ├── zone.py
│   │   ├── auth.py
│   │   └── ...
│   ├── websocket/
│   │   └── manager.py           # ⭐ WebSocket Manager (Real-time Updates)
│   └── utils/
│       ├── data_helpers.py      # Data Transformation Utilities
│       ├── mqtt_helpers.py      # MQTT Utilities
│       ├── network_helpers.py   # Network Utilities
│       └── time_helpers.py      # Time Utilities
├── tests/                        # ⭐ Comprehensive Test Suite (150+ Tests)
│   ├── unit/                     # Unit Tests (20+ Tests)
│   ├── integration/              # Integration Tests (17+ Tests)
│   ├── esp32/                    # ESP32 Mock Tests (140+ Tests)
│   │   ├── mocks/                # Mock ESP32 Client
│   │   └── test_*.py             # Test Categories
│   └── e2e/                      # End-to-End Tests
├── alembic/                      # Database Migrations
│   └── versions/                 # Migration Scripts
├── config/
│   └── logging.yaml              # Logging Configuration
├── docs/                         # Server-spezifische Dokumentation
│   ├── ESP32_TESTING.md          # ESP32 Test Framework Guide
│   ├── MQTT_TEST_PROTOCOL.md     # MQTT Test Protocol
│   └── ...
├── pyproject.toml                # Poetry Dependencies
├── alembic.ini                   # Alembic Configuration
└── README.md                     # Server README
```

### Kern-Komponenten

#### 1. FastAPI Application (`src/main.py`)
- **Lifespan Management:** Startup/Shutdown Orchestrierung
- **Startup-Sequenz:**
  1. Security Validation (JWT Secret, MQTT TLS)
  2. Database Initialization (PostgreSQL)
  3. MQTT Client Connection (Auto-Reconnect)
  4. MQTT Handler Registration (12 Handler)
  5. Central Scheduler Initialization (APScheduler)
  6. SimulationScheduler Initialization
  7. MaintenanceService Initialization
  8. MockESPManager Configuration
  9. Mock-ESP Recovery (nach Server-Restart)
  10. WebSocket Manager Initialization
  11. Logic Engine & Scheduler Initialization
- **Shutdown-Sequenz:**
  1. Logic Scheduler Stop
  2. Logic Engine Stop
  3. MaintenanceService Stop
  4. MockESPManager Shutdown
  5. Central Scheduler Shutdown
  6. WebSocket Manager Shutdown
  7. MQTT Subscriber Shutdown
  8. MQTT Client Disconnect
  9. Database Engine Dispose

#### 2. MQTT-System (`src/mqtt/`)
- **MQTTClient (Singleton):**
  - Paho-MQTT Wrapper
  - TLS/SSL Support
  - Auto-Reconnect mit Exponential Backoff
  - Connection State Management
  - Rate-Limited Disconnect Warnings
- **Subscriber:**
  - Thread-Pool für Handler-Execution (`MQTT_SUBSCRIBER_MAX_WORKERS`, default: 10)
  - Pattern-based Topic Routing
  - Error Isolation (Handler-Fehler crashen nicht den Subscriber)
  - Performance Monitoring
- **Publisher:**
  - QoS-Level Management
  - Retry-Logic
- **Handler-System:**
  - `BaseMQTTHandler`: Abstrakte Basis-Klasse mit Error-Isolation
  - 12 spezialisierte Handler für verschiedene Message-Types
  - Topic-Parsing, Payload-Validation, ESP-Lookup standardisiert

#### 3. Database-Layer (`src/db/`)
- **Models (15 Models):**
  - `ESPDevice`: ESP32 Device Registry
  - `SensorConfig`, `SensorData`: Sensor Configuration & Time-Series Data
  - `ActuatorConfig`, `ActuatorState`, `ActuatorHistory`: Actuator Management
  - `CrossESPLogic`, `LogicExecutionHistory`: Automation Rules
  - `User`, `TokenBlacklist`: Authentication
  - `AuditLog`: Event Tracking
  - `SubzoneConfig`: Subzone Management
  - `LibraryMetadata`: Sensor Library Metadata
  - `AIPredictions`: AI/God Layer Integration
  - `KaiserRegistry`, `ESPOwnership`: Multi-Kaiser Support (PLANNED)
- **Repositories (14 Repositories):**
  - Repository Pattern für Datenbankzugriff
  - Generic CRUD Operations in `BaseRepository`
  - Async SQLAlchemy Sessions
  - Transaction Management

#### 4. Service-Layer (`src/services/`)
- **Core Services:**
  - `ESPService`: Device Management, Registration, Config Updates
  - `SensorService`: Sensor Configuration, Data Storage, Pi-Enhanced Processing
  - `ActuatorService`: Actuator Control, Command Publishing, History Tracking
  - `SafetyService`: Safety Validation (Emergency-Stop, Value-Checks, Timeout-Protection)
  - `LogicEngine`: Cross-ESP Automation (Background Task)
  - `LogicScheduler`: Timer-based Rule Evaluation
  - `ZoneService`: Zone Assignment & Management
  - `SubzoneService`: Subzone Management & Safe-Mode Control
- **Support Services:**
  - `SimulationScheduler`: ⭐ **NEU** - Industrietaugliche Mock ESP Simulation (ersetzt MockESPManager)
  - `MaintenanceService`: Cleanup Jobs, Health Checks, Stats Aggregation
  - `HealthService`: Health Check Aggregation
  - `AuditRetentionService`: Audit Log Cleanup
  - `MQTTAuthService`: Mosquitto Password File Management
  - `ConfigBuilder`: ESP32 Config Payload Builder
  - `LibraryService`: Sensor Library Management
  - `MockESPManager`: Legacy Mock ESP Simulation (deprecated - durch SimulationScheduler ersetzt)

#### 5. REST API (`src/api/v1/`)
- **Endpoints:**
  - `/api/v1/auth`: JWT Authentication (Login, Refresh, Register)
  - `/api/v1/esp`: ESP32 Device Management (CRUD, Config, Health)
  - `/api/v1/sensors`: Sensor Configuration & Data Query
  - `/api/v1/actuators`: Actuator Control & Commands
  - `/api/v1/logic`: Cross-ESP Automation Rules (CRUD, Toggle, Test)
  - `/api/v1/zone`: Zone Assignment & Management
  - `/api/v1/subzone`: Subzone Management & Safe-Mode
  - `/api/v1/health`: Health Checks & Metrics
  - `/api/v1/audit`: Audit Log Query & Statistics
  - `/api/v1/debug`: Mock ESP Management
  - `/api/v1/users`: User Management
  - `/api/v1/library`: Sensor Library Management
  - `/api/v1/websocket`: WebSocket Real-time Updates
- **Authentication:**
  - JWT Tokens (Access + Refresh)
  - Token Blacklist für Logout
  - Role-based Access Control (Admin, User)
  - API Keys für ESP32 Devices (MQTT Auth)

#### 6. Logic Engine (`src/services/logic_engine.py`)
- **Architektur:**
  - Background Task (asyncio)
  - Event-driven Evaluation (bei Sensor-Daten-Arrival)
  - Timer-based Evaluation (via LogicScheduler)
- **Condition Evaluators:**
  - `SensorConditionEvaluator`: Sensor-Wert-Vergleiche
  - `TimeConditionEvaluator`: Zeit-basierte Bedingungen
  - `CompoundConditionEvaluator`: AND/OR/NOT Kombinationen
- **Action Executors:**
  - `ActuatorActionExecutor`: Aktor-Befehle ausführen
  - `DelayActionExecutor`: Verzögerungen
  - `NotificationActionExecutor`: WebSocket Notifications
- **Features:**
  - Cross-ESP Rules (UUID-basiert)
  - Cooldown-Mechanismus (zu häufige Ausführungen verhindern)
  - Execution History Tracking
  - Rule Toggle (enable/disable)

#### 7. Sensor Processing (`src/sensors/`)
- **Pi-Enhanced Processing:**
  - Dynamic Library Loading (`library_loader.py`)
  - Sensor Type Registry (`sensor_type_registry.py`)
  - 10 Active Sensor Libraries (`sensor_libraries/active/`)
  - Base Processor Interface (`base_processor.py`)
- **Workflow:**
  1. ESP32 sendet RAW-Daten (`raw_mode: true`)
  2. Sensor Handler prüft `pi_enhanced: true`
  3. Library wird dynamisch geladen
  4. Processing läuft asynchron
  5. Processed-Werte werden in DB gespeichert
  6. Optional: Processed-Werte zurück an ESP32

#### 8. WebSocket System (`src/websocket/manager.py`) ⭐ **NEU - Paket F**
- **Features:**
  - Real-time Updates für Frontend (Live-Updates in allen Views)
  - Event Types: `sensor_data`, `actuator_status`, `esp_health`, `system_event`, `config_response`
  - Filter-System (types, esp_ids, sensor_types, topicPattern)
  - Connection Management mit Auto-Reconnect
  - Heartbeat für Connection Health
  - Rate-Limiting (10 msg/sec)
  - Singleton-Pattern für effiziente Ressourcen-Nutzung

#### 9. SimulationScheduler (`src/services/simulation/scheduler.py`) ⭐ **NEU - Paket X**
- **Architektur:**
  - Single Source of Truth für Mock ESP Simulation (ersetzt MockESPManager)
  - Database-zentrierte Persistenz (PostgreSQL statt In-Memory)
  - APScheduler für zeitgesteuerte Jobs (Heartbeat, Sensor-Simulation)
  - Industrietaugliche Robustheit mit Server-Neustart-Recovery
- **Features:**
  - Batch-Sensor-Value-Updates
  - Auto-Heartbeat-Konfiguration
  - MQTT-Message-Publishing
  - Simulation-State-Management
  - Runtime-Monitoring und Health-Checks

#### 10. Configuration (`src/core/config.py`)
- **Pydantic Settings:**
  - `DatabaseSettings`: PostgreSQL Connection
  - `MQTTSettings`: MQTT Broker Config (TLS, Worker-Pool)
  - `SecuritySettings`: JWT, Password Hashing
  - `PerformanceSettings`: Logic Scheduler Interval, Monitoring
  - `MaintenanceSettings`: Cleanup Jobs (Data-Safe, Default: DISABLED)
  - `NotificationSettings`: SMTP, Webhook
  - `WebSocketSettings`: Connection Limits
  - `SensorSettings`: Pi-Enhanced Processing
  - `ActuatorSettings`: Safety Checks, Emergency-Stop
  - 15+ Config-Klassen total
- **Environment Variables:**
  - Alle Settings via `.env` Datei konfigurierbar
  - Defaults für Development
  - Production-Validation (z.B. JWT Secret)

#### 10. Testing (`tests/`)
- **Test-Kategorien:**
  - **Unit Tests (20+):** Service-Layer Tests
  - **Integration Tests (17+):** API Integration Tests
  - **ESP32 Mock Tests (140+):** Communication, Infrastructure, Actuator, Sensor, Cross-ESP, Performance
  - **E2E Tests:** End-to-End Workflows
- **Test-Framework:**
  - pytest mit pytest-asyncio
  - Mock ESP32 Client für Hardware-unabhängige Tests
  - Real ESP32 Client für Hardware-Tests (optional)
  - Coverage Reports (HTML)

### Technologie-Stack

- **Framework:** FastAPI 0.109+
- **Database:** PostgreSQL (SQLAlchemy Async 2.0+)
- **MQTT:** Paho-MQTT + aiomqtt
- **Authentication:** python-jose (JWT), passlib (bcrypt)
- **Validation:** Pydantic 2.5+
- **Scheduling:** APScheduler 3.11+
- **WebSocket:** websockets 12.0+
- **Testing:** pytest 8.0+, pytest-asyncio, pytest-cov
- **Migrations:** Alembic 1.13+
- **Logging:** Structured Logging (JSON/Text)

### Performance-Features

- **Async/Await:** Vollständig asynchron (FastAPI, SQLAlchemy Async)
- **Connection Pooling:** Database Connection Pool (configurable)
- **Thread-Pool:** MQTT Handler Thread-Pool (`MQTT_SUBSCRIBER_MAX_WORKERS`)
- **Background Tasks:** Logic Engine, Scheduler, Maintenance Jobs
- **Rate-Limiting:** WebSocket Rate-Limiting (10 msg/sec), MQTT Message-Batching
- **Batch Operations:** Cleanup Jobs mit Batch-Processing, SimulationScheduler Batch-Updates
- **Database Indizes:** Performance-Indizes auf Time-Range Queries, Audit-Log Indizes
- **Singleton-Pattern:** WebSocket Service, SimulationScheduler für Ressourcen-Effizienz

### Sicherheits-Features

- **JWT Authentication:** Access + Refresh Tokens
- **Token Blacklist:** Logout-Support
- **Password Hashing:** bcrypt
- **MQTT TLS:** Optional TLS/SSL für MQTT
- **MQTT Auth:** Mosquitto Password File Integration
- **Safety Service:** Emergency-Stop, Value-Validierung, Timeout-Protection
- **Audit Logging:** Vollständiges Event-Tracking
- **Input Validation:** Pydantic Schema Validation
- **SQL Injection Protection:** SQLAlchemy ORM

---

## 11.2 Server-Integration: Verhaltensregeln für ESP32-Code

**KRITISCH:** ESP32-Code muss mit dem God-Kaiser Server kompatibel sein. Diese Regeln MÜSSEN befolgt werden:

### MQTT-Topic-Konventionen
- **Topic-Building:** IMMER `TopicBuilder` verwenden (`El Trabajante/src/utils/topic_builder.cpp`)
- **Kaiser-ID:** Standard ist `"god"`, kann via Config geändert werden
- **Wildcards:** Server subscribed auf `kaiser/{kaiser_id}/esp/+/sensor/+/data` (Wildcard `+` für esp_id und gpio)

### Payload-Struktur
- **Sensor-Daten:** MUSS `raw_mode: true` enthalten (Required Field seit 2025-12-08)
- **Heartbeat:** MUSS `heap_free` enthalten (nicht `free_heap` - ESP32-Standard)
- **Timestamps:** Unix-Timestamp in Sekunden (nicht Millisekunden)
- **ESP-ID Format:** `ESP_{8 alphanumeric chars}` (z.B. `ESP_12AB34CD`)

### Device-Registration
- **KRITISCH:** ESPs MÜSSEN zuerst via REST API registriert werden (`POST /api/v1/esp/register`)
- **Auto-Discovery deaktiviert:** Unbekannte Geräte werden in Heartbeat-Handler abgelehnt
- **Code-Location:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:98-109`

### Safety-Constraints (Server-seitig)
- **Actuator-Commands:** Werden VOR Publishing durch `SafetyService.validate_actuator_command()` geprüft
- **Emergency-Stop:** Wird automatisch geprüft - Commands werden abgelehnt wenn aktiv
- **Value-Validierung:** PWM-Werte müssen 0.0-1.0 sein (Server validiert, ESP32 konvertiert intern zu 0-255)
- **Code-Location:** `El Servador/god_kaiser_server/src/services/actuator_service.py:74-107`

### Pi-Enhanced Processing
- **Trigger:** Wird automatisch getriggert wenn `sensor_config.pi_enhanced == True` und `raw_mode == true`
- **Response-Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed`
- **Processing:** Läuft asynchron, ESP32 kann weiterarbeiten während Processing läuft
- **Code-Location:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:130-150`

### Logic-Engine Integration
- **Trigger:** Wird automatisch getriggert nach Sensor-Daten-Speicherung
- **Non-blocking:** Evaluation läuft asynchron, blockiert nicht Sensor-Handler
- **Cooldown:** Rules haben `cooldown_seconds` um zu häufige Ausführungen zu verhindern
- **Code-Location:** `El Servador/god_kaiser_server/src/services/logic_engine.py:84-137`

### Error-Handling
- **MQTT-Publish-Fehler:** Werden geloggt, ESP32 sollte Retry-Logic haben
- **Handler-Fehler:** Crashen nicht den Server (Error-Isolation im Subscriber)
- **Validation-Fehler:** Werden als Warnings/Errors geloggt, Payload wird verworfen

### Zone Naming Konventionen (Frontend + Server)
- **zone_id:** Technische Zone-ID (lowercase, no spaces, z.B. `zelt_1`, `gewaechshaus_nord`)
  - Wird in MQTT Topics verwendet: `kaiser/{kaiser_id}/zone/{zone_id}/...`
  - Validierung: nur `[a-z0-9_-]` erlaubt
- **zone_name:** Menschenlesbarer Name (z.B. `Zelt 1`, `Gewächshaus Nord`)
  - Wird in UI angezeigt
  - Frontend generiert automatisch `zone_id` aus `zone_name`
- **Auto-Generierung:** `"Zelt 1"` → `"zelt_1"`, `"Gewächshaus Nord"` → `"gewaechshaus_nord"`
- **Code-Locations:**
  - Server: `El Servador/god_kaiser_server/src/schemas/zone.py:65-71` (Validierung)
  - Frontend: `El Frontend/src/components/zones/ZoneAssignmentPanel.vue:130-140` (Generierung)

### Mock ESP Architektur
- **Dual-Storage:** Mock ESPs existieren sowohl im In-Memory Store als auch in PostgreSQL
- **Erstellung:** `POST /v1/debug/mock-esp` → MockESPManager + ESPRepository
- **Updates:** `PATCH /v1/esp/devices/{id}` → Normale ESP API (DB)
- **Zone-Zuweisung:** `POST /v1/zone/devices/{id}/assign` → Funktioniert für Mock + Real ESPs
- **Code-Location:** `El Servador/god_kaiser_server/src/api/v1/debug.py:98-147`

**Vollständige Server-Dokumentation:** `.claude/CLAUDE_SERVER.md`
**Frontend-Dokumentation:** `.claude/CLAUDE_FRONTEND.md`

---

## 12. Aktueller Entwicklungsstand

| Phase | Status | Module |
|-------|--------|--------|
| Phase 0-7 | ✅ COMPLETE | GPIO, Logger, Config, WiFi, MQTT, I2C, OneWire, Sensor, Actuator, Error |
| Phase 8 | ⏳ NEXT | Integration & Final Testing |
| Phase 9 | ✅ COMPLETE | Subzone-Management, Pin-Level Zone-Gruppierung |
| Paket X | ✅ COMPLETE | SimulationScheduler Migration (industrietaugliche Simulation) |
| Paket F | ✅ COMPLETE | WebSocket Live-Updates im Frontend |

**Code-Qualität:** 5.0/5 (Production-Ready)
**Implementierte Zeilen:** ~13.300 (ESP32) + ~15.000+ (Server) + ~7.000 (Frontend)
**Neue Features:** Subzone-Management, SimulationScheduler, WebSocket Live-Updates

---

## 13. CI/CD & GitHub Actions

### Workflow-Übersicht

| Workflow | Datei | Trigger | Beschreibung |
|----------|-------|---------|--------------|
| **Wokwi ESP32 Tests** | `wokwi-tests.yml` | Push/PR zu `El Trabajante/**` | ESP32-Firmware in Wokwi-Simulation testen |
| **ESP32 Tests** | `esp32-tests.yml` | Push/PR zu `tests/esp32/**`, `mqtt/**`, `services/**` | Mock-ESP32-Tests auf Server-Seite |
| **Server Tests** | `server-tests.yml` | Push/PR zu `El Servador/**` | Unit-, Integration-Tests, Linting |
| **PR Checks** | `pr-checks.yml` | Pull Requests | Label-PR, Large-File-Check, Sensitive-File-Check |

### Wokwi ESP32 Tests (Firmware-Simulation)

**Zweck:** Testet die echte ESP32-Firmware in der Wokwi-Virtualisierung.

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
| `El Trabajante/tests/wokwi/README.md` | Wokwi-Test Dokumentation |
| `.claude/Next Steps/Bugs_Found.md` | Bug-Dokumentation (4 Bugs gefixt) |

**Wokwi CLI Syntax:**
```bash
# WICHTIG: Projektverzeichnis als ERSTES Argument!
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_test.yaml

# FALSCH (häufiger Fehler):
wokwi-cli run --timeout 90000 --scenario tests/wokwi/boot_test.yaml  # FALSCH!
```

**Szenario-Format:**
```yaml
name: My Test
version: 1
steps:
  - wait-serial: "Expected output"
  # HINWEIS: timeout per Step wird NICHT unterstützt!
  # Nutze stattdessen: wokwi-cli . --timeout 90000
```

### ESP32 Mock Tests (Server-seitig)

**Zweck:** Testet ESP32-Kommunikation ohne echte Hardware.

**Services:** Mosquitto MQTT Broker (Docker)

**Tests:** `El Servador/god_kaiser_server/tests/esp32/`

**Kategorien:**
- Communication Tests (MQTT Pub/Sub)
- Infrastructure Tests (Handler, Services)
- Actuator Tests (Commands, Safety)
- Sensor Tests (Data Processing)
- Cross-ESP Tests (Logic Engine)
- Performance Tests

### Server Tests

**Zweck:** Testet den God-Kaiser Server.

**Jobs:**
1. **Lint:** Ruff (Linter) + Black (Formatter)
2. **Unit Tests:** `tests/unit/` mit Coverage
3. **Integration Tests:** `tests/integration/` mit MQTT Broker
4. **Test Summary:** Publiziert Ergebnisse in PR

**Artifacts:** JUnit XML + Coverage Reports

### GitHub CLI Log-Befehle

```bash
# Alle Workflows auflisten
gh workflow list

# Runs eines spezifischen Workflows auflisten
gh run list --workflow=wokwi-tests.yml
gh run list --workflow=esp32-tests.yml
gh run list --workflow=server-tests.yml

# Run-Details anzeigen
gh run view <run-id>

# Live-Logs verfolgen (während Ausführung)
gh run watch <run-id>

# Vollständige Logs abrufen
gh run view <run-id> --log

# Nur fehlgeschlagene Logs
gh run view <run-id> --log-failed

# Logs in Datei speichern
gh run view <run-id> --log > workflow_logs.txt

# Workflow manuell triggern
gh workflow run wokwi-tests.yml
gh workflow run esp32-tests.yml
gh workflow run server-tests.yml

# Artifacts herunterladen
gh run download <run-id>
gh run download <run-id> -n wokwi-test-logs
```

### Troubleshooting

| Problem | Lösung |
|---------|--------|
| `WOKWI_CLI_TOKEN` fehlt | GitHub Secret konfigurieren: Settings → Secrets → Actions |
| `wokwi.toml not found` | Projektverzeichnis als **erstes** CLI-Argument: `wokwi-cli . --timeout ...` |
| `Invalid scenario step key: timeout` | `timeout:` aus YAML entfernen, nur CLI `--timeout` verwenden |
| `Mosquitto failed to start` | `mosquitto_pub` statt `mosquitto_sub` für Health-Check verwenden |
| Tests laufen nicht | `gh run view <id> --log-failed` für Details |

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

**Letzte Aktualisierung:** 2026-01-05
**Version:** 4.9 (CI/CD & GitHub Actions Dokumentation)

> **Änderungen in v4.9 (CI/CD & GitHub Actions Dokumentation):**
> - **Neue Section 13:** Vollständige CI/CD & GitHub Actions Dokumentation
> - **Workflow-Übersicht:** Alle 4 Workflows dokumentiert (Wokwi, ESP32, Server, PR Checks)
> - **Wokwi ESP32 Tests:** Firmware-Simulation mit korrekter CLI-Syntax dokumentiert
> - **GitHub CLI Befehle:** Vollständige Referenz für Workflow-Logs und Troubleshooting
> - **Troubleshooting-Tabelle:** 5 häufige Probleme mit Lösungen dokumentiert
> - **Lokale Test-Ausführung:** Befehle für lokales Testen hinzugefügt
> - **Quick Reference erweitert:** CI/CD, Workflow-Logs, Wokwi-Tests, Bug-Dokumentation hinzugefügt
> - **Bug-Dokumentation:** `.claude/Next Steps/Bugs_Found.md` mit 4 gefixten Bugs verlinkt

> **Änderungen in v4.8 (Paket X & F Integration, Subzone-Management):**
> - **Vollständige Paket X Integration:** SimulationScheduler als industrietauglicher Ersatz für MockESPManager dokumentiert
> - **Paket F Live-Updates:** WebSocket System für Real-time Frontend-Updates vollständig integriert
> - **Subzone-Management Phase 9:** Pin-Level Zone-Gruppierung mit Safe-Mode-Integration dokumentiert
> - **System-Flows aktualisiert:** Von 8 auf 9 Flows erweitert (Subzone-Management hinzugefügt)
> - **Quick Reference erweitert:** Neue Pakete und Features in Übersicht integriert
> - **Frontend-Dokumentation:** Live-Updates und WebSocket-Service-Verweise hinzugefügt
> - **Phase-Status aktualisiert:** Phase 9, Paket X, Paket F als abgeschlossen markiert

> **Änderungen in v4.7 (Server-Architektur Dokumentation):**
> - **Umfassende Server-Codebase-Analyse:** Vollständige Dokumentation der God-Kaiser Server-Architektur
> - **Verzeichnisstruktur:** Detaillierte Übersicht aller Server-Komponenten (API, Services, MQTT, DB, Tests)
> - **Kern-Komponenten:** 10 Haupt-Komponenten dokumentiert (FastAPI App, MQTT-System, Database-Layer, Service-Layer, REST API, Logic Engine, Sensor Processing, WebSocket, Configuration, Testing)
> - **Technologie-Stack:** Vollständige Liste aller verwendeten Frameworks und Libraries
> - **Performance-Features:** Async/Await, Connection Pooling, Thread-Pool, Background Tasks dokumentiert
> - **Sicherheits-Features:** JWT, Token Blacklist, MQTT TLS, Safety Service, Audit Logging dokumentiert
> - **Quick Reference:** Server-spezifische Verweise aktualisiert

---

**Diese Dokumentation ist nun vollständig auf dem neuesten Stand (2026-01-05). Alle System Flows, Pakete, CI/CD Workflows und neuen Features wurden integriert.**

> **Änderungen in v4.6 (Paket D: Maintenance Jobs Integration):**
> - **Maintenance Jobs System:** Data-Safe Cleanup-Jobs für Sensor-Daten, Command-History, Orphaned-Mocks
> - **Safety-First-Approach:** Alle Cleanup-Jobs per Default DISABLED, Dry-Run Mode per Default aktiv
> - **Health-Check-Jobs:** ESP-Timeout-Detection, MQTT-Broker-Monitoring
> - **Stats-Aggregation:** Dashboard-Statistiken werden automatisch aggregiert
> - **Frontend-Integration:** MaintenanceView.vue für Admin-Zugriff auf Maintenance-Jobs
> - **Umfassende Test-Suite:** 21 Unit-Tests für alle Cleanup-Jobs
> - **Dokumentation:** PAKET_D_* Dokumente mit vollständiger Implementierung und Verifikation
> - **Quick Reference:** Maintenance Jobs hinzugefügt

> **Änderungen in v4.5 (Zone Naming & Mock ESP Updates):**
> - **Zone Naming Konventionen:** Zwei-Feld-System (`zone_id` technisch, `zone_name` menschenlesbar)
> - **Mock ESP Architektur:** Dual-Storage (In-Memory + PostgreSQL) dokumentiert
> - **Frontend-Integration:** Auto-Generierung von `zone_id` aus `zone_name`
> - **Verweis auf CLAUDE_FRONTEND.md** hinzugefügt

> **Änderungen in v4.4 (Industrial Production Implementation):**
> - **Vollständiges Audit-Log-System implementiert:**
>   - Performance-Indizes auf `created_at` für Time-Range Queries
>   - `AuditRetentionService` mit konfigurierbaren Retention-Policies
>   - REST API `/api/v1/audit/` mit Filter, Statistics, Manual Cleanup
>   - Frontend-Dashboard `AuditLogView.vue` mit Retention-Konfiguration
> - **Konfigurierbares Field-Mapping-System:**
>   - `ConfigMappingEngine` für Runtime-konfigurierbare ESP32-Payload-Mappings
>   - JSON-Schema-Validation für Mapping-Definitions
>   - Ersetzt hardcodiertes Mapping in `ConfigPayloadBuilder`
> - **Synchronisiertes Error-Code-System:**
>   - Unified Error Codes (1000-5999) mit einheitlichen Beschreibungen
>   - ESP32 Hardware/Service/Communication/Application Error Ranges
>   - Server Config/MQTT/Validation/Database/Service/Audit Error Ranges
> - **ESP Online-Check mit konfigurierbarem Verhalten:**
>   - `ESPService.send_config()` mit `offline_behavior` Parameter ("warn", "skip", "fail")
>   - Industrietaugliche Offline-Handling für große und kleine Systeme
> - **Base MQTT Handler-Klasse:**
>   - Abstrakte `BaseMQTTHandler`-Klasse reduziert Code-Duplizierung
>   - Standardisierte Topic-Parsing, Payload-Validation, ESP-Lookup
>   - Konsistente Error-Handling und Audit-Logging
> - **Alembic Migration:** `add_audit_log_indexes.py` für Performance-Optimierung

**Änderungen in v4.3:**
> - Section 11.1 hinzugefügt: Server-Integration Verhaltensregeln für ESP32-Code
> - MQTT-Topic-Konventionen, Payload-Struktur, Device-Registration dokumentiert
> - Safety-Constraints und Pi-Enhanced Processing Integration dokumentiert
> - Logic-Engine Integration und Error-Handling dokumentiert
> - Alle Server-Referenzen mit Code-Locations ergänzt

> **Änderungen in v4.2:**
> - Cross-Referenzen zu `.claude/CLAUDE_SERVER.md` hinzugefügt
> - Quick Reference um Server-Verweise erweitert
> - System-Architektur-Sektion verweist auf Server-Doku
> - Section 11 erweitert um Server-Dokumentations-Verweise

> **Änderungen in v4.1:**
> - GPIO Safe-Mode Methodenname korrigiert: `initializeAllPinsToSafeMode()`
> - Safety-Constraints aktualisiert: ActuatorManager Safety-Checks dokumentiert
> - MQTT-Topics erweitert: `/alert`, `/response`, `/emergency`, `/diagnostics` hinzugefügt
> - Verzeichnisstruktur: `sensor_drivers/` ergänzt
> - NIEMALS-Regeln erweitert: GPIO-Pin-Reservation ergänzt

> **Änderungen in v4.0:**
> - Alle Error-Codes mit `error_codes.h` abgeglichen
> - MQTT-Topics mit `TopicBuilder` verifiziert
> - Alle Pfad-Referenzen korrigiert
> - Dokumentation auf das Wesentliche fokussiert
> - Code-Beispiele aus tatsächlichem Code
