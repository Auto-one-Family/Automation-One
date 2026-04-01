# Auftrag SAFETY-RTOS-IMPL: FreeRTOS Dual-Task Migration

**Ziel-Repo:** auto-one (El Trabajante Firmware)
**Typ:** Implementierung in 5 Phasen (M0-M5)
**Prioritaet:** HIGH
**Datum:** 2026-03-30
**Geschaetzter Aufwand:** ~20-28h (M0: 2-3h, M1: 3-4h, M2: 6-8h, M3: 3-4h, M4: 4-6h, M5: 1-2h)
**Abhaengigkeit:** SAFETY-P1 MUSS implementiert sein (ist es — alle 5 Mechanismen A-E aktiv)
**Grundlage:** SAFETY-RTOS Analysebericht (2026-03-30), SAFETY-MEM Speicheranalyse (2026-03-30)

---

## Auftragsziel

Migriere die ESP32-Firmware von einer **Single-Thread `loop()`-Architektur** zu einer **FreeRTOS Dual-Task-Architektur**: Kommunikation (WiFi + MQTT) auf Core 0, Safety/Sensor/Aktor-Logik auf Core 1. Die zwei Tasks laufen gleichzeitig auf den zwei CPU-Kernen des ESP32.

**Das Problem das geloest wird:** Die aktuelle `loop()` ist sequentiell. Wenn `mqtt_.connect()` blockiert (PubSubClient TCP-Timeout: bis zu 15 Sekunden, mit 8883→1883 Fallback bis zu 30 Sekunden), stehen ALLE Safety-Checks still — kein `processActuatorLoops()`, kein Server-ACK-Timeout-Check (P1 Mechanism D), kein Sensor-Read, kein Watchdog-Feed. Das ist ein fundamentales Problem das durch P1 (additive Safety-Features im selben Thread) nicht geloest wird.

**Die Garantie nach der Migration:** Der Safety-Task auf Core 1 laeuft IMMER — auch wenn MQTT gerade 30 Sekunden lang blockiert reconnected. Runtime Protection, ACK-Timeout, Offline-Regeln (P4) und Watchdog werden NIEMALS durch Netzwerk-Operationen unterbrochen.

**KEIN BREAKING CHANGE pro Phase.** Jede Phase ist einzeln testbar und per Git-Branch rueckrollbar. Feature-Flag `MQTT_USE_ESP_IDF` erlaubt Umschaltung zwischen PubSubClient und ESP-IDF MQTT.

---

## System-Kontext (komplett — kein externes Repo noetig)

### ESP32 Hardware

- ESP32 WROOM-32, 4MB Flash, 520KB SRAM (davon ~320KB nutzbar)
- 2 CPU-Kerne: Core 0 (PRO_CPU, WiFi-Stack co-located), Core 1 (APP_CPU)
- Arduino-ESP32 Framework (basiert auf ESP-IDF — ESP-IDF APIs direkt aufrufbar)

### Speicher-Budget (SAFETY-MEM Ergebnis 2026-03-30)

| Bereich | Aktuell | Nach Migration (geschaetzt) | Status |
|---------|---------|---------------------------|--------|
| Flash | 1.208.989 B (92.2%) | ~1.227.000 B (93.6%) | KRITISCH → Custom Partition Table |
| RAM (statisch) | 68.508 B (20.9%) | ~68.900 B (21.0%) | OK |
| Heap (nach WiFi+MQTT) | ~184.000 B frei (71%) | ~166.000 B frei (64%) | OK |
| NVS | ~4.008 B frei | Unveraendert | OK (RTOS braucht kein NVS) |

**Flash ist die Engstelle.** Migration braucht ~18KB zusaetzlich. Bei 92.2% aktuell bleiben nur ~83KB frei nach Migration. **Custom Partition Table (Phase M0) ist PFLICHT** — erhoeht Flash-Raum von 1.31MB auf 1.50MB.

### Aktuelle Firmware-Architektur (Single-Thread)

Alles laeuft in einer `loop()` Funktion auf Core 1 (Arduino Default). Vereinfachter Ablauf:

```
void loop() {
    feedWatchdog();                          // WDT (10s Intervall)
    wifiManager.loop();                      // WiFi-Status (1-5ms)
    mqttClient.loop();                       // MQTT → reconnect() BLOCKIERT BIS 15-30s!
    sensorManager.performAllMeasurements();  // I2C, OneWire, ADC (5-50ms)
    actuatorManager.processActuatorLoops();  // Runtime Protection, Duration Timer (<1ms)
    // SAFETY-P1 Mechanism D: Server-ACK-Timeout-Check
    healthMonitor.loop();                    // Diagnostik (<1ms)
    delay(10);                               // CPU-Scheduling
}
```

**11 MQTT-Subscriptions** (main.cpp:148-169, `subscribeToAllTopics()`):
1. `kaiser/{k}/esp/{e}/system/command`
2. `kaiser/{k}/esp/{e}/config`
3. `kaiser/broadcast/emergency`
4. `kaiser/{k}/esp/{e}/actuator/+/command`
5. `kaiser/{k}/esp/{e}/emergency`
6. `kaiser/{k}/esp/{e}/zone/assign`
7. `kaiser/{k}/esp/{e}/subzone/assign`
8. `kaiser/{k}/esp/{e}/subzone/remove`
9. `kaiser/{k}/esp/{e}/subzone/safe`
10. `kaiser/{k}/esp/{e}/sensor/+/command`
11. `kaiser/{k}/esp/{e}/system/heartbeat/ack`

**MQTT-Callback-Router** (main.cpp:**882**): Grosses Lambda (`mqttClient.setCallback(...)`) das eingehende Messages anhand des Topics routet an Handler-Funktionen.

### SAFETY-P1 Status (bereits implementiert)

| Mechanismus | Datei | Was es tut |
|-------------|-------|-----------|
| A: Re-Subscribe | mqtt_client.cpp + main.cpp | `subscribeToAllTopics()` nach jedem Reconnect |
| B: Disconnect→Safe State | mqtt_client.cpp | `handleDisconnection()` → `setAllActuatorsToSafeState()` |
| C: Config max_runtime_ms | actuator_manager.cpp + config_mapping.py | Server setzt `max_runtime_ms` per Config-Push |
| D: Server-ACK-Timeout | main.cpp:2608 | Prueft `g_last_server_ack_ms`, bei Timeout → Safe State |
| E: Reconnect State-Sync | main.cpp | `publishAllActuatorStatus()` + sofortiger Heartbeat nach Reconnect |

Diese Mechanismen bleiben alle erhalten. Sie werden nur in den Safety-Task (Core 1) verschoben.

---

## Ziel-Architektur

```
Core 0 (PRO_CPU)                         Core 1 (APP_CPU)
════════════════                         ════════════════
WiFi-Stack (ESP-IDF intern)              Safety-Task (FreeRTOS)
Communication-Task (FreeRTOS)            ─────────────────────
─────────────────────────────            sensorManager.performAllMeasurements()
esp_mqtt_client (eigener Task)           actuatorManager.processActuatorLoops()
  → MQTT Connect/Reconnect              SAFETY-P1 Mech. D (ACK-Timeout)
  → Message-Empfang (Events)            SAFETY-P4 Offline-Regeln (zukuenftig)
  → Message-Publish (Outbox)            controlActuatorBinary() → GPIO
WiFiManager (Portal, AP+STA)            safetyController.emergencyStop*()
Heartbeat senden (alle 30s)             feedWatchdog() — IMMER
Disconnect/Reconnect-Debounce           healthMonitor.loop()
timeManager.loop() (NTP)                processActuatorCommandQueue()
processOfflineBuffer()                  processSensorCommandQueue()

         ┌──── Shared State (Sync) ────┐
         │                              │
         │  atomic<bool> g_mqtt_connected
         │  atomic<uint32_t> g_last_server_ack_ms
         │  Mutex: g_actuator_mutex (actuators_[])
         │  Mutex: g_sensor_mutex (sensors_[])
         │  Mutex: g_i2c_mutex (Wire-Aufrufe)
         │  Queue: g_actuator_cmd_queue (Core 0→1)
         │  Queue: g_publish_queue (Core 1→0)
         │  Queue: g_config_update_queue (Core 0→1)
         │  xTaskNotify: Emergency-Stop (Core 0→1)
         │                              │
         └──────────────────────────────┘
```

---

## Phase M0: Custom Partition Table (VORAUSSETZUNG)

**Warum:** Flash ist bei 92.2%. Migration addiert ~18KB. Ohne groessere App-Partition faellt Flash auf ~6.4% frei — zu wenig fuer zukuenftige Features.

**Was:**

Erstelle `partitions_custom.csv` im Projekt-Root:

```csv
# Name,    Type,  SubType, Offset,   Size,     Flags
nvs,       data,  nvs,     0x9000,   0x8000,
otadata,   data,  ota,     0x11000,  0x2000,
app0,      app,   ota_0,   0x13000,  0x180000,
app1,      app,   ota_1,   0x193000, 0x180000,
spiffs,    data,  spiffs,  0x313000, 0xED000,
```

Aenderungen gegenueber Standard-Partition:
- `app0`/`app1`: 1.572.864 Bytes (1.5MB) statt 1.310.720 (1.25MB) — **+262KB pro App**
- `nvs`: 32KB statt 20KB — **+12KB** (Headroom fuer P4 Offline-Regeln)
- `spiffs`: Entsprechend reduziert

In `platformio.ini`:
```ini
[env:esp32_dev]
board_build.partitions = partitions_custom.csv
```

**Akzeptanz M0:**
- [ ] **Full-Flash durchgefuehrt** (Custom Partition Table erfordert Full-Flash, NVS wird geloescht)
- [ ] ESP_472204 neu provisioniert (WiFi-Credentials, Sensor/Aktor-Configs)
- [ ] Build mit neuer Partition Table erfolgreich
- [ ] Flash-Auslastung sinkt von 92.2% auf ~80% (gleicher Code, groessere Partition)
- [ ] NVS funktioniert weiterhin (bestehende Configs werden gelesen)
- [ ] OTA-Update weiterhin moeglich (app1 Partition vorhanden)

**ACHTUNG:** Custom Partition Table erfordert **Full-Flash** beim naechsten Upload (nicht nur App-Update). Bestehende NVS-Daten (WiFi-Credentials, Sensor/Aktor-Configs) gehen verloren und muessen neu provisioniert werden. Das ist bei einem Testgeraet akzeptabel — bei Produktionsgeraeten muss NVS vorher exportiert werden.

**Aufwand:** 2-3h (inkl. Test + Re-Provisioning)

---

## Phase M1: Safety-Task erstellen

**Ziel:** Core-1-Task der Sensoren, Aktoren, Safety-Checks und Watchdog ausfuehrt — unabhaengig von `loop()`.

### M1.1 Task-Funktion erstellen

Neue Datei `src/tasks/safety_task.h` + `src/tasks/safety_task.cpp`:

**Vorbedingung:** Das Verzeichnis `src/tasks/` existiert noch nicht und muss angelegt werden. `src/services/safety/` existiert bereits (offline_mode_manager.h/.cpp aus SAFETY-P4), aber Tasks sind architektonisch keine Services — `src/tasks/` fuer beide Tasks (safety_task, communication_task) ist die sauberere Trennung.

```cpp
// safety_task.h
#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

// Task-Handle (global, fuer xTaskNotify von aussen)
extern TaskHandle_t g_safety_task_handle;

// Task erstellen — aufrufen in setup() NACH Sensor/Aktor-Init
void createSafetyTask();

// Task-Funktion (laeuft auf Core 1, endlos)
void safetyTaskFunction(void* param);
```

```cpp
// safety_task.cpp — Pseudocode, exakte API im Code verifizieren
#include "safety_task.h"
#include <esp_task_wdt.h>

TaskHandle_t g_safety_task_handle = NULL;

static const uint32_t SAFETY_TASK_STACK_SIZE = 8192;  // 8KB Stack
static const UBaseType_t SAFETY_TASK_PRIORITY = 5;     // Hoeher als loop() (1)
static const BaseType_t SAFETY_TASK_CORE = 1;          // APP_CPU

void createSafetyTask() {
    xTaskCreatePinnedToCore(
        safetyTaskFunction,
        "SafetyTask",
        SAFETY_TASK_STACK_SIZE,
        NULL,
        SAFETY_TASK_PRIORITY,
        &g_safety_task_handle,
        SAFETY_TASK_CORE
    );
}

void safetyTaskFunction(void* param) {
    // Watchdog fuer diesen Task registrieren (NULL statt nullptr — Codebase-Konvention)
    esp_task_wdt_add(NULL);

    for (;;) {
        // 1. Watchdog IMMER fuettern — egal was
        esp_task_wdt_reset();

        // 2. Sensoren auslesen (I2C, OneWire, ADC)
        sensorManager.performAllMeasurements();

        // 3. Aktor-Timer pruefen (Runtime Protection, Duration)
        actuatorManager.processActuatorLoops();

        // 4. SAFETY-P1 Mechanism D: Server-ACK-Timeout
        checkServerAckTimeout();

        // 5. Aktor-Commands aus Queue verarbeiten (von Core 0)
        processActuatorCommandQueue();

        // 6. Sensor-Commands aus Queue verarbeiten (von Core 0)
        processSensorCommandQueue();

        // 7. Health-Monitor
        healthMonitor.loop();

        // 8. CPU abgeben (10ms Pause)
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
```

### M1.2 loop() anpassen

Die Funktionen die jetzt im Safety-Task laufen, muessen aus `loop()` ENTFERNT werden. Sonst werden sie doppelt ausgefuehrt (Race Condition auf Shared State).

**Aus `loop()` ENTFERNEN:**
- `sensorManager.performAllMeasurements()` (main.cpp:**2585**)
- `actuatorManager.processActuatorLoops()` (main.cpp:**2590**)
- SAFETY-P1 Mechanism D Block (main.cpp:**2608**ff)
- `healthMonitor.loop()` (main.cpp:**2626**)
- `feedWatchdog()` am Loop-Anfang (main.cpp:**~2400** in if-Block) — WDT laeuft jetzt im Safety-Task
- `g_last_server_ack_ms` / `g_server_timeout_triggered`: main.cpp:**90-91**

**In `loop()` BELASSEN:**
- `wifiManager.loop()` — WiFi braucht Core 0
- `mqttClient.loop()` — MQTT bleibt vorerst in loop() (wird in M2/M3 verschoben)
- Disconnect-Debounce Timer
- MQTT Persistent Failure Timer
- Actuator-Status-Publish (alle 30s) — muss ueber Queue an Core 0
- Heartbeat Publish

**In `setup()` HINZUFUEGEN:**
- `createSafetyTask()` — NACH Sensor/Aktor-Init, VOR MQTT-Connect
- **DIREKT DANACH:** `esp_task_wdt_delete(xTaskGetCurrentTaskHandle());` — den Arduino-loopTask vom WDT abmelden. Grund: `setup()` hat `esp_task_wdt_add(NULL)` (main.cpp:**475-476** / **494-495**, zwei WDT-Init-Pfade) was den loopTask registriert. Nach M1 fuettert NIEMAND mehr den loopTask-WDT (feedWatchdog() ist entfernt) → **WDT-Reset nach 10s** wenn nicht abgemeldet. Der Safety-Task hat seinen eigenen WDT.

### M1.3 checkServerAckTimeout() extrahieren

Der P1-Mechanism-D-Code aus `main.cpp:2608` in eine eigene Funktion extrahieren die vom Safety-Task aufgerufen wird. Die Funktion liest `g_last_server_ack_ms` (atomic) und ruft bei Timeout `actuatorManager.setAllActuatorsToSafeState()` auf.

### M1.4 Command-Queue fuer Aktor-Befehle

Wenn in M1 der Safety-Task `controlActuatorBinary()` auf Core 1 ausfuehrt, aber MQTT-Callbacks (die Aktor-Commands empfangen) noch in `loop()` auf Core 1 laufen, gibt es erstmal KEIN Cross-Core-Problem. Aber: Vorbereitung fuer M3/M4.

Einfache Queue-Implementierung:

```cpp
// In actuator_command_queue.h:
struct ActuatorCommand {
    char topic[128];       // MQTT-Topic (existierende handleActuatorCommand-Signatur)
    char payload[512];     // JSON-Payload
};

// Queue erstellen — in setup(), VOR createSafetyTask()!
// Safety-Task liest sofort aus der Queue. Wenn Queue nicht existiert → Crash.
QueueHandle_t g_actuator_cmd_queue = xQueueCreate(10, sizeof(ActuatorCommand));

// Core 0 (MQTT-Callback) sendet:
void queueActuatorCommand(const char* topic, const char* payload) {
    ActuatorCommand cmd;
    strncpy(cmd.topic, topic, sizeof(cmd.topic) - 1);
    cmd.topic[sizeof(cmd.topic) - 1] = '\0';
    strncpy(cmd.payload, payload, sizeof(cmd.payload) - 1);
    cmd.payload[sizeof(cmd.payload) - 1] = '\0';
    xQueueSend(g_actuator_cmd_queue, &cmd, 0);  // Non-blocking
}

// Core 1 (Safety-Task) empfaengt:
void processActuatorCommandQueue() {
    ActuatorCommand cmd;
    while (xQueueReceive(g_actuator_cmd_queue, &cmd, 0) == pdTRUE) {
        // Existierende Signatur direkt nutzen — kein neues Overload noetig
        actuatorManager.handleActuatorCommand(String(cmd.topic), String(cmd.payload));
    }
}
```

### M1.5 Shared State auf Atomic konvertieren (PFLICHT VOR M2)

Die folgenden globalen Variablen werden nach der Migration von **beiden Tasks** gelesen/geschrieben. Sie muessen von plain-Typen zu `std::atomic` konvertiert werden — sonst Race Conditions und undefiniertes Verhalten:

```cpp
// main.cpp — VORHER (plain Typen, main.cpp:90-91):
static unsigned long g_last_server_ack_ms = 0;
static bool g_server_timeout_triggered = false;

// NACHHER (atomic — thread-safe ohne Mutex):
#include <atomic>
static std::atomic<uint32_t> g_last_server_ack_ms{0};
static std::atomic<bool> g_server_timeout_triggered{false};
```

**Alle Lese-/Schreibstellen anpassen:**
- Lesen: `g_last_server_ack_ms` → `g_last_server_ack_ms.load()` (oder implizit)
- Schreiben: `g_last_server_ack_ms = millis()` → `g_last_server_ack_ms.store(millis())`
- Vergleich: `millis() - g_last_server_ack_ms` → `millis() - g_last_server_ack_ms.load()`

**Zusaetzlich deklarieren (neu, fuer M2):**
```cpp
// Global (z.B. in shared_state.h oder mqtt_client.h):
std::atomic<bool> g_mqtt_connected{false};
```
Aktuell liest `isConnected()` den PubSubClient-internen State. Nach M2 wird `g_mqtt_connected` vom ESP-IDF Event-Handler geschrieben und vom Safety-Task gelesen.

**ACHTUNG:** `std::atomic` funktioniert auf ESP32 (Xtensa LX6, 32-bit aligned). `std::atomic<uint32_t>` ist lock-free. `std::atomic<bool>` ebenfalls.

### setup() Reihenfolge nach M1 (ZWINGEND)

```
1. Bestehende Initialisierung (WiFi, NVS, GPIO, I2C, Sensor/Aktor Init)
2. Atomic-Variablen initialisieren (M1.5)
3. ALLE Queues erstellen (g_actuator_cmd_queue, spaeter g_publish_queue, g_config_update_queue)
4. createSafetyTask()                              // Safety-Task startet, liest sofort Queues
5. esp_task_wdt_delete(xTaskGetCurrentTaskHandle()) // loopTask vom WDT abmelden
6. createCommunicationTask()                        // erst ab M3
7. MQTT-Connect (bzw. esp_mqtt_client_start ab M2)
```

Queues MUESSEN vor Tasks erstellt werden — der Safety-Task liest sofort aus ihnen. Umgekehrte Reihenfolge = Crash auf NULL-Pointer.

**Akzeptanz M1:**
- [ ] Safety-Task startet und loggt `[SAFETY] Safety task running on core 1`
- [ ] WDT wird im Safety-Task gefuettert (kein Reboot bei MQTT-Blockade)
- [ ] Sensor-Reads erscheinen weiterhin in Logs
- [ ] `processActuatorLoops()` laeuft (Runtime Protection aktiv)
- [ ] P1 Mechanism D (ACK-Timeout) feuert korrekt
- [ ] Aktor-Commands ueber Queue funktionieren (ON/OFF testen)
- [ ] Kein Doppel-Aufruf von Sensor/Aktor-Funktionen (aus loop() entfernt)
- [ ] Stack Highwater Mark loggen: `uxTaskGetStackHighWaterMark(g_safety_task_handle)`

**Aufwand:** 3-4h

---

## Phase M2: PubSubClient → ESP-IDF MQTT

**Ziel:** PubSubClient durch `esp_mqtt_client` ersetzen. MQTT laeuft dann in einem eigenen FreeRTOS-Task (intern von ESP-IDF verwaltet) — kein blockierendes `mqtt_.connect()` mehr.

### M2.1 Feature-Flag

```ini
# platformio.ini:
[env:esp32_dev]
build_flags =
    -DMQTT_USE_ESP_IDF=1    ; 1 = ESP-IDF MQTT, 0 = PubSubClient (Fallback)
```

```cpp
// mqtt_client.h:
#ifdef MQTT_USE_ESP_IDF
    #include <esp_mqtt_client.h>  // ESP-IDF — ACHTUNG: NICHT "mqtt_client.h"!
                                  // Das lokale src/services/communication/mqtt_client.h
                                  // hat denselben Namen — Namenskonflikt! Korrekt: <esp_mqtt_client.h>
#else
    #include <PubSubClient.h>  // Arduino (Fallback)
#endif
```

### M2.2 ESP-IDF MQTT Konfiguration

```cpp
// In mqtt_client.cpp — Initialisierung:
esp_mqtt_client_config_t mqtt_config = {};

// Broker
mqtt_config.broker.address.uri = "mqtt://192.168.1.100:1883";
// Fuer TLS spaeter: "mqtts://..."

// Session
mqtt_config.session.keepalive = 60;                    // Sekunden (wie bisher)
mqtt_config.session.disable_clean_session = false;     // true = persistent session
// Spaeter auf true setzen fuer persistent session (eliminiert Re-Subscribe-Bedarf)

// LWT (Last Will and Testament)
mqtt_config.session.last_will.topic = "kaiser/{k}/esp/{e}/system/will";
mqtt_config.session.last_will.msg = "{\"status\":\"offline\",\"esp_id\":\"...\"}";
mqtt_config.session.last_will.qos = 1;
mqtt_config.session.last_will.retain = 1;

// Buffer — 4096 statt 2048: Config-Push-Payloads (Full-State mit vielen
// Sensoren/Aktoren) koennen > 2048 Bytes sein. Bei kleinerem Buffer
// fragmentiert ESP-IDF die MQTT_EVENT_DATA Events → Reassembly noetig.
// Mit 4096 passt jede realistische Config-Push-Message in einen Event.
mqtt_config.buffer.size = 4096;        // Empfangs-Buffer
mqtt_config.buffer.out_size = 2048;    // Sende-Buffer + Outbox (Sends sind kleiner)

// Credentials (falls MQTT-Auth aktiv)
mqtt_config.credentials.client_id = "ESP_EA5484";
// mqtt_config.credentials.username = "...";
// mqtt_config.credentials.authentication.password = "...";

// Task-Konfiguration
mqtt_config.task.stack_size = 6144;    // ESP-IDF MQTT-Task Stack
mqtt_config.task.priority = 3;         // Niedriger als Safety-Task (5)

// MQTT Task Core-Pinning: ESP-IDF MQTT-interner Task laeuft per Default mit
// tskNO_AFFINITY (kann auf JEDEM Core laufen). Damit der Safety-Task auf Core 1
// nie durch MQTT-internen Task verdraengt wird, Core-Pinning erzwingen.
// In sdkconfig.defaults (oder via menuconfig):
//   CONFIG_MQTT_TASK_CORE_SELECTION_ENABLED=y
//   CONFIG_MQTT_TASK_CORE_SELECTION=0
// Alternativ in platformio.ini:
//   build_flags = -DCONFIG_MQTT_TASK_CORE_SELECTION_ENABLED=1
//                 -DCONFIG_MQTT_TASK_CORE_SELECTION=0

// Client erstellen
esp_mqtt_client_handle_t mqtt_client_ = esp_mqtt_client_init(&mqtt_config);
```

### M2.3 Event-Handler

```cpp
// Event-Handler — laeuft im MQTT-Task (Core 0):
static void mqtt_event_handler(void* args, esp_event_base_t base,
                                int32_t event_id, void* event_data) {
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

    switch (event_id) {
        case MQTT_EVENT_CONNECTED:
            ESP_LOGI("MQTT", "Connected to broker");
            g_mqtt_connected.store(true);

            // Alle 11 Topics subscriben (wie P1 Mechanism A)
            subscribeToAllTopics();

            // P1 Mechanism E: Reconnect State-Sync
            // Via Queue an Core 1: "publishe alle Aktor-Status"
            // + Sofortiger Heartbeat
            triggerReconnectSync();

            // P1 Mechanism D Reset (M1.5: bereits atomic)
            g_last_server_ack_ms.store(millis());
            g_server_timeout_triggered.store(false);
            break;

        case MQTT_EVENT_DISCONNECTED:
            ESP_LOGW("MQTT", "Disconnected from broker");
            g_mqtt_connected.store(false);

            // P1 Mechanism B: Aktoren in Safe State
            // ACHTUNG: Das muss SOFORT passieren, nicht via Queue
            // Aber controlActuatorBinary() greift auf actuators_[] zu (Shared State)
            // Loesung: xTaskNotify an Safety-Task mit DISCONNECT_BIT
            xTaskNotify(g_safety_task_handle, NOTIFY_MQTT_DISCONNECTED, eSetBits);

            // Reconnect passiert AUTOMATISCH (esp_mqtt_client intern)
            // Kein manuelles reconnect() noetig!
            break;

        case MQTT_EVENT_DATA: {
            // KRITISCH: event->topic und event->data sind NICHT null-terminiert!
            // Bestehender Callback-Router (main.cpp:882) nutzt strcmp/strstr —
            // alle erwarten '\0'. Ohne Terminierung: Buffer-Overread → Crash.
            char topic_buf[192];  // max Topic-Laenge (laengstes: ~120 Zeichen) + Reserve
            size_t tlen = (event->topic_len < sizeof(topic_buf) - 1)
                          ? event->topic_len : sizeof(topic_buf) - 1;
            memcpy(topic_buf, event->topic, tlen);
            topic_buf[tlen] = '\0';

            char data_buf[4096];  // Muss zu buffer.size passen
            size_t dlen = (event->data_len < sizeof(data_buf) - 1)
                          ? event->data_len : sizeof(data_buf) - 1;
            memcpy(data_buf, event->data, dlen);
            data_buf[dlen] = '\0';

            routeIncomingMessage(topic_buf, data_buf);
            break;
        }

        case MQTT_EVENT_SUBSCRIBED:
            ESP_LOGI("MQTT", "Subscribed msg_id=%d", event->msg_id);
            break;

        case MQTT_EVENT_ERROR:
            ESP_LOGE("MQTT", "Error type=%d", event->error_handle->error_type);
            break;
    }
}

// Registrierung (in setup() oder init()):
esp_mqtt_client_register_event(mqtt_client_, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
esp_mqtt_client_start(mqtt_client_);  // NON-BLOCKING! Verbindet im Hintergrund.

// HINWEIS Fragmentierung: Bei Messages groesser als buffer.size sendet ESP-IDF
// mehrere MQTT_EVENT_DATA Events mit event->current_data_offset > 0 und
// event->total_data_len > event->data_len. Mit buffer.size=4096 sollte das fuer
// alle realistischen AutomationOne-Payloads ausreichen. Falls doch fragmentierte
// Events auftreten: ESP_LOGW und Message verwerfen (nicht stillschweigend abschneiden).
```

### M2.4 routeIncomingMessage() — Message-Router

Die bestehende grosse Lambda-Funktion in main.cpp:882 muss in eine eigenstaendige Funktion umgebaut werden die Topic + Payload als Parameter erhaelt.

**Kritische Entscheidung pro Callback: Direkt oder Queue?**

| Topic-Pattern | Handler | Direkt (Core 0) oder Queue (→Core 1)? |
|--------------|---------|---------------------------------------|
| `system/command` | handleSystemCommand() | **Queue** (enthalt safetyController Aufrufe) |
| `config` | handleSensorConfig() + handleActuatorConfig() | **Queue** (schreibt sensors_[], actuators_[]) |
| `config` (offline_rules) | handleOfflineRulesConfig() | **Queue** (schreibt Offline-Regel-State auf Core 1) — Migration aus main.cpp:891 |
| `actuator/+/command` | handleActuatorCommand() | **Queue** (controlActuatorBinary → GPIO) |
| `sensor/+/command` | handleSensorCommand() | **Queue** (sensorManager) |
| `esp/{id}/emergency` | emergencyStopAll() | **xTaskNotify** (LATENZ-KRITISCH!) |
| `broadcast/emergency` | emergencyStopAll() | **xTaskNotify** (LATENZ-KRITISCH!) |
| `zone/assign` | Zone-Konfiguration | **Direkt** (kein GPIO, kein Sensor) |
| `subzone/assign` | Subzone + GPIOManager | **Queue** (GPIOManager Mutex) |
| `subzone/remove` | Subzone + GPIO-Release | **Queue** (GPIOManager Mutex) |
| `subzone/safe` | isolateSubzone() | **xTaskNotify** (Safety-kritisch) |
| `system/heartbeat/ack` | ACK-Tracking | **Direkt** (atomic update, kein Shared State) |

**Emergency-Stop per xTaskNotify (Latenz < 1µs):**

```cpp
// Im Event-Handler (Core 0):
if (isEmergencyTopic(topic)) {
    xTaskNotify(g_safety_task_handle, NOTIFY_EMERGENCY_STOP, eSetBits);
}

// Im Safety-Task (Core 1):
uint32_t notifyValue = 0;
if (xTaskNotifyWait(0, UINT32_MAX, &notifyValue, 0) == pdTRUE) {
    if (notifyValue & NOTIFY_EMERGENCY_STOP) {
        safetyController.emergencyStopAll();
    }
    if (notifyValue & NOTIFY_MQTT_DISCONNECTED) {
        actuatorManager.setAllActuatorsToSafeState();
    }
}
```

### M2.5 Publish-Funktion anpassen

```cpp
// Alt (PubSubClient):
mqtt_.publish(topic, payload, retained);

// Neu (ESP-IDF):
int msg_id = esp_mqtt_client_publish(mqtt_client_, topic, payload, 0, qos, retain);
// msg_id > 0: erfolgreich (QoS 0) oder in Outbox (QoS 1/2)
// msg_id == 0: QoS 0 gesendet
// msg_id == -1: Fehler (nicht verbunden → Outbox wenn konfiguriert)
// msg_id == -2: Outbox voll
```

**Outbox-Feature:** ESP-IDF MQTT hat eine eingebaute Outbox. Messages die bei Disconnect gesendet werden, werden automatisch gepuffert und nach Reconnect zugestellt. Das ersetzt den manuellen `offline_buffer_[25]` in der aktuellen mqtt_client.cpp. Der bestehende Offline-Buffer kann nach M2 entfernt werden.

**Outbox-Groesse beachten:** Die Outbox-Kapazitaet wird durch `buffer.out_size` (2048) begrenzt. Der aktuelle `offline_buffer_[25]` puffert 25 Messages. Bei kurzem Disconnect (< 30s) mit vielen Sensor-Publishes koennte die Outbox volllaufen (msg_id == -2). Tuning-Parameter: `buffer.out_size` auf 4096 erhoehen wenn noetig, oder bewusst akzeptieren dass einige Sensor-Werte bei Disconnect verloren gehen (nicht safety-kritisch).

### M2.6 Bestehende mqtt_client.cpp anpassen

Die Klasse `MQTTClient` wird umgebaut:

**Entfaellt komplett:**
- `mqtt_` (PubSubClient Member) → ersetzt durch `mqtt_client_` (esp_mqtt_client_handle_t)
- `reconnect()` → ESP-IDF reconnected automatisch
- `handleDisconnection()` → ersetzt durch `MQTT_EVENT_DISCONNECTED` Handler
- `maintain()` / `loop()` → ESP-IDF hat eigenen Task, kein manueller Loop
- `offline_buffer_[25]` → ESP-IDF Outbox uebernimmt

**Bleibt (angepasst):**
- `publish()` → Wrapper um `esp_mqtt_client_publish()`
- `subscribe()` → Wrapper um `esp_mqtt_client_subscribe()`
- `isConnected()` → liest `g_mqtt_connected` (atomic)
- `subscribeToAllTopics()` → bleibt, ruft subscribe() pro Topic
- SafePublish-Logik (Registration-Gate) → bleibt

**Akzeptanz M2:**
- [ ] MQTT verbindet (MQTT_EVENT_CONNECTED Log)
- [ ] Alle 11 Topics subscribed nach Connect
- [ ] Aktor-Command kommt an (GPIO schaltet)
- [ ] Heartbeat publiziert alle 30s
- [ ] Sensor-Daten publiziert
- [ ] LWT funktioniert (ESP resetten → Server empfaengt LWT)
- [ ] Reconnect nach kuenstlichem Disconnect: KEIN BLOCKING — Safety-Task laeuft weiter
- [ ] Feature-Flag: `MQTT_USE_ESP_IDF=0` → Fallback auf PubSubClient kompiliert
- [ ] Outbox: Message bei Disconnect gesendet → nach Reconnect zugestellt

**Aufwand:** 6-8h (groesste Phase, hoechstes Risiko)

---

## Phase M3: Communication-Task auf Core 0

**Ziel:** WiFiManager und MQTT-Management-Code (Disconnect-Timer, Portal-Steuerung) aus `loop()` in einen eigenen Core-0-Task verschieben.

### M3.1 Communication-Task erstellen

Neue Datei `src/tasks/communication_task.h` + `src/tasks/communication_task.cpp`:

```cpp
void communicationTaskFunction(void* param) {
    for (;;) {
        // WiFi-Management
        wifiManager.loop();

        // Disconnect-Debounce (30s Timer → Portal oeffnen)
        handleWifiDisconnectDebounce();

        // MQTT Persistent Failure (5min Timer)
        handleMqttPersistentFailure();

        // Publish-Queue abarbeiten (Sensor-Daten, Aktor-Status von Core 1)
        processPublishQueue();

        // Heartbeat senden (alle 30s)
        handleHeartbeatPublish();

        // Actuator-Status Publish (alle 30s)
        handleActuatorStatusPublish();

        // NTP
        timeManager.loop();

        vTaskDelay(pdMS_TO_TICKS(50));  // 50ms reicht fuer Comm-Management
    }
}

// In setup():
xTaskCreatePinnedToCore(communicationTaskFunction, "CommTask",
                         6144, NULL, 3, NULL, 0);  // Core 0, Prioritaet 3
```

### M3.2 Publish-Queue (Core 1 → Core 0)

Der Safety-Task (Core 1) erzeugt Daten die publiziert werden muessen (Sensor-Werte, Aktor-Status). Diese gehen ueber eine Queue an den Communication-Task (Core 0):

```cpp
struct PublishRequest {
    char topic[128];
    char payload[1024];   // 1024 statt 512: Heartbeat-Payloads mit Diagnostik-Daten
                          // und Aktor-Status-Publishes koennen > 512 Bytes sein
    uint8_t qos;
    bool retain;
};

// Queue-Tiefe 15 statt 20: PublishRequest ist jetzt ~1156 Bytes,
// 15 * 1156 = ~17KB Heap. Mehr als genug fuer Burst-Publishes.
QueueHandle_t g_publish_queue = xQueueCreate(15, sizeof(PublishRequest));

// Core 1 (Safety-Task) sendet:
void queueSensorPublish(const char* topic, const char* payload) {
    PublishRequest req;
    strncpy(req.topic, topic, sizeof(req.topic));
    strncpy(req.payload, payload, sizeof(req.payload));
    req.qos = 1;
    req.retain = false;
    xQueueSend(g_publish_queue, &req, 0);  // Non-blocking, Drop wenn voll
}

// Core 0 (Comm-Task) empfaengt und publiziert:
void processPublishQueue() {
    PublishRequest req;
    while (xQueueReceive(g_publish_queue, &req, 0) == pdTRUE) {
        esp_mqtt_client_publish(mqtt_client_, req.topic, req.payload, 0, req.qos, req.retain);
    }
}
```

### M3.3 loop() wird minimal

Nach M3 enthaelt `loop()` nur noch:

```cpp
void loop() {
    // Fast nichts mehr — alles in Tasks
    // Nur noch Arduino-Framework-Pflege:
    vTaskDelay(pdMS_TO_TICKS(1000));  // loop() darf nicht leer sein (Arduino-Requirement)
}
```

**Oder:** `loop()` komplett durch `loopTask` ersetzen (Arduino-ESP32 intern). Aber das ist M5 Cleanup.

**Akzeptanz M3:**
- [ ] Communication-Task startet auf Core 0
- [ ] WiFi-Portal funktioniert weiterhin (nach 30s Disconnect)
- [ ] Sensor-Daten werden ueber Publish-Queue publiziert
- [ ] Aktor-Status wird ueber Publish-Queue publiziert
- [ ] Heartbeat erscheint alle 30s
- [ ] loop() ist minimal (nur delay)

**Aufwand:** 3-4h

---

## Phase M4: Mutexes + Thread-Safety

**Ziel:** Alle Shared-State-Zugriffe absichern. Erst NACH M1-M3, weil erst dann tatsaechlich Cross-Core-Zugriffe stattfinden.

### M4.1 Mutex-Initialisierung

```cpp
// In setup() — VOR Task-Erstellung:
SemaphoreHandle_t g_actuator_mutex      = xSemaphoreCreateMutex();
SemaphoreHandle_t g_sensor_mutex        = xSemaphoreCreateMutex();
SemaphoreHandle_t g_i2c_mutex           = xSemaphoreCreateMutex();
SemaphoreHandle_t g_gpio_registry_mutex = xSemaphoreCreateMutex();
```

### M4.2 I2C/Wire Mutex (KRITISCH)

Die Arduino `Wire`-Bibliothek ist NICHT thread-safe. Gleichzeitiger I2C-Zugriff von Core 0 (Config-Push mit Sensor-Init) und Core 1 (Sensor-Read) fuehrt zu Bus-Kollision.

**In `i2c_bus.cpp` (oder wo Wire-Aufrufe stattfinden) ALLE Wire-Calls mit Mutex wrappen:**

```cpp
bool I2CBus::readRegister(uint8_t addr, uint8_t reg, uint8_t* buf, size_t len) {
    // 250ms Timeout: SHT31-Messung ~15ms, aber Config-Push mit Sensor-Init
    // kann sich mit laufendem Sensor-Read-Zyklus ueberlappen. 100ms war zu knapp.
    if (xSemaphoreTake(g_i2c_mutex, pdMS_TO_TICKS(250)) != pdTRUE) {
        ESP_LOGW("I2C", "Mutex timeout — skipping read");
        return false;
    }
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.endTransmission(false);
    size_t received = Wire.requestFrom(addr, len);
    for (size_t i = 0; i < received && i < len; i++) {
        buf[i] = Wire.read();
    }
    xSemaphoreGive(g_i2c_mutex);
    return received == len;
}
```

### M4.3 OneWire Mutex

OneWire-Protokoll ist zeitkritisch (Pulse-Timing). Interruption durch anderen Task fuehrt zu CRC-Failures.

**Loesung:** Da OneWire-Sensor-Reads NUR im Safety-Task (Core 1) stattfinden und OneWire-Scans nur per MQTT-Command kommen (ueber Queue ebenfalls auf Core 1), braucht OneWire keinen Mutex — alle Zugriffe sind bereits auf Core 1 serialisiert.

**PRUEFEN im Code:** Gibt es OneWire-Zugriffe ausserhalb von `sensorManager`? Falls ja: Mutex noetig.

### M4.4 Actuator-Mutex

```cpp
// In actuator_manager.cpp — bei JEDEM Zugriff auf actuators_[]:

void ActuatorManager::processActuatorLoops() {
    xSemaphoreTake(g_actuator_mutex, portMAX_DELAY);
    // ... bestehender Code ...
    xSemaphoreGive(g_actuator_mutex);
}

void ActuatorManager::handleActuatorCommand(const String& topic, const String& payload) {
    xSemaphoreTake(g_actuator_mutex, portMAX_DELAY);
    // ... bestehender Code ...
    xSemaphoreGive(g_actuator_mutex);
}

void ActuatorManager::setAllActuatorsToSafeState() {
    xSemaphoreTake(g_actuator_mutex, portMAX_DELAY);
    // ... bestehender Code ...
    xSemaphoreGive(g_actuator_mutex);
}
```

### M4.5 Sensor-Mutex

Analog zum Actuator-Mutex: `g_sensor_mutex` um alle `sensors_[]` Zugriffe in `sensor_manager.cpp`. Besonders kritisch: `configureSensor()` (kommt via Config-Push von Core 0) vs. `performAllMeasurements()` (Core 1).

### M4.6 Config-Update-Queue (Core 0 → Core 1)

Config-Push kommt via MQTT (Core 0). Statt direkt `configureSensor()` / `configureActuator()` aufzurufen (Race Condition), wird ein Config-Update in die Queue gelegt:

```cpp
struct ConfigUpdateRequest {
    enum Type { SENSOR_CONFIG, ACTUATOR_CONFIG, SYSTEM_CONFIG } type;
    char json_payload[2048];  // 2048: Config-Push Full-State JSON kann bei vielen
                              // Sensoren/Aktoren > 1024 Bytes sein. Muss zu
                              // MQTT buffer.size (4096) passen — Payload ist ein
                              // Segment des MQTT-Payloads, nicht das gesamte.
};

// Queue-Tiefe 5 reicht: Config-Pushes kommen selten (nach Boot, nach CRUD).
// 5 * ~2052 = ~10KB Heap.
QueueHandle_t g_config_update_queue = xQueueCreate(5, sizeof(ConfigUpdateRequest));

// Core 0 (MQTT Event) sendet:
ConfigUpdateRequest req = {ConfigUpdateRequest::SENSOR_CONFIG, "..."};
xQueueSend(g_config_update_queue, &req, pdMS_TO_TICKS(100));

// Core 1 (Safety-Task) verarbeitet:
void processConfigUpdateQueue() {
    ConfigUpdateRequest req;
    while (xQueueReceive(g_config_update_queue, &req, 0) == pdTRUE) {
        switch (req.type) {
            case ConfigUpdateRequest::SENSOR_CONFIG:
                sensorManager.configureSensor(req.json_payload);
                break;
            case ConfigUpdateRequest::ACTUATOR_CONFIG:
                actuatorManager.configureActuator(req.json_payload);
                break;
            // ...
        }
    }
}
```

**Akzeptanz M4:**
- [ ] Kein I2C-Bus-Lockup bei gleichzeitigem Config-Push und Sensor-Read
- [ ] Kein Crash bei gleichzeitigem Aktor-Command und processActuatorLoops()
- [ ] Emergency-Stop funktioniert innerhalb < 10ms (xTaskNotify, nicht Queue)
- [ ] Config-Push wird korrekt an Core 1 weitergeleitet und angewendet
- [ ] Stack Highwater Mark beider Tasks loggen — kein Overflow
- [ ] Heap-Monitoring: `ESP.getFreeHeap()` alle 60s loggen — kein Memory-Leak

**Aufwand:** 4-6h

---

## Phase M5: Cleanup

**Ziel:** Dead Code entfernen, Code-Hygiene, finale Optimierungen.

### M5.1 PubSubClient entfernen (wenn M2 stabil)

- `#ifdef MQTT_USE_ESP_IDF` Bloecke: PubSubClient-Pfade entfernen
- `PubSubClient.h` Include entfernen
- Library-Dependency entfernen (platformio.ini)
- `MQTTClient::offline_buffer_[]` entfernen (ESP-IDF Outbox uebernimmt)

### M5.2 loop() minimieren oder entfernen

```cpp
void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));  // Minimal — Arduino braucht loop()
}
```

### M5.3 Logging-Konsistenz

Alle neuen Task-bezogenen Logs mit konsistenten TAGs:
- `[SAFETY]` — Safety-Task Events (Core 1)
- `[COMM]` — Communication-Task Events (Core 0)
- `[MQTT]` — ESP-IDF MQTT Events
- `[SYNC]` — Queue/Mutex Events (Cross-Task)

### M5.4 Stack-Monitoring dauerhaft

```cpp
// Im Safety-Task alle 60s:
UBaseType_t hwm = uxTaskGetStackHighWaterMark(nullptr);
ESP_LOGI("SAFETY", "Stack highwater: %u bytes free", hwm * 4);  // Xtensa: 4 bytes/word

// Im Heartbeat (alle 30s):
ESP_LOGI("MEM", "Free heap: %u, min: %u", ESP.getFreeHeap(), ESP.getMinFreeHeap());
```

**Akzeptanz M5:**
- [ ] Keine PubSubClient-Referenzen mehr im Code (wenn Feature-Flag entfernt)
- [ ] Kompiliert ohne Warnings (`-Wall -Wextra`)
- [ ] Flash-Groesse nach Cleanup gemessen und dokumentiert
- [ ] Stack-Monitoring aktiv in beiden Tasks
- [ ] Heap-Monitoring im Heartbeat

**Aufwand:** 1-2h

---

## Analyse-Teil (MUSS in jeder Phase VOR der Implementierung stattfinden)

### Pro Phase: Code-Stellen verifizieren

**M0:**
- [ ] Aktuelle `partitions.csv` lesen (oder Default-Partition pruefen)
- [ ] `platformio.ini` Board-Konfiguration pruefen

**M1:**
- [ ] `main.cpp` → `loop()` komplett lesen (alle Aufrufe mit Zeilennummern)
- [ ] Alle Stellen identifizieren die aus loop() entfernt werden
- [ ] `setup()` lesen — wo passt `createSafetyTask()` hin (nach Sensor/Aktor-Init)
- [ ] Pruefen ob `esp_task_wdt_add()` in Arduino-ESP32 verfuegbar ist

**M2:**
- [ ] `mqtt_client.h/.cpp` komplett lesen — alle Public Methods dokumentieren
- [ ] ESP-IDF MQTT Header pruefen: `#include <esp_mqtt_client.h>` (NICHT `"mqtt_client.h"` — Namenskonflikt mit lokalem Header!)
- [ ] PubSubClient-spezifische Aufrufe zaehlen (wie viele Stellen muessen geaendert werden?)
- [ ] Bestehende Callback-Lambda in main.cpp:882 analysieren — Groesse, Komplexitaet

**M3:**
- [ ] Alle verbleibenden `loop()`-Aufrufe nach M1 dokumentieren
- [ ] Sensor-Publish und Status-Publish Code identifizieren (wird in Publish-Queue verschoben)
- [ ] Timer-Code (Disconnect-Debounce, Persistent-Failure) identifizieren

**M4:**
- [ ] ALLE globalen/statischen Variablen die von beiden Tasks gelesen/geschrieben werden auflisten
- [ ] `i2c_bus.cpp` (oder aehnlich) lesen — alle Wire-Aufrufe identifizieren
- [ ] `sensor_manager.cpp` → `configureSensor()` lesen — wird von Config-Push aufgerufen (Core 0)
- [ ] `actuator_manager.cpp` → alle Public Methods pruefen: welche werden von Core 0 aufgerufen?
- [ ] Pruefen ob `DynamicJsonDocument` in beiden Tasks instanziiert wird (muss jeweils lokal sein)

---

## Gesamt-Akzeptanzkriterien (nach M0-M5)

### Funktional
- [ ] Alle bestehenden Features funktionieren: Sensor-Reads, Aktor-Commands, Config-Push, Heartbeat, LWT, Emergency-Stop, Zone/Subzone-Assignment, Discovery
- [ ] SAFETY-P1 Mechanismen A-E funktionieren weiterhin
- [ ] WiFi-Portal funktioniert (nach 30s Disconnect)
- [ ] OTA-Update funktioniert

### Safety-Garantie
- [ ] **KERN-TEST:** MQTT-Broker abschalten → Safety-Task laeuft weiter (Sensor-Reads + processActuatorLoops in Serial-Logs sichtbar)
- [ ] **KERN-TEST:** Waehrend MQTT reconnected (15s+): Manuell Runtime-Protection-Timeout triggern → Emergency-Stop feuert
- [ ] **KERN-TEST:** Server-ACK-Timeout (P1 Mech. D) feuert waehrend MQTT offline
- [ ] WDT-Reset passiert NICHT bei MQTT-Blockade (war vorher moeglich)
- [ ] Emergency-Stop Latenz < 10ms (xTaskNotify, nicht Queue)

### Performance
- [ ] Safety-Task Loop-Dauer < 100ms (typisch ~20ms)
- [ ] Communication-Task Loop-Dauer < 200ms (typisch ~60ms)
- [ ] Heap bleibt stabil ueber 24h (kein Memory-Leak)
- [ ] Stack Highwater beider Tasks > 1KB (kein Overflow-Risiko)

### Speicher
- [ ] Flash < 90% (mit Custom Partition Table)
- [ ] RAM (statisch) < 25%
- [ ] Heap > 150KB frei im Normalbetrieb

---

## Einschraenkungen — Was NICHT gemacht wird

- Kein TLS/SSL fuer MQTT (eigener Auftrag, ANALYSE-1 MQTT-Auth)
- Kein MQTT 5.0 Features (Session Expiry, Shared Subscriptions) — MQTT 3.1.1 reicht
- Keine Aenderung der MQTT-Topic-Struktur
- Keine Aenderung der Message-Payload-Formate
- Kein Backend-Code (Server bleibt unveraendert)
- Kein Frontend-Code
- Keine neuen Safety-Features (P4 Offline-Regeln sind separater Auftrag)
  **ACHTUNG P4-Migration:** `offline_mode_manager.h/.cpp` existiert bereits in `src/services/safety/`. `handleOfflineRulesConfig()` wird bereits im MQTT-Callback aufgerufen (main.cpp:891). Diese Logik muss bei M2 in den neuen Message-Router (`routeIncomingMessage`) uebernommen werden — kein neues Feature, nur korrekte Migration des bestehenden Codes.
- Kein WiFiManager-Ersatz (bleibt Arduino WiFiManager)

## Rueckfall-Strategie

| Phase | Rueckfall-Trigger | Rueckfall-Aktion |
|-------|------------------|------------------|
| M0 | NVS-Probleme nach Partition-Aenderung | Standard-Partition wiederherstellen, Re-Flash |
| M1 | Safety-Task crash / WDT-Timeout | `git revert` — loop() wieder vollstaendig |
| M2 | MQTT verbindet nicht / Callbacks fehlen | `MQTT_USE_ESP_IDF=0` → PubSubClient Fallback |
| M3 | CommTask deadlock / WiFi-Portal kaputt | CommTask-Code in loop() zurueckverschieben |
| M4 | Mutex-Deadlock / Queue-Overflow | Mutexes temporaer entfernen + Bug fixen |
| M5 | Cleanup-Fehler | `git revert` letzten Commit |

**Git-Strategie:** Jede Phase in eigenem Feature-Branch. PRs erst nach Verifikation. Kein Phase-Stacking ohne gruene Tests.

## Empfohlener Agent

**`esp32-dev`** — komplett. Kein Backend/Frontend betroffen.

**Build-Verifikation:** `pio run -e esp32_dev` — NICHT `pio run -e seeed`. Seeed XIAO ESP32C3 ist single-core (RISC-V), `xTaskCreatePinnedToCore()` mit Core 0/1 Pinning ist dort nicht moeglich. Dieser Plan betrifft ausschliesslich `esp32_dev` (ESP32 WROOM dual-core, Xtensa LX6).

**Hardware-Test-Target:** Alle Akzeptanztests (M0-M5) auf **realem ESP32** (ESP_472204 "Zelt Agent", ESP32 WROOM-32) per `pio run -e esp32_dev -t upload`. **Wokwi ist NICHT geeignet** — Wokwi-Simulation unterstuetzt kein echtes Dual-Core-Scheduling und keine realistischen MQTT-Reconnect-Szenarien. Insbesondere die KERN-TESTs (MQTT-Broker abschalten, Reconnect-Timing) sind nur auf echter Hardware aussagekraeftig.
