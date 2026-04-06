# P1.1 — ESP32 Modul-Inventar (El Trabajante Firmware)

**Paket:** 01  
**Analyse-Datum:** 2026-04-04  
**Firmware-Version:** 4.0.0  
**Targets:** seeed_xiao_esp32c3, esp32_dev, wokwi_simulation  
**Status:** Abgeschlossen — Reine Analyse, kein Code geändert

---

## 1. Ziel und Scope

Dieses Dokument bildet die vollständige Modul-Komponentenkarte der ESP32-Firmware (El Trabajante).
Es ist Grundlage für alle Folgepakete P1.2 bis P1.7.

**In Scope:**
- Alle `.h`/`.cpp`-Module unter `El Trabajante/src/`
- FreeRTOS-Task-Struktur und Inter-Task-Kommunikation
- NVS-Persistenzschicht (StorageManager)
- Hardware-Abstraktionsschicht (GPIO, I2C, OneWire, PWM)
- Kommunikationsstack (WiFi, MQTT, HTTP)
- Safety- und Offline-Mechanismen

**Out of Scope:**
- Server-seitige Verarbeitungslogik (El Servador)
- Frontend (El Frontend)
- CI/CD-Pipeline-Details
- Wokwi-Simulations-spezifische Konfiguration

---

## 2. Systemgrenze ESP32

```
╔══════════════════════════════════════════════════════════════════════╗
║  El Trabajante (ESP32 Firmware)                                      ║
║                                                                      ║
║  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  ║
║  │  GPIO/Sensoren  │    │  RTOS Tasks     │    │  Konfiguration  │  ║
║  │  ADC, I2C,      │───>│  Safety (C1)    │───>│  NVS (Flash)    │  ║
║  │  OneWire, PWM   │    │  Comm (C0)      │    │  Preferences    │  ║
║  └─────────────────┘    └────────┬────────┘    └─────────────────┘  ║
║                                  │                                   ║
║                          ┌───────▼────────┐                          ║
║                          │  MQTT / WiFi   │                          ║
║                          │  (Interface)   │                          ║
║                          └───────┬────────┘                          ║
╚══════════════════════════════════│═══════════════════════════════════╝
                                   │ MQTT (TCP/TLS)
                    ╔══════════════▼══════════════╗
                    ║   El Servador (Server)       ║
                    ║   Alle Business-Logik hier   ║
                    ╚═════════════════════════════╝
```

**ESP32-Verantwortung (DARF):**
- RAW-Sensordaten erfassen und per MQTT senden
- Aktor-Befehle vom Server empfangen und ausführen
- Konfiguration im NVS persistieren
- Safety-Fallback: Aktoren in Safe-State versetzen bei Disconnect
- Offline-Hysterese: Einfache binäre Aktor-Regeln ohne Server

**ESP32-Verantwortung (DARF NICHT):**
- Sensor-Kalibrierung berechnen (Server übernimmt das)
- Business-Logik (Bewässerungsentscheidungen etc.)
- State-Management über Reboots hinaus (außer NVS-Config)
- Alarmierung / Benachrichtigung (Server-Aufgabe)

---

## 3. Analyse-ID-Schema

| Typ | Format | Beispiel |
|-----|--------|---------|
| Modul | `FW-MOD-XXX` | FW-MOD-001 |
| Datenfluss | `FW-FLOW-XXX` | FW-FLOW-001 |
| Contract | `FW-CON-XXX` | FW-CON-001 |

---

## 4. Modulcluster-Übersicht

| Cluster | Module-IDs | Beschreibung |
|---------|-----------|--------------|
| **Runtime/Boot** | MOD-001 bis MOD-004 | Entry Point, System-Setup, Zustandsmaschine |
| **RTOS/Tasks** | MOD-005 bis MOD-013 | FreeRTOS Tasks, Queues, Inter-Task-Kommunikation |
| **Sensorik** | MOD-014 bis MOD-022 | Sensor-Lifecycle, Treiber, Messung |
| **Aktorik** | MOD-023 bis MOD-028 | Aktor-Lifecycle, Treiber, Emergency-Stop |
| **Netzwerk/MQTT/WiFi** | MOD-029 bis MOD-034 | MQTT, WiFi, HTTP, Topic-Bau |
| **Config/Provisioning** | MOD-035 bis MOD-040 | Konfiguration, NVS, AP-Provisioning |
| **Safety/Watchdog** | MOD-041 bis MOD-043 | Offline-Hysterese, Emergency, Watchdog |
| **Diagnostics** | MOD-044 bis MOD-046 | Fehler-Tracking, Health-Monitoring, Circuit-Breaker |
| **Drivers/HAL** | MOD-047 bis MOD-050 | GPIO, I2C, OneWire, PWM |
| **Utilities** | MOD-051 bis MOD-055 | Logger, Time, JSON, String, OneWire-Utils |
| **Models** | MOD-056 bis MOD-062 | Shared Datenstrukturen und Typen |

---

## 5. Vollständige Modultabelle

### Cluster: Runtime/Boot

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-001** | `src/main.cpp` | **Zentrales Entry-Point**: setup(), loop(), MQTT-Message-Router, globaler Systemzustand, FreeRTOS-Task-Erstellung, alle on-connect-Hooks | MQTT-Nachrichten (alle Topics), Hardware-Events, WiFi-Events | Zustandsübergänge, Task-Notifikationen, MQTT-ACKs | RAM (Atomics, Globals) | CRITICAL: Hält alle Safety-Mechanismen zusammen (Server-ACK-Timeout, emergency stop routing) | **kritisch** | P1.2, P1.3, P1.5, P1.6 |
| **FW-MOD-002** | `src/core/application.h/cpp` | **Stub (leer)** — war für Application-Klassen-Extraktion vorgesehen | — | — | — | — | niedrig | — |
| **FW-MOD-003** | `src/core/main_loop.h/cpp` | **Stub (leer)** — war für Main-Loop-Extraktion vorgesehen | — | — | — | — | niedrig | — |
| **FW-MOD-004** | `src/core/system_controller.h/cpp` | **Stub (leer)** — war für SystemController-Klasse vorgesehen | — | — | — | — | niedrig | — |

> **Hinweis:** FW-MOD-002 bis FW-MOD-004 sind leere Stubs (1–2 Zeilen). Die gesamte Logik liegt in FW-MOD-001 (main.cpp). Dies ist ein bekanntes Architektur-Risiko (God-Object-Pattern).

---

### Cluster: RTOS/Tasks

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-005** | `src/tasks/safety_task.h/cpp` | **Safety-Task (Core 1, Prio 4)**: performAllMeasurements, processActuatorLoops, processConfigUpdateQueue, processActuatorCommandQueue, offline rule evaluation, Server-ACK-Timeout-Check | xTaskNotify-Bits (EMERGENCY_STOP, MQTT_DISCONNECTED, SUBZONE_SAFE), Queue-Items | Sensor-Readings → PublishQueue, Aktor-Zustandsänderungen | RAM | CRITICAL: Führt Emergency-Stop aus (<1µs via xTaskNotify), setzt alle Aktoren safe bei Disconnect | **kritisch** | P1.2, P1.3, P1.5 |
| **FW-MOD-006** | `src/tasks/communication_task.h/cpp` | **Communication-Task (Core 0, Prio 3)**: WiFi-Loop, MQTT-Loop, Portal/Provisioning, PublishQueue-Drain (processPublishQueue), Heartbeat-Timing, Actuator-Status-Publish | WiFi-Events, MQTT-Events, PublishQueue | MQTT-Nachrichten, WiFi-Verbindung | RAM | hoch: Verwaltet MQTT-Verbindung; Disconnect löst Safety-Task-Notifikation aus | **kritisch** | P1.2, P1.6 |
| **FW-MOD-007** | `src/tasks/rtos_globals.h/cpp` | **RTOS-Mutex-Pool**: 5 Mutexes (actuator, sensor, i2c, onewire, gpio_registry) | initRtosMutexes() Aufruf in setup() | Mutex-Handles | RAM | CRITICAL: Schützt alle shared Hardware-Ressourcen zwischen Core 0 und Core 1 | **kritisch** | P1.2 |
| **FW-MOD-008** | `src/tasks/publish_queue.h/cpp` | **Core 1 → Core 0 Publish-Queue** (15 Slots, ~17 KB Heap): queuePublish() von Core 1, drain via processPublishQueue() auf Core 0 | PublishRequest-Structs | MQTT-Publish-Aufrufe | RAM (Queue-Buffer) | mittel: Überfüllung führt zu Drop (non-blocking) | **hoch** | P1.2, P1.6 |
| **FW-MOD-009** | `src/tasks/config_update_queue.h/cpp` | **Core 0 → Core 1 Config-Queue** (5 Slots, ~20 KB Heap): MQTT Config-Push kommt auf Core 0, wird auf Core 1 verarbeitet (sensors, actuators, offline_rules) | JSON-Payload (max 4096 Bytes) + IntentMetadata | ConfigUpdateRequest-Items | RAM (Queue-Buffer) | hoch: Verhindert Race auf sensors_[] / actuators_[] | **hoch** | P1.2, P1.4 |
| **FW-MOD-010** | `src/tasks/actuator_command_queue.h/cpp` | **MQTT → Core 1 Actuator-Queue** (10 Slots): Aktor-Befehle von Core 0 an Core 1 | topic + payload (bis 512 Bytes) + IntentMetadata | ActuatorMqttQueueItem-Items | RAM | hoch: Safety-kritisch (Aktor-Steuerung immer auf Core 1) | **hoch** | P1.2, P1.5 |
| **FW-MOD-011** | `src/tasks/sensor_command_queue.h/cpp` | **MQTT → Core 1 Sensor-Queue**: On-Demand-Messungen via Server-Command | topic + payload | SensorCommandItem | RAM | mittel | **mittel** | P1.2, P1.3 |
| **FW-MOD-012** | `src/tasks/intent_contract.h/cpp` | **Intent/Outcome-Contract**: Safety-Epoch-Management (bumpSafetyEpoch), TTL-Validierung für Intent-Items, publishIntentOutcome-Hilfsfunktionen, Correlation-ID-Extraktion | Payload-JSON | IntentMetadata-Structs, MQTT-Outcome-Events | RAM (Atomic Epoch-Counter) | hoch: Safety-Epoch invalidiert alle in-flight Commands bei Emergency-Stop | **hoch** | P1.2, P1.5 |
| **FW-MOD-013** | `src/tasks/command_admission.h/cpp` | **Command-Admission-Gate**: shouldAcceptCommand() prüft ob Befehle im aktuellen Systemzustand akzeptiert werden (registration_confirmed, config_pending, runtime_degraded, safety_locked) | CommandSubtype + CommandAdmissionContext | CommandAdmissionDecision | RAM | hoch: Verhindert Befehle in kritischen System-States | **hoch** | P1.2, P1.5 |

---

### Cluster: Sensorik

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-014** | `src/services/sensor/sensor_manager.h/cpp` | **Sensor-Manager (Singleton)**: Sensor-Lifecycle (configure, remove), performAllMeasurements (alle 30s), per-Sensor-Circuit-Breaker, Value-Cache (5min Stale), MQTT-Payload-Build + Publish | SensorConfig (aus ConfigManager), GPIO-Events | SensorReading → PublishQueue, Value-Cache | RAM (sensors_[] MAX_SENSORS, value_cache_[20]) | hoch: Value-Cache wird von OfflineModeManager für Hysterese-Entscheidungen genutzt | **kritisch** | P1.3, P1.4 |
| **FW-MOD-015** | `src/services/sensor/sensor_factory.h/cpp` | **Sensor-Factory**: Erstellt ISensorDriver-Implementierungen nach sensor_type | sensor_type-String | ISensorDriver-Pointer (unique_ptr) | RAM | niedrig | **mittel** | P1.3 |
| **FW-MOD-016** | `src/services/sensor/pi_enhanced_processor.h/cpp` | **Pi-Enhanced-Prozessor**: Lokale Preview-Wertberechnung (nicht Business-Logik). Wandelt RAW-Werte in human-readable Werte für MQTT-Payload um (z.B. DS18B20 raw * 0.0625) | SensorConfig + raw_value | processed_value (float) | RAM | niedrig: Nur lokale Preview; Server ist Single Source of Truth | **mittel** | P1.3 |
| **FW-MOD-017** | `src/services/sensor/sensor_drivers/temp_sensor_ds18b20.h/cpp` | **DS18B20 Driver**: OneWire-basierte Temperaturmessung, ROM-Code-Adressierung (Mehrfach-Sensoren auf einem Bus) | OneWireBusManager + ROM-Code | raw_value (int16_t) | RAM | mittel: Mehrere DS18B20 auf einem GPIO teilen sich den OneWire-Bus (mutex-geschützt) | **hoch** | P1.3 |
| **FW-MOD-018** | `src/services/sensor/sensor_drivers/temp_sensor_sht31.h/cpp` | **SHT31 Driver**: I2C-basierter Temp+Humidity-Sensor (Multi-Value: sht31_temperature + sht31_humidity), CRC-Validierung | I2CBusManager + i2c_address | raw_bytes[6] → temperature + humidity | RAM | mittel: I2C-Bus mutex-geschützt | **hoch** | P1.3 |
| **FW-MOD-019** | `src/services/sensor/sensor_drivers/ph_sensor.h/cpp` | **pH-Sensor Driver**: Analog-ADC-basierte pH-Messung | GPIO-Pin + ADC | raw_value (ADC 0–4095) | RAM | niedrig | **mittel** | P1.3 |
| **FW-MOD-020** | `src/services/sensor/sensor_drivers/i2c_sensor_generic.h/cpp` | **Generic I2C Driver**: Fallback für I2C-Sensoren ohne spezifischen Treiber | I2CBusManager + sensor_type + i2c_address | raw_bytes | RAM | niedrig | **mittel** | P1.3 |
| **FW-MOD-021** | `src/models/sensor_types.h` | **Sensor-Datenstrukturen**: SensorConfig (Konfiguration, Circuit-Breaker-State), SensorReading (Messergebnis), SensorCBState (CLOSED/OPEN/HALF_OPEN) | — | Typdefinitionen | — | mittel: SensorCBState steuert ob Sensor gemessen wird | **hoch** | P1.3, P1.4 |
| **FW-MOD-022** | `src/models/sensor_registry.h/cpp` | **Sensor-Registry**: Statische Mapping-Tabelle sensor_type → SensorCapability (device_type, i2c_address, is_multi_value). Ermöglicht dynamische Typ-Erkennung | sensor_type-String | SensorCapability-Pointer | RAM (statisch) | niedrig | **mittel** | P1.3 |

---

### Cluster: Aktorik

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-023** | `src/services/actuator/actuator_manager.h/cpp` | **Aktor-Manager (Singleton)**: Aktor-Lifecycle (configure, remove), handleActuatorCommand (ON/OFF/PWM/TOGGLE/STOP), processActuatorLoops (Auto-Off-Timer), setAllActuatorsToSafeState, publishAllActuatorStatus | ActuatorConfig (aus ConfigManager), ActuatorCommand (aus Queue) | GPIO-Zustandsänderungen, MQTT-Status-Publish | RAM (actuators_[] MAX_ACTUATORS) | CRITICAL: setAllActuatorsToSafeState ist primärer Safety-Fallback bei Disconnect/Timeout | **kritisch** | P1.3, P1.4, P1.5 |
| **FW-MOD-024** | `src/services/actuator/safety_controller.h/cpp` | **Safety-Controller (Singleton)**: emergencyStopAll, emergencyStopActuator, isolateSubzone, clearEmergencyStop, resumeOperation. Koordiniert Emergency-Zustandsmaschine (NORMAL → ACTIVE → CLEARING → RESUMING) | Emergency-Trigger (von SafetyTask/main.cpp) | Aktor-Deaktivierung via ActuatorManager, Logging | RAM | CRITICAL: Einzige Autorität für Emergency-Stop-Lifecycle | **kritisch** | P1.5 |
| **FW-MOD-025** | `src/services/actuator/actuator_drivers/pump_actuator.h/cpp` | **Pump-Driver**: Digitaler ON/OFF-Aktor, RuntimeProtection (max 1h default), accumulated_runtime_ms-Tracking | GPIO + bool state | GPIO-HIGH/LOW | RAM | hoch: Pumpe muss bei Emergency-Stop sofort stoppen | **hoch** | P1.5 |
| **FW-MOD-026** | `src/services/actuator/actuator_drivers/valve_actuator.h/cpp` | **Valve-Driver**: Digitaler ON/OFF-Aktor, optional aux_gpio für H-Brücken | GPIO (+aux) + bool state | GPIO-HIGH/LOW | RAM | hoch | **hoch** | P1.5 |
| **FW-MOD-027** | `src/services/actuator/actuator_drivers/pwm_actuator.h/cpp` | **PWM-Driver**: Analoger Aktor (0–255 duty cycle), PWM-Channel-Zuweisung | GPIO + pwm_value | LEDC PWM Output | RAM | hoch: Muss bei Emergency-Stop auf 0 gesetzt werden | **hoch** | P1.5 |
| **FW-MOD-028** | `src/models/actuator_types.h` | **Aktor-Datenstrukturen**: ActuatorConfig, ActuatorCommand, ActuatorStatus, ActuatorResponse, ActuatorAlert, EmergencyState, RecoveryConfig | — | Typdefinitionen | — | hoch: EmergencyState ist Safety-kritisch | **hoch** | P1.4, P1.5 |

---

### Cluster: Netzwerk/MQTT/WiFi

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-029** | `src/services/communication/mqtt_client.h/cpp` | **MQTT-Client (Singleton, Dual-Backend)**: Verbindungsmanagement (ESP-IDF default / PubSubClient für Xiao/Wokwi), publish/subscribe, Heartbeat (60s), RegistrationGate, Circuit-Breaker, Sequence-Numbers, Offline-Buffer (PubSubClient-Pfad: 25 Slots) | MQTT-Config, Callbacks | MQTT-Nachrichten, Connection-Status, Heartbeat | RAM (Offline-Buffer PubSubClient) | CRITICAL: Disconnect löst NOTIFY_MQTT_DISCONNECTED → setAllActuatorsToSafeState aus | **kritisch** | P1.6 |
| **FW-MOD-030** | `src/services/communication/wifi_manager.h/cpp` | **WiFi-Manager (Singleton)**: WiFi-Connect/Disconnect/Reconnect, RSSI, Circuit-Breaker für WiFi | WiFiConfig | WiFi-Verbindungsstatus | RAM | hoch: WiFi-Verlust führt zu MQTT-Disconnect → Safety-Cascade | **kritisch** | P1.6 |
| **FW-MOD-031** | `src/services/communication/webserver.h/cpp` | **HTTP-WebServer**: Provisioning-HTTP-Server (GET /, POST /provision, GET /status, POST /reset), Captive-Portal-DNS | HTTP-Requests | HTTP-Responses, Config-Speicherung | RAM | niedrig: Nur aktiv während Provisioning | **niedrig** | — |
| **FW-MOD-032** | `src/services/communication/network_discovery.h/cpp` | **Network-Discovery**: mDNS-Advertise (esp-{ESP_ID}.local) | WiFi-Verbindung | mDNS-Entries | RAM | niedrig | **niedrig** | — |
| **FW-MOD-033** | `src/services/communication/http_client.h/cpp` | **HTTP-Client**: Ausgehende HTTP-Requests an Server | Request-Config | HTTP-Response | RAM | niedrig | **niedrig** | — |
| **FW-MOD-034** | `src/utils/topic_builder.h/cpp` | **Topic-Builder (Static Class)**: Zentraler Aufbau aller MQTT-Topics. `buildSensorDataTopic`, `buildActuatorCommandTopic`, `buildSystemHeartbeatTopic` etc. Verhindert Topic-String-Duplizierung | esp_id, kaiser_id | MQTT-Topic-Strings (char[256]) | RAM (statisch) | hoch: Alle Topics müssen exakt mit Server-Subscriptions übereinstimmen | **kritisch** | P1.6 |

---

### Cluster: Config/Provisioning

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-035** | `src/services/config/config_manager.h/cpp` | **Config-Manager (Singleton)**: Orchestriert alle Konfigurationstypen (WiFi, Zone, Subzone, System, Sensor, Actuator, Approval). Cached in RAM, persistiert via StorageManager. NVS-Key-Migration (legacy >15-char Keys → compact). Subzone-Index-Map | Load/Save-Anfragen | Konfigurationsdaten (cached), NVS-Writes | **NVS** (alle Config-Namespaces) | hoch: Konfigurationsverlust erzwingt Re-Provisioning | **kritisch** | P1.2, P1.4 |
| **FW-MOD-036** | `src/services/config/storage_manager.h/cpp` | **Storage-Manager (Singleton, NVS-Abstraktionsschicht)**: ESP32 Preferences Wrapper, Namespace-Management, Thread-Safety via nvs_mutex (CONFIG_ENABLE_THREAD_SAFETY), Transaction-Support | Namespace, Key-Value-Paare | persistierte Daten | **NVS** (alle Namespaces) | hoch: Einzige Persistenzschicht; Thread-Safety kritisch für Multi-Core | **kritisch** | P1.4 |
| **FW-MOD-037** | `src/services/config/runtime_readiness_policy.h/cpp` | **Runtime-Readiness-Policy**: evaluateRuntimeReadiness() — Entscheidet ob ESP von STATE_CONFIG_PENDING_AFTER_RESET in STATE_OPERATIONAL/PENDING_APPROVAL wechseln darf (sensors > 0, actuators > 0, offline_rules > 0) | RuntimeReadinessSnapshot (sensor_count, actuator_count, offline_rule_count) | RuntimeReadinessDecision | RAM | hoch: Verhindert Betrieb ohne Mindest-Konfiguration | **hoch** | P1.2 |
| **FW-MOD-038** | `src/services/config/config_response.h/cpp` | **Config-Response-Builder**: Erstellt standardisierte MQTT-Responses für Config-Push ACKs und Fehler-Meldungen | ConfigType, ConfigErrorCode, correlationId | MQTT-JSON-Payloads → PublishQueue | RAM | niedrig | **mittel** | P1.6 |
| **FW-MOD-039** | `src/services/provisioning/provision_manager.h/cpp` | **Provision-Manager (Singleton)**: AP-Mode WiFi-Provisioning, HTTP-Captive-Portal (SSID: "AutoOne-{ESP_ID}", PW: "provision"), POST /provision Config-Empfang und -Speicherung, Factory-Reset über POST /reset, mDNS, Timeout (10min) | HTTP-Requests (POST /provision) | WiFiConfig + ZoneConfig → ConfigManager, ESP.restart() | NVS (via ConfigManager) | mittel: Provisioning-Timeout führt zu Safe-Mode | **hoch** | P1.2 |
| **FW-MOD-040** | `src/services/provisioning/portal_authority.h/cpp` | **Portal-Authority**: Entscheidungslogik wann das Provisioning-Portal geöffnet/geschlossen werden darf (MQTT-Disconnect-Portal vs. normales Provisioning) | MQTT-Status, Config-Status | Portal-Open/Close-Entscheidung | RAM | niedrig | **niedrig** | — |

---

### Cluster: Safety/Watchdog/Failsafe

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-041** | `src/services/safety/offline_mode_manager.h/cpp` | **Offline-Mode-Manager (Singleton, 4-State-Machine)**: ONLINE → DISCONNECTED → OFFLINE_ACTIVE → RECONNECTING → ADOPTING. Nach 30s ohne Server-ACK aktivieren sich lokale OfflineRules (binäre Hysterese-Regeln für Aktoren). Handover-Epoch-Tracking, Persistenz-Drift-Detection | MQTT-Connect/Disconnect-Events, Heartbeat-ACK (mit handover_epoch), SensorManager-Value-Cache | Aktor-Steuerung (via ActuatorManager), MQTT-Authority-Metrics-Events | NVS ("offline" Namespace, blob) | CRITICAL: TM-authorized Exception zur Server-Centric-Regel. Schützt Pflanzen bei Server-Ausfall | **kritisch** | P1.5 |
| **FW-MOD-042** | `src/tasks/emergency_broadcast_contract.h` | **Emergency-Broadcast-Contract (Header-only)**: Validiert incoming Emergency-Stop-Payloads (command/action/auth_token/reason/issued_by/timestamp Field-Types). Normalisiert command-Feld (supports "stop_all" + "emergency_stop" als Aliases) | BroadcastEmergencyContractInput | BroadcastEmergencyContractResult (VALID/CONTRACT_MISMATCH) | RAM | CRITICAL: Falsch validierter Emergency-Stop kann Systemausfall riskieren | **kritisch** | P1.5 |
| **FW-MOD-043** | `src/utils/watchdog_storage.h/cpp` | **Watchdog-NVS-Storage**: Persistiert Watchdog-Events in NVS (Rolling 24h Window), Erkennt WDT-Boot (watchdogStorageInitEarly), finalisiert Boot-Record nach NTP-Sync | WatchdogDiagnostics, Boot-Reason | NVS-Watchdog-History, Logging | **NVS** ("wdog" Namespace) | hoch: Erkennt wiederkehrende Watchdog-Failures → Diagnose-Grundlage | **hoch** | P1.4, P1.5 |

---

### Cluster: Diagnostics/Observability

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-044** | `src/error_handling/error_tracker.h/cpp` | **Error-Tracker (Singleton, Ring-Buffer 30 Einträge)**: trackError() mit ErrorCode (1000-4999), Severity (WARNING/ERROR/CRITICAL), MQTT-Fire-and-forget-Publish (topic: system/error), Rekursionsschutz, getErrorHistory() | Error-Code, Severity, Message | Error-Buffer, MQTT-Error-Events | RAM (Ring-Buffer) | mittel: Liefert Observability-Daten für Server-Analyse | **hoch** | P1.7 |
| **FW-MOD-045** | `src/error_handling/health_monitor.h/cpp` | **Health-Monitor (Singleton)**: Heap-Free, Heap-Fragmentation, WiFi-RSSI, MQTT-Status, Sensor/Aktor-Count, System-State, Watchdog-Status — als periodischer MQTT-Snapshot (topic: system/diagnostics). Change-Detection: Nur bei >20% Heap-Änderung oder >10dBm RSSI-Änderung | HealthSnapshot-Daten (von allen Managern) | MQTT-Diagnostics-Publish | RAM | mittel | **hoch** | P1.7 |
| **FW-MOD-046** | `src/error_handling/circuit_breaker.h/cpp` | **Circuit-Breaker**: State-Machine (CLOSED → OPEN → HALF_OPEN) für MQTT und WiFi. Nach 5 Failures → OPEN (30s Recovery-Timeout), dann HALF_OPEN (Test-Request) | recordSuccess/recordFailure-Aufrufe | CircuitState, allowRequest()-Entscheidung | RAM | hoch: Verhindert Retry-Spam bei MQTT/WiFi-Ausfall | **hoch** | P1.6 |

---

### Cluster: Drivers/HAL

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-047** | `src/drivers/gpio_manager.h/cpp` | **GPIO-Manager (Singleton, Safety-System)**: Pin-Registry (requestPin, releasePin), initializeAllPinsToSafeMode (MUSS erstes in setup() sein), ADC2-Konflikt-Check (WiFi-Interferenz), Subzone-Pin-Mapping (subzone_pin_map_), enableSafeModeForSubzone, getReservedPinsList für Heartbeat | GPIO-Pin-Nummer, Owner-String, HAL-Interface | GPIO-Zustand (INPUT/OUTPUT/INPUT_PULLUP), Pin-Ownership | RAM (pins_-Vector, subzone_pin_map_) | CRITICAL: Verhindert physikalische Hardware-Schäden durch unkontrollierte GPIO-Zustände. Muss VOR allem anderen initialisiert werden | **kritisch** | P1.4, P1.5 |
| **FW-MOD-048** | `src/drivers/i2c_bus.h/cpp` | **I2C-Bus-Manager (Singleton)**: Wire-Initialisierung (SDA/SCL board-spezifisch), Bus-Scan, Raw-Read/Write, Protocol-aware Sensor-Reading (command-based für SHT31, register-based für BMP280), CRC8-Validierung (Sensirion Polynomial 0x31), Bus-Recovery (9 Clock-Pulses bei stuck bus) | g_i2c_mutex (von rtos_globals), Sensor-Type-String | raw bytes[N] | RAM | hoch: I2C-Bus-Lock kann Safety-Task blockieren → Timeout 250ms | **hoch** | P1.3, P1.4 |
| **FW-MOD-049** | `src/drivers/onewire_bus.h/cpp` | **OneWire-Bus-Manager (Singleton)**: Dallas OneWire Protokoll, ROM-Code-Scan (bis 32 Devices), Temperaturmessung (DallasTemperature), g_onewire_mutex (portMAX_DELAY) | g_onewire_mutex, GPIO-Pin | ROM-Code-Liste, Temperature-raw | RAM | hoch: OneWire ist nicht thread-safe → Mutex portMAX_DELAY | **hoch** | P1.3 |
| **FW-MOD-050** | `src/drivers/pwm_controller.h/cpp` | **PWM-Controller**: LEDC PWM Channel-Management, Channel-Zuweisung für Aktoren | GPIO + Frequency + Duty | PWM-Output | RAM | mittel | **mittel** | P1.3 |

---

### Cluster: Utilities/Basisinfrastruktur

| ID | Name/Pfad | Verantwortung | Input | Output | Persistenz | Safety-Bezug | Kritikalität | Folgepaket |
|----|-----------|---------------|-------|--------|-----------|--------------|-------------|-----------|
| **FW-MOD-051** | `src/utils/logger.h/cpp` | **Logger (Singleton, Ring-Buffer 50 Einträge)**: TAG-basiertes Logging (ESP-IDF-Konvention), Serial + Ring-Buffer, Log-Levels (DEBUG/INFO/WARNING/ERROR/CRITICAL), Makros LOG_D/LOG_I/LOG_W/LOG_E/LOG_C | log(level, tag, message) | Serial-Output, Ring-Buffer-Entries | RAM (Ring-Buffer) | niedrig | **mittel** | P1.7 |
| **FW-MOD-052** | `src/utils/time_manager.h/cpp` | **Time-Manager (Singleton, NTP)**: NTP-Sync (primär: 192.168.0.39 Docker-NTP, fallback: ptbtime1.ptb.de, pool.ntp.org), Unix-Timestamp für alle MQTT-Payloads, periodisches Re-Sync (5min), SNTP-Daemon-Management (start/stop bei WiFi-Events) | WiFi-Connect-Event | time_t Unix-Timestamp | RAM | mittel: Ohne NTP-Sync sind alle MQTT-Timestamps 0 | **hoch** | P1.3, P1.6 |
| **FW-MOD-053** | `src/utils/json_helpers.h` | **JSON-Helpers (Header-only)**: Hilfsfunktionen für ArduinoJson (DynamicJsonDocument, serializeJson) | — | JSON-Build-Helpers | — | niedrig | **niedrig** | — |
| **FW-MOD-054** | `src/utils/string_helpers.h/cpp` | **String-Helpers**: ESP_ID-Formatierung, String-Utilities | — | String-Transformationen | — | niedrig | **niedrig** | — |
| **FW-MOD-055** | `src/utils/onewire_utils.h/cpp` | **OneWire-Utils**: ROM-Code-Konvertierung (uint8_t[8] ↔ Hex-String "28FF641E8D3C0C79"), verwendet für MQTT-Payload-Identifikation | ROM-Code bytes | Hex-String | — | niedrig | **niedrig** | P1.3 |

---

### Cluster: Models/Shared Types

| ID | Name/Pfad | Verantwortung | Persistenz | Kritikalität | Folgepaket |
|----|-----------|---------------|-----------|-------------|-----------|
| **FW-MOD-056** | `src/models/system_types.h` | SystemState (15 Zustände), KaiserZone, MasterZone, SubzoneConfig, WiFiConfig, SystemConfig | — | **kritisch** | P1.2 |
| **FW-MOD-057** | `src/models/error_codes.h` | Error-Code-Konstanten (1000-4999 in 4 Kategorien: HARDWARE, SERVICE, COMMUNICATION, APPLICATION) | — | **hoch** | P1.7 |
| **FW-MOD-058** | `src/models/offline_rule.h` | OfflineRule-Struct (MAX_OFFLINE_RULES=8): actuator_gpio, sensor_gpio, Hysterese-Schwellwerte, Time-Filter (Wochentage, Zeitfenster), NVS-Blob-Layout (APPEND-ONLY) | NVS (blob) | **kritisch** | P1.5 |
| **FW-MOD-059** | `src/models/watchdog_types.h` | WatchdogConfig, WatchdogDiagnostics, WatchdogMode (PROVISIONING/PRODUCTION/DISABLED) | NVS (via WatchdogStorage) | **hoch** | P1.5 |
| **FW-MOD-060** | `src/models/mqtt_messages.h` | MQTT-Message-Strukturen (MQTTMessage für Offline-Buffer) | — | **mittel** | P1.6 |
| **FW-MOD-061** | `src/config/firmware_version.h` | KAISER_FIRMWARE_VERSION_STRING "4.0.0" | — | **niedrig** | — |
| **FW-MOD-062** | `src/config/feature_flags.h` | Compile-Time Feature-Flags (DYNAMIC_LIBRARY_SUPPORT, HIERARCHICAL_ZONES, OTA_LIBRARY_ENABLED, SAFE_MODE_PROTECTION, ZONE_MASTER_ENABLED) | — | **mittel** | P1.2 |
| **FW-MOD-063** | `src/config/hardware/esp32_dev.h` | ESP32-Dev-Board Pin-Definitionen (I2C SDA/SCL, Default-OneWire-Pin etc.) | — | **mittel** | P1.4 |
| **FW-MOD-064** | `src/config/hardware/xiao_esp32c3.h` | XIAO ESP32-C3 Pin-Definitionen | — | **mittel** | P1.4 |

---

## 6. Kritikalitäts-Ranking (Top-12)

| Rang | Modul-ID | Name | Begründung |
|------|----------|------|-----------|
| 1 | FW-MOD-001 | main.cpp | God-Object: Enthält gesamte Boot-Logik, MQTT-Router, alle Safety-Mechanismen |
| 2 | FW-MOD-007 | rtos_globals | 5 Mutexes schützen alle shared Hardware-Ressourcen; Deadlock = Systemstop |
| 3 | FW-MOD-047 | gpio_manager | Fehler hier = physikalischer Hardware-Schaden. Muss ERSTES in setup() sein |
| 4 | FW-MOD-029 | mqtt_client | Einziger Kommunikationskanal zum Server; Disconnect = Safety-Cascade |
| 5 | FW-MOD-005 | safety_task | Führt alle Safety-kritischen Operationen auf Core 1 aus |
| 6 | FW-MOD-041 | offline_mode_manager | Schützt Pflanzen/Hardware bei Server-Ausfall; komplexe State-Machine |
| 7 | FW-MOD-023 | actuator_manager | Steuert physikalische Aktoren; setAllActuatorsToSafeState ist primärer Failsafe |
| 8 | FW-MOD-036 | storage_manager | Einzige Persistenzschicht; Korruption = Konfigurationsverlust |
| 9 | FW-MOD-024 | safety_controller | Emergency-Stop-Autorität; Fehler = unkontrollierte Aktoren |
| 10 | FW-MOD-012 | intent_contract | Safety-Epoch: Invalidiert alle in-flight Commands bei Emergency |
| 11 | FW-MOD-014 | sensor_manager | Value-Cache ist Input für Offline-Hysterese; Fehler = falsche Offline-Entscheidungen |
| 12 | FW-MOD-034 | topic_builder | Alle 15 MQTT-Topics müssen mit Server übereinstimmen; Fehler = Silent Communication Break |

---

## 7. Verweise

- Abhängigkeitskarte: [paket-01-esp32-abhaengigkeitskarte.md](paket-01-esp32-abhaengigkeitskarte.md)
- Contract-Seedlist: [paket-01-esp32-contract-seedlist.md](paket-01-esp32-contract-seedlist.md)
- Offene Risiken: [paket-01-esp32-offene-risiken.md](paket-01-esp32-offene-risiken.md)

---

## 8. Hand-off in P1.2 und P1.3

### Kernmodule für Lifecycle-Analyse (P1.2)

Fokus liegt auf den 15 SystemState-Zuständen und wie Transitionen ausgelöst werden:

| Modul | Relevanz für P1.2 |
|-------|------------------|
| FW-MOD-001 (main.cpp) | Gesamte State-Machine-Logik, setup()/loop()-Ablauf |
| FW-MOD-056 (system_types.h) | SystemState-Enum mit allen 15 Zuständen |
| FW-MOD-037 (runtime_readiness_policy) | CONFIG_PENDING → OPERATIONAL Exit-Gate |
| FW-MOD-035 (config_manager) | Lädt/speichert SystemState in NVS |
| FW-MOD-039 (provision_manager) | Provisioning-State-Machine (7 States) |
| FW-MOD-006 (communication_task) | WiFi/MQTT-Connect-Sequenz |
| FW-MOD-013 (command_admission) | State-abhängige Befehlsfilterung |

**Offene P1.2-Fragen:**
1. Wann genau findet der Übergang STATE_MQTT_CONNECTED → STATE_AWAITING_USER_CONFIG statt?
2. Gibt es einen expliziten STATE_OPERATIONAL → STATE_SAFE_MODE-Übergang (außer Emergency-Stop)?
3. Wie verhält sich die State-Machine bei simultanen WiFi-Disconnect + Config-Push?

### Kernmodule für Sensorhandling (P1.3)

| Modul | Relevanz für P1.3 |
|-------|------------------|
| FW-MOD-014 (sensor_manager) | performAllMeasurements, Value-Cache, Circuit-Breaker |
| FW-MOD-017 (ds18b20_driver) | OneWire-Mehrsensor-Adressierung (ROM-Code) |
| FW-MOD-018 (sht31_driver) | Multi-Value-Splitting (temp + humidity) |
| FW-MOD-048 (i2c_bus) | Protocol-aware Reading, CRC-Validierung |
| FW-MOD-049 (onewire_bus) | ROM-Scan, DallasTemperature-Library |
| FW-MOD-022 (sensor_registry) | Sensor-Type → SensorCapability-Mapping |
| FW-MOD-016 (pi_enhanced_processor) | RAW → Preview-Wert-Konvertierung |

**Offene P1.3-Fragen:**
1. NB6-Bug: Sensor-Key-Format `{gpio}_{sensor_type}` überschreibt bei 2+ gleichen Sensor-Typen auf demselben GPIO. Wie viele Stellen im Code sind betroffen?
2. NB10: SHT31 Multi-Value-Split fehlt im Individual-Add-Pfad. Wie unterscheiden sich batch-create und individual-add?
3. Wie genau funktioniert der per-Sensor Circuit-Breaker (CB_MAX_CONSECUTIVE_FAILURES-Wert)?
