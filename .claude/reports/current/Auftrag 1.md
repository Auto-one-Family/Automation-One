SAFETY-RTOS-IMPL Phase M2: PubSubClient → ESP-IDF MQTT
Referenz: auftrag-SAFETY-RTOS-IMPL-dual-task-migration-2026-03-30.md, Abschnitt "Phase M2"
Abhaengigkeit: M1 (Safety-Task) MUSS abgeschlossen sein.

Kontext
PubSubClient ist eine Arduino-MQTT-Library die BLOCKIEREND arbeitet: mqtt_.connect()
haelt den gesamten Thread an bis TCP-Verbindung steht oder Timeout (15s, mit Fallback
bis 30s). In M1 wurde der Safety-Task auf Core 1 separiert, aber loop() wartet immer
noch bei MQTT-Reconnect.

ESP-IDF hat einen eingebauten MQTT-Client (esp_mqtt_client) der in einem EIGENEN
FreeRTOS-Task laeuft. Connect/Reconnect passiert im Hintergrund — kein Blocking.
Zusaetzlich hat ESP-IDF eine eingebaute Outbox die Messages bei Disconnect puffert.

Voraussetzung aus M1
Safety-Task laeuft auf Core 1 mit eigenem WDT
std::atomic<uint32_t> g_last_server_ack_ms existiert
std::atomic<bool> g_server_timeout_triggered existiert
std::atomic<bool> g_mqtt_connected existiert (deklariert in M1.5)
g_actuator_cmd_queue existiert
Existierende MQTT-Infrastruktur
mqtt_client.h/.cpp: Klasse MQTTClient in src/services/communication/
PubSubClient-Member: mqtt_ (PubSubClient)
reconnect(), handleDisconnection(), maintain()/loop(), offline_buffer_[25]
publish(), subscribe(), isConnected(), subscribeToAllTopics()
SafePublish-Logik (Registration-Gate)
11 MQTT-Subscriptions in subscribeToAllTopics() (main.cpp:148-169)
MQTT-Callback-Router: Grosses Lambda in main.cpp:882
ACHTUNG: Header-Namenskonflikt
Das lokale File heisst src/services/communication/mqtt_client.h.
Der ESP-IDF Header heisst ebenfalls mqtt_client.h intern.
RICHTIG: #include <esp_mqtt_client.h> (mit angle brackets UND anderem Dateinamen).
FALSCH: #include "mqtt_client.h" — das wuerde das lokale File einbinden.

Aufgabe
Analyse ZUERST
mqtt_client.h/.cpp komplett lesen — alle Public Methods dokumentieren
PubSubClient-spezifische Aufrufe zaehlen (wie viele Stellen)
Callback-Lambda in main.cpp:882 analysieren — Groesse, alle Topic-Branches
handleOfflineRulesConfig() in main.cpp:891 identifizieren — muss im neuen Router migriert werden (existierender P4-Code, KEIN neues Feature)
M2.1 — Feature-Flag
In platformio.ini [env:esp32_dev]:


build_flags =
    -DMQTT_USE_ESP_IDF=1
In mqtt_client.h:


#ifdef MQTT_USE_ESP_IDF
    #include <esp_mqtt_client.h>
#else
    #include <PubSubClient.h>
#endif
Beide Pfade muessen kompilieren. Fallback auf PubSubClient mit MQTT_USE_ESP_IDF=0.

M2.2 — ESP-IDF MQTT Konfiguration
In mqtt_client.cpp, die esp_mqtt_client_config_t aufbauen:

Broker URI: "mqtt://192.168.1.100:1883" (wie bisher, aus NVS/Config)
Keepalive: 60s
Clean Session: true (spaeter false fuer persistent session)
LWT: Topic "kaiser/{k}/esp/{e}/system/will", QoS 1, retain true Payload: {"status":"offline","esp_id":"..."} (wie bisheriges LWT)
Buffer: Empfang 4096 Bytes (Config-Push-Payloads koennen > 2KB sein), Sende 2048 Bytes
Client-ID: Aus bestehendem Code uebernehmen (ESP-Chip-ID basiert)
Task Stack: 6144 Bytes
Task Priority: 3 (niedriger als Safety-Task mit 5)
MQTT Task Core-Pinning auf Core 0 erzwingen, damit Safety-Task auf Core 1 nie
verdraengt wird. In platformio.ini:


build_flags = -DCONFIG_MQTT_TASK_CORE_SELECTION_ENABLED=1
              -DCONFIG_MQTT_TASK_CORE_SELECTION=0
M2.3 — Event-Handler
Statischer Event-Handler mqtt_event_handler() mit diesen Events:

MQTT_EVENT_CONNECTED:

g_mqtt_connected.store(true)
subscribeToAllTopics() aufrufen (P1 Mechanism A)
triggerReconnectSync() (P1 Mechanism E: publishAllActuatorStatus + Heartbeat)
g_last_server_ack_ms.store(millis()) + g_server_timeout_triggered.store(false) (P1 Mech D Reset)
MQTT_EVENT_DISCONNECTED:

g_mqtt_connected.store(false)
xTaskNotify(g_safety_task_handle, NOTIFY_MQTT_DISCONNECTED, eSetBits) (P1 Mechanism B: Safety-Task fuehrt setAllActuatorsToSafeState() aus)
KEIN manuelles reconnect() — ESP-IDF reconnected automatisch!
MQTT_EVENT_DATA:

KRITISCH: event->topic und event->data sind NICHT null-terminiert! Bestehender Code nutzt strcmp/strstr — erwarten '\0'. Ohne Terminierung: Buffer-Overread → Crash.
Topic in lokalen Buffer kopieren (192 Bytes, laengstes Topic ~120 Zeichen) + '\0'
Payload in lokalen Buffer kopieren (4096 Bytes, passend zu buffer.size) + '\0'
routeIncomingMessage(topic_buf, data_buf) aufrufen
MQTT_EVENT_ERROR:

Loggen mit error_handle->error_type
Fragmentierungs-Handling: Bei buffer.size=4096 sollten alle realistischen
AutomationOne-Payloads in einen Event passen. Falls event->current_data_offset > 0
(fragmentiert): ESP_LOGW loggen und Message verwerfen — nicht stillschweigend
abschneiden.

Registrierung:


esp_mqtt_client_register_event(mqtt_client_, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
esp_mqtt_client_start(mqtt_client_);  // NON-BLOCKING!
M2.4 — routeIncomingMessage() erstellen
Das bestehende grosse Lambda in main.cpp:882 in eine eigenstaendige Funktion umbauen:
void routeIncomingMessage(const char* topic, const char* payload)

Routing-Entscheidung pro Topic (Direkt auf Core 0 oder via Queue an Core 1):

Topic-Pattern	Routing
system/command	Queue → Core 1 (enthaelt safetyController)
config (sensor/actuator)	Queue → Core 1 (schreibt sensors_[], actuators_[])
config (offline_rules)	Queue → Core 1 (handleOfflineRulesConfig, P4)
actuator/+/command	Queue → Core 1 (controlActuatorBinary → GPIO)
sensor/+/command	Queue → Core 1 (sensorManager)
esp/{id}/emergency	xTaskNotify NOTIFY_EMERGENCY_STOP (< 1µs!)
broadcast/emergency	xTaskNotify NOTIFY_EMERGENCY_STOP
zone/assign	Direkt Core 0 (kein GPIO, kein Sensor)
subzone/assign	Queue → Core 1 (GPIOManager)
subzone/remove	Queue → Core 1 (GPIOManager)
subzone/safe	xTaskNotify (Safety-kritisch)
system/heartbeat/ack	Direkt Core 0 (atomic update, kein Shared State)
Emergency und Disconnect nutzen xTaskNotify (Latenz < 1µs) statt Queue.
Im Safety-Task: xTaskNotifyWait() mit Bit-Maske fuer NOTIFY_EMERGENCY_STOP
und NOTIFY_MQTT_DISCONNECTED.

M2.5 — Publish-Funktion anpassen
Alt: mqtt_.publish(topic, payload, retained)
Neu: esp_mqtt_client_publish(mqtt_client_, topic, payload, 0, qos, retain)

Return-Werte:

msg_id > 0: erfolgreich oder in Outbox
msg_id == 0: QoS 0 gesendet
msg_id == -1: Fehler
msg_id == -2: Outbox voll
ESP-IDF Outbox ersetzt den manuellen offline_buffer_[25]. Messages bei Disconnect
werden automatisch gepuffert und nach Reconnect zugestellt.

M2.6 — MQTTClient-Klasse anpassen
Entfaellt komplett:

mqtt_ (PubSubClient Member) → mqtt_client_ (esp_mqtt_client_handle_t)
reconnect() → ESP-IDF reconnected automatisch
handleDisconnection() → MQTT_EVENT_DISCONNECTED Handler
maintain()/loop() → ESP-IDF hat eigenen Task
offline_buffer_[25] → ESP-IDF Outbox
Bleibt (angepasst):

publish() → Wrapper um esp_mqtt_client_publish()
subscribe() → Wrapper um esp_mqtt_client_subscribe()
isConnected() → liest g_mqtt_connected (atomic)
subscribeToAllTopics() → bleibt, ruft subscribe() pro Topic
SafePublish-Logik → bleibt
Akzeptanzkriterien
 MQTT verbindet (MQTT_EVENT_CONNECTED im Log)
 Alle 11 Topics subscribed nach Connect
 Aktor-Command kommt an (GPIO schaltet)
 Heartbeat publiziert alle 30s
 Sensor-Daten publiziert
 LWT funktioniert (ESP resetten → Server empfaengt LWT)
 Reconnect nach kuenstlichem Disconnect: KEIN BLOCKING — Safety-Task laeuft weiter
 Feature-Flag: MQTT_USE_ESP_IDF=0 → Fallback auf PubSubClient kompiliert
 Outbox: Message bei Disconnect gesendet → nach Reconnect zugestellt
 handleOfflineRulesConfig() korrekt im neuen Router integriert
Was NICHT gemacht wird
Kein TLS/SSL (eigener Auftrag)
Kein MQTT 5.0 (MQTT 3.1.1 reicht)
Keine Aenderung der Topic-Struktur oder Payload-Formate
Kein Backend/Frontend-Code