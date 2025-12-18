# AutomationOne Framework - KI-Agenten Dokumentation

> **Für KI-Agenten:** Maßgebliche Referenz für ESP32-Firmware-Entwicklung auf industriellem Niveau

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **ESP32 Code ändern** | [Section 8: Workflow](#8-ki-agenten-workflow) | `El Trabajante/src/` |
| **Server Code ändern** | `.claude/CLAUDE_SERVER.md` → [Section 13: Workflow](.claude/CLAUDE_SERVER.md#13-ki-agenten-workflow) | `El Servador/god_kaiser_server/src/` |
| **Frontend Code ändern** | `.claude/CLAUDE_FRONTEND.md` | `El Frontend/src/` |
| **Frontend + Server starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0 | - |
| **Frontend Bug debuggen** | `El Frontend/Docs/Bugs_Found.md` | Workflow + Fix dokumentiert |
| **MQTT verstehen** | `El Trabajante/docs/Mqtt_Protocoll.md` | ESP: `src/services/communication/mqtt_client.*`<br>Server: `.claude/CLAUDE_SERVER.md` → [Section 4](.claude/CLAUDE_SERVER.md#4-mqtt-topic-referenz-server-perspektive) |
| **ESP32 API verstehen** | `El Trabajante/docs/API_REFERENCE.md` | `src/services/[modul]/` |
| **Server API verstehen** | `.claude/CLAUDE_SERVER.md` → [Section 3.2](.claude/CLAUDE_SERVER.md#32-aufgabe-rest-api-endpoint-hinzufügen) | `El Servador/god_kaiser_server/src/api/v1/` |
| **Tests schreiben** | `.claude/CLAUDE_SERVER.md` → [Section 12](.claude/CLAUDE_SERVER.md#12-modul-dokumentation-navigation) | `El Servador/god_kaiser_server/tests/` |
| **Error-Code finden** | [Section 5](#5-error-codes-verifiziert) | `src/models/error_codes.h` |
| **ESP32 Build ausführen** | [Section 1](#1-build--commands) | `platformio.ini` |
| **Server starten** | `.claude/CLAUDE_SERVER.md` → [Section 7.1](.claude/CLAUDE_SERVER.md#71-server-starten-development) | `El Servador/god_kaiser_server/` |
| **System-Flow verstehen** | `El Trabajante/docs/system-flows/` | `src/core/` |

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
│   └── system-flows/              # 8 Ablauf-Diagramme
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

**📖 Server-Aufgaben?** → Siehe `.claude/CLAUDE_SERVER.md`:
- Sensor-Library hinzufügen → [Section 3.1](.claude/CLAUDE_SERVER.md#31-aufgabe-neuen-sensor-typ-hinzufügen)
- API-Endpoint hinzufügen → [Section 3.2](.claude/CLAUDE_SERVER.md#32-aufgabe-rest-api-endpoint-hinzufügen)
- MQTT-Handler implementieren → [Section 3.3](.claude/CLAUDE_SERVER.md#33-aufgabe-mqtt-handler-implementieren)
- Database-Model hinzufügen → [Section 3.4](.claude/CLAUDE_SERVER.md#34-aufgabe-database-model-hinzufügen)
- Automation-Rule implementieren → [Section 3.5](.claude/CLAUDE_SERVER.md#35-aufgabe-cross-esp-automation-rule-implementieren)

---

## 11.1 Server-Integration: Verhaltensregeln für ESP32-Code

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

**Vollständige Server-Dokumentation:** `.claude/CLAUDE_SERVER.md`

---

## 12. Aktueller Entwicklungsstand

| Phase | Status | Module |
|-------|--------|--------|
| Phase 0-7 | ✅ COMPLETE | GPIO, Logger, Config, WiFi, MQTT, I2C, OneWire, Sensor, Actuator, Error |
| Phase 8 | ⏳ NEXT | Integration & Final Testing |

**Code-Qualität:** 5.0/5 (Production-Ready)
**Implementierte Zeilen:** ~13.300

---

**Letzte Aktualisierung:** 2025-12-08
**Version:** 4.4 (Industrial Production Implementation)

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
