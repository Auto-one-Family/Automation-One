# P1.1 — ESP32 Abhängigkeitskarte (El Trabajante Firmware)

**Paket:** 01  
**Analyse-Datum:** 2026-04-04  
**Ergänzung zu:** paket-01-esp32-modul-inventar.md

---

## 1. Knotenliste (alle Module mit Abhängigkeitsprofil)

| Modul-ID | Name | Eingehende Abhängigkeiten (wer nutzt mich) | Ausgehende Abhängigkeiten (wen nutze ich) | Kopplungsgrad |
|----------|------|-------------------------------------------|------------------------------------------|--------------|
| FW-MOD-001 | main.cpp | — (Entry Point) | Fast alle Module | **GOTT-KNOTEN** |
| FW-MOD-005 | safety_task | main.cpp (createSafetyTask) | sensor_manager, actuator_manager, offline_mode_manager, config_update_queue, actuator_cmd_queue, sensor_cmd_queue, intent_contract, publish_queue | hoch |
| FW-MOD-006 | communication_task | main.cpp (createCommunicationTask) | mqtt_client, wifi_manager, provision_manager, publish_queue, actuator_manager | hoch |
| FW-MOD-007 | rtos_globals | safety_task, communication_task, i2c_bus, onewire_bus, actuator_manager, sensor_manager, storage_manager | freertos (extern) | **ZENTRAL-KNOTEN** |
| FW-MOD-008 | publish_queue | safety_task (queuePublish), main.cpp | mqtt_client (processPublishQueue) | mittel |
| FW-MOD-009 | config_update_queue | main.cpp (queueConfigUpdateWithMetadata) | safety_task (processConfigUpdateQueue) | mittel |
| FW-MOD-010 | actuator_cmd_queue | main.cpp (routeIncomingMessage) | safety_task (processActuatorCommandQueue) | mittel |
| FW-MOD-011 | sensor_cmd_queue | main.cpp (routeIncomingMessage) | safety_task | mittel |
| FW-MOD-012 | intent_contract | main.cpp, safety_task, config_update_queue, publish_queue | mqtt_client (publishIntentOutcome), topic_builder | hoch |
| FW-MOD-013 | command_admission | main.cpp (routeIncomingMessage) | system_types (SystemState) | mittel |
| FW-MOD-014 | sensor_manager | safety_task, main.cpp | i2c_bus, onewire_bus, gpio_manager, mqtt_client, sensor_factory, sensor_registry, sensor_types, topic_builder, logger, error_tracker, rtos_globals (g_sensor_mutex, g_i2c_mutex, g_onewire_mutex) | hoch |
| FW-MOD-015 | sensor_factory | sensor_manager | sensor_drivers (DS18B20, SHT31, pH, generic) | mittel |
| FW-MOD-016 | pi_enhanced_processor | sensor_manager | sensor_types | niedrig |
| FW-MOD-017 | ds18b20_driver | sensor_factory, sensor_manager | onewire_bus, onewire_utils, sensor_types | mittel |
| FW-MOD-018 | sht31_driver | sensor_factory, sensor_manager | i2c_bus, sensor_types | mittel |
| FW-MOD-019 | ph_sensor | sensor_factory, sensor_manager | gpio_manager, sensor_types | niedrig |
| FW-MOD-020 | i2c_sensor_generic | sensor_factory, sensor_manager | i2c_bus, sensor_types | niedrig |
| FW-MOD-021 | sensor_types | sensor_manager, sensor_factory, all sensor_drivers | — | hoch (Daten-Typ) |
| FW-MOD-022 | sensor_registry | sensor_manager, sensor_factory | sensor_types | mittel |
| FW-MOD-023 | actuator_manager | safety_task, main.cpp, communication_task | gpio_manager, actuator_drivers, mqtt_client, topic_builder, error_tracker, logger, rtos_globals (g_actuator_mutex), config_response | hoch |
| FW-MOD-024 | safety_controller | main.cpp, safety_task | actuator_manager, logger, error_tracker | hoch |
| FW-MOD-025 | pump_actuator | actuator_manager (via factory) | gpio_manager, actuator_types | mittel |
| FW-MOD-026 | valve_actuator | actuator_manager (via factory) | gpio_manager, actuator_types | mittel |
| FW-MOD-027 | pwm_actuator | actuator_manager (via factory) | gpio_manager, pwm_controller, actuator_types | mittel |
| FW-MOD-028 | actuator_types | actuator_manager, safety_controller, all actuator_drivers | — | hoch (Daten-Typ) |
| FW-MOD-029 | mqtt_client | communication_task, safety_task (via publish_queue), main.cpp, error_tracker, health_monitor | wifi_manager (indirekt), topic_builder, circuit_breaker, logger, error_tracker, system_types | **ZENTRAL-KNOTEN** |
| FW-MOD-030 | wifi_manager | communication_task, main.cpp | circuit_breaker, logger, error_tracker, system_types | hoch |
| FW-MOD-031 | webserver | provision_manager | — | niedrig |
| FW-MOD-032 | network_discovery | provision_manager | — | niedrig |
| FW-MOD-033 | http_client | main.cpp (selten genutzt) | — | niedrig |
| FW-MOD-034 | topic_builder | mqtt_client, sensor_manager, actuator_manager, main.cpp, health_monitor, error_tracker, intent_contract | config_manager (getKaiserId, getESPId) | **ZENTRAL-KNOTEN** |
| FW-MOD-035 | config_manager | main.cpp, sensor_manager, actuator_manager, provision_manager, runtime_readiness_policy, health_monitor, topic_builder | storage_manager, system_types, sensor_types, actuator_types, logger | hoch |
| FW-MOD-036 | storage_manager | config_manager, offline_mode_manager, watchdog_storage, main.cpp | Preferences (ESP32 SDK), rtos_globals (nvs_mutex via CONFIG_ENABLE_THREAD_SAFETY) | **ZENTRAL-KNOTEN** |
| FW-MOD-037 | runtime_readiness_policy | main.cpp (evaluatePendingExit) | — | niedrig |
| FW-MOD-038 | config_response | main.cpp, actuator_manager | mqtt_client, topic_builder | niedrig |
| FW-MOD-039 | provision_manager | main.cpp, communication_task | config_manager, webserver, network_discovery, logger, error_tracker | mittel |
| FW-MOD-040 | portal_authority | main.cpp | — | niedrig |
| FW-MOD-041 | offline_mode_manager | safety_task, main.cpp | actuator_manager, sensor_manager (Value-Cache), storage_manager, offline_rule, logger, error_tracker | hoch |
| FW-MOD-042 | emergency_broadcast_contract | main.cpp (routeIncomingMessage) | — | niedrig |
| FW-MOD-043 | watchdog_storage | main.cpp (setup + loop) | storage_manager, watchdog_types | mittel |
| FW-MOD-044 | error_tracker | Fast alle Module | mqtt_client (callback), topic_builder, logger | **ZENTRAL-KNOTEN** |
| FW-MOD-045 | health_monitor | communication_task, main.cpp | mqtt_client, config_manager, topic_builder, circuit_breaker, watchdog_types, logger | mittel |
| FW-MOD-046 | circuit_breaker | mqtt_client, wifi_manager, health_monitor | — | mittel |
| FW-MOD-047 | gpio_manager | sensor_manager, actuator_manager, all drivers, main.cpp (initializeAllPinsToSafeMode) | HAL (ESP32GPIOHal) | **ZENTRAL-KNOTEN** |
| FW-MOD-048 | i2c_bus | sensor_manager, all I2C drivers | gpio_manager, rtos_globals (g_i2c_mutex), error_tracker, i2c_sensor_protocol | hoch |
| FW-MOD-049 | onewire_bus | sensor_manager, ds18b20_driver | gpio_manager, rtos_globals (g_onewire_mutex), DallasTemperature | hoch |
| FW-MOD-050 | pwm_controller | pwm_actuator, main.cpp | gpio_manager | niedrig |
| FW-MOD-051 | logger | Fast alle Module | Serial (ESP32 SDK) | **ZENTRAL-KNOTEN** |
| FW-MOD-052 | time_manager | mqtt_client, sensor_manager, main.cpp, watchdog_storage | NTP (ESP32 SNTP), wifi_manager (Events) | mittel |
| FW-MOD-053 | json_helpers | main.cpp, sensor_manager, actuator_manager | ArduinoJson | niedrig |
| FW-MOD-054 | string_helpers | main.cpp, sensor_manager | — | niedrig |
| FW-MOD-055 | onewire_utils | ds18b20_driver, main.cpp | — | niedrig |
| FW-MOD-056 | system_types | Fast alle Module | — | **ZENTRAL-KNOTEN** (Daten-Typ) |
| FW-MOD-057 | error_codes | error_tracker, main.cpp, sensor_manager, actuator_manager | — | mittel |
| FW-MOD-058 | offline_rule | offline_mode_manager | — | mittel |
| FW-MOD-059 | watchdog_types | health_monitor, watchdog_storage, main.cpp | — | mittel |

---

## 2. Abhängigkeitsgraph — Kritische Pfade

### Sensor-Mess-Kette (FW-FLOW-001)

```
[Safety-Task/Core 1]
      │
      ▼
sensor_manager.performAllMeasurements()   [FW-MOD-014]
      │
      ├─── g_sensor_mutex (take)           [FW-MOD-007]
      │
      ├─── [I2C-Sensoren]
      │     ├── g_i2c_mutex (take)         [FW-MOD-007]
      │     ├── i2c_bus.readSensorRaw()    [FW-MOD-048]
      │     └── temp_sensor_sht31         [FW-MOD-018]
      │
      ├─── [OneWire-Sensoren]
      │     ├── g_onewire_mutex (take)     [FW-MOD-007]
      │     └── onewire_bus + ds18b20     [FW-MOD-049, MOD-017]
      │
      ├─── [Analog/ADC-Sensoren]
      │     └── ph_sensor (GPIO-ADC)       [FW-MOD-019]
      │
      ├── pi_enhanced_processor            [FW-MOD-016]
      ├── time_manager.getUnixTimestamp()  [FW-MOD-052]
      ├── topic_builder.buildSensorDataTopic() [FW-MOD-034]
      │
      └── queuePublish()                   [FW-MOD-008]
             │
             ▼
      [Communication-Task/Core 0]
      mqtt_client.processPublishQueue()    [FW-MOD-029]
             │
             ▼
      MQTT Broker → El Servador
```

### Aktor-Befehlskette (FW-FLOW-002)

```
MQTT Broker (Server → ESP)
      │
      ▼ kaiser/{id}/esp/{id}/actuator/{gpio}/command
[ESP-IDF mqtt_event_handler / PubSubClient] Core 0
      │
      ▼
routeIncomingMessage()                     [FW-MOD-001]
      │
      ├── command_admission.shouldAcceptCommand() [FW-MOD-013]
      │
      └── queueActuatorCommand()           [FW-MOD-010]
             │
             ▼
      [Safety-Task/Core 1]
      processActuatorCommandQueue()
             │
             ├── g_actuator_mutex (take)   [FW-MOD-007]
             ├── actuator_manager.handleActuatorCommand() [FW-MOD-023]
             │     └── actuator_driver.control()  [MOD-025/026/027]
             │           └── gpio_manager  [FW-MOD-047]
             │
             └── queuePublish(actuator/response) [FW-MOD-008]
                    │
                    ▼ Communication-Task → MQTT
```

### Config-Push-Kette (FW-FLOW-003)

```
MQTT Broker → kaiser/{id}/esp/{id}/config  (Core 0)
      │
      ▼
routeIncomingMessage()                     [FW-MOD-001]
      │
      ├── command_admission.shouldAcceptCommand(CONFIG) [FW-MOD-013]
      ├── intent_contract (extract metadata) [FW-MOD-012]
      │
      └── queueConfigUpdateWithMetadata()  [FW-MOD-009]
             │
             ▼
      [Safety-Task/Core 1]
      processConfigUpdateQueue()
             │
             ├── handleSensorConfig()
             │     ├── g_sensor_mutex      [FW-MOD-007]
             │     └── sensor_manager.configureSensor() [FW-MOD-014]
             │           └── config_manager.saveSensorConfig() [FW-MOD-035]
             │                 └── storage_manager.putX() [FW-MOD-036]
             │
             ├── handleActuatorConfig()
             │     ├── g_actuator_mutex    [FW-MOD-007]
             │     └── actuator_manager.handleActuatorConfig() [FW-MOD-023]
             │
             ├── handleOfflineRulesConfig()
             │     └── offline_mode_manager.parseOfflineRules() [FW-MOD-041]
             │           └── storage_manager (NVS blob) [FW-MOD-036]
             │
             └── publishIntentOutcome()   [FW-MOD-012]
```

### Heartbeat/Safety-ACK-Kette (FW-FLOW-004)

```
[Communication-Task/Core 0]
mqtt_client.loop()
      │
      ├── publishHeartbeat() every 60s    [FW-MOD-029]
      │     ├── topic_builder.buildSystemHeartbeatTopic() [FW-MOD-034]
      │     ├── config_manager.getDiagnosticsJSON() [FW-MOD-035]
      │     └── gpio_manager.getReservedPinsList() [FW-MOD-047]
      │
      ▼ MQTT → Server

Server verarbeitet → ACK:
      │
      ▼ kaiser/{id}/esp/{id}/system/heartbeat/ack
[MQTT Callback / Core 0]
routeIncomingMessage()                    [FW-MOD-001]
      │
      ├── g_last_server_ack_ms.store()    [FW-MOD-001 Atomic]
      ├── mqtt_client.confirmRegistration() [FW-MOD-029]
      └── offline_mode_manager.onServerAckReceived(handover_epoch) [FW-MOD-041]

[Safety-Task/Core 1]
checkServerAckTimeout() every loop:
      │
      ├── if elapsed > 120s → triggerBroadcastEmergencyStop()
      └── → xTaskNotify(safety_task, NOTIFY_MQTT_DISCONNECTED)
            → actuator_manager.setAllActuatorsToSafeState()  [FW-MOD-023]
```

---

## 3. Zentrale Knoten (High-Coupling)

### Gott-Knoten

| Modul | Typ | Risiko |
|-------|-----|--------|
| **FW-MOD-001** (main.cpp) | Gott-Knoten | Enthält setup(), loop(), MQTT-Router, alle on-connect-Hooks, Safety-Mechanismen P1–P5. Änderungen hier erzeugen systemweite Seiteneffekte. Keine Testbarkeit ohne Hardware. |

### Zentral-Knoten (werden von >8 Modulen genutzt)

| Modul | Genutzt von | Risiko bei Ausfall |
|-------|-------------|---------------------|
| **FW-MOD-007** (rtos_globals) | 8+ Module (alle die Hardware teilen) | Deadlock → Systemstop |
| **FW-MOD-036** (storage_manager) | 6 Module | Datenverlust, NVS-Korruption |
| **FW-MOD-047** (gpio_manager) | 7+ Module | Hardware-Schäden |
| **FW-MOD-034** (topic_builder) | 8+ Module | Silent Communication Break |
| **FW-MOD-029** (mqtt_client) | 6+ Module | Vollständiger Kommunikationsverlust |
| **FW-MOD-044** (error_tracker) | 9+ Module | Observability-Verlust |
| **FW-MOD-051** (logger) | 12+ Module | Diagnosefähigkeit verloren |
| **FW-MOD-056** (system_types) | 10+ Module | Shared-State-Typ: Änderungen erzwingen Recompile-Kaskade |

---

## 4. Fragilitätsstellen

### F-001: main.cpp God-Object

- **Beschreibung:** Die gesamte Boot-Logik, MQTT-Message-Routing, Safety-Mechanismen P1–P5 und alle on-connect-Hooks sind in einer einzigen Datei (main.cpp) konzentriert. Die `core/`-Module (application, main_loop, system_controller) sind leere Stubs.
- **Wirkungsradius:** Jede Änderung in main.cpp hat systemweite Auswirkungen. Tests erfordern vollständige Hardware/Simulation.
- **Ausfallwirkung:** Kompilierungsfehler in main.cpp = gesamte Firmware unbrauchbar.

### F-002: RTOS Inter-Core-Kommunikation via 4 Queues

- **Beschreibung:** Die RTOS-Architektur erfordert exakt 4 Queues für Cross-Core-Kommunikation. Jede Queue hat ein festes Memory-Budget (Publish: 15 Slots ~17KB, Config: 5 Slots ~20KB, Actuator: 10 Slots, Sensor: N Slots).
- **Wirkungsradius:** Queue-Overflow → Drop (non-blocking). Bei hoher Last können Commands verloren gehen.
- **Ausfallwirkung:** Silent drop bei Queue-Full. PublishQueue-Drop = fehlende Sensor-Readings auf Server.

### F-003: NVS als einzige Persistenzschicht

- **Beschreibung:** StorageManager/ESP32 Preferences ist die einzige Persistenzschicht für ALLE Konfigurationen (WiFi, Zone, Sensor, Actuator, OfflineRules, SystemState, Watchdog).
- **Wirkungsradius:** NVS-Korruption → vollständiger Konfigurationsverlust → Re-Provisioning erforderlich.
- **Ausfallwirkung:** Nach NVS-Korruption ist der ESP32 ohne Server nicht mehr autonom funktionsfähig.

### F-004: MQTT-Backend-Dualität (ESP-IDF vs. PubSubClient)

- **Beschreibung:** Zwei völlig verschiedene MQTT-Backends hinter derselben MQTTClient-API. ESP-IDF (esp32_dev): Core 0, non-blocking, automatischer Reconnect. PubSubClient (xiao/wokwi): Core 1, blocking reconnect, manueller Offline-Buffer.
- **Wirkungsradius:** Safety-Mechanismen (xTaskNotify, Publish-Queue) funktionieren nur mit ESP-IDF-Backend korrekt. Im PubSubClient-Pfad wird flushActuatorCommandQueue + directcall verwendet.
- **Ausfallwirkung:** Tests auf Wokwi/Xiao decken nicht alle RTOS-Pfade des esp32_dev-Backends ab.

### F-005: Server-ACK-Timeout als globaler Atomic (Cross-Core)

- **Beschreibung:** `g_last_server_ack_ms` ist ein `std::atomic<uint32_t>` das von MQTT_EVENT_CONNECTED (Core 0) geschrieben und von checkServerAckTimeout() (Safety-Task, Core 1) gelesen wird. Ein Race-Fix (Bug-2) stellt sicher, dass das Reset im Event-Handler vor dem on_connect_callback_ geschieht.
- **Wirkungsradius:** Race-Condition zwischen Reconnect und ACK-Timeout-Check.
- **Ausfallwirkung:** Falsch ausgelöster ACK-Timeout → unnötiges setAllActuatorsToSafeState.

### F-006: OfflineRule NVS-Blob (APPEND-ONLY Schema)

- **Beschreibung:** OfflineRule wird als binärer Blob in NVS persistiert. Das Struct-Layout ist APPEND-ONLY (keine Felder umordnen). Neue Felder werden am Ende angefügt.
- **Wirkungsradius:** Firmware-Downgrade kann neue Blob-Felder nicht lesen → undefined behavior.
- **Ausfallwirkung:** Nach Downgrade: Offline-Rules korrumpiert → Offline-Hysterese funktioniert nicht.

---

## 5. Modul-zu-Modul Kantenliste (kritische Abhängigkeiten)

```
FW-MOD-001 ──────────► FW-MOD-005 (createSafetyTask)          [hart]
FW-MOD-001 ──────────► FW-MOD-006 (createCommunicationTask)   [hart]
FW-MOD-001 ──────────► FW-MOD-007 (initRtosMutexes)           [hart]
FW-MOD-001 ──────────► FW-MOD-029 (mqttClient.connect)        [hart]
FW-MOD-001 ──────────► FW-MOD-047 (gpioManager.initSafe)      [hart, MUSS ERSTES sein]
FW-MOD-005 ──────────► FW-MOD-007 (g_sensor_mutex, g_actuator_mutex) [hart]
FW-MOD-005 ──────────► FW-MOD-014 (performAllMeasurements)    [hart]
FW-MOD-005 ──────────► FW-MOD-023 (processActuatorLoops)      [hart]
FW-MOD-005 ──────────► FW-MOD-041 (evaluateOfflineRules)      [hart]
FW-MOD-006 ──────────► FW-MOD-029 (mqtt_client.loop)          [hart]
FW-MOD-006 ──────────► FW-MOD-030 (wifi_manager.loop)         [hart]
FW-MOD-014 ──────────► FW-MOD-007 (g_sensor_mutex, g_i2c_mutex, g_onewire_mutex) [hart]
FW-MOD-014 ──────────► FW-MOD-048 (i2cBusManager)             [hart für I2C-Sensoren]
FW-MOD-014 ──────────► FW-MOD-049 (oneWireBusManager)         [hart für OneWire-Sensoren]
FW-MOD-023 ──────────► FW-MOD-007 (g_actuator_mutex)          [hart]
FW-MOD-023 ──────────► FW-MOD-047 (gpioManager)               [hart]
FW-MOD-029 ──────────► FW-MOD-046 (circuit_breaker)           [locker]
FW-MOD-034 ──────────► FW-MOD-035 (getKaiserId/getESPId)      [locker, nur Konfiguration]
FW-MOD-035 ──────────► FW-MOD-036 (storage_manager)           [hart]
FW-MOD-036 ──────────► FW-MOD-007 (nvs_mutex via CONFIG_ENABLE_THREAD_SAFETY) [bedingt-hart]
FW-MOD-041 ──────────► FW-MOD-014 (getSensorValue Value-Cache) [locker]
FW-MOD-041 ──────────► FW-MOD-023 (controlActuatorBinary)     [hart]
FW-MOD-041 ──────────► FW-MOD-036 (NVS offline Namespace)     [hart]
FW-MOD-048 ──────────► FW-MOD-007 (g_i2c_mutex)               [hart, 250ms Timeout]
FW-MOD-049 ──────────► FW-MOD-007 (g_onewire_mutex)           [hart, portMAX_DELAY]
```
