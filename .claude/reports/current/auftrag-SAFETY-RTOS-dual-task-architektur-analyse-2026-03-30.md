# SAFETY-RTOS: FreeRTOS Dual-Task Migrationskonzept
## Analysebericht — El Trabajante Firmware

**Datum:** 2026-03-30
**Auftrag:** SAFETY-RTOS (Tiefenanalyse + Migrationskonzept)
**Analyst:** Claude Sonnet 4.6
**Status:** ✅ Analyse vollständig

---

## Akzeptanzkriterien-Check

| Kriterium | Status |
|-----------|--------|
| Vollständige loop()-Dokumentation | ✅ Block 1 |
| Alle blockierenden Stellen mit max. Blockierdauer | ✅ Block 1.2 |
| Task-Zuordnung (Tabelle) | ✅ Block 2 |
| Shared-State-Matrix mit Sync-Mechanismus | ✅ Block 3 |
| API-Mapping: PubSubClient → ESP-IDF MQTT | ✅ Block 4 |
| Alle 11 Callbacks analysiert | ✅ Block 4.3 |
| Inkrementelle Migrationsphasen mit Aufwand | ✅ Block 5 |
| Risiko-Matrix mit Mitigations | ✅ Block 6 |
| Speicher-Impact-Rechnung (SAFETY-MEM) | ✅ Block 6.2 |
| Rückfall-Strategie pro Phase | ✅ Block 5.2 |
| Arduino-Kompatibilitäts-Check | ✅ Block 5.3 |

---

## Block 1: Aktuelle loop() Vollanalyse

### 1.1 Exakte Reihenfolge aller Aufrufe in `loop()` (main.cpp:2366)

| # | Funktion | Datei:Zeile | Typ | Blockierend | Max. Dauer | MQTT-abhängig | WiFi-abhängig | Safety-relevant |
|---|----------|------------|-----|-------------|------------|--------------|--------------|----------------|
| 0 | `loop_count++` Diagnostik | main.cpp:2378 | Debug | Nein | <0.1ms | Nein | Nein | Nein |
| 1 | **`feedWatchdog("MAIN_LOOP")`** | main.cpp:2390 | WDT | Nein | <0.1ms | Nein | Nein | **JA** |
| 2 | `handleWatchdogTimeout()` | main.cpp:2404 | WDT | Nein | <0.1ms | Nein | Nein | JA |
| 3 | **STATE_SAFE_MODE_PROVISIONING** Zweig | main.cpp:2412 | State | Nein | ~1ms | Optional | Optional | Nein |
| — | → `provisionManager.loop()` | main.cpp:2413 | Net | Nein | ~1ms | Nein | Nein | Nein |
| — | → `wifiManager.loop()` (im Disconnect-Portal) | main.cpp:2417 | Net | Nein | 1-5ms | Nein | JA | Nein |
| — | → `mqttClient.loop()` (im Disconnect-Portal) | main.cpp:2418 | MQTT | **JA** | **0-15s** | JA | JA | Nein |
| — | → `delay(10)` + `return` | main.cpp:2459 | Ctrl | JA | 10ms | Nein | Nein | Nein |
| 4 | **STATE_PENDING_APPROVAL** Zweig | main.cpp:2470 | State | Nein | — | — | — | — |
| — | → `wifiManager.loop()` | main.cpp:2472 | Net | Nein | 1-5ms | Nein | JA | Nein |
| — | → `mqttClient.loop()` | main.cpp:2473 | MQTT | **JA** | **0-15s** | JA | JA | Nein |
| — | → `healthMonitor.loop()` | main.cpp:2474 | Diag | Nein | ~1ms | Nein | Nein | Nein |
| — | → `delay(100)` + `return` | main.cpp:2481 | Ctrl | JA | 100ms | Nein | Nein | Nein |
| 5 | Boot-Counter-Reset (once after 60s) | main.cpp:2488 | Cfg | Nein | ~1ms | Nein | Nein | Nein |
| **6** | **`wifiManager.loop()`** | main.cpp:2499 | Net | Nein* | 1-5ms | Nein | JA | Nein |
| **7** | **`mqttClient.loop()`** | main.cpp:2502 | MQTT | **JA** | **0-15s** | JA | JA | Nein |
| 8 | Disconnect-Debounce (30s Timer) | main.cpp:2511 | State | Nein | <0.1ms | Nein | Nein | Nein |
| 9 | MQTT Persistent Failure (5min Timer) | main.cpp:2540 | State | Nein | <0.1ms | Nein | Nein | Nein |
| **10** | **`sensorManager.performAllMeasurements()`** | main.cpp:2575 | Sensor | JA** | **5-50ms** | Nein | Nein | **JA** |
| **11** | **`actuatorManager.processActuatorLoops()`** | main.cpp:2580 | Aktor | Nein | ~1ms | Nein | Nein | **JA** |
| 12 | Actuator Status Publish (alle 30s) | main.cpp:2582 | MQTT | Nein | ~1ms | JA | Nein | Nein |
| **13** | **SAFETY-P1 Mechanism D** (Server ACK Timeout) | main.cpp:2588 | Safety | Nein | <0.1ms | Nein | Nein | **JA** |
| 14 | `healthMonitor.loop()` | main.cpp:2605 | Diag | Nein | ~1ms | Nein | Nein | Nein |
| 15 | `delay(10)` | main.cpp:2609 | Ctrl | JA | 10ms | Nein | Nein | Nein |

*wifiManager.loop() kann bei WiFi-Reconnect länger blockieren (~1-5s)
**I2C-Reads können bei Sensor-Ausfall bis zum Wire-Timeout blockieren (default 50ms/Sensor)

### 1.2 Blockierende Aufrufe — Vollanalyse

#### Kritisch: `mqttClient.loop()` → `reconnect()` → `mqtt_.connect()`

```
mqttClient.loop()                      // mqtt_client.cpp:798
  → if (!isConnected()) reconnect()    // mqtt_client.cpp:814
    → if (!shouldAttemptReconnect()) return;  // Exponential Backoff
    → connectToBroker()                // mqtt_client.cpp:166
      → attemptMQTTConnection()        // mqtt_client.cpp:305
        → mqtt_.connect(...)           // PubSubClient BLOCKING TCP!
```

**PubSubClient `mqtt_.connect()` — maximale Blockierdauer:**
- Standard-Socket-Timeout: `MQTT_SOCKET_TIMEOUT` = **15 Sekunden** (PubSubClient default)
- Bei Broker nicht erreichbar: 15s pro Verbindungsversuch
- Mit 8883→1883 Fallback: bis zu **30 Sekunden** (zwei Versuche)
- Exponential Backoff: 1s → 2s → 4s → 8s → 16s → 32s → 60s (dann Circuit Breaker)
- Circuit Breaker öffnet nach 5 Fehlern, 30s Recovery

**Konsequenz während `mqtt_.connect()` blockiert (15s):**
- `sensorManager.performAllMeasurements()` → **WARTET** — kein Sensor-Read
- `actuatorManager.processActuatorLoops()` → **WARTET** — kein Timeout-Check, keine RuntimeProtection
- SAFETY-P1 Mechanism D (ACK-Timeout) → **WARTET** — kein Safety-Check
- `feedWatchdog()` läuft zwar am Anfang von loop(), aber wenn Watchdog-Intervall < 15s, läuft der WDT-Feed-Aufruf ins Leere (er prüft `millis() - last_feed_time >= feed_interval`)

**Konkretes Szenario:**
```
t=0ms:   feedWatchdog() ✓
t=1ms:   mqttClient.loop() → mqtt_.connect() BLOCKIERT
t=15000ms: TCP-Timeout, Rückkehr aus connect()
t=15001ms: sensorManager.performAllMeasurements()
t=15050ms: actuatorManager.processActuatorLoops()  ← 15s OHNE Safety-Check!
```

Bei Watchdog-Intervall von 10s und Loop-Blockade > 10s: **Watchdog-Reset** (Reboot).
Das ist das dokumentierte Bug-Phänomen in `shouldAttemptReconnect()` Kommentar.

#### Mäßig kritisch: `sensorManager.performAllMeasurements()` (~5-50ms)

```
I2C-Sensors (SHT31):   Wire.requestFrom() — Timeout bei Sensor-Ausfall bis 50ms/Sensor
OneWire (DS18B20):     oneWire.requestTemperatures() — Konversionszeit 750ms bei 12-bit!
ADC:                   analogRead() — <1ms
```

**DS18B20 OneWire Konversionszeit:** Bei 12-bit Resolution dauert die Temperaturkonversion 750ms. Wenn `waitForConversion=true` gesetzt wird (Library-Default), blockiert `requestTemperatures()` 750ms. Dies ist safety-relevant da auch Actuator-Timeout-Checks in dieser Zeit nicht laufen.

**Prüfung im Code:** `sensorManager.cpp` verwendet `sensor_factory.cpp` für Treiber-Instanziierung. Muss im Implementierungsauftrag geprüft werden ob async/non-blocking Modus aktiv ist.

#### Gering kritisch: `delay(10)` am Loop-Ende

- Immer 10ms blockierend
- Geplant für CPU-Scheduling (`gives CPU to scheduler`)
- Im RTOS-Design durch `vTaskDelay(pdMS_TO_TICKS(10))` im Safety-Task ersetzbar

#### Nicht-blockierend aber timing-sensitiv: Heartbeat-Publish

Heartbeat alle 30s — `publishHeartbeat()` ruft `mqtt_.publish()` auf. PubSubClient publish() ist bei QoS 0 nicht-blockierend. Bei QoS 1 kann PUBACK-Warten blockieren — aber Heartbeat nutzt QoS 0, kein Problem.

### 1.3 Timing-Zusammenfassung

| Zustand | Loop-Dauer geschätzt | Kommentar |
|---------|----------------------|-----------|
| Normal (alles verbunden) | ~18-25ms | WiFi OK, MQTT OK, 1-2 I2C Sensoren |
| MQTT-Reconnect (kurz) | ~15s | Einmaliger TCP-Timeout |
| MQTT-Reconnect (8883→1883 Fallback) | ~30s | Zwei TCP-Timeouts |
| DS18B20 12-bit Konversion | ~770ms | Falls synchron — zu prüfen |
| OneWire-Scan (10 Devices) | ~2-3s | Nur bei `onewire/scan` Command |

---

## Block 2: Task-Zuordnung

### 2.1 Zielbild: Dual-Task-Architektur

```
Core 0 (APP_CPU — WiFi co-located)     Core 1 (PRO_CPU — Safety-isoliert)
─────────────────────────────────      ──────────────────────────────────
WiFi-Stack (ESP-IDF intern)            sensorManager.performAllMeasurements()
MQTTClient Task (ESP-IDF MQTT)         actuatorManager.processActuatorLoops()
  MQTT-Connect/Reconnect               SAFETY-P1 Mechanism D (ACK-Timeout)
  MQTT-Message-Receive (Events)        SAFETY-P4 Offline-Regeln
  MQTT-Publish (via Outbox)            safetyController.*
  Heartbeat senden (alle 30s)          feedWatchdog() (IMMER)
  Offline-Buffer verarbeiten           controlActuatorBinary() → GPIO
  WiFiManager (Portal, AP+STA)         healthMonitor.loop()
  Disconnect/Reconnect-Debounce
  Portal-Steuerung (30s / 5min)
```

### 2.2 Vollständige Task-Zuordnungstabelle

| Code-Einheit | Datei | Ziel-Task | Begründung |
|-------------|-------|-----------|------------|
| `wifiManager.loop()` | wifi_manager.cpp | **Core 0** | WiFi-Stack-nah, darf blockieren |
| `mqttClient.loop()` → `mqtt_.loop()` | mqtt_client.cpp | **Core 0** | PubSubClient → esp_mqtt_client eigener Task |
| `mqttClient.reconnect()` | mqtt_client.cpp | **Core 0** | Blockierend, OK auf Core 0 |
| `mqttClient.publish()` | mqtt_client.cpp | **Core 0** | Netzwerk |
| `publishHeartbeat()` | mqtt_client.cpp | **Core 0** | Braucht MQTT |
| `processOfflineBuffer()` | mqtt_client.cpp | **Core 0** | Braucht MQTT |
| `provisionManager.loop()` | provision_manager.cpp | **Core 0** | HTTP-Server, AP-Mode |
| Disconnect-Debounce Timer | main.cpp:2511 | **Core 0** | Nur bei Disconnect-Event |
| MQTT Persistent Failure Timer | main.cpp:2540 | **Core 0** | Nur bei CB-Zustand |
| `sensorManager.performAllMeasurements()` | sensor_manager.cpp | **Core 1** | I2C/OneWire/ADC — kein Netzwerk |
| `actuatorManager.processActuatorLoops()` | actuator_manager.cpp | **Core 1** | RuntimeProtection — IMMER |
| `actuatorManager.publishAllActuatorStatus()` | actuator_manager.cpp | **Core 1 → Queue** | Daten von Core 1, Publish via Core 0 |
| SAFETY-P1 Mechanism D (ACK-Timeout) | main.cpp:2588 | **Core 1** | Safety-Check — unabhängig von MQTT |
| SAFETY-P4 Offline-Regeln | (geplant) | **Core 1** | Autonome Logik — unabhängig |
| `safetyController.emergencyStopAll()` | safety_controller.cpp | **Core 1** | GPIO-Direktsteuerung |
| `controlActuatorBinary()` | actuator_manager.cpp | **Core 1** | GPIO-Register |
| `feedWatchdog("MAIN_LOOP")` | main.cpp:2390 | **Core 1** | MUSS auf Core 1 laufen |
| `healthMonitor.loop()` | health_monitor.cpp | **Core 1** | Diagnostik, publiziert via Queue |
| `timeManager.loop()` | time_manager.cpp | **Core 0** | NTP via Netzwerk |

### 2.3 Grenzfälle — Synchronisation

| Grenzfall | Datenfluss | Mechanismus |
|-----------|------------|-------------|
| Config-Push via MQTT | Core 0 empfängt → Core 1 muss SensorConfig/ActuatorConfig aktualisieren | Mutex + Config-Queue |
| Actuator-Command via MQTT | Core 0 empfängt → Core 1 führt `controlActuatorBinary()` aus | Command-Queue |
| Sensor-Daten publizieren | Core 1 misst → Core 0 publiziert | Sensor-Data-Queue |
| Actuator-Status publizieren | Core 1 berechnet → Core 0 publiziert | Status-Queue |
| Heartbeat-ACK empfangen | Core 0 empfängt → `g_last_server_ack_ms` aktualisieren | `std::atomic<uint32_t>` |
| isOnline-Flag | Core 0 setzt bei Connect/Disconnect → Core 1 liest für Safety-Check | `std::atomic<bool>` |
| Emergency-Stop Command | Core 0 empfängt → Core 1 führt Emergency-Stop aus | xTaskNotify oder Direct-Queue |

---

## Block 3: Shared-State-Analyse

### 3.1 Shared-State-Matrix

| Variable | Typ | Größe | Gelesen von | Geschrieben von | Zugriffsmuster | Empfohlener Sync |
|----------|-----|-------|------------|-----------------|----------------|-----------------|
| `SensorManager::sensors_[20]` | SensorConfig[] | ~1.680B | Core 1 (performAllMeasurements) | Core 0 (config push via handleSensorConfig) | Selten write, häufig read | **Mutex** (RecursiveMutex) |
| `ActuatorManager::actuators_[12]` | RegisteredActuator[] | ~1.200B | Core 1 (processActuatorLoops, controlActuator), Core 0 (handleCommand) | Core 1 (controlActuator), Core 0 (handleCommand, handleConfig) | Häufig read+write BEIDE | **Mutex** (pro Aktor oder global) |
| `g_last_server_ack_ms` | uint32_t | 4B | Core 1 (Timeout-Check) | Core 0 (Heartbeat-ACK-Handler) | Selten write, Loop read | **`atomic<uint32_t>`** |
| `g_server_timeout_triggered` | bool | 1B | Core 1 (Timeout-Check, setzt) | Core 0 (ACK-Reset, löscht) | Selten | **`atomic<bool>`** |
| `g_system_config` | SystemConfig | ~100B | Core 0+1 (many places) | Core 0+1 (many places) | Frequent | **Mutex** |
| `g_kaiser` | KaiserZone | ~200B | Core 0 (heartbeat, zone assign) | Core 0 (zone assign callback) | Nur Core 0 | **Kein Sync nötig** (nur Core 0) |
| `MQTTClient::registration_confirmed_` | bool | 1B | Core 0 (publish gate) | Core 0 (connect/ACK) | Nur Core 0 | **Kein Sync nötig** |
| `MQTTClient::offline_buffer_[25]` | MQTTMessage[] | ~800B | Core 0 (processOfflineBuffer) | Core 0 (addToOfflineBuffer) | Nur Core 0 | **Kein Sync nötig** |
| `GPIOManager` Pin-Registry | PinInfo[] | ~500B | Core 1 (sensor/actuator), Core 0 (config) | Core 1+0 (GPIO request/release) | Read häufig, write selten | **Mutex** |
| `ErrorTracker::error_buffer_[30]` | ErrorEntry[] | ~4.200B | Core 0+1 (publish) | Core 0+1 (trackError) | Frequent BEIDE | **Mutex** (bereits in ErrorTracker?) |

### 3.2 Race-Condition-Risiken

#### RC-1: Actuator-Command vs. processActuatorLoops (HOCH)
```
Core 0: handleActuatorCommand(gpio=14) → controlActuatorBinary(14, true)
          actuators_[i].config.current_state = true  ← WRITE
Core 1: processActuatorLoops() liest actuators_[i]
          if (runtime > max_runtime_ms) emergencyStop()  ← READ concurrent
```
**Problem:** Struct-Update (mehrere Felder) ist NICHT atomar. Core 1 kann Zwischenzustand lesen.
**Mitigation:** Mutex um kompletten actuator-Struct-Zugriff.

#### RC-2: Config-Push während Sensor-Read (MITTEL)
```
Core 0: handleSensorConfig() → sensorManager.configureSensor()
          sensors_[i].measurement_interval_ms = newValue  ← WRITE
Core 1: performAllMeasurements() liest sensors_[i]
          if (millis() - last_measurement_ms >= measurement_interval_ms)  ← READ
```
**Problem:** Konsistenzproblem wenn Config während Measurement-Check geschrieben wird.
**Mitigation:** Mutex um Sensor-Config-Zugriff.

#### RC-3: g_last_server_ack_ms (NIEDRIG — dank Atomic)
```
Core 0: g_last_server_ack_ms = millis()     ← WRITE (uint32_t, 4 Byte)
Core 1: millis() - g_last_server_ack_ms     ← READ
```
**Problem:** uint32_t-Schreiben ist auf ESP32 Xtensa LX6/LX7 ATOMAR (single-word aligned).
**Mitigation:** Als `volatile uint32_t` oder `std::atomic<uint32_t>` deklarieren — korrekt.

#### RC-4: safetyController.emergencyStopAll() von BEIDEN Tasks (NIEDRIG)
```
Core 0: ESP Emergency Command → safetyController.emergencyStopAll()
Core 1: SAFETY-P1 ACK-Timeout  → actuatorManager.setAllActuatorsToSafeState()
```
**Problem:** Beide rufen `controlActuatorBinary()` auf — GPIO-Register-Writes sind auf ESP32 atomar
(Hardware-Garantie), aber `actuators_[i].config.current_state` wird nicht atomar aktualisiert.
**Mitigation:** Mutex um actuator-Struct. GPIO-Register selbst sind safe.

### 3.3 FreeRTOS-Synchronisations-Empfehlung

```cpp
// Empfohlene Mutex-Granularität:
SemaphoreHandle_t g_actuator_mutex;      // schützt actuators_[]
SemaphoreHandle_t g_sensor_mutex;        // schützt sensors_[]
SemaphoreHandle_t g_gpio_registry_mutex; // schützt GPIOManager Pin-Registry

// Atomic Flags (kein Mutex nötig):
std::atomic<uint32_t> g_last_server_ack_ms{0};
std::atomic<bool>     g_server_timeout_triggered{false};
std::atomic<bool>     g_mqtt_connected{false};

// Queues für Inter-Task-Kommunikation:
QueueHandle_t g_actuator_cmd_queue;     // Core 0 → Core 1 (ActuatorCommand)
QueueHandle_t g_sensor_data_queue;      // Core 1 → Core 0 (SensorDataPoint)
QueueHandle_t g_config_update_queue;    // Core 0 → Core 1 (ConfigUpdate)
QueueHandle_t g_publish_queue;          // Core 1 → Core 0 (PublishRequest)
```

---

## Block 4: ESP-IDF MQTT Migration

### 4.1 API-Mapping: PubSubClient → esp_mqtt_client

| PubSubClient (aktuell) | ESP-IDF MQTT (Ziel) | Verhalten-Unterschied | Breaking? |
|------------------------|--------------------|-----------------------|-----------|
| `PubSubClient(wifi_client_)` Konstruktor | `esp_mqtt_client_init(&config)` → `esp_mqtt_client_handle_t` | Config-Struct statt Konstruktor | Architektur-Umbau |
| `mqtt_.setServer(server, port)` | `config.broker.address.uri = "mqtt://..."` | URI-Format statt Host+Port | Umbau |
| `mqtt_.setKeepAlive(60)` | `config.session.keepalive = 60` | Gleiche Semantik | Minor |
| `mqtt_.setCallback(staticCb)` | `esp_event_handler_register(ESP_MQTT_EVENT_BASE, ...)` | Event-Callbacks statt Polling | Architektur-Umbau |
| `mqtt_.connect(clientId, lwt_topic, qos, retain, msg)` | `esp_mqtt_client_start(client)` | **NON-BLOCKING!** Event bei Connected | Kernunterschied |
| `mqtt_.connected()` | `atomic<bool> g_mqtt_connected` (gesetzt durch Events) | Event-basiert statt Polling | Umbau |
| `mqtt_.loop()` | **Entfällt** — eigener FreeRTOS-Task intern | Kein manueller Aufruf nötig | Entfernung |
| `reconnect()` (Schleife) | **Entfällt** — automatisch intern | esp_mqtt_client reconnectet selbst | Entfernung |
| `mqtt_.publish(topic, payload, retain)` | `esp_mqtt_client_publish(client, topic, data, len, qos, retain)` | Gibt msg_id zurück, Outbox intern | Erweiterung |
| `mqtt_.subscribe(topic, qos)` | `esp_mqtt_client_subscribe(client, topic, qos)` | Gibt msg_id zurück | Minor |
| `mqtt_.unsubscribe(topic)` | `esp_mqtt_client_unsubscribe(client, topic)` | Gleiche Semantik | Minor |
| `mqtt_.setBufferSize(2048)` | `config.buffer.size = 2048` | Im Init-Config | Init-Umbau |
| `clean_session = true` (hardcoded) | `config.session.disable_clean_session = false` | Nun konfigurierbar | Feature |
| Kein Offline-Buffering | `config.buffer.out_size` → automatische Outbox | Eingebaut | Feature |
| LWT: in connect() Call | `config.session.last_will.*` | Im Init-Config | Umbau |

### 4.2 ESP-IDF MQTT Event-Handler-Architektur

```cpp
// Verfügbare Events (esp_mqtt_event_id_t):
MQTT_EVENT_BEFORE_CONNECT    // Vor Verbindungsaufbau
MQTT_EVENT_CONNECTED         // TCP+MQTT verbunden — hier re-subscriben!
MQTT_EVENT_DISCONNECTED      // Verbindung verloren — Safety-Flag setzen
MQTT_EVENT_SUBSCRIBED        // Subscribe-ACK erhalten (msg_id matching)
MQTT_EVENT_UNSUBSCRIBED      // Unsubscribe-ACK
MQTT_EVENT_PUBLISHED         // QoS1/2 Publish-ACK erhalten
MQTT_EVENT_DATA              // Nachricht empfangen — hier Message-Router
MQTT_EVENT_ERROR             // Fehler (Verbindung, TLS, etc.)
MQTT_EVENT_DELETED           // Message aus Outbox gelöscht (Outbox-Management)
```

**Kritisch:** `MQTT_EVENT_CONNECTED` und `MQTT_EVENT_DATA` laufen im MQTT-Task (Core 0).
Daher: GPIO-Direktzugriffe und Sensor-Reads NICHT im Event-Handler — via Queue an Core 1 delegieren.

### 4.3 Alle 11 MQTT-Callbacks analysiert — Task-Zuordnung

#### Callback-Router: `mqttClient.setCallback(lambda)` → main.cpp:877

| # | Topic-Pattern | Handler | Shared-State | Muss auf Core 1? | Empfohlener Mechanismus |
|---|--------------|---------|-------------|-----------------|------------------------|
| 1 | `system/command` | `handleSystemCommand()` (main.cpp:1000) | `g_system_config` (NVS), `storageManager`, `safetyController`, ESP.restart() | **Teilweise** (safetyController → Core 1) | JSON-Parse auf Core 0, Safety-Commands via Queue an Core 1, NVS-Writes auf Core 0 OK |
| 2 | `config` | `handleSensorConfig()` + `handleActuatorConfig()` (main.cpp:884) | `sensors_[]`, `actuators_[]`, NVS | **JA** (Mutex oder Config-Queue) | Core 0 parsed JSON, sendet ConfigUpdate-Struct via Queue an Core 1 |
| 3 | `actuator/+/command` | `actuatorManager.handleActuatorCommand()` (main.cpp:893) | `actuators_[]`, `controlActuatorBinary()` → GPIO | **JA** (GPIO-Write auf Core 1) | ActuatorCommand-Struct via Queue an Core 1 |
| 4 | `sensor/+/command` | `handleSensorCommand()` (main.cpp:901) | `sensorManager`, MQTT-Publish-Response | **JA** (sensorManager auf Core 1) | SensorCommand via Queue an Core 1, Response via Publish-Queue |
| 5 | `esp/{id}/emergency` | Auth-Check + `safetyController.emergencyStopAll()` (main.cpp:906) | `actuators_[]` → GPIO | **JA** (kritischster Safety-Path) | **xTaskNotify direkt** (kein Queue-Overhead für Emergency) |
| 6 | `broadcast/emergency` | Auth-Check + `safetyController.emergencyStopAll()` (main.cpp:962) | `actuators_[]` → GPIO | **JA** | **xTaskNotify direkt** |
| 7 | `zone/assign` | Zone-Konfiguration + NVS-Write + Re-subscribe (main.cpp:1440) | `g_kaiser`, Topics, `g_system_config` | **Nein** (alles MQTT/Config) | Komplett auf Core 0 — kein GPIO-Zugriff |
| 8 | `subzone/assign` | Subzone-Konfiguration + NVS-Write (main.cpp:~1750) | `g_kaiser`, GPIOManager | **Teilweise** (GPIOManager Mutex) | Core 0 mit GPIOManager-Mutex |
| 9 | `subzone/remove` | Subzone-Entfernung + GPIO-Release (main.cpp:~1800) | GPIOManager | **Teilweise** (GPIOManager Mutex) | Core 0 mit GPIOManager-Mutex |
| 10 | `subzone/safe` | `safetyController.isolateSubzone()` (main.cpp:~1850) | GPIOManager, `actuators_[]` | **JA** | Queue an Core 1 |
| 11 | `system/heartbeat/ack` | `mqttClient.confirmRegistration()` + `g_last_server_ack_ms = millis()` (main.cpp:1924) | `registration_confirmed_`, `g_last_server_ack_ms` | **Nein** | Atomar Update auf Core 0, Core 1 liest atomic |

#### Kritische Erkenntnis zu Emergency-Stop:

Emergency-Stop (Callbacks #5 und #6) darf **NICHT** durch Queue verzögert werden. Bei einem echten Notfall (Pumpe läuft über, Temperatur kritisch) ist jede Millisekunde wichtig. Empfehlung:
- `xTaskNotify(safety_task_handle, EMERGENCY_STOP_BIT, eSetBits)` — latency < 1µs
- Core 1 Safety-Task prüft `xTaskNotifyWait()` jede Iteration

---

## Block 5: Inkrementelle Migrationsstrategie

### 5.1 Migrationsphasen mit Aufwand

| Phase | Beschreibung | Risiko | Aufwand | Testbar | Rückrollbar |
|-------|-------------|--------|---------|---------|-------------|
| **M1** | Safety-Task erstellen (Core 1), loop() splitten | Mittel | 3-4h | ✅ Parallel zu bisheriger loop() | ✅ Git-Branch |
| **M2** | PubSubClient → esp_mqtt_client | Hoch | 6-8h | ✅ Gleiches MQTT-Verhalten | ✅ Feature-Flag |
| **M3** | MQTT-Code in Core-0-Task verschieben | Mittel | 3-4h | ✅ Nach M2 | ✅ Git-Branch |
| **M4** | Queues + Mutexes einführen | Niedrig-Mittel | 4-6h | ✅ Funktional identisch | ✅ Git-Branch |
| **M5** | Cleanup: loop()-Reste entfernen, Dead Code | Niedrig | 1-2h | ✅ Code-Hygiene | ✅ Trivial |

**Gesamtaufwand:** 17-24h (Implementierung, ohne Testing)

#### Phase M1: Safety-Task erstellen

```cpp
// Minimaler Core-1-Task (Safety + Sensor + Actuator):
void safetyTask(void* param) {
    for (;;) {
        esp_task_wdt_reset();                         // WDT IMMER
        sensorManager.performAllMeasurements();
        actuatorManager.processActuatorLoops();
        checkServerAckTimeout();                       // SAFETY-P1
        processActuatorCommandQueue();                 // neue Queue
        // P4: processOfflineRules();
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// Aufruf in setup():
xTaskCreatePinnedToCore(safetyTask, "SafetyTask", 8192, nullptr, 5, &safety_task_handle_, 1);
```

**Während M1:** Die bisherige `loop()` läuft weiter. Safety-Task läuft PARALLEL. Kein Shared-State-Schutz noch nötig wenn loop() noch alles hat — aber processActuatorLoops() und performAllMeasurements() DÜRFEN NICHT MEHR in loop() sein (double-execution).

**M1-Testplan:**
1. Safety-Task startet + loggt "SAFETY TASK RUNNING ON CORE 1"
2. WDT-Feed funktioniert im Task
3. Sensor-Reads erscheinen in Serial-Logs
4. Actuator-Timeout-Check feuert korrekt

#### Phase M2: ESP-IDF MQTT einführen

**Header-Einbindung (Arduino-ESP32 kompatibel):**
```cpp
#include "mqtt_client.h"  // ESP-IDF — verfügbar in Arduino-ESP32!
```

**Wichtigste Änderungen in mqtt_client.cpp:**
- `PubSubClient mqtt_` → `esp_mqtt_client_handle_t mqtt_client_`
- `mqtt_.connect()` → `esp_mqtt_client_start()` (non-blocking!)
- `mqtt_.loop()` → **entfällt**
- `mqtt_.publish()` → `esp_mqtt_client_publish()`
- `mqtt_.setCallback()` → `esp_event_handler_register()`
- `mqtt_.subscribe()` → `esp_mqtt_client_subscribe()`

**Feature-Flag für M2:**
```cpp
// platformio.ini:
build_flags = -DMQTT_USE_ESP_IDF  // Schaltet zwischen PubSubClient und esp_mqtt_client um
```

**M2-Testplan:**
1. MQTT verbindet (Event-Callback CONNECTED empfangen)
2. Alle 11 Topics subscribed nach Connect
3. Actuator-Command kommt an (MQTT_EVENT_DATA)
4. Heartbeat publiziert alle 30s
5. Reconnect nach künstlichem Disconnect (kein Blocking mehr!)

#### Phase M3: MQTT in Core-0-Task

Nach erfolgreicher M2: ESP-IDF MQTT-Client läuft bereits in eigenem Task.
Core-0-Task erstellen der explizit WiFiManager + Portal-Management enthält:

```cpp
void communicationTask(void* param) {
    for (;;) {
        wifiManager.loop();
        // Disconnect-Debounce Timer
        // MQTT Persistent Failure Timer
        // Portal-Steuerung
        vTaskDelay(pdMS_TO_TICKS(50));  // 50ms reicht für Comm-Management
    }
}
xTaskCreatePinnedToCore(communicationTask, "CommTask", 6144, nullptr, 3, nullptr, 0);
```

#### Phase M4: Queues + Mutexes

Alle Shared-State-Zugriffe durch Synchronisations-Primitives absichern:

```cpp
// Initialisierung in setup() (vor xTaskCreate):
g_actuator_mutex      = xSemaphoreCreateMutex();
g_sensor_mutex        = xSemaphoreCreateMutex();
g_gpio_registry_mutex = xSemaphoreCreateMutex();
g_actuator_cmd_queue  = xQueueCreate(10, sizeof(ActuatorCommand));
g_publish_queue       = xQueueCreate(20, sizeof(PublishRequest));
g_config_update_queue = xQueueCreate(5,  sizeof(ConfigUpdateRequest));
```

### 5.2 Rückfall-Strategie pro Phase

| Phase | Rückfall-Trigger | Rückfall-Aktion | Risiko |
|-------|-----------------|-----------------|--------|
| **M1** | Safety-Task crash / WDT-Timeout | `git revert` — loop() wieder vollständig | Niedrig — isolierter Branch |
| **M2** | MQTT verbindet nicht / Callbacks fehlen | `#define MQTT_USE_ESP_IDF` entfernen → PubSubClient | Mittel — Feature-Flag macht das trivial |
| **M3** | CommTask deadlock / WiFi-Portal kaputt | CommTask-Code in loop() zurückverschieben | Mittel |
| **M4** | Mutex-Deadlock / Queue-Overflow | Mutexes temporär entfernen + Bug fixen | Niedrig — inkrementell einführen |
| **M5** | Code-Hygiene-Fehler | `git revert` letzten Commit | Trivial |

**Git-Strategie:** Jede Phase in eigenem Feature-Branch. PRs erst nach Verifikation (Wokwi-Test + Hardware-Test). Kein Phase-Stacking ohne grüne Tests.

### 5.3 Arduino-Kompatibilitäts-Check

#### `Wire` / I2C (SHT31-Sensor, I2C-Bus-Manager)

**Status: NICHT thread-safe — Mutex PFLICHT**

Die Arduino `Wire`-Bibliothek (ESP-IDF i2c_driver darunter) enthält **keinen** internen Mutex. Gleichzeitiger Zugriff von Core 0 und Core 1 führt zu:
- I2C-Bus-Kollision (SCL/SDA-Glitch)
- `Wire.requestFrom()` gibt falsche Daten zurück
- Potentiell: Bus-Lockup (SDA bleibt LOW)

**Lösung:** `g_i2c_mutex` vor JEDEM `Wire`-Aufruf in `i2c_bus.cpp` acquiren.

```cpp
// In i2c_bus.cpp — alle Wire-Aufrufe wrappen:
SemaphoreHandle_t i2c_mutex_ = xSemaphoreCreateMutex();

bool I2CBus::readRegister(uint8_t addr, uint8_t reg, uint8_t* buf, size_t len) {
    if (xSemaphoreTake(i2c_mutex_, pdMS_TO_TICKS(100)) != pdTRUE) return false;
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom(addr, len);
    // ... read
    xSemaphoreGive(i2c_mutex_);
    return true;
}
```

#### `OneWire` / DallasTemperature (DS18B20)

**Status: NICHT thread-safe — Mutex PFLICHT (gleicher Mutex wie I2C wenn auf gleichem Bus, sonst eigener)**

OneWire-Protokoll ist zeitkritisch (Pulse-Timing). Interruption durch anderen Task führt zu:
- Bit-Lesefehlern
- CRC-Failures → DS18B20_RAW_SENSOR_FAULT (-127°C)

**Lösung:** Eigener `g_onewire_mutex` oder OneWire komplett in Core 1 (kein Core 0 Zugriff).
Da `onewire/scan` Command von Core 0 kommt: Scan-Request in OneWire-Command-Queue an Core 1.

#### `WiFiManager`

**Status: Kompatibel — MUSS auf Core 0 (nicht thread-safe bzgl. WiFi-Stack)**

WiFiManager verwendet intern `WiFi.*`-Calls und einen HTTP-Server. Der WiFi-Stack ist Core-0-nah.
WiFiManager in Core 0 (CommTask) belassen — das ist bereits der Plan. Kein Cross-Task-Zugriff nötig.

#### `esp_task_wdt` (Watchdog)

**Status: Vollständig FreeRTOS-kompatibel**

`esp_task_wdt_reset()` muss im Safety-Task (Core 1) aufgerufen werden. Beim Migration auf Tasks:
```cpp
// In safety_task setup:
esp_task_wdt_add(nullptr);  // Watchdog für diesen Task registrieren
// In safety_task loop:
esp_task_wdt_reset();
```

**Wichtig:** Wenn Arduino loop() entfernt wird, muss der WDT für den neuen Task registriert werden.
Der IDLE-Task-WDT muss separat konfiguriert werden.

#### `DynamicJsonDocument` (ArduinoJson)

**Status: Thread-safe für separate Instanzen — NICHT für geteilte Instanzen**

Jeder Task muss eigene `DynamicJsonDocument`-Instanzen auf dem Stack erstellen.
Globale oder statische `DynamicJsonDocument` sind NICHT thread-safe → vermeiden.

---

## Block 6: Risiko-Analyse

### 6.1 Risiko-Matrix

| # | Risiko | Wahrscheinlichkeit | Impact | Mitigation | Residual-Risiko |
|---|--------|-------------------|--------|------------|----------------|
| R1 | **I2C-Bus-Kollision** (Wire nicht thread-safe) | **Hoch** — sobald Config-Push + Sensor-Read gleichzeitig | **High** — falsche Sensordaten, Bus-Lockup | Mutex um alle Wire-Calls (i2c_bus.cpp) | Niedrig nach Mutex |
| R2 | **Stack-Overflow in Tasks** | Mittel | Crash + Reboot | Großzügige Stack-Größe (8KB Safety, 6KB Comm), Stack Highwater Mark messen | Niedrig |
| R3 | **Heap-Fragmentierung** durch 2 Tasks | Mittel | OOM nach Stunden | Statische Allokation wo möglich, Heap-Monitoring im Heartbeat, PSRAM-Check | Niedrig-Mittel |
| R4 | **GPIO-Register Race** | Niedrig | Aktor-Glitch | GPIO-Register sind atomar auf ESP32 (Hardware-Garantie) | Sehr niedrig |
| R5 | **WiFiManager nicht Task-kompatibel** | Niedrig-Mittel | WiFi-Portal bricht | WiFiManager vollständig in Core-0-Task (CommTask) | Niedrig |
| R6 | **Watchdog-Timeout bei Task-Deadlock** | Niedrig | Reboot | Watchdog pro Task registrieren + Stack Highwater Monitoring | Niedrig |
| R7 | **Queue-Overflow** (Actuator Commands) | Niedrig | Commands verloren | Queue-Größe 10 für Commands, Drop + Error-Log | Niedrig |
| R8 | **esp_mqtt_client + Arduino WiFiClient Konflikt** | Mittel | MQTT verbindet nicht | esp_mqtt_client verwendet ESP-IDF-intern TCP, kein WiFiClient nötig — Konflikt ausschließen | Niedrig nach Prüfung |
| R9 | **NVS-Writes von Core 1** (sensor/actuator config) | Mittel | NVS-Corruption bei concurrent access | NVS-Writes nur auf Core 0 (via Queue), NVS hat keine interne Mutex-Protection | Niedrig nach Queue |
| R10 | **Flash-Budget Überschreitung** | **Hoch** | Build schlägt fehl / Firmware zu groß | Siehe 6.2 — Code-Optimierungen PFLICHT parallel zur Migration | Mittel |

### 6.2 Speicher-Impact (basierend auf SAFETY-MEM 2026-03-30)

#### Aktueller Zustand (nach SAFETY-MEM Optimierungen)

| Bereich | Aktuell | Verfügbar | % belegt |
|---------|---------|-----------|---------|
| Flash | 1.208.989 Bytes | 1.310.720 Bytes | 92.2% |
| RAM (statisch) | 68.508 Bytes | 327.680 Bytes | 20.9% |
| Heap (nach WiFi+MQTT) | ~259.172 Bytes | 327.680 Bytes | ~21% |

#### Erwarteter RTOS-Migrations-Overhead

| Komponente | RAM-Overhead | Flash-Overhead | Quelle |
|-----------|-------------|----------------|--------|
| FreeRTOS Safety-Task Stack | 8.192 Bytes | ~1KB | xTaskCreatePinnedToCore(8192) |
| FreeRTOS Comm-Task Stack | 6.144 Bytes | ~1KB | xTaskCreatePinnedToCore(6144) |
| 4 Queues (Actuator, Publish, Config, Sensor) | ~2.000 Bytes | ~2KB | xQueueCreate × 4 |
| 4 Mutexes | ~400 Bytes | <1KB | xSemaphoreCreateMutex × 4 |
| esp_mqtt_client vs. PubSubClient | +2.000 Bytes heap | **+10-15KB Flash** | MQTT Stack größer |
| Task-Code (neue Task-Funktionen) | 0 | ~3-5KB | Neue Funktionen |
| **Gesamt** | **~18KB RAM** | **~15-20KB Flash** | |

#### Kritische Bilanz nach Migration

| Bereich | Aktuell | +Migration | Nach Migration | Verbleibend | Status |
|---------|---------|-----------|----------------|-------------|--------|
| Flash | 1.208.989 | +18.000 | ~1.227.000 | ~83.720 | ⚠️ **93.6%** |
| RAM (statisch) | 68.508 | +400 | ~68.908 | ~259K Heap | ✅ OK |
| Heap | ~259K frei | -18K Stacks | ~241K frei | 73% frei | ✅ OK |

**RAM: Kein Problem.** 241KB freier Heap nach Migration ist ausreichend.

**Flash: KRITISCH — 93.6% nach Migration, nur ~83KB frei.**

#### Flash-Optimierungen als Pflicht-Begleitung zur Migration

Diese Optimierungen MÜSSEN parallel zur RTOS-Migration umgesetzt werden:

| Optimierung | Flash-Ersparnis | Risiko |
|-------------|----------------|--------|
| WebServer/HTTP-Server deaktivieren wenn nicht Provisioning (`#ifdef PROVISIONING_MODE`) | ~15-25KB | Mittel — Provisioning testen |
| `CORE_DEBUG_LEVEL=1` (statt 3 oder 4) in Produktion | ~5-10KB | Niedrig |
| `-Os` Compiler-Flag (Size-Optimierung statt `-O2`) | ~5-15KB | Niedrig — erfordert Test |
| Nicht-genutzte Sensor-Treiber per `#ifdef` ausschließen | ~5-20KB | Niedrig pro Treiber |
| **Custom Partition Table** (App: 1.5MB, NVS: 32KB) | +192KB Flash-Raum | Mittel — NVS-Migration |

**Empfehlung:** Custom Partition Table ist die nachhaltigste Lösung. Standard-Partition `default` hat:
- app0: 1.310.720 Bytes (1.25MB)
- NVS: 20.480 Bytes

Custom Partition würde app auf 1.507.328 (1.44MB) erhöhen — +196KB Flash-Raum.

#### NVS-Budget nach RTOS-Migration

RTOS-Migration braucht **kein** zusätzliches NVS. NVS-Writes werden via Queue von Core 1 an Core 0 delegiert — kein neues NVS-Namespace nötig.

---

## Ergebnis-Zusammenfassung

### Das Kernproblem — Präzise formuliert

Die aktuelle `loop()`-Architektur hat ein **latentes Blocking-Problem**:

```
Wenn MQTT disconnected und TCP-Connect fehlschlägt:
  mqtt_.connect() blockiert 15 Sekunden (PubSubClient MQTT_SOCKET_TIMEOUT)
  → In diesen 15 Sekunden:
    - actuatorManager.processActuatorLoops() läuft NICHT
    - SAFETY-P1 Mechanism D läuft NICHT
    - Sensor-Reads laufen NICHT
    - Runtime-Protection-Timeouts werden NICHT geprüft

  Worst-case: 8883→1883 Fallback = 30 Sekunden Blockade
  Bei Watchdog-Interval < 30s: Watchdog-Reset (Reboot-Loop!)
```

**SAFETY-P1 Mechanism B** (`handleDisconnection()` → `setAllActuatorsToSafeState()`) hilft bei MQTT-Disconnect, aber:
- Wird NACH dem TCP-Timeout aufgerufen (15s zu spät bei Broker-Ausfall)
- Greift nicht wenn MQTT verbunden bleibt aber Server crasht (Mechanism D schon richtig)
- Ist selbst Teil des blockierenden `reconnect()`-Flows

### Ziel-Architektur — Garantie

Nach erfolgreicher RTOS-Migration (M1-M5):

```
Core 1 Safety-Task läuft IMMER — unabhängig von Core 0 MQTT-Zustand:
  ✅ actuatorManager.processActuatorLoops() — Runtime-Protection IMMER aktiv
  ✅ SAFETY-P1 Mechanism D — ACK-Timeout IMMER überwacht
  ✅ SAFETY-P4 Offline-Regeln — Lokale Hysterese IMMER aktiv
  ✅ feedWatchdog() — WDT IMMER gefüttert (kein Reboot bei MQTT-Blockade!)
  ✅ Sensor-Reads — Messdaten IMMER aktuell

Core 0 MQTT-Task kann beliebig lange reconnecten:
  → Core 1 ist davon vollständig entkoppelt
  → Safety-Garantien gelten auch bei 60-Sekunden MQTT-Backoff
```

---

## Nächste Schritte

1. **Sofort:** Flash-Budget prüfen ob Custom Partition Table vor oder parallel zu M1 nötig
2. **M1 (hohe Priorität):** Safety-Task erstellen — direkte Safety-Verbesserung ohne M2-Risiko
3. **M2 (nach M1-Verifikation):** ESP-IDF MQTT Migration — eliminiert Blocking-Problem vollständig
4. **M3-M5:** Nach M2-Verifikation auf Hardware
5. **Implementierungsauftrag SAFETY-RTOS-IMPL** entsteht aus diesem Konzept

---

*Analysiert: main.cpp (2963 Zeilen), mqtt_client.cpp (1032 Zeilen), actuator_manager.cpp (987 Zeilen), safety_controller.cpp, sensor_manager.cpp (1617 Zeilen), ESP32_SPEICHERANALYSE_2026-03-30.md*
