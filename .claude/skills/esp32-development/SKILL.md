---
name: esp32-development
description: |
  ESP32 El Trabajante Firmware-Entwicklung für AutomationOne IoT-Framework.
  Verwenden bei: C++, PlatformIO, Sensor hinzufügen, Actuator erstellen,
  Driver implementieren, Service erweitern, NVS-Key hinzufügen, MQTT erweitern,
  Error-Code definieren, GPIO-Logik, Config-Struktur, Pattern finden,
  Manager erweitern, Safety-Controller, HealthMonitor, ErrorTracker,
  I2C-Protokoll, OneWire-Bus, PWM-Controller, Wokwi-Simulation.
  NICHT verwenden für: Server-seitige Logic, Python-Code, Log-Analyse.
  Abgrenzung: esp32-debug für Log-Analyse, server-dev für Server-Code.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
argument-hint: "[Beschreibe was implementiert werden soll]"
---

# ESP32 Development Skill

> **Architektur:** Server-Centric. ESP32 = dumme Agenten. ALLE Logik auf Server.
> **Codebase:** `El Trabajante/` (Firmware unter `src/`, Einstieg `src/main.cpp`).

---

## 0. Stack-Anker (Ist — nur `El Trabajante/platformio.ini`)

| Aspekt | Ist im Repo |
|--------|-------------|
| **Platform / Framework** | `platform = espressif32`, `framework = arduino` (alle ESP-Umgebungen) |
| **Boards** | `esp32dev` (`env:esp32_dev`), `seeed_xiao_esp32c3` (`env:seeed_xiao_esp32c3`); Wokwi erbt von `esp32_dev` |
| **MQTT-Backend** | Standard: ESP-IDF `esp_mqtt_client` über SDK-Header `<mqtt_client.h>` in `services/communication/mqtt_client.h`. **`MQTT_USE_PUBSUBCLIENT=1`:** `seeed_xiao_esp32c3`, `wokwi_simulation` / `wokwi_esp01|02|03` (PubSubClient in `lib_deps`) |
| **Zentrale `lib_deps` (esp32_dev)** | u. a. `ArduinoJson`, `NTPClient`, `OneWire`, `DallasTemperature`, `WebServer`, `DNSServer`, Adafruit BME280, `Unity`; **kein** PubSubClient |
| **Native Tests** | `env:native` + Unity; aktive Tests u. a. unter `test/test_infra/`, `test/test_managers/` (siehe `test_ignore` in `platformio.ini`) |
| **Feature-Makros** | u. a. `ESP32_DEV_MODE` / `XIAO_ESP32C3_MODE`, `MAX_SENSORS`, `MAX_ACTUATORS`, `MQTT_MAX_PACKET_SIZE`, `KAISER_FIRMWARE_VERSION_STRING` |

**Header-Konflikt vermeiden:** In `mqtt_client.h` dokumentiert: SDK `<mqtt_client.h>` vs. lokaler Dateiname — Winkelklammern für ESP-IDF-API, nicht mit lokalem Header verwechseln.

---

## 0.1 Kontrakte & Spiegelstellen (Ende-zu-Ende im Monorepo)

Änderungen an Topics, Payload-Feldern, QoS oder Config sind **nicht** „nur eine `.cpp`-Datei“:

| Thema | Wo definieren / prüfen |
|-------|-------------------------|
| Topic-Strings, Puffer | `El Trabajante/src/utils/topic_builder.h`, `topic_builder.cpp` (u. a. `topic_buffer_[256]`, `validateTopicBuffer`) |
| Sensor-Array / `g_sensor_mutex` | `El Trabajante/src/tasks/rtos_globals.h`; Halter: `configureSensor`, `performAllMeasurements`, Messblock in `triggerManualMeasurement` (`sensor_manager.cpp` — serialisiert manuell vs. autonom) |
| MQTT-Soll (Tabellen, Payloads) | `.claude/reference/api/MQTT_TOPICS.md`; ergänzend eingecheckt: `El Trabajante/docs/Mqtt_Protocoll.md` (Inventory zu verwaisten Topics in `topic_builder.h`) |
| Subscribe-/Publish-QoS in der Firmware | `El Trabajante/src/main.cpp` (z. B. `mqttClient.subscribe(..., qos)`), `mqtt_client.cpp` — kann von der Markdown-Tabelle in `MQTT_TOPICS.md` abweichen; **immer Code prüfen** |
| Sensor-/Aktor-Rohdaten | `raw_mode: true` (Skill + `.cursor/rules/firmware.mdc`); Verarbeitung auf dem Server |
| Error-Codes | `El Trabajante/src/models/error_codes.h`, `.claude/reference/errors/ERROR_CODES.md` |
| Pins / ADC2 vs. WiFi | `El Trabajante/src/config/hardware/esp32_dev.h`, `xiao_esp32c3.h` (u. a. `RESERVED_GPIO_PINS`, `ADC2_GPIO_PINS`, Kommentar ADC2+WiFi) |
| Publish-Queue Größe / Pacing (AUT-481 P3) | `El Trabajante/src/tasks/publish_queue_constants.h` (SIZE=10, SHED=5), `publish_queue_policy.h` (adaptive Drain, status-defer), `mqtt_client.cpp` (`processPublishQueue`) |

**Hinweis QoS:** `.cursor/rules/firmware.mdc` nennt für Aktor-Befehle QoS 2; `MQTT_TOPICS.md` listet Server→ESP teils als QoS 2; die Firmware subscribed in `main.cpp` u. a. mit **QoS 1**. Keine Annahme treffen — drei Stellen oder gezielter `Grep` nach `subscribe(` / `publish(`.

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Sensor hinzufügen** | [Sensor-Workflow](#sensor-workflow) | `services/sensor/sensor_manager.h` |
| **Actuator hinzufügen** | [Actuator-Workflow](#actuator-workflow) | `services/actuator/actuator_manager.h` |
| **MQTT Topic erweitern** | [MQTT-Patterns](#mqtt-patterns) | `utils/topic_builder.h` |
| **Error-Code definieren** | [Error-Handling](#error-handling) | `models/error_codes.h` |
| **Config/NVS Key** | MODULE_REGISTRY.md | `services/config/config_manager.h` |
| **GPIO reservieren** | MODULE_REGISTRY.md | `drivers/gpio_manager.h` |
| **Safety implementieren** | [Safety-Patterns](#safety-patterns) | `services/actuator/safety_controller.h` |
| **Driver erstellen** | [Actuator-Workflow](#actuator-workflow) | `services/actuator/actuator_drivers/` |
| **Build verifizieren** | [Build Commands](#build-commands) | `platformio.ini` |
| **Startup verstehen** | [Init-Reihenfolge](#initialisierungs-reihenfolge-maincpp) | `src/main.cpp` |
| **Watchdog-NVS / 24h** | MODULE_REGISTRY.md §6.1 | `utils/watchdog_storage.h` |
| **Firmware-Version (Build)** | `platformio.ini` + `config/firmware_version.h` | `KAISER_FIRMWARE_VERSION_STRING` |
| **Wokwi ts=0 / NTP** | [Wokwi-Limitierungen](#wokwi-limitierungen-ts0) | Server-Fallback (sensor_handler, heartbeat_handler) |
| **MQTT-Backend (M2)** | [MQTT-Patterns](#mqtt-patterns) | Standard = ESP-IDF; `MQTT_USE_PUBSUBCLIENT=1` nur seeed/wokwi — `platformio.ini`, `sdkconfig.defaults`, `mqtt_client.h` |
| **Comm-Task / Publish-Queue (M3)** | [Init-Reihenfolge](#initialisierungs-reihenfolge-maincpp) | `tasks/communication_task.*`, `tasks/publish_queue.*`, `MQTTClient::processPublishQueue()` |

---

## Ordnerstruktur
```
El Trabajante/
├── src/
│   ├── main.cpp              ← Hauptlogik (~3000 Zeilen)
│   ├── drivers/              ← GPIO, I2C, OneWire, PWM
│   ├── services/
│   │   ├── sensor/           ← SensorManager, PiEnhancedProcessor
│   │   ├── actuator/         ← ActuatorManager, SafetyController
│   │   ├── communication/    ← MQTTClient, WiFiManager
│   │   ├── config/           ← ConfigManager, StorageManager
│   │   ├── provisioning/     ← ProvisionManager
│   │   └── safety/           ← OfflineModeManager (SAFETY-P4)
│   ├── tasks/                ← FreeRTOS Tasks (SAFETY-RTOS M1+)
│   │   ├── safety_task.h/.cpp             ← Safety-Task Core 1, Priority 5
│   │   ├── communication_task.h/.cpp      ← Comm-Task Core 0 (M3): WiFi/MQTT/Timer/Publish-Drain
│   │   ├── publish_queue.h/.cpp           ← Core 1 → Core 0 Publish-Queue (M3, ESP-IDF-Publish-Pfad)
│   │   ├── actuator_command_queue.h/.cpp  ← Aktor-Commands Core 0 → 1
│   │   └── sensor_command_queue.h/.cpp    ← Sensor-Commands Core 0 → 1
│   ├── models/               ← Types, Error-Codes
│   ├── error_handling/       ← ErrorTracker, CircuitBreaker, HealthMonitor
│   ├── utils/                ← Logger, TopicBuilder, watchdog_storage
│   └── config/               ← Feature Flags, firmware_version.h, Hardware-Configs
│       └── hardware/         ← esp32_dev.h, xiao_esp32c3.h
└── platformio.ini
```

| Aufgabe | Datei |
|---------|-------|
| Sensor hinzufügen | `services/sensor/sensor_manager.h` |
| Actuator hinzufügen | `services/actuator/actuator_manager.h` |
| MQTT Topic | `utils/topic_builder.h` |
| Config/NVS | `services/config/config_manager.h` |
| Safety | `services/actuator/safety_controller.h` |
| GPIO reservieren | `drivers/gpio_manager.h` |
| Error tracken | `error_handling/error_tracker.h` |
| Health/Diagnostics | `error_handling/health_monitor.h` |
| Board-Config | `config/hardware/esp32_dev.h` |

**API-Details:** Siehe `MODULE_REGISTRY.md`

---

## Build Commands

**Wichtig:** PlatformIO-Befehle müssen aus `El Trabajante/` ausgeführt werden (dort liegt `platformio.ini`).

- **Umgebungsnamen exakt:** In `platformio.ini` heißen die Envs u. a. `esp32_dev` (ESP32 DevKit / WROOM-32), `seeed_xiao_esp32c3` (Seeed XIAO ESP32-C3), `wokwi_simulation`, `wokwi_esp01` … `wokwi_esp03`, `native`. Der Kurzname `seeed` als `-e`-Ziel existiert **nicht** — siehe `.claude/CLAUDE.md` Verifikationstabelle.
- **Git Bash (Agent):** `pio` oft nicht im PATH → typisch `~/.platformio/penv/Scripts/pio.exe` (Windows) bzw. `pio` nach PATH-Setup.
- **PowerShell:** `&&` in PS 5.x unzuverlässig → Befehle mit `;` trennen oder Zeilenweise.

### Git Bash / Shell (Build, Flash, kurzer Monitor)

```bash
cd "El Trabajante"
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev -t upload
timeout 30 ~/.platformio/penv/Scripts/pio.exe device monitor -e esp32_dev
~/.platformio/penv/Scripts/pio.exe run -e seeed_xiao_esp32c3
~/.platformio/penv/Scripts/pio.exe run -e wokwi_esp01
~/.platformio/penv/Scripts/pio.exe run -e wokwi_esp02
~/.platformio/penv/Scripts/pio.exe run -e wokwi_esp03
~/.platformio/penv/Scripts/pio.exe test -e native -vvv
```

### PowerShell (Beispiel — Pfade an eigene Installation anpassen)

```powershell
cd "El Trabajante"
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e esp32_dev
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e esp32_dev -t upload
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor -e esp32_dev
```

### Wokwi-Limitierungen (ts=0)

| Limitierung | Verhalten | Server-Fallback |
|-------------|-----------|-----------------|
| **Kein NTP** | Wokwi sendet `ts: 0` in Heartbeat + Sensordaten | El Servador ersetzt durch eigenen Timestamp |
| **NVS geskippt** | Config nur in-memory | Provisioning-Tests mit Mock-Config |
| **PWM nur Serial** | Keine echte Hardware-Ausgabe | Logging statt GPIO |

**Wichtig:** Firmware NICHT anpassen fuer ts=0 — der Server behandelt das in `sensor_handler.py` und `heartbeat_handler.py`. Echte ESPs mit NTP senden `ts > 0` und nutzen den normalen Pfad.

---

## Initialisierungs-Reihenfolge (main.cpp)

> Konzeptuelle Reihenfolge. Exakte Zeilen siehe main.cpp STEP-Kommentare.

```
1. GPIOManager.initializeAllPinsToSafeMode()  ← MUST BE FIRST!
2. Logger.begin()
3. StorageManager.begin() + watchdogStorageInitEarly() (Namespace `wdt_diag`)
3.1 Logger: Restore log_level from NVS (system_config namespace)
4. ConfigManager.begin() + loadAllConfigs()
5. [Watchdog Configuration]
6. [Provisioning Check - wenn Config fehlt; MQTT-Fehler → startAPModeForReconfig(), Config bleibt]
7. ErrorTracker.begin()
8. TopicBuilder::setEspId/setKaiserId
9. WiFiManager.begin() + connect()
10. MQTTClient.begin() + connect()
10.5 HealthMonitor.begin()  ← Nach MQTT, vor Hardware-Init
11. I2CBusManager.begin() + OneWireBusManager.begin() + PWMController.begin()
12. SensorManager.begin()
13. SafetyController.begin()  ← VOR ActuatorManager!
14. ActuatorManager.begin() + offlineModeManager.loadOfflineRulesFromNVS()
--- SAFETY-RTOS M1+M3 ---
15. initActuatorCommandQueue() + initSensorCommandQueue() + initPublishQueue()  ← VOR createSafetyTask()!
16. createSafetyTask()  ← Core 1, Priority 5, 8KB Stack
17. esp_task_wdt_delete(loopTask)  ← Safety-Task übernimmt WDT
18. createCommunicationTask()  ← Core 0, Priority 3 (WiFi/MQTT/Debounce/Heartbeat-Trigger/Publish-Drain)
```

**KRITISCH:** GPIOManager MUSS als erstes initialisiert werden!
**KRITISCH (M1):** Queues VOR Safety-Task erstellen — Task liest sofort daraus!

**Nach vollem setup():** `loop()` ist minimal (`vTaskDelay(1s)`). Wenn `setup()` vor Task-Erstellung endet (z. B. frühes Provisioning), läuft eine Legacy-Schleife in `main.cpp` ohne Comm-/Safety-Tasks.

---

## Sensor-Workflow

### Architektur (Server-Centric)
```
ESP32: analogRead(gpio) → RAW (0-4095)
       ↓ MQTT
Server: Python Library → Processed Value
       ↓ MQTT (optional)
ESP32: Display/Log
```

**ESP32 macht KEINE lokale Sensor-Verarbeitung!** `raw_mode = true` ist IMMER gesetzt.

### Neuen Sensor hinzufügen

1. **Server:** Library in `El Servador/.../sensor_libraries/active/` erstellen
2. **ESP32:** Nur wenn neuer Bus-Typ (I2C/OneWire):
   - I2C: Protocol in `drivers/i2c_sensor_protocol.cpp` registrieren
   - OneWire: ROM-Code in Config angeben
3. **Config via MQTT:** Server sendet SensorConfig

### SensorConfig Struktur
```cpp
SensorConfig config;
config.gpio = 4;
config.sensor_type = "ds18b20";     // Server-definiert
config.sensor_name = "Temp1";
config.raw_mode = true;             // IMMER true
config.measurement_interval_ms = 30000;
config.onewire_address = "28FF..."; // Für OneWire (64-bit ROM)
config.i2c_address = 0x44;          // Für I2C (7-bit Adresse)
```

**Interface-spezifische Felder:**

| Interface | Config-Feld | MQTT-Payload | Beschreibung |
|-----------|-------------|--------------|--------------|
| OneWire | `onewire_address` | `onewire_address` | 64-bit ROM-Code (16 Hex-Zeichen) |
| I2C | `i2c_address` | `i2c_address` | 7-bit Adresse (0-127) |

### Sensor-Registry Mapping

| ESP32 Type | Server Type | Bus | I2C Addr |
|------------|-------------|-----|----------|
| `ds18b20` | `ds18b20` | OneWire | - |
| `temperature_sht31` | `sht31_temp` | I2C | 0x44 |
| `humidity_sht31` | `sht31_humidity` | I2C | 0x44 |
| `temperature_bmp280` | `bmp280_temp` | I2C | 0x76 |
| `pressure_bmp280` | `bmp280_pressure` | I2C | 0x76 |
| `temperature_bme280` | `bme280_temp` | I2C | 0x76 |
| `humidity_bme280` | `bme280_humidity` | I2C | 0x76 |
| `pressure_bme280` | `bme280_pressure` | I2C | 0x76 |
| `ph_sensor` | `ph` | ADC | - |
| `ec_sensor` | `ec` | ADC | - |
| `moisture` | `moisture` | ADC | - |

**ADC-Sensoren und Offline-Rules:** `ph`, `ec`, `moisture` liefern im ValueCache nur ADC-Rohwerte (0–4095), da `applyLocalConversion()` für diese Typen keine lokale Umrechnung hat. Offline-Rule-Thresholds sind in physikalischen Einheiten — ein Vergleich wäre sinnlos. `evaluateOfflineRules()` filtert diese Typen via `requiresCalibration()` Guard heraus; betroffene Aktoren bleiben sicher AUS.

---

## Actuator-Workflow

### IActuatorDriver Interface

**Strings:** Das Interface nutzt `String` (Arduino) — siehe `services/actuator/actuator_drivers/iactuator_driver.h`. **Neuer Code:** wo möglich Heap-schonend arbeiten; `.cursor/rules/firmware.mdc` fordert `const char*` / `std::string` statt zusätzlicher `String`-Last — bei Erweiterungen bestehende Signaturen nicht ignorieren, aber keine neuen großen `String`-Ketten einführen.

```cpp
class IActuatorDriver {
    // Lifecycle
    virtual bool begin(const ActuatorConfig& config) = 0;
    virtual void end() = 0;
    virtual bool isInitialized() const = 0;

    // Control
    virtual bool setValue(float normalized_value) = 0;  // 0.0-1.0
    virtual bool setBinary(bool state) = 0;
    virtual void loop() = 0;

    // Safety
    virtual bool emergencyStop(const String& reason) = 0;
    virtual bool clearEmergency() = 0;

    // Status
    virtual ActuatorStatus getStatus() const = 0;
    virtual const ActuatorConfig& getConfig() const = 0;
    virtual String getType() const = 0;
};
```

### Verfügbare Driver

| Type | Driver | Features |
|------|--------|----------|
| `pump`, `relay` | PumpActuator | Runtime-Protection |
| `pwm` | PWMActuator | 0.0-1.0 Normalisierung |
| `valve` | ValveActuator | Binary ON/OFF |

### Neuen Actuator-Typ hinzufügen

1. Driver erstellen in `services/actuator/actuator_drivers/`
2. Interface `IActuatorDriver` implementieren
3. Factory erweitern in `ActuatorManager::createDriver()`
4. Type-Token in `models/actuator_types.h` definieren

### Factory-Pattern

Implementierung: `ActuatorManager::createDriver()` in `services/actuator/actuator_manager.cpp` — Typvergleiche über **`ActuatorTypeTokens`** in `models/actuator_types.h` (nicht ad-hoc String-Literale duplizieren).

```cpp
// Vereinfacht — echte Zuordnung siehe actuator_manager.cpp
if (actuator_type == ActuatorTypeTokens::PUMP) { /* PumpActuator */ }
```

### Command Duration (Auto-Off)

ON mit `duration` > 0 im MQTT-Payload → `command_duration_end_ms` gesetzt. `processActuatorLoops()` schaltet nach N Sekunden automatisch aus. duration=0 = kein Auto-Off (nur `runtime_protection.max_runtime_ms` greift). Ref: `MQTT_TOPICS.md` §2.1, `03-actuator-command-flow.md` STEP 4b.

---

## MQTT-Patterns

**Backends (SAFETY-RTOS M2):** `esp32_dev` nutzt standardmässig ESP-IDF `esp_mqtt_client` (eigener Task, Outbox). **`MQTT_USE_PUBSUBCLIENT=1`** (Seeed XIAO, Wokwi): PubSubClient, manueller Offline-Buffer. SDK-Header ESP-IDF: `#include <mqtt_client.h>` (Arduino-ESP32 SDK), nicht mit lokalem `services/communication/mqtt_client.h` verwechseln.

**M3 (ESP-IDF):** Publishes vom Safety-Task (Core 1) gehen über `queuePublish()` → `MQTTClient::processPublishQueue()` im Communication-Task (50 ms). Queue: **10** Slots, Shed ab fill≥**5** (`publish_queue_constants.h`). Drain: default **1**/Tick, Boost **2**/Tick bei fill≥3 + gesundem Transport (`computeAdaptivePublishDrainBudget` in `publish_queue_policy.h`). `actuator/status` wird bei fill≥WATERMARK−1 deferred. `processPublishQueue()` existiert nur ohne `MQTT_USE_PUBSUBCLIENT`.

### Topic-Builder
```cpp
// Pattern: kaiser/{kaiser_id}/esp/{esp_id}/...
TopicBuilder::buildSensorDataTopic(gpio);      // .../sensor/{gpio}/data
TopicBuilder::buildActuatorCommandTopic(gpio); // .../actuator/{gpio}/command
TopicBuilder::buildSystemHeartbeatTopic();     // .../system/heartbeat
// AUT-69: session/announce wird direkt in MQTTClient::publishSessionAnnounce()
// publisht (kaiser/{k}/esp/{id}/session/announce), nicht über TopicBuilder.
TopicBuilder::buildIntentOutcomeTopic();       // .../system/intent_outcome
TopicBuilder::buildIntentOutcomeLifecycleTopic(); // .../system/intent_outcome/lifecycle (CONFIG_PENDING)
TopicBuilder::buildZoneAssignTopic();          // .../zone/assign
TopicBuilder::buildZoneAckTopic();             // .../zone/ack
TopicBuilder::buildSubzoneAssignTopic();       // .../subzone/assign
TopicBuilder::buildSubzoneRemoveTopic();       // .../subzone/remove
TopicBuilder::buildSubzoneSafeTopic();         // .../subzone/safe (ESP subscribt + Handler)
// PKG-01a (Welle 2, INC-2026-04-20-offline-mode-observability-hardening):
TopicBuilder::buildQueuePressureTopic();       // .../system/queue_pressure (ENTER/RECOVERED)
```

### Standard Publish-Pattern
```cpp
void publishSensorReading(const SensorReading& reading) {
    if (!mqttClient.isConnected()) return;
    
    const char* topic = TopicBuilder::buildSensorDataTopic(reading.gpio);
    
    DynamicJsonDocument doc(512);
    doc["gpio"] = reading.gpio;
    doc["sensor_type"] = reading.sensor_type;
    doc["raw_value"] = reading.raw_value;
    doc["timestamp"] = reading.timestamp;
    doc["raw_mode"] = true;
    
    String payload;
    serializeJson(doc, payload);
    mqttClient.publish(topic, payload, 1);  // QoS 1
}
```

### QoS-Verwendung (Firmware-Defaults)

| Message | QoS | Hinweis |
|---------|-----|---------|
| Sensor Data (Publish) | 1 | |
| Actuator Commands (Subscribe) | 1 | AUT-331: war 2 |
| Sensor Commands (Subscribe) | 1 | AUT-331: war 2 |
| Session Announce | 1 | |
| Heartbeat | 0 | |
| Emergency Stop | 1 | |
| intent_outcome terminal | 1 | NVS-Replay bei Fail |
| intent_outcome lifecycle chain stages | 0 | AUT-331: war 1, reine Telemetrie |
| actuator status | 0 | AUT-326 |

**Abgleich:** Server- und Doku-QoS (`MQTT_TOPICS.md`) können von `subscribe`/`publish`-Aufrufen in `main.cpp` / `mqtt_client.cpp` abweichen — vor Änderungen beide lesen.

---

## Safety-Patterns

### Emergency-Stop Sequenz
```
1. SafetyController.emergencyStopAll(reason)
2. Für jeden Actuator: driver->emergencyStop()
3. GPIO → INPUT_PULLUP (safe mode)
4. MQTT Alert published
5. State → EMERGENCY_ACTIVE
```

**Garantierte Zeit:** <50ms bis alle Aktoren OFF

### GPIO Safe-Mode
```cpp
// MUSS als ERSTES in setup() aufgerufen werden!
gpioManager.initializeAllPinsToSafeMode();
```

### Pin-Reservation
```cpp
// VOR jeder GPIO-Nutzung
if (!gpioManager.isPinAvailable(gpio)) {
    return ERROR_GPIO_CONFLICT;
}
gpioManager.requestPin(gpio, "sensor", "DS18B20");
```

### SAFETY-P1 / P4 bei Netzverlust (Firmware)

- `offlineModeManager.onDisconnect()` läuft bei relevanten Disconnect- und P1-Pfaden immer (30s Grace, danach ggf. `OFFLINE_ACTIVE`).
- **Keine Offline-Rules im NVS** (`getOfflineRuleCount() == 0`): MQTT-Disconnect-Handler und Server-ACK-Timeout setzen Aktoren **sofort** auf `default_state`.
- **Mit Offline-Rules:** dieselben Pfade schalten **nicht** sofort auf safe; Zustand bleibt bis zur P4-Auswertung (`evaluateOfflineRules()` im Safety-Task).
- Not-Aus (`NOTIFY_EMERGENCY_STOP` / `emergencyStopAll`) bleibt unverzögert.

### Runtime-Protection (Pumps)

- Max 1h kontinuierliche Laufzeit
- Max 60 Aktivierungen/Stunde
- 30s Cooldown nach Cutoff

---

## Error-Handling

### Error-Code Ranges

| Range | Category |
|-------|----------|
| 1000-1999 | HARDWARE (GPIO, I2C, OneWire) |
| 2000-2999 | SERVICE (NVS, Config) |
| 3000-3999 | COMMUNICATION (WiFi, MQTT) |
| 4000-4999 | APPLICATION (State, Watchdog) |

### Standard Error-Pattern
```cpp
bool SomeManager::doOperation() {
    if (!initialized_) {
        errorTracker.trackError(ERROR_INIT_FAILED, "Not initialized");
        return false;
    }
    // ... operation
    return true;
}
```

### Circuit-Breaker

**Service-Level** (MQTT, WiFi): `CircuitBreaker` Klasse in `error_handling/circuit_breaker.h`
```cpp
CircuitBreaker cb("MQTT", 5, 30000, 10000);

if (!cb.allowRequest()) {
    LOG_WARNING("Circuit breaker OPEN");
    return false;
}

bool success = actualOperation();
success ? cb.recordSuccess() : cb.recordFailure();
```

**Sensor-Level** (per-sensor): Inline in `SensorConfig` via `SensorCBState`
- CLOSED → OPEN: 10 consecutive failures
- OPEN → HALF_OPEN: 5 min probe interval
- Config-Push from server → CLOSED (reset)

### Error Rate-Limiting

MQTT error publishes throttled to max 1 per error code per 60s window.
Implementation: `error_tracker.cpp` — `shouldPublishError()` with 32-slot modulo-hashed static table.
Local error tracking (`addToBuffer`, `logErrorToLogger`) is NOT throttled — only MQTT publish.

---

## Singleton-Pattern (Standard)
```cpp
class XManager {
public:
    static XManager& getInstance() {
        static XManager instance;
        return instance;
    }
    
    XManager(const XManager&) = delete;
    XManager& operator=(const XManager&) = delete;

private:
    XManager() = default;
};

// In .cpp
extern XManager& xManager;
XManager& xManager = XManager::getInstance();
```

---

## Referenz-Dokumentation

| Referenz | Pfad | Wann lesen? |
|----------|------|-------------|
| **MQTT Topics** | `.claude/reference/api/MQTT_TOPICS.md` | MQTT Topic hinzufügen/erweitern |
| **Error Codes** | `.claude/reference/errors/ERROR_CODES.md` | Fehlerbehandlung implementieren (1000-4999) |
| **Architecture** | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` | Manager erweitern, Dependencies verstehen |
| **Communication Flows** | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Datenfluss ESP32↔Server verstehen |
| **Module APIs** | `MODULE_REGISTRY.md` | Vollständige API-Details, Method-Signaturen |

> **Progressive Disclosure:** Referenzen NUR laden wenn die spezifische Aufgabe es erfordert.

---

## Coding-Agenten: typische Fehler und Soll-Verhalten

### Typische Fehler (vermeiden)

- Falsche PlatformIO-Umgebung oder nicht existierende `-e`-Namen (nur Namen aus `platformio.ini` verwenden).
- GPIO/ADC-I2C-Pins erfinden statt `config/hardware/esp32_dev.h` / `xiao_esp32c3.h` und `gpio_manager` zu lesen (ADC2 + WiFi auf klassischem ESP32, Strapping, `INPUT_ONLY_PINS`).
- Topics oder JSON-Felder ändern ohne `topic_builder`, `MQTT_TOPICS.md` und betroffene `subscribe`/`publish`-Stellen.
- `delay()` oder lange blockierende Schleifen in Pfaden, die MQTT/WiFi/Watchdog erwarten (siehe `.cursor/rules/firmware.mdc`).
- Große `DynamicJsonDocument`-Kapazitäten willkürlich erhöhen — Speicherbudget beachten (`MQTT_MAX_PACKET_SIZE` u. a. in `platformio.ini`).
- NVS/Config ohne bestehende Manager-Patterns (`ConfigManager`, `StorageManager`) — Kollisionen und Partial-Writes.
- `SafetyController`, Emergency-Pfade oder Watchdog-Logik „nebenbei“ umbauen ohne Auftrag.
- Umfang ausweiten: große Refactors oder zweites MQTT-Client-Design statt Erweiterung der Singleton-Pipeline.
- Tests auslassen: wenn native oder Wokwi-Szenarien für den geänderten Bereich üblich sind (`pio test -e native`, `env:wokwi_*`).

### Soll-Verhalten (immer)

- Zuerst `Glob`/`Grep` nach gleichartigem Sensor, Aktor oder MQTT-Handler im Repo.
- Minimal-invasive Änderungen; gleiche Fehlerbehandlung wie Nachbarcode (`ErrorTracker`, `LOG_*` mit TAG aus `logger.h`).
- Pins und Busse mit Hardware-Config und Manager abgleichen; Unsicherheit → Code/Doku lesen, nicht raten.
- MQTT/Config so erweitern, dass `MQTT_TOPICS.md` / `Mqtt_Protocoll.md` und Firmware konsistent bleiben oder bewusst dokumentiert werden.
- Build mit passendem `-e` ausführen; Compiler-Warnungen ernst nehmen, wenn CI sie als Fehler wertet.
- Safety- und Echtzeit-Pfade nur mit klarer Anforderung anfassen.

### Kurz-Workflow: Sensor oder Aktor erweitern

1. **Analoges Modul finden** (`sensor_manager`, `actuator_manager`, bestehender Driver unter `actuator_drivers/`).
2. **Registry/Typen** — `models/`, Factory in `actuator_manager.cpp` / Sensor-Registrierung wie bestehende Typen.
3. **MQTT** — nur `TopicBuilder`-API; Payload wie Nachbar-Sensor/-Aktor.
4. **Verifizieren** — `pio run -e esp32_dev` (und ggf. `pio test -e native` bei betroffenen Pure-Logic-Teilen).

---

## Regeln (Kern)

1. **Server-Centric:** Keine Business-Logik auf dem ESP32.
2. **GPIO:** Zuerst `initializeAllPinsToSafeMode()`, dann `gpioManager.requestPin()` / HAL über `drivers/hal/igpio_hal.h`.
3. **Error-Codes:** Bereich 1000–4999, Definition in `error_codes.h` + Referenz-Doku.
4. **Speicher:** RAII (`std::unique_ptr`), keine manuellen `new`/`delete`.
5. **Build:** Vor Abschluss passende `pio run`/`pio test`-Umgebung ausführen.

---

## Workflow

```
1. ANALYSE      → Quick Reference + Kontrakte-Abschnitt oben
2. API PRÜFEN   → MODULE_REGISTRY.md bei Detailfragen
3. PATTERN      → Bestehenden Code als Vorlage (Grep)
4. IMPLEMENT    → Singleton / Factory / TopicBuilder / Safety-Pfade respektieren
5. VERIFY       → pio run -e esp32_dev (oder Ziel-Board-Env)
```

---

*Kompakter Skill für ESP32-Entwicklung. Details in `MODULE_REGISTRY.md`.*